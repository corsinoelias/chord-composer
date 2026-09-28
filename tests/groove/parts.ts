/**
 * The four parts of a rhythm a section can play — Intro, A, B, Ending (Section.part, groove.ts):
 *   - its intro is the rhythm's first intro part, or its A without the fill when it has none;
 *   - what the section changes of its intro is kept apart from what it changes of A and B;
 *   - the engine hears the intro with no fill and no B, on app rhythms and web ones alike;
 *   - applying a rhythm suggests the part from the section's name.
 *
 *   npm run test:groove
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { baseVariation, cloneDense, effectiveVariation, partView, sectionGrooveOf } from '../../src/lib/groove';
import { songToEngine } from '../../src/lib/appEngine/fromSong';
import { appStylePattern, categoryGenre, type AppStyle } from '../../src/lib/appStyles';
import { withPartsByName } from '../../src/lib/appStyleSong';
import { MUSICAL_STYLES, getStyleById } from '../../src/lib/styles';
import { createChord } from '../../src/lib/musicTheory';
import { sectionPartOf, type Section } from '../../src/lib/sections';
import { packHit } from '../../src/lib/appEngine/steps';
import { type EngineCommand } from '../../src/lib/appEngine/commands';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f: string) => JSON.parse(fs.readFileSync(path.join(root, 'public/rhythms', f), 'utf8'));
const library: AppStyle[] = read('library.json').rhythms.map((r: { n: number; name: string; style: AppStyle }) => ({ ...r.style, id: `lib-${r.n}`, name: r.name, genre: 'x' }));
const own: AppStyle[] = read('app-styles.json').styles.map((s: AppStyle & { category: string }) => ({ ...s, genre: categoryGenre(s.category) }));

let failed = 0;
let checks = 0;
const check = (name: string, ok: boolean, detail = '') => { checks++; if (!ok) { failed++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ''}`); } };

const withIntro = library.find((s) => s.intro?.length && s.ending?.length && s.b)!;
const noIntro = own.find((s) => !s.intro?.length) ?? { ...withIntro, id: 'no-intro', intro: [], ending: [] };
const section = (extra: Partial<Section> = {}): Section => ({
  id: 's1', name: 'Verse', repeatCount: 1, chords: [createChord('C', '', 'maj', 4), createChord('G', '', 'maj', 4)], ...extra,
});

// 1. The intro a section plays.
{
  const view = partView(withIntro, {}, 'intro');
  const intro = baseVariation(withIntro, view, 'a')!;
  const added = baseVariation(withIntro, { stylePart: { styleId: withIntro.id, kind: 'intro', index: 0 } }, 'a')!;
  check('intro is the rhythm\'s first intro part', JSON.stringify(intro) === JSON.stringify(added));
  check('intro has no fill', Object.keys(intro.fill.lanes).length === 0);
  check('intro has no B', baseVariation(withIntro, view, 'b') === null);
  const made = baseVariation(noIntro, partView(noIntro, {}, 'intro'), 'a')!;
  const a = baseVariation(noIntro, {}, 'a')!;
  check('no intro: made from A', JSON.stringify(made.rows) === JSON.stringify(a.rows));
  check('no intro: without the fill', Object.keys(made.fill.lanes).length === 0);
}

// 2. Its edits, apart from A's and B's.
{
  const s = section({ part: 'intro' });
  const a = effectiveVariation(withIntro, s, 'a')!;
  const b = effectiveVariation(withIntro, s, 'b')!;
  const intro = cloneDense(effectiveVariation(withIntro, partView(withIntro, s, 'intro'), 'a')!);
  const spb = (intro.rows.drums.kick?.length ?? 16) / intro.bars.drums;
  intro.rows.drums.kick = new Array(intro.bars.drums * spb).fill(0).map((_, i) => (i === 1 ? packHit(200) : 0));
  const g = sectionGrooveOf(withIntro, s, { a, b, intro, ending: null });
  check('intro edits kept as intro', !!g?.intro?.tracks?.drums && !g.a && !g.b);
  const back = effectiveVariation(withIntro, partView(withIntro, { ...s, groove: g }, 'intro'), 'a')!;
  check('intro edits play back', JSON.stringify(back.rows.drums.kick) === JSON.stringify(intro.rows.drums.kick));
  check('A untouched by them', JSON.stringify(effectiveVariation(withIntro, { ...s, groove: g }, 'a')!.rows) === JSON.stringify(a.rows));
  // Not opened this time: kept as they were.
  const again = sectionGrooveOf(withIntro, { ...s, groove: g }, { a, b });
  check('intro edits survive an edit of A', JSON.stringify(again?.intro) === JSON.stringify(g?.intro));
}

// 3. The engine.
const lastFill = (c: EngineCommand[], bank = 0) => c.filter((x) => x[0] === 'setFill' && (x[5] ?? 0) === bank).pop();
const variationOf = (c: EngineCommand[]) => c.filter((x) => x[0] === 'setVariation').map((x) => x[2]).pop();
{
  const lookup = () => undefined;
  const asPart = songToEngine({ sections: [section({ part: 'intro', variation: 1 })], bpm: 100 }, appStylePattern(withIntro), lookup, []).commands;
  const added = songToEngine({ sections: [section({ stylePart: { styleId: withIntro.id, kind: 'intro', index: 0 } })], bpm: 100 }, appStylePattern(withIntro), lookup, []).commands;
  const steps = (c: EngineCommand[]) => JSON.stringify(c.filter((x) => x[0] === 'setStep' && (x[6] ?? 0) === 0));
  check('app rhythm: the section plays the intro the rhythm would add', steps(asPart) === steps(added));
  check('app rhythm: no fill', (lastFill(asPart)?.[3] ?? 1) === 0);
  check('app rhythm: on A, B emptied', variationOf(asPart) === 0);

  const web = MUSICAL_STYLES[0];
  const webPart = songToEngine({ sections: [section({ part: 'ending' })], bpm: 100 }, web, (id) => getStyleById(id), []).commands;
  check('web rhythm: no fill', (lastFill(webPart)?.[3] ?? 1) === 0);
  check('web rhythm: on A', variationOf(webPart) === 0);
}

// 4. Suggested by the name, on applying.
{
  const song = [section({ name: 'Intro' }), section({ name: 'Verso' }), section({ name: 'Coro' }), section({ name: 'Final' })];
  const parts = withPartsByName(song, withIntro, false).map(sectionPartOf);
  check('names suggest the parts', JSON.stringify(parts) === JSON.stringify(['intro', 'a', 'b', 'ending']), JSON.stringify(parts));
  const added = withPartsByName(song, withIntro, true).map(sectionPartOf);
  check('with the rhythm\'s own intro added, the song\'s stays A', JSON.stringify(added) === JSON.stringify(['a', 'a', 'b', 'a']), JSON.stringify(added));
  const fin = withPartsByName([section({ name: 'Fin' }), section({ name: 'Finale grande' })], withIntro, false).map(sectionPartOf);
  check('"Fin" is an ending too', fin[0] === 'ending', JSON.stringify(fin));
  const chosen = withPartsByName([section({ name: 'Coro', part: 'intro' })], withIntro, false).map(sectionPartOf);
  check('a part already chosen stays', chosen[0] === 'intro');
}

console.log(`${checks - failed}/${checks} part checks passed (${withIntro.id}, ${noIntro.id})`);
if (failed) process.exit(1);
