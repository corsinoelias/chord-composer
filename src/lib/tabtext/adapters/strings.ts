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
  /** Carried through a round trip so an untouched note keeps its identity. */
  id?: string
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
  // Case matters first: a guitar's outer strings are `e` and `E`, and matching
  // case-insensitively put every note from the high E line onto the low one.
  // The case-folded map is only a fallback, for a tab that writes `b|` for the
  // B string — which plenty do.
  const exact = new Map<string, string>()
  const folded = new Map<string, string>()
  shape.labels.forEach((label, i) => {
    exact.set(label, String(i))
    if (!folded.has(label.toUpperCase())) folded.set(label.toUpperCase(), String(i))
  })

  const parsed = parseTabGeometry(text, {
    beatsPerBar,
    multiCharTokens: true,
    resolveRow(raw) {
      const label = raw.trim()
      const key = exact.get(label) ?? folded.get(label.toUpperCase())
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

        const cw = bar.columnWidth
        const startsColumn = cw === 1 || x % cw === 0
        // A digit that continues the previous note's fret is not a new note —
        // but only when it is in the same column as that note. Where columns
        // are two characters wide, `7-103---` is 7, then 10, then 3: the 3
        // opens its own column, and treating it as the tail of the 10 dropped
        // it, which is how a bass line lost one note in every bar.
        if (!startsColumn && x > 0 && /[0-9]/.test(segment[x - 1])) continue

        // Two digits are one fret only where they can be: inside a column that
        // is wide enough to hold both. In a bar written one character per
        // column the renderer guarantees no two notes are neighbours, so a
        // digit pair there is still a two-digit fret — but where columns are
        // wider, `9` and `7` in different columns are two notes, and reading
        // them as fret 97 is what swallowed most of a sixteenth-note bass line.
        const room = cw === 1 ? 2 : cw - (x % cw)
        let head = ch
        if (room > 1 && /[0-9]/.test(ch) && /[0-9]/.test(segment[x + 1] ?? '')) head += segment[x + 1]
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

/**
 * Give parsed notes back what the text could not carry.
 *
 * ASCII tab says which fret on which string at which subdivision, and nothing
 * about how long the note rings or how hard it was struck. Applied literally, a
 * round trip through the text view would shorten every note in the track to a
 * sixteenth — including the ones nobody edited.
 *
 * So each parsed note looks for the note that was already at that string and
 * about that beat, and keeps its duration, velocity and id. Only notes that are
 * genuinely new take the default. It is also what makes applying an unedited
 * tab a no-op, which is what stops the editor recording an undo step for it.
 */
export function carryOverNotes(
  previous: StringNote[],
  parsed: StringNote[],
  /**
   * How far a parsed note may have moved and still be the same note.
   *
   * Zero would be right if the text could hold every position, but it cannot:
   * a note recorded at beat 0.969 is drawn on the nearest column and parses
   * back at 1.0. Matching exactly would call that a new note and give it the
   * default sixteenth — which is a track full of clipped notes after a single
   * edit. Half a column is the widest a note can have moved by being written
   * down, so it is the widest that can still be the same note.
   */
  toleranceBeats = 0,
): StringNote[] {
  const byString = new Map<number, StringNote[]>()
  for (const note of previous) {
    const list = byString.get(note.stringIndex)
    if (list) list.push(note)
    else byString.set(note.stringIndex, [note])
  }

  const claimed = new Set<StringNote>()
  return parsed.map(note => {
    const candidates = byString.get(note.stringIndex) ?? []
    let best: StringNote | undefined
    let bestDistance = Infinity
    for (const was of candidates) {
      if (claimed.has(was)) continue
      const distance = Math.abs(was.startBeat - note.startBeat)
      if (distance > toleranceBeats + 1e-9) continue
      // A note that also kept its fret wins over a closer one that did not:
      // the fret is what the edit was probably about.
      const score = distance + (was.fret === note.fret ? 0 : 1e-3)
      if (score < bestDistance) { bestDistance = score; best = was }
    }
    if (!best) return note
    claimed.add(best)
    return {
      ...note,
      id: best.id,
      durationBeats: best.durationBeats,
      velocity: best.velocity,
      // A technique written into the text wins; one the text cannot show is kept.
      technique: note.technique ?? best.technique,
    }
  })
}

/** Order-independent fingerprint, for "did this text actually change anything?". */
export function stringNotesSignature(notes: StringNote[]): string {
  return notes
    .map(n => `${n.stringIndex}:${n.fret}${n.muted ? 'x' : ''}${n.technique ?? ''}@${n.startBeat.toFixed(4)}`)
    .sort()
    .join('|')
}

/**
 * The finest subdivision the tab has to be written in to hold this music.
 *
 * Written tab is a grid, and a grid has a resolution: at sixteenths a triplet
 * has nowhere to go and is drawn on the nearest sixteenth instead. That is a
 * lie the reader cannot see — and worse, applying such a tab writes the lie
 * back into the track, which is how a shuffle came out straight.
 *
 * So the resolution is chosen from the music rather than assumed: the coarsest
 * grid that every note actually lands on. Falling back to 4 keeps the common
 * case (a straight tab) exactly as it was.
 */
export function chooseColumnsPerBeat(notes: StringNote[], fallback = 4): number {
  if (!notes.length) return fallback
  // Sixteenths first, so straight music is unaffected; then triplets, then the
  // finer grids. Beyond 12 the tab is too wide to read and quantising is kinder.
  for (const candidate of [4, 3, 6, 8, 12]) {
    const fits = notes.every(n => {
      const x = n.startBeat * candidate
      return Math.abs(x - Math.round(x)) < 1e-6
    })
    if (fits) return candidate
  }
  return fallback
}
