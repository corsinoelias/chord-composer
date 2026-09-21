import { WASI } from 'node:wasi';
import fs from 'node:fs';
import path from 'node:path';
const APP = 'C:/Users/Eliascorsino/Projects/chord_sequencer/assets';
const bpm = Number(process.argv[2] ?? 95);
const t0 = performance.now();
const wasi = new WASI({ version: 'preview1', preopens: { '/out': path.resolve('out') } });
const { instance } = await WebAssembly.instantiate(fs.readFileSync('engine.wasm'), wasi.getImportObject());
wasi.initialize(instance);
const e = instance.exports;
const put = (buf) => { const p = e.sp_alloc(buf.length); new Uint8Array(e.memory.buffer, p, buf.length).set(buf); return p; };
const t1 = performance.now();
const sf = fs.readFileSync(`${APP}/sf2/GeneralUser.sf2`);
const okSf = e.sp_load_soundfont(put(sf), sf.length);
const t2 = performance.now();
// slot = sound - kSampledFirst: kick 0, snare 1, stick 2, hat 3, hatopen 4, ..., crash 11
for (const [slot, file] of [[0,'kick'],[1,'snare'],[2,'stick'],[3,'hat'],[4,'hatopen'],[11,'crash']]) {
  const pcm = fs.readFileSync(`${APP}/drums/${file}.pcm`);
  e.sp_load_sample(slot, put(pcm), pcm.length, 1.0);
}
e.sp_demo_song(bpm);
const steps = 2 * 4 * 4 * 16;   // 2 sections x 4 loops x 4 chords x 16 steps
const t3 = performance.now();
const frames = e.sp_export(steps, 2.0);
const t4 = performance.now();
const seconds = frames / 48000;
console.log(JSON.stringify({
  wasmKB: Math.round(fs.statSync('engine.wasm').size / 1024),
  instantiateMs: Math.round(t1 - t0), soundfontOk: okSf, soundfontLoadMs: Math.round(t2 - t1),
  songSeconds: +seconds.toFixed(1), renderMs: Math.round(t4 - t3),
  realtimeX: +(seconds / ((t4 - t3) / 1000)).toFixed(1),
  msPer128FrameBlock: +(((t4 - t3) / (frames / 128))).toFixed(4),
  heapMB: Math.round(e.memory.buffer.byteLength / 1048576),
}));
