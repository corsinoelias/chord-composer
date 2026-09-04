import {
  DEFAULT_RENDER, REST_CHAR,
  type RenderOptions, type RenderedColumn, type RenderedSystem, type RenderedTab,
  type TabTextModel,
} from './types'

/**
 * Model → text, plus the character position of every column.
 *
 * Column width is measured, not assumed: each column is as wide as the widest
 * token any row puts in it. That is what lets one renderer print a drum tab
 * (one character per column) and a guitar tab (two-digit frets, technique
 * markers) without either of them needing a special case — and it retires the
 * "protect the next dash so 12 doesn't bleed" hack the bass tab was using.
 */

function repeat(ch: string, n: number): string {
  return n > 0 ? ch.repeat(n) : ''
}

/** The count line: `1 + 2 + 3 + 4 +`, aligned to the columns above it. */
function rulerFor(
  columns: RenderedColumn[],
  lineWidth: number,
  columnsPerBeat: number,
  beatsPerBar: number,
): string {
  const chars = Array<string>(lineWidth).fill(' ')
  for (const col of columns) {
    const within = col.index % columnsPerBeat
    const beatInBar = Math.floor(col.beat % beatsPerBar) + 1
    let mark = ''
    if (within === 0) mark = String(beatInBar)
    else if (columnsPerBeat % 2 === 0 && within === columnsPerBeat / 2) mark = '+'
    if (!mark) continue
    for (let i = 0; i < mark.length && col.x + i < lineWidth; i++) {
      chars[col.x + i] = mark[i]
    }
  }
  return chars.join('').replace(/\s+$/, '')
}

export function renderTab(model: TabTextModel, options: RenderOptions = {}): RenderedTab {
  const opts = { ...DEFAULT_RENDER, ...options }
  const rest = REST_CHAR[opts.rest]
  const gap = opts.spacing === 'spaced' ? 1 : 0
  const colsPerBar = model.beatsPerBar * model.columnsPerBeat
  const totalBars = Math.max(1, model.totalBars)
  const perSystem = opts.barsPerSystem > 0 ? opts.barsPerSystem : totalBars
  const labelWidth = Math.max(1, ...model.rows.map(r => r.label.length))

  const lines: string[] = []
  const columns: RenderedColumn[] = []
  const systems: RenderedSystem[] = []

  if (opts.header && model.header) {
    lines.push(model.header, '')
  }

  for (let startBar = 0, systemIndex = 0; startBar < totalBars; startBar += perSystem, systemIndex++) {
    const barCount = Math.min(perSystem, totalBars - startBar)

    if (opts.sections && model.sections?.length) {
      for (const section of model.sections) {
        if (section.startBar >= startBar && section.startBar < startBar + barCount) {
          lines.push(`// ${section.name}`)
        }
      }
    }

    // Pass 1: how wide is each column in this system? A column is as wide as
    // the widest token any row writes in it, so every row stays aligned.
    const width: number[] = []
    for (let c = 0; c < barCount * colsPerBar; c++) {
      const globalCol = startBar * colsPerBar + c
      let w = 1
      for (const row of model.rows) {
        const token = model.cells.get(row.key)?.get(globalCol)
        if (token && token.length > w) w = token.length
      }
      width[c] = w + gap
    }

    // …unless the bar has been asked to stay a grid, in which case its widest
    // column sets the width for all of them. See `RenderOptions.columnWidth`.
    if (opts.columnWidth === 'bar') {
      for (let bar = 0; bar < barCount; bar++) {
        const from = bar * colsPerBar
        let barWidth = Math.max(...width.slice(from, from + colsPerBar))

        // A bar where two neighbouring columns both hold a token cannot be
        // written one character wide without lying: `9` then `7` on the same
        // string reads as fret 97, and that is exactly how a bass line of
        // sixteenths came back with two thirds of its notes missing. Widening
        // the bar puts a rest between them, so a two-digit number is a
        // two-digit number and adjacent notes are adjacent notes.
        // `width` already carries the separator, so the comparison is against
        // `2 + gap` rather than 2.
        if (barWidth < 2 + gap) {
          for (const row of model.rows) {
            const cells = model.cells.get(row.key)
            if (!cells) continue
            for (let c = 1; c < colsPerBar; c++) {
              const here = startBar * colsPerBar + from + c
              if (cells.get(here) && cells.get(here - 1)) { barWidth = 2 + gap; break }
            }
            if (barWidth >= 2 + gap) break
          }
        }

        for (let c = from; c < from + colsPerBar; c++) width[c] = barWidth
      }
    }

    // Pass 2: the rows themselves, recording where each column landed.
    const systemColumns: RenderedColumn[] = []
    const firstLine = lines.length
    let lineWidth = 0

    model.rows.forEach((row, rowIndex) => {
      const cells = model.cells.get(row.key)
      let line = row.label.padEnd(labelWidth) + '|'
      for (let bar = 0; bar < barCount; bar++) {
        for (let c = 0; c < colsPerBar; c++) {
          const local = bar * colsPerBar + c
          const globalCol = startBar * colsPerBar + local
          const w = width[local]
          const token = cells?.get(globalCol) ?? ''
          // Positions are read off the first row only — every row is identical
          // by construction, and recording them once per row would multiply
          // the column list by the number of rows.
          if (rowIndex === 0) {
            systemColumns.push({
              index: globalCol,
              bar: startBar + bar,
              beat: (startBar + bar) * model.beatsPerBar + c / model.columnsPerBeat,
              system: systemIndex,
              x: line.length,
              width: w,
            })
          }
          line += (token || rest) + repeat(rest, w - (token ? token.length : 1))
        }
        line += '|'
      }
      lines.push(line)
      lineWidth = Math.max(lineWidth, line.length)
    })

    columns.push(...systemColumns)
    systems.push({
      index: systemIndex,
      startBar,
      barCount,
      firstLine,
      rowLines: model.rows.length,
      labelWidth,
    })

    if (opts.ruler) {
      lines.push(rulerFor(systemColumns, lineWidth, model.columnsPerBeat, model.beatsPerBar))
    }
    if (startBar + barCount < totalBars) lines.push('')
  }

  return { text: lines.join('\n'), columns, systems }
}

/**
 * The column sounding at a beat, for a playhead. Returns the last column at or
 * before the beat, which is what "where is the music right now" means when the
 * beat falls between two columns.
 */
export function columnAtBeat(columns: RenderedColumn[], beat: number): RenderedColumn | null {
  let lo = 0
  let hi = columns.length - 1
  let found: RenderedColumn | null = null
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (columns[mid].beat <= beat + 1e-6) {
      found = columns[mid]
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return found
}
