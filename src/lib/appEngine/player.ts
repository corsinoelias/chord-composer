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

/**
 * The one engine for the page, kept on window rather than in this module: when the dev
 * server swaps this module in place (any edit under npm run dev), a module-level engine was
 * forgotten while its worklet went on playing, the next Play started a second one, and Stop
 * reached only the new one — two pianos, one of them never stopping (2026-09-22).
 */
const shared = (typeof window === 'undefined' ? {} : window) as unknown as { __appEnginePromise?: Promise<AppEngine> | null; __appEngine?: AppEngine };

/** Its AudioContext opens on the first call: make it from a tap. */
function getEngine(): Promise<AppEngine> {
  shared.__appEnginePromise ??= AppEngine.start().then((e) => {
    // Also what the phone measurements in lab/app-engine/phone/ read, as the lab's __lab.
    shared.__appEngine = e;
    return e;
  }).catch((error) => {
    shared.__appEnginePromise = null;
    throw error;
  });
  return shared.__appEnginePromise;
}
const engine = () => shared.__appEnginePromise ?? null;

export class AppPlayback {
  private built: EngineSong | null = null;
  private current: AppSong | null = null;
  private unsubscribe: (() => void) | null = null;
  private latest: EngineState | null = null;
  /** First chord of each section, repeats counted, for chordIndex. */
  private sectionStart: number[] = [];
  /** The song part of what was last sent (everything but the mixer), to spot a mix-only change. */
  private sentSong = '';

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
    this.sentSong = songPart(this.built.commands, input);
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
    engine()?.then((e) => e.stop()).catch(() => {});
  }

  get active(): boolean {
    return this.current !== null;
  }

  /**
   * Something changed while playing. Only what did is sent: the player reports every change
   * as a whole new set of options (a mute included), and a song sent again clears every
   * track — which is right for an edit and wrong for a fader.
   */
  async update(input: AppSong): Promise<void> {
    if (!this.current) return;
    const e = await getEngine();
    this.current = input;
    this.built = this.build(input, e);
    const mix = this.built.commands.filter((c) => c[0] === 'mixer');
    const song = songPart(this.built.commands, input);
    if (song === this.sentSong) {
      e.send(mix);
      return;
    }
    this.sentSong = song;
    await e.ensureSlots(this.built.drumSlots);
    // Clearing a track drops its voices without telling the SoundFont, whose notes then ring
    // on to their natural end — seconds, for the grand piano: a second piano under the
    // first. Letting them go first ends them the way a new chord would.
    e.send([
      ['previewOff', 'piano'], ['previewOff', 'guitar'], ['previewOff', 'bass'],
      ...this.built.commands,
      ['loopOnly', input.loopingSectionIndex ?? -1],
    ]);
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
    if (this.current) engine()?.then((e) => e.send(commands)).catch(() => {});
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
    const now = shared.__appEngine?.ctx.currentTime ?? null;
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

/** Everything [commands] say about the song itself, as text: what a mix change leaves alone. */
function songPart(commands: EngineCommand[], input: AppSong): string {
  return JSON.stringify([commands.filter((c) => c[0] !== 'mixer'), input.loopingSectionIndex ?? -1]);
}
