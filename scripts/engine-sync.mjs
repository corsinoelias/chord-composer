#!/usr/bin/env node
/**
 * Brings the Android app's audio engine into the web, and builds it.
 *
 *   npm run engine:sync              everything below
 *   npm run engine:sync -- --sounds  only the sounds (the SoundFonts, kit, recommended list):
 *                                    the engine stays as it is, so no wasi-sdk is needed
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
 * General MIDI programs (bank 0) the web ships: every program the shared sound list names
 * (shared/catalog/sounds.json, docs/sonidos-comunes.md §7e), so every sound it offers plays.
 * The web's own recordings are not in there — they are written in afterwards, at programs
 * from RECORDED_FIRST up (build-recordings.mjs).
 */
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'shared/catalog/sounds.json'), 'utf8'));
const RECORDED_FIRST = 100;
const PROGRAMS = [...new Set(['piano', 'guitar', 'bass', 'synth'].flatMap((track) =>
  (catalog[track]?.sounds ?? []).map((sound) => sound.program),
).filter((program) => Number.isInteger(program) && program < RECORDED_FIRST))].sort((a, b) => a - b);
/**
 * The General MIDI percussion kits: the Standard one (bank 128, preset 0), whose notes the
 * hand percussion rows — congas, bongos, timbales, güiro… — play, and the others the app
 * offers for the drums (soundFontKits in its constants.dart): Room, Power, Electronic,
 * 808/909, Dance, Jazz, Brush, Orchestral. Every font the web loads carries them.
 */
const PERCUSSION_KIT = [0, 8, 16, 24, 25, 26, 32, 40, 48].map((kit) => `128:${kit}`).join(',');
/**
 * The whole font, for "All sounds…": every melodic preset of the app's GeneralUser.sf2 and
 * its variations, loaded only when that list is opened (or a song asks for a sound the
 * short font does not have). The recordings take programs RECORDED_FIRST… of bank 0, so the
 * General MIDI presets there are left out rather than have two presets answer to one number.
 */
const RECORDED_PROGRAMS = [100, 101, 102, 103, 104];
/**
 * The sounds the app recommends (recommendedSounds in its constants.dart), [program, name] in
 * its order: they head every track's lists on both sides. Those at the programs the web's
 * recordings take are not the web's to offer. They are not added to the short font: all of
 * them would put 8 MB on every visit (2026-09-30), and one the short font lacks loads the
 * whole font when it is picked, as "All sounds…" does.
 */
const RECOMMENDED = [...(fs.readFileSync(path.join(app, 'lib/core/music/constants.dart'), 'utf8')
  .match(/const recommendedSounds = <int, String>\{([\s\S]*?)\n\};/)?.[1] ?? '')
  .matchAll(/(\d+):\s*'((?:[^'\\]|\\.)*)'/g)]
  .map((m) => [Number(m[1]), m[2].replace(/\\'/g, "'")])
  .filter(([program]) => !RECORDED_PROGRAMS.includes(program));
const FULL = ['all', PERCUSSION_KIT, ...RECORDED_PROGRAMS.map((p) => `-${p}`)].join(',');
/**
 * The longest a web note takes to die away once let go, in seconds. The app's SoundFont lets
 * go slowly (its grand piano 1.5-8.6 s, clean guitar 0.8, pick bass 0.5); the web's own
 * sounds stop within 0.04-0.3 s of a note's end, and with the app's tails every track rang on
 * under the next chord (2026-09-22). Only the web's copy is cut; the app keeps its own.
 * The presets that hold their note (pads, strings, organs, winds, leads, brass: the engine's
 * own rule, sf2-subset.mjs) are not cut: their tail is the sound, and a pad of 3-step notes
 * that dies in 0.12 s leaves a silence in every bar where the app's tail runs into the next
 * note (2026-10-03).
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

const soundsOnly = process.argv.includes('--sounds');
const cppDir = path.join(app, 'android/app/src/main/cpp');
if (!fs.existsSync(path.join(cppDir, 'native_audio.cpp'))) fail(`no app engine at ${cppDir} (set CHORD_APP)`);
const clang = path.join(wasiSdk, 'bin', process.platform === 'win32' ? 'clang++.exe' : 'clang++');
if (!soundsOnly && !fs.existsSync(clang)) fail(`no wasi-sdk at ${wasiSdk} (set WASI_SDK; https://github.com/WebAssembly/wasi-sdk/releases)`);

const git = (...args) => execFileSync('git', ['-C', app, ...args]).toString().trim();
const out = path.join(root, 'public/engine');
const vendor = path.join(root, 'engine/vendor');
let commit, dirty, imports = [];
if (soundsOnly) {
  ({ commit, dirtyEngine: dirty } = JSON.parse(fs.readFileSync(sourceManifestPath(root), 'utf8')).app);
  fs.mkdirSync(path.join(out, 'drums'), { recursive: true });
} else {
  // 1. The engine, byte for byte.
  fs.mkdirSync(vendor, { recursive: true });
  for (const file of ['native_audio.cpp', 'tsf.h']) fs.copyFileSync(path.join(cppDir, file), path.join(vendor, file));

  commit = git('rev-parse', 'HEAD');
  dirty = git('status', '--porcelain', '--', 'android/app/src/main/cpp') !== '';

  // 2. Compile.
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
  imports = WebAssembly.Module.imports(new WebAssembly.Module(fs.readFileSync(path.join(out, 'engine.wasm'))))
    .map((i) => `${i.module}.${i.name}`);
  const unexpected = imports.filter((i) => !ALLOWED_IMPORTS.has(i));
  if (unexpected.length) fail(`engine.wasm imports ${unexpected.join(', ')}, which public/engine/processor.js and export-worker.js do not provide`);
}

// 3. Sounds: the SoundFont's programs, and then the web's own recordings written into the
// same file (one font is all the engine loads).
execFileSync(process.execPath, [
  path.join(root, 'scripts/sf2-subset.mjs'), path.join(app, 'assets/sf2/GeneralUser.sf2'),
  path.join(out, 'sounds.sf2'), [...PROGRAMS, PERCUSSION_KIT].join(','), String(RELEASE_SECONDS),
], { stdio: 'inherit' });
execFileSync(process.execPath, [path.join(root, 'scripts/build-recordings.mjs'), path.join(out, 'sounds.sf2')], { stdio: 'inherit' });
execFileSync(process.execPath, [
  path.join(root, 'scripts/sf2-subset.mjs'), path.join(app, 'assets/sf2/GeneralUser.sf2'),
  path.join(out, 'sounds-full.sf2'), FULL, String(RELEASE_SECONDS),
], { stdio: 'inherit' });
execFileSync(process.execPath, [path.join(root, 'scripts/build-recordings.mjs'), path.join(out, 'sounds-full.sf2')], { stdio: 'inherit' });
// The full font's melodic presets by name, keyed by program as the engine takes it (the
// General MIDI number plus 128 × the bank): the "All sounds…" list, readable without the font.
fs.writeFileSync(path.join(out, 'presets.json'), `${JSON.stringify(presetsOf(path.join(out, 'sounds-full.sf2')))}
`);
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
// The recommended sounds, bundled with the page (src/lib/soundFamilies.ts): the short lists
// name them before any font has loaded.
if (RECOMMENDED.length < 50) fail(`read only ${RECOMMENDED.length} recommended sounds from the app`);
fs.writeFileSync(path.join(root, 'src/data/recommendedSounds.json'), `${JSON.stringify(RECOMMENDED)}\n`);

/** [program, name] for every instrument of [file] — its kits (banks 120 and 128) are not — by program. */
function presetsOf(file) {
  const b = fs.readFileSync(file);
  let off = 12;
  const find = (id, from, end) => {
    while (from < end) {
      const cid = b.toString('ascii', from, from + 4);
      const size = b.readUInt32LE(from + 4);
      if (cid === id) return { at: from + 8, size };
      if (cid === 'LIST') {
        const inner = find(id, from + 12, from + 8 + size);
        if (inner) return inner;
      }
      from += 8 + size + (size & 1);
    }
    return null;
  };
  const phdr = find('phdr', off, b.length);
  const list = [];
  for (let at = phdr.at; at + 38 <= phdr.at + phdr.size - 38; at += 38) {
    const bank = b.readUInt16LE(at + 22);
    if (bank >= 120) continue;
    const name = b.toString('latin1', at, at + 20).split(String.fromCharCode(0))[0].trim();
    list.push([bank * 128 + b.readUInt16LE(at + 20), name]);
  }
  return list.sort((x, y) => x[0] - y[0]);
}

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
