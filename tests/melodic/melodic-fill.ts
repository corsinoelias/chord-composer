/**
 * A fill is the band's, not only the drummer's: piano, guitar and bass have a bar of their
 * own in it (style.fill.melodic), and the engine gets them as the fill rows after the kit's,
 * in the same bits the app writes (chord_sequencer's SectionFill and kFillRows).
 *
 *   npm run test:melodic
 */
import { fillCommand } from '../../src/lib/appEngine/fromSong';
import { DEGREE, DRUM_ROWS, packStep } from '../../src/lib/appEngine/commands';
import { MUSICAL_STYLES, type StylePattern } from '../../src/lib/styles';

let failed = 0;
const check = (name: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`}`);
};

const ROW = 20; // MAX_STEPS_PER_BAR
const base = MUSICAL_STYLES[0];
const bassRow = DRUM_ROWS.length + 2; // piano, guitar, bass after the kit
const lane = (steps: number[], row: number) => steps.slice(row * ROW, row * ROW + ROW);

// The bass walks up from the third beat: the fifth, then a flattened seventh, then a rest.
const walking: StylePattern = {
  ...base,
  fill: {
    position: 8,
    pattern: {},
    melodic: { bass: { pattern: { 5: [0, 0, 0, 0, 0, 0, 0, 0, 1], b7: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1] } } },
  },
};
const [, section, from, mask, steps] = fillCommand(0, walking, 16) as [string, number, number, number, number[]];
check('section and start', [section, from], [0, 8]);
check('only the bass row is written', mask, 1 << bassRow);
const bass = lane(steps, bassRow);
check('fifth on the third beat', bass[8], packStep(255, 8 + 5 - 1));
check('flat seventh after it', bass[10], packStep(255, 8 + 7 - 1, 0, 0, 0, false, -1));
check('the rest is silent', bass.filter((v, i) => i !== 8 && i !== 10).every((v) => v === 0), true);
check('the kit is untouched', lane(steps, 0).every((v) => v === 0), true);

// A chord hit in the fill plays the whole chord.
const stab: StylePattern = { ...base, fill: { position: 12, pattern: {}, melodic: { piano: { pattern: {}, chordHit: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1] } } } };
const [, , , stabMask, stabSteps] = fillCommand(0, stab, 16) as [string, number, number, number, number[]];
check('a piano stab', [stabMask, lane(stabSteps, DRUM_ROWS.length)[12]], [1 << DRUM_ROWS.length, packStep(255, DEGREE.chord)]);

// An empty melodic fill leaves the track to its groove: no bit in the mask.
const empty: StylePattern = { ...base, fill: { position: 12, pattern: {}, melodic: { guitar: { pattern: { 3: [0, 0] } } } } };
check('an empty track fill writes nothing', (fillCommand(0, empty, 16) as number[])[3], 0);

if (failed) {
  console.error(`${failed} failed`);
  process.exit(1);
}
console.log('all passed');
