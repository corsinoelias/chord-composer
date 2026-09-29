/**
 * Commands for the app's audio engine (engine/vendor/native_audio.cpp), typed.
 *
 * Each is [name, ...args], named after the engine's own methods; public/engine/engine-core.js
 * turns them into calls. Build songs from these — a song is an ordered list of them, which
 * is also what the export Worker replays to render the same song to a file.
 */

export type Track = 'drums' | 'piano' | 'guitar' | 'bass' | 'synth';
export type MelodicTrack = Exclude<Track, 'drums'>;

/**
 * Pieces of the kit, by the name the engine keeps them under (kDrumRowNames): the kit, the
 * clap, then twelve rows of hand percussion. A percussion row is not named after a piece: it
 * plays whatever General MIDI percussion note the song gives it (GM_PERC_FIRST + note), and a
 * step may carry its own note (packDrumStep).
 */
export const DRUM_ROWS = [
  'kick', 'snare', 'hihat', 'rim', 'hihatOpen', 'hihatFoot', 'tom1', 'tom2', 'floorTom', 'ride', 'crash', 'clap',
  'perc1', 'perc2', 'perc3', 'perc4', 'perc5', 'perc6', 'perc7', 'perc8', 'perc9', 'perc10', 'perc11', 'perc12',
] as const;
export type DrumRow = (typeof DRUM_ROWS)[number];
/** The kit's rows, without the hand percussion. */
export const KIT_ROWS = DRUM_ROWS.slice(0, 12) as readonly DrumRow[];
/** The hand percussion rows. */
export const PERC_ROWS = DRUM_ROWS.slice(12) as readonly DrumRow[];
/**
 * A drum sound id from here on is General MIDI percussion: GM_PERC_FIRST + 128 × kit + note,
 * the kit being its program in the SoundFont's drum bank (0 Standard, 32 Jazz, 40 Brush…), as
 * the app's gmPercussion. The Standard kit's are GM_PERC_FIRST + note.
 */
export const GM_PERC_FIRST = 100;
/** The General MIDI note of a percussion id, whichever kit. */
export const gmPercNote = (id: number): number => (id - GM_PERC_FIRST) % 128;
/** The drum-bank program (kit) of a percussion id. */
export const gmPercKit = (id: number): number => Math.floor((id - GM_PERC_FIRST) / 128);

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
/**
 * A drum step: its velocity (0-255), and on a percussion row the General MIDI note it plays
 * when that is not the row's own sound (bits 16-23, stepTone), as the app writes it.
 */
export function packDrumStep(velocity: number, gmNote = 0): number {
  if (velocity <= 0) return 0;
  const v = Math.max(1, Math.min(255, Math.round(velocity)));
  return v | ((gmNote & 0x7f) << 16);
}

/** The metronome's own sine pip rather than a drum sound. */
export const CLICK_BEEP = -1;

/**
 * One step of a pattern packed the engine's way (stepVelocity & co): velocity 0-255,
 * which chord tone, an octave shift, optionally a second tone, and an accent bit.
 */
export function packStep(
  velocity: number, degree: number = DEGREE.chord, octave = 0, degree2 = 0, octave2 = 0, accent = false,
  alter = 0, alter2 = 0,
): number {
  if (velocity <= 0 || degree === DEGREE.rest) return 0;
  const v = Math.max(1, Math.min(255, Math.round(velocity)));
  // An alteration moves a single note a semitone (bits 25-26 and 27-28: 1 flat, 2 sharp);
  // it means nothing on the whole chord, where it is dropped, as the app does.
  const bits = (a: number) => (a < 0 ? 1 : a > 0 ? 2 : 0);
  return v | ((degree & 0xf) << 8) | (((octave + 8) & 0xf) << 12) | ((degree2 & 0xf) << 16) | (((octave2 + 8) & 0xf) << 20) | (accent ? 1 << 24 : 0)
    | ((degree === DEGREE.chord ? 0 : bits(alter)) << 25)
    | ((degree2 <= DEGREE.chord ? 0 : bits(alter2)) << 27);
}

export type EngineCommand =
  | ['setBpm', number]
  | ['setSwing', number]
  | ['setMeter', number, number]
  | ['loopOnly', number]
  /** The Fill-in button: the sounding part plays its fill now (engine.fillNow). */
  | ['fillNow']
  | ['beginArrangement', number]
  | ['section', number, number, boolean, number]
  | ['chord', number, number, string, string, number, number]
  | ['commitArrangement']
  /** The last number of these four is the variation: 0 A (when left out) or 1 B. */
  | ['setStep', number, Track, string, number, number, number?]
  | ['clearTrack', number, Track, number?]
  | ['setProgram', number, MelodicTrack, number, bank?: number]
  | ['setTimbre', number, MelodicTrack, number, bank?: number]
  | ['setNoteLength', number, MelodicTrack, number]
  | ['setDrumSound', number, DrumRow, number, bank?: number]
  | ['setSilence', number, Track, boolean]
  | ['setPatternBars', number, Track, number, number?]
  | ['setFill', number, number, number, number[] | Int32Array, number?]
  /** Which variation a section plays from now on (0 A, 1 B). */
  | ['setVariation', number, number]
  /** The VARIATION button: the sounding part goes through the fill into the other one at the bar line. */
  | ['switchVariation', number]
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
  /** One cell of a melodic lane (packed as a step) over a chord: [section, root, quality, bass, track, packed]. */
  | ['previewStep', number, number, string, number, MelodicTrack, number]
  | ['previewOff', MelodicTrack]
  | ['previewDrum', number, DrumRow]
  | ['previewNote', number, MelodicTrack, number, number]
  | ['resetLoad'];

/** Commands that act rather than describe the song; a file export leaves them out. */
export const TRANSIENT = new Set<EngineCommand[0]>([
  'start', 'stop', 'previewClick', 'previewChord', 'previewOff', 'previewDrum', 'previewNote', 'previewStep', 'resetLoad',
  'switchVariation',
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
