import type { GuitarTrack } from './types'
import { GUITAR_STRINGS } from './guitarTheory'

export function toAsciiTab(track: GuitarTrack): string {
  if (!track.notes.length) return 'No notes yet.'

  const totalBeats  = track.totalBars * track.beatsPerBar
  const colsPerBeat = 4
  const totalCols   = totalBeats * colsPerBeat

  const rows = GUITAR_STRINGS.map(() => Array<string>(totalCols).fill('-'))

  // Sort by startBeat so we can find the next note per string for technique markers
  const byString: (typeof track.notes[number])[][] = Array.from({ length: 6 }, () => [])
  for (const n of track.notes) byString[n.stringIndex].push(n)
  for (const row of byString) row.sort((a, b) => a.startBeat - b.startBeat)

  for (let si = 0; si < 6; si++) {
    const row = byString[si]
    for (let ni = 0; ni < row.length; ni++) {
      const note = row[ni]
      const col  = Math.round(note.startBeat * colsPerBeat)
      const label = note.muted ? 'x' : String(note.fret)

      // Write fret/mute chars
      for (let i = 0; i < label.length; i++) {
        if (col + i < totalCols) rows[si][col + i] = label[i]
      }

      // Write technique marker right after this note (before the next note)
      const tech = note.technique
      if (tech && tech !== 'x') {
        const techCol = col + label.length
        if (techCol < totalCols) rows[si][techCol] = tech
      }
    }
  }

  const barBeat = track.beatsPerBar * colsPerBeat
  const lines = GUITAR_STRINGS.map((s, i) => {
    const segments: string[] = []
    for (let bar = 0; bar < track.totalBars; bar++) {
      segments.push(rows[i].slice(bar * barBeat, (bar + 1) * barBeat).join(''))
    }
    return `${s.displayName}|${segments.join('|')}|`
  })

  const header = track.name ? `# ${track.name}\n# BPM: ${track.bpm} | Capo: ${track.capo}\n\n` : ''
  return header + lines.join('\n')
}

export function exportMidiFile(track: GuitarTrack): Uint8Array {
  const ticksPerBeat = 480
  const microsecsPerBeat = Math.round(60_000_000 / track.bpm)

  function varLen(n: number): number[] {
    if (n < 128) return [n]
    const bytes: number[] = []
    while (n > 0) { bytes.unshift(n & 0x7f); n >>= 7 }
    for (let i = 0; i < bytes.length - 1; i++) bytes[i] |= 0x80
    return bytes
  }

  const events: Array<{ tick: number; data: number[] }> = []
  for (const note of track.notes) {
    const startTick = Math.round(note.startBeat * ticksPerBeat)
    const endTick   = Math.round((note.startBeat + note.durationBeats) * ticksPerBeat)
    const midi      = (GUITAR_STRINGS[note.stringIndex]?.midiNote ?? 55) + note.fret + track.capo
    const vel       = Math.round(note.velocity * 100)
    events.push({ tick: startTick, data: [0x90, midi, vel] })
    events.push({ tick: endTick,   data: [0x80, midi, 0] })
  }
  events.sort((a, b) => a.tick - b.tick || a.data[0] - b.data[0])

  const trackBytes: number[] = [
    0x00, 0xFF, 0x51, 0x03,
    (microsecsPerBeat >> 16) & 0xFF,
    (microsecsPerBeat >>  8) & 0xFF,
    microsecsPerBeat         & 0xFF,
  ]
  let lastTick = 0
  for (const ev of events) {
    const delta = ev.tick - lastTick; lastTick = ev.tick
    trackBytes.push(...varLen(delta), ...ev.data)
  }
  trackBytes.push(0x00, 0xFF, 0x2F, 0x00)

  const tl = trackBytes.length
  const header = [
    0x4D,0x54,0x68,0x64, 0,0,0,6, 0,0, 0,1,
    (ticksPerBeat>>8)&0xFF, ticksPerBeat&0xFF,
    0x4D,0x54,0x72,0x6B,
    (tl>>24)&0xFF,(tl>>16)&0xFF,(tl>>8)&0xFF,tl&0xFF,
  ]
  return new Uint8Array([...header, ...trackBytes])
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true } catch { return false }
}
