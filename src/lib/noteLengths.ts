/**
 * How long each melodic track's notes ring, in steps — the Android app's "note length",
 * stored with the song as app.noteLengths (see songNoteLengths in songs.ts). 0 holds a note
 * until the track strikes again or the chord changes (the app's "Hold"). A track left out
 * keeps the web's own length: 3 steps, 2 for a plain root-note bass.
 */
export type NoteLengths = Partial<Record<'piano' | 'guitar' | 'bass', number>>;
