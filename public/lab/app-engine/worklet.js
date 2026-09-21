// The app's audio engine, running on the browser's audio rendering thread.
//
// On the phone, AAudio calls the engine's data callback for every block of audio; here
// the AudioWorklet does, 128 frames at a time, through wg_render(). The sequencer lives
// inside that callback — which is the whole point: nothing on the page's main thread
// (React, scrolling, garbage collection, a hidden tab's throttled timers) can make a
// note late.
//
// Control messages from the page are applied between quanta, on this same thread, so
// the engine's "platform thread" and its "callback" never run at the same time.

const QUANTUM = 128;
const DRUM_SLOTS = { kick: 0, snare: 1, stick: 2, hat: 3, hatopen: 4, crash: 11 };

class AppEngineProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ready = false;
    this.blocks = 0;
    this.statusEvery = Math.round(sampleRate / QUANTUM / 20); // ~20 status messages a second
    // Flight recorder: every quarter second, the loudest sample and where the song was.
    // Kept here on the audio thread, so it records while the page is frozen or hidden.
    this.recordEvery = Math.round(sampleRate / QUANTUM / 4);
    this.history = [];
    this.peak = 0;
    this.silentBlocks = 0;
    this.run = 0;
    this.longestRun = 0;
    // Dropouts heard while the song plays: blocks of true silence after its first beat.
    this.playedBlocks = 0;
    this.dropMs = 0;
    this.dropRun = 0;
    this.dropLongestMs = 0;
    this.port.onmessage = (event) => this.onMessage(event.data).catch((error) => {
      this.port.postMessage({ type: 'error', message: String(error && error.message || error) });
    });
  }

  async onMessage(msg) {
    if (msg.type === 'init') return this.init(msg);
    if (!this.ready) return;
    const e = this.exports;
    switch (msg.type) {
      case 'play': e.wg_start(msg.countIn || 0); break;
      case 'stop': e.wg_stop(); break;
      case 'bpm': e.wg_set_bpm(msg.value); break;
      case 'song': {
        // Setting up a song parks the transport; a switch mid-play should keep playing.
        const wasPlaying = e.wg_playing();
        e.wg_demo_song(msg.value);
        if (wasPlaying) e.wg_start(0);
        break;
      }
      case 'loop': e.wg_loop_only(msg.value); break;
      case 'metronome': e.wg_metronome(msg.value ? 1 : 0); break;
      case 'mute': e.wg_mixer(msg.track, msg.volume ?? 0.9, msg.value ? 1 : 0); break;
      case 'reverb': e.wg_reverb(0.5, msg.value); break;
      case 'resetLoad': this.dropMs = 0; this.dropLongestMs = 0; break;
      case 'dump': this.port.postMessage({ type: 'history', history: this.history }); break;
      case 'clearHistory': this.history = []; break;
      case 'bench': {
        // Renders blocks back to back on this thread (the audio thread's own core), timing
        // the whole run — long enough that Date.now()'s millisecond steps stop mattering.
        const hasPerf = typeof performance !== 'undefined' && typeof performance.now === 'function';
        const now = hasPerf ? () => performance.now() : () => Date.now();
        const scratch = e.wg_alloc(QUANTUM * 2 * 4);
        const wasPlaying = e.wg_playing();
        if (!wasPlaying) e.wg_start(0);
        const began = now();
        for (let i = 0; i < msg.blocks; i++) e.wg_render(scratch, QUANTUM);
        const ms = now() - began;
        if (!wasPlaying) e.wg_stop();
        this.port.postMessage({ type: 'bench', hasPerf, blocks: msg.blocks, ms, perBlockMs: ms / msg.blocks });
        break;
      }
    }
  }

  async init({ wasm, sf2, drums }) {
    const self = this;
    // The engine asks the host for one thing: the time, for its own load meter. The
    // worklet has no performance.now(), so it gets Date.now() — millisecond steps, which
    // is why the page measures load itself as well (averaged, it is unbiased).
    const wasi = new Proxy({}, {
      get(_, name) {
        if (name === 'clock_time_get') {
          return (_id, _precision, out) => {
            new DataView(self.memory.buffer).setBigUint64(out, BigInt(Date.now()) * 1000000n, true);
            return 0;
          };
        }
        return () => 52; // ENOSYS: nothing else is ever called
      },
    });
    const { instance } = await WebAssembly.instantiate(wasm, { wasi_snapshot_preview1: wasi });
    this.exports = instance.exports;
    this.memory = instance.exports.memory;
    const e = this.exports;
    e._initialize();
    e.wg_set_rate(sampleRate);

    const put = (bytes) => {
      const ptr = e.wg_alloc(bytes.byteLength);
      new Uint8Array(this.memory.buffer, ptr, bytes.byteLength).set(new Uint8Array(bytes));
      return ptr;
    };
    const fontOk = e.wg_load_soundfont(put(sf2), sf2.byteLength);
    for (const [name, pcm] of Object.entries(drums)) {
      e.wg_load_sample(DRUM_SLOTS[name], put(pcm), pcm.byteLength, 1.0);
    }
    e.wg_demo_song(0);
    e.wg_metronome(0);
    e.wg_open();
    this.out = e.wg_alloc(QUANTUM * 2 * 4);
    this.view = null;
    this.ready = true;
    this.port.postMessage({ type: 'ready', fontOk: !!fontOk, rate: sampleRate });
  }

  process(_inputs, outputs) {
    if (!this.ready) return true;
    const left = outputs[0][0];
    const right = outputs[0][1] || left;
    // No per-block timing here: the worklet's only clock is Date.now(), in whole
    // milliseconds against a 2.67 ms block, and it read 10x too high on a Pixel 8 Pro.
    // The 'bench' message measures the real cost instead.
    this.exports.wg_render(this.out, QUANTUM);
    // Memory can grow (a SoundFont loading); a view over the old buffer would be empty.
    if (!this.view || this.view.buffer !== this.memory.buffer) {
      this.view = new Float32Array(this.memory.buffer, this.out, QUANTUM * 2);
    }
    const v = this.view;
    let block = 0;
    for (let i = 0; i < QUANTUM; i++) {
      left[i] = v[2 * i];
      right[i] = v[2 * i + 1];
      const a = left[i] < 0 ? -left[i] : left[i];
      if (a > block) block = a;
    }
    if (block > this.peak) this.peak = block;
    // A block in true silence while the song plays is the signature of a dropout.
    if (block < 0.0005) { this.silentBlocks++; this.run++; if (this.run > this.longestRun) this.longestRun = this.run; } else this.run = 0;
    const blockMs = (QUANTUM / sampleRate) * 1000;
    if (this.exports.wg_playing()) {
      // The first half second is the song starting, not a dropout.
      if (++this.playedBlocks > sampleRate / QUANTUM / 2 && block < 0.0005) {
        this.dropMs += blockMs;
        this.dropRun += blockMs;
        if (this.dropRun > this.dropLongestMs) this.dropLongestMs = this.dropRun;
      } else this.dropRun = 0;
    } else {
      this.playedBlocks = 0;
      this.dropRun = 0;
    }
    if (this.blocks % this.recordEvery === 0) {
      if (this.history.length < 4800) this.history.push([Date.now(), Math.round(currentTime * 100) / 100, Math.round(this.peak * 100) / 100, this.exports.wg_position(), this.silentBlocks, this.longestRun]);
      this.peak = 0; this.silentBlocks = 0; this.longestRun = this.run;
    }
    if (++this.blocks % this.statusEvery === 0) {
      const e = this.exports;
      this.port.postMessage({
        type: 'status',
        position: e.wg_position(),
        playing: !!e.wg_playing(),
        // Share of each block's deadline the engine used, averaged since the last reset.
        dropMs: this.dropMs,
        dropLongestMs: this.dropLongestMs,
        blocks: this.blocks,
      });
    }
    return true;
  }
}

registerProcessor('app-engine', AppEngineProcessor);
