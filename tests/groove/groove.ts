/**
 * A section's own version of an app rhythm (src/lib/groove.ts) and the steps it is made of
 * (src/lib/appEngine/steps.ts), against every rhythm the web plays: the library's 177 and the
 * app's own styles.
 *
 *   npm run test:groove
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  baseVariation, cloneDense, effectiveVariation, grooveOf, resizeLane, sectionGrooveOf, toAppVariation, withGroove,
  type DenseVariation,
} from '../../src/lib/groove';
import { accent, notesOf, packHit, packNotes, hitTone, semitoneOf, vel } from '../../src/lib/appEngine/steps';
import { categoryGenre, libraryGenre, type AppStyle } from '../../src/lib/appStyles';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f: string) => JSON.parse(fs.readFileSync(path.join(root, 'public/rhythms', f), 'utf8'));
const styles: AppStyle[] = [
  ...read('app-styles.json').styles.map((s: AppStyle & { category: string }) => ({ ...s, genre: categoryGenre(s.category) })),
  ...read('library.json').rhythms.map((r: { n: number; name: string; style: AppStyle }) => ({ ...r.style, id: `lib-${r.n}`, name: r.name, genre: libraryGenre(r.n) })),
];

let failed = 0;
let checks = 0;
const check = (name: string, ok: boolean, detail = '') => {
  checks++;
  if (!ok) { failed++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ''}`); }
};

// 1. Every step the rhythms hold reads back to the same value it was: decoding and encoding a
//    step loses nothing, so an edit never changes a cell it did not touch.
let melodicSteps = 0, hits = 0;
for (const s of styles) {
  for (const v of [s.a, s.b].filter(Boolean)) {
    for (const [track, rows] of Object.entries(v!.patterns)) {
      for (const lane of Object.values(rows)) {
        for (const p of lane) {
          if (!p) continue;
          if (track === 'drums') {
            hits++;
            const again = packHit(vel(p), hitTone(p), accent(p));
            // A hit keeps velocity, tone and accent; the degree bits a drum never reads may differ.
            check(`${s.id} hit ${p}`, vel(again) === vel(p) && hitTone(again) === hitTone(p) && accent(again) === accent(p));
          } else {
            melodicSteps++;
            const again = packNotes(vel(p), notesOf(p), accent(p));
            check(`${s.id} ${track} step ${p}`, again === p, `re-encoded as ${again}`);
          }
        }
      }
    }
  }
}
console.log(`steps: ${melodicSteps} melodic steps and ${hits} hits read back`);

// 2. A section that edits nothing keeps nothing; one edit keeps that track alone, and the
//    engine gets back exactly what was edited.
for (const s of styles) {
  const section = {};
  const a = effectiveVariation(s, section, 'a')!;
  const b = effectiveVariation(s, section, 'b');
  check(`${s.id} untouched`, sectionGrooveOf(s, section, { a, b }) === undefined);
  const edited = cloneDense(a);
  const lane = edited.rows.bass.lane;
  lane[2] = lane[2] ? 0 : packNotes(205, [{ d: 10, o: 0, a: -1 }]);
  const groove = sectionGrooveOf(s, section, { a: edited, b });
  check(`${s.id} one edit keeps one track`, !!groove?.a?.tracks?.bass && Object.keys(groove!.a!.tracks!).length === 1 && !groove!.a!.fill && !groove!.b);
  const back = effectiveVariation(s, { groove }, 'a')!;
  check(`${s.id} edit plays back`, JSON.stringify(toAppVariation(back).patterns.bass) === JSON.stringify(toAppVariation(edited).patterns.bass));
  check(`${s.id} rest untouched`, JSON.stringify(back.rows.drums) === JSON.stringify(a.rows.drums));
}

// 3. The fill: a lane added to it is kept even empty (it silences the groove there).
{
  const s = styles.find((x) => x.id === 'app-salsa')!;
  const base = baseVariation(s, {}, 'b')!;
  const edited = cloneDense(base);
  edited.fill.lanes.kick = new Array(16).fill(0);
  const g = grooveOf(edited, base);
  check('fill lane kept when empty', !!g?.fill && 'kick' in g.fill.lanes && g.fill.lanes.kick.length === 0);
  const back = withGroove(base, g, 16);
  check('fill lane read back', 'kick' in back.fill.lanes && back.fill.from === base.fill.from);
}

// 4. A longer pattern repeats what there was; a shorter one keeps its start.
{
  const one = [1, 0, 2, 0];
  check('resize 1→2 repeats', JSON.stringify(resizeLane(one, 1, 2, 4)) === JSON.stringify([1, 0, 2, 0, 1, 0, 2, 0]));
  check('resize 2→1 keeps the start', JSON.stringify(resizeLane([1, 0, 2, 0, 3, 3, 3, 3], 2, 1, 4)) === JSON.stringify([1, 0, 2, 0]));
}

// 5. Notes against chords, as the engine's chordTone: a flat third over C is E♭, over Am it is B.
{
  const flat3 = { d: 10, o: 0, a: -1 };
  check('♭3 over C', semitoneOf(flat3, 'maj') === 3);
  check('♭3 over Am', semitoneOf(flat3, 'min') === 2);
  check('seventh of a triad plays its fifth', semitoneOf({ d: 5, o: 0, a: 0 }, 'maj') === 7);
  check('octave up', semitoneOf({ d: 8, o: 1, a: 0 }, 'maj') === 12);
}

// 6. Intro and ending parts: one variation, no fill.
{
  const s = styles.find((x) => x.intro?.length)!;
  const part = { stylePart: { styleId: s.id, kind: 'intro' as const, index: 0 } };
  const a = baseVariation(s, part, 'a') as DenseVariation;
  check('part has A', !!a && Object.keys(a.fill.lanes).length === 0);
  check('part has no B', baseVariation(s, part, 'b') === null);
}

// 7. A B the section makes when the rhythm has none: a copy of A that exists even untouched,
//    keeps only what differs from the rhythm's A, and plays back as edited.
// Every rhythm of the library brings a B, so the ones without are made by taking it away.
for (const s of styles.slice(0, 30).map((x) => ({ ...x, id: `${x.id}-noB`, b: undefined }))) {
  const a = effectiveVariation(s, {}, 'a')!;
  const untouched = sectionGrooveOf(s, {}, { a, b: cloneDense(a) });
  check(`${s.id} made B exists`, !!untouched?.bCreated && !untouched.b && !untouched.a);
  const b0 = effectiveVariation(s, { groove: untouched }, 'b');
  check(`${s.id} made B starts as A`, !!b0 && JSON.stringify(b0) === JSON.stringify(a));
  const b = cloneDense(a);
  const spb = a.rows.drums.kick?.length ? a.rows.drums.kick.length / a.bars.drums : 16;
  b.rows.drums.kick = new Array(b.bars.drums * spb).fill(0).map((_, i) => (i % 4 === 0 ? packHit(200) : 0));
  const g = sectionGrooveOf(s, {}, { a, b });
  check(`${s.id} made B keeps its drums alone`, !!g?.bCreated && !!g.b?.tracks?.drums && Object.keys(g.b!.tracks!).length === 1);
  const back = effectiveVariation(s, { groove: g }, 'b')!;
  check(`${s.id} made B plays back`, JSON.stringify(back.rows.drums.kick) === JSON.stringify(b.rows.drums.kick));
  check(`${s.id} no B without it`, effectiveVariation(s, {}, 'b') === null);
}

console.log(`${checks - failed}/${checks} checks passed over ${styles.length} rhythms`);
if (failed) process.exit(1);
