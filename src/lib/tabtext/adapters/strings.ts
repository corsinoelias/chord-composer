import type { TabTextModel, TabTextSection } from '../types'
import { parseTabGeometry } from '../parse'

/**
 * The fretted instruments' half of the ASCII tab: a column holds a fret number
 * rather than a single character.
 *
 * One adapter for bass and guitar, because the only things that differ between
 * them are how many strings there are and what they are tuned to — and both of
 * those are already data in `bassTheory.ts` / `guitarTheory.ts`.
 *
 * Multi-character tokens are the reason `lib/tabtext` measures column widths
 * instead of assuming one character per column. The old bass writer padded a
 * two-digit fret by overwriting the dash after it, which pushed that string's
 * line one character out of step with the others for the rest of the bar.
 */

export interface StringNote {
  stringIndex: number
  fret: number
  startBeat: number
  durationBeats: number
  velocity: number
  /** `h`, `p`, `/`, `\`, `b`, printed right after the fret. */
  technique?: string
  muted?: boolean
}

export interface StringTabTrack {
  name: string
  bpm: number
  beatsPerBar: number
  totalBars: number
  notes: StringNote[]
  sections?: TabTextSection[]
}

export interface StringTabShape {
  /** Row labels, thinnest string first — the order tab is written in. */
  labels: string[]
  columnsPerBeat?: number
  header?: (track: StringTabTrack) => string
}

export function stringTrackToModel(track: StringTabTrack, shape: StringTabShape): TabTextModel {
  const columnsPerBeat = shape.columnsPerBeat ?? 4
  const cells = new Map<string, Map<number, string>>()
  shape.labels.forEach((_, i) => cells.set(String(i), new Map()))

  // Later notes win a shared column, matching what the ear hears: the second
  // one is what is ringing by the time the column sounds.
  const ordered = [...track.notes].sort((a, b) => a.startBeat - b.startBeat)
  for (const note of ordered) {
    const bucket = cells.get(String(note.stringIndex))
    if (!bucket) continue
    const column = Math.round(note.startBeat * columnsPerBeat)
    if (column < 0) continue
    const head = note.muted ? 'x' : String(note.fret)
    bucket.set(column, note.technique && note.technique !== 'x' ? head + note.technique : head)
  }

  return {
    rows: shape.labels.map((label, i) => ({ key: String(i), label })),
    beatsPerBar: track.beatsPerBar,
    totalBars: track.totalBars,
    columnsPerBeat,
    cells,
    header: shape.header?.(track),
    sections: track.sections,
  }
}

const TECHNIQUES = new Set(['h', 'p', '/', '\\', 'b', '~'])

/**
 * Text → notes. Frets are read from the bar's raw text rather than column by
 * column, because in a compact tab `12` is two characters in two columns and
 * only the first of them is the note.
 */
export function stringNotesFromText(
  text: string,
  shape: StringTabShape,
  beatsPerBar = 4,
): { notes: StringNote[]; bars: number; unknownLabels: string[] } {
  const byLabel = new Map<string, string>()
  shape.labels.forEach((label, i) => byLabel.set(label.toUpperCase(), String(i)))

  const parsed = parseTabGeometry(text, {
    beatsPerBar,
    resolveRow(raw) {
      const label = raw.trim().toUpperCase()
      const key = byLabel.get(label)
      return key == null ? null : { key, label: shape.labels[Number(key)] }
    },
  })

  const notes: StringNote[] = []
  for (const row of parsed.rows) {
    const stringIndex = Number(row.key)
    for (const { bar, text: segment } of row.bars) {
      for (let x = 0; x < segment.length; x++) {
        const ch = segment[x]
        if (!/[0-9x]/i.test(ch)) continue
        // A digit that continues the previous note's fret is not a new note.
        if (x > 0 && /[0-9]/.test(segment[x - 1]) && /[0-9]/.test(ch)) continue

        let head = ch
        if (/[0-9]/.test(ch) && /[0-9]/.test(segment[x + 1] ?? '')) head += segment[x + 1]
        const after = segment[x + head.length] ?? ''

        notes.push({
          stringIndex,
          fret: /x/i.test(head) ? 0 : Number(head),
          muted: /x/i.test(head),
          startBeat: Math.max(0, bar.beatAt(x)),
          durationBeats: 1 / (shape.columnsPerBeat ?? 4),
          velocity: 0.8,
          technique: TECHNIQUES.has(after) ? after : undefined,
        })
      }
    }
  }

  notes.sort((a, b) => a.startBeat - b.startBeat)
  return { notes, bars: parsed.bars, unknownLabels: parsed.unknownLabels }
}
