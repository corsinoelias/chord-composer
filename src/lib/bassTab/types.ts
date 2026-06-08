export type StringIndex = 0 | 1 | 2 | 3

export interface BassNote {
  id: string
  stringIndex: StringIndex
  fret: number           // 0-24
  startBeat: number      // float, 0-indexed beats
  durationBeats: number  // float, in beats
  velocity: number       // 0-1
}

export interface TrackSection {
  name: string
  startBar: number
}

export interface BassTrack {
  id: string
  name: string
  bpm: number
  beatsPerBar: number
  totalBars: number
  notes: BassNote[]
  sections?: TrackSection[]
}

export type BassSound = 'electric' | 'picked' | 'synth' | 'slap'
export type SnapValue = 0.25 | 0.5 | 1.0

export const SNAP_OPTIONS: { label: string; value: SnapValue }[] = [
  { label: '1/16', value: 0.25 },
  { label: '1/8',  value: 0.5  },
  { label: '1/4',  value: 1.0  },
]

export type NoteDuration = 4 | 2 | 1 | 0.5 | 0.25

export const NOTE_DURATION_OPTIONS: { label: string; value: NoteDuration; title: string }[] = [
  { label: '1',  value: 4,    title: 'Whole note (4 beats)' },
  { label: '2',  value: 2,    title: 'Half note (2 beats)' },
  { label: '4',  value: 1,    title: 'Quarter note (1 beat)' },
  { label: '8',  value: 0.5,  title: 'Eighth note (½ beat)' },
  { label: '16', value: 0.25, title: '16th note (¼ beat)' },
]

export const DEFAULT_TRACK: BassTrack = {
  id: 'default',
  name: 'New Bass Line',
  bpm: 100,
  beatsPerBar: 4,
  totalBars: 8,
  notes: [],
}

export interface LoopRange {
  startBeat: number
  endBeat: number
}
