/**
 * Decodes the web's acoustic kit (public/audio/drums/*.mp3, the "standard" sound 288 of
 * 300 saved songs use) into WAV sources for the Flutter app's drum pipeline, so the app
 * can play the same recordings instead of its own kit (docs/plan-paridad-web-app.md,
 * phase 4).
 *
 *   node scripts/export-drums-for-app.mjs [path/to/chord_sequencer]
 *   (then, in the app: dart run tool/drums/build.dart)
 *
 * Decoded by Chromium's own decodeAudioData — the same decoder the web plays them with —
 * at 44.1 kHz, mixed to mono. Levels are left raw: the app's manifest keeps the web's
 * balance between pieces (see webTrim in tool/drums/manifest.dart).
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = process.argv[2] ?? join(process.env.USERPROFILE ?? process.env.HOME ?? '.', 'Projects', 'chord_sequencer');
const OUT = join(APP, 'tool', 'drums', 'sources');

/** Web file → app asset name. The piece each one plays in the web's standard kit. */
const FILES = {
  'kick.mp3': 'web_kick',
  'snare-drum.mp3': 'web_snare',
  'snare-stick.mp3': 'web_stick',
  'hihat.mp3': 'web_hat',
  'hihat-open.mp3': 'web_hatopen',
  // The web prefers the second pedal recording when it has it (playDrumHit).
  'hihat-foot-2.mp3': 'web_hatfoot',
  'tom1.mp3': 'web_tom1',
  'tom2.mp3': 'web_tom2',
  'floor-tom.mp3': 'web_floortom',
  'ride.mp3': 'web_ride',
  'crash.mp3': 'web_crash',
};

function wav(samples, rate) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 32767))), i * 2));
  const head = Buffer.alloc(44);
  head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVE', 8);
  head.write('fmt ', 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22);
  head.writeUInt32LE(rate, 24); head.writeUInt32LE(rate * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34);
  head.write('data', 36); head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

const browser = await chromium.launch();
const page = await browser.newPage();
mkdirSync(OUT, { recursive: true });
for (const [file, asset] of Object.entries(FILES)) {
  const bytes = readFileSync(join(ROOT, 'public', 'audio', 'drums', file)).toString('base64');
  const mono = await page.evaluate(async (b64) => {
    const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const ctx = new OfflineAudioContext(1, 1, 44100);
    const buf = await ctx.decodeAudioData(raw.buffer);
    const out = new Float32Array(buf.length);
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const ch = buf.getChannelData(c);
      for (let i = 0; i < ch.length; i++) out[i] += ch[i] / buf.numberOfChannels;
    }
    return Array.from(out);
  }, bytes);
  writeFileSync(join(OUT, `${asset}.wav`), wav(mono, 44100));
  console.log(`${file.padEnd(18)} → ${asset}.wav  ${(mono.length / 44100).toFixed(2)} s`);
}
await browser.close();
