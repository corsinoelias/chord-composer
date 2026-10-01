/**
 * The app's audio engine, as the web's pages use it.
 *
 * The engine itself runs in an AudioWorklet (public/engine/processor.js), where its
 * sequencer is clocked by the audio thread like it is on the phone. This class is the
 * page's side: it loads the engine and its sounds, sends commands in batches, keeps the
 * latest state the worklet reports, and renders files in a Worker with the same engine.
 *
 *   const engine = await AppEngine.start();
 *   engine.send(demoSong(0).commands);
 *   engine.play();
 *   engine.subscribe((state) => draw(state));
 *
 * Asset URLs carry the hash engine:sync recorded, so browsers can keep them for good and
 * still never run a stale engine.
 */
import manifest from '../../../engine/source.json';
import { TRANSIENT, type EngineCommand } from './commands';

const QUANTUM = 128;
const ENGINE_RATE = 48000; // the recordings' rate; the context runs at it so drums keep pitch

export interface KitEntry { slot: number; name: string; gain: number }
/** One of the app's kits: the drum sound id each piece plays (drumKits in constants.dart). */
export interface DrumKit { name: string; rows: Record<string, number> }
interface KitFile { samples: KitEntry[]; kits: DrumKit[] }

export interface EngineState {
  /** AudioContext time the state was taken at. */
  time: number;
  playing: boolean;
  step: number;
  chord: number;
  /** Which time round the section is on (0-based). */
  round: number;
  section: number;
  bar: number;
  countInBeats: number;
  /** Step within the sounding chord. */
  chordStep: number;
  /** A fill asked for with the Fill-in button: 0 none, 1 waiting for the next bar, 2 sounding. */
  fillByHand: number;
  /** Whether this bar is one the fill plays over — by hand, at the end of a part or on a phrase. */
  fillBar: boolean;
  /** MIDI notes each melodic track is holding: piano, guitar, bass, synth. */
  sounding: [number[], number[], number[], number[]];
  /** MIDI notes each melodic track struck since the last state. */
  struck: [number[], number[], number[], number[]];
  /** Rows of the kit struck since the last state: bit n for DRUM_ROWS[n]. */
  drumStruck: number;
  /** The same rows, where the hit was a hard one. */
  drumStruckHard: number;
  /** Held peaks: drums, piano, guitar, bass, synth, master (linear 0-1). */
  levels: number[];
  /** Compressor gain reduction per bus (drums, piano, guitar, bass, synth), dB. */
  reductions: number[];
  /** Silence heard while the song played: a healthy engine stays at 0. */
  dropMs: number;
  dropLongestMs: number;
}

export interface ExportResult { blob: Blob; frames: number; ms: number }

const version = (file: string) => (manifest.files as Record<string, string>)[file]?.slice(0, 10) ?? manifest.syncedAt;
const url = (file: string) => `/${file.replace(/^public\//, '')}?v=${version(file)}`;
/**
 * The engine's JavaScript, with the engine's version: the glue reads each command's arguments
 * the way this engine.wasm takes them, so a copy of it kept from an older engine must not run.
 */
const engineCode = (file: string) => `/engine/${file}?v=${version('public/engine/engine.wasm')}`;

const NOTE_FLOOR = 24;
const NOTE_WORDS = 3;
function notesOf(words: Int32Array | number[], track: number): number[] {
  const notes: number[] = [];
  for (let w = 0; w < NOTE_WORDS; w++) {
    const word = words[track * NOTE_WORDS + w] >>> 0;
    if (!word) continue;
    for (let bit = 0; bit < 32; bit++) if (word & (1 << bit)) notes.push(NOTE_FLOOR + w * 32 + bit);
  }
  return notes;
}

let assetCache: Promise<{ wasm: ArrayBuffer; sf2: ArrayBuffer; kit: KitEntry[]; kits: DrumKit[] }> | null = null;
let fullFontCache: Promise<ArrayBuffer> | null = null;
let presetCache: Promise<[number, string][]> | null = null;
/**
 * Whether the page moved the engine to the whole SoundFont. From then on every engine this
 * page starts, and every export, uses it: a song given a sound only it has must sound the
 * same in the file.
 */
let usingFullFont = false;

function loadFullFont(): Promise<ArrayBuffer> {
  fullFontCache ??= fetch(url('public/engine/sounds-full.sf2')).then((r) => {
    if (!r.ok) throw new Error(`sounds-full.sf2: ${r.status}`);
    return r.arrayBuffer();
  });
  return fullFontCache;
}

/**
 * Every melodic instrument of the whole SoundFont, [program, name], by program: the General
 * MIDI number plus 128 × the bank, as the engine takes it. Read from a small list, so the
 * names are there before the font itself has downloaded.
 */
export function soundFontPresets(): Promise<[number, string][]> {
  presetCache ??= fetch(url('public/engine/presets.json')).then((r) => {
    if (!r.ok) throw new Error(`presets.json: ${r.status}`);
    return r.json() as Promise<[number, string][]>;
  });
  return presetCache;
}

/** The programs the short font has; any other needs the whole one. */
export const SHORT_FONT_PROGRAMS = new Set<number>((manifest as { programs?: number[] }).programs ?? []);
const pcmCache = new Map<number, Promise<ArrayBuffer>>();

function loadAssets() {
  assetCache ??= (async () => {
    const get = async (file: string) => {
      const response = await fetch(url(file));
      if (!response.ok) throw new Error(`${file}: ${response.status}`);
      return response.arrayBuffer();
    };
    const [wasm, sf2, kitText] = await Promise.all([
      get('public/engine/engine.wasm'),
      get('public/engine/sounds.sf2'),
      fetch(url('public/engine/kit.json')).then((r) => r.json() as Promise<KitFile>),
    ]);
    return { wasm, sf2, kit: kitText.samples, kits: kitText.kits };
  })();
  return assetCache;
}

function loadPcm(entry: KitEntry): Promise<ArrayBuffer> {
  let pending = pcmCache.get(entry.slot);
  if (!pending) {
    pending = fetch(url(`public/engine/drums/${entry.name}.pcm`)).then((r) => {
      if (!r.ok) throw new Error(`${entry.name}.pcm: ${r.status}`);
      return r.arrayBuffer();
    });
    pcmCache.set(entry.slot, pending);
  }
  return pending;
}

/** The acoustic kit every song starts with (slots 0-11) and the count-in cowbell (36). */
export const DEFAULT_SLOTS = [...Array(12).keys(), 36];

export class AppEngine {
  readonly ctx: AudioContext;
  readonly node: AudioWorkletNode;
  readonly rate: number;
  state: EngineState | null = null;
  /** The app's drum kits (kit.json), by the index the sound catalog names them with. */
  readonly kits: DrumKit[];
  private readonly kit: KitEntry[];
  private readonly loadedSlots = new Set<number>();
  private readonly listeners = new Set<(state: EngineState) => void>();
  private readonly replies = new Map<number, (data: unknown) => void>();
  private nextId = 1;
  private queue: EngineCommand[] = [];
  private flushScheduled = false;
  /** Everything that describes the song and the mix, in order: what an export replays. */
  private journal: EngineCommand[] = [];

  private constructor(ctx: AudioContext, node: AudioWorkletNode, kit: KitEntry[], kits: DrumKit[], rate: number) {
    this.ctx = ctx;
    this.node = node;
    this.kit = kit;
    this.kits = kits;
    this.rate = rate;
    node.port.onmessage = ({ data }) => this.receive(data);
  }

  /**
   * Opens a 48 kHz AudioContext and loads the engine into it. Call from a user gesture
   * (a tap on Play) so the context may start; [slots] are the kit's recordings to load
   * up front — more can follow with ensureSlots().
   */
  /** [sf2]: another SoundFont than the web's (the sound audition in the lab); the engine loads one per start. */
  static async start({ slots = DEFAULT_SLOTS, ctx, sf2: ownSf2 }: { slots?: number[]; ctx?: AudioContext; sf2?: ArrayBuffer } = {}): Promise<AppEngine> {
    const context = ctx ?? new AudioContext({ sampleRate: ENGINE_RATE, latencyHint: 'interactive' });
    const [assets] = await Promise.all([
      loadAssets(),
      context.audioWorklet.addModule(engineCode('engine-core.js')).then(() => context.audioWorklet.addModule(engineCode('processor.js'))),
    ]);
    const entries = assets.kit.filter((k) => slots.includes(k.slot));
    const pcm = await Promise.all(entries.map(loadPcm));
    const node = new AudioWorkletNode(context, 'app-engine', { numberOfInputs: 0, outputChannelCount: [2] });
    node.connect(context.destination);
    const ready = new Promise<{ rate: number; fontOk: boolean }>((resolve, reject) => {
      node.port.onmessage = ({ data }) => {
        if (data.type === 'ready') resolve(data);
        else if (data.type === 'error') reject(new Error(data.message));
      };
    });
    // Copies go to the worklet (transferred, so they leave this thread); the originals stay
    // cached here for the export Worker and the next engine.
    const kit = entries.map((k, i) => ({ slot: k.slot, gain: k.gain, pcm: pcm[i].slice(0) }));
    const wasm = assets.wasm.slice(0);
    const sf2 = (ownSf2 ?? (usingFullFont ? await loadFullFont() : assets.sf2)).slice(0);
    node.port.postMessage({ type: 'init', wasm, sf2, kit }, [wasm, sf2, ...kit.map((k) => k.pcm)]);
    const info = await ready;
    if (!info.fontOk) throw new Error('the engine could not read its SoundFont');
    const engine = new AppEngine(context, node, assets.kit, assets.kits, info.rate);
    entries.forEach((k) => engine.loadedSlots.add(k.slot));
    return engine;
  }

  /** Fetches the engine and its sounds ahead of a first play, without opening any audio. */
  static preload(): Promise<void> {
    return loadAssets().then(() => undefined);
  }

  /**
   * Moves this engine to the whole SoundFont (downloading it the first time), so a sound
   * from "All sounds…" plays. Resolves once the engine is playing from it.
   */
  async useFullSoundFont(): Promise<void> {
    if (this.fullFont) return this.fullFont;
    this.fullFont = (async () => {
      const sf2 = (await loadFullFont()).slice(0);
      const reply = await this.ask({ type: 'font', sf2 }, [sf2]) as { ok: boolean };
      if (!reply.ok) throw new Error('the engine could not read the whole SoundFont');
      usingFullFont = true;
    })();
    this.fullFont.catch(() => { this.fullFont = null; });
    return this.fullFont;
  }

  private fullFont: Promise<void> | null = null;

  /** Loads more of the kit's recordings (slot numbers from kit.json), once each. */
  async ensureSlots(slots: number[]): Promise<void> {
    const missing = this.kit.filter((k) => slots.includes(k.slot) && !this.loadedSlots.has(k.slot));
    if (!missing.length) return;
    missing.forEach((k) => this.loadedSlots.add(k.slot));
    const pcm = await Promise.all(missing.map(loadPcm));
    const kit = missing.map((k, i) => ({ slot: k.slot, gain: k.gain, pcm: pcm[i].slice(0) }));
    this.node.port.postMessage({ type: 'kit', kit }, kit.map((k) => k.pcm));
  }

  /**
   * Queues commands; everything sent in the same task reaches the audio thread as one
   * batch, applied between two quanta.
   */
  send(commands: EngineCommand[]): void {
    for (const command of commands) {
      this.queue.push(command);
      if (!TRANSIENT.has(command[0])) this.journal.push(command);
    }
    if (!this.flushScheduled) {
      this.flushScheduled = true;
      queueMicrotask(() => this.flush());
    }
  }

  /** Starts a new song: forgets the journal of the last one, then sends [commands]. */
  load(commands: EngineCommand[]): void {
    this.journal = this.journal.filter((c) => c[0] === 'mixer' || c[0] === 'pan' || c[0] === 'reverb' || c[0] === 'strip' || c[0] === 'metronome');
    this.send([['stop'], ...commands]);
  }

  async play(countInBeats = 0, riseSeconds = 0): Promise<void> {
    if (this.ctx.state !== 'running') await this.ctx.resume();
    this.send([['start', countInBeats, riseSeconds]]);
  }

  stop(): void {
    this.send([['stop']]);
  }

  subscribe(listener: (state: EngineState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** How much of each block's deadline the engine needs, measured on the audio thread. */
  bench(blocks = 3000): Promise<{ perBlockMs: number; budgetMs: number; load: number }> {
    return this.ask({ type: 'bench', blocks }).then((d) => {
      const data = d as { perBlockMs: number; budgetMs: number };
      return { ...data, load: data.perBlockMs / data.budgetMs };
    });
  }

  /** The worklet's flight recorder: [wall ms, audio time, peak, position] per quarter second. */
  history(): Promise<number[][]> {
    return this.ask({ type: 'dump' }).then((d) => (d as { history: number[][] }).history);
  }

  resetDrops(): void {
    this.node.port.postMessage({ type: 'resetDrops' });
  }

  /**
   * Renders the current song (everything sent since load()) to a WAV, with the same engine
   * in a Worker: faster than real time, and the same signal path as what you hear.
   */
  async exportWav(steps: number, tailSeconds = 4): Promise<ExportResult> {
    return exportCommandsWav(this.journal, steps, tailSeconds, [...this.loadedSlots]);
  }

  async dispose(): Promise<void> {
    this.node.disconnect();
    this.listeners.clear();
    await this.ctx.close();
  }

  private flush(): void {
    this.flushScheduled = false;
    if (!this.queue.length) return;
    const ops = this.queue;
    this.queue = [];
    this.node.port.postMessage({ type: 'ops', ops });
  }

  private ask(message: Record<string, unknown>, transfer: Transferable[] = []): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.replies.set(id, resolve);
      this.node.port.postMessage({ ...message, id }, transfer);
    });
  }

  private receive(data: { type: string; id?: number; message?: string } & Record<string, unknown>): void {
    if (data.type === 'state') {
      const lo = data.positionLo as number;
      const sounding = data.sounding as Int32Array;
      const struck = data.struck as Int32Array;
      this.state = {
        time: data.time as number,
        playing: data.playing as boolean,
        step: lo & 0xff,
        chord: (lo >> 8) & 0x1f,
        round: (lo >> 13) & 0x7,
        section: (lo >> 16) & 0xff,
        bar: (lo >> 24) & 0xf,
        countInBeats: (lo >> 28) & 0x7,
        chordStep: (data.positionHi as number) & 0xffff,
        fillByHand: ((data.positionHi as number) >> 16) & 0x3,
        fillBar: (((data.positionHi as number) >> 18) & 1) === 1,
        sounding: [notesOf(sounding, 0), notesOf(sounding, 1), notesOf(sounding, 2), notesOf(sounding, 3)],
        struck: [notesOf(struck, 0), notesOf(struck, 1), notesOf(struck, 2), notesOf(struck, 3)],
        drumStruck: data.drumStruck as number,
        drumStruckHard: data.drumStruckHi as number,
        levels: data.levels as number[],
        reductions: data.reductions as number[],
        dropMs: data.dropMs as number,
        dropLongestMs: data.dropLongestMs as number,
      };
      for (const listener of this.listeners) listener(this.state);
      return;
    }
    if (data.type === 'error') {
      console.error('[app engine]', data.message);
      return;
    }
    if (data.id !== undefined && this.replies.has(data.id)) {
      this.replies.get(data.id)!(data);
      this.replies.delete(data.id);
    }
  }
}

/** The app's drum kits, as kit.json lists them, without opening any audio. */
export async function loadKits(): Promise<DrumKit[]> {
  return (await loadAssets()).kits;
}

/**
 * Renders [commands] to a WAV with the engine in a Worker: no AudioContext, nothing playing
 * needed. [slots] are the kit recordings the song uses (EngineSong.drumSlots).
 */
export async function exportCommandsWav(commands: EngineCommand[], steps: number, tailSeconds: number, slots: number[], fullFont = false): Promise<ExportResult> {
  const assets = await loadAssets();
  const entries = assets.kit.filter((k) => slots.includes(k.slot));
  const pcm = await Promise.all(entries.map(loadPcm));
  const kit = entries.map((k, i) => ({ slot: k.slot, gain: k.gain, pcm: pcm[i].slice(0) }));
  const wasm = assets.wasm.slice(0);
  const sf2 = (usingFullFont || fullFont ? await loadFullFont() : assets.sf2).slice(0);
  const worker = new Worker(engineCode('export-worker.js'), { type: 'module' });
  try {
    const result = await new Promise<{ wav: Uint8Array<ArrayBuffer>; frames: number; ms: number }>((resolve, reject) => {
      worker.onmessage = ({ data }) => (data.error ? reject(new Error(data.error)) : resolve(data));
      worker.onerror = (event) => reject(new Error(event.message || 'export worker failed'));
      worker.postMessage(
        { id: 1, wasm, sf2, kit, commands, steps, tailSeconds },
        [wasm, sf2, ...kit.map((k) => k.pcm)],
      );
    });
    return { blob: new Blob([result.wav], { type: 'audio/wav' }), frames: result.frames, ms: result.ms };
  } finally {
    worker.terminate();
  }
}

export { QUANTUM };
