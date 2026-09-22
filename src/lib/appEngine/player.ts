/**
 * The chord player on the app's engine (docs/motor-unico-wasm.md), the only engine the web
 * has since 2026-09-22.
 *
 * PlaybackContext keeps its interface; this only changes who makes the sound. The song goes
 * to the engine as commands (fromSong.ts), and every edit made while it plays goes after it
 * the same way — tempo, click and mix on their own, anything else as the whole song again,
 * which the engine takes in on its next step without stopping.
 */
import { AppEngine, exportCommandsWav, loadKits, type EngineState } from './host';
import { songToEngine, type EngineSong, type SongInput } from './fromSong';
import { type EngineCommand } from './commands';
import { effectsCommands } from './effects';
import { type StylePattern, getSlotsPerBar } from '../styles';
import { createSection, type Section } from '../sections';
import { type StyleLookup } from '../sectionPlayback';

/** Sections a song may use (fromSong.ts MAX_SECTIONS): a single pass puts its silent bar next. */
const SONG_SECTIONS = 30;

/** Where the song is, in the web engine's terms. */
export interface AppPosition {
  /** The chord across the whole song, repeats counted: the web engine's chordIndex. */
  chordIndex: number;
  /** chordIndex plus how far through that chord, 0-1. */
  position: number;
  /** Step within the bar. */
  step: number;
}

/** A span of the vocal recording, in seconds. */
export interface AudioRange { startSec: number; endSec: number }

/**
 * The song's vocal reference recording, played beside the engine as the web engine plays
 * it: one span for the whole song, restarted at its top, or one span per section, restarted
 * on every pass through it and cut at the pass's end.
 */
export interface AppVocal {
  buffer: AudioBuffer;
  wholeRange?: AudioRange;
  /** By Section.id. */
  sectionRanges?: Record<string, AudioRange>;
  /** Read on every state: muted by the player (or because the song is transposed), and level. */
  muted: () => boolean;
  volume: () => number;
}

export interface AppSong {
  song: SongInput;
  style: StylePattern;
  lookup: StyleLookup;
  loopingSectionIndex?: number | null;
  /** Play the song through once, then stop and call onEnded (the web engine's loop: false). */
  once?: boolean;
  onEnded?: () => void;
  vocal?: AppVocal;
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

/** The page's engine, started on the first call (make it from a tap): for previews and the mixer. */
export const getAppEngine = getEngine;
/** The engine if it has started already, without starting it. */
export const startedAppEngine = (): AppEngine | null => shared.__appEngine ?? null;

export class AppPlayback {
  private built: EngineSong | null = null;
  private current: AppSong | null = null;
  private unsubscribe: (() => void) | null = null;
  private latest: EngineState | null = null;
  /** First chord of each section, repeats counted, for chordIndex. */
  private sectionStart: number[] = [];
  /** The song part of what was last sent (everything but the mixer), to spot a mix-only change. */
  private sentSong = '';
  /** In a single pass, the silent section after the song: reaching it is the end. */
  private tailIndex = -1;
  private vocalSource: AudioBufferSourceNode | null = null;
  private vocalGain: GainNode | null = null;
  /** Which pass the vocal was last started for, so each pass starts it once. */
  private vocalPass: string | null = null;

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
    // The mixer's effects go after the song, which starts dry.
    e.load([...this.built.commands, ...effectsCommands()]);
    this.sentSong = songPart(this.built.commands, input);
    e.send([['loopOnly', input.loopingSectionIndex ?? -1]]);
    this.unsubscribe?.();
    this.stopVocal();
    this.vocalPass = null;
    this.unsubscribe = e.subscribe((state) => {
      this.latest = state;
      this.followVocal(state);
      if (this.current?.once && state.playing && state.section === this.tailIndex) {
        const ended = this.current.onEnded;
        this.stop();
        ended?.();
      }
    });
    await e.play();
  }

  stop(): void {
    this.stopVocal();
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.latest = null;
    this.current = null;
    engine()?.then((e) => e.stop()).catch(() => {});
  }

  /** Stops following the engine without stopping it: another player on the page has taken it over. */
  detach(): void {
    this.stopVocal();
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.latest = null;
    this.current = null;
  }

  get active(): boolean {
    return this.current !== null;
  }

  /** What the engine last reported while this plays, or null. */
  get state(): EngineState | null {
    return this.current ? this.latest : null;
  }

  /**
   * Something changed while playing. Only what did is sent: the player reports every change
   * as a whole new set of options (a mute included), and a song sent again clears every
   * track — which is right for an edit and wrong for a fader.
   */
  async update(input: AppSong): Promise<void> {
    if (!this.current) return;
    // How it plays (once, and what to do after) is the play() call's, not the options'.
    input = { ...input, once: this.current.once, onEnded: this.current.onEnded, vocal: this.current.vocal };
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
      ...effectsCommands(),
      ['loopOnly', input.loopingSectionIndex ?? -1],
    ]);
  }

  /** Only the mix changed (a fader, mute or solo): the levels alone, so nothing is cut short. */
  async updateMix(input: AppSong): Promise<void> {
    if (!this.current) return;
    // How it plays (once, and what to do after) is the play() call's, not the options'.
    input = { ...input, once: this.current.once, onEnded: this.current.onEnded, vocal: this.current.vocal };
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

  /** Starts the vocal's span when a new pass begins, and keeps its level with the player's. */
  private followVocal(state: EngineState): void {
    const vocal = this.current?.vocal;
    const ctx = shared.__appEngine?.ctx;
    if (!vocal || !ctx || !this.current || !this.built || !state.playing || state.countInBeats > 0) return;
    if (this.vocalGain) {
      const level = vocal.muted() ? 0 : vocal.volume();
      if (Math.abs(this.vocalGain.gain.value - level) > 0.001) this.vocalGain.gain.setTargetAtTime(level, ctx.currentTime, 0.02);
    }
    const whole = !!vocal.wholeRange;
    const pass = whole ? (state.section === 0 && state.round === 0 ? 'top' : 'rest') : `${state.section}:${state.round}`;
    if (pass === this.vocalPass) return;
    this.vocalPass = pass;
    if (whole && pass !== 'top') return;
    this.stopVocal();
    const range = whole ? vocal.wholeRange : vocal.sectionRanges?.[this.current.song.sections[state.section]?.id ?? ''];
    if (!range) return;
    // Where this pass began, on the audio clock: the state is a few milliseconds behind the
    // sound, and starting the span that much further in keeps the voice on the beat.
    const stepSeconds = 60 / this.current.song.bpm / 4;
    const lengths = this.built.chordSteps[state.section] ?? [];
    let elapsed = state.chordStep;
    for (let i = 0; i < state.chord && i < lengths.length; i++) elapsed += lengths[i];
    const passStart = state.time - elapsed * stepSeconds;
    const when = Math.max(ctx.currentTime, passStart);
    const offset = range.startSec + (when - passStart);
    let duration = range.endSec - offset;
    if (!whole) duration = Math.min(duration, passStart + lengths.reduce((a, b) => a + b, 0) * stepSeconds - when);
    if (duration <= 0 || offset >= vocal.buffer.duration) return;
    const source = new AudioBufferSourceNode(ctx, { buffer: vocal.buffer });
    const gain = new GainNode(ctx, { gain: vocal.muted() ? 0 : vocal.volume() });
    source.connect(gain).connect(ctx.destination);
    source.start(when, offset, duration);
    this.vocalSource = source;
    this.vocalGain = gain;
  }

  private stopVocal(): void {
    try { this.vocalSource?.stop(); } catch { /* not started, or already over */ }
    this.vocalSource?.disconnect();
    this.vocalGain?.disconnect();
    this.vocalSource = null;
    this.vocalGain = null;
  }

  private build(input: AppSong, e: AppEngine): EngineSong {
    // The engine always goes round again, so a single pass ends on a bar of silence: the
    // state reaches the page ~30 times a second, and by the time it says the song is over
    // the next thing sounding must be nothing, not the top of the song.
    const played = input.song.sections.slice(0, SONG_SECTIONS);
    this.tailIndex = input.once ? played.length : -1;
    const song = input.once ? { ...input.song, sections: [...played, silentBar(input.style)] } : input.song;
    const built = songToEngine(song, input.style, input.lookup, e.kits);
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

/**
 * [input] rendered to a WAV by the app's engine, as it sounds when played: what the export
 * button gives once the player is on this engine, so the file is what was heard. The mix is
 * the song's; a count-in or click never goes into a file.
 */
export async function exportSongWav(input: Pick<AppSong, 'song' | 'style' | 'lookup'>, tailSeconds = 2): Promise<Blob> {
  const built = songToEngine(input.song, input.style, input.lookup, await loadKits());
  const slots = [...new Set([...built.drumSlots, ...Array.from({ length: 12 }, (_, i) => i)])];
  return (await exportCommandsWav([...built.commands, ...effectsCommands()], built.steps, tailSeconds, slots)).blob;
}

/** One bar with every track silenced: where a single pass ends. */
function silentBar(style: StylePattern): Section {
  return {
    ...createSection('End'),
    chords: [{ id: 'end', root: 'C', accidental: '', quality: 'maj', duration: getSlotsPerBar(style) / 4 }],
    silenced: { drums: true, piano: true, guitar: true, bass: true },
  };
}
