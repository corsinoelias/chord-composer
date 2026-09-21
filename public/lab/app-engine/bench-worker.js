// Benchmark: the same engine and song as the lab, rendered as fast as possible in a
// Worker, timing every 128-frame block with performance.now() — the high-resolution
// clock the AudioWorklet does not have. Says how much of a block's 2.67 ms deadline the
// engine really needs on this device, and how bad the worst blocks are.
const QUANTUM = 128;
const DRUM_SLOTS = { kick: 0, snare: 1, stick: 2, hat: 3, hatopen: 4, crash: 11 };

self.onmessage = async ({ data: { wasm, sf2, drums, seconds, style } }) => {
  let memory;
  const wasi = new Proxy({}, {
    get(_, name) {
      if (name === 'clock_time_get') {
        return (_id, _p, out) => {
          new DataView(memory.buffer).setBigUint64(out, BigInt(Math.round(performance.now() * 1e6)), true);
          return 0;
        };
      }
      return () => 52;
    },
  });
  const { instance } = await WebAssembly.instantiate(wasm, { wasi_snapshot_preview1: wasi });
  const e = instance.exports;
  memory = e.memory;
  e._initialize();
  e.wg_set_rate(48000);
  const put = (bytes) => {
    const ptr = e.wg_alloc(bytes.byteLength);
    new Uint8Array(memory.buffer, ptr, bytes.byteLength).set(new Uint8Array(bytes));
    return ptr;
  };
  e.wg_load_soundfont(put(sf2), sf2.byteLength);
  for (const [name, pcm] of Object.entries(drums)) e.wg_load_sample(DRUM_SLOTS[name], put(pcm), pcm.byteLength, 1.0);
  e.wg_demo_song(style);
  e.wg_metronome(0);
  e.wg_open();
  e.wg_start(0);
  const out = e.wg_alloc(QUANTUM * 2 * 4);
  const blocks = Math.round((seconds * 48000) / QUANTUM);
  const times = new Float64Array(blocks);
  const began = performance.now();
  for (let i = 0; i < blocks; i++) {
    const t = performance.now();
    e.wg_render(out, QUANTUM);
    times[i] = performance.now() - t;
  }
  const total = performance.now() - began;
  const sorted = Array.from(times).sort((a, b) => a - b);
  const budget = (QUANTUM / 48000) * 1000;
  self.postMessage({
    seconds,
    realtimeX: seconds / (total / 1000),
    meanMs: total / blocks,
    p50Ms: sorted[Math.floor(blocks * 0.5)],
    p99Ms: sorted[Math.floor(blocks * 0.99)],
    p999Ms: sorted[Math.floor(blocks * 0.999)],
    maxMs: sorted[blocks - 1],
    over50pct: sorted.filter((t) => t > budget * 0.5).length,
    overBudget: sorted.filter((t) => t > budget).length,
    budgetMs: budget,
    timerResolutionMs: sorted.find((t) => t > 0) ?? 0,
  });
};
