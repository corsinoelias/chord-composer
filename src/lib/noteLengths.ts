/**
 * How long each melodic track's notes ring, in steps — the Android app's "note length",
 * stored with the song as app.noteLengths (see songNoteLengths in songs.ts). 0 holds a note
 * until the track strikes again or the chord changes (the app's "Hold"). A track left out
 * keeps the web's own length: 3 steps, 2 for a plain root-note bass.
 */
export type NoteLengths = Partial<Record<'piano' | 'guitar' | 'bass' | 'synth', number>>;

/**
 * Where each melodic track's register starts, as a MIDI note: the app's voicing, a window of
 * two octaves from there (Voicing.span), stored with the song as app.voicings. A track left
 * out plays where its rhythm puts it.
 */
export type Voicings = Partial<Record<'piano' | 'guitar' | 'bass' | 'synth', number>>;
/** A register's lowest start and its width, as the app's (noteFloor, noteCeiling, Voicing.span). */
export const VOICING_FLOOR = 24;
export const VOICING_SPAN = 24;
export const VOICING_TOP = 108 - VOICING_SPAN;

/**
 * How long each note rings, the Android app's choices (constants.dart noteLengths) plus the
 * web's own length, which is what every song had before and stays the default. In steps.
 */
export const NOTE_LENGTH_CHOICES: { steps: number | undefined; label: string; title: string }[] = [
  { steps: undefined, label: 'Normal', title: 'The rhythm’s own length' },
  { steps: 0.5, label: 'Very short', title: 'Half a sixteenth' },
  { steps: 1, label: 'Short', title: 'A sixteenth' },
  { steps: 2, label: 'Medium', title: 'An eighth' },
  { steps: 4, label: 'Long', title: 'A quarter' },
  { steps: 0, label: 'Held', title: 'Until the next note or chord' },
];
