import { Midi } from '@tonejs/midi'
import type { BassNote, BassTrack, StringIndex } from '../bassTab/types'

// MIDI numbers for open strings (standard bass tuning): G3=55 D3=50 A2=45 E2=40
const OPEN_STRINGS: [StringIndex, number][] = [
  [0, 55], // G3
  [1, 50], // D3
  [2, 45], // A2
  [3, 40], // E2
]

function midiToPosition(midi: number): { si: StringIndex; fret: number } | null {
  const candidates = OPEN_STRINGS
    .map(([si, open]) => ({ si, fret: midi - open }))
    .filter(c => c.fret >= 0 && c.fret <= 24)
  if (!candidates.length) return null
  // Prefer lower fret (less hand movement); on tie prefer thicker string
  return candidates.reduce((best, c) => c.fret < best.fret ? c : best)
}

// Phase 2: nudge a single out-of-range note to the nearest in-range octave.
// Goes up if too low, down if too high — preserves pitch class.
function nudgeToRange(midi: number): number {
  if (midi < 40) {
    for (const d of [12, 24, 36]) {
      if (midiToPosition(midi + d) !== null) return midi + d
    }
  } else {
    for (const d of [-12, -24]) {
      if (midiToPosition(midi + d) !== null) return midi + d
    }
  }
  return -1
}

function countNative(midiNotes: number[], transpose: number): number {
  return midiNotes.filter(m => midiToPosition(m + transpose) !== null).length
}

function countRecoverable(midiNotes: number[], transpose: number): number {
  return midiNotes.filter(m => {
    const adj = m + transpose
    if (midiToPosition(adj) !== null) return true
    const nudged = nudgeToRange(adj)
    return nudged >= 0 && midiToPosition(nudged) !== null
  }).length
}

// Phase 1: among candidates (sorted ascending = prefer lowest register):
//   1. Maximise total recoverable notes.
//   2. Among equal totals, accept up to 2 extra per-note nudges for a lower register.
//   3. Otherwise prefer most notes native (fewest nudges).
const NUDGE_TOLERANCE = 2
function bestTranspose(midiNotes: number[]): number {
  const candidates = [-12, 0, 12, 24]
  const maxRecoverable = Math.max(...candidates.map(t => countRecoverable(midiNotes, t)))
  const qualifying = candidates.filter(t => countRecoverable(midiNotes, t) === maxRecoverable)

  const maxNative = Math.max(...qualifying.map(t => countNative(midiNotes, t)))
  // Accept candidates within NUDGE_TOLERANCE of the best native count (lowest register wins)
  const acceptable = qualifying.filter(t => maxNative - countNative(midiNotes, t) <= NUDGE_TOLERANCE)
  return acceptable[0] ?? qualifying[0]
}

// General MIDI bass programs: 32-39 (Acoustic Bass through Synth Bass 2)
function isBassTrack(track: import('@tonejs/midi').Track): boolean {
  const name = track.name.toLowerCase()
  if (name.includes('bass') || name.includes('bajo') || name.includes('bs ') || name === 'bs') return true
  const prog = track.instrument.number
  if (prog >= 32 && prog <= 39) return true
  return false
}

export interface MidiImportResult {
  ok: true
  track: BassTrack
  warnings: string[]
  totalNotes: number
  skippedNotes: number
  tracksFound: number
  selectedTrackName: string
}

export interface MidiImportError {
  ok: false
  error: string
}

export type MidiImportOutcome = MidiImportResult | MidiImportError

export function importMidi(buffer: ArrayBuffer): MidiImportOutcome {
  let midi: Midi
  try {
    midi = new Midi(buffer)
  } catch {
    return { ok: false, error: 'Invalid MIDI file or unsupported format.' }
  }

  const tracksWithNotes = midi.tracks.filter(t => t.notes.length > 0)
  if (!tracksWithNotes.length) {
    return { ok: false, error: 'MIDI file contains no tracks with notes.' }
  }

  // Pick bass track: named/programmed bass first, then lowest average pitch
  let selected = tracksWithNotes.find(isBassTrack)
  if (!selected) {
    selected = tracksWithNotes.reduce((lowest, t) => {
      const avg = (arr: typeof t.notes) => arr.reduce((s, n) => s + n.midi, 0) / arr.length
      return avg(t.notes) < avg(lowest.notes) ? t : lowest
    })
  }

  const bpm = Math.round(midi.header.tempos[0]?.bpm ?? 120)
  const beatsPerBar = midi.header.timeSignatures[0]?.timeSignature[0] ?? 4

  const warnings: string[] = []
  let skipped = 0
  const notes: BassNote[] = []

  const rawMidis = selected.notes.map(n => n.midi)
  const transpose = bestTranspose(rawMidis)
  let nudged = 0

  for (const n of selected.notes) {
    let adjusted = n.midi + transpose
    let pos = midiToPosition(adjusted)

    // Phase 2: individual nudge for notes still outside range after global transpose
    if (!pos) {
      adjusted = nudgeToRange(adjusted)
      pos = adjusted >= 0 ? midiToPosition(adjusted) : null
      if (pos) nudged++
    }

    if (!pos) { skipped++; continue }

    const startBeat = n.time * (bpm / 60)
    const durationBeats = Math.max(0.125, n.duration * (bpm / 60))
    notes.push({
      id:            `midi-${n.midi}-${startBeat.toFixed(4)}-${Math.random().toString(36).slice(2, 6)}`,
      stringIndex:   pos.si,
      fret:          pos.fret,
      startBeat,
      durationBeats,
      velocity:      n.velocity,
    })
  }

  if (!notes.length) {
    return { ok: false, error: 'No notes within bass guitar range (E2–G#5) found in this file.' }
  }

  if (transpose !== 0) {
    const octaves = Math.abs(transpose / 12)
    const dir = transpose > 0 ? 'up' : 'down'
    warnings.push(`Track transposed ${octaves} octave${octaves !== 1 ? 's' : ''} ${dir} to fit bass guitar range.`)
  }
  if (nudged > 0) {
    warnings.push(`${nudged} note${nudged !== 1 ? 's' : ''} adjusted by an extra octave to stay in range.`)
  }
  if (skipped > 0) {
    warnings.push(`${skipped} note${skipped !== 1 ? 's' : ''} could not be placed on any string and were skipped.`)
  }
  if (tracksWithNotes.length > 1 && !isBassTrack(selected)) {
    warnings.push(`Multiple tracks found — used lowest-register track "${selected.name || 'unnamed'}".`)
  }

  const lastBeat = notes.reduce((mx, n) => Math.max(mx, n.startBeat + n.durationBeats), 0)
  const totalBars = Math.max(1, Math.ceil(lastBeat / beatsPerBar))
  const trackName = selected.name.trim() || 'MIDI Import'

  return {
    ok: true,
    track: {
      id:          `midi-${Date.now()}`,
      name:        trackName,
      bpm,
      beatsPerBar,
      totalBars,
      notes,
    },
    warnings,
    totalNotes:        selected.notes.length,
    skippedNotes:      skipped,
    tracksFound:       tracksWithNotes.length,
    selectedTrackName: trackName,
  }
}
