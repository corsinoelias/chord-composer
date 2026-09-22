#!/usr/bin/env node
/**
 * Writes the web's own recordings into the engine's SoundFont, as the programs the shared sound
 * list gives them (RECORDED_FIRST and up, src/lib/instruments.ts; docs/sonidos-comunes.md §7e).
 *
 *   node scripts/build-recordings.mjs public/engine/sounds.sf2
 *
 * Part of `npm run engine:sync`, right after the SoundFont is cut down to the list's programs.
 * The engine loads one font, so the recordings have to live in the same file as the app's
 * programs — five presets appended to it, in the pitch they really sound.
 *
 * The recordings are mp3, which Node cannot decode: a headless Chromium does it (the same one
 * the audition page used, /lab/sounds/), at REC_RATE through an OfflineAudioContext, which
 * resamples them on the way. 24 kHz and 2 s was the weight you chose in the audition: a
 * SoundFont holds its audio uncompressed, and the whole set comes to about 9,5 MB.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2] ?? path.join(root, 'public/engine/sounds.sf2');
/** What the audition settled on: enough for a bass or a guitar, at a third of the weight. */
const REC_RATE = 24000;
const REC_SECONDS = 2;
const RELEASE_SECONDS = 0.12;
/** The peak each set is brought to, so one recording is not heard louder than another of its own. */
const PEAK = 0.9;

/** Which files each recorded sound is made of, and the program the list gives it. */
const GUITAR_FILES = {
  acoustic: ['A2', 'A3', 'A4', 'As2', 'As3', 'As4', 'B2', 'B3', 'B4', 'C3', 'C4', 'C5', 'Cs3', 'Cs4', 'D3', 'D4', 'Ds3', 'Ds4', 'E2', 'E3', 'E4', 'F3', 'F4', 'Fs3', 'Fs4', 'G3', 'G4', 'Gs3', 'Gs4'],
  electric: ['A2', 'A3', 'A4', 'A5', 'C3', 'C4', 'C5', 'C6', 'Cs2', 'Ds3', 'Ds4', 'Ds5', 'E2', 'Fs2', 'Fs3', 'Fs4', 'Fs5'],
  nylon: ['A2', 'A3', 'A4', 'A5', 'As5', 'B1', 'B2', 'B3', 'B4', 'Cs3', 'Cs4', 'Cs5', 'D2', 'D3', 'D5', 'E2', 'E3', 'E4', 'E5', 'Fs2', 'Fs3', 'Fs4', 'Fs5', 'G3', 'G5', 'Gs2', 'Gs4', 'Gs5'],
};
const LETTER = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const noteMidi = (name) => {
  const m = name.match(/^([A-G])(s?)(\d)$/);
  return m ? (Number(m[3]) + 1) * 12 + LETTER[m[1]] + (m[2] ? 1 : 0) : NaN;
};
/**
 * The presets, in the order of the list. A bass file is named an octave above the note it
 * sounds (measured 2026-09-22: "A2" peaks at 110 Hz, an A1), so its true pitch is the label
 * less twelve — and every bass of the list then plays in one window.
 */
const PRESETS = [
  { name: 'Web Acoustic', program: 100, guitar: 'acoustic' },
  { name: 'Web Electric', program: 101, guitar: 'electric' },
  { name: 'Web Nylon', program: 102, guitar: 'nylon' },
  { name: 'Web Fender Bass', program: 103, bass: 'modo', everyNth: 2, semitones: -12 },
  { name: 'Web Slap Bass', program: 104, bass: 'slap', everyNth: 2, semitones: -12 },
];

// ── The files each preset is made of ──

const publicDir = path.join(root, 'public');
const jobs = [];
for (const preset of PRESETS) {
  if (preset.guitar) {
    jobs.push({
      ...preset,
      files: GUITAR_FILES[preset.guitar].map((f) => ({ url: `/audio/guitar/${preset.guitar}/${f}.mp3`, midi: noteMidi(f) })),
    });
    continue;
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(publicDir, 'audio/bass', preset.bass, 'manifest.json'), 'utf8'));
  const notes = manifest.notes ?? manifest;
  jobs.push({
    ...preset,
    files: Object.entries(notes)
      .filter((_, i) => i % (preset.everyNth ?? 1) === 0)
      .map(([label, note]) => ({ url: `/audio/bass/${preset.bass}/${note.file}`, midi: Number(label) + (preset.semitones ?? 0) })),
  });
}

// ── Decoding, in a browser ──

const server = http.createServer((req, res) => {
  const file = path.join(publicDir, decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(publicDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'content-type': 'audio/mpeg' }).end(fs.readFileSync(file));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`${base}/favicon.svg`).catch(() => page.goto('about:blank'));

for (const job of jobs) {
  process.stdout.write(`build-recordings: ${job.name} (${job.files.length} files)… `);
  const decoded = await page.evaluate(async ({ base, files, rate, seconds, peak }) => {
    const ctx = new OfflineAudioContext(1, 1, rate);
    const out = [];
    for (const f of files) {
      try {
        const buf = await ctx.decodeAudioData(await (await fetch(base + f.url)).arrayBuffer());
        const frames = Math.min(buf.length, Math.round(seconds * buf.sampleRate));
        const pcm = new Float32Array(frames);
        for (let ch = 0; ch < buf.numberOfChannels; ch++) {
          const data = buf.getChannelData(ch);
          for (let i = 0; i < frames; i++) pcm[i] += data[i] / buf.numberOfChannels;
        }
        // A recording cut short clicks; 50 ms of fade is the end of its own decay.
        const fade = Math.min(frames, Math.round(0.05 * buf.sampleRate));
        for (let i = 0; i < fade; i++) pcm[frames - 1 - i] *= i / fade;
        out.push({ midi: f.midi, rate: buf.sampleRate, pcm });
      } catch { /* a file that is not there is simply left out */ }
    }
    const loudest = Math.max(1e-6, ...out.map((s) => s.pcm.reduce((m, v) => Math.max(m, Math.abs(v)), 0)));
    // 16-bit, as the format keeps it, and the whole set brought to one peak.
    return out.map((s) => {
      const pcm = new Int16Array(s.pcm.length);
      for (let i = 0; i < pcm.length; i++) pcm[i] = Math.max(-32768, Math.min(32767, Math.round((s.pcm[i] * peak / loudest) * 32767)));
      return { midi: s.midi, rate: s.rate, pcm: [...new Uint8Array(pcm.buffer)] };
    });
  }, { base, files: job.files, rate: REC_RATE, seconds: REC_SECONDS, peak: PEAK });
  job.samples = decoded.map((s) => ({ midi: s.midi, rate: s.rate, pcm: Uint8Array.from(s.pcm) }));
  console.log(`${job.samples.length} samples, ${(job.samples.reduce((n, s) => n + s.pcm.length, 0) / 1e6).toFixed(1)} MB`);
  if (!job.samples.length) {
    console.error(`build-recordings: ${job.name} decoded nothing — are the recordings in public/audio?`);
    process.exit(1);
  }
}
await browser.close();
server.close();

// ── Writing them into the SoundFont ──

const file = fs.readFileSync(target);
const chunks = {};
const walk = (off, end) => {
  while (off < end) {
    const id = file.toString('ascii', off, off + 4);
    const size = file.readUInt32LE(off + 4);
    if (id === 'RIFF' || id === 'LIST') walk(off + 12, off + 8 + size);
    else chunks[id] = { off: off + 8, size };
    off += 8 + size + (size & 1);
  }
};
walk(0, file.length);
for (const id of ['phdr', 'pbag', 'pmod', 'pgen', 'inst', 'ibag', 'imod', 'igen', 'shdr', 'smpl']) {
  if (!chunks[id]) {
    console.error(`build-recordings: ${path.relative(root, target)} has no ${id} chunk`);
    process.exit(1);
  }
}
const records = (id, n) => {
  const { off, size } = chunks[id];
  return Array.from({ length: size / n }, (_, i) => Buffer.from(file.subarray(off + i * n, off + (i + 1) * n)));
};
// Every list ends with a terminal record (EOP, EOI, EOS, and one past the last bag/generator),
// which has to stay last: they come off, the new records go on, and they go back rewritten.
const phdr = records('phdr', 38); const phdrEnd = phdr.pop();
const pbag = records('pbag', 4); const pbagEnd = pbag.pop();
const pgen = records('pgen', 4); const pgenEnd = pgen.pop();
const pmod = records('pmod', 10); const pmodEnd = pmod.pop();
const inst = records('inst', 22); const instEnd = inst.pop();
const ibag = records('ibag', 4); const ibagEnd = ibag.pop();
const igen = records('igen', 4); const igenEnd = igen.pop();
const imod = records('imod', 10); const imodEnd = imod.pop();
const shdr = records('shdr', 46); const shdrEnd = shdr.pop();
const smpl = [Buffer.from(file.subarray(chunks.smpl.off, chunks.smpl.off + chunks.smpl.size))];

const GEN = { releaseVolEnv: 38, instrument: 41, keyRange: 43, sampleModes: 54, sampleID: 53 };
const gen = (op, value) => { const b = Buffer.alloc(4); b.writeUInt16LE(op, 0); b.writeUInt16LE(value, 2); return b; };
const genRange = (op, lo, hi) => { const b = Buffer.alloc(4); b.writeUInt16LE(op, 0); b.writeUInt8(lo, 2); b.writeUInt8(hi, 3); return b; };
const genSigned = (op, value) => { const b = Buffer.alloc(4); b.writeUInt16LE(op, 0); b.writeInt16LE(value, 2); return b; };
const name20 = (text) => { const b = Buffer.alloc(20); b.write(text.slice(0, 19), 'ascii'); return b; };
const release = Math.round(1200 * Math.log2(RELEASE_SECONDS));

let frames = chunks.smpl.size / 2;
for (const job of jobs) {
  const samples = [...job.samples].sort((a, b) => a.midi - b.midi);
  const instIndex = inst.length;
  const instRec = Buffer.alloc(22);
  name20(job.name).copy(instRec, 0);
  instRec.writeUInt16LE(ibag.length, 20);
  inst.push(instRec);
  samples.forEach((s, i) => {
    // Each recording covers the keys nearer to it than to its neighbours.
    const lo = i === 0 ? 0 : Math.floor((samples[i - 1].midi + s.midi) / 2) + 1;
    const hi = i === samples.length - 1 ? 127 : Math.floor((s.midi + samples[i + 1].midi) / 2);
    const bag = Buffer.alloc(4);
    bag.writeUInt16LE(igen.length, 0);
    bag.writeUInt16LE(imod.length, 2);
    ibag.push(bag);
    igen.push(genRange(GEN.keyRange, lo, hi), genSigned(GEN.releaseVolEnv, release), gen(GEN.sampleModes, 0), gen(GEN.sampleID, shdr.length));
    // The sample itself, and the 46 silent frames the format asks to follow it.
    const start = frames;
    smpl.push(s.pcm, Buffer.alloc(92));
    frames += s.pcm.length / 2 + 46;
    const head = Buffer.alloc(46);
    name20(`${job.name.slice(0, 12)} ${s.midi}`).copy(head, 0);
    head.writeUInt32LE(start, 20); head.writeUInt32LE(start + s.pcm.length / 2, 24);
    head.writeUInt32LE(start, 28); head.writeUInt32LE(start + s.pcm.length / 2, 32);
    head.writeUInt32LE(Math.round(s.rate), 36);
    head.writeUInt8(s.midi, 40); head.writeInt8(0, 41);
    head.writeUInt16LE(0, 42); head.writeUInt16LE(1, 44); // no link, sampleType 1 = mono
    shdr.push(head);
  });
  const preset = Buffer.alloc(38);
  name20(job.name).copy(preset, 0);
  preset.writeUInt16LE(job.program, 20); preset.writeUInt16LE(0, 22);
  preset.writeUInt16LE(pbag.length, 24);
  phdr.push(preset);
  const bag = Buffer.alloc(4);
  bag.writeUInt16LE(pgen.length, 0);
  bag.writeUInt16LE(pmod.length, 2);
  pbag.push(bag);
  pgen.push(gen(GEN.instrument, instIndex));
}
// The terminals again, pointing past the last record of each list.
phdrEnd.writeUInt16LE(pbag.length, 24); phdr.push(phdrEnd);
pbagEnd.writeUInt16LE(pgen.length, 0); pbagEnd.writeUInt16LE(pmod.length, 2); pbag.push(pbagEnd);
pgen.push(pgenEnd); pmod.push(pmodEnd);
instEnd.writeUInt16LE(ibag.length, 20); inst.push(instEnd);
ibagEnd.writeUInt16LE(igen.length, 0); ibagEnd.writeUInt16LE(imod.length, 2); ibag.push(ibagEnd);
igen.push(igenEnd); imod.push(imodEnd);
shdr.push(shdrEnd);

const chunk = (id, body) => {
  const head = Buffer.alloc(8);
  head.write(id, 0, 'ascii');
  head.writeUInt32LE(body.length, 4);
  return body.length & 1 ? Buffer.concat([head, body, Buffer.alloc(1)]) : Buffer.concat([head, body]);
};
const list = (type, ...parts) => chunk('LIST', Buffer.concat([Buffer.from(type, 'ascii'), ...parts]));
const infoList = (() => {
  // The INFO list as it came, so the font keeps its name and version.
  let off = 12;
  while (off < file.length) {
    const id = file.toString('ascii', off, off + 4);
    const size = file.readUInt32LE(off + 4);
    if (id === 'LIST' && file.toString('ascii', off + 8, off + 12) === 'INFO') return Buffer.from(file.subarray(off, off + 8 + size));
    off += 8 + size + (size & 1);
  }
  return null;
})();
if (!infoList) {
  console.error('build-recordings: the SoundFont has no INFO list');
  process.exit(1);
}
const out = chunk('RIFF', Buffer.concat([
  Buffer.from('sfbk', 'ascii'),
  infoList,
  list('sdta', chunk('smpl', Buffer.concat(smpl))),
  list('pdta',
    chunk('phdr', Buffer.concat(phdr)), chunk('pbag', Buffer.concat(pbag)),
    chunk('pmod', Buffer.concat(pmod)), chunk('pgen', Buffer.concat(pgen)),
    chunk('inst', Buffer.concat(inst)), chunk('ibag', Buffer.concat(ibag)),
    chunk('imod', Buffer.concat(imod)), chunk('igen', Buffer.concat(igen)),
    chunk('shdr', Buffer.concat(shdr))),
]));
fs.writeFileSync(target, out);
console.log(`build-recordings: ${jobs.length} recorded sounds → ${path.relative(root, target)} (${(out.length / 1e6).toFixed(2)} MB)`);
