/**
 * The drums of an app rhythm, as the app sets them (applyUserStyle, setDrumKit, setDrumSound):
 *   - its own kit plays the sounds the rhythm names, the default kit on the rest;
 *   - any other kit plays that kit's pieces, while the hand percussion keeps the rhythm's;
 *   - the song's sound for a percussion row wins over the rhythm's, whichever the kit;
 *   - a section's own kit wins over the song's.
 *
 *   npm run test:groove
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { songToEngine } from '../../src/lib/appEngine/fromSong';
import { appStylePattern, categoryGenre, type AppStyle } from '../../src/lib/appStyles';
import { createChord } from '../../src/lib/musicTheory';
import { type Section } from '../../src/lib/sections';
import { RHYTHM_KIT, getDefaultInstrumentStates, getSoundType, migrateSoundId, type InstrumentState } from '../../src/lib/instruments';
import { appStyleInstruments } from '../../src/lib/appStyleSong';
import { GM_PERC_FIRST, KIT_ROWS, PERC_ROWS } from '../../src/lib/appEngine/commands';
import { type DrumKit } from '../../src/lib/appEngine/host';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const kits: DrumKit[] = JSON.parse(fs.readFileSync(path.join(root, 'public/engine/kit.json'), 'utf8')).kits;
const styles: AppStyle[] = JSON.parse(fs.readFileSync(path.join(root, 'public/rhythms/app-styles.json'), 'utf8')).styles
  .map((s: AppStyle & { category: string }) => ({ ...s, genre: categoryGenre(s.category) }));

let failed = 0;
let checks = 0;
const check = (name: string, ok: boolean, detail = '') => { checks++; if (!ok) { failed++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ''}`); } };

// A rhythm that names its own kick and a percussion row.
const style = styles.find((s) => s.drumSounds.kick !== undefined && PERC_ROWS.some((r) => s.drumSounds[r] !== undefined));
if (!style) throw new Error('no app style names both a kit piece and a percussion sound');
const perc = PERC_ROWS.find((r) => style.drumSounds[r] !== undefined)!;

const section = (extra: Partial<Section> = {}): Section => ({
  id: 's1', name: 'Verse', repeatCount: 1, chords: [createChord('C', '', 'maj', 4)], ...extra,
});
const withDrums = (id: string): InstrumentState[] =>
  getDefaultInstrumentStates().map((i) => (i.id === 'drums' ? { ...i, soundTypeId: id } : i));
const sounds = (instruments: InstrumentState[], s: Section = section(), drumSounds?: Record<string, number>) => {
  const out: Record<string, number> = {};
  const c = songToEngine({ sections: [s], bpm: 100, instrumentSettings: instruments, drumSounds }, appStylePattern(style), () => undefined, kits).commands;
  for (const x of c) if (x[0] === 'setDrumSound' && x[1] === 0 && (x[4] ?? 0) === 0) out[x[2] as string] = x[3] as number;
  return out;
};

// Applying the rhythm puts its own kit on the drums.
check('applying an app rhythm picks its own kit', appStyleInstruments(getDefaultInstrumentStates(), style).find((i) => i.id === 'drums')?.soundTypeId === RHYTHM_KIT);
check('its own kit survives a save and a load', migrateSoundId('drums', RHYTHM_KIT) === RHYTHM_KIT);

// Its own kit: its sounds, the default kit under them.
const own = sounds(withDrums(RHYTHM_KIT));
check('own kit: the rhythm\'s kick', own.kick === style.drumSounds.kick);
check('own kit: the rhythm\'s percussion', own[perc] === style.drumSounds[perc]);
const unnamed = KIT_ROWS.find((r) => style.drumSounds[r] === undefined);
if (unnamed) check('own kit: the default kit where it names nothing', own[unnamed] === kits[2].rows[unnamed]);

// Another kit: that kit's pieces, the rhythm's percussion.
const other = getSoundType('drums', 'ap1')!;
const picked = sounds(withDrums('ap1'));
check('another kit: its kick', picked.kick === kits[other.kit!].rows.kick, `${picked.kick} vs ${kits[other.kit!].rows.kick}`);
check('another kit: every piece its own', KIT_ROWS.every((r) => kits[other.kit!].rows[r] === undefined || picked[r] === kits[other.kit!].rows[r]));
check('another kit: the percussion still the rhythm\'s', picked[perc] === style.drumSounds[perc]);

// The song's percussion sound wins, under either kit.
const conga = GM_PERC_FIRST + 63;
check('song percussion sound, own kit', sounds(withDrums(RHYTHM_KIT), section(), { [perc]: conga })[perc] === conga);
check('song percussion sound, another kit', sounds(withDrums('ap1'), section(), { [perc]: conga })[perc] === conga);

// A section's own kit wins over the song's.
check('section kit over the song\'s', sounds(withDrums(RHYTHM_KIT), section({ sounds: { drums: 'ap1' } })).kick === kits[other.kit!].rows.kick);
check('section back to the rhythm\'s kit', sounds(withDrums('ap1'), section({ sounds: { drums: RHYTHM_KIT } })).kick === style.drumSounds.kick);

// Each part of the rhythm its own sound: B's piano in bank 1, A's in bank 0; with none of
// its own, B follows A (-1).
{
  const programs = (sct: Section) => songToEngine({ sections: [sct], bpm: 100, instrumentSettings: withDrums(RHYTHM_KIT) }, appStylePattern(style), () => undefined, kits)
    .commands.filter((x) => x[0] === 'setProgram' && x[1] === 0 && x[2] === 'piano').map((x) => [x[4] ?? 0, x[3]] as [number, number]);
  const rhodes = getSoundType('piano', 'rhodes')!.program;
  const own = programs(section({ partSounds: { b: { piano: 'rhodes' } } }));
  check('B plays its own piano', own.some(([bank, p]) => bank === 1 && p === rhodes));
  check('A keeps its piano', own.some(([bank, p]) => bank === 0 && p !== rhodes));
  const none = programs(section());
  check('B without its own follows A', none.some(([bank, p]) => bank === 1 && p === -1));
  const kitB = songToEngine({ sections: [section({ partSounds: { b: { drums: 'ap1' } } })], bpm: 100, instrumentSettings: withDrums(RHYTHM_KIT) }, appStylePattern(style), () => undefined, kits)
    .commands.find((x) => x[0] === 'setDrumSound' && x[1] === 0 && x[2] === 'kick' && x[4] === 1);
  check('B plays its own kit', kitB?.[3] === kits[other.kit!].rows.kick);
}

console.log(`${checks - failed}/${checks} sound checks passed (${style.id}, ${perc})`);
if (failed) process.exit(1);
