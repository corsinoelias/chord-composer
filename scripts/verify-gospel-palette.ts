#!/usr/bin/env tsx
/**
 * Asserts that every chord the gospel palette can produce actually parses.
 *
 * `parseChordString` fails SILENTLY: an unrecognised quality suffix degrades to plain
 * major rather than throwing. So a typo in one of the 12 key spellings, or a quality that
 * later disappears from CHORD_QUALITIES, would not break the build or the page -- it would
 * just make one chord in one key play the wrong thing, with nothing on screen to show for
 * it. That is 264 chords nobody is going to click through by hand.
 *
 * Run: npx tsx scripts/verify-gospel-palette.ts
 */
import { buildPalette, PALETTE_KEYS, type PaletteChord } from '../src/lib/gospelPalette';
import { parseChordString } from '../src/lib/chordParser';

/** The quality each id is supposed to end up with, so a silent 'maj' fallback is caught. */
const EXPECTED: Record<string, string> = {
  I: 'maj9', ii: 'min9', iii: 'min11', IV: 'maj7#11', V: '9sus4', vi: 'min11', vii: 'm7b5',
  I7: 'maj7', ii7: 'min7', iii7: 'min7', IV7: 'maj7', V7: '7sus4', vi7: 'min7', vii7: 'm7b5',
  VI7: '7#9', III7: '7#9', V7a: '7#9', II7: '7#9',
  b3: 'maj7', b6: 'maj7', b7: 'maj7', b7m: 'min7',
};

let checked = 0;
const failures: string[] = [];

for (const key of PALETTE_KEYS) {
  const palette = buildPalette(key);
  const all: PaletteChord[] = [
    ...palette.home, ...palette.homePlain, ...palette.tension, ...palette.colour,
  ];

  for (const chord of all) {
    checked += 1;
    const parsed = parseChordString(chord.symbol)[0];

    if (!parsed) {
      failures.push(`${key}: "${chord.symbol}" (${chord.id}) did not parse at all`);
      continue;
    }

    const expected = EXPECTED[chord.id];
    if (parsed.quality !== expected) {
      failures.push(
        `${key}: "${chord.symbol}" (${chord.id}) parsed as ${parsed.quality}, expected ${expected}`,
      );
    }

    // The root must survive too: "Bbmaj7" parsing as B major would be just as silent.
    const root = `${parsed.root}${parsed.accidental}`;
    if (!chord.symbol.startsWith(root)) {
      failures.push(`${key}: "${chord.symbol}" (${chord.id}) parsed its root as ${root}`);
    }
  }

  // Every id must be unique within a key, or selection-by-id in the component collides.
  const ids = all.map((c) => c.id);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length) failures.push(`${key}: duplicate chord ids ${[...new Set(dupes)].join(', ')}`);
}

if (failures.length) {
  console.error(`${failures.length} problem(s) in the gospel palette:\n`);
  failures.forEach((f) => console.error('  ' + f));
  process.exit(1);
}

console.log(`Gospel palette OK — ${checked} chords across ${PALETTE_KEYS.length} keys parse as intended.`);
