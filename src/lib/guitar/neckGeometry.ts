import type { GuitarVoicing } from '@/data/guitarChords'

/**
 * Layout for a *playable* guitar neck: a window of frets where every cell can be
 * clicked, rather than a chord diagram.
 *
 * This is deliberately a separate module from `guitarStrum/fretboardGeometry.ts`,
 * which solves a different problem: that one takes a GuitarVoicing and returns dots
 * only where that chord falls, over a fixed 5-fret window anchored to the chord's
 * baseFret. It cannot draw fret 7 of the D string unless the chord happens to use it,
 * so it cannot back an instrument you play. The visual language is shared on purpose
 * -- same wood, nut, inlays and string weights -- so the two boards read as one family.
 *
 * STRING INDEX CONVENTION, and it is the opposite of the one voicings use:
 *   here, and in guitarTab/guitarTheory.ts, row 0 is the HIGH e (thinnest, top of the
 *   screen) and row 5 is the LOW E. GuitarVoicing.frets runs the other way, low E
 *   first. Everything crossing that boundary goes through voicingToRows() below --
 *   getting this backwards plays a chord upside down and sounds almost right, which
 *   is the worst kind of wrong.
 */

/** Thickness in px before scaling, high e -> low E (matches this module's row order). */
const STRING_WEIGHT = [1.8, 2.3, 2.9, 3.6, 4.3, 5]

/** Frets carrying a position inlay on a standard neck. Multiples of 12 get a double dot. */
const INLAY_FRETS = [3, 5, 7, 9, 12, 15, 17, 19, 21]

export interface NeckString {
  d: string
  strokeWidth: number
  label: string
  leftPct: number
  topPct: number
  fontSize: number
}

export interface NeckGeometry {
  width: number
  height: number
  viewBox: string
  /** First and last fret drawn, inclusive. fretFrom 0 means the open column is shown. */
  fretFrom: number
  fretTo: number
  /** y centre of each string row, index 0 = high e. */
  ys: number[]
  gap: number
  /** x where the fretted area starts (right of the nut). */
  x0: number
  x1: number
  slotW: number
  /** The open-string column, left of the nut. Null when fretFrom > 0. */
  openCol: { x: number; w: number } | null
  nut: { x: number; y: number; w: number; h: number }
  board: { x: number; y: number; w: number; h: number }
  fretLines: { x: number; y: number; w: number; h: number }[]
  inlays: { x: number; y: number; r: number }[]
  fretNumbers: { fret: number; leftPct: number; topPct: number; fontSize: number }[]
  strings: NeckString[]
  dotR: number
}

export interface NeckOptions {
  fretFrom?: number
  fretTo?: number
  stringLabels?: string[]
}

const DEFAULT_LABELS = ['e', 'B', 'G', 'D', 'A', 'E']

/**
 * How many frets fit before the cells get too narrow to hit with a thumb. 7 is the
 * floor the bass tab fretboard already settled on for the same reason; 12 closes the
 * octave and puts the double inlay on screen, which is the point of a 12th fret.
 */
export function fretsForWidth(containerW: number): number {
  if (containerW < 520) return 7
  if (containerW < 760) return 9
  return 12
}

export function computeNeckGeometry(
  containerW: number,
  containerH: number,
  opts: NeckOptions = {},
): NeckGeometry {
  const W = Math.max(320, containerW || 900)
  const H = Math.max(190, containerH || 320)

  const fretFrom = opts.fretFrom ?? 0
  const fretTo = Math.max(fretFrom + 2, opts.fretTo ?? fretsForWidth(W))
  const labels = opts.stringLabels ?? DEFAULT_LABELS

  const gutter = 28
  const nutW = Math.max(5, Math.round(W * 0.007))
  const footerH = 56
  const usable = Math.max(120, H - footerH)
  const gap = Math.max(20, Math.min(44, (usable - 30) / 5))
  const padY = Math.max(8, (usable - gap * 5) / 2)

  const showOpen = fretFrom === 0
  const openW = showOpen ? Math.max(30, Math.min(52, W * 0.052)) : 0
  const openX = gutter
  const x0 = gutter + openW + nutW
  const x1 = W - 2
  const firstFretted = showOpen ? 1 : fretFrom
  const frettedCount = fretTo - firstFretted + 1
  const slotW = (x1 - x0) / frettedCount

  const ys = [0, 1, 2, 3, 4, 5].map(i => +(padY + i * gap).toFixed(1))
  const dotR = Math.min(gap * 0.42, slotW * 0.36, 20)
  const sScale = Math.min(1.4, Math.max(0.7, gap / 44))

  const boardY = +(padY - gap * 0.5).toFixed(1)
  const boardH = +(gap * 6).toFixed(1)

  const fretLines: { x: number; y: number; w: number; h: number }[] = []
  for (let k = 1; k <= frettedCount; k++) {
    fretLines.push({
      x: +(x0 + k * slotW).toFixed(1),
      y: boardY,
      w: Math.max(1.5, Math.round(W * 0.0022)),
      h: boardH,
    })
  }

  const inlays: { x: number; y: number; r: number }[] = []
  const fretNumbers: NeckGeometry['fretNumbers'] = []
  for (let f = firstFretted; f <= fretTo; f++) {
    if (!INLAY_FRETS.includes(f)) continue
    const cx = x0 + (f - firstFretted + 0.5) * slotW
    const r = Math.max(4, Math.round(gap * 0.14))
    if (f % 12 === 0) {
      inlays.push({ x: +cx.toFixed(1), y: +(padY + gap * 1.5).toFixed(1), r })
      inlays.push({ x: +cx.toFixed(1), y: +(padY + gap * 3.5).toFixed(1), r })
    } else {
      inlays.push({ x: +cx.toFixed(1), y: +(padY + gap * 2.5).toFixed(1), r })
    }
    fretNumbers.push({
      fret: f,
      leftPct: (cx / W) * 100,
      topPct: ((padY + gap * 5 + gap * 0.7) / H) * 100,
      fontSize: Math.max(9, Math.round(Math.min(13, gap * 0.3))),
    })
  }

  const strings: NeckString[] = [0, 1, 2, 3, 4, 5].map(i => ({
    d: `M${showOpen ? openX : x0} ${ys[i]} L${x1} ${ys[i]}`,
    strokeWidth: +(STRING_WEIGHT[i] * sScale).toFixed(2),
    label: labels[i],
    leftPct: (gutter / 2 / W) * 100,
    topPct: (ys[i] / H) * 100,
    fontSize: Math.max(11, Math.round(Math.min(15, gap * 0.34))),
  }))

  return {
    width: W,
    height: H,
    viewBox: `0 0 ${W} ${H}`,
    fretFrom,
    fretTo,
    ys,
    gap,
    x0,
    x1,
    slotW,
    openCol: showOpen ? { x: openX, w: openW } : null,
    nut: { x: gutter + openW, y: +(padY - gap * 0.6).toFixed(1), w: nutW, h: +(gap * 6.2).toFixed(1) },
    board: { x: x0, y: boardY, w: x1 - x0, h: boardH },
    fretLines,
    inlays,
    fretNumbers,
    strings,
    dotR,
  }
}

/** Centre x of a fret cell, in viewBox units. Fret 0 lands in the open column. */
export function cellX(geo: NeckGeometry, fret: number): number {
  if (fret === 0 && geo.openCol) return geo.openCol.x + geo.openCol.w / 2
  const first = geo.fretFrom === 0 ? 1 : geo.fretFrom
  return geo.x0 + (fret - first + 0.5) * geo.slotW
}

/**
 * Which cell a pointer is over, in viewBox units. Returns null outside the strings,
 * so a stray touch on the wood does not fire a note. The row tolerance mirrors the
 * strumming board's 0.62 of a string gap.
 */
export function hitCell(geo: NeckGeometry, xv: number, yv: number): { row: number; fret: number } | null {
  const row = rowFromY(geo, yv)
  if (row < 0) return null

  if (geo.openCol && xv < geo.openCol.x + geo.openCol.w + 2) {
    return xv < geo.openCol.x ? null : { row, fret: 0 }
  }
  const first = geo.fretFrom === 0 ? 1 : geo.fretFrom
  const fret = first + Math.floor((xv - geo.x0) / geo.slotW)
  if (fret < first || fret > geo.fretTo) return null
  return { row, fret }
}

/** Nearest string row for a pointer y, or -1 when the pointer is off the strings. */
export function rowFromY(geo: NeckGeometry, yv: number): number {
  let row = -1
  let best = Infinity
  for (let i = 0; i < 6; i++) {
    const d = Math.abs(yv - geo.ys[i])
    if (d < best) { best = d; row = i }
  }
  return best < geo.gap * 0.62 ? row : -1
}

/**
 * GuitarVoicing.frets is low-E-first; this module and guitarTab/guitarTheory.ts are
 * high-e-first. Every crossing of that boundary goes through here.
 * Returns one entry per row: the fret to play, or -1 for a muted string.
 */
export function voicingToRows(voicing: GuitarVoicing): number[] {
  return [0, 1, 2, 3, 4, 5].map(row => voicing.frets[5 - row] ?? -1)
}

/** Highest fret a shape actually reaches, so the window can widen to contain it. */
export function voicingTopFret(voicing: GuitarVoicing): number {
  return voicing.frets.reduce((m, f) => (f > m ? f : m), 0)
}
