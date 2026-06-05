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
