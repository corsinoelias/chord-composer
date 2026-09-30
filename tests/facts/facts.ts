/**
 * The numbers in src/data/facts.ts against where they come from. The web's are counted from
 * its own code and rhythm files; the app's from the Flutter project next door, when it is
 * there (it is not on the build server, and then those checks are skipped, not failed).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP, WEB } from '../../src/data/facts';
import { CHORD_QUALITIES } from '../../src/lib/musicTheory';
import { MUSICAL_STYLES } from '../../src/lib/styles';
import { getDefaultInstrumentStates } from '../../src/lib/instruments';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const json = (f: string) => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
let failed = 0, passed = 0, skipped = 0;
function check(what: string, stated: unknown, actual: unknown) {
  if (JSON.stringify(stated) === JSON.stringify(actual)) { passed++; return; }
  failed++;
  console.error(`✗ ${what}: facts.ts says ${JSON.stringify(stated)}, the source has ${JSON.stringify(actual)}`);
}

// ── Web ──
check('web chord types', WEB.chordTypes, CHORD_QUALITIES.length);
check('web rhythms', WEB.rhythms,
  MUSICAL_STYLES.length + json('public/rhythms/app-styles.json').styles.length + json('public/rhythms/library.json').rhythms.length);
check('web instruments', [...WEB.instruments].sort(), getDefaultInstrumentStates().map((i) => i.id).sort());

// ── Links ──
// /app/ is the signed-in library: a reader without an account lands on "Sign in to see your
// songs". Articles that mean the player link /chord-player/.
const learn = path.join(root, 'src/content/learn');
const toLibrary = fs.readdirSync(learn).filter((f) => /\]\(\/app\/?\)/.test(fs.readFileSync(path.join(learn, f), 'utf8')));
check('articles linking the player to /app/', toLibrary, []);

// ── App ──
const app = process.env.APP_DIR ?? path.resolve(root, '../../../../Projects/chord_sequencer');
if (!fs.existsSync(path.join(app, 'pubspec.yaml'))) {
  skipped++;
  console.log('- the app is not next to the site: its facts are not checked');
} else {
  const read = (f: string) => fs.readFileSync(path.join(app, f), 'utf8');
  const count = (text: string, re: RegExp) => (text.match(re) ?? []).length;
  const constants = read('lib/core/music/constants.dart');
  const chordTypes = constants.slice(constants.indexOf('const chordTypes = ['), constants.indexOf('];', constants.indexOf('const chordTypes = [')));
  check('app version', APP.version, read('pubspec.yaml').match(/^version: (\d+\.\d+\.\d+)/m)?.[1]);
  check('app chord types', APP.chordTypes, count(chordTypes, /^\s+'[^']+',/gm));
  check('app rhythms', APP.rhythms,
    count(read('lib/core/data/style_presets.dart'), /^\s*StylePreset\(/gm) + JSON.parse(read('assets/rhythm_library.json')).rhythms.length);
  check('app percussion rows', APP.percussionRows, new Set(constants.match(/'perc\d+'/g)).size);
  // The kits the drums offer: every one in drumKits but those kept only for songs that play them.
  const unoffered = (constants.match(/const unofferedDrumKits = \{([^}]*)\}/)?.[1].match(/'[^']+'/g) ?? []).length;
  check('app drum kits', APP.drumKits, count(constants, /^ {2}DrumKit\(/gm) - unoffered);
  check('app example songs', APP.exampleSongs, count(read('lib/core/data/song_seeds.dart'), /^ {2}SongSeed\(/gm));
  check('app progressions', APP.progressions, count(read('lib/core/data/progression_library.dart'), /^ {2}Progression\(/gm));
  const transport = read('lib/features/transport/transport_bar.dart');
  check('app tempo range', APP.tempo, { min: Number(transport.match(/min: (\d+),/)?.[1]), max: Number(transport.match(/max: (\d+),/)?.[1]) });
  const recommended = constants.slice(constants.indexOf('const recommendedSounds'), constants.indexOf('\n};', constants.indexOf('const recommendedSounds')));
  check('app recommended sounds', APP.recommendedSounds, count(recommended, /^\s+\d+: '/gm));
  // The SoundFont's presets below its drum banks (120 and 128): "Todos los sonidos".
  const sf2 = fs.readFileSync(path.join(app, 'assets/sf2/GeneralUser.sf2'));
  const phdr = sf2.indexOf('phdr');
  let instruments = 0;
  for (let at = phdr + 8; at + 38 <= phdr + 8 + sf2.readUInt32LE(phdr + 4) - 38; at += 38) {
    if (sf2.readUInt16LE(at + 22) < 120) instruments++;
  }
  check('app sound bank', APP.soundBank, instruments);
  check('app minimum Android', APP.minAndroid, read('android/app/build.gradle').includes('minSdkVersion 26') ? '8.0' : 'not API 26');
}

console.log(`${passed}/${passed + failed} fact checks passed${skipped ? ' (app skipped)' : ''}`);
if (failed) process.exit(1);
