import { type BassTrack } from './types'

// ── ASCII TAB ──────────────────────────────────────────────────────────────

const STRING_LABELS = ['G', 'D', 'A', 'E']
const CHARS_PER_BEAT = 4   // resolution: each 1/16 note = 1 char

export function toAsciiTab(track: BassTrack): string {
  const totalBeats = track.totalBars * track.beatsPerBar
  const cols = totalBeats * CHARS_PER_BEAT

  // Build grid: 4 strings × cols chars, pre-filled with '-'
  const grid: string[][] = Array.from({ length: 4 }, () => Array(cols).fill('-'))

  // Place notes (sorted by start time so earlier notes take priority)
  const sorted = [...track.notes].sort((a, b) => a.startBeat - b.startBeat)
  for (const note of sorted) {
    const col = Math.round(note.startBeat * CHARS_PER_BEAT)
    const str = String(note.fret)
    for (let i = 0; i < str.length && col + i < cols; i++) {
      grid[note.stringIndex][col + i] = str[i]
      // Protect adjacent dash so two-digit frets don't bleed
      if (col + i + 1 < cols && grid[note.stringIndex][col + i + 1] === '-') {
        grid[note.stringIndex][col + i + 1] = '-'
      }
    }
  }

  // Bar separators every beatsPerBar * CHARS_PER_BEAT chars
  const barCols = track.beatsPerBar * CHARS_PER_BEAT
  const lines: string[] = []

  for (let si = 0; si < 4; si++) {
    const segments: string[] = []
    for (let bar = 0; bar < track.totalBars; bar++) {
      const start = bar * barCols
      segments.push(grid[si].slice(start, start + barCols).join(''))
    }
    lines.push(`${STRING_LABELS[si]}|${segments.join('|')}|`)
  }

  return [
    `♩ = ${track.bpm} bpm    ${track.totalBars} bars × ${track.beatsPerBar}/4`,
    '',
    ...lines,
    '',
  ].join('\n')
}

// ── Share URL (base64 JSON in hash) ───────────────────────────────────────

export function encodeTrackToHash(track: BassTrack): string {
  try {
    return '#d=' + encodeURIComponent(btoa(JSON.stringify(track)))
  } catch {
    return ''
  }
}

export function decodeTrackFromHash(hash: string): BassTrack | null {
  try {
    const match = hash.match(/[#&]?d=([^&]+)/)
    if (!match) return null
    return JSON.parse(atob(decodeURIComponent(match[1])))
  } catch {
    return null
  }
}

// ── Copy to clipboard ─────────────────────────────────────────────────────

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

// ── MIDI export (SMF Format 0) ─────────────────────────────────────────────

// Standard bass string MIDI base notes: G2=43, D2=38, A1=33, E1=28
const BASS_MIDI_BASE = [43, 38, 33, 28]

function varLen(n: number): number[] {
  const bytes: number[] = [n & 0x7F]
  n >>>= 7
  while (n > 0) { bytes.unshift((n & 0x7F) | 0x80); n >>>= 7 }
  return bytes
}

export function exportMidiFile(track: BassTrack): void {
  const PPQ = 480
  const tempoUs = Math.round(60_000_000 / track.bpm)

  // Build events {tick, data}
  const events: { tick: number; data: number[] }[] = []

  // Tempo meta-event
  events.push({ tick: 0, data: [0xFF, 0x51, 0x03, (tempoUs >> 16) & 0xFF, (tempoUs >> 8) & 0xFF, tempoUs & 0xFF] })
  // Program change: Electric Bass (fingered) = GM program 34, 0-indexed = 33
  events.push({ tick: 0, data: [0xC0, 33] })

  for (const note of track.notes) {
    const midiNote = (BASS_MIDI_BASE[note.stringIndex] ?? 33) + note.fret
    const velocity = Math.max(1, Math.round(note.velocity * 127))
    const onTick  = Math.round(note.startBeat * PPQ)
    const offTick = Math.round((note.startBeat + note.durationBeats) * PPQ)
    events.push({ tick: onTick,  data: [0x90, midiNote, velocity] })
    events.push({ tick: offTick, data: [0x80, midiNote, 0] })
  }

  // End of track
  const endTick = track.totalBars * track.beatsPerBar * PPQ
  events.push({ tick: endTick, data: [0xFF, 0x2F, 0x00] })

  events.sort((a, b) => a.tick !== b.tick ? a.tick - b.tick : (a.data[0] === 0x80 ? -1 : 1))

  // Encode as delta-time bytes
  const trackBytes: number[] = []
  let prevTick = 0
  for (const ev of events) {
    const delta = Math.max(0, ev.tick - prevTick)
    prevTick = ev.tick
    trackBytes.push(...varLen(delta), ...ev.data)
  }

  const tLen = trackBytes.length
  const file = new Uint8Array([
    // MThd
    0x4D,0x54,0x68,0x64, 0x00,0x00,0x00,0x06, 0x00,0x00, 0x00,0x01,
    (PPQ >> 8) & 0xFF, PPQ & 0xFF,
    // MTrk
    0x4D,0x54,0x72,0x6B,
    (tLen >> 24) & 0xFF, (tLen >> 16) & 0xFF, (tLen >> 8) & 0xFF, tLen & 0xFF,
    ...trackBytes,
  ])

  const blob = new Blob([file], { type: 'audio/midi' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `${track.name.replace(/\s+/g, '_') || 'bass_tab'}.mid`
  a.click()
  URL.revokeObjectURL(url)
}
