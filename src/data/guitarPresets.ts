import type { GuitarTrack, GuitarNote, GuitarStringIndex } from '../lib/guitarTab/types'

export interface GuitarPreset extends GuitarTrack {
  artist: string
  genre: string
  defaultSound: string
}

let noteId = 0
const nid = () => `preset-note-${noteId++}`

// Power-chord riff on G (2) + D (3) strings, doubled on both strings for each
// fretted note — matches the classic "Smoke on the Water" opening riff shape
// already shown as a static ASCII example on the /tools/guitar-tab/ landing
// page, so the live preview plays the same riff the page teaches.
function powerChord(startBeat: number, fret: number, durationBeats: number): GuitarNote[] {
  const strings: GuitarStringIndex[] = [2, 3]
  return strings.map(stringIndex => ({
    id: nid(),
    stringIndex,
    fret,
    startBeat,
    durationBeats,
    velocity: 100,
  }))
}

// Compact form for single-note melody presets ported from the piano song library
// (src/lib/virtualPiano/pianoSongs.ts) — each tuple is [string, fret, startBeat,
// durationBeats]. Positions were picked by a greedy nearest-fret conversion (minimize
// fret + string movement from the previous note) rather than hand-transcribed, so they
// are always the correct pitch but occasionally sit in a less "idiomatic" position than
// a hand-fretted arrangement would.
function melody(entries: [GuitarStringIndex, number, number, number][]): GuitarNote[] {
  return entries.map(([stringIndex, fret, startBeat, durationBeats]) => ({
    id: nid(), stringIndex, fret, startBeat, durationBeats, velocity: 0.8,
  }))
}

const smokeOnTheWaterNotes: GuitarNote[] = [
  ...powerChord(0, 0, 0.5),
  ...powerChord(0.5, 3, 0.5),
  ...powerChord(1, 5, 1.5),
  ...powerChord(4, 0, 0.5),
  ...powerChord(4.5, 3, 0.5),
  ...powerChord(5, 5, 1.5),
  ...powerChord(8, 0, 0.5),
  ...powerChord(8.5, 3, 0.5),
  ...powerChord(9, 6, 0.5),
  ...powerChord(9.5, 5, 1.5),
  ...powerChord(12, 0, 0.5),
  ...powerChord(12.5, 3, 0.5),
  ...powerChord(13, 0, 3),
]

// Fingerstyle waltz — melody on the treble strings (voice 0) over a sustained bass
// line (voice 1). Imported from a real Guitar Pro (.gp) transcription.
const onTheSwingNotes: GuitarNote[] = [
  { id: nid(), stringIndex: 2, fret: 0, startBeat: 1, durationBeats: 0.5, velocity: 0.8 },
  { id: nid(), stringIndex: 1, fret: 1, startBeat: 1.5, durationBeats: 1, velocity: 0.8 },
  { id: nid(), stringIndex: 2, fret: 0, startBeat: 2.5, durationBeats: 0.5, velocity: 0.8 },
  { id: nid(), stringIndex: 4, fret: 3, startBeat: 0, durationBeats: 3, velocity: 0.8, voice: 1 },
  { id: nid(), stringIndex: 2, fret: 0, startBeat: 4, durationBeats: 0.5, velocity: 0.8 },
  { id: nid(), stringIndex: 1, fret: 0, startBeat: 4.5, durationBeats: 1, velocity: 0.8 },
  { id: nid(), stringIndex: 2, fret: 0, startBeat: 5.5, durationBeats: 0.5, velocity: 0.8 },
  { id: nid(), stringIndex: 5, fret: 3, startBeat: 3, durationBeats: 3, velocity: 0.8, voice: 1 },
  { id: nid(), stringIndex: 3, fret: 2, startBeat: 7, durationBeats: 0.5, velocity: 0.8 },
  { id: nid(), stringIndex: 2, fret: 2, startBeat: 7.5, durationBeats: 1, velocity: 0.8 },
  { id: nid(), stringIndex: 3, fret: 2, startBeat: 8.5, durationBeats: 0.5, velocity: 0.8 },
  { id: nid(), stringIndex: 4, fret: 0, startBeat: 6, durationBeats: 3, velocity: 0.8, voice: 1 },
  { id: nid(), stringIndex: 2, fret: 0, startBeat: 10, durationBeats: 0.5, velocity: 0.8 },
  { id: nid(), stringIndex: 0, fret: 0, startBeat: 10.5, durationBeats: 1.5, velocity: 0.8 },
  { id: nid(), stringIndex: 5, fret: 0, startBeat: 9, durationBeats: 3, velocity: 0.8, voice: 1 },
  { id: nid(), stringIndex: 2, fret: 2, startBeat: 13, durationBeats: 0.5, velocity: 0.8 },
  { id: nid(), stringIndex: 1, fret: 3, startBeat: 13.5, durationBeats: 1, velocity: 0.8 },
  { id: nid(), stringIndex: 2, fret: 2, startBeat: 14.5, durationBeats: 0.5, velocity: 0.8 },
  { id: nid(), stringIndex: 5, fret: 13, startBeat: 12, durationBeats: 3, velocity: 0.8, voice: 1 },
  { id: nid(), stringIndex: 2, fret: 0, startBeat: 16, durationBeats: 0.5, velocity: 0.8 },
  { id: nid(), stringIndex: 0, fret: 0, startBeat: 16.5, durationBeats: 1, velocity: 0.8 },
  { id: nid(), stringIndex: 2, fret: 0, startBeat: 17.5, durationBeats: 0.5, velocity: 0.8 },
  { id: nid(), stringIndex: 4, fret: 3, startBeat: 15, durationBeats: 3, velocity: 0.8, voice: 1 },
  { id: nid(), stringIndex: 2, fret: 2, startBeat: 19, durationBeats: 0.5, velocity: 0.8 },
  { id: nid(), stringIndex: 0, fret: 1, startBeat: 19.5, durationBeats: 1, velocity: 0.8 },
  { id: nid(), stringIndex: 2, fret: 2, startBeat: 20.5, durationBeats: 0.5, velocity: 0.8 },
  { id: nid(), stringIndex: 3, fret: 0, startBeat: 18, durationBeats: 3, velocity: 0.8, voice: 1 },
  { id: nid(), stringIndex: 1, fret: 0, startBeat: 22, durationBeats: 0.5, velocity: 0.8 },
  { id: nid(), stringIndex: 0, fret: 3, startBeat: 22.5, durationBeats: 1.5, velocity: 0.8 },
  { id: nid(), stringIndex: 5, fret: 15, startBeat: 21, durationBeats: 3, velocity: 0.8, voice: 1 },
  { id: nid(), stringIndex: 2, fret: 0, startBeat: 25, durationBeats: 0.5, velocity: 0.8 },
  { id: nid(), stringIndex: 1, fret: 1, startBeat: 25.5, durationBeats: 1, velocity: 0.8 },
  { id: nid(), stringIndex: 2, fret: 0, startBeat: 26.5, durationBeats: 0.5, velocity: 0.8 },
  { id: nid(), stringIndex: 4, fret: 3, startBeat: 24, durationBeats: 3, velocity: 0.8, voice: 1 },
  { id: nid(), stringIndex: 2, fret: 0, startBeat: 28, durationBeats: 0.5, velocity: 0.8 },
  { id: nid(), stringIndex: 1, fret: 0, startBeat: 28.5, durationBeats: 1, velocity: 0.8 },
  { id: nid(), stringIndex: 2, fret: 0, startBeat: 29.5, durationBeats: 0.5, velocity: 0.8 },
  { id: nid(), stringIndex: 5, fret: 3, startBeat: 27, durationBeats: 3, velocity: 0.8, voice: 1 },
  { id: nid(), stringIndex: 3, fret: 2, startBeat: 31, durationBeats: 0.5, velocity: 0.8 },
  { id: nid(), stringIndex: 2, fret: 2, startBeat: 31.5, durationBeats: 1, velocity: 0.8 },
  { id: nid(), stringIndex: 3, fret: 2, startBeat: 32.5, durationBeats: 0.5, velocity: 0.8 },
  { id: nid(), stringIndex: 4, fret: 0, startBeat: 30, durationBeats: 3, velocity: 0.8, voice: 1 },
  { id: nid(), stringIndex: 2, fret: 0, startBeat: 34, durationBeats: 0.5, velocity: 0.8 },
  { id: nid(), stringIndex: 0, fret: 0, startBeat: 34.5, durationBeats: 1.5, velocity: 0.8 },
  { id: nid(), stringIndex: 5, fret: 0, startBeat: 33, durationBeats: 3, velocity: 0.8, voice: 1 },
  { id: nid(), stringIndex: 2, fret: 2, startBeat: 37, durationBeats: 0.5, velocity: 0.8 },
  { id: nid(), stringIndex: 1, fret: 3, startBeat: 37.5, durationBeats: 1, velocity: 0.8 },
  { id: nid(), stringIndex: 2, fret: 2, startBeat: 38.5, durationBeats: 0.5, velocity: 0.8 },
  { id: nid(), stringIndex: 5, fret: 13, startBeat: 36, durationBeats: 3, velocity: 0.8, voice: 1 },
  { id: nid(), stringIndex: 3, fret: 0, startBeat: 40, durationBeats: 0.5, velocity: 0.8 },
  { id: nid(), stringIndex: 1, fret: 0, startBeat: 40.5, durationBeats: 1, velocity: 0.8 },
  { id: nid(), stringIndex: 3, fret: 0, startBeat: 41.5, durationBeats: 0.5, velocity: 0.8 },
  { id: nid(), stringIndex: 5, fret: 3, startBeat: 39, durationBeats: 3, velocity: 0.8, voice: 1 },
  { id: nid(), stringIndex: 3, fret: 5, startBeat: 43, durationBeats: 0.5, velocity: 0.8 },
  { id: nid(), stringIndex: 1, fret: 1, startBeat: 43.5, durationBeats: 1, velocity: 0.8 },
  { id: nid(), stringIndex: 2, fret: 0, startBeat: 44.5, durationBeats: 0.5, velocity: 0.8 },
  { id: nid(), stringIndex: 4, fret: 3, startBeat: 42, durationBeats: 3, velocity: 0.8, voice: 1 },
  { id: nid(), stringIndex: 4, fret: 3, startBeat: 45, durationBeats: 1.5, velocity: 0.8 },
  { id: nid(), stringIndex: 4, fret: 3, startBeat: 45, durationBeats: 1.5, velocity: 0.8, voice: 1 },
]

// Classic phone ringtone melody, based on Francisco Tárrega's "Gran Vals".
// Imported from a real Guitar Pro (.gp5) transcription.
const nokiaRingtoneNotes: GuitarNote[] = [
  { id: nid(), stringIndex: 2, fret: 9, startBeat: 0, durationBeats: 0.25, velocity: 0.8 },
  { id: nid(), stringIndex: 2, fret: 7, startBeat: 0.25, durationBeats: 0.25, velocity: 0.8 },
  { id: nid(), stringIndex: 3, fret: 4, startBeat: 0.5, durationBeats: 0.5, velocity: 0.8 },
  { id: nid(), stringIndex: 3, fret: 6, startBeat: 1, durationBeats: 0.5, velocity: 0.8 },
  { id: nid(), stringIndex: 2, fret: 6, startBeat: 1.5, durationBeats: 0.25, velocity: 0.8 },
  { id: nid(), stringIndex: 2, fret: 4, startBeat: 1.75, durationBeats: 0.25, velocity: 0.8 },
  { id: nid(), stringIndex: 3, fret: 0, startBeat: 2, durationBeats: 0.5, velocity: 0.8 },
  { id: nid(), stringIndex: 3, fret: 2, startBeat: 2.5, durationBeats: 0.5, velocity: 0.8 },
  { id: nid(), stringIndex: 2, fret: 4, startBeat: 3, durationBeats: 0.25, velocity: 0.8 },
  { id: nid(), stringIndex: 2, fret: 2, startBeat: 3.25, durationBeats: 0.25, velocity: 0.8 },
  { id: nid(), stringIndex: 4, fret: 4, startBeat: 3.5, durationBeats: 0.5, velocity: 0.8 },
  { id: nid(), stringIndex: 3, fret: 2, startBeat: 4, durationBeats: 0.5, velocity: 0.8 },
  { id: nid(), stringIndex: 2, fret: 2, startBeat: 4.5, durationBeats: 0.5, velocity: 0.8 },
  { id: nid(), stringIndex: 2, fret: 2, startBeat: 5, durationBeats: 4, velocity: 0.8 },
  { id: nid(), stringIndex: 2, fret: 9, startBeat: 9, durationBeats: 0.25, velocity: 0.8 },
  { id: nid(), stringIndex: 2, fret: 7, startBeat: 9.25, durationBeats: 0.25, velocity: 0.8 },
  { id: nid(), stringIndex: 3, fret: 4, startBeat: 9.5, durationBeats: 0.5, velocity: 0.8 },
  { id: nid(), stringIndex: 3, fret: 6, startBeat: 10, durationBeats: 0.5, velocity: 0.8 },
  { id: nid(), stringIndex: 2, fret: 6, startBeat: 10.5, durationBeats: 0.25, velocity: 0.8 },
  { id: nid(), stringIndex: 2, fret: 4, startBeat: 10.75, durationBeats: 0.25, velocity: 0.8 },
  { id: nid(), stringIndex: 3, fret: 0, startBeat: 11, durationBeats: 0.5, velocity: 0.8 },
  { id: nid(), stringIndex: 3, fret: 2, startBeat: 11.5, durationBeats: 0.5, velocity: 0.8 },
  { id: nid(), stringIndex: 2, fret: 4, startBeat: 12, durationBeats: 0.25, velocity: 0.8 },
  { id: nid(), stringIndex: 2, fret: 2, startBeat: 12.25, durationBeats: 0.25, velocity: 0.8 },
  { id: nid(), stringIndex: 4, fret: 4, startBeat: 12.5, durationBeats: 0.5, velocity: 0.8 },
  { id: nid(), stringIndex: 3, fret: 2, startBeat: 13, durationBeats: 0.5, velocity: 0.8 },
  { id: nid(), stringIndex: 2, fret: 2, startBeat: 13.5, durationBeats: 0.5, velocity: 0.8 },
  { id: nid(), stringIndex: 2, fret: 2, startBeat: 14, durationBeats: 4, velocity: 0.8 },
]

// Melody-only arrangements ported from the piano song library (src/lib/virtualPiano/pianoSongs.ts,
// ids 'estrellita' and 'oda') so /guitar-tab/ has an easy, recognizable demo to load on first visit —
// same public-domain melodies, just re-fretted onto the open e/B strings (the standard beginner
// position for both tunes: e string open/1/3/5 = E/F/G/A, B string 1/3 = C/D).
const twinkleTwinkleNotes: GuitarNote[] = [
  { id: nid(), stringIndex: 1, fret: 1, startBeat: 0,  durationBeats: 1, velocity: 0.8 },
  { id: nid(), stringIndex: 1, fret: 1, startBeat: 1,  durationBeats: 1, velocity: 0.8 },
  { id: nid(), stringIndex: 0, fret: 3, startBeat: 2,  durationBeats: 1, velocity: 0.8 },
  { id: nid(), stringIndex: 0, fret: 3, startBeat: 3,  durationBeats: 1, velocity: 0.8 },
  { id: nid(), stringIndex: 0, fret: 5, startBeat: 4,  durationBeats: 1, velocity: 0.8 },
  { id: nid(), stringIndex: 0, fret: 5, startBeat: 5,  durationBeats: 1, velocity: 0.8 },
  { id: nid(), stringIndex: 0, fret: 3, startBeat: 6,  durationBeats: 2, velocity: 0.8 },
  { id: nid(), stringIndex: 0, fret: 1, startBeat: 8,  durationBeats: 1, velocity: 0.8 },
  { id: nid(), stringIndex: 0, fret: 1, startBeat: 9,  durationBeats: 1, velocity: 0.8 },
  { id: nid(), stringIndex: 0, fret: 0, startBeat: 10, durationBeats: 1, velocity: 0.8 },
  { id: nid(), stringIndex: 0, fret: 0, startBeat: 11, durationBeats: 1, velocity: 0.8 },
  { id: nid(), stringIndex: 1, fret: 3, startBeat: 12, durationBeats: 1, velocity: 0.8 },
  { id: nid(), stringIndex: 1, fret: 3, startBeat: 13, durationBeats: 1, velocity: 0.8 },
  { id: nid(), stringIndex: 1, fret: 1, startBeat: 14, durationBeats: 2, velocity: 0.8 },
  { id: nid(), stringIndex: 0, fret: 3, startBeat: 16, durationBeats: 1, velocity: 0.8 },
  { id: nid(), stringIndex: 0, fret: 3, startBeat: 17, durationBeats: 1, velocity: 0.8 },
  { id: nid(), stringIndex: 0, fret: 1, startBeat: 18, durationBeats: 1, velocity: 0.8 },
  { id: nid(), stringIndex: 0, fret: 1, startBeat: 19, durationBeats: 1, velocity: 0.8 },
  { id: nid(), stringIndex: 0, fret: 0, startBeat: 20, durationBeats: 1, velocity: 0.8 },
  { id: nid(), stringIndex: 0, fret: 0, startBeat: 21, durationBeats: 1, velocity: 0.8 },
  { id: nid(), stringIndex: 1, fret: 3, startBeat: 22, durationBeats: 2, velocity: 0.8 },
  { id: nid(), stringIndex: 0, fret: 3, startBeat: 24, durationBeats: 1, velocity: 0.8 },
  { id: nid(), stringIndex: 0, fret: 3, startBeat: 25, durationBeats: 1, velocity: 0.8 },
  { id: nid(), stringIndex: 0, fret: 1, startBeat: 26, durationBeats: 1, velocity: 0.8 },
  { id: nid(), stringIndex: 0, fret: 1, startBeat: 27, durationBeats: 1, velocity: 0.8 },
  { id: nid(), stringIndex: 0, fret: 0, startBeat: 28, durationBeats: 1, velocity: 0.8 },
  { id: nid(), stringIndex: 0, fret: 0, startBeat: 29, durationBeats: 1, velocity: 0.8 },
  { id: nid(), stringIndex: 1, fret: 3, startBeat: 30, durationBeats: 2, velocity: 0.8 },
  { id: nid(), stringIndex: 1, fret: 1, startBeat: 32, durationBeats: 1, velocity: 0.8 },
  { id: nid(), stringIndex: 1, fret: 1, startBeat: 33, durationBeats: 1, velocity: 0.8 },
  { id: nid(), stringIndex: 0, fret: 3, startBeat: 34, durationBeats: 1, velocity: 0.8 },
  { id: nid(), stringIndex: 0, fret: 3, startBeat: 35, durationBeats: 1, velocity: 0.8 },
  { id: nid(), stringIndex: 0, fret: 5, startBeat: 36, durationBeats: 1, velocity: 0.8 },
  { id: nid(), stringIndex: 0, fret: 5, startBeat: 37, durationBeats: 1, velocity: 0.8 },
  { id: nid(), stringIndex: 0, fret: 3, startBeat: 38, durationBeats: 2, velocity: 0.8 },
  { id: nid(), stringIndex: 0, fret: 1, startBeat: 40, durationBeats: 1, velocity: 0.8 },
  { id: nid(), stringIndex: 0, fret: 1, startBeat: 41, durationBeats: 1, velocity: 0.8 },
  { id: nid(), stringIndex: 0, fret: 0, startBeat: 42, durationBeats: 1, velocity: 0.8 },
  { id: nid(), stringIndex: 0, fret: 0, startBeat: 43, durationBeats: 1, velocity: 0.8 },
  { id: nid(), stringIndex: 1, fret: 3, startBeat: 44, durationBeats: 1, velocity: 0.8 },
  { id: nid(), stringIndex: 1, fret: 3, startBeat: 45, durationBeats: 1, velocity: 0.8 },
  { id: nid(), stringIndex: 1, fret: 1, startBeat: 46, durationBeats: 2, velocity: 0.8 },
]

const odeToJoyNotes: GuitarNote[] = [
  { id: nid(), stringIndex: 0, fret: 0, startBeat: 0,    durationBeats: 1,   velocity: 0.8 },
  { id: nid(), stringIndex: 0, fret: 0, startBeat: 1,    durationBeats: 1,   velocity: 0.8 },
  { id: nid(), stringIndex: 0, fret: 1, startBeat: 2,    durationBeats: 1,   velocity: 0.8 },
  { id: nid(), stringIndex: 0, fret: 3, startBeat: 3,    durationBeats: 1,   velocity: 0.8 },
  { id: nid(), stringIndex: 0, fret: 3, startBeat: 4,    durationBeats: 1,   velocity: 0.8 },
  { id: nid(), stringIndex: 0, fret: 1, startBeat: 5,    durationBeats: 1,   velocity: 0.8 },
  { id: nid(), stringIndex: 0, fret: 0, startBeat: 6,    durationBeats: 1,   velocity: 0.8 },
  { id: nid(), stringIndex: 1, fret: 3, startBeat: 7,    durationBeats: 1,   velocity: 0.8 },
  { id: nid(), stringIndex: 1, fret: 1, startBeat: 8,    durationBeats: 1,   velocity: 0.8 },
  { id: nid(), stringIndex: 1, fret: 1, startBeat: 9,    durationBeats: 1,   velocity: 0.8 },
  { id: nid(), stringIndex: 1, fret: 3, startBeat: 10,   durationBeats: 1,   velocity: 0.8 },
  { id: nid(), stringIndex: 0, fret: 0, startBeat: 11,   durationBeats: 1,   velocity: 0.8 },
  { id: nid(), stringIndex: 0, fret: 0, startBeat: 12,   durationBeats: 1.5, velocity: 0.8 },
  { id: nid(), stringIndex: 1, fret: 3, startBeat: 13.5, durationBeats: 0.5, velocity: 0.8 },
  { id: nid(), stringIndex: 1, fret: 3, startBeat: 14,   durationBeats: 2,   velocity: 0.8 },
  { id: nid(), stringIndex: 0, fret: 0, startBeat: 16,   durationBeats: 1,   velocity: 0.8 },
  { id: nid(), stringIndex: 0, fret: 0, startBeat: 17,   durationBeats: 1,   velocity: 0.8 },
  { id: nid(), stringIndex: 0, fret: 1, startBeat: 18,   durationBeats: 1,   velocity: 0.8 },
  { id: nid(), stringIndex: 0, fret: 3, startBeat: 19,   durationBeats: 1,   velocity: 0.8 },
  { id: nid(), stringIndex: 0, fret: 3, startBeat: 20,   durationBeats: 1,   velocity: 0.8 },
  { id: nid(), stringIndex: 0, fret: 1, startBeat: 21,   durationBeats: 1,   velocity: 0.8 },
  { id: nid(), stringIndex: 0, fret: 0, startBeat: 22,   durationBeats: 1,   velocity: 0.8 },
  { id: nid(), stringIndex: 1, fret: 3, startBeat: 23,   durationBeats: 1,   velocity: 0.8 },
  { id: nid(), stringIndex: 1, fret: 1, startBeat: 24,   durationBeats: 1,   velocity: 0.8 },
  { id: nid(), stringIndex: 1, fret: 1, startBeat: 25,   durationBeats: 1,   velocity: 0.8 },
  { id: nid(), stringIndex: 1, fret: 3, startBeat: 26,   durationBeats: 1,   velocity: 0.8 },
  { id: nid(), stringIndex: 0, fret: 0, startBeat: 27,   durationBeats: 1,   velocity: 0.8 },
  { id: nid(), stringIndex: 1, fret: 3, startBeat: 28,   durationBeats: 1.5, velocity: 0.8 },
  { id: nid(), stringIndex: 1, fret: 1, startBeat: 29.5, durationBeats: 0.5, velocity: 0.8 },
  { id: nid(), stringIndex: 1, fret: 1, startBeat: 30,   durationBeats: 2,   velocity: 0.8 },
]

const happyBirthdayNotes = melody([[0, 3, 0, 0.5], [0, 3, 0.5, 0.5], [0, 5, 1, 1], [0, 3, 2, 1], [0, 8, 3, 1], [0, 7, 4, 2], [1, 8, 6, 0.5], [1, 8, 6.5, 0.5], [1, 10, 7, 1], [1, 8, 8, 1], [0, 10, 9, 1], [0, 8, 10, 2], [1, 8, 12, 0.5], [1, 8, 12.5, 0.5], [0, 15, 13, 1], [0, 12, 14, 1], [1, 13, 15, 1], [1, 12, 16, 1], [1, 10, 17, 2], [0, 13, 19, 0.5], [0, 13, 19.5, 0.5], [0, 12, 20, 1], [1, 13, 21, 1], [1, 15, 22, 1], [1, 13, 23, 2]])

const frereJacquesNotes = melody([[1, 1, 0, 1], [1, 3, 1, 1], [1, 5, 2, 1], [2, 5, 3, 1], [2, 5, 4, 1], [2, 7, 5, 1], [1, 5, 6, 1], [2, 5, 7, 1], [1, 5, 8, 1], [1, 6, 9, 1], [1, 8, 10, 2], [2, 9, 12, 1], [2, 10, 13, 1], [1, 8, 14, 2], [1, 8, 16, 0.5], [1, 10, 16.5, 0.5], [1, 8, 17, 0.5], [1, 6, 17.5, 0.5], [1, 5, 18, 1], [2, 5, 19, 1], [0, 3, 20, 0.5], [0, 5, 20.5, 0.5], [0, 3, 21, 0.5], [0, 1, 21.5, 0.5], [0, 0, 22, 1], [1, 1, 23, 1], [1, 1, 24, 1], [2, 0, 25, 1], [1, 1, 26, 2], [1, 1, 28, 1], [2, 0, 29, 1], [1, 1, 30, 2]])

const maryHadALambNotes = melody([[0, 0, 0, 1], [1, 3, 1, 1], [1, 1, 2, 1], [1, 3, 3, 1], [1, 5, 4, 1], [1, 5, 5, 1], [1, 5, 6, 2], [1, 3, 8, 1], [1, 3, 9, 1], [1, 3, 10, 2], [1, 5, 12, 1], [0, 3, 13, 1], [0, 3, 14, 2], [1, 5, 16, 1], [1, 3, 17, 1], [1, 1, 18, 1], [1, 3, 19, 1], [1, 5, 20, 1], [1, 5, 21, 1], [1, 5, 22, 1], [1, 5, 23, 1], [1, 3, 24, 1], [1, 3, 25, 1], [1, 5, 26, 1], [1, 3, 27, 1], [1, 1, 28, 2]])

const jingleBellsNotes = melody([[0, 0, 0, 1], [0, 0, 1, 1], [0, 0, 2, 2], [0, 0, 4, 1], [0, 0, 5, 1], [0, 0, 6, 2], [0, 0, 8, 1], [0, 3, 9, 1], [1, 1, 10, 1.5], [1, 3, 11.5, 0.5], [1, 5, 12, 4], [1, 6, 16, 1], [1, 6, 17, 1], [1, 6, 18, 1.5], [1, 6, 19.5, 0.5], [1, 6, 20, 1], [1, 5, 21, 1], [1, 5, 22, 1], [1, 5, 23, 0.5], [1, 5, 23.5, 0.5], [1, 5, 24, 1], [1, 3, 25, 1], [1, 3, 26, 1], [1, 5, 27, 1], [1, 3, 28, 2], [0, 3, 30, 2], [1, 5, 32, 1], [1, 5, 33, 1], [1, 5, 34, 2], [1, 5, 36, 1], [1, 5, 37, 1], [1, 5, 38, 2], [1, 5, 40, 1], [0, 3, 41, 1], [1, 1, 42, 1.5], [1, 3, 43.5, 0.5], [1, 5, 44, 4], [1, 6, 48, 1], [1, 6, 49, 1], [1, 6, 50, 1.5], [1, 6, 51.5, 0.5], [1, 6, 52, 1], [1, 5, 53, 1], [1, 5, 54, 1], [1, 5, 55, 0.5], [1, 5, 55.5, 0.5], [0, 3, 56, 1], [0, 3, 57, 1], [0, 1, 58, 1], [1, 3, 59, 1], [1, 1, 60, 2]])

const silentNightNotes = melody([[0, 3, 0, 1.5], [0, 5, 1.5, 0.5], [0, 3, 2, 1], [1, 5, 3, 3], [0, 3, 6, 1.5], [0, 5, 7.5, 0.5], [0, 3, 8, 1], [1, 5, 9, 3], [0, 10, 12, 2], [0, 10, 14, 1], [0, 7, 15, 3], [0, 8, 18, 2], [0, 8, 20, 1], [1, 8, 21, 3], [1, 10, 24, 2], [1, 10, 26, 1], [0, 8, 27, 1.5], [0, 7, 28.5, 0.5], [0, 5, 29, 1], [0, 3, 30, 1.5], [0, 5, 31.5, 0.5], [0, 3, 32, 1], [1, 5, 33, 3], [0, 5, 36, 2], [0, 5, 38, 1], [0, 8, 39, 1.5], [0, 7, 40.5, 0.5], [0, 5, 41, 1], [0, 3, 42, 1.5], [0, 5, 43.5, 0.5], [0, 3, 44, 1], [1, 5, 45, 3], [0, 10, 48, 2], [0, 10, 50, 1], [0, 13, 51, 1.5], [0, 10, 52.5, 0.5], [0, 7, 53, 1], [0, 8, 54, 3], [0, 12, 57, 3], [1, 13, 60, 1.5], [2, 12, 61.5, 0.5], [2, 9, 62, 1], [1, 8, 63, 1.5], [1, 6, 64.5, 0.5], [2, 7, 65, 1], [2, 5, 66, 3]])

const minuetInGNotes = melody([[0, 10, 0, 1], [1, 8, 1, 0.5], [1, 10, 1.5, 0.5], [1, 12, 2, 0.5], [1, 13, 2.5, 0.5], [1, 15, 3, 1], [2, 12, 4, 1], [2, 12, 5, 1], [0, 12, 6, 1], [1, 13, 7, 0.5], [1, 15, 7.5, 0.5], [0, 12, 8, 0.5], [0, 14, 8.5, 0.5], [0, 15, 9, 1], [2, 12, 10, 1], [2, 12, 11, 1], [1, 13, 12, 1], [1, 15, 13, 0.5], [1, 13, 13.5, 0.5], [1, 12, 14, 0.5], [1, 10, 14.5, 0.5], [1, 12, 15, 1], [1, 13, 16, 0.5], [1, 12, 16.5, 0.5], [1, 10, 17, 0.5], [1, 8, 17.5, 0.5], [1, 7, 18, 1], [1, 8, 19, 0.5], [1, 10, 19.5, 0.5], [1, 12, 20, 0.5], [2, 12, 20.5, 0.5], [1, 10, 21, 3]])

const greensleevesNotes = melody([[0, 5, 0, 1], [0, 8, 1, 2], [0, 10, 3, 1], [0, 12, 4, 1.5], [0, 13, 5.5, 0.5], [0, 12, 6, 1], [0, 10, 7, 2], [0, 7, 9, 1], [1, 8, 10, 1.5], [1, 10, 11.5, 0.5], [1, 12, 12, 1], [1, 13, 13, 2], [2, 14, 15, 1], [2, 14, 16, 1.5], [2, 13, 17.5, 0.5], [2, 14, 18, 1], [1, 12, 19, 2], [2, 13, 21, 1], [3, 14, 22, 2], [2, 14, 24, 1], [1, 13, 25, 2], [1, 15, 27, 1], [0, 12, 28, 1.5], [0, 13, 29.5, 0.5], [0, 12, 30, 1], [0, 10, 31, 2], [0, 7, 33, 1], [1, 8, 34, 1.5], [1, 10, 35.5, 0.5], [1, 12, 36, 1], [1, 13, 37, 1.5], [1, 12, 38.5, 0.5], [1, 10, 39, 1], [1, 9, 40, 1.5], [1, 7, 41.5, 0.5], [1, 9, 42, 1], [1, 10, 43, 3]])

const canonInDNotes = melody([[0, 14, 0, 2], [0, 12, 2, 2], [0, 10, 4, 2], [0, 9, 6, 2], [0, 7, 8, 2], [0, 5, 10, 2], [0, 7, 12, 2], [0, 9, 14, 2], [0, 10, 16, 2], [0, 9, 18, 2], [0, 7, 20, 2], [0, 5, 22, 2], [0, 3, 24, 2], [0, 2, 26, 2], [0, 3, 28, 2], [1, 5, 30, 2]])

const furEliseNotes = melody([[0, 12, 0, 0.5], [0, 11, 0.5, 0.5], [0, 12, 1, 0.5], [0, 11, 1.5, 0.5], [0, 12, 2, 0.5], [1, 12, 2.5, 0.5], [0, 10, 3, 0.5], [0, 8, 3.5, 0.5], [1, 10, 4, 1.5], [3, 10, 5.5, 0.5], [2, 9, 6, 0.5], [1, 10, 6.5, 0.5], [1, 12, 7, 1.5], [2, 9, 8.5, 0.5], [1, 9, 9, 0.5], [0, 7, 9.5, 0.5], [0, 8, 10, 1.5], [2, 9, 11.5, 0.5], [0, 12, 12, 0.5], [0, 11, 12.5, 0.5], [0, 12, 13, 0.5], [0, 11, 13.5, 0.5], [0, 12, 14, 0.5], [1, 12, 14.5, 0.5], [0, 10, 15, 0.5], [0, 8, 15.5, 0.5], [1, 10, 16, 1.5], [3, 10, 17.5, 0.5], [2, 9, 18, 0.5], [1, 10, 18.5, 0.5], [1, 12, 19, 1.5], [2, 9, 20.5, 0.5], [0, 8, 21, 0.5], [0, 7, 21.5, 0.5], [0, 5, 22, 2]])

export const GUITAR_PRESETS: GuitarPreset[] = [
  {
    id: 'preset-smokeonthewater',
    name: 'Smoke on the Water',
    artist: 'Deep Purple',
    genre: 'Rock',
    bpm: 112,
    beatsPerBar: 4,
    totalBars: 4,
    capo: 0,
    tuning: 'standard',
    defaultSound: 'clean',
    notes: smokeOnTheWaterNotes,
  },
  {
    id: 'preset-ontheswing',
    name: 'On the Swing',
    artist: 'Artiom Galuza',
    genre: 'Fingerstyle',
    bpm: 69,
    beatsPerBar: 3,
    totalBars: 16,
    capo: 0,
    tuning: 'standard',
    defaultSound: 'acoustic',
    notes: onTheSwingNotes,
  },
  {
    id: 'preset-nokiaringtone',
    name: 'Nokia Ringtone',
    artist: 'Nokia',
    genre: 'Classical',
    bpm: 120,
    beatsPerBar: 5,
    totalBars: 4,
    capo: 0,
    tuning: 'standard',
    defaultSound: 'clean',
    notes: nokiaRingtoneNotes,
  },
  {
    id: 'preset-twinkletwinkle',
    name: 'Twinkle Twinkle Little Star',
    artist: 'Traditional',
    genre: 'Folk',
    bpm: 100,
    beatsPerBar: 4,
    totalBars: 12,
    capo: 0,
    tuning: 'standard',
    defaultSound: 'acoustic',
    notes: twinkleTwinkleNotes,
  },
  {
    id: 'preset-odetojoy',
    name: 'Ode to Joy',
    artist: 'Ludwig van Beethoven',
    genre: 'Classical',
    bpm: 120,
    beatsPerBar: 4,
    totalBars: 8,
    capo: 0,
    tuning: 'standard',
    defaultSound: 'nylon',
    notes: odeToJoyNotes,
  },
  {
    id: 'preset-happybirthday',
    name: 'Happy Birthday',
    artist: 'Traditional',
    genre: 'Celebration',
    bpm: 120,
    beatsPerBar: 4,
    totalBars: 7,
    capo: 0,
    tuning: 'standard',
    defaultSound: 'acoustic',
    notes: happyBirthdayNotes,
  },
  {
    id: 'preset-frerejacques',
    name: 'Frère Jacques',
    artist: 'Traditional',
    genre: 'Children',
    bpm: 120,
    beatsPerBar: 4,
    totalBars: 8,
    capo: 0,
    tuning: 'standard',
    defaultSound: 'acoustic',
    notes: frereJacquesNotes,
  },
  {
    id: 'preset-maryhadalamb',
    name: 'Mary Had a Little Lamb',
    artist: 'Traditional',
    genre: 'Children',
    bpm: 120,
    beatsPerBar: 4,
    totalBars: 8,
    capo: 0,
    tuning: 'standard',
    defaultSound: 'acoustic',
    notes: maryHadALambNotes,
  },
  {
    id: 'preset-jinglebells',
    name: 'Jingle Bells',
    artist: 'James Lord Pierpont',
    genre: 'Christmas',
    bpm: 140,
    beatsPerBar: 4,
    totalBars: 16,
    capo: 0,
    tuning: 'standard',
    defaultSound: 'acoustic',
    notes: jingleBellsNotes,
  },
  {
    id: 'preset-silentnight',
    name: 'Silent Night',
    artist: 'Franz Gruber',
    genre: 'Christmas',
    bpm: 90,
    beatsPerBar: 4,
    totalBars: 18,
    capo: 0,
    tuning: 'standard',
    defaultSound: 'nylon',
    notes: silentNightNotes,
  },
  {
    id: 'preset-minuetg',
    name: 'Minuet in G',
    artist: 'Johann Sebastian Bach',
    genre: 'Classical',
    bpm: 110,
    beatsPerBar: 3,
    totalBars: 8,
    capo: 0,
    tuning: 'standard',
    defaultSound: 'nylon',
    notes: minuetInGNotes,
  },
  {
    id: 'preset-greensleeves',
    name: 'Greensleeves',
    artist: 'Traditional',
    genre: 'Traditional',
    bpm: 100,
    beatsPerBar: 4,
    totalBars: 12,
    capo: 0,
    tuning: 'standard',
    defaultSound: 'nylon',
    notes: greensleevesNotes,
  },
  {
    id: 'preset-canoind',
    name: 'Canon in D',
    artist: 'Johann Pachelbel',
    genre: 'Classical',
    bpm: 60,
    beatsPerBar: 4,
    totalBars: 8,
    capo: 0,
    tuning: 'standard',
    defaultSound: 'nylon',
    notes: canonInDNotes,
  },
  {
    id: 'preset-furelise',
    name: 'Für Elise',
    artist: 'Ludwig van Beethoven',
    genre: 'Classical',
    bpm: 140,
    beatsPerBar: 4,
    totalBars: 6,
    capo: 0,
    tuning: 'standard',
    defaultSound: 'nylon',
    notes: furEliseNotes,
  },
]
