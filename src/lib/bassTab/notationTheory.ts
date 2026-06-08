// ── Pitch mapping for bass guitar standard tuning ─────────────────────────
// MIDI 60 = C4 (middle C)
// Open strings: G3=55  D3=50  A2=45  E2=40

export const OPEN_MIDI = [55, 50, 45, 40] as const  // G D A E

export function fretToMidi(stringIndex: 0 | 1 | 2 | 3, fret: number): number {
  return OPEN_MIDI[stringIndex] + fret
}

// ── Chromatic → diatonic mapping (prefer sharps) ───────────────────────────
interface ChromaticEntry { note: string; acc: '#' | null; diatPos: number }

const CHROMATIC: ChromaticEntry[] = [
  { note: 'C', acc: null, diatPos: 0 },
  { note: 'C', acc: '#',  diatPos: 0 },
  { note: 'D', acc: null, diatPos: 1 },
  { note: 'D', acc: '#',  diatPos: 1 },
  { note: 'E', acc: null, diatPos: 2 },
  { note: 'F', acc: null, diatPos: 3 },
  { note: 'F', acc: '#',  diatPos: 3 },
  { note: 'G', acc: null, diatPos: 4 },
  { note: 'G', acc: '#',  diatPos: 4 },
  { note: 'A', acc: null, diatPos: 5 },
  { note: 'A', acc: '#',  diatPos: 5 },
  { note: 'B', acc: null, diatPos: 6 },
]

export interface StaffPos {
  /** Position in bass-clef staff. 0=bottom line(G2), 0.5=1st space, 4=top line(A3) */
  staffLine: number
  noteName: string
  octave: number
  accidental: '#' | null
}

/**
 * Maps a MIDI note to its visual position on the bass clef staff.
 * Reference: G2 (MIDI 43) = staffLine 0 (bottom line of bass clef).
 */
export function midiToStaffPos(midi: number): StaffPos {
  const chromatic = ((midi % 12) + 12) % 12
  const octave    = Math.floor(midi / 12) - 1
  const { note, acc, diatPos } = CHROMATIC[chromatic]

  // Diatonic steps from G2 (octave=2, diatPos=4)
  const steps    = (octave - 2) * 7 + (diatPos - 4)
  const staffLine = steps * 0.5

  return { staffLine, noteName: note, octave, accidental: acc }
}

export function fretToStaffPos(stringIndex: 0 | 1 | 2 | 3, fret: number): StaffPos {
  return midiToStaffPos(fretToMidi(stringIndex, fret))
}

// ── Staff geometry helpers ─────────────────────────────────────────────────
export const NOTATION = {
  lineSpacing:   8,    // px between staff lines
  staffLines:    5,
  staffH:        32,   // (5-1) * lineSpacing
  aboveStaff:    28,   // px above top staff line (section labels, accidentals)
  belowStaff:    18,   // px below bottom staff line (ledger lines + bracket)
  get totalH()  { return this.aboveStaff + this.staffH + this.belowStaff }, // 78
  /** Y of a given staffLine inside the notation band (top of notation band = y=0) */
  lineToY(line: number): number {
    return this.aboveStaff + (4 - line) * this.lineSpacing
  },
} as const

/** staffLine → absolute SVG y, given the y origin of the notation band */
export function staffLineY(staffLine: number, notationOriginY: number): number {
  return notationOriginY + NOTATION.lineToY(staffLine)
}

// ── Ledger lines ──────────────────────────────────────────────────────────
/** Returns staffLine values where ledger lines should be drawn (-1,-2,... or 5,6,...) */
export function getLedgerLines(staffLine: number): number[] {
  const lines: number[] = []
  if (staffLine <= -1) {
    for (let l = -1; l >= Math.floor(staffLine); l--) lines.push(l)
  } else if (staffLine >= 5) {
    for (let l = 5; l <= Math.ceil(staffLine); l++) lines.push(l)
  }
  return lines
}

// ── Stem direction ─────────────────────────────────────────────────────────
/** Below middle line (staffLine 2 = D3) → stem up; above → stem down */
export function stemDirection(staffLine: number): 'up' | 'down' {
  return staffLine < 2 ? 'up' : 'down'
}

/** Length of stem in pixels */
export const STEM_LENGTH = 28  // 3.5 × lineSpacing(8)

// ── Note value classification ─────────────────────────────────────────────
export interface NoteHead {
  filled:    boolean  // false = half note or whole note (open)
  hasStem:   boolean
  dotted:    boolean
  beamLevel: 0 | 1 | 2  // 0=none (quarter+), 1=eighth, 2=sixteenth
}

export function classifyDuration(durationBeats: number): NoteHead {
  const d = Math.round(durationBeats * 16) / 16  // snap to 1/16 grid

  if (d >= 4)    return { filled: false, hasStem: false, dotted: false, beamLevel: 0 }
  if (d >= 3)    return { filled: false, hasStem: true,  dotted: true,  beamLevel: 0 }
  if (d >= 2)    return { filled: false, hasStem: true,  dotted: false, beamLevel: 0 }
  if (d >= 1.5)  return { filled: true,  hasStem: true,  dotted: true,  beamLevel: 0 }
  if (d >= 1)    return { filled: true,  hasStem: true,  dotted: false, beamLevel: 0 }
  if (d >= 0.75) return { filled: true,  hasStem: true,  dotted: true,  beamLevel: 1 }
  if (d >= 0.5)  return { filled: true,  hasStem: true,  dotted: false, beamLevel: 1 }
  if (d >= 0.375)return { filled: true,  hasStem: true,  dotted: true,  beamLevel: 2 }
  return           { filled: true,  hasStem: true,  dotted: false, beamLevel: 2 }
}
