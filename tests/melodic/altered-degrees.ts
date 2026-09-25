/**
 * Altered degrees in a melodic pattern ('b3', '#4'): how the web reads them, and that it
 * hands them to the engine in exactly the bits the app writes (chord_sequencer's packStep,
 * bits 25-26 and 27-28), so a note flattened on one side sounds flattened on the other.
 *
 *   npm run test:melodic
 */
import {
  ALTERED_DEGREES, degreeKeysOf, degreeLabel, degreeToSemitone, getScaleNoteNames, parseDegreeKey,
  scalePatternIsEmpty, type DegreePattern,
} from '../../src/lib/bassScale';
import { DEGREE, packStep } from '../../src/lib/appEngine/commands';

let failed = 0;
const check = (name: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`}`);
};

// Reading keys: a song from before alterations only has 1-8, and they read as natural.
check('natural key', parseDegreeKey(3), { degree: 3, alter: 0 });
check('flat key', parseDegreeKey('b3'), { degree: 3, alter: -1 });
check('sharp key', parseDegreeKey('#4'), { degree: 4, alter: 1 });
check('not a degree', parseDegreeKey('b9'), null);
check('labels', ['b3', '#4', 5].map((k) => degreeLabel(k as never)), ['♭3', '♯4', '5']);
check('sixteen altered degrees', ALTERED_DEGREES.length, 16);

// Pitch: the degree in the chord's scale, moved a semitone.
check('♭3 over major', degreeToSemitone('b3', 'maj'), 3);
check('♯4 over major', degreeToSemitone('#4', 'maj'), 6);
check('♭7 over dominant', degreeToSemitone('b7', '7'), 9);
check('note names', [getScaleNoteNames(60, 'maj')['b3'], getScaleNoteNames(60, 'maj')['#4']], ['D#4', 'F#4']);

// Order: each alteration beside its own natural, a flat just under it.
const pattern: DegreePattern = { 5: [1], b3: [0, 1], 1: [1], '#4': [0, 0, 1], 3: [0] };
check('row order', degreeKeysOf(pattern), [1, 'b3', 3, '#4', 5]);
check('a natural is one row, not two', new Set([1, 2, 3, 4, 5, 6, 7, 8, ...degreeKeysOf({ 5: [1] })]).size, 8);
check('altered notes are notes', scalePatternIsEmpty({ b7: [0, 1] }), false);

// Packing, bit for bit what the app writes.
const flatThird = packStep(200, 10, 0, 0, 0, false, -1);
check('flat in bits 25-26', (flatThird >> 25) & 3, 1);
check('the rest untouched', flatThird & 0x1ffffff, packStep(200, 10) & 0x1ffffff);
check('sharp second note in bits 27-28', (packStep(200, 8, 0, 11, 0, false, 0, 1) >> 27) & 3, 2);
check('a whole chord is never altered', packStep(200, DEGREE.chord, 0, 0, 0, false, -1), packStep(200, DEGREE.chord));
check('an unaltered step is as before', packStep(200, 10, 1, 12, -1, true), 200 | (10 << 8) | (9 << 12) | (12 << 16) | (7 << 20) | (1 << 24));

if (failed) {
  console.error(`${failed} failed`);
  process.exit(1);
}
console.log('all passed');
