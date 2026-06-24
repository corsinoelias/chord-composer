/**
 * videoPageRenderer.ts — canvas renderers for video-export pages.
 *
 * Each view mode is split into:
 *   renderXxxStatic  — background + static elements (pre-renderable per page)
 *   renderXxxDynamic — cursor + active-note overlay (drawn every frame, fast)
 *   renderXxxPage    — combined (calls Static + Dynamic, used in preview/fallback)
 */

import type { BassTrack } from './types'

export const DEFAULT_BARS_PER_PAGE = 2

// Space Mono matches the web UI exactly (loaded via Google Fonts in the page)
const MONO = '"Space Mono", ui-monospace, "Cascadia Code", monospace'

// ── Color palettes ─────────────────────────────────────────────────────────────

const TAB = {
  bg:           'hsl(224,24%,8%)',
  labelBg:      'hsl(224,22%,6%)',
  strLine:      '#383858',
  barInner:     '#383858',
  barEdge:      '#505078',
  barNum:       '#404068',
  strLabel:     '#505070',
  noteBg:       'hsl(224,24%,11%)',
  noteBd:       '#383858',
  noteText:     '#b8b0d0',
  activeBg:     'hsl(262,83%,52%)',
  activeBd:     'hsl(262,90%,82%)',
  activeText:   'white',
  cursorColor:  'hsl(262,83%,62%)',
  durationLine: 'rgba(80,80,110,0.75)',
  sectionBg:    'rgba(124,77,255,0.06)',
  sectionText:  '#9b6ff5',
  sectionLine:  '#7c3aed',
  beatDash:     'rgba(50,50,85,0.85)',
}

const GRID_STR = [
  { dark: '#0d1a3a', mid: '#1a2e5a', light: '#1d4ed8', border: '#3b82f6', text: '#93c5fd', glow: 'rgba(59,130,246,0.55)' },
  { dark: '#0d2518', mid: '#1a3d28', light: '#15803d', border: '#22c55e', text: '#86efac', glow: 'rgba(34,197,94,0.55)'  },
  { dark: '#2a1800', mid: '#402800', light: '#b45309', border: '#f59e0b', text: '#fcd34d', glow: 'rgba(245,158,11,0.55)' },
  { dark: '#280e0e', mid: '#3d1515', light: '#9b1c1c', border: '#ef4444', text: '#fca5a5', glow: 'rgba(239,68,68,0.55)'  },
]

// ── Helpers ────────────────────────────────────────────────────────────────────

type Ctx = CanvasRenderingContext2D

function rr(
  ctx: Ctx, x: number, y: number, w: number, h: number, r: number,
  fill: string, stroke?: string, sw = 1,
) {
  const cr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2)
  ctx.beginPath()
  ctx.moveTo(x + cr, y)
  ctx.arcTo(x + w, y, x + w, y + cr, cr)
  ctx.arcTo(x + w, y + h, x + w - cr, y + h, cr)
  ctx.arcTo(x, y + h, x, y + h - cr, cr)
  ctx.arcTo(x, y, x + cr, y, cr)
  ctx.closePath()
  ctx.fillStyle = fill; ctx.fill()
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = sw; ctx.stroke() }
}

interface TabLayout {
  LABEL: number; AREA_W: number
  strGap: number; noteR: number; fontSize: number
  strY: (si: number) => number
  topY: number; botY: number
}

function tabLayout(w: number, h: number, label = 54): TabLayout {
  const AREA_W  = w - label
  const padV    = h * 0.09
  const inner   = h - 2 * padV
  const above   = inner * 0.22
  const staff   = inner * 0.58
  const strGap  = staff / 3
  const noteR   = Math.min(24, strGap * 0.48)
  const fontSize = Math.max(10, Math.min(18, strGap * 0.32))
  return {
    LABEL: label, AREA_W,
    strGap, noteR, fontSize,
    strY:  (si) => padV + above + si * strGap,
    topY:  padV + above,
    botY:  padV + above + staff,
  }
}

function notesOnPage(track: BassTrack, pageStartBeat: number, barsPerPage: number) {
  const pageEndBeat = pageStartBeat + barsPerPage * track.beatsPerBar
  return track.notes.filter(n => n.startBeat >= pageStartBeat && n.startBeat < pageEndBeat)
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB PAGE
// ═══════════════════════════════════════════════════════════════════════════════

export function renderTabPageStatic(
  ctx: Ctx, x: number, y: number, w: number, h: number,
  track: BassTrack, pageStartBeat: number, barsPerPage = DEFAULT_BARS_PER_PAGE,
): void {
  const bpp          = barsPerPage * track.beatsPerBar
  const pageEndBeat  = pageStartBeat + bpp
  const pageStartBar = Math.round(pageStartBeat / track.beatsPerBar)
  const L            = tabLayout(w, h)
  const pxPerBeat    = L.AREA_W / bpp
  const bx = (beat: number) => x + L.LABEL + (beat - pageStartBeat) * pxPerBeat

  // 1 — Background
  ctx.fillStyle = TAB.bg
  ctx.fillRect(x, y, w, h)

  // 2 — Left label strip
  ctx.fillStyle = TAB.labelBg
  ctx.fillRect(x, y, L.LABEL, h)
  ctx.strokeStyle = '#303050'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(x + L.LABEL, y); ctx.lineTo(x + L.LABEL, y + h); ctx.stroke()

  // 3 — String labels
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  for (let si = 0; si < 4; si++) {
    ctx.font = `bold ${Math.round(L.fontSize)}px ${MONO}`
    ctx.fillStyle = TAB.strLabel
    ctx.fillText(['G', 'D', 'A', 'E'][si], x + L.LABEL / 2, y + L.strY(si))
  }

  // 4 — Section highlights
  for (const sec of (track.sections ?? [])) {
    const sb = sec.startBar * track.beatsPerBar
    if (sb < pageStartBeat || sb >= pageEndBeat) continue
    const sx = bx(sb)
    const sw = bx(pageEndBeat) - sx
    ctx.fillStyle = TAB.sectionBg
    ctx.fillRect(sx, y, sw, h)
    ctx.fillStyle = TAB.sectionLine
    ctx.fillRect(sx - 2, y + L.strY(0) - L.noteR - 4, 2,
      L.strY(3) - L.strY(0) + L.noteR * 2 + 8)
    ctx.fillRect(sx + 2, y + L.strY(0) - L.noteR - 4, 4,
      L.strY(3) - L.strY(0) + L.noteR * 2 + 8)
    ctx.font = `bold ${Math.round(L.fontSize * 0.85)}px ${MONO}`
    ctx.fillStyle = TAB.sectionText
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText(sec.name.toUpperCase(), sx + 8, y + 6)
  }

  // 5 — Bar lines + numbers + beat dashes
  for (let bar = pageStartBar; bar <= pageStartBar + barsPerPage; bar++) {
    if (bar > track.totalBars) break
    const barBeat = bar * track.beatsPerBar
    if (barBeat < pageStartBeat - 0.001 || barBeat > pageEndBeat + 0.001) continue
    const lx     = bx(barBeat)
    const isEdge = bar === pageStartBar || bar === pageStartBar + barsPerPage

    ctx.strokeStyle = isEdge ? TAB.barEdge : TAB.barInner
    ctx.lineWidth   = isEdge ? 2 : 1
    ctx.beginPath()
    ctx.moveTo(lx, y + L.strY(0) - L.noteR - 2)
    ctx.lineTo(lx, y + L.strY(3) + L.noteR + 2)
    ctx.stroke()

    if (bar < track.totalBars && bar < pageStartBar + barsPerPage) {
      ctx.font = `${Math.round(L.fontSize * 0.72)}px ${MONO}`
      ctx.fillStyle = TAB.barNum
      ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'
      ctx.fillText(String(bar + 1), lx + 4, y + L.strY(0) - L.noteR - 4)

      for (let b = 1; b < track.beatsPerBar; b++) {
        const tx = bx(barBeat + b)
        ctx.strokeStyle = TAB.beatDash; ctx.lineWidth = 0.8
        ctx.setLineDash([3, 5])
        ctx.beginPath(); ctx.moveTo(tx, y + L.strY(0)); ctx.lineTo(tx, y + L.strY(3))
        ctx.stroke(); ctx.setLineDash([])
      }
    }
  }

  // 6 — String lines with gaps at note positions
  const inPage  = notesOnPage(track, pageStartBeat, barsPerPage)
  const halfGap = L.noteR * 0.88

  for (let si = 0; si < 4; si++) {
    const sy    = y + L.strY(si)
    const onStr = inPage.filter(n => n.stringIndex === si)
      .sort((a, b) => a.startBeat - b.startBeat)

    let cx     = x + L.LABEL
    const endX = x + w

    for (const note of onStr) {
      const nx = bx(note.startBeat)
      const gL = Math.max(x + L.LABEL, nx - halfGap)
      const gR = nx + halfGap
      if (gL > cx) {
        ctx.strokeStyle = TAB.strLine; ctx.lineWidth = 1
        ctx.beginPath(); ctx.moveTo(cx, sy); ctx.lineTo(gL, sy); ctx.stroke()
      }
      cx = gR
    }
    if (cx < endX) {
      ctx.strokeStyle = TAB.strLine; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(cx, sy); ctx.lineTo(endX, sy); ctx.stroke()
    }
  }

  // 7 — Duration bars
  for (const note of inPage) {
    const nx    = bx(note.startBeat)
    const rw    = (note.fret >= 10 ? 1.45 : 1.0) * L.noteR
    const barX1 = nx + rw * 0.52
    const barX2 = bx(Math.min(note.startBeat + note.durationBeats, pageEndBeat))
    if (barX2 > barX1 + 2) {
      ctx.strokeStyle = TAB.durationLine; ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(barX1, y + L.strY(note.stringIndex))
      ctx.lineTo(barX2, y + L.strY(note.stringIndex))
      ctx.stroke()
    }
  }

  // 8 — Note pills (all inactive)
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  for (const note of inPage) {
    const nx = bx(note.startBeat)
    const sy = y + L.strY(note.stringIndex)
    const rw = (note.fret >= 10 ? 1.45 : 1.0) * L.noteR
    const ph = L.noteR * 0.95
    rr(ctx, nx - rw / 2, sy - ph / 2, rw, ph, 3, TAB.noteBg, TAB.noteBd, 1)
    ctx.font = `bold ${Math.round(L.fontSize)}px ${MONO}`
    ctx.fillStyle = TAB.noteText
    ctx.fillText(String(note.fret), nx, sy)
  }
}

export function renderTabPageDynamic(
  ctx: Ctx, x: number, y: number, w: number, h: number,
  track: BassTrack, pageStartBeat: number, currentBeat: number,
  barsPerPage = DEFAULT_BARS_PER_PAGE,
): void {
  const bpp         = barsPerPage * track.beatsPerBar
  const pageEndBeat = pageStartBeat + bpp
  const L           = tabLayout(w, h)
  const pxPerBeat   = L.AREA_W / bpp
  const bx = (beat: number) => x + L.LABEL + (beat - pageStartBeat) * pxPerBeat

  // Active note re-draw (overwrites static inactive pill)
  const inPage = notesOnPage(track, pageStartBeat, barsPerPage)
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'

  for (const note of inPage) {
    if (currentBeat < note.startBeat || currentBeat >= note.startBeat + note.durationBeats) continue
    const nx = bx(note.startBeat)
    const sy = y + L.strY(note.stringIndex)
    const rw = (note.fret >= 10 ? 1.45 : 1.0) * L.noteR
    const ph = L.noteR * 0.95

    ctx.save()
    ctx.shadowColor = TAB.activeBg; ctx.shadowBlur = 12
    rr(ctx, nx - rw / 2, sy - ph / 2, rw, ph, 3, TAB.activeBg, TAB.activeBd, 1.5)
    ctx.restore()

    ctx.font = `bold ${Math.round(L.fontSize)}px ${MONO}`
    ctx.fillStyle = TAB.activeText
    ctx.fillText(String(note.fret), nx, sy)
  }

  // Cursor
  if (currentBeat >= pageStartBeat && currentBeat <= pageEndBeat) {
    const cx  = bx(currentBeat)
    const top = y + L.strY(0) - L.noteR - 6
    const bot = y + L.strY(3) + L.noteR + 6

    ctx.save()
    ctx.shadowColor = TAB.cursorColor; ctx.shadowBlur = 12
    ctx.strokeStyle = TAB.cursorColor; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(cx, top + 10); ctx.lineTo(cx, bot); ctx.stroke()
    ctx.restore()

    // Cursor head cap
    const CAP_W = Math.max(10, L.noteR * 0.55)
    const CAP_H = Math.max(14, L.noteR * 0.75)
    rr(ctx, cx - CAP_W / 2, top, CAP_W, CAP_H, 4, TAB.cursorColor)
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.beginPath(); ctx.arc(cx, top + CAP_H * 0.45, 2.5, 0, Math.PI * 2); ctx.fill()
  }
}

export function renderTabPage(
  ctx: Ctx, x: number, y: number, w: number, h: number,
  track: BassTrack, pageStartBeat: number, currentBeat: number,
  barsPerPage = DEFAULT_BARS_PER_PAGE,
): void {
  renderTabPageStatic(ctx, x, y, w, h, track, pageStartBeat, barsPerPage)
  renderTabPageDynamic(ctx, x, y, w, h, track, pageStartBeat, currentBeat, barsPerPage)
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCORE PAGE  (Tab + stems/beams below staff)
// ═══════════════════════════════════════════════════════════════════════════════

// Static extras for score mode: stems and beams (no active-state note heads)
export function renderScoreExtrasStatic(
  ctx: Ctx, x: number, y: number, w: number, h: number,
  track: BassTrack, pageStartBeat: number, barsPerPage = DEFAULT_BARS_PER_PAGE,
): void {
  const bpp          = barsPerPage * track.beatsPerBar
  const pageStartBar = Math.round(pageStartBeat / track.beatsPerBar)
  const L            = tabLayout(w, h)
  const pxPerBeat    = L.AREA_W / bpp
  const bx = (beat: number) => x + L.LABEL + (beat - pageStartBeat) * pxPerBeat
  const inPage       = notesOnPage(track, pageStartBeat, barsPerPage)
  const stemBot      = y + L.botY + L.noteR * 1.2

  // Stems
  for (const note of inPage) {
    const nx = bx(note.startBeat)
    ctx.strokeStyle = TAB.strLine; ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(nx, y + L.strY(note.stringIndex) + L.noteR / 2)
    ctx.lineTo(nx, stemBot)
    ctx.stroke()
  }

  // Beams per bar
  for (let bar = pageStartBar; bar < pageStartBar + barsPerPage; bar++) {
    if (bar >= track.totalBars) break
    const bs    = bar * track.beatsPerBar
    const be    = bs + track.beatsPerBar
    const short = inPage
      .filter(n => n.durationBeats < 1 && n.startBeat >= bs && n.startBeat < be)
      .sort((a, b) => a.startBeat - b.startBeat)
    if (short.length < 2) continue
    ctx.strokeStyle = TAB.strLine; ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(bx(short[0].startBeat), stemBot)
    ctx.lineTo(bx(short[short.length - 1].startBeat), stemBot)
    ctx.stroke()
    if (short.some(n => n.durationBeats < 0.5)) {
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(bx(short[0].startBeat), stemBot - 4)
      ctx.lineTo(bx(short[short.length - 1].startBeat), stemBot - 4)
      ctx.stroke()
    }
  }

  // Note heads (inactive state — active state handled in dynamic overlay)
  const r = Math.max(3, L.noteR * 0.22)
  for (const note of inPage) {
    const nx = bx(note.startBeat)
    ctx.save()
    ctx.translate(nx, stemBot)
    ctx.rotate(Math.PI / 4)
    rr(ctx, -r, -r, r * 2, r * 2, 1, '#505070')
    ctx.restore()
  }
}

// Dynamic note-head overlay for score mode (active note heads on top of static)
export function renderScoreNotHeadsDynamic(
  ctx: Ctx, x: number, y: number, w: number, h: number,
  track: BassTrack, pageStartBeat: number, currentBeat: number,
  barsPerPage = DEFAULT_BARS_PER_PAGE,
): void {
  const bpp     = barsPerPage * track.beatsPerBar
  const L       = tabLayout(w, h)
  const pxPerBeat = L.AREA_W / bpp
  const bx = (beat: number) => x + L.LABEL + (beat - pageStartBeat) * pxPerBeat
  const inPage  = notesOnPage(track, pageStartBeat, barsPerPage)
  const stemBot = y + L.botY + L.noteR * 1.2
  const r       = Math.max(3, L.noteR * 0.22)

  for (const note of inPage) {
    if (currentBeat < note.startBeat || currentBeat >= note.startBeat + note.durationBeats) continue
    const nx = bx(note.startBeat)
    ctx.save()
    ctx.shadowColor = TAB.activeBg; ctx.shadowBlur = 8
    ctx.translate(nx, stemBot)
    ctx.rotate(Math.PI / 4)
    rr(ctx, -r, -r, r * 2, r * 2, 1, TAB.activeBg, TAB.activeBd, 1)
    ctx.restore()
  }
}

export function renderScorePage(
  ctx: Ctx, x: number, y: number, w: number, h: number,
  track: BassTrack, pageStartBeat: number, currentBeat: number,
  barsPerPage = DEFAULT_BARS_PER_PAGE,
): void {
  renderTabPage(ctx, x, y, w, h, track, pageStartBeat, currentBeat, barsPerPage)

  const bpp          = barsPerPage * track.beatsPerBar
  const pageEndBeat  = pageStartBeat + bpp
  const pageStartBar = Math.round(pageStartBeat / track.beatsPerBar)
  const L            = tabLayout(w, h)
  const pxPerBeat    = L.AREA_W / bpp
  const bx = (beat: number) => x + L.LABEL + (beat - pageStartBeat) * pxPerBeat
  const inPage       = notesOnPage(track, pageStartBeat, barsPerPage)
  const stemBot      = y + L.botY + L.noteR * 1.2

  // Stems
  for (const note of inPage) {
    const nx = bx(note.startBeat)
    ctx.strokeStyle = TAB.strLine; ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(nx, y + L.strY(note.stringIndex) + L.noteR / 2)
    ctx.lineTo(nx, stemBot)
    ctx.stroke()
  }

  // Beams per bar
  for (let bar = pageStartBar; bar < pageStartBar + barsPerPage; bar++) {
    if (bar >= track.totalBars) break
    const bs = bar * track.beatsPerBar
    const be = bs + track.beatsPerBar
    const short = inPage
      .filter(n => n.durationBeats < 1 && n.startBeat >= bs && n.startBeat < be)
      .sort((a, b) => a.startBeat - b.startBeat)
    if (short.length < 2) continue
    ctx.strokeStyle = TAB.strLine; ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(bx(short[0].startBeat), stemBot)
    ctx.lineTo(bx(short[short.length - 1].startBeat), stemBot)
    ctx.stroke()
    if (short.some(n => n.durationBeats < 0.5)) {
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(bx(short[0].startBeat), stemBot - 4)
      ctx.lineTo(bx(short[short.length - 1].startBeat), stemBot - 4)
      ctx.stroke()
    }
  }

  // Note heads (diamond dots below staff)
  for (const note of inPage) {
    const nx = bx(note.startBeat)
    const isActive = currentBeat >= note.startBeat && currentBeat < note.startBeat + note.durationBeats
    const r  = Math.max(3, L.noteR * 0.22)
    ctx.save()
    ctx.translate(nx, stemBot)
    ctx.rotate(Math.PI / 4)
    rr(ctx, -r, -r, r * 2, r * 2, 1,
      isActive ? TAB.activeBg : '#505070',
      isActive ? TAB.activeBd : undefined,
      1)
    ctx.restore()
  }

  void pageEndBeat  // suppress unused warning
}

// ═══════════════════════════════════════════════════════════════════════════════
// GRID PAGE
// ═══════════════════════════════════════════════════════════════════════════════

export function renderGridPageStatic(
  ctx: Ctx, x: number, y: number, w: number, h: number,
  track: BassTrack, pageStartBeat: number, barsPerPage = DEFAULT_BARS_PER_PAGE,
): void {
  const bpp          = barsPerPage * track.beatsPerBar
  const pageEndBeat  = pageStartBeat + bpp
  const pageStartBar = Math.round(pageStartBeat / track.beatsPerBar)
  const LABEL_W      = 54
  const RULER_H      = Math.round(h * 0.07)
  const ROW_H        = (h - RULER_H) / 4
  const AREA_W       = w - LABEL_W
  const pxPerBeat    = AREA_W / bpp
  const bx = (beat: number) => x + LABEL_W + (beat - pageStartBeat) * pxPerBeat

  // Background
  ctx.fillStyle = '#090c16'; ctx.fillRect(x, y, w, h)

  // Row bands
  for (let si = 0; si < 4; si++) {
    const ry = y + RULER_H + si * ROW_H
    const c  = GRID_STR[si]
    ctx.fillStyle = c.dark; ctx.fillRect(x + LABEL_W, ry, AREA_W, ROW_H)
    ctx.fillStyle = 'rgba(255,255,255,0.025)'; ctx.fillRect(x + LABEL_W, ry, AREA_W, 1)
    ctx.strokeStyle = 'rgba(30,30,60,0.9)'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(x + LABEL_W, ry + ROW_H); ctx.lineTo(x + w, ry + ROW_H); ctx.stroke()
  }

  // Ruler strip
  ctx.fillStyle = 'hsl(224,22%,6%)'; ctx.fillRect(x + LABEL_W, y, AREA_W, RULER_H)

  // Label strip
  ctx.fillStyle = 'hsl(224,22%,6%)'; ctx.fillRect(x, y, LABEL_W, h)
  ctx.strokeStyle = '#303050'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(x + LABEL_W, y); ctx.lineTo(x + LABEL_W, y + h); ctx.stroke()

  // String labels
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  for (let si = 0; si < 4; si++) {
    const c  = GRID_STR[si]
    const ry = y + RULER_H + si * ROW_H
    ctx.font = `bold ${Math.round(ROW_H * 0.38)}px ${MONO}`
    ctx.fillStyle = c.text
    ctx.fillText(['G', 'D', 'A', 'E'][si], x + LABEL_W / 2, ry + ROW_H / 2)
  }

  // Bar lines + beat subdivisions
  for (let bar = pageStartBar; bar <= pageStartBar + barsPerPage; bar++) {
    if (bar > track.totalBars) break
    const barBeat = bar * track.beatsPerBar
    if (barBeat < pageStartBeat - 0.001 || barBeat > pageEndBeat + 0.001) continue
    const lx     = bx(barBeat)
    const isEdge = bar === pageStartBar || bar === pageStartBar + barsPerPage

    ctx.strokeStyle = isEdge ? 'rgba(80,80,130,0.85)' : 'rgba(50,50,100,0.65)'
    ctx.lineWidth   = isEdge ? 2 : 1
    ctx.beginPath(); ctx.moveTo(lx, y + RULER_H); ctx.lineTo(lx, y + h); ctx.stroke()

    if (bar < track.totalBars && bar < pageStartBar + barsPerPage) {
      ctx.font = `${Math.round(RULER_H * 0.55)}px ${MONO}`
      ctx.fillStyle = 'rgba(140,140,190,0.85)'
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
      ctx.fillText(String(bar + 1), lx + 4, y + RULER_H / 2)

      for (let b = 1; b < track.beatsPerBar; b++) {
        const tx = bx(barBeat + b)
        ctx.strokeStyle = 'rgba(40,40,80,0.55)'; ctx.lineWidth = 0.8
        ctx.beginPath(); ctx.moveTo(tx, y + RULER_H); ctx.lineTo(tx, y + h); ctx.stroke()
        ctx.strokeStyle = 'rgba(90,90,150,0.5)'; ctx.lineWidth = 0.7
        ctx.beginPath(); ctx.moveTo(tx, y); ctx.lineTo(tx, y + RULER_H * 0.55); ctx.stroke()
      }
    }
  }

  // Section ruler labels
  for (const sec of (track.sections ?? [])) {
    const sb = sec.startBar * track.beatsPerBar
    if (sb < pageStartBeat || sb >= pageEndBeat) continue
    ctx.font = `bold ${Math.round(RULER_H * 0.52)}px ${MONO}`
    ctx.fillStyle = '#9b6ff5'
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillText(sec.name.toUpperCase(), bx(sb) + 6, y + RULER_H / 2)
  }

  // Notes (all inactive)
  const inPage   = notesOnPage(track, pageStartBeat, barsPerPage)
  const NOTE_PAD = ROW_H * 0.12

  for (const note of inPage) {
    const c   = GRID_STR[note.stringIndex]
    const nx  = bx(note.startBeat)
    const ry  = y + RULER_H + note.stringIndex * ROW_H
    const endB = Math.min(note.startBeat + note.durationBeats, pageEndBeat)
    const nw  = Math.max(6, bx(endB) - nx - 2)
    const nh  = ROW_H - NOTE_PAD * 2
    const ny  = ry + NOTE_PAD

    rr(ctx, nx, ny, nw, nh, 4, c.mid, c.border, 1)

    if (nw > 14) {
      ctx.font = `bold ${Math.round(nh * 0.52)}px ${MONO}`
      ctx.fillStyle = c.text
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(String(note.fret), nx + nw / 2, ny + nh / 2)
    }
  }

  void pageEndBeat
}

export function renderGridPageDynamic(
  ctx: Ctx, x: number, y: number, w: number, h: number,
  track: BassTrack, pageStartBeat: number, currentBeat: number,
  barsPerPage = DEFAULT_BARS_PER_PAGE,
): void {
  const bpp          = barsPerPage * track.beatsPerBar
  const pageEndBeat  = pageStartBeat + bpp
  const LABEL_W      = 54
  const RULER_H      = Math.round(h * 0.07)
  const ROW_H        = (h - RULER_H) / 4
  const AREA_W       = w - LABEL_W
  const pxPerBeat    = AREA_W / bpp
  const bx = (beat: number) => x + LABEL_W + (beat - pageStartBeat) * pxPerBeat
  const NOTE_PAD     = ROW_H * 0.12
  const inPage       = notesOnPage(track, pageStartBeat, barsPerPage)

  // Active notes re-draw
  for (const note of inPage) {
    if (currentBeat < note.startBeat || currentBeat >= note.startBeat + note.durationBeats) continue
    const c   = GRID_STR[note.stringIndex]
    const nx  = bx(note.startBeat)
    const ry  = y + RULER_H + note.stringIndex * ROW_H
    const endB = Math.min(note.startBeat + note.durationBeats, pageEndBeat)
    const nw  = Math.max(6, bx(endB) - nx - 2)
    const nh  = ROW_H - NOTE_PAD * 2
    const ny  = ry + NOTE_PAD

    ctx.save()
    ctx.shadowColor = c.glow; ctx.shadowBlur = 16
    rr(ctx, nx, ny, nw, nh, 4, c.light, c.border, 2)
    ctx.restore()

    if (nw > 14) {
      ctx.font = `bold ${Math.round(nh * 0.52)}px ${MONO}`
      ctx.fillStyle = 'white'
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(String(note.fret), nx + nw / 2, ny + nh / 2)
    }
  }

  // Cursor
  if (currentBeat >= pageStartBeat && currentBeat <= pageEndBeat) {
    const cx = bx(currentBeat)
    ctx.save()
    ctx.shadowColor = 'rgba(139,92,246,0.9)'; ctx.shadowBlur = 14
    ctx.strokeStyle = 'rgba(139,92,246,0.95)'; ctx.lineWidth = 2.5
    ctx.beginPath(); ctx.moveTo(cx, y); ctx.lineTo(cx, y + h); ctx.stroke()
    ctx.restore()
  }

  void pageEndBeat
}

export function renderGridPage(
  ctx: Ctx, x: number, y: number, w: number, h: number,
  track: BassTrack, pageStartBeat: number, currentBeat: number,
  barsPerPage = DEFAULT_BARS_PER_PAGE,
): void {
  renderGridPageStatic(ctx, x, y, w, h, track, pageStartBeat, barsPerPage)
  renderGridPageDynamic(ctx, x, y, w, h, track, pageStartBeat, currentBeat, barsPerPage)
}

// ── Re-export BARS_PER_PAGE as default for callers that use the constant ──────
export const BARS_PER_PAGE = DEFAULT_BARS_PER_PAGE
