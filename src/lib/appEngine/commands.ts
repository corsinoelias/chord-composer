/**
 * Commands for the app's audio engine (engine/vendor/native_audio.cpp), typed.
 *
 * Each is [name, ...args], named after the engine's own methods; public/engine/engine-core.js
 * turns them into calls. Build songs from these — a song is an ordered list of them, which
 * is also what the export Worker replays to render the same song to a file.
 */

export type Track = 'drums' | 'piano' | 'guitar' | 'bass';
export type MelodicTrack = Exclude<Track, 'drums'>;

/** Pieces of the kit, by the name the engine keeps them under (kDrumRowNames). */
export const DRUM_ROWS = [
  'kick', 'snare', 'hihat', 'rim', 'hihatOpen', 'hihatFoot', 'tom1', 'tom2', 'floorTom', 'ride', 'crash',
] as const;
export type DrumRow = (typeof DRUM_ROWS)[number];

/** Melodic timbres (enum Timbre). kSampled plays the track's General MIDI program. */
export const TIMBRE = {
  sine: 0, fmEp: 1, partials: 2, organ: 3, pad: 4, saw: 5, pluck: 6, muted: 7, triangle: 8,
  overdrive: 9, sub: 10, reese: 11, square: 12, sampled: 13,
} as const;

/** What a melodic step plays (enum Degree). */
export const DEGREE = { rest: 0, chord: 1, root: 2, third: 3, fifth: 4, seventh: 5, extension: 6, octave: 7 } as const;

/**
 * Drum sound ids (enum DrumSound). The synthesised ones come first; a recording's id is
 * SAMPLED_FIRST plus its slot in public/engine/kit.json.
 */
export const SYNTH_DRUM = { kick: 0, k808: 1, tom: 2, snare: 3, clap: 4, rim: 5, hatClosed: 6, hatOpen: 7, cowbell: 8 } as const;
export const SAMPLED_FIRST = 9;
export const sampledDrum = (slot: number) => SAMPLED_FIRST + slot;
/** The metronome's own sine pip rather than a drum sound. */
export const CLICK_BEEP = -1;

/**
 * One step of a pattern packed the engine's way (stepVelocity & co): velocity 0-255,
 * which chord tone, an octave shift, optionally a second tone, and an accent bit.
 */
export function packStep(velocity: number, degree: number = DEGREE.chord, octave = 0, degree2 = 0, octave2 = 0, accent = false): number {
  if (velocity <= 0 || degree === DEGREE.rest) return 0;
  const v = Math.max(1, Math.min(255, Math.round(velocity)));
  return v | ((degree & 0xf) << 8) | (((octave + 8) & 0xf) << 12) | ((degree2 & 0xf) << 16) | (((octave2 + 8) & 0xf) << 20) | (accent ? 1 << 24 : 0);
}

export type EngineCommand =
  | ['setBpm', number]
  | ['setSwing', number]
  | ['setMeter', number, number]
  | ['loopOnly', number]
  | ['beginArrangement', number]
  | ['section', number, number, boolean, number]
  | ['chord', number, number, string, string, number, number]
  | ['commitArrangement']
  | ['setStep', number, Track, string, number, number]
  | ['clearTrack', number, Track]
  | ['setProgram', number, MelodicTrack, number]
  | ['setTimbre', number, MelodicTrack, number]
  | ['setNoteLength', number, MelodicTrack, number]
  | ['setDrumSound', number, DrumRow, number]
  | ['setSilence', number, Track, boolean]
  | ['setPatternBars', number, Track, number]
  | ['setFill', number, number, number, number[] | Int32Array]
  | ['voicing', number, MelodicTrack, number, number]
  | ['mixer', Track | 'master', number, boolean]
  | ['pan', Track, number]
  | ['reverb', number, number]
  | ['strip', Track, number, number, number, number, number]
  | ['metronome', boolean, number, number, boolean, number]
  | ['start', number]
  | ['stop']
  | ['previewClick']
  | ['previewChord', number, number, string, number, MelodicTrack]
  | ['previewOff', MelodicTrack]
  | ['previewDrum', number, DrumRow]
  | ['previewNote', number, MelodicTrack, number, number]
  | ['resetLoad'];

/** Commands that act rather than describe the song; a file export leaves them out. */
export const TRANSIENT = new Set<EngineCommand[0]>([
  'start', 'stop', 'previewClick', 'previewChord', 'previewOff', 'previewDrum', 'previewNote', 'resetLoad',
]);

/** A chord for ['chord', …]: the root as the engine spells it (sharps). */
export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

/**
 * Steps a song lasts, for the export: the engine counts sixteenths (four to the quarter),
 * and a chord says how long it lasts in half beats.
 */
export function songSteps(sections: { loop: number; chords: { halfBeats: number }[] }[]): number {
  return sections.reduce((sum, s) => sum + s.loop * s.chords.reduce((n, c) => n + c.halfBeats * 2, 0), 0);
}
