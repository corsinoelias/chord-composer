// Standard 4-string bass tuning: G2 (index 0, thinnest) → E1 (index 3, thickest)
export const STRINGS = [
  { index: 0 as const, displayName: 'G2', openFreq: 98.00,  midiNote: 43, color: '#3b82f6', darkColor: '#1d4ed8' },
  { index: 1 as const, displayName: 'D2', openFreq: 73.42,  midiNote: 38, color: '#22c55e', darkColor: '#15803d' },
  { index: 2 as const, displayName: 'A1', openFreq: 55.00,  midiNote: 33, color: '#f59e0b', darkColor: '#b45309' },
  { index: 3 as const, displayName: 'E1', openFreq: 41.20,  midiNote: 28, color: '#ef4444', darkColor: '#b91c1c' },
]

export function fretToFrequency(stringIndex: number, fret: number): number {
  const openFreq = STRINGS[stringIndex]?.openFreq ?? 55
  return openFreq * Math.pow(2, fret / 12)
}

export function snapToGrid(beat: number, snap: number): number {
  return Math.round(beat / snap) * snap
}

export function beatToPixel(beat: number, pxPerBeat: number): number {
  return beat * pxPerBeat
}

export function pixelToBeat(px: number, pxPerBeat: number): number {
  return px / pxPerBeat
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export function fretToNoteName(stringIndex: number, fret: number): string {
  const midiNote = (STRINGS[stringIndex]?.midiNote ?? 33) + fret
  return NOTE_NAMES[midiNote % 12]
}
