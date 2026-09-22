#!/usr/bin/env node
/**
 * Measures how loud each candidate of the sound audition actually is, and writes the gain that
 * evens them out: src/lib/appEngine/auditionGains.json (docs/sonidos-comunes.md §7c).
 *
 *   npm run dev            # or any dev server
 *   node scripts/measure-sound-gains.mjs [http://127.0.0.1:4321]
 *
 * Loudness is the energy between 90 Hz and 6 kHz, which is what a laptop or a phone actually
 * reproduces: a bass with a third of its energy under 90 Hz measures loud and is heard weak
 * (the GM Pick bass, 2026-09-22). Each sound is played through the engine with the same
 * pattern and the same fader, measured over four bars, and given the gain that brings it to
 * the median — the same idea as the app's per-recording drum gains (drum_gains.dart).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://127.0.0.1:4321';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'src/lib/appEngine/auditionGains.json');

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
await page.goto(`${base}/lab/sounds/`, { waitUntil: 'load', timeout: 180000 });
await page.click('#load');
await page.waitForFunction(() => /Listo/.test(document.getElementById('status').textContent), null, { timeout: 300000 });

const ids = await page.evaluate(async () => {
  const { CANDIDATES } = await import('/src/lib/appEngine/audition.ts');
  return CANDIDATES.filter((c) => c.track !== 'drums').map((c) => c.id);
});

const loudness = {};
for (const id of ids) {
  loudness[id] = await page.evaluate(async (id) => {
    const audition = window.__audition;
    const engine = id.startsWith('web') ? audition.webEngine : audition.gmEngine;
    if (!engine) return null;
    const analyser = engine.ctx.createAnalyser();
    analyser.fftSize = 4096;
    analyser.smoothingTimeConstant = 0;
    engine.node.connect(analyser);
    const bins = new Float32Array(analyser.frequencyBinCount);
    document.querySelector(`[data-play="${id}"]`).click();
    await new Promise((r) => setTimeout(r, 1000)); // past the first chord's attack
    const hz = engine.ctx.sampleRate / 2 / analyser.frequencyBinCount;
    let sum = 0, frames = 0;
    const began = performance.now();
    while (performance.now() - began < 5200) { // four bars at 92 BPM
      analyser.getFloatFrequencyData(bins);
      for (let i = 1; i < bins.length; i++) {
        const f = i * hz;
        if (f >= 90 && f <= 6000) sum += (10 ** (bins[i] / 20)) ** 2;
      }
      frames++;
      await new Promise((r) => setTimeout(r, 25));
    }
    audition.stop();
    analyser.disconnect();
    return 20 * Math.log10(Math.sqrt(sum / frames) + 1e-12);
  }, id);
  console.log(`${id.padEnd(14)} ${loudness[id] === null ? 'sin motor' : `${loudness[id].toFixed(1)} dB`}`);
}

const measured = Object.entries(loudness).filter(([, v]) => v !== null);
const sorted = measured.map(([, v]) => v).sort((a, b) => a - b);
const median = sorted[Math.floor(sorted.length / 2)];
// ±6 dB is enough to even out a catalogue and keeps a quiet sound from being pushed into noise.
const gains = Object.fromEntries(measured.map(([id, v]) => [id, Math.round(Math.max(-6, Math.min(6, median - v)) * 10) / 10]));
fs.writeFileSync(out, `${JSON.stringify({ note: 'Written by scripts/measure-sound-gains.mjs; dB to even out how loud each sound is heard.', median: Math.round(median * 10) / 10, gains }, null, 2)}\n`);
console.log(`\nmedian ${median.toFixed(1)} dB → ${path.relative(root, out)}`);
await browser.close();
