/**
 * What the scheduler and the offline renderer agree to talk about.
 *
 * The point of having an event type at all is that deciding WHICH note sounds is musical
 * logic (rhythm patterns, arpeggios, melodic variations, swing) while deciding HOW it
 * sounds is audio logic (samples, envelopes, oscillators). Keeping them apart is what lets
 * live playback and WAV export share one implementation instead of drifting into two — see
 * docs/audio-engine-refactor.md for what that drift had already cost.
 *
 * Events carry raw MIDI, not frequencies, and no sound-type awareness: things like a bass
 * sound's octave offset belong to the renderer, not the composition.
 */

export type EventInstrument = 'piano' | 'bass' | 'guitar';

export type DrumPiece =
  | 'kick'
  | 'snare'
  | 'snareStick'
  | 'hihat'
  | 'hihatOpen'
  | 'hihatFoot'
  | 'tom1'
  | 'tom2'
  | 'floorTom'
  | 'ride'
  | 'crash';

export interface NoteEvent {
  kind: 'note';
  instrument: EventInstrument;
  /** Absolute time in the target context's clock. */
  time: number;
  midi: number;
  durationSec: number;
  /** 0-1. The instrument's own level lives on its mixer bus, not here. */
  velocity: number;
}

export interface DrumEvent {
  kind: 'drum';
  time: number;
  piece: DrumPiece;
  /** 0-1, already including the kit's internal per-piece balance. */
  velocity: number;
}

export type MusicalEvent = NoteEvent | DrumEvent;
