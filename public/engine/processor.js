// The app's audio engine on the browser's audio rendering thread.
//
// On the phone, AAudio calls the engine's data callback for every block of audio; here the
// AudioWorklet does, 128 frames at a time. The sequencer lives inside that callback, which
// is the point: nothing on the page's main thread — React, scrolling, garbage collection, a
// hidden tab's throttled timers — can make a note late.
//
// The page talks to it by message (src/lib/appEngine/host.ts). Commands are applied between
// quanta on this same thread, a batch at a time, so a song is never half-updated when the
// next block renders. What the page needs to draw — position, notes sounding and struck,
// drum hits, levels — comes back about 30 times a second.
import { createEngine } from './engine-core.js';

const QUANTUM = 128;
const NOTE_WORDS = 3;   // kNoteWords: notes from MIDI 24 upward, 32 per word
const TRACKS = 3;       // piano, guitar, bass

class EngineProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.engine = null;
    this.pending = [];
    this.blocks = 0;
    this.stateEvery = Math.max(1, Math.round(sampleRate / QUANTUM / 30));
    this.struck = new Int32Array(TRACKS * NOTE_WORDS);
    this.drumStruck = 0;
    // Dropouts heard while the song plays: blocks of true silence after its first half
    // second. The page reports them; a healthy engine never has any.
    this.playedBlocks = 0;
    this.dropMs = 0;
    this.dropRun = 0;
    this.dropLongestMs = 0;
    // Flight recorder: [wall ms, audio time, peak, position] every quarter second, kept on
    // this thread so it records while the page is frozen or hidden.
    this.recordEvery = Math.round(sampleRate / QUANTUM / 4);
    this.history = [];
    this.peak = 0;
    this.port.onmessage = ({ data }) => this.receive(data).catch((error) => {
      this.port.postMessage({ type: 'error', message: String((error && error.message) || error) });
    });
  }

  async receive(msg) {
    if (msg.type === 'init') return this.init(msg);
    if (!this.engine) {
      if (msg.type === 'ops' || msg.type === 'kit') this.pending.push(msg);
      return;
    }
    const e = this.engine.exports;
    switch (msg.type) {
      case 'ops': this.engine.apply(msg.ops); break;
      case 'kit': this.engine.loadKit(msg.kit); break;
      case 'dump': this.port.postMessage({ type: 'history', id: msg.id, history: this.history }); break;
      case 'clearHistory': this.history = []; break;
      case 'resetDrops': this.dropMs = 0; this.dropLongestMs = 0; break;
      case 'bench': {
        // Blocks rendered back to back on this thread, timed as a whole: the worklet's only
        // clock is Date.now(), whole milliseconds against a 2.67 ms block.
        const hasPerf = typeof performance !== 'undefined' && typeof performance.now === 'function';
        const now = hasPerf ? () => performance.now() : () => Date.now();
        const scratch = e.wg_alloc(QUANTUM * 2 * 4);
        const wasPlaying = e.wg_playing();
        if (!wasPlaying) e.wg_start(0);
        const began = now();
        for (let i = 0; i < msg.blocks; i++) e.wg_render(scratch, QUANTUM);
        const ms = now() - began;
        if (!wasPlaying) e.wg_stop();
        e.wg_free(scratch);
        this.port.postMessage({ type: 'bench', id: msg.id, blocks: msg.blocks, ms, perBlockMs: ms / msg.blocks, budgetMs: (QUANTUM / sampleRate) * 1000 });
        break;
      }
    }
  }

  async init({ wasm, sf2, kit }) {
    const engine = await createEngine(wasm, {
      clock_time_get: (memory, _id, _precision, out) => {
        new DataView(memory.buffer).setBigUint64(out, BigInt(Date.now()) * 1000000n, true);
        return 0;
      },
    });
    const e = engine.exports;
    e.wg_set_rate(sampleRate);
    const fontOk = engine.loadSoundFont(sf2);
    const drums = engine.loadKit(kit || []);
    e.wg_open();
    this.out = e.wg_alloc(QUANTUM * 2 * 4);
    this.view = null;
    this.engine = engine;
    for (const msg of this.pending) await this.receive(msg);
    this.pending = [];
    this.port.postMessage({ type: 'ready', rate: sampleRate, fontOk, drums });
  }

  process(_inputs, outputs) {
    if (!this.engine) return true;
    const e = this.engine.exports;
    const left = outputs[0][0];
    const right = outputs[0][1] || left;
    e.wg_render(this.out, QUANTUM);
    const memory = this.engine.memory;
    // Memory can grow (a SoundFont loading); a view over the old buffer would be empty.
    if (!this.view || this.view.buffer !== memory.buffer) this.view = new Float32Array(memory.buffer, this.out, QUANTUM * 2);
    const v = this.view;
    let block = 0;
    for (let i = 0; i < QUANTUM; i++) {
      left[i] = v[2 * i];
      right[i] = v[2 * i + 1];
      const a = left[i] < 0 ? -left[i] : left[i];
      if (a > block) block = a;
    }
    if (block > this.peak) this.peak = block;

    const playing = e.wg_playing() === 1;
    const blockMs = (QUANTUM / sampleRate) * 1000;
    if (playing) {
      if (++this.playedBlocks > sampleRate / QUANTUM / 2 && block < 0.0005) {
        this.dropMs += blockMs;
        this.dropRun += blockMs;
        if (this.dropRun > this.dropLongestMs) this.dropLongestMs = this.dropRun;
      } else this.dropRun = 0;
    } else {
      this.playedBlocks = 0;
      this.dropRun = 0;
    }

    this.blocks++;
    if (this.blocks % this.recordEvery === 0) {
      if (this.history.length < 4800) this.history.push([Date.now(), Math.round(currentTime * 100) / 100, Math.round(this.peak * 100) / 100, e.wg_position_lo()]);
      this.peak = 0;
    }
    // Struck notes are cleared when read, so they are gathered every block and sent in
    // the next state message; otherwise a note struck and released between two messages
    // would never reach the page.
    for (let t = 0; t < TRACKS; t++) for (let w = 0; w < NOTE_WORDS; w++) this.struck[t * NOTE_WORDS + w] |= e.wg_struck(t, w);
    this.drumStruck |= e.wg_drum_struck();

    if (this.blocks % this.stateEvery === 0) {
      const sounding = new Int32Array(TRACKS * NOTE_WORDS);
      for (let t = 0; t < TRACKS; t++) for (let w = 0; w < NOTE_WORDS; w++) sounding[t * NOTE_WORDS + w] = e.wg_sounding(t, w);
      this.port.postMessage({
        type: 'state',
        time: currentTime,
        playing,
        positionLo: e.wg_position_lo(),
        positionHi: e.wg_position_hi(),
        sounding,
        struck: this.struck.slice(),
        drumStruck: this.drumStruck,
        levels: [0, 1, 2, 3, 4].map((bus) => e.wg_level(bus)),
        reductions: [0, 1, 2, 3].map((bus) => e.wg_gain_reduction(bus)),
        dropMs: this.dropMs,
        dropLongestMs: this.dropLongestMs,
      });
      this.struck.fill(0);
      this.drumStruck = 0;
    }
    return true;
  }
}

registerProcessor('app-engine', EngineProcessor);
