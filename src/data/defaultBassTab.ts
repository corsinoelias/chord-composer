import type { BassTrack } from '../lib/bassTab/types'

// Bass intro riff decoded from SVG tab notation
// Pattern: F# octave riff (D string fret 4 + E string fret 2 = F#2 + F#1)
type P = { si: 0 | 1 | 2 | 3; f: number; b: number }

const BAR_PATTERN: P[] = [
  { si: 1, f: 4, b: 0.0 }, { si: 3, f: 2, b: 0.0 },
  { si: 2, f: 4, b: 0.5 },
  { si: 1, f: 2, b: 1.0 },
  { si: 1, f: 4, b: 1.5 }, { si: 3, f: 2, b: 1.5 },
  { si: 1, f: 2, b: 2.0 },
  { si: 2, f: 4, b: 2.5 },
  { si: 2, f: 2, b: 3.0 },
  { si: 2, f: 4, b: 3.5 },
]

const BEATS_PER_BAR = 4
const TOTAL_BARS    = 4

export const DEFAULT_INTRO_TRACK: BassTrack = {
  id:           'default-intro',
  name:         'Intro Riff',
  bpm:          117,
  beatsPerBar:  BEATS_PER_BAR,
  totalBars:    TOTAL_BARS,
  sections:     [{ name: 'Intro', startBar: 0 }],
  notes: Array.from({ length: TOTAL_BARS }, (_, bar) =>
    BAR_PATTERN.map(p => ({
      id:            `intro-${bar}-${p.si}-${p.b}`,
      stringIndex:   p.si,
      fret:          p.f,
      startBeat:     bar * BEATS_PER_BAR + p.b,
      durationBeats: 0.5,
      velocity:      0.8,
    }))
  ).flat(),
}
