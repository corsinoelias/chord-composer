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

/**
 * General MIDI programs (bank 0) the web ships: every program a web sound plays through
 * (shared/catalog/sounds.json, its `app` field), so any song made on the web has its sounds.
 */
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'shared/catalog/sounds.json'), 'utf8'));
const PROGRAMS = [...new Set(['piano', 'guitar', 'bass'].flatMap((track) => [
  ...(catalog[track]?.sounds ?? []).map((sound) => sound.app?.program),
  ...Object.values(catalog[track]?.legacy ?? {}).map((app) => app?.program),
]).filter((program) => Number.isInteger(program)))].sort((a, b) => a - b);
/**
 * The longest a web note takes to die away once let go, in seconds. The app's SoundFont lets
 * go slowly (its grand piano 1.5-8.6 s, clean guitar 0.8, pick bass 0.5); the web's own
 * sounds stop within 0.04-0.3 s of a note's end, and with the app's tails every track rang on
 * under the next chord (2026-09-22). Only the web's copy is cut; the app keeps its own.
 */
const RELEASE_SECONDS = 0.12;
/**
 * WASI calls the engine may make. clock_time_get is its load meter; the file ones are
 * exportWav writing its WAV, which only ever runs in the export Worker (an in-memory file
 * system); the worklet answers them with ENOSYS.
 */
const ALLOWED_IMPORTS = new Set([
  'clock_time_get', 'fd_close', 'fd_fdstat_get', 'fd_fdstat_set_flags', 'fd_prestat_get',
  'fd_prestat_dir_name', 'fd_read', 'fd_seek', 'fd_write', 'path_open', 'proc_exit',
].map((n) => `wasi_snapshot_preview1.${n}`));

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

// Any import the worklet and the export Worker do not provide would fail at load time in
// the browser, so it fails here instead.
const imports = WebAssembly.Module.imports(new WebAssembly.Module(fs.readFileSync(path.join(out, 'engine.wasm'))))
  .map((i) => `${i.module}.${i.name}`);
const unexpected = imports.filter((i) => !ALLOWED_IMPORTS.has(i));
if (unexpected.length) fail(`engine.wasm imports ${unexpected.join(', ')}, which public/engine/processor.js and export-worker.js do not provide`);

// 3. Sounds.
execFileSync(process.execPath, [
  path.join(root, 'scripts/sf2-subset.mjs'), path.join(app, 'assets/sf2/GeneralUser.sf2'),
  path.join(out, 'sounds.sf2'), PROGRAMS.join(','), String(RELEASE_SECONDS),
], { stdio: 'inherit' });
// The kit: which recording sits in which of the engine's sample slots, and how loud. Read
// from the app's Dart, where the app's own loader reads it (audio_engine.dart), so the two
// can never load the same slot with different sounds or levels.
const dart = (file) => fs.readFileSync(path.join(app, file), 'utf8');
const assetList = dart('lib/core/music/constants.dart').match(/const sampledDrumAssets = \[([\s\S]*?)\];/);
const gainMap = dart('lib/core/music/drum_gains.dart').match(/const sampledDrumGains = <String, double>\{([\s\S]*?)\};/);
if (!assetList || !gainMap) fail('could not read sampledDrumAssets / sampledDrumGains from the app');
const DRUMS = [...assetList[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
const gains = Object.fromEntries([...gainMap[1].matchAll(/'([^']+)':\s*([0-9.]+)/g)].map((m) => [m[1], Number(m[2])]));
for (const name of DRUMS) fs.copyFileSync(path.join(app, 'assets/drums', `${name}.pcm`), path.join(out, 'drums', `${name}.pcm`));
// And the kits: which drum sound each piece plays in each of the app's kits (drumKits in
// constants.dart), by the index the web's catalog names them with.
const kitsSource = dart('lib/core/music/constants.dart').match(/const drumKits = <DrumKit>\[([\s\S]*?)\n\];/);
if (!kitsSource) fail('could not read drumKits from the app');
const kits = [...kitsSource[1].matchAll(/DrumKit\('([^']+)',\s*\{([^}]*)\}/g)].map((m) => ({
  name: m[1],
  rows: Object.fromEntries([...m[2].matchAll(/'([A-Za-z0-9]+)':\s*(\d+)/g)].map((r) => [r[1], Number(r[2])])),
}));
if (!kits.length) fail('drumKits had no kits');
const samples = DRUMS.map((name, slot) => ({ slot, name, gain: gains[name] ?? 1.0 }));
fs.writeFileSync(path.join(out, 'kit.json'), `${JSON.stringify({ samples, kits })}\n`);

// 4. Record where it all came from.
const manifest = {
  note: 'Written by npm run engine:sync; checked by npm run check:engine. Do not edit by hand.',
  app: { commit, dirtyEngine: dirty },
  syncedAt: new Date().toISOString(),
  programs: PROGRAMS,
  releaseSeconds: RELEASE_SECONDS,
  drums: DRUMS,
  files: Object.fromEntries(ENGINE_FILES(DRUMS).map((f) => [f, hashFile(path.join(root, f))])),
};
fs.writeFileSync(sourceManifestPath(root), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`engine:sync: app ${commit.slice(0, 7)}${dirty ? ' (engine has uncommitted changes)' : ''} → public/engine/`);
console.log(`  engine.wasm ${fs.statSync(path.join(out, 'engine.wasm')).size} bytes, imports: ${imports.join(', ') || 'none'}`);
if (dirty) console.log('  The app\'s engine is not committed: commit it there too, so source.json names a real commit.');
