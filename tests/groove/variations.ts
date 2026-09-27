/**
 * Variation B reaches the engine, on every kind of rhythm:
 *   - the web's own rhythms: the section's alt, written into bank 1;
 *   - a B the section made from A on an app rhythm without one (groove.bCreated).
 * And the section's choice of variation is what the engine is told to play.
 *
 *   npm run test:groove
 */
import { songToEngine } from '../../src/lib/appEngine/fromSong';
import { MUSICAL_STYLES, getStyleById } from '../../src/lib/styles';
import { createChord } from '../../src/lib/musicTheory';
import { arrangementOf, type Section } from '../../src/lib/sections';
import { type EngineCommand } from '../../src/lib/appEngine/commands';

let failed = 0;
let checks = 0;
const check = (name: string, ok: boolean) => { checks++; if (!ok) { failed++; console.log(`FAIL ${name}`); } };

const web = MUSICAL_STYLES[0];
const section = (extra: Partial<Section> = {}): Section => ({
  id: 's1', name: 'Verse', repeatCount: 1,
  chords: [createChord('C', '', 'maj', 4), createChord('A', '', 'min', 4)],
  ...extra,
});
const build = (s: Section) => songToEngine({ sections: [s], bpm: 100 }, web, (id) => getStyleById(id), []).commands;
const bankSteps = (c: EngineCommand[], bank: number) => c.filter((x) => x[0] === 'setStep' && (x[6] ?? 0) === bank).length;
const variationOf = (c: EngineCommand[]) => c.filter((x) => x[0] === 'setVariation').map((x) => x[2]).pop();

// No B: bank 1 cleared, A plays.
const plain = build(section());
check('web rhythm without B: nothing in bank 1', bankSteps(plain, 1) === 0);
check('web rhythm without B: A plays', variationOf(plain) === 0);

// A B made from A, played: the same grooves in bank 1, and B chosen.
const withB = section();
withB.alt = arrangementOf(withB);
const made = build({ ...withB, variation: 1 });
check('web B made from A: bank 1 written', bankSteps(made, 1) > 0 && bankSteps(made, 1) === bankSteps(made, 0));
check('web B chosen: the engine plays B', variationOf(made) === 1);

// B on another rhythm: bank 1 holds that rhythm, not A's.
const other = MUSICAL_STYLES.find((s) => s.id !== web.id && s.timeSignature?.numerator === web.timeSignature?.numerator && JSON.stringify(s.rhythm.kick) !== JSON.stringify(web.rhythm.kick))!;
const elsewhere = build({ ...withB, alt: { styleId: other.id }, variation: 1 });
const kicks = (c: EngineCommand[], bank: number) => JSON.stringify(c.filter((x) => x[0] === 'setStep' && x[2] === 'drums' && x[3] === 'kick' && (x[6] ?? 0) === bank).map((x) => x[4]));
check(`web B on ${other.id}: its own kick`, kicks(elsewhere, 1) !== kicks(elsewhere, 0));

console.log(`${checks - failed}/${checks} variation checks passed`);
if (failed) process.exit(1);
