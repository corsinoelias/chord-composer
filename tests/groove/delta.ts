/**
 * What the player sends the engine when the song changes while it plays (stepDelta,
 * player.ts): a change it can make on the fly goes alone, and nothing ringing is cut.
 *
 *   - a range dragged, a note length, a sound picked: only those settings, no track cleared;
 *   - a cell written: only that step;
 *   - anything else — another section, another chord — sends the song again (null).
 *
 * Resending the whole song for a range cleared every track at each semitone the bar crossed,
 * and the sound cut out while it was dragged.
 *
 *   npm run test:groove
 */
import { songToEngine, type SongInput } from '../../src/lib/appEngine/fromSong';
import { stepDelta } from '../../src/lib/appEngine/player';
import { appStylePattern } from '../../src/lib/appStyles';
import { createChord } from '../../src/lib/musicTheory';
import { type Section } from '../../src/lib/sections';
import { getDefaultInstrumentStates } from '../../src/lib/instruments';
import { kits, lookup, own } from './engineRender';

let failed = 0;
let checks = 0;
const check = (name: string, ok: boolean, detail = '') => { checks++; if (!ok) { failed++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ''}`); } };

const style = appStylePattern(own.find((s) => s.id === 'app-salsa')!);
const section = (extra: Partial<Section> = {}): Section => ({ id: 's1', name: 'Verse', repeatCount: 1, chords: [createChord('C', '', 'maj', 4), createChord('A', '', 'min', 4)], ...extra });
const commands = (song: Partial<SongInput> = {}, sections = [section()]) =>
  songToEngine({ sections, bpm: 120, instrumentSettings: getDefaultInstrumentStates(), ...song }, style, lookup, kits).commands;
const base = commands();
const names = (d: ReturnType<typeof stepDelta>) => (d ?? []).map((c) => c[0]);

{
  const d = stepDelta(base, commands({ voicings: { piano: 72 } }));
  check('a range dragged goes on its own', !!d && d.length === 1 && d[0][0] === 'voicing' && (d[0] as unknown[])[3] === 72, JSON.stringify(d));
}
{
  const d = stepDelta(base, commands({ noteLengths: { bass: 0.5 } }));
  check('a note length goes on its own', !!d && names(d).every((n) => n === 'setNoteLength'), JSON.stringify(names(d)));
}
{
  const d = stepDelta(base, commands({}, [section({ partSounds: { a: { piano: 'rhodes' } } })]));
  check('a sound picked goes on its own', !!d && d.length > 0 && names(d).every((n) => n === 'setProgram' || n === 'setTimbre'), JSON.stringify(names(d)));
}
{
  const d = stepDelta(base, commands({}, [section({ partSounds: { a: { drums: 'ap1' } } })]));
  check('a kit picked goes on its own', !!d && d.length > 0 && names(d).every((n) => n === 'setDrumSound'), JSON.stringify(names(d)));
}
for (const [name, d] of [
  ['range', stepDelta(base, commands({ voicings: { piano: 72 } }))],
  ['kit', stepDelta(base, commands({}, [section({ partSounds: { a: { drums: 'ap1' } } })]))],
] as const) check(`no track cleared for a ${name}`, !names(d).includes('clearTrack'));
check('the same song sends nothing', (stepDelta(base, commands()) ?? ['x']).length === 0);
check('another section sends the song again', stepDelta(base, commands({}, [section(), section({ id: 's2', name: 'Chorus' })])) === null);
check('another chord sends the song again', stepDelta(base, commands({}, [section({ chords: [createChord('D', '', 'min', 4)] })])) === null);

console.log(`${checks - failed}/${checks} delta checks passed`);
if (failed) process.exit(1);
