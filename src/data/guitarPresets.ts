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
]
