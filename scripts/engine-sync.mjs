#!/usr/bin/env node
/**
 * Brings the Android app's audio engine into the web, and builds it.
 *
 *   npm run engine:sync
 *
 * The app owns the engine (chord_sequencer/android/app/src/main/cpp/native_audio.cpp). This
 * copies that file and tsf.h into engine/vendor/ unchanged, compiles engine/web_glue.cpp
 * (which includes it with CHORD_AUDIO_WEB) to public/engine/engine.wasm, cuts the SoundFont
 * programs the web needs out of the app's GeneralUser.sf2, copies the kit's recordings, and
 * writes engine/source.json: which app commit it came from and a hash of every file, which
 * `npm run check:engine` (part of the Netlify build) holds the repo to.
 *
 * After running it: test on a phone (lab/app-engine/phone/README.md) and commit engine/ and
 * public/engine/ together.
 *
 * Env: CHORD_APP  the app repo (default C:/Users/Eliascorsino/Projects/chord_sequencer)
 *      WASI_SDK   wasi-sdk 25+ (default %LOCALAPPDATA%/wasi-sdk-25.0-x86_64-windows)
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE_FILES, hashFile, sourceManifestPath } from './engine-files.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = process.env.CHORD_APP || 'C:/Users/Eliascorsino/Projects/chord_sequencer';
const wasiSdk = process.env.WASI_SDK
  || path.join(process.env.LOCALAPPDATA || '', 'wasi-sdk-25.0-x86_64-windows');

/** General MIDI programs (bank 0) the web ships: the three every song starts with. */
const PROGRAMS = [0, 25, 33];
/** The kit's recordings the web ships, from the app's assets/drums/. */
const DRUMS = ['kick', 'snare', 'stick', 'hat', 'hatopen', 'crash'];

const fail = (message) => {
  console.error(`engine:sync: ${message}`);
  process.exit(1);
};

const cppDir = path.join(app, 'android/app/src/main/cpp');
if (!fs.existsSync(path.join(cppDir, 'native_audio.cpp'))) fail(`no app engine at ${cppDir} (set CHORD_APP)`);
const clang = path.join(wasiSdk, 'bin', process.platform === 'win32' ? 'clang++.exe' : 'clang++');
if (!fs.existsSync(clang)) fail(`no wasi-sdk at ${wasiSdk} (set WASI_SDK; https://github.com/WebAssembly/wasi-sdk/releases)`);

// 1. The engine, byte for byte.
const vendor = path.join(root, 'engine/vendor');
fs.mkdirSync(vendor, { recursive: true });
for (const file of ['native_audio.cpp', 'tsf.h']) fs.copyFileSync(path.join(cppDir, file), path.join(vendor, file));

const git = (...args) => execFileSync('git', ['-C', app, ...args]).toString().trim();
const commit = git('rev-parse', 'HEAD');
const dirty = git('status', '--porcelain', '--', 'android/app/src/main/cpp') !== '';

// 2. Compile.
const out = path.join(root, 'public/engine');
fs.mkdirSync(path.join(out, 'drums'), { recursive: true });
execFileSync(clang, [
  `--sysroot=${path.join(wasiSdk, 'share/wasi-sysroot')}`, '--target=wasm32-wasip1', '-O3',
  '-fno-exceptions', '-std=c++17', '-DCHORD_AUDIO_WEB',
  `-I${path.join(root, 'engine/shim')}`, `-I${vendor}`,
  '-mexec-model=reactor', '-Wl,--export=malloc',
  '-o', path.join(out, 'engine.wasm'), path.join(root, 'engine/web_glue.cpp'),
], { stdio: 'inherit' });

// The worklet provides exactly one import. Anything more would fail at load time in the
// browser, so it fails here instead.
const imports = WebAssembly.Module.imports(new WebAssembly.Module(fs.readFileSync(path.join(out, 'engine.wasm'))))
  .map((i) => `${i.module}.${i.name}`);
const unexpected = imports.filter((i) => i !== 'wasi_snapshot_preview1.clock_time_get');
if (unexpected.length) fail(`engine.wasm imports ${unexpected.join(', ')}; public/lab/app-engine/worklet.js only provides clock_time_get`);

// 3. Sounds.
execFileSync(process.execPath, [
  path.join(root, 'scripts/sf2-subset.mjs'), path.join(app, 'assets/sf2/GeneralUser.sf2'),
  path.join(out, 'core.sf2'), PROGRAMS.join(','),
], { stdio: 'inherit' });
for (const name of DRUMS) fs.copyFileSync(path.join(app, 'assets/drums', `${name}.pcm`), path.join(out, 'drums', `${name}.pcm`));

// 4. Record where it all came from.
const manifest = {
  note: 'Written by npm run engine:sync; checked by npm run check:engine. Do not edit by hand.',
  app: { commit, dirtyEngine: dirty },
  syncedAt: new Date().toISOString(),
  programs: PROGRAMS,
  drums: DRUMS,
  files: Object.fromEntries(ENGINE_FILES(DRUMS).map((f) => [f, hashFile(path.join(root, f))])),
};
fs.writeFileSync(sourceManifestPath(root), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`engine:sync: app ${commit.slice(0, 7)}${dirty ? ' (engine has uncommitted changes)' : ''} → public/engine/`);
console.log(`  engine.wasm ${fs.statSync(path.join(out, 'engine.wasm')).size} bytes, imports: ${imports.join(', ') || 'none'}`);
if (dirty) console.log('  The app\'s engine is not committed: commit it there too, so source.json names a real commit.');
