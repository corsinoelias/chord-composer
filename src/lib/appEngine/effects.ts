/**
 * The mixer's tone and space: a strip per channel — three bands and a compressor — and one
 * reverb for the whole mix, as the app has them (ChannelStrip and MixerState in its
 * audio_engine.dart) and as the engine takes them.
 *
 * What the engine offers is what is offered here, and nothing else: the shelves sit at 160 Hz
 * and 4.5 kHz with a bell at 1 kHz, the compressor has a threshold and a ratio (its 12 ms
 * attack, 180 ms release, hard knee and automatic makeup are the engine's own, not settings),
 * and the reverb is one send with a size and a mix. Until 2026-09-23 this panel offered a
 * single EQ over all four channels plus attack, release and knee sliders the engine never
 * read.
 *
 * Session state, like the master and the pan beside it in mix.ts: the app saves the mixer
 * with the project, the web does not yet.
 */
import { type EngineCommand, type Track } from './commands';
import { startedAppEngine } from './player';
import { DEFAULT_MIX, getMix, isMixDefault, resetMix, setMaster, setPan } from './mix';
import { type SongMixer } from '../songs';

export const STRIP_TRACKS: Track[] = ['drums', 'piano', 'guitar', 'bass'];

/** Tone and compression for one channel. Flat and idle is what almost every channel is. */
export interface ChannelStrip {
  /** Shelf and bell gains in decibels, −12…12. Zero is flat. */
  low: number;
  mid: number;
  high: number;
  /** Where the compressor starts working, in dB below full scale. 0 is the top: idle. */
  threshold: number;
  /** How hard it pulls once it is over. 1 is off. */
  ratio: number;
}

export interface EffectsState {
  strips: Record<Track, ChannelStrip>;
  /** One send, fed from the whole mix: [size] how long the tail runs, [mix] how much is heard. */
  reverb: { size: number; mix: number };
}

export const FLAT_STRIP: ChannelStrip = { low: 0, mid: 0, high: 0, threshold: 0, ratio: 1 };

/**
 * Flat, and dry: the app opens with its reverb at 18%, the web has always played without it
 * and a default that adds a tail to every saved song is not a default. Its size is the app's,
 * so turning the mix up gives the app's room.
 */
export const DEFAULT_EFFECTS_STATE: EffectsState = {
  strips: {
    drums: { ...FLAT_STRIP },
    piano: { ...FLAT_STRIP },
    guitar: { ...FLAT_STRIP },
    bass: { ...FLAT_STRIP },
  },
  reverb: { size: 0.7, mix: 0 },
};

/** The bands the engine's strip filters sit at, for the curve and its labels. */
export const EQ_BANDS: { band: 'low' | 'mid' | 'high'; hz: number; label: string }[] = [
  { band: 'low', hz: 160, label: '160 Hz' },
  { band: 'mid', hz: 1000, label: '1 kHz' },
  { band: 'high', hz: 4500, label: '4.5 kHz' },
];

const clone = (s: EffectsState): EffectsState => JSON.parse(JSON.stringify(s));
const state: EffectsState = clone(DEFAULT_EFFECTS_STATE);

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/** Whether a strip would do anything at all — what the engine calls a flat strip. */
export const isStripFlat = (strip: ChannelStrip): boolean =>
  strip.low === 0 && strip.mid === 0 && strip.high === 0 && strip.ratio <= 1;

/** The engine commands that put the current tone and reverb in place. Sent after every load. */
export function effectsCommands(): EngineCommand[] {
  const strips: EngineCommand[] = STRIP_TRACKS.map((track) => {
    const s = state.strips[track];
    return ['strip', track, s.low, s.mid, s.high, s.threshold, s.ratio];
  });
  return [...strips, ['reverb', state.reverb.size, state.reverb.mix]];
}

/** The master fader and the pan of each track (mix.ts), as the engine takes them. */
export function mixCommands(): EngineCommand[] {
  const mix = getMix();
  return [
    ['mixer', 'master', mix.master, false],
    ...(Object.keys(mix.pan) as Track[]).map((track): EngineCommand => ['pan', track, mix.pan[track]]),
  ];
}

function apply(): void {
  startedAppEngine()?.send([...effectsCommands(), ...mixCommands()]);
}

export function getCurrentEffectsState(): EffectsState {
  return clone(state);
}

/** One channel's tone or compression. The ranges are the app's (ChannelStrip.copyWith). */
export function updateStrip(track: Track, settings: Partial<ChannelStrip>): void {
  const strip = state.strips[track];
  if (settings.low !== undefined) strip.low = clamp(settings.low, -12, 12);
  if (settings.mid !== undefined) strip.mid = clamp(settings.mid, -12, 12);
  if (settings.high !== undefined) strip.high = clamp(settings.high, -12, 12);
  if (settings.threshold !== undefined) strip.threshold = clamp(settings.threshold, -40, 0);
  if (settings.ratio !== undefined) strip.ratio = clamp(settings.ratio, 1, 12);
  apply();
}

/** Back to flat and idle: what the panel's Flat button does to the channel it is showing. */
export function resetStrip(track: Track): void {
  state.strips[track] = { ...FLAT_STRIP };
  apply();
}

export function updateReverb(settings: Partial<EffectsState['reverb']>): void {
  if (settings.size !== undefined) state.reverb.size = clamp(settings.size, 0, 1);
  if (settings.mix !== undefined) state.reverb.mix = clamp(settings.mix, 0, 1);
  apply();
}

/** Reset puts the console back as it opens: flat and dry, master up, the app's placement. */
export function resetEffects(): void {
  Object.assign(state, clone(DEFAULT_EFFECTS_STATE));
  resetMix();
  apply();
}

/** Whether anything in the console has been moved — what greys out Reset. */
export function isConsoleDefault(): boolean {
  return (
    STRIP_TRACKS.every((track) => isStripFlat(state.strips[track])) &&
    state.reverb.mix === DEFAULT_EFFECTS_STATE.reverb.mix &&
    state.reverb.size === DEFAULT_EFFECTS_STATE.reverb.size &&
    isMixDefault()
  );
}

/** The console as a song carries it (the app's `mixer` block); flat strips are left out. */
export function currentSongMixer(): SongMixer {
  const mix = getMix();
  const strips: SongMixer['strips'] = {};
  for (const track of STRIP_TRACKS) {
    if (!isStripFlat(state.strips[track])) strips[track] = { ...state.strips[track] };
  }
  return {
    master: mix.master,
    pan: { ...mix.pan },
    reverbSize: state.reverb.size,
    reverbMix: state.reverb.mix,
    strips,
  };
}

/**
 * A song's mixer, put in place when it opens: the defaults first, so nothing a song says
 * nothing about is left over from the one before it.
 */
export function loadSongMixer(saved: Partial<SongMixer>): void {
  Object.assign(state, clone(DEFAULT_EFFECTS_STATE));
  resetMix();
  if (saved.master !== undefined) setMaster(saved.master);
  if (saved.pan) for (const track of STRIP_TRACKS) setPan(track, saved.pan[track] ?? DEFAULT_MIX.pan[track]);
  if (saved.reverbSize !== undefined) state.reverb.size = clamp(saved.reverbSize, 0, 1);
  if (saved.reverbMix !== undefined) state.reverb.mix = clamp(saved.reverbMix, 0, 1);
  for (const track of STRIP_TRACKS) {
    const strip = saved.strips?.[track];
    if (strip) state.strips[track] = { ...strip };
  }
  apply();
}

/** The whole output's level, 0-1. */
export function updateMaster(volume: number): void {
  setMaster(volume);
  apply();
}

/** Where a track sits, −1 left … 1 right. */
export function updatePan(track: Track, pan: number): void {
  setPan(track, pan);
  apply();
}
