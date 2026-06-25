import type { GuitarNote } from './types'

// Standard tuning: index 0 = high e (thinnest), index 5 = low E (thickest)
export const GUITAR_STRINGS = [
  { index: 0 as const, displayName: 'e', openFreq: 329.63, midiNote: 64, color: '#0284c7', lightBg: '#e0f2fe' },
  { index: 1 as const, displayName: 'B', openFreq: 246.94, midiNote: 59, color: '#7c3aed', lightBg: '#ede9fe' },
  { index: 2 as const, displayName: 'G', openFreq: 196.00, midiNote: 55, color: '#059669', lightBg: '#d1fae5' },
  { index: 3 as const, displayName: 'D', openFreq: 146.83, midiNote: 50, color: '#d97706', lightBg: '#fef3c7' },
  { index: 4 as const, displayName: 'A', openFreq: 110.00, midiNote: 45, color: '#ea580c', lightBg: '#ffedd5' },
  { index: 5 as const, displayName: 'E', openFreq: 82.41,  midiNote: 40, color: '#dc2626', lightBg: '#fee2e2' },
]

export function fretToFrequency(stringIndex: number, fret: number, capo = 0): number {
  const openFreq = GUITAR_STRINGS[stringIndex]?.openFreq ?? 196
  return openFreq * Math.pow(2, (fret + capo) / 12)
}

export function fretToMidi(stringIndex: number, fret: number, capo = 0): number {
  const baseMidi = GUITAR_STRINGS[stringIndex]?.midiNote ?? 55
  return baseMidi + fret + capo
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
  const midiNote = (GUITAR_STRINGS[stringIndex]?.midiNote ?? 55) + fret
  return NOTE_NAMES[midiNote % 12]
}

export function findNoteAtBeat(
  notes: GuitarNote[],
  stringIndex: number,
  beat: number,
  excludeId?: string,
): GuitarNote | undefined {
  return notes.find(n =>
    n.id !== excludeId &&
    n.stringIndex === stringIndex &&
    n.startBeat <= beat + 0.001 &&
    n.startBeat + n.durationBeats > beat + 0.001,
  )
}

export function clampDuration(
  notes: GuitarNote[],
  stringIndex: number,
  startBeat: number,
  wantedDuration: number,
  totalBeats: number,
  excludeId?: string,
): number {
  const next = notes
    .filter(n => n.id !== excludeId && n.stringIndex === stringIndex && n.startBeat > startBeat)
    .sort((a, b) => a.startBeat - b.startBeat)[0]
  const maxEnd = next ? next.startBeat : totalBeats
  return Math.min(wantedDuration, maxEnd - startBeat)
}

// ── Chord shapes ────────────────────────────────────────────────────────────
export interface ChordShape {
  name: string
  // null = muted string; { stringIndex, fret } = note to play
  notes: Array<{ stringIndex: number; fret: number } | null>
}

export const CHORD_SHAPES: ChordShape[] = [
  {
    name: 'Em',
    notes: [
      { stringIndex: 5, fret: 0 },
      { stringIndex: 4, fret: 2 },
      { stringIndex: 3, fret: 2 },
      { stringIndex: 2, fret: 0 },
      { stringIndex: 1, fret: 0 },
      { stringIndex: 0, fret: 0 },
    ],
  },
  {
    name: 'Am',
    notes: [
      null,
      { stringIndex: 4, fret: 0 },
      { stringIndex: 3, fret: 2 },
      { stringIndex: 2, fret: 2 },
      { stringIndex: 1, fret: 1 },
      { stringIndex: 0, fret: 0 },
    ],
  },
  {
    name: 'Dm',
    notes: [
      null,
      null,
      { stringIndex: 3, fret: 0 },
      { stringIndex: 2, fret: 2 },
      { stringIndex: 1, fret: 3 },
      { stringIndex: 0, fret: 1 },
    ],
  },
  {
    name: 'C',
    notes: [
      null,
      { stringIndex: 4, fret: 3 },
      { stringIndex: 3, fret: 2 },
      { stringIndex: 2, fret: 0 },
      { stringIndex: 1, fret: 1 },
      { stringIndex: 0, fret: 0 },
    ],
  },
  {
    name: 'G',
    notes: [
      { stringIndex: 5, fret: 3 },
      { stringIndex: 4, fret: 2 },
      { stringIndex: 3, fret: 0 },
      { stringIndex: 2, fret: 0 },
      { stringIndex: 1, fret: 0 },
      { stringIndex: 0, fret: 3 },
    ],
  },
  {
    name: 'D',
    notes: [
      null,
      null,
      { stringIndex: 3, fret: 0 },
      { stringIndex: 2, fret: 2 },
      { stringIndex: 1, fret: 3 },
      { stringIndex: 0, fret: 2 },
    ],
  },
  {
    name: 'E',
    notes: [
      { stringIndex: 5, fret: 0 },
      { stringIndex: 4, fret: 2 },
      { stringIndex: 3, fret: 2 },
      { stringIndex: 2, fret: 1 },
      { stringIndex: 1, fret: 0 },
      { stringIndex: 0, fret: 0 },
    ],
  },
  {
    name: 'A',
    notes: [
      null,
      { stringIndex: 4, fret: 0 },
      { stringIndex: 3, fret: 2 },
      { stringIndex: 2, fret: 2 },
      { stringIndex: 1, fret: 2 },
      { stringIndex: 0, fret: 0 },
    ],
  },
  {
    name: 'F',
    notes: [
      { stringIndex: 5, fret: 1 },
      { stringIndex: 4, fret: 3 },
      { stringIndex: 3, fret: 3 },
      { stringIndex: 2, fret: 2 },
      { stringIndex: 1, fret: 1 },
      { stringIndex: 0, fret: 1 },
    ],
  },
  {
    name: 'Bm',
    notes: [
      null,
      { stringIndex: 4, fret: 2 },
      { stringIndex: 3, fret: 4 },
      { stringIndex: 2, fret: 4 },
      { stringIndex: 1, fret: 3 },
      { stringIndex: 0, fret: 2 },
    ],
  },
  {
    name: 'G7',
    notes: [
      { stringIndex: 5, fret: 3 },
      { stringIndex: 4, fret: 2 },
      { stringIndex: 3, fret: 0 },
      { stringIndex: 2, fret: 0 },
      { stringIndex: 1, fret: 0 },
      { stringIndex: 0, fret: 1 },
    ],
  },
  {
    name: 'C7',
    notes: [
      null,
      { stringIndex: 4, fret: 3 },
      { stringIndex: 3, fret: 2 },
      { stringIndex: 2, fret: 3 },
      { stringIndex: 1, fret: 1 },
      { stringIndex: 0, fret: 0 },
    ],
  },
  {
    name: 'A7',
    notes: [
      null,
      { stringIndex: 4, fret: 0 },
      { stringIndex: 3, fret: 2 },
      { stringIndex: 2, fret: 0 },
      { stringIndex: 1, fret: 2 },
      { stringIndex: 0, fret: 0 },
    ],
  },
  {
    name: 'E7',
    notes: [
      { stringIndex: 5, fret: 0 },
      { stringIndex: 4, fret: 2 },
      { stringIndex: 3, fret: 0 },
      { stringIndex: 2, fret: 1 },
      { stringIndex: 1, fret: 0 },
      { stringIndex: 0, fret: 0 },
    ],
  },
  {
    name: 'D7',
    notes: [
      null,
      null,
      { stringIndex: 3, fret: 0 },
      { stringIndex: 2, fret: 2 },
      { stringIndex: 1, fret: 1 },
      { stringIndex: 0, fret: 2 },
    ],
  },
  {
    name: 'B7',
    notes: [
      null,
      { stringIndex: 4, fret: 2 },
      { stringIndex: 3, fret: 1 },
      { stringIndex: 2, fret: 2 },
      { stringIndex: 1, fret: 0 },
      { stringIndex: 0, fret: 2 },
    ],
  },
]

export const SINGLE_DOT_FRETS = [3, 5, 7, 9, 15, 17, 19, 21]
export const DOUBLE_DOT_FRETS = [12, 24]
export const MARK_FRETS = new Set([3, 5, 7, 9, 12, 15, 17, 19, 21, 24])
