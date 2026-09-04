import { type BassTrack } from './types'
import {
  PPQ, buildSmf, downloadMidi, noteEvents, programChange, safeFileName,
  type SmfEvent,
} from '../smf'
import { renderTab } from '../tabtext/render'
import { stringTrackToModel } from '../tabtext/adapters/strings'
import type { RenderOptions } from '../tabtext/types'

// ── ASCII TAB ──────────────────────────────────────────────────────────────

const STRING_LABELS = ['G', 'D', 'A', 'E']

/**
 * The tab as text, through the shared renderer in `lib/tabtext`.
 *
 * The renderer measures every column, which retires the trick this used to
 * play: writing a two-digit fret over the dash beside it kept the line the
 * right length, but only by spending the next subdivision's slot — so this
 * string read half a column ahead of the other three for the rest of the bar.
 */
export function toAsciiTab(track: BassTrack, options: RenderOptions = {}): string {
  const model = stringTrackToModel(track, {
    labels: STRING_LABELS,
    header: t => `♩ = ${t.bpm} bpm    ${t.totalBars} bars × ${t.beatsPerBar}/4`,
  })
  const text = renderTab(model, {
    header: true, ruler: false, barsPerSystem: 4, columnWidth: 'bar', ...options,
  }).text
  return `${text}\n`
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

// ── MIDI export ────────────────────────────────────────────────────────────

// Standard bass string MIDI base notes: G2=43, D2=38, A1=33, E1=28
const BASS_MIDI_BASE = [43, 38, 33, 28]

// GM program 34 "Electric Bass (fingered)", 0-indexed.
const BASS_PROGRAM = 33

export function exportMidiFile(track: BassTrack): void {
  const events: SmfEvent[] = [programChange(0, BASS_PROGRAM)]

  for (const note of track.notes) {
    const midiNote = (BASS_MIDI_BASE[note.stringIndex] ?? 33) + note.fret
    events.push(...noteEvents(
      0,
      midiNote,
      note.velocity,
      Math.round(note.startBeat * PPQ),
      Math.round((note.startBeat + note.durationBeats) * PPQ),
    ))
  }

  const bytes = buildSmf({
    bpm: track.bpm,
    name: track.name || 'Bass',
    timeSignature: { numerator: track.beatsPerBar, denominator: 4 },
    tracks: [{ events }],
    endTick: Math.round(track.totalBars * track.beatsPerBar * PPQ),
  })

  downloadMidi(bytes, `${safeFileName(track.name, 'bass_tab')}.mid`)
}
