/**
 * What a sound change sounds like, heard: each song is rendered by the engine itself
 * (public/engine/export-worker.js, run here with a stand-in for the worker's `self`) and
 * compared with the same song before the change. A sound the editor's pill picks must
 * change what is heard in the part it was picked for, and nothing else.
 *
 *   - the part's own sound, on A and on B, on an app rhythm, a library one and a web one;
 *   - an intro or ending a section plays (section.part) and one the rhythm added (stylePart);
 *   - a kit on a rhythm that plays kit pieces.
 *
 *   npm run test:groove
 */
import { appPartSections } from '../../src/lib/appEngine/fromAppStyle';
import { appStylePattern } from '../../src/lib/appStyles';
import { getStyleById, type StylePattern } from '../../src/lib/styles';
import { createChord } from '../../src/lib/musicTheory';
import { foldSectionSounds, type Section } from '../../src/lib/sections';
import { distance, library, own, render } from './engineRender';

let failed = 0;
let checks = 0;
const check = (name: string, ok: boolean, detail = '') => { checks++; if (!ok) { failed++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ''}`); } };
const HEARD = 20;

const chords = () => [createChord('C', '', 'maj', 4), createChord('A', '', 'min', 4)];
const section = (extra: Partial<Section> = {}): Section => ({ id: 's1', name: 'Verse', repeatCount: 1, chords: chords(), ...extra });
/** Whether giving [sounds] to [part] of the section changes what it sounds like. */
async function heard(style: StylePattern, base: Section, part: string, sounds: Record<string, string>) {
  const before = await render([base], style);
  const after = await render([{ ...base, partSounds: { [part]: sounds } }], style);
  return distance(before, after);
}

const salsa = own.find((s) => s.id === 'app-salsa')!;
const worship = own.find((s) => s.id === 'app-worship')!;
const withParts = library.find((s) => s.intro?.length && s.ending?.length && s.b && s.meter.beats === 4)!;
const merengue = getStyleById('merengue')!;

const bass = { bass: 'slap' };
// An intro may leave an instrument out: every one of them changes, so one that plays is heard.
const band = { piano: 'rhodes', guitar: 'nylon', bass: 'slap', synth: 'square' };
const cases: [string, StylePattern, Section, string, Record<string, string>, boolean][] = [
  ['app rhythm, A plays A\'s bass', appStylePattern(salsa), section(), 'a', bass, true],
  ['app rhythm, A leaves B\'s bass alone', appStylePattern(salsa), section(), 'b', bass, false],
  ['app rhythm, B plays B\'s bass', appStylePattern(salsa), section({ variation: 1 }), 'b', bass, true],
  ['library rhythm, A\'s bass', appStylePattern(withParts), section(), 'a', bass, true],
  ['library rhythm, the section\'s intro', appStylePattern(withParts), section({ part: 'intro' }), 'intro', band, true],
  ['library rhythm, the section\'s ending', appStylePattern(withParts), section({ part: 'ending' }), 'ending', band, true],
  ['web rhythm, A\'s bass', merengue, section(), 'a', bass, true],
  ['a kit on a rhythm that plays kit pieces', appStylePattern(worship), section(), 'a', { drums: 'electronic' }, true],
];
for (const [name, style, base, part, sounds, expect] of cases) {
  const d = await heard(style, base, part, sounds);
  check(name, expect ? d > HEARD : d === 0, `distance ${d.toFixed(1)}`);
}

// An intro the rhythm added is its own section, edited as its one variation: A.
{
  const added = appPartSections(withParts, 'intro', 0, false, false)[0];
  const d = await heard(appStylePattern(withParts), added, 'a', band);
  check('an intro the rhythm added', d > HEARD, `distance ${d.toFixed(1)}`);
}

// A section's own sounds (the old section menu's) moved to its parts sound the same, A and B.
for (const variation of [0, 1] as const) {
  const old = section({ variation, sounds: { bass: 'slap', drums: 'ap1' } });
  const style = appStylePattern(salsa);
  const d = distance(await render([old], style), await render([foldSectionSounds(old)], style));
  check(`a section's own sounds, moved to its parts, on ${variation ? 'B' : 'A'}`, d === 0, `distance ${d.toFixed(1)}`);
}

// What the song sets over its rhythm, heard on an app rhythm too: how long the bass's notes
// ring (⋯ › Notes) and where its register sits (Keyboard and range).
{
  const style = appStylePattern(salsa);
  const plain = await render([section()], style);
  const short = distance(plain, await render([section()], style, { noteLengths: { bass: 0.5 } }));
  check('the song\'s note length, on an app rhythm', short > HEARD, `distance ${short.toFixed(1)}`);
  const lower = distance(plain, await render([section()], style, { voicings: { bass: 28 } }));
  check('the song\'s register, on an app rhythm', lower > HEARD, `distance ${lower.toFixed(1)}`);
  const same = distance(plain, await render([section()], style, { voicings: { bass: salsa.voicings.bass } }));
  check('the rhythm\'s own register sounds as it did', same === 0, `distance ${same.toFixed(1)}`);
}

// The synth has a register too: its range bar moved it nowhere while the engine knew only
// piano, guitar and bass.
{
  const afrobeat = appStylePattern(own.find((s) => s.id === 'app-afrobeat')!);
  const plain = await render([section()], afrobeat);
  const up = distance(plain, await render([section()], afrobeat, { voicings: { synth: 84 } }));
  check('the synth\'s register', up > HEARD, `distance ${up.toFixed(1)}`);
  // And its note length: set and never applied while the engine gated piano, guitar and
  // bass only, so every choice rang until the next note.
  const short = distance(plain, await render([section()], afrobeat, { noteLengths: { synth: 0.5 } }));
  check('the synth\'s note length', short > HEARD, `distance ${short.toFixed(1)}`);
}

console.log(`${checks - failed}/${checks} listening checks passed`);
if (failed) process.exit(1);
