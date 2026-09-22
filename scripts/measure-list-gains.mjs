#!/usr/bin/env node
/**
 * Measures every sound of the shared list *as the player plays it* and writes the gain that
 * puts it at the level of its track's reference sound: src/lib/soundGains.json
 * (docs/sonidos-comunes.md §7d, §7f).
 *
 *   npm run dev
 *   node scripts/measure-list-gains.mjs http://localhost:4321
 *
 * It replaces the numbers the sound audition produced (auditionGains.json): those came from
 * /lab/sounds/, with its own fragment, its own register and a SoundFont built in the browser
 * at another rate — close, but the recorded Fender bass still landed 3,5 dB under the pick
 * bass in the player (2026-09-22). This plays the real song through the real engine with the
 * SoundFont the site ships, one sound at a time, and measures the energy between 90 Hz and
 * 6 kHz, which is the band a laptop or a phone actually reproduces.
 *
 * Two passes: the first measures, the second checks what the new gains did.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'src/lib/soundGains.json');
const base = process.argv[2] ?? 'http://localhost:4321';
/** Louder than this and a sound is being pushed into a different instrument, not levelled. */
const LIMIT = 9;

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();

async function sweep() {
  await page.goto(`${base}/lab/app-engine/`, { waitUntil: 'load', timeout: 180000 });
  return page.evaluate(async () => {
    const { INSTRUMENTS, getDefaultInstrumentStates, soundGainDb } = await import('/src/lib/instruments.ts');
    const { AppPlayback } = await import('/src/lib/appEngine/player.ts');
    const { MUSICAL_STYLES } = await import('/src/lib/styles.ts');
    const style = MUSICAL_STYLES.find((s) => s.id === 'pop_1') ?? MUSICAL_STYLES[0];
    const chords = ['C', 'A', 'F', 'G'].map((root, i) => ({ id: `c${i}`, root, accidental: '', quality: i === 1 ? 'min' : 'maj', duration: 4 }));
    const sections = [{ id: 's1', name: 'A', chords, repeatCount: 1 }];
    const playback = new AppPlayback();
    const rows = [];
    for (const inst of INSTRUMENTS) {
      if (inst.id === 'drums') continue; // the kits come levelled from the app (drum_gains.dart)
      for (const sound of inst.soundTypes) {
        const instruments = getDefaultInstrumentStates().map((s) => ({
          ...s, volume: 1, muted: s.id !== inst.id, soundTypeId: s.id === inst.id ? sound.id : s.soundTypeId,
        }));
        await playback.play({ song: { sections, bpm: 92, instrumentSettings: instruments }, style, lookup: () => style });
        const e = window.__appEngine;
        const analyser = e.ctx.createAnalyser();
        analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0;
        e.node.connect(analyser);
        const bins = new Float32Array(analyser.frequencyBinCount);
        await new Promise((r) => setTimeout(r, 900)); // past the first chord's attack
        const hz = e.ctx.sampleRate / 2 / analyser.frequencyBinCount;
        let sum = 0, frames = 0;
        const began = performance.now();
        while (performance.now() - began < 2600) { // two bars at 92 BPM
          analyser.getFloatFrequencyData(bins);
          for (let i = 1; i < bins.length; i++) { const f = i * hz; if (f >= 90 && f <= 6000) sum += (10 ** (bins[i] / 20)) ** 2; }
          frames++;
          await new Promise((r) => setTimeout(r, 25));
        }
        playback.stop();
        analyser.disconnect();
        rows.push({ track: inst.id, id: sound.id, gainDb: soundGainDb(inst.id, sound.id), db: 20 * Math.log10(Math.sqrt(sum / frames) + 1e-12) });
        await new Promise((r) => setTimeout(r, 120));
      }
    }
    return rows;
  });
}

const reference = JSON.parse(fs.readFileSync(out, 'utf8')).reference;
const first = await sweep();
const gains = {};
for (const track of [...new Set(first.map((r) => r.track))]) {
  const rows = first.filter((r) => r.track === track);
  const ref = rows.find((r) => r.id === reference[track]);
  if (!ref) continue;
  for (const row of rows) {
    // What it is turned up or down by now, plus how far it lands from the reference sound.
    const next = row.gainDb + (ref.db - row.db);
    gains[`${track}.${row.id}`] = Math.round(Math.max(-LIMIT, Math.min(LIMIT, next)) * 10) / 10;
  }
}
fs.writeFileSync(out, `${JSON.stringify({
  note: 'Written by scripts/measure-list-gains.mjs; dB that put each sound at the level of its track\'s reference sound.',
  reference,
  gains,
}, null, 2)}\n`);
console.log(`\n${Object.keys(gains).length} sounds → ${path.relative(root, out)}`);

// Second pass: with the new gains in place, how far is each sound from its reference now?
await page.waitForTimeout(3000); // the dev server picks the file up
const second = await sweep();
for (const track of [...new Set(second.map((r) => r.track))]) {
  const rows = second.filter((r) => r.track === track);
  const ref = rows.find((r) => r.id === reference[track]);
  const worst = rows.map((r) => ({ id: r.id, off: r.db - (ref?.db ?? 0) })).sort((a, b) => Math.abs(b.off) - Math.abs(a.off))[0];
  console.log(`${track.padEnd(7)} within ${Math.abs(worst.off).toFixed(1)} dB (worst: ${worst.id} ${worst.off > 0 ? '+' : ''}${worst.off.toFixed(1)})`);
}
await browser.close();
