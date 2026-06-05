export type StringIndex = 0 | 1 | 2 | 3

export interface BassNote {
  id: string
  stringIndex: StringIndex
  fret: number           // 0-24
  startBeat: number      // float, 0-indexed beats
  durationBeats: number  // float, in beats
  velocity: number       // 0-1
}

export interface BassTrack {
  id: string
  name: string
  bpm: number
  beatsPerBar: number
  totalBars: number
  notes: BassNote[]
}

export type BassSound = 'electric' | 'picked' | 'synth' | 'slap'
export type SnapValue = 0.25 | 0.5 | 1.0

export const SNAP_OPTIONS: { label: string; value: SnapValue }[] = [
  { label: '1/16', value: 0.25 },
  { label: '1/8',  value: 0.5  },
  { label: '1/4',  value: 1.0  },
]

export const DEFAULT_TRACK: BassTrack = {
  id: 'default',
  name: 'New Bass Line',
  bpm: 100,
  beatsPerBar: 4,
  totalBars: 8,
  notes: [],
}
