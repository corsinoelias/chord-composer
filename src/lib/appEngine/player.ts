/**
 * The chord player on the app's engine (phase 6 of docs/motor-unico-wasm.md), behind a
 * switch while it is compared with the web's own engine: `?engine=app` turns it on in this
 * browser, `?engine=web` turns it off again.
 *
 * PlaybackContext keeps its interface; this only changes who makes the sound. The song goes
 * to the engine as commands (fromSong.ts), and every edit made while it plays goes after it
 * the same way — tempo, click and mix on their own, anything else as the whole song again,
 * which the engine takes in on its next step without stopping.
 */
import { AppEngine, type EngineState } from './host';
import { songToEngine, type EngineSong, type SongInput } from './fromSong';
import { type EngineCommand } from './commands';
import { type StylePattern } from '../styles';
import { type StyleLookup } from '../sectionPlayback';

const STORAGE_KEY = 'chordplayer:engine';

/** Whether this browser plays songs on the app's engine. */
export function appEngineEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const asked = new URLSearchParams(window.location.search).get('engine');
    if (asked === 'app') localStorage.setItem(STORAGE_KEY, 'app');
    if (asked === 'web') localStorage.removeItem(STORAGE_KEY);
    if (asked) return asked === 'app';
    return localStorage.getItem(STORAGE_KEY) === 'app';
  } catch {
    return new URLSearchParams(window.location.search).get('engine') === 'app';
  }
}

/** Where the song is, in the web engine's terms. */
export interface AppPosition {
  /** The chord across the whole song, repeats counted: the web engine's chordIndex. */
  chordIndex: number;
  /** chordIndex plus how far through that chord, 0-1. */
  position: number;
  /** Step within the bar. */
  step: number;
}

export interface AppSong {
  song: SongInput;
  style: StylePattern;
  lookup: StyleLookup;
  loopingSectionIndex?: number | null;
}

let engine: Promise<AppEngine> | null = null;
/** The same engine once it has started, for reading its clock from an animation frame. */
let started: AppEngine | null = null;

/** The one engine for the page. Its AudioContext opens on the first call: make it from a tap. */
function getEngine(): Promise<AppEngine> {
  engine ??= AppEngine.start().then((e) => {
    started = e;
    // For the phone measurements in lab/app-engine/phone/, as the lab exposes __lab.
    (window as unknown as { __appEngine: AppEngine }).__appEngine = e;
    return e;
  }).catch((error) => {
    engine = null;
    throw error;
  });
  return engine;
}

export class AppPlayback {
  private built: EngineSong | null = null;
  private current: AppSong | null = null;
  private unsubscribe: (() => void) | null = null;
  private latest: EngineState | null = null;
  /** First chord of each section, repeats counted, for chordIndex. */
  private sectionStart: number[] = [];

  static preload(): void {
    AppEngine.preload().catch(() => { /* play() tries again */ });
  }

  /** Opens the engine ahead of play() — from a tap, such as the one that starts a count-in. */
  static warmup(): void {
    getEngine().catch(() => { /* play() tries again */ });
  }

  async play(input: AppSong): Promise<void> {
    const e = await getEngine();
    this.current = input;
    this.built = this.build(input, e);
    await e.ensureSlots(this.built.drumSlots);
    e.load(this.built.commands);
    e.send([['loopOnly', input.loopingSectionIndex ?? -1]]);
    this.unsubscribe?.();
    this.unsubscribe = e.subscribe((state) => { this.latest = state; });
    await e.play();
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.latest = null;
    this.current = null;
    engine?.then((e) => e.stop()).catch(() => {});
  }

  get active(): boolean {
    return this.current !== null;
  }

  /** The song changed while playing: sent again, heard from the engine's next step. */
  async update(input: AppSong): Promise<void> {
    if (!this.current) return;
    const e = await getEngine();
    this.current = input;
    this.built = this.build(input, e);
    await e.ensureSlots(this.built.drumSlots);
    e.send([...this.built.commands, ['loopOnly', input.loopingSectionIndex ?? -1]]);
  }

  /** Only the mix changed (a fader, mute or solo): the levels alone, so nothing is cut short. */
  async updateMix(input: AppSong): Promise<void> {
    if (!this.current) return;
    const e = await getEngine();
    this.current = input;
    const mix = this.build(input, e).commands.filter((c) => c[0] === 'mixer');
    e.send(mix);
  }

  send(commands: EngineCommand[]): void {
    if (this.current) engine?.then((e) => e.send(commands)).catch(() => {});
  }

  /** Where the song is now, or null before the engine has said. */
  position(): AppPosition | null {
    const state = this.latest;
    const built = this.built;
    if (!state || !built || !state.playing || state.countInBeats > 0) return null;
    const lengths = built.chordSteps[state.section];
    const sections = this.current?.song.sections ?? [];
    const chords = sections[state.section]?.chords.length ?? 0;
    if (!lengths || !chords) return null;
    const chordIndex = (this.sectionStart[state.section] ?? 0) + state.round * chords + Math.min(state.chord, chords - 1);
    // The state comes ~30 times a second; between two, the clock carries the playhead on.
    const now = started?.ctx.currentTime ?? null;
    const bpm = this.current?.song.bpm ?? 120;
    const stepSeconds = 60 / bpm / 4;
    const ahead = now !== null ? Math.max(0, Math.min(1, (now - state.time) / stepSeconds)) : 0;
    const length = lengths[Math.min(state.chord, lengths.length - 1)] || 1;
    const fraction = Math.min(1, (state.chordStep + ahead) / length);
    return { chordIndex, position: chordIndex + fraction, step: state.step };
  }

  private build(input: AppSong, e: AppEngine): EngineSong {
    const built = songToEngine(input.song, input.style, input.lookup, e.kits);
    let start = 0;
    this.sectionStart = input.song.sections.map((s) => {
      const at = start;
      start += Math.max(1, s.repeatCount) * s.chords.length;
      return at;
    });
    return built;
  }
}
