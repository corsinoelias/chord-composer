/**
 * The web's own rhythms in the rhythm editor (webSectionAppStyle, fromSong.ts): a section is
 * read back from what the engine is told for it, edited in the app's form, and — once it has
 * edits — played from that read-back. So, heard by the engine:
 *
 *   - read back with no edits, every web rhythm sounds exactly as it did: A, a section's own
 *     B (section.alt) and the section on it, and a section's intro;
 *   - an edit is heard, and taking it off gives the rhythm back;
 *   - the read-back's A spells what the web wrote: its bars and its steps.
 *
 *   npm run test:groove
 */
import { webSectionAppStyle } from '../../src/lib/appEngine/fromSong';
import { cloneDense, effectiveVariation, sectionGrooveOf } from '../../src/lib/groove';
import { MUSICAL_STYLES, getStyleById } from '../../src/lib/styles';
import { createChord } from '../../src/lib/musicTheory';
import { type Section } from '../../src/lib/sections';
import { packHit } from '../../src/lib/appEngine/steps';
import { distance, lookup, render } from './engineRender';

let failed = 0;
let checks = 0;
const check = (name: string, ok: boolean, detail = '') => { checks++; if (!ok) { failed++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ''}`); } };

const section = (extra: Partial<Section> = {}): Section => ({
  id: 's1', name: 'Verse', repeatCount: 1, chords: [createChord('C', '', 'maj', 4), createChord('A', '', 'min', 4)], ...extra,
});
/** The section as the editor leaves it with nothing changed: read back, no edits. */
const untouched = (s: Section, id: string): Section => ({ ...s, groove: { styleId: `web-${id}` } });

// 1. Every web rhythm, read back with no edits, is the rhythm.
for (const style of MUSICAL_STYLES) {
  const plain = section();
  const d = distance(await render([plain], style), await render([untouched(plain, style.id)], style));
  check(`${style.id}: read back, the same`, d === 0, `distance ${d.toFixed(2)}`);
}

// 2. A section with its own B, on A and on B, and a section's intro.
const merengue = getStyleById('merengue')!;
const withB = (variation: 0 | 1) => section({ variation, alt: { trackStyles: { drums: 'rock_basic' } } });
for (const variation of [0, 1] as const) {
  const s = withB(variation);
  const d = distance(await render([s], merengue), await render([untouched(s, 'merengue')], merengue));
  check(`merengue with its own B, on ${variation ? 'B' : 'A'}: the same`, d === 0, `distance ${d.toFixed(2)}`);
}
{
  const s = section({ part: 'intro' });
  const d = distance(await render([s], merengue), await render([untouched(s, 'merengue')], merengue));
  check('merengue, a section\'s intro: the same', d === 0, `distance ${d.toFixed(2)}`);
}

// 3. An edit is heard; the same edit taken off is the rhythm again.
{
  const s = section();
  const read = webSectionAppStyle(s, merengue, lookup);
  const a = effectiveVariation(read, s, 'a')!;
  const edited = cloneDense(a);
  edited.rows.drums.crash = new Array(a.bars.drums * 16).fill(0).map((_, i) => (i % 4 === 0 ? packHit(230) : 0));
  const groove = sectionGrooveOf(read, s, { a: edited, b: null, intro: null, ending: null });
  check('an edit makes a groove', !!groove && groove.styleId === 'web-merengue');
  const before = await render([s], merengue);
  const d = distance(before, await render([{ ...s, groove }], merengue));
  check('an edit to a web rhythm is heard', d > 20, `distance ${d.toFixed(2)}`);
  const back = sectionGrooveOf(read, s, { a: cloneDense(a), b: null, intro: null, ending: null });
  check('with the edit taken off, no groove is left', !back);
}

// 3b. A B the editor made (the rhythm has none): the section on it plays B's own sound.
{
  const s = section({ variation: 1 });
  const read = webSectionAppStyle(s, merengue, lookup);
  const a = effectiveVariation(read, s, 'a')!;
  const groove = sectionGrooveOf(read, s, { a: cloneDense(a), b: cloneDense(a), intro: null, ending: null });
  check('a B made in the editor is kept', !!groove?.bCreated);
  const withGroove = { ...s, groove };
  const d = distance(await render([withGroove], merengue), await render([{ ...withGroove, partSounds: { b: { bass: 'slap' } } }], merengue));
  check('its own sound is heard on B', d > 20, `distance ${d.toFixed(2)}`);
}

// 4. The read-back spells what the web wrote.
{
  const read = webSectionAppStyle(section(), merengue, lookup);
  check('merengue read back has drums', Object.values(read.a.patterns.drums ?? {}).some((l) => l.some(Boolean)));
  check('merengue read back has a bass lane', (read.a.patterns.bass?.lane ?? []).some(Boolean));
  check('merengue read back has its bars', (read.a.patternBars.drums ?? 0) >= 1);
  check('merengue read back names its register', typeof read.voicings.bass === 'number');
}

console.log(`${checks - failed}/${checks} web read-back checks passed`);
if (failed) process.exit(1);
