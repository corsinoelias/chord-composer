import type { ParsedCell, ParsedRow, ParsedTab, TabTextSection } from './types'
import { isRestChar } from './types'

/**
 * Text → geometry: which rows, which bars, and what beat each character
 * position is. What a character *means* is the adapter's job.
 *
 * Three things here are not in the per-instrument parsers this replaces, and
 * each of them was a real failure:
 *
 * 1. **Systems.** A tab wraps: four bars per line, then the next four below.
 *    The old parser gave every `HH|` line bar 0, so pasting a two-system groove
 *    stacked the second system on top of the first — 40 hits where there were
 *    20, in half the bars.
 * 2. **The count line is the alignment key.** `1 + 2 + 3 + 4 +` was skipped as
 *    noise, and the resolution guessed from how many characters the widest line
 *    happened to have. In a tab with uneven column widths — every dotted tab in
 *    the wild — that guess put hits at 0.53 and 2.13 beats. When the count line
 *    is there, positions are interpolated between its marks instead, and the
 *    column widths can be anything.
 * 3. **Rests are declared.** Treating "any character I don't recognise" as a
 *    rest silently swallowed typos. Unrecognised characters are now reported
 *    the way unrecognised labels always were.
 */

export interface ParsedBar {
  bar: number
  /** Character range of the bar's contents within the line. */
  start: number
  end: number
  /** Inferred width of one column, in characters. */
  columnWidth: number
  /** Inferred columns in this bar. */
  columns: number
  /** Absolute beat for a character offset relative to `start`. */
  beatAt(x: number): number
}

export interface ParsedRowGeometry extends ParsedRow {
  bars: { bar: ParsedBar; text: string }[]
}

export interface ParseOptions {
  beatsPerBar?: number
  /** Instrument's label dictionary: `'HH'`/`'hihat'` → a row key. */
  resolveRow(label: string): { key: string; label: string } | null
  /**
   * Characters that are legal in a hit position but are not tokens — technique
   * markers, ties. Reported as unknown otherwise.
   */
  ignoreChars?: Set<string>
}

export interface ParsedTabGeometry extends ParsedTab {
  rows: ParsedRowGeometry[]
}

/** Subdivisions per beat a tab is allowed to be written in. */
const SUBDIVISIONS = [1, 2, 3, 4, 6, 8, 12, 16]

function isRulerLine(line: string): boolean {
  const stripped = line.replace(/[\s|]/g, '')
  if (!stripped) return false
  return /^[0-9+&aeu.·-]+$/i.test(stripped) && /[0-9]/.test(stripped)
}

function sectionName(line: string): string | null {
  const m = line.match(/^\s*(?:\/\/|#+|;)\s*(.+?)\s*$/) ?? line.match(/^\s*\[(.+?)\]\s*$/)
  return m ? m[1].trim() : null
}

/** Character offsets of the `|` separators, i.e. the bar boundaries. */
function pipePositions(line: string): number[] {
  const out: number[] = []
  for (let i = 0; i < line.length; i++) if (line[i] === '|') out.push(i)
  return out
}

/**
 * Beat markers in one bar's slice of the count line: `1` … `4` are beats,
 * `+` is the half after the previous one, `e`/`a` the sixteenths around it.
 */
function rulerMarkers(slice: string): { x: number; beat: number }[] {
  const marks: { x: number; beat: number }[] = []
  let lastBeat = -1
  for (let i = 0; i < slice.length; i++) {
    const ch = slice[i]
    if (ch >= '1' && ch <= '9') {
      lastBeat = Number(ch) - 1
      marks.push({ x: i, beat: lastBeat })
    } else if (ch === '+' || ch === '&') {
      if (lastBeat < 0) continue
      marks.push({ x: i, beat: lastBeat + 0.5 })
    } else if (ch === 'e' || ch === 'E') {
      if (lastBeat < 0) continue
      marks.push({ x: i, beat: lastBeat + 0.25 })
    } else if (ch === 'a' || ch === 'A') {
      if (lastBeat < 0) continue
      marks.push({ x: i, beat: lastBeat + 0.75 })
    }
  }
  return marks
}

/**
 * Uniform grid inference, for tabs written without a count line.
 *
 * Prefers the *widest* column that explains every token position, so a spaced
 * tab (`x x X x`) reads as eight columns of two characters rather than sixteen
 * thirty-seconds — the mistake that put the dotted examples off the grid.
 */
function inferGrid(
  width: number,
  tokenXs: number[],
  beatsPerBar: number,
): { columnWidth: number; columns: number } {
  const candidates: { columnWidth: number; columns: number }[] = []
  for (let cw = 4; cw >= 1; cw--) {
    if (width % cw !== 0) continue
    const columns = width / cw
    if (columns % beatsPerBar !== 0) continue
    if (!SUBDIVISIONS.includes(columns / beatsPerBar)) continue
    if (tokenXs.some(x => x % cw !== 0)) continue
    candidates.push({ columnWidth: cw, columns })
  }
  if (candidates.length) return candidates[0]

  // Nothing divides cleanly — a ragged paste. One character per column, and the
  // beats fall where they fall; this is what the old parsers always did.
  return { columnWidth: 1, columns: Math.max(1, width) }
}

function makeBar(
  bar: number,
  start: number,
  end: number,
  beatsPerBar: number,
  tokenXs: number[],
  ruler: string | null,
): ParsedBar {
  const width = end - start
  const marks = ruler ? rulerMarkers(ruler) : []

  if (marks.length >= 2) {
    const barBeat = bar * beatsPerBar
    const slope = (marks[marks.length - 1].beat - marks[0].beat)
      / Math.max(1, marks[marks.length - 1].x - marks[0].x)
    return {
      bar,
      start,
      end,
      columnWidth: 1,
      columns: width,
      beatAt(x: number) {
        if (x <= marks[0].x) return barBeat + marks[0].beat + (x - marks[0].x) * slope
        for (let i = 1; i < marks.length; i++) {
          if (x <= marks[i].x) {
            const a = marks[i - 1]
            const b = marks[i]
            const t = b.x === a.x ? 0 : (x - a.x) / (b.x - a.x)
            return barBeat + a.beat + t * (b.beat - a.beat)
          }
        }
        const last = marks[marks.length - 1]
        return barBeat + last.beat + (x - last.x) * slope
      },
    }
  }

  const { columnWidth, columns } = inferGrid(width, tokenXs, beatsPerBar)
  const beatPerColumn = beatsPerBar / columns
  return {
    bar,
    start,
    end,
    columnWidth,
    columns,
    beatAt(x: number) {
      return bar * beatsPerBar + Math.floor(x / columnWidth) * beatPerColumn
    },
  }
}

/**
 * One row's slice of a bar.
 *
 * The bar boundaries come from the system's widest line, so a row that is a
 * character short — which hand-typed and hand-edited tabs constantly are —
 * would otherwise have the next bar's `|` fall inside its slice and be read as
 * a stroke. Cutting there costs that row the tail of a bar it did not write
 * anyway, and keeps a ragged paste readable.
 */
function barSlice(line: string, start: number, end: number): string {
  const segment = line.slice(start, end)
  const pipe = segment.indexOf('|')
  return pipe >= 0 ? segment.slice(0, pipe) : segment
}

interface SystemLine {
  key: string
  label: string
  /** The label as written, which is what tells one system from the next. */
  rawLabel: string
  text: string
}

export function parseTabGeometry(text: string, options: ParseOptions): ParsedTabGeometry {
  const beatsPerBar = options.beatsPerBar ?? 4
  const ignore = options.ignoreChars ?? new Set<string>()
  const lines = text.split(/\r?\n/)

  const unknownLabels: string[] = []
  const unknownChars = new Set<string>()
  const sections: TabTextSection[] = []
  const rows = new Map<string, ParsedRowGeometry>()

  /** Bars consumed by the systems already read — where the next one starts. */
  let barCursor = 0
  let current: SystemLine[] = []
  let currentRuler: string | null = null
  let pendingSection: string | null = null

  const flush = (): void => {
    if (!current.length) {
      currentRuler = null
      return
    }

    // Bars are the pipe-separated segments. The row with the most of them sets
    // the system's layout; the count line is sliced with those same offsets,
    // which is what keeps it aligned to the columns above it.
    const layoutLine = current.reduce((a, b) => (
      pipePositions(b.text).length >= pipePositions(a.text).length ? b : a
    )).text
    const pipes = pipePositions(layoutLine)
    const bounds: { start: number; end: number }[] = []
    for (let i = 0; i + 1 < pipes.length; i++) {
      bounds.push({ start: pipes[i] + 1, end: pipes[i + 1] })
    }
    if (!bounds.length && pipes.length === 1) {
      bounds.push({ start: pipes[0] + 1, end: layoutLine.length })
    }
    if (!bounds.length) {
      current = []
      currentRuler = null
      return
    }

    if (pendingSection) {
      sections.push({ name: pendingSection, startBar: barCursor })
      pendingSection = null
    }

    bounds.forEach((bound, barInSystem) => {
      // Token positions across every row, so the grid is inferred from the
      // whole system rather than from whichever line happened to be widest.
      const tokenXs: number[] = []
      for (const line of current) {
        const seg = barSlice(line.text, bound.start, bound.end)
        for (let x = 0; x < seg.length; x++) {
          if (!isRestChar(seg[x])) tokenXs.push(x)
        }
      }

      const rulerSlice = currentRuler
        ? currentRuler.slice(bound.start, bound.end)
        : null

      const bar = makeBar(
        barCursor + barInSystem,
        bound.start,
        bound.end,
        beatsPerBar,
        tokenXs,
        rulerSlice && /\d/.test(rulerSlice) ? rulerSlice : null,
      )

      for (const line of current) {
        const segment = barSlice(line.text, bound.start, bound.end)
        let row = rows.get(line.key)
        if (!row) {
          row = { key: line.key, label: line.label, cells: [], segments: [], bars: [] }
          rows.set(line.key, row)
        }
        row.bars.push({ bar, text: segment })
        row.segments.push({
          bar: bar.bar,
          text: segment,
          startBeat: bar.bar * beatsPerBar,
          columnWidth: bar.columnWidth,
          columns: bar.columns,
        })

        for (let x = 0; x < segment.length; x++) {
          const ch = segment[x]
          if (isRestChar(ch) || ignore.has(ch)) continue
          const cell: ParsedCell = {
            column: Math.floor(x / bar.columnWidth),
            beat: bar.beatAt(x),
            text: segment.slice(x, x + Math.max(1, bar.columnWidth)),
            x,
            width: bar.columnWidth,
          }
          row.cells.push(cell)
        }
      }
    })

    barCursor += bounds.length
    current = []
    currentRuler = null
  }

  for (const raw of lines) {
    if (!raw.trim()) {
      flush()
      continue
    }

    const pipe = raw.indexOf('|')
    if (pipe >= 0) {
      const rawLabel = raw.slice(0, pipe).trim().toUpperCase()
      const resolved = options.resolveRow(raw.slice(0, pipe))
      if (resolved) {
        // A label repeating inside the same system means the next system began
        // without a blank line between them. Compared by the label as written
        // rather than by the resolved row: two different labels in one block are
        // two rows, even where the instrument happens to map them to the same
        // one, and splitting there would cut a system in half.
        if (current.some(l => l.rawLabel === rawLabel)) flush()
        current.push({ key: resolved.key, label: resolved.label, rawLabel, text: raw })
        continue
      }
    }

    if (isRulerLine(raw)) {
      currentRuler = raw
      continue
    }

    const name = sectionName(raw)
    if (name) {
      flush()
      pendingSection = name
      continue
    }

    if (pipe >= 0) {
      const label = raw.slice(0, pipe).trim()
      if (label) unknownLabels.push(label)
    }
  }
  flush()

  // Report characters that sat in a hit position and matched nothing. Done at
  // the end so the adapter's own token rules have had their say via ignoreChars.
  for (const row of rows.values()) {
    for (const cell of row.cells) {
      const ch = cell.text[0]
      if (ch && !/[A-Za-z0-9+#><\\^~()/]/.test(ch)) unknownChars.add(ch)
    }
  }

  return {
    rows: [...rows.values()],
    bars: barCursor,
    beatsPerBar,
    sections,
    unknownLabels,
    unknownChars: [...unknownChars],
  }
}
