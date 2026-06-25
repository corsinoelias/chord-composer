export type GuitarStringIndex = 0 | 1 | 2 | 3 | 4 | 5
// 0 = high e (E4=64), 1 = B (59), 2 = G (55), 3 = D (50), 4 = A (45), 5 = low E (E2=40)

export type GuitarTechnique = 'h' | 'p' | '/' | '\\' | 'b' | 'x'

export interface GuitarNote {
  id: string
  stringIndex: GuitarStringIndex
  fret: number
  startBeat: number
  durationBeats: number
  velocity: number
  technique?: GuitarTechnique
  muted?: boolean
}

export type GuitarTuning = 'standard' | 'dropD' | 'openG' | 'openE' | 'dadgad' | 'halfDown'

export const TUNINGS: Record<GuitarTuning, { label: string; midiNotes: number[] }> = {
  standard: { label: 'Standard (EADGBe)',  midiNotes: [40, 45, 50, 55, 59, 64] },
  dropD:    { label: 'Drop D (DADGBe)',     midiNotes: [38, 45, 50, 55, 59, 64] },
  openG:    { label: 'Open G (DGDGBd)',     midiNotes: [38, 43, 50, 55, 59, 62] },
  openE:    { label: 'Open E (EBE G#Be)',   midiNotes: [40, 47, 52, 56, 59, 64] },
  dadgad:   { label: 'DADGAD',              midiNotes: [38, 45, 50, 55, 57, 62] },
  halfDown: { label: 'Eb (half step down)', midiNotes: [39, 44, 49, 54, 58, 63] },
}

export interface TrackSection {
  name: string
  startBar: number
}

export interface GuitarTrack {
  id: string
  name: string
  bpm: number
  beatsPerBar: number
  totalBars: number
  notes: GuitarNote[]
  capo: number
  tuning?: GuitarTuning
  sections?: TrackSection[]
}

export type GuitarSound = 'acoustic' | 'clean' | 'nylon' | 'synth'
export type SnapValue = 0.25 | 0.5 | 1.0

export const SNAP_OPTIONS: { label: string; value: SnapValue }[] = [
  { label: '1/16', value: 0.25 },
  { label: '1/8',  value: 0.5  },
  { label: '1/4',  value: 1.0  },
]

export const DEFAULT_TRACK: GuitarTrack = {
  id: 'default',
  name: 'New Guitar Tab',
  bpm: 100,
  beatsPerBar: 4,
  totalBars: 8,
  notes: [],
  capo: 0,
}

export interface LoopRange {
  startBeat: number
  endBeat: number
}
