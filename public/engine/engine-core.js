// Shared by the AudioWorklet (processor.js) and the export Worker (export-worker.js): loads
// the app's engine from engine.wasm and applies the page's commands to it.
//
// A command is [name, ...args]. The names are the engine's own (native_audio.cpp) and
// src/lib/appEngine/ops.ts types them; ARGS says how each argument crosses into wasm:
// i int, f float, s string (NUL-terminated ASCII in a scratch buffer), a Int32Array
// (copied in, followed by its length).

export const ARGS = {
  setBpm: ['wg_set_bpm', 'f'],
  setSwing: ['wg_set_swing', 'f'],
  setMeter: ['wg_set_meter', 'ii'],
  loopOnly: ['wg_loop_only', 'i'],
  beginArrangement: ['wg_begin_arrangement', 'i'],
  section: ['wg_section', 'iiii'],
  chord: ['wg_chord', 'iissii'],
  commitArrangement: ['wg_commit_arrangement', ''],
  setStep: ['wg_set_step', 'issii'],
  clearTrack: ['wg_clear_track', 'is'],
  setProgram: ['wg_set_program', 'isi'],
  setTimbre: ['wg_set_timbre', 'isi'],
  setNoteLength: ['wg_set_note_length', 'isf'],
  setDrumSound: ['wg_set_drum_sound', 'isi'],
  setSilence: ['wg_set_silence', 'isi'],
  setPatternBars: ['wg_set_pattern_bars', 'isi'],
  setFill: ['wg_set_fill', 'iiia'],
  voicing: ['wg_voicing', 'isii'],
  mixer: ['wg_mixer', 'sfi'],
  pan: ['wg_pan', 'sf'],
  reverb: ['wg_reverb', 'ff'],
  strip: ['wg_strip', 'sfffff'],
  metronome: ['wg_metronome', 'ififi'],
  start: ['wg_start', 'i'],
  stop: ['wg_stop', ''],
  previewClick: ['wg_preview_click', ''],
  previewChord: ['wg_preview_chord', 'iisis'],
  previewOff: ['wg_preview_off', 's'],
  previewDrum: ['wg_preview_drum', 'is'],
  resetLoad: ['wg_reset_load', ''],
};

const SCRATCH_SLOT = 64;
const SCRATCH_SLOTS = 4;

/**
 * Instantiates the engine. [wasi] supplies the WASI imports this host has: anything it
 * leaves out answers ENOSYS (52), which the engine never meets outside a file export.
 */
export async function createEngine(wasmBytes, wasi = {}) {
  let memory = null;
  const imports = new Proxy({}, {
    get(_, name) {
      if (name in wasi) return (...args) => wasi[name](memory, ...args);
      if (name === 'proc_exit') return (code) => { throw new Error(`engine exited (${code})`); };
      return () => 52;
    },
  });
  const { instance } = await WebAssembly.instantiate(wasmBytes, { wasi_snapshot_preview1: imports });
  const e = instance.exports;
  memory = e.memory;
  e._initialize();
  const scratch = e.wg_alloc(SCRATCH_SLOT * SCRATCH_SLOTS);

  const bytes = () => new Uint8Array(memory.buffer);
  const cstr = (slot, text) => {
    const at = scratch + slot * SCRATCH_SLOT;
    const view = bytes();
    const n = Math.min(text.length, SCRATCH_SLOT - 1);
    for (let i = 0; i < n; i++) view[at + i] = text.charCodeAt(i) & 0x7f;
    view[at + n] = 0;
    return at;
  };
  /** Copies [data] into a fresh allocation the engine will own (it frees it). */
  const give = (data) => {
    const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
    const ptr = e.wg_alloc(u8.byteLength);
    bytes().set(u8, ptr);
    return ptr;
  };

  return {
    exports: e,
    get memory() { return memory; },
    give,
    cstr,
    loadSoundFont(sf2) { return e.wg_load_soundfont(give(sf2), sf2.byteLength) === 1; },
    /** [kit]: [{ slot, gain, pcm }] — slots and gains from kit.json. */
    loadKit(kit) {
      let ok = 0;
      for (const { slot, gain, pcm } of kit) ok += e.wg_load_sample(slot, give(pcm), pcm.byteLength, gain);
      return ok;
    },
    /** Applies commands in order, synchronously: between two audio quanta, all or none. */
    apply(commands) {
      for (const command of commands) {
        const [name, ...args] = command;
        const spec = ARGS[name];
        if (!spec) throw new Error(`unknown engine command ${name}`);
        const [fn, kinds] = spec;
        const call = [];
        let strings = 0;
        const owned = [];
        for (let i = 0; i < kinds.length; i++) {
          const kind = kinds[i];
          const value = args[i];
          if (kind === 's') call.push(cstr(strings++, String(value)));
          else if (kind === 'a') {
            const ints = value instanceof Int32Array ? value : Int32Array.from(value);
            const ptr = e.wg_alloc(Math.max(4, ints.byteLength));
            new Int32Array(memory.buffer, ptr, ints.length).set(ints);
            owned.push(ptr);
            call.push(ptr, ints.length);
          } else if (kind === 'f') call.push(Number(value));
          else call.push(value | 0);
        }
        e[fn](...call);
        for (const ptr of owned) e.wg_free(ptr);
      }
    },
  };
}
