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
]
