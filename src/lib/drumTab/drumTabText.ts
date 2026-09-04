import {
  DRUM_ROWS, ROW_BY_PIECE, STEPS_PER_BEAT, makeHitId,
  type DrumHit, type DrumRow, type DrumTrack,
} from './types'

/**
 * ASCII drum tab — the format people actually paste from Ultimate Guitar or
 * Songsterr, and the reason this is a *tab* player and not a drum machine:
 *
 *   CC|x-------|--------|
 *   HH|x-x-x-x-|x-x-x-x-|
 *   SD|----o---|----o---|
 *   BD|o-------|o---o---|
 *
 * One line per kit piece, one column per subdivision, `|` between bars. The
 * prototype's `K . S . K . S .` (one line per *bar*, one token per column)
 * cannot express a kick and a hi-hat on the same subdivision, which rules out
 * every groove there is — hence this format instead.
 */

// Accepted labels per row, beyond the canonical `tabLetter`. Real-world tabs
// are inconsistent about these, and rejecting a paste over the label is a bad
// first impression.
const LABEL_ALIASES: Record<string, string> = {
  B: 'BD', BASS: 'BD', KICK: 'BD', K: 'BD', BD: 'BD',
  S: 'SD', SN: 'SD', SNARE: 'SD', SD: 'SD',
  H: 'HH', HC: 'HH', HHC: 'HH', HIHAT: 'HH', HH: 'HH',
  HO: 'OH', HHO: 'OH', OH: 'OH',
  C: 'CC', CR: 'CC', CRASH: 'CC', CC: 'CC',
  R: 'RD', RC: 'RD', RIDE: 'RD', RD: 'RD',
  T1: 'HT', HT: 'HT', TH: 'HT',
  T2: 'MT', MT: 'MT', TM: 'MT', T: 'MT',
  T3: 'FT', FT: 'FT', TF: 'FT', FLOOR: 'FT',
  HF: 'HF', HHF: 'HF', F: 'HF',
  CS: 'CS', XS: 'CS', RIM: 'CS',
}

const ROW_BY_LETTER: Record<string, DrumRow> = Object.fromEntries(
  DRUM_ROWS.map(r => [r.tabLetter, r]),
)

/** Cymbals, hats and the cross stick are written with `x`; drums with `o`. */
function isXHead(pieceId: string): boolean {
  return pieceId.startsWith('hh-') || pieceId.startsWith('crash') || pieceId.startsWith('ride') || pieceId === 'stick'
}

const HIT_CHARS = new Set(['o', 'O', 'x', 'X', 'd', 'D', 'b', 'B'])
const GHOST_CHARS = new Set(['g', 'G'])

function resolveRow(rawLabel: string): DrumRow | null {
  const key = rawLabel.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  if (!key) return null
  const letter = LABEL_ALIASES[key] ?? key
  return ROW_BY_LETTER[letter] ?? null
}

interface ParsedLine {
  row: DrumRow
  /** Columns grouped by bar, in source order. */
  bars: string[]
}

function splitBars(body: string): string[] {
  // Leading/trailing pipes produce empty segments; drop those but keep interior
  // ones so an intentionally blank bar still counts as a bar.
  const parts = body.split('|')
  if (parts.length > 1) {
    if (parts[0].trim() === '') parts.shift()
    if (parts.length && parts[parts.length - 1].trim() === '') parts.pop()
  }
  return parts.length ? parts : [body]
}

export interface ParseResult {
  hits: DrumHit[]
  bars: number
  /** Lines that looked like tab but whose label wasn't recognised. */
  unknownLabels: string[]
}

export function parseDrumTab(text: string, beatsPerBar = 4): ParseResult {
  const lines = text.split(/\r?\n/)
  const parsed: ParsedLine[] = []
  const unknownLabels: string[] = []

  for (const line of lines) {
    if (!line.trim()) continue
    const pipe = line.indexOf('|')
    if (pipe < 0) continue
    const label = line.slice(0, pipe)
    const row = resolveRow(label)
    if (!row) {
      const cleaned = label.trim()
      if (cleaned) unknownLabels.push(cleaned)
      continue
    }
    parsed.push({ row, bars: splitBars(line.slice(pipe)) })
  }

  if (!parsed.length) return { hits: [], bars: 0, unknownLabels }

  const barCount = Math.max(...parsed.map(p => p.bars.length))

  // Resolution is per bar, taken from the widest line for that bar: a tab that
  // writes eighths on the kick line and sixteenths on the hats still lines up.
  const colsPerBar: number[] = []
  for (let bar = 0; bar < barCount; bar++) {
    const widths = parsed
      .map(p => (p.bars[bar] ?? '').replace(/\s+$/, '').length)
      .filter(w => w > 0)
    colsPerBar[bar] = widths.length ? Math.max(...widths) : beatsPerBar * STEPS_PER_BEAT
  }

  const hits: DrumHit[] = []
  for (const { row, bars } of parsed) {
    for (let bar = 0; bar < bars.length; bar++) {
      const segment = bars[bar]
      const cols = colsPerBar[bar]
      if (!cols) continue
      const beatPerCol = beatsPerBar / cols
      for (let c = 0; c < segment.length && c < cols; c++) {
        const ch = segment[c]
        let velocity: number
        if (GHOST_CHARS.has(ch)) velocity = 0.5
        else if (HIT_CHARS.has(ch)) velocity = ch === ch.toUpperCase() ? 1 : row.defaultVel
        else continue
        hits.push({
          id: makeHitId(),
          pieceId: row.id,
          startBeat: bar * beatsPerBar + c * beatPerCol,
          velocity,
        })
      }
    }
  }

  hits.sort((a, b) => a.startBeat - b.startBeat)
  return { hits, bars: barCount, unknownLabels }
}

/** Rows always shown in the text view even when empty, so there is somewhere to type. */
const ALWAYS_SHOWN = new Set(['crash-edge', 'hh-closed', 'snare', 'kick'])

export function toDrumTab(track: DrumTrack, stepsPerBeat = STEPS_PER_BEAT): string {
  const colsPerBar = track.beatsPerBar * stepsPerBeat
  const used = new Set(track.hits.map(h => h.pieceId))
  const rows = DRUM_ROWS.filter(r => used.has(r.id) || ALWAYS_SHOWN.has(r.id))
  const labelW = Math.max(...rows.map(r => r.tabLetter.length))

  return rows.map(row => {
    const grid: string[] = Array(track.totalBars * colsPerBar).fill('-')
    for (const hit of track.hits) {
      if (hit.pieceId !== row.id) continue
      const col = Math.round(hit.startBeat * stepsPerBeat)
      if (col < 0 || col >= grid.length) continue
      const base = isXHead(row.id) ? 'x' : 'o'
      grid[col] = hit.velocity <= 0.55 ? 'g' : hit.velocity >= 0.95 ? base.toUpperCase() : base
    }
    const bars: string[] = []
    for (let bar = 0; bar < track.totalBars; bar++) {
      bars.push(grid.slice(bar * colsPerBar, (bar + 1) * colsPerBar).join(''))
    }
    return `${row.tabLetter.padEnd(labelW)}|${bars.join('|')}|`
  }).join('\n')
}

/** Legend for the text editor — same idea as the prototype's, over real labels. */
export const TAB_LEGEND = DRUM_ROWS.map(r => ({
  letter: r.tabLetter,
  label: r.label,
  char: isXHead(r.id) ? 'x' : 'o',
}))

export { isXHead, ROW_BY_PIECE }
