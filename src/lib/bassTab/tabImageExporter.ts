import type { BassTrack } from './types'

// ── Palette (dark, matches the app) ──────────────────────────────────────────
const D = {
  bg:          '#0d1018',
  panel:       '#131720',
  surface:     '#191e2c',
  string:      '#28304a',
  stringLabel: '#4a5370',
  noteBox:     '#1c2236',
  noteBorder:  '#303a58',
  noteFret:    '#c2cad8',
  accent:      '#7c4dff',
  accentDim:   '#321a6a',
  barLine:     '#202638',
  rulerText:   '#353d58',
  barLabel:    '#424c68',
  sectionText: '#9b7eff',
  trackName:   '#e0e6f0',
  trackMeta:   '#424c68',
  credit:      '#222840',
}

const STRING_NAMES = ['G', 'D', 'A', 'E']
const FONT         = 'Inter, ui-sans-serif, system-ui, sans-serif'
const MONO         = 'ui-monospace, "Cascadia Code", "Fira Mono", monospace'

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

function rr(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
  fill?: string, stroke?: string, sw = 1,
) {
  const cr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + cr, y)
  ctx.lineTo(x + w - cr, y)
  ctx.arcTo(x + w, y, x + w, y + cr, cr)
  ctx.lineTo(x + w, y + h - cr)
  ctx.arcTo(x + w, y + h, x + w - cr, y + h, cr)
  ctx.lineTo(x + cr, y + h)
  ctx.arcTo(x, y + h, x, y + h - cr, cr)
  ctx.lineTo(x, y + cr)
  ctx.arcTo(x, y, x + cr, y, cr)
  ctx.closePath()
  if (fill)   { ctx.fillStyle = fill;     ctx.fill() }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = sw; ctx.stroke() }
}

function blobFrom(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((res, rej) =>
    canvas.toBlob(b => b ? res(b) : rej(new Error('toBlob failed')), 'image/png'),
  )
}

function safeName(track: BassTrack) {
  return track.name.replace(/[^a-z0-9_\-\s]/gi, '').trim() || 'bass-tab'
}

// ── Tab Notation export ───────────────────────────────────────────────────────

export interface TabNotationOptions {
  barsPerRow?: number   // default 4
}

export async function exportTabNotationAsPng(
  track: BassTrack,
  opts: TabNotationOptions = {},
): Promise<void> {
  const blob = await renderTabNotationToPng(track, opts)
  downloadBlob(blob, `${safeName(track)}-tab.png`)
}

export async function renderTabNotationToPng(
  track: BassTrack,
  { barsPerRow = 4 }: TabNotationOptions = {},
): Promise<Blob> {
  const SCALE      = 2
  const CANVAS_W   = 1200
  const MARGIN_X   = 44
  const HEADER_H   = 72
  const FOOTER_H   = 32
  const BAR_W      = (CANVAS_W - MARGIN_X * 2) / barsPerRow
  const LABEL_W    = 26
  const NOTE_AREA  = BAR_W - LABEL_W - 6
  const STR_GAP    = 28
  const STRINGS_H  = STR_GAP * 3
  const BAR_NUM_H  = 16
  const FIRST_STR  = BAR_NUM_H + 14
  const BAR_H      = FIRST_STR + STRINGS_H + 18
  const ROW_GAP    = 44
  const NOTE_BOX_W = 22
  const NOTE_BOX_H = 18

  const totalBars = track.totalBars
  const totalRows = Math.ceil(totalBars / barsPerRow)
  const CANVAS_H  = HEADER_H + totalRows * (BAR_H + ROW_GAP) - ROW_GAP + FOOTER_H + MARGIN_X

  const canvas    = document.createElement('canvas')
  canvas.width    = CANVAS_W * SCALE
  canvas.height   = CANVAS_H * SCALE
  const ctx       = canvas.getContext('2d')!
  ctx.scale(SCALE, SCALE)

  // Background
  ctx.fillStyle = D.bg
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)

  // Header
  ctx.font      = `bold 20px ${FONT}`
  ctx.fillStyle = D.trackName
  ctx.textAlign = 'left'
  ctx.fillText(track.name, MARGIN_X, 32)
  ctx.font      = `12px ${FONT}`
  ctx.fillStyle = D.trackMeta
  ctx.fillText(`${track.bpm} BPM · ${track.beatsPerBar}/4 · ${totalBars} bars`, MARGIN_X, 54)

  const STRING_Y = [0, STR_GAP, STR_GAP * 2, STR_GAP * 3]

  for (let bar = 0; bar < totalBars; bar++) {
    const row    = Math.floor(bar / barsPerRow)
    const col    = bar % barsPerRow
    const barX   = MARGIN_X + col * BAR_W
    const barY   = HEADER_H + row * (BAR_H + ROW_GAP)
    const barStart = bar * track.beatsPerBar

    // Section label
    const section = track.sections?.find(s => s.startBar === bar)
    if (section) {
      ctx.font      = `bold 10px ${FONT}`
      ctx.fillStyle = D.sectionText
      ctx.textAlign = 'left'
      ctx.fillText(section.name.toUpperCase(), barX + LABEL_W, barY + 12)
    }

    // Bar number (top-right of bar)
    ctx.font      = `10px ${MONO}`
    ctx.fillStyle = D.barLabel
    ctx.textAlign = 'right'
    ctx.fillText(String(bar + 1), barX + BAR_W - 4, barY + 12)

    const topY = barY + FIRST_STR + STRING_Y[0]
    const botY = barY + FIRST_STR + STRING_Y[3]

    // Left bar line
    ctx.strokeStyle = D.barLine
    ctx.lineWidth   = 1.5
    ctx.beginPath()
    ctx.moveTo(barX + LABEL_W, topY - 4)
    ctx.lineTo(barX + LABEL_W, botY + 4)
    ctx.stroke()

    // Right bar line (thicker at end of row or last bar)
    const isRowEnd = col === barsPerRow - 1 || bar === totalBars - 1
    ctx.strokeStyle = D.barLine
    ctx.lineWidth   = isRowEnd ? 2.5 : 1.5
    ctx.beginPath()
    ctx.moveTo(barX + BAR_W - 4, topY - 4)
    ctx.lineTo(barX + BAR_W - 4, botY + 4)
    ctx.stroke()

    // String lines + labels
    for (let si = 0; si < 4; si++) {
      const sy = barY + FIRST_STR + STRING_Y[si]

      ctx.font      = `11px ${MONO}`
      ctx.fillStyle = D.stringLabel
      ctx.textAlign = 'right'
      ctx.fillText(STRING_NAMES[si], barX + LABEL_W - 6, sy + 4)

      ctx.strokeStyle = D.string
      ctx.lineWidth   = 0.75
      ctx.beginPath()
      ctx.moveTo(barX + LABEL_W, sy)
      ctx.lineTo(barX + BAR_W - 4, sy)
      ctx.stroke()
    }

    // Beat subdivision dashes
    for (let beat = 1; beat < track.beatsPerBar; beat++) {
      const tx = barX + LABEL_W + (beat / track.beatsPerBar) * NOTE_AREA
      ctx.strokeStyle = D.barLine
      ctx.lineWidth   = 0.5
      ctx.setLineDash([2, 3])
      ctx.beginPath()
      ctx.moveTo(tx, topY - 2)
      ctx.lineTo(tx, botY + 2)
      ctx.stroke()
      ctx.setLineDash([])
    }

    // Notes
    const barNotes = track.notes.filter(
      n => n.startBeat >= barStart && n.startBeat < barStart + track.beatsPerBar,
    )

    for (const note of barNotes) {
      const beat = note.startBeat - barStart
      const nx   = barX + LABEL_W + (beat / track.beatsPerBar) * NOTE_AREA
      const ny   = barY + FIRST_STR + STRING_Y[note.stringIndex]

      rr(ctx, nx - NOTE_BOX_W / 2, ny - NOTE_BOX_H / 2, NOTE_BOX_W, NOTE_BOX_H, 3, D.noteBox, D.noteBorder, 1)
      ctx.font      = `bold 12px ${MONO}`
      ctx.fillStyle = D.noteFret
      ctx.textAlign = 'center'
      ctx.fillText(String(note.fret), nx, ny + 4)
    }
  }

  // Footer credit
  ctx.font      = `10px ${FONT}`
  ctx.fillStyle = D.credit
  ctx.textAlign = 'right'
  ctx.fillText('chordsequence.com', CANVAS_W - MARGIN_X, CANVAS_H - 12)

  return blobFrom(canvas)
}

// ── Piano Roll export ─────────────────────────────────────────────────────────

export async function exportPianoRollAsPng(track: BassTrack): Promise<void> {
  const blob = await renderPianoRollToPng(track)
  downloadBlob(blob, `${safeName(track)}-grid.png`)
}

export async function renderPianoRollToPng(track: BassTrack): Promise<Blob> {
  const SCALE     = 2
  const PPB       = 80
  const ROW_H     = 52
  const RULER_H   = 30
  const LABEL_W   = 58
  const HEADER_H  = 56
  const FOOTER_H  = 28

  const totalBeats  = track.totalBars * track.beatsPerBar
  const rawW        = LABEL_W + totalBeats * PPB
  const MAX_W       = 8000
  const ePPB        = rawW > MAX_W ? (MAX_W - LABEL_W) / totalBeats : PPB
  const CANVAS_W    = LABEL_W + totalBeats * ePPB
  const CANVAS_H    = HEADER_H + RULER_H + 4 * ROW_H + FOOTER_H

  const canvas      = document.createElement('canvas')
  canvas.width      = CANVAS_W * SCALE
  canvas.height     = CANVAS_H * SCALE
  const ctx         = canvas.getContext('2d')!
  ctx.scale(SCALE, SCALE)

  // Background
  ctx.fillStyle = D.bg
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)

  // Header
  ctx.font      = `bold 16px ${FONT}`
  ctx.fillStyle = D.trackName
  ctx.textAlign = 'left'
  ctx.fillText(track.name, 16, 24)
  ctx.font      = `11px ${FONT}`
  ctx.fillStyle = D.trackMeta
  ctx.fillText(`${track.bpm} BPM · ${track.beatsPerBar}/4 · ${track.totalBars} bars`, 16, 42)

  const gridTop = HEADER_H + RULER_H

  // Ruler background
  ctx.fillStyle = D.panel
  ctx.fillRect(0, HEADER_H, CANVAS_W, RULER_H)

  // String rows
  for (let si = 0; si < 4; si++) {
    const ry = gridTop + si * ROW_H
    ctx.fillStyle = si % 2 === 0 ? D.panel : D.surface
    ctx.fillRect(0, ry, CANVAS_W, ROW_H)

    ctx.font      = `bold 12px ${MONO}`
    ctx.fillStyle = D.stringLabel
    ctx.textAlign = 'center'
    ctx.fillText(STRING_NAMES[si], LABEL_W / 2, ry + ROW_H / 2 + 4)
  }

  // Label column separator
  ctx.strokeStyle = D.barLine
  ctx.lineWidth   = 1
  ctx.beginPath()
  ctx.moveTo(LABEL_W, HEADER_H)
  ctx.lineTo(LABEL_W, CANVAS_H - FOOTER_H)
  ctx.stroke()

  // Bar + beat lines
  for (let bar = 0; bar <= track.totalBars; bar++) {
    const x = LABEL_W + bar * track.beatsPerBar * ePPB

    ctx.strokeStyle = D.barLine
    ctx.lineWidth   = bar === 0 || bar === track.totalBars ? 1.5 : 1
    ctx.beginPath()
    ctx.moveTo(x, HEADER_H)
    ctx.lineTo(x, CANVAS_H - FOOTER_H)
    ctx.stroke()

    if (bar < track.totalBars) {
      // Bar number
      ctx.font      = `10px ${MONO}`
      ctx.fillStyle = D.barLabel
      ctx.textAlign = 'left'
      ctx.fillText(String(bar + 1), x + 4, HEADER_H + 14)

      // Section label
      const section = track.sections?.find(s => s.startBar === bar)
      if (section) {
        ctx.font      = `bold 10px ${FONT}`
        ctx.fillStyle = D.sectionText
        ctx.fillText(section.name.toUpperCase(), x + 4, HEADER_H + 26)
      }

      // Beat lines
      for (let beat = 1; beat < track.beatsPerBar; beat++) {
        const bx = x + beat * ePPB
        ctx.strokeStyle = '#1a2030'
        ctx.lineWidth   = 0.5
        ctx.beginPath()
        ctx.moveTo(bx, gridTop)
        ctx.lineTo(bx, CANVAS_H - FOOTER_H)
        ctx.stroke()
      }
    }
  }

  // Notes
  for (const note of track.notes) {
    const nx = LABEL_W + note.startBeat * ePPB
    const nw = Math.max(6, note.durationBeats * ePPB - 2)
    const ny = gridTop + note.stringIndex * ROW_H + 7
    const nh = ROW_H - 14

    rr(ctx, nx, ny, nw, nh, 4, D.accentDim, D.accent, 1.5)

    if (nw > 14) {
      ctx.font      = `bold ${Math.min(12, nh - 4)}px ${MONO}`
      ctx.fillStyle = D.noteFret
      ctx.textAlign = 'center'
      ctx.fillText(String(note.fret), nx + nw / 2, ny + nh / 2 + 4)
    }
  }

  // Footer credit
  ctx.font      = `10px ${FONT}`
  ctx.fillStyle = D.credit
  ctx.textAlign = 'right'
  ctx.fillText('chordsequence.com', CANVAS_W - 12, CANVAS_H - 8)

  return blobFrom(canvas)
}
