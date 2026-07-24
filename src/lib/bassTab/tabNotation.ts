import type { BassNote } from './types'

// ── Layout constants ───────────────────────────────────────────────────────
export const STRING_Y    = [0, 12, 24, 36] as const  // y per string G D A E
export const STAFF_H     = 36
export const ABOVE_H     = 52    // space above staff (section, tempo, bar nums)
export const BELOW_H     = 34    // space below staff (tick marks + beam)
export const LABEL_W     = 54    // left margin — fits bass clef + time signature
export const PPB         = 80    // pixels per beat at zoom = 1
export const NOTE_GAP    = 20    // gap width in string line at note position
export const CURSOR_HEAD = 22    // how far above staff the cursor extends

export const TICK_OFFSET = 14    // px from staff bottom to tick top
export const TICK_H      = 18    // tick mark height

// ── Coordinate helpers ─────────────────────────────────────────────────────
export function beatToX(beat: number, pxPerBeat: number): number {
  return LABEL_W + beat * pxPerBeat
}

export function barLineX(bar: number, bpb: number, ppb: number): number {
  return LABEL_W + bar * bpb * ppb
}

export function xToBeat(x: number, pxPerBeat: number): number {
  return (x - LABEL_W) / pxPerBeat
}

export function yToStringIndex(staffY: number): 0 | 1 | 2 | 3 {
  let best = 0
  let bestDist = Math.abs(STRING_Y[0] - staffY)
  for (let i = 1; i < 4; i++) {
    const d = Math.abs(STRING_Y[i] - staffY)
    if (d < bestDist) { bestDist = d; best = i }
  }
  return best as 0 | 1 | 2 | 3
}

export function svgTotalWidth(totalBars: number, bpb: number, ppb: number): number {
  return barLineX(totalBars, bpb, ppb) + 4
}

// ── Beam groups for duration-aware rendering ──────────────────────────────
export interface BeamGroup {
  beamX1: number
  beamX2: number
  level: 1 | 2  // 1 = single beam (eighth), 2 = double beam (sixteenth)
}

export function computeBeamGroups(
  notes: BassNote[],
  bar: number,
  bpb: number,
  ppb: number,
): BeamGroup[] {
  const barStart  = bar * bpb
  const numGroups = Math.max(1, Math.round(bpb / 2))  // split into half-bar groups
  const groupSize = bpb / numGroups
  const result: BeamGroup[] = []

  for (let g = 0; g < numGroups; g++) {
    const gStart = barStart + g * groupSize
    const gEnd   = gStart + groupSize

    const gNotes = notes
      .filter(n => n.durationBeats < 1.0 && n.startBeat >= gStart && n.startBeat < gEnd)
      .sort((a, b) => a.startBeat - b.startBeat)

    if (gNotes.length < 2) continue

    const xs     = gNotes.map(n => beatToX(n.startBeat, ppb))
    const minDur = Math.min(...gNotes.map(n => n.durationBeats))
    result.push({
      beamX1: xs[0],
      beamX2: xs[xs.length - 1],
      level:  minDur < 0.5 ? 2 : 1,
    })
  }

  return result
}

// ── String path with gaps at note x-positions ─────────────────────────────
/**
 * `fromX` existe porque la tablatura se maqueta por sistemas: cada línea dibuja
 * su tramo de cuerda, no la cuerda entera. Por omisión arranca en el margen
 * izquierdo, que es el caso de una sola línea.
 */
export function buildStringPath(
  si: number,
  notes: BassNote[],
  totalW: number,
  ppb: number,
  fromX: number = LABEL_W,
): string {
  const y    = STRING_Y[si] + 0.5
  const half = NOTE_GAP / 2

  const onStr = [...notes.filter(n => n.stringIndex === si)]
    .sort((a, b) => a.startBeat - b.startBeat)

  if (onStr.length === 0) return `M${fromX},${y} H${totalW}`

  // Build gap intervals [left, right]
  const gaps: [number, number][] = onStr.map(n => {
    const cx = beatToX(n.startBeat, ppb)
    return [Math.max(fromX, cx - half), cx + half]
  })

  // Merge overlapping gaps
  const merged: [number, number][] = []
  for (const g of gaps) {
    const last = merged[merged.length - 1]
    if (last && g[0] <= last[1]) last[1] = Math.max(last[1], g[1])
    else merged.push([g[0], g[1]])
  }

  // Build SVG path segments: line from cursor to gap start, skip gap, repeat
  const segs: string[] = []
  let x = fromX
  for (const [l, r] of merged) {
    if (l > x) segs.push(`M${x.toFixed(1)},${y} H${l.toFixed(1)}`)
    x = r
  }
  if (x < totalW) segs.push(`M${x.toFixed(1)},${y} H${totalW}`)

  return segs.join(' ') || `M${fromX},${y} H${totalW}`
}
