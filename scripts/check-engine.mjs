#!/usr/bin/env node
/**
 * Holds the web's copy of the app's audio engine to engine/source.json.
 *
 *   npm run check:engine        (also runs in the Netlify build)
 *
 * Fails when any engine file differs from what `npm run engine:sync` recorded — the vendored
 * engine edited by hand (the app owns it), web_glue.cpp or the shim changed without a
 * rebuild, or a built file replaced on its own. Any of those means public/engine/engine.wasm
 * may not be the engine it claims to be.
 *
 * Where the app repo is on disk (a developer machine, not Netlify), it also warns when the
 * app's engine has moved on since the last sync.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE_FILES, hashFile, sourceManifestPath } from './engine-files.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = sourceManifestPath(root);
if (!fs.existsSync(manifestPath)) {
  console.error('check:engine: engine/source.json is missing — run npm run engine:sync');
  process.exit(1);
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

const problems = [];
const expected = ENGINE_FILES(manifest.drums);
for (const file of expected) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) problems.push(`${file} is missing`);
  else if (hashFile(full) !== manifest.files[file]) problems.push(`${file} changed since the last engine:sync`);
}
for (const file of Object.keys(manifest.files)) {
  if (!expected.includes(file)) problems.push(`${file} is recorded but no longer part of the engine`);
}

if (problems.length) {
  console.error('check:engine: the web copy of the app engine is not what engine:sync built:');
  for (const p of problems) console.error(`  - ${p}`);
  console.error('Engine changes belong in the app (native_audio.cpp); then run npm run engine:sync.');
  process.exit(1);
}

// Developer machines only: has the app moved on?
const app = process.env.CHORD_APP || 'C:/Users/Eliascorsino/Projects/chord_sequencer';
const appCpp = path.join(app, 'android/app/src/main/cpp');
if (fs.existsSync(appCpp)) {
  const stale = ['native_audio.cpp', 'tsf.h'].filter(
    (f) => hashFile(path.join(appCpp, f)) !== manifest.files[`engine/vendor/${f}`],
  );
  if (stale.length) {
    console.warn(`check:engine: WARNING — the app's ${stale.join(' and ')} changed since the last sync.`);
    console.warn('  Run npm run engine:sync, test on a phone, and commit engine/ and public/engine/.');
  }
}

console.log(`check:engine: OK — app engine ${manifest.app.commit.slice(0, 7)}${manifest.app.dirtyEngine ? ' (+uncommitted)' : ''}, synced ${manifest.syncedAt.slice(0, 10)}`);
