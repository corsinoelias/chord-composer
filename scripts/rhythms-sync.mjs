#!/usr/bin/env node
/**
 * Brings the app's rhythms into the web.
 *
 *   npm run rhythms:sync
 *
 * The app owns them, written for its engine (which the web plays through, engine:sync):
 *   - the rhythm library, assets/rhythm_library.json in the app: keyboard rhythms already
 *     converted to styles of the app's own, with variations A and B, fills, intro and ending;
 *   - the app's own styles the web did not have (Salsa, Bachata, Bolero, Norteño, Modern
 *     Worship, Afrobeat, Trap), exported by the app's tool/export_web_styles_test.dart from
 *     exactly what the app puts on a song when one is picked.
 *
 * Both land in public/rhythms/ and are fetched the first time the rhythm list is opened (or a
 * song names one), never with the page. src/lib/appStyles.ts reads them.
 *
 * Env: CHORD_APP  the app repo (default C:/Users/Eliascorsino/Projects/chord_sequencer)
 *      FLUTTER    the flutter command (default: flutter on the PATH, else C:/flutter/bin/flutter)
 */
import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = process.env.CHORD_APP || 'C:/Users/Eliascorsino/Projects/chord_sequencer';
const fail = (message) => {
  console.error(`rhythms:sync: ${message}`);
  process.exit(1);
};
if (!fs.existsSync(path.join(app, 'assets/rhythm_library.json'))) fail(`no app at ${app} (set CHORD_APP)`);

const flutter = process.env.FLUTTER || (fs.existsSync('C:/flutter/bin/flutter.bat') ? 'C:/flutter/bin/flutter.bat' : 'flutter');
execSync(`"${flutter}" test tool/export_web_styles_test.dart`, { cwd: app, stdio: 'inherit' });

const out = path.join(root, 'public/rhythms');
fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(path.join(app, 'assets/rhythm_library.json'), path.join(out, 'library.json'));
fs.copyFileSync(path.join(app, 'build/web_styles.json'), path.join(out, 'app-styles.json'));

const git = (...args) => execFileSync('git', ['-C', app, ...args]).toString().trim();
const library = JSON.parse(fs.readFileSync(path.join(out, 'library.json'), 'utf8'));
const styles = JSON.parse(fs.readFileSync(path.join(out, 'app-styles.json'), 'utf8'));
fs.writeFileSync(path.join(out, 'source.json'), `${JSON.stringify({
  note: 'Written by npm run rhythms:sync. Do not edit by hand.',
  app: git('rev-parse', 'HEAD'),
  syncedAt: new Date().toISOString(),
  library: library.rhythms.length,
  styles: styles.styles.map((s) => s.id),
}, null, 2)}\n`);
console.log(`rhythms:sync: ${library.rhythms.length} library rhythms and ${styles.styles.length} app styles → public/rhythms/`);
