import type { GuitarTrack } from './types'
import { GUITAR_STRINGS } from './guitarTheory'
import { PPQ, buildSmf, noteEvents, type SmfEvent } from '../smf'
import { renderTab } from '../tabtext/render'
import { stringTrackToModel } from '../tabtext/adapters/strings'
import type { RenderOptions } from '../tabtext/types'

/**
 * The tab as text, through the shared renderer in `lib/tabtext`.
 *
 * Column widths are measured there, so a two-digit fret widens its column for
 * every string at once instead of overwriting the dash beside it — which is
 * what used to walk the six lines out of step with each other across a bar.
 */
export function toAsciiTab(track: GuitarTrack, options: RenderOptions = {}): string {
  if (!track.notes.length) return 'No notes yet.'
  const model = stringTrackToModel(track, {
    labels: GUITAR_STRINGS.map(s => s.displayName),
    header: t => `# ${t.name}\n# BPM: ${t.bpm} | Capo: ${track.capo}`,
  })
  return renderTab(model, { header: !!track.name, ruler: false, barsPerSystem: 4, columnWidth: 'bar', ...options }).text
}

/**
 * The tab as MIDI bytes. Returned rather than downloaded because the caller
 * puts the file together itself — see `GuitarTabPlayer.handleExportMidi`.
 */
export function exportMidiFile(track: GuitarTrack): Uint8Array {
  const events: SmfEvent[] = []

  for (const note of track.notes) {
    const midi = (GUITAR_STRINGS[note.stringIndex]?.midiNote ?? 55) + note.fret + track.capo
    events.push(...noteEvents(
      0,
      midi,
      note.velocity,
      Math.round(note.startBeat * PPQ),
      Math.round((note.startBeat + note.durationBeats) * PPQ),
    ))
  }

  return buildSmf({
    bpm: track.bpm,
    name: track.name || 'Guitar',
    timeSignature: { numerator: track.beatsPerBar, denominator: 4 },
    tracks: [{ events }],
    endTick: Math.round(track.totalBars * track.beatsPerBar * PPQ),
  })
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true } catch { return false }
}
