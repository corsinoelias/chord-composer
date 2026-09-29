/**
 * The web sorts and offers sounds as the app does: the same recommended sounds, the same
 * families, the same kits.
 *
 *   npm run test:sounds
 *
 * Reads the app's constants.dart (CHORD_APP, default the usual checkout) and the files
 * engine:sync writes (public/engine/kit.json, presets.json, src/data/recommendedSounds.json).
 */
import fs from 'node:fs';
import path from 'node:path';
import { getInstrumentConfig } from '../../src/lib/instruments';
import {
  RECOMMENDED, familiesInOrder, isKitProgram, isRecommended, soundFamilyOf, soundSuitsTrack,
} from '../../src/lib/soundFamilies';

const app = process.env.CHORD_APP || 'C:/Users/Eliascorsino/Projects/chord_sequencer';
const root = path.resolve(import.meta.dirname, '../..');
let passed = 0;
const failures: string[] = [];
const check = (ok: boolean, what: string) => (ok ? passed++ : failures.push(what));

// The recommended sounds: the app's, in its order, less the programs the web's recordings take.
const constants = fs.readFileSync(path.join(app, 'lib/core/music/constants.dart'), 'utf8');
const appRecommended = [...(constants.match(/const recommendedSounds = <int, String>\{([\s\S]*?)\n\};/)?.[1] ?? '')
  .matchAll(/(\d+):\s*'((?:[^'\\]|\\.)*)'/g)].map((m) => [Number(m[1]), m[2].replace(/\\'/g, "'")] as const);
const recorded = new Set([100, 101, 102, 103, 104]);
check(appRecommended.length === 68, `the app recommends 68 sounds (read ${appRecommended.length})`);
check(JSON.stringify(RECOMMENDED) === JSON.stringify(appRecommended.filter(([p]) => !recorded.has(p))),
  'the web recommends what the app does, in its order (run npm run engine:sync)');

// Every recommended sound is one the web has, suits some track, and is no kit.
const presets = new Map<number, string>(JSON.parse(fs.readFileSync(path.join(root, 'public/engine/presets.json'), 'utf8')));
for (const [program, name] of RECOMMENDED) {
  check(presets.get(program) === name, `${name} (${program}) is in the web's SoundFont by that name`);
  check(['piano', 'guitar', 'bass', 'synth'].some((t) => soundSuitsTrack(t, program)), `${name} suits some track`);
  check(!isKitProgram(program), `${name} is no kit`);
}
check([...presets.keys()].every((p) => !isKitProgram(p)), 'no kit is listed among the sounds');

// The families and which sound suits which track, as the app's tests have them.
check(soundFamilyOf(37) === 'basses' && soundFamilyOf(61) === 'brass' && soundFamilyOf(66) === 'winds', 'families by program');
check(soundFamilyOf(8 * 128 + 37) === 'basses', 'a variation is in its sound\'s family');
check(soundSuitsTrack('guitar', 104) && !soundSuitsTrack('piano', 104), 'the sitar is plucked, on the guitar');
check(soundSuitsTrack('synth', 110) && soundSuitsTrack('piano', 114), 'the fiddle on the synth, steel drums on the piano');
check(!soundSuitsTrack('bass', 56), 'a trumpet is not a bass');
check(familiesInOrder('bass')[0] === 'basses' && familiesInOrder('synth').slice(0, 2).join() === 'synths,strings', 'a track\'s own families first');
check(isRecommended(0) && !isRecommended(32), 'the grand piano is recommended, the upright bass not');

// The drums offer the app's kits by their place in its drumKits, the SoundFont's among them,
// and not the two synthesised ones.
const kits: { name: string }[] = JSON.parse(fs.readFileSync(path.join(root, 'public/engine/kit.json'), 'utf8')).kits;
const drums = getInstrumentConfig('drums')!.soundTypes;
for (const sound of drums) check(kits[sound.kit!]?.name === sound.name, `the drums' ${sound.name} is the app's kit ${sound.kit}`);
for (const name of ['Standard Kit', 'Jazz Kit', 'Brush Kit', 'Orchestral Kit']) check(drums.some((s) => s.name === name), `${name} is offered`);
check(!drums.some((s) => s.name === 'Synth' || s.name === '808'), 'Synth and 808 are not offered');

if (failures.length) {
  for (const f of failures) console.log(`✗ ${f}`);
  console.log(`${passed}/${passed + failures.length} sound checks passed`);
  process.exit(1);
}
console.log(`${passed}/${passed} sound checks passed`);
