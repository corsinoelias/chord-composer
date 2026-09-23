/**
 * The mixer's two settings that belong to the console rather than to a track: the master
 * fader and where each track sits in the stereo field (MixerState in the app's
 * audio_engine.dart, `pan` and `master`).
 *
 * Kept here, apart from effects.ts, because fromSong.ts reads it too: a live change resends
 * the `mixer` and `pan` commands the song was built with (AppPlayback's LIVE), so a master or
 * a pan set here has to be what the song is built from or it would be undone by the next
 * fader move.
 *
 * Session state, like the EQ, compressor and reverb beside it: the app saves the mixer with
 * the project, the web does not yet.
 */
import { type Track } from './commands';

export interface MixSettings {
  /** 0-1, the whole output. */
  master: number;
  /** −1 hard left … 1 hard right, per track. */
  pan: Record<Track, number>;
}

/**
 * The app's own placement (MixerState): the piano a little left, the guitar a little right,
 * drums and bass down the middle. The master is the web's 1 rather than the app's 0.7,
 * because the balance between the tracks was measured against a master at full
 * (TRACK_TRIM in fromSong.ts): 0.7 here would only make the same mix quieter.
 */
export const DEFAULT_MIX: MixSettings = {
  master: 1,
  pan: { drums: 0, piano: -0.25, guitar: 0.3, bass: 0 },
};

const state: MixSettings = { master: DEFAULT_MIX.master, pan: { ...DEFAULT_MIX.pan } };

export const getMix = (): MixSettings => ({ master: state.master, pan: { ...state.pan } });

export function setMaster(master: number): void {
  state.master = Math.max(0, Math.min(1, master));
}

export function setPan(track: Track, pan: number): void {
  // Within a hair of the middle is the middle: a knob dragged by a finger never lands on 0.
  state.pan[track] = Math.abs(pan) < 0.04 ? 0 : Math.max(-1, Math.min(1, pan));
}

export function resetMix(): void {
  state.master = DEFAULT_MIX.master;
  state.pan = { ...DEFAULT_MIX.pan };
}

export const isMixDefault = (): boolean =>
  state.master === DEFAULT_MIX.master &&
  (Object.keys(state.pan) as Track[]).every((t) => state.pan[t] === DEFAULT_MIX.pan[t]);
