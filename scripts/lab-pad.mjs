#!/usr/bin/env node
/**
 * The pad lab: a held sound (a pad, strings, the wind) as the web plays it, against the same
 * song through the app's own SoundFont. The app's lab (tool/pad_lab/replay.mjs in the app repo)
 * plays what the *app* sends its engine through *its* SoundFont; this plays what the *web* sends
 * (songToEngine, the real one) through the SoundFont the web *ships*, and listens for what a
 * person heard go wrong on 2026-10-03: the Howling Winds cut off at every bar, because the
 * web's SoundFont had every tail cut to 0.12 s (sf2-subset.mjs) and the app's lets it ring into
 * the next note.
 *
 *   npm run dev
 *   node scripts/lab-pad.mjs [http://localhost:4321]
 *
 * Needs Chromium (playwright) to build the commands with the page's own modules, and the app
 * repo (CHORD_APP, default ../chord-sequencer-flutter-app) for GeneralUser.sf2; without it only
 * the checks that need no reference run. Writes nothing; exits 1 when a check fails.
 *
 * What it checks, per sound and per way of playing (the notes held, or 3 steps long as the web's
 * rhythms write them; one section looping, or two in turn):
 *   - the level over time, in 100 ms windows, is within TOLERANCE_DB of the app's, wherever
 *     the app's is audible: the same tail, the same swell, no gap at the bar line or where
 *     the section changes;
 *   - the sounds that do not hold (the grand piano) are still cut short: the 0.12 s cap was
 *     put there on purpose and must not go with the pad's.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = process.argv[2] ?? 'http://localhost:4321';
const app = process.env.CHORD_APP || path.resolve(root, '../chord-sequencer-flutter-app');
const reference = path.join(app, 'assets/sf2/GeneralUser.sf2');
const shipped = process.env.LAB_FONT || path.join(root, 'public/engine/sounds-full.sf2');

const RATE = 48000;
const BLOCK = 128;
const SECONDS = 24;
const WINDOW = 0.1;
const TOLERANCE_DB = 3;
/** Below this the reference is silence for a listener, and a difference there is not heard. */
const AUDIBLE_DB = -70;
const BPM = 66;

const scenarios = [];
for (const [track, sound, name] of [
  ['piano', 'gm:1530', 'Howling Winds'], ['piano', 'pad', 'Warm Pad'], ['piano', 'strings', 'Strings'],
  ['guitar', 'gm:1530', 'Howling Winds (guitar track)'], ['piano', 'organ', 'Organ'],
]) {
  for (const length of [3, 0]) {
    for (const parts of [1, 2]) {
      scenarios.push({ name: `${name}, ${length ? `${length}-step notes` : 'held'}, ${parts === 1 ? '1 section' : '2 sections'}`, track, sound, length, parts, holds: true });
    }
  }
}
scenarios.push({ name: 'Grand Piano, 3-step notes (still cut short)', track: 'piano', sound: 'grand', length: 3, parts: 1, holds: false });

// ── The commands: the page's own songToEngine ──
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`${base}/lab/app-engine/`, { waitUntil: 'load', timeout: 180000 });
const built = await page.evaluate(async ({ scenarios, bpm }) => {
  const { songToEngine } = await import('/src/lib/appEngine/fromSong.ts');
  const { MUSICAL_STYLES } = await import('/src/lib/styles.ts');
  const { getDefaultInstrumentStates } = await import('/src/lib/instruments.ts');
  const kits = (await (await fetch('/engine/kit.json')).json()).kits;
  const pop = MUSICAL_STYLES.find((s) => s.id === 'pop_1') ?? MUSICAL_STYLES[0];
  const zeros = Array(16).fill(0);
  // One note on the bar's first step, from the track the scenario tests, and nothing else.
  const styleFor = (track) => ({
    ...pop, melodic: undefined, arpeggios: undefined, fill: undefined, loopBars: 1, swing: 0,
    rhythm: Object.fromEntries(Object.keys(pop.rhythm).map((k) => [k, k === track ? [1, ...zeros.slice(1)] : zeros])),
  });
  return scenarios.map((sc) => {
    const style = styleFor(sc.track);
    const chord = (id) => ({ id, root: 'G', accidental: '', quality: 'maj', duration: 4 });
    const sections = Array.from({ length: sc.parts }, (_, i) => ({ id: `s${i}`, name: `S${i}`, chords: [chord(`c${i}`)], repeatCount: sc.parts === 1 ? 4 : 2 }));
    const instruments = getDefaultInstrumentStates().map((s) => ({
      ...s, volume: 1, muted: s.id !== sc.track, soundTypeId: s.id === sc.track ? sc.sound : s.soundTypeId,
    }));
    const song = { sections, bpm, instrumentSettings: instruments, noteLengths: { [sc.track]: sc.length }, metronomeEnabled: false };
    return songToEngine(song, style, () => style, kits).commands;
  });
}, { scenarios, bpm: BPM });
await browser.close();

// ── The engine, rendered faster than real time ──
const { createEngine } = await import(pathToFileURL(path.join(root, 'public/engine/engine-core.js')).href);
const wasm = fs.readFileSync(path.join(root, 'public/engine/engine.wasm'));

async function envelope(commands, soundFont) {
  const engine = await createEngine(wasm, {
    clock_time_get: (memory, _id, _p, out) => { new DataView(memory.buffer).setBigUint64(out, BigInt(Math.round(performance.now() * 1e6)), true); return 0; },
  });
  const e = engine.exports;
  e.wg_set_rate(RATE);
  engine.loadSoundFont(soundFont.buffer.slice(soundFont.byteOffset, soundFont.byteOffset + soundFont.byteLength));
  e.wg_open();
  engine.apply(commands);
  engine.apply([['start', 0, 0]]);
  const out = e.wg_alloc(BLOCK * 8);
  const per = Math.round(WINDOW * RATE / BLOCK);
  const levels = [];
  let sum = 0, n = 0;
  for (let b = 0; b < Math.floor(SECONDS * RATE / BLOCK); b++) {
    e.wg_render(out, BLOCK);
    for (const x of new Float32Array(engine.memory.buffer, out, BLOCK * 2)) sum += x * x;
    n += BLOCK * 2;
    if ((b + 1) % per === 0) { levels.push(10 * Math.log10(Math.max(sum / n, 1e-12))); sum = 0; n = 0; }
  }
  return levels;
}

const ship = fs.readFileSync(shipped);
const ref = fs.existsSync(reference) ? fs.readFileSync(reference) : null;
if (!ref) console.warn(`lab-pad: no ${reference}: only the checks that need no reference run (set CHORD_APP)`);

let failed = 0;
for (let k = 0; k < scenarios.length; k++) {
  const sc = scenarios[k];
  const web = await envelope(built[k], ship);
  let verdict = 'ok';
  let detail = '';
  if (sc.holds && ref) {
    const app = await envelope(built[k], ref);
    let worst = 0, at = 0;
    for (let i = 0; i < web.length; i++) {
      if (app[i] < AUDIBLE_DB) continue;
      const d = Math.abs(web[i] - app[i]);
      if (d > worst) { worst = d; at = i; }
    }
    detail = `worst ${worst.toFixed(1)} dB off the app's at ${(at * WINDOW).toFixed(1)} s (loudest window ${Math.max(...app).toFixed(0)} dB)`;
    if (worst > TOLERANCE_DB) verdict = 'FAIL';
  } else if (!sc.holds) {
    // A plucked note: 1.5 s after the 3-step note ends it must be far below its peak.
    const peak = Math.max(...web.slice(0, 20));
    const late = web[Math.round((3 * 60 / BPM / 4 + 1.5) / WINDOW)];
    detail = `${(late - peak).toFixed(0)} dB under its peak 1.5 s after the note`;
    if (late - peak > -40) verdict = 'FAIL';
  } else continue;
  if (verdict === 'FAIL') failed++;
  console.log(`${verdict.padEnd(4)} ${sc.name.padEnd(58)} ${detail}`);
}
console.log(failed ? `\nlab-pad: ${failed} of ${scenarios.length} scenarios failed` : '\nlab-pad: ok');
process.exit(failed ? 1 : 0);
