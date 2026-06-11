import type { BassTrack, BassSound } from './types'
import { renderTrackOffline } from './bassAudio'

export type AspectRatio = '16:9' | '9:16'

export interface VideoExportOptions {
  aspectRatio: AspectRatio
  onProgress?: (beat: number, totalBeats: number) => void
}

export interface VideoExportHandle {
  cancel: () => void
}

// ── Dimensions ────────────────────────────────────────────────────────────────

function dims(ar: AspectRatio) {
  return ar === '16:9' ? { w: 1280, h: 720 } : { w: 720, h: 1280 }
}

// ── Fonts ─────────────────────────────────────────────────────────────────────

const MONO = 'ui-monospace, "Cascadia Code", "SF Mono", monospace'
const FONT = 'system-ui, ui-sans-serif, sans-serif'

// ── String rendering data ─────────────────────────────────────────────────────

const STRING_NAMES = ['G', 'D', 'A', 'E']

const STRINGS = [
  { shadow: 'rgba(60,55,40,0.5)',  body: 'rgba(210,200,165,0.75)', hi: 'rgba(248,240,215,0.85)', totalW: 1.5 },
  { shadow: 'rgba(60,55,40,0.6)',  body: 'rgba(205,195,160,0.85)', hi: 'rgba(248,240,215,0.9)',  totalW: 2.2 },
  { shadow: 'rgba(55,50,35,0.65)', body: 'rgba(200,190,155,0.92)', hi: 'rgba(248,240,215,0.92)', totalW: 3.0 },
  { shadow: 'rgba(50,45,30,0.7)',  body: 'rgba(190,180,145,1.0)',  hi: 'rgba(248,240,215,0.95)', totalW: 4.0 },
]

// ── Rounded rect helper ───────────────────────────────────────────────────────

function rr(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
  fill?: string, stroke?: string, sw = 1,
) {
  const cr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2)
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

function fmtTime(s: number) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

// ── Active frets ──────────────────────────────────────────────────────────────

function getActiveFrets(track: BassTrack, beat: number): (number | null)[] {
  const a: (number | null)[] = [null, null, null, null]
  for (const n of track.notes) {
    if (beat >= n.startBeat && beat < n.startBeat + n.durationBeats) a[n.stringIndex] = n.fret
  }
  return a
}

// ════════════════════════════════════════════════════════════════════════════
// FRETBOARD
// ════════════════════════════════════════════════════════════════════════════

function drawFretboard(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  activeFrets: (number | null)[],
) {
  const LABEL_W  = 46
  const NUT_W    = 10
  const FRETS    = 12
  const PAD_V    = h * 0.10
  const strArea  = h - PAD_V * 2
  const strGap   = strArea / 3
  const fretW    = (w - LABEL_W - NUT_W) / FRETS

  // ── Neck body (rosewood, multi-stop vertical gradient) ──
  const neck = ctx.createLinearGradient(x, y, x, y + h)
  neck.addColorStop(0,    '#1e1308')
  neck.addColorStop(0.03, '#221508')
  neck.addColorStop(0.20, '#1a0f06')
  neck.addColorStop(0.50, '#140c04')
  neck.addColorStop(0.80, '#1a0f06')
  neck.addColorStop(0.97, '#221508')
  neck.addColorStop(1,    '#1e1308')
  ctx.fillStyle = neck
  ctx.fillRect(x, y, w, h)

  // Warm horizontal fade near nut
  const warm = ctx.createLinearGradient(x + LABEL_W, y, x + LABEL_W + w * 0.35, y)
  warm.addColorStop(0, 'rgba(90,55,20,0.18)')
  warm.addColorStop(1, 'transparent')
  ctx.fillStyle = warm
  ctx.fillRect(x + LABEL_W, y, w - LABEL_W, h)

  // ── Binding lines (top + bottom of neck) ──
  ctx.save()
  ctx.strokeStyle = 'rgba(220,200,150,0.30)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(x + LABEL_W, y + 3)
  ctx.lineTo(x + w, y + 3)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(x + LABEL_W, y + h - 3)
  ctx.lineTo(x + w, y + h - 3)
  ctx.stroke()
  ctx.restore()

  // ── Left side body fade ──
  const bodyFade = ctx.createLinearGradient(x, y, x + LABEL_W, y)
  bodyFade.addColorStop(0, 'rgba(0,0,0,0.55)')
  bodyFade.addColorStop(1, 'transparent')
  ctx.fillStyle = bodyFade
  ctx.fillRect(x, y, LABEL_W, h)

  // ── Inlay dots ──
  const inlayFrets = [3, 5, 7, 9, 12]
  for (const df of inlayFrets) {
    if (df > FRETS) continue
    const dotX = x + LABEL_W + NUT_W + (df - 0.5) * fretW
    const dotR  = Math.min(fretW * 0.10, 8)
    const pts   = df === 12
      ? [y + PAD_V + strGap * 0.5, y + PAD_V + strGap * 2.5]
      : [y + h / 2]

    for (const dotY of pts) {
      // Outer glow
      const ig = ctx.createRadialGradient(dotX, dotY, 0, dotX, dotY, dotR * 3)
      ig.addColorStop(0, 'rgba(210,190,140,0.18)')
      ig.addColorStop(1, 'transparent')
      ctx.fillStyle = ig
      ctx.beginPath()
      ctx.arc(dotX, dotY, dotR * 3, 0, Math.PI * 2)
      ctx.fill()
      // Dot
      ctx.fillStyle = 'rgba(200,180,130,0.50)'
      ctx.beginPath()
      ctx.arc(dotX, dotY, dotR, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // ── Fret wires ──
  for (let f = 1; f <= FRETS; f++) {
    const fx = x + LABEL_W + NUT_W + f * fretW

    ctx.save()
    // Dark groove
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'
    ctx.lineWidth   = 3.5
    ctx.beginPath()
    ctx.moveTo(fx, y + 6)
    ctx.lineTo(fx, y + h - 6)
    ctx.stroke()
    // Main wire (warm metal)
    ctx.strokeStyle = f % 4 === 0 ? 'rgba(110,90,55,0.85)' : 'rgba(80,65,40,0.80)'
    ctx.lineWidth   = 2
    ctx.beginPath()
    ctx.moveTo(fx, y + 7)
    ctx.lineTo(fx, y + h - 7)
    ctx.stroke()
    // Highlight
    ctx.strokeStyle = 'rgba(160,140,90,0.35)'
    ctx.lineWidth   = 0.75
    ctx.beginPath()
    ctx.moveTo(fx + 1, y + 9)
    ctx.lineTo(fx + 1, y + h - 9)
    ctx.stroke()
    ctx.restore()
  }

  // ── Nut ──
  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.5)'
  ctx.fillRect(x + LABEL_W - 2, y + PAD_V - 5, NUT_W + 4, strArea + 10)

  const nutGrad = ctx.createLinearGradient(x + LABEL_W, y, x + LABEL_W + NUT_W, y)
  nutGrad.addColorStop(0,   '#b8a878')
  nutGrad.addColorStop(0.3, '#dccf98')
  nutGrad.addColorStop(0.55,'#f0e4b8')
  nutGrad.addColorStop(0.7, '#dccf98')
  nutGrad.addColorStop(1,   '#b8a878')
  ctx.fillStyle = nutGrad
  ctx.fillRect(x + LABEL_W, y + PAD_V - 4, NUT_W, strArea + 8)

  // Nut slots
  for (let si = 0; si < 4; si++) {
    const sy = y + PAD_V + si * strGap
    const sw = STRINGS[si].totalW
    ctx.fillStyle = 'rgba(0,0,0,0.40)'
    ctx.fillRect(x + LABEL_W, sy - sw / 2 - 0.5, NUT_W, sw + 1)
  }

  // ── String labels ──
  for (let si = 0; si < 4; si++) {
    const sy = y + PAD_V + si * strGap
    ctx.font      = `bold ${Math.round(h * 0.055)}px ${MONO}`
    ctx.fillStyle = 'rgba(140,125,90,0.75)'
    ctx.textAlign = 'center'
    ctx.fillText(STRING_NAMES[si], x + LABEL_W / 2, sy + 5)
  }

  // ── Strings (3-layer for metallic look) ──
  for (let si = 0; si < 4; si++) {
    const sy  = y + PAD_V + si * strGap
    const s   = STRINGS[si]
    const startX = x + LABEL_W + NUT_W

    // Shadow
    ctx.strokeStyle = s.shadow
    ctx.lineWidth   = s.totalW + 1.5
    ctx.beginPath()
    ctx.moveTo(startX, sy + s.totalW * 0.4)
    ctx.lineTo(x + w, sy + s.totalW * 0.4)
    ctx.stroke()

    // Body
    ctx.strokeStyle = s.body
    ctx.lineWidth   = s.totalW
    ctx.beginPath()
    ctx.moveTo(startX, sy)
    ctx.lineTo(x + w, sy)
    ctx.stroke()

    // Highlight
    ctx.strokeStyle = s.hi
    ctx.lineWidth   = s.totalW * 0.35
    ctx.beginPath()
    ctx.moveTo(startX, sy - s.totalW * 0.28)
    ctx.lineTo(x + w, sy - s.totalW * 0.28)
    ctx.stroke()

    // ── Active fret dot ──
    const fret = activeFrets[si]
    if (fret !== null) {
      if (fret > 0 && fret <= FRETS) {
        const dotX = x + LABEL_W + NUT_W + (fret - 0.5) * fretW
        const dotR  = Math.min(fretW * 0.40, strGap * 0.44, 20)

        // Multi-layer glow halos
        for (const [mul, alpha] of [[5.0, 0.04], [3.5, 0.09], [2.2, 0.20]] as [number, number][]) {
          const g = ctx.createRadialGradient(dotX, sy, 0, dotX, sy, dotR * mul)
          g.addColorStop(0, `rgba(124,77,255,${alpha})`)
          g.addColorStop(1, 'transparent')
          ctx.fillStyle = g
          ctx.beginPath()
          ctx.arc(dotX, sy, dotR * mul, 0, Math.PI * 2)
          ctx.fill()
        }

        // Sphere gradient
        const sphere = ctx.createRadialGradient(
          dotX - dotR * 0.32, sy - dotR * 0.32, 0,
          dotX, sy, dotR,
        )
        sphere.addColorStop(0.0, '#c4adff')
        sphere.addColorStop(0.35,'#8b5cf6')
        sphere.addColorStop(0.7, '#6d28d9')
        sphere.addColorStop(1.0, '#2d0a6e')
        ctx.fillStyle = sphere
        ctx.beginPath()
        ctx.arc(dotX, sy, dotR, 0, Math.PI * 2)
        ctx.fill()

        // Rim
        ctx.strokeStyle = 'rgba(196,173,255,0.65)'
        ctx.lineWidth   = 1.5
        ctx.beginPath()
        ctx.arc(dotX, sy, dotR, 0, Math.PI * 2)
        ctx.stroke()

      } else if (fret === 0) {
        // Open string: circle before nut
        const ox = x + LABEL_W - 8
        const or = Math.min(9, strGap * 0.30)
        const og = ctx.createRadialGradient(ox, sy, 0, ox, sy, or * 2.5)
        og.addColorStop(0, 'rgba(124,77,255,0.30)')
        og.addColorStop(1, 'transparent')
        ctx.fillStyle = og
        ctx.beginPath()
        ctx.arc(ox, sy, or * 2.5, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = '#8b5cf6'
        ctx.lineWidth   = 1.5
        ctx.beginPath()
        ctx.arc(ox, sy, or, 0, Math.PI * 2)
        ctx.stroke()
      }
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// SCROLLING TAB
// ════════════════════════════════════════════════════════════════════════════

function drawScrollingTab(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  track: BassTrack,
  currentBeat: number,
) {
  const LABEL_W   = 44
  const PAD_V     = h * 0.12
  const strArea   = h - PAD_V * 2
  const STR_GAP   = strArea / 3
  const STR_Y     = [0, STR_GAP, STR_GAP * 2, STR_GAP * 3].map(d => y + PAD_V + d)
  const PPB       = (w - LABEL_W) / 8           // 8 beats visible
  const CURSOR_X  = x + LABEL_W + PPB * 2       // cursor at beat 2 from left (25% of note area)
  const totalBeats = track.totalBars * track.beatsPerBar

  // ── Background with subtle row tinting ──
  ctx.fillStyle = '#0c1020'
  ctx.fillRect(x, y, w, h)

  for (let si = 0; si < 4; si++) {
    const ry = si === 0 ? y : STR_Y[si] - STR_GAP / 2
    const rh = si === 3 ? y + h - ry : STR_GAP
    ctx.fillStyle = si % 2 === 0 ? 'rgba(255,255,255,0.0)' : 'rgba(255,255,255,0.025)'
    ctx.fillRect(x + LABEL_W, ry, w - LABEL_W, rh)
  }

  // ── Cursor glow (radial, soft) ──
  const centerY = (STR_Y[0] + STR_Y[3]) / 2
  for (const [glowW, alpha] of [[80, 0.10], [44, 0.18], [22, 0.10]] as [number, number][]) {
    const cg = ctx.createRadialGradient(CURSOR_X, centerY, 0, CURSOR_X, centerY, glowW)
    cg.addColorStop(0, `rgba(124,77,255,${alpha})`)
    cg.addColorStop(1, 'transparent')
    ctx.fillStyle = cg
    ctx.fillRect(CURSOR_X - glowW, y, glowW * 2, h)
  }

  // ── Clip note area ──
  ctx.save()
  ctx.beginPath()
  ctx.rect(x + LABEL_W, y, w - LABEL_W, h)
  ctx.clip()

  // ── Bar lines + numbers ──
  const visBeatStart = currentBeat - 2 - 1
  const visBeatEnd   = currentBeat + 8 + 1
  const firstBar     = Math.max(0, Math.floor(visBeatStart / track.beatsPerBar))
  const lastBar      = Math.min(track.totalBars, Math.ceil(visBeatEnd / track.beatsPerBar))

  for (let bar = firstBar; bar <= lastBar; bar++) {
    const barBeat = bar * track.beatsPerBar
    const bx      = CURSOR_X + (barBeat - currentBeat) * PPB

    if (bx < x + LABEL_W - 4 || bx > x + w + 4) continue

    // Double bar at start of section
    const section = track.sections?.find(s => s.startBar === bar)
    if (section) {
      ctx.fillStyle = '#7c4dff'
      ctx.fillRect(bx - 3, STR_Y[0] - 12, 2, STR_Y[3] - STR_Y[0] + 24)
      ctx.fillRect(bx + 2, STR_Y[0] - 12, 4, STR_Y[3] - STR_Y[0] + 24)

      // Section pill
      const label  = section.name.toUpperCase()
      ctx.font     = `bold ${Math.round(STR_GAP * 0.30)}px ${FONT}`
      const tw     = ctx.measureText(label).width
      rr(ctx, bx + 6, STR_Y[0] - 28, tw + 10, 18, 4, '#2d1a6e', '#7c4dff', 1)
      ctx.fillStyle = '#c4b0ff'
      ctx.textAlign = 'left'
      ctx.fillText(label, bx + 11, STR_Y[0] - 14)
    } else if (bar > 0) {
      ctx.strokeStyle = 'rgba(80,96,140,0.60)'
      ctx.lineWidth   = 1.5
      ctx.beginPath()
      ctx.moveTo(bx, STR_Y[0] - 10)
      ctx.lineTo(bx, STR_Y[3] + 10)
      ctx.stroke()
    }

    // Bar number
    if (bar < track.totalBars) {
      ctx.font      = `${Math.round(STR_GAP * 0.28)}px ${MONO}`
      ctx.fillStyle = 'rgba(90,104,140,0.75)'
      ctx.textAlign = 'left'
      ctx.fillText(String(bar + 1), bx + 4, STR_Y[0] - 12)
    }

    // End of track double bar
    if (bar === track.totalBars) {
      ctx.fillStyle = 'rgba(80,96,140,0.50)'
      ctx.fillRect(bx - 4, STR_Y[0] - 10, 3, STR_Y[3] - STR_Y[0] + 20)
      ctx.fillRect(bx + 1, STR_Y[0] - 10, 6, STR_Y[3] - STR_Y[0] + 20)
    }

    // Beat subdivisions
    if (bar < track.totalBars) {
      for (let b = 1; b < track.beatsPerBar; b++) {
        const tx = bx + b * PPB
        if (tx < x + LABEL_W || tx > x + w) continue
        ctx.strokeStyle = 'rgba(40,52,80,0.70)'
        ctx.lineWidth   = 0.75
        ctx.setLineDash([3, 4])
        ctx.beginPath()
        ctx.moveTo(tx, STR_Y[0] - 5)
        ctx.lineTo(tx, STR_Y[3] + 5)
        ctx.stroke()
        ctx.setLineDash([])
      }
    }
  }

  // ── Notes ──
  const NOTE_H = STR_GAP * 0.60
  for (const note of track.notes) {
    // Skip notes far outside the visible window
    if (note.startBeat + note.durationBeats < currentBeat - 3) continue
    if (note.startBeat > currentBeat + 10) continue

    const nx     = CURSOR_X + (note.startBeat - currentBeat) * PPB
    const ny     = STR_Y[note.stringIndex]
    const noteW  = Math.max(20, note.durationBeats * PPB * 0.88)
    const isActive = currentBeat >= note.startBeat && currentBeat < note.startBeat + note.durationBeats

    if (isActive) {
      // Active glow
      const ag = ctx.createRadialGradient(nx + noteW / 2, ny, 0, nx + noteW / 2, ny, noteW * 0.75)
      ag.addColorStop(0, 'rgba(124,77,255,0.22)')
      ag.addColorStop(1, 'transparent')
      ctx.fillStyle = ag
      ctx.fillRect(nx - noteW * 0.2, ny - NOTE_H, noteW * 1.4, NOTE_H * 2)
    }

    rr(ctx, nx, ny - NOTE_H / 2, noteW, NOTE_H, 5,
      isActive ? '#2d1a6e' : '#131c34',
      isActive ? '#8b5cf6' : '#2a3556',
      isActive ? 2 : 1,
    )

    if (noteW > 16) {
      const fontSize = Math.min(Math.round(NOTE_H * 0.58), 16)
      ctx.font      = `bold ${fontSize}px ${MONO}`
      ctx.fillStyle = isActive ? '#c4adff' : '#8896b8'
      ctx.textAlign = 'center'
      ctx.fillText(String(note.fret), nx + noteW / 2, ny + fontSize * 0.37)
    }
  }

  ctx.restore()

  // ── String lines (drawn over clips so they span full width) ──
  for (let si = 0; si < 4; si++) {
    const sy = STR_Y[si]
    const s  = STRINGS[si]

    // Shadow
    ctx.strokeStyle = s.shadow
    ctx.lineWidth   = s.totalW + 1
    ctx.beginPath()
    ctx.moveTo(x + LABEL_W, sy + s.totalW * 0.3)
    ctx.lineTo(x + w, sy + s.totalW * 0.3)
    ctx.stroke()

    // Body
    ctx.strokeStyle = 'rgba(70,85,120,0.80)'
    ctx.lineWidth   = s.totalW
    ctx.beginPath()
    ctx.moveTo(x + LABEL_W, sy)
    ctx.lineTo(x + w, sy)
    ctx.stroke()

    // Highlight
    ctx.strokeStyle = 'rgba(100,120,170,0.45)'
    ctx.lineWidth   = s.totalW * 0.35
    ctx.beginPath()
    ctx.moveTo(x + LABEL_W, sy - s.totalW * 0.28)
    ctx.lineTo(x + w, sy - s.totalW * 0.28)
    ctx.stroke()

    // String label
    ctx.font      = `bold ${Math.round(STR_GAP * 0.34)}px ${MONO}`
    ctx.fillStyle = 'rgba(80,95,130,0.85)'
    ctx.textAlign = 'center'
    ctx.fillText(STRING_NAMES[si], x + LABEL_W / 2, sy + 5)
  }

  // ── Cursor line ──
  ctx.save()
  ctx.shadowColor = '#7c4dff'
  ctx.shadowBlur  = 10
  ctx.strokeStyle = '#8b5cf6'
  ctx.lineWidth   = 2.5
  ctx.beginPath()
  ctx.moveTo(CURSOR_X, STR_Y[0] - 14)
  ctx.lineTo(CURSOR_X, STR_Y[3] + 14)
  ctx.stroke()
  ctx.restore()

  // Cursor triangle markers
  ctx.fillStyle = '#8b5cf6'
  const triSize = 6
  ctx.beginPath()
  ctx.moveTo(CURSOR_X - triSize, STR_Y[0] - 14)
  ctx.lineTo(CURSOR_X + triSize, STR_Y[0] - 14)
  ctx.lineTo(CURSOR_X, STR_Y[0] - 14 + triSize * 1.2)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(CURSOR_X - triSize, STR_Y[3] + 14)
  ctx.lineTo(CURSOR_X + triSize, STR_Y[3] + 14)
  ctx.lineTo(CURSOR_X, STR_Y[3] + 14 - triSize * 1.2)
  ctx.fill()

  // Left divider
  ctx.fillStyle = 'rgba(30,38,60,0.95)'
  ctx.fillRect(x, y, LABEL_W, h)
  ctx.strokeStyle = 'rgba(50,62,90,0.80)'
  ctx.lineWidth   = 1
  ctx.beginPath()
  ctx.moveTo(x + LABEL_W, y)
  ctx.lineTo(x + LABEL_W, y + h)
  ctx.stroke()
}

// ════════════════════════════════════════════════════════════════════════════
// HEADER
// ════════════════════════════════════════════════════════════════════════════

function drawHeader(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  track: BassTrack, currentBeat: number,
) {
  // Background
  ctx.fillStyle = '#0c1020'
  ctx.fillRect(x, y, w, h)
  // Bottom separator
  ctx.fillStyle = 'rgba(50,62,90,0.60)'
  ctx.fillRect(x, y + h - 1, w, 1)

  const my = y + h / 2

  // Logo dot
  ctx.save()
  ctx.shadowColor = '#7c4dff'
  ctx.shadowBlur  = 8
  ctx.fillStyle   = '#7c4dff'
  ctx.beginPath()
  ctx.arc(x + 20, my, 5, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  // Track name
  const nameSize = Math.round(h * 0.35)
  ctx.font      = `bold ${nameSize}px ${FONT}`
  ctx.fillStyle = '#dde3f0'
  ctx.textAlign = 'left'
  ctx.fillText(track.name, x + 36, my + nameSize * 0.36)

  // Meta info
  const metaSize = Math.round(h * 0.26)
  const nameW    = ctx.measureText(track.name).width
  ctx.font      = `${metaSize}px ${FONT}`
  ctx.fillStyle = 'rgba(80,95,130,0.90)'
  ctx.fillText(`${track.bpm} BPM  ·  ${track.beatsPerBar}/4  ·  ${track.totalBars} bars`, x + 44 + nameW, my + metaSize * 0.36)

  // Bar:beat counter (right side, prominent)
  const bar  = Math.floor(currentBeat / track.beatsPerBar) + 1
  const beat = Math.floor(currentBeat % track.beatsPerBar) + 1
  const ctrSize = Math.round(h * 0.38)
  ctx.font      = `bold ${ctrSize}px ${MONO}`
  ctx.fillStyle = '#7c4dff'
  ctx.textAlign = 'right'
  ctx.fillText(`${bar}:${beat}`, x + w - 18, my + ctrSize * 0.36)

  // Credit (subtle)
  const credSize = Math.round(h * 0.22)
  ctx.font      = `${credSize}px ${FONT}`
  ctx.fillStyle = 'rgba(50,62,90,0.80)'
  ctx.fillText('chordsequence.com', x + w - 18, my + ctrSize * 0.36 + credSize + 2)
}

// ════════════════════════════════════════════════════════════════════════════
// FOOTER (progress bar)
// ════════════════════════════════════════════════════════════════════════════

function drawFooter(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  track: BassTrack, currentBeat: number,
) {
  const totalBeats  = track.totalBars * track.beatsPerBar
  const totalSec    = (totalBeats / track.bpm) * 60
  const elapsedSec  = (currentBeat / track.bpm) * 60
  const progress    = Math.min(currentBeat / totalBeats, 1)

  // Background
  ctx.fillStyle = '#080c14'
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = 'rgba(50,62,90,0.60)'
  ctx.fillRect(x, y, w, 1)

  const PAD  = 20
  const barY = y + h * 0.32
  const barH = Math.round(h * 0.14)
  const barW = w - PAD * 2

  // Track background
  rr(ctx, x + PAD, barY, barW, barH, barH / 2, '#141c2e')

  // Fill
  const fillW = barW * progress
  if (fillW > 0) {
    const pg = ctx.createLinearGradient(x + PAD, 0, x + PAD + fillW, 0)
    pg.addColorStop(0, '#4c1d95')
    pg.addColorStop(1, '#8b5cf6')
    rr(ctx, x + PAD, barY, fillW, barH, barH / 2, undefined)
    ctx.fillStyle = pg
    ctx.fill()

    // Glow dot at progress tip
    const tipX = x + PAD + fillW
    const tipY = barY + barH / 2
    const tg   = ctx.createRadialGradient(tipX, tipY, 0, tipX, tipY, 14)
    tg.addColorStop(0, 'rgba(139,92,246,0.75)')
    tg.addColorStop(1, 'transparent')
    ctx.fillStyle = tg
    ctx.beginPath()
    ctx.arc(tipX, tipY, 14, 0, Math.PI * 2)
    ctx.fill()
  }

  // Time labels
  const textY   = barY + barH + Math.round(h * 0.28)
  const txtSize = Math.round(h * 0.20)
  ctx.font      = `bold ${txtSize}px ${MONO}`
  ctx.fillStyle = 'rgba(80,95,130,0.85)'
  ctx.textAlign = 'left'
  ctx.fillText(fmtTime(elapsedSec), x + PAD, textY)

  ctx.textAlign = 'right'
  ctx.fillText(fmtTime(totalSec), x + w - PAD, textY)

  ctx.textAlign = 'center'
  ctx.font      = `${txtSize}px ${FONT}`
  ctx.fillStyle = 'rgba(50,62,90,0.70)'
  ctx.fillText(`${track.bpm} BPM`, x + w / 2, textY)
}

// ════════════════════════════════════════════════════════════════════════════
// FULL FRAME
// ════════════════════════════════════════════════════════════════════════════

export function drawVideoFrame(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  track: BassTrack,
  currentBeat: number,
  ar: AspectRatio,
) {
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = '#0a0e16'
  ctx.fillRect(0, 0, w, h)

  const activeFrets = getActiveFrets(track, currentBeat)

  const is169 = ar === '16:9'

  const HEADER_H = is169 ? 52  : 70
  const FOOTER_H = is169 ? 64  : 120
  const FRET_H   = is169 ? Math.round((h - HEADER_H - FOOTER_H) * 0.46)
                         : Math.round((h - HEADER_H - FOOTER_H) * 0.36)
  const TAB_Y    = HEADER_H + FRET_H
  const TAB_H    = h - TAB_Y - FOOTER_H

  drawHeader(ctx, 0, 0, w, HEADER_H, track, currentBeat)
  drawFretboard(ctx, 0, HEADER_H, w, FRET_H, activeFrets)

  // Thin separator between fretboard and tab
  ctx.fillStyle = 'rgba(30,38,60,0.80)'
  ctx.fillRect(0, TAB_Y, w, 1)

  drawScrollingTab(ctx, 0, TAB_Y, w, TAB_H, track, currentBeat)
  drawFooter(ctx, 0, h - FOOTER_H, w, FOOTER_H, track, currentBeat)
}

// ════════════════════════════════════════════════════════════════════════════
// EXPORT PIPELINE
// ════════════════════════════════════════════════════════════════════════════

function pickMimeType(): string {
  for (const mt of ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']) {
    if (MediaRecorder.isTypeSupported(mt)) return mt
  }
  return ''
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function startVideoExport(
  track: BassTrack,
  sound: BassSound,
  canvas: HTMLCanvasElement,
  opts: VideoExportOptions,
  onDone:  (blob: Blob) => void,
  onError: (err: Error) => void,
): VideoExportHandle {
  let cancelled = false
  let rafId     = 0
  let audioCtx: AudioContext | null   = null
  let recorder:  MediaRecorder | null = null

  const { w, h }   = dims(opts.aspectRatio)
  canvas.width     = w
  canvas.height    = h
  const ctx        = canvas.getContext('2d')!

  const totalBeats    = track.totalBars * track.beatsPerBar
  const beatDur       = 60 / track.bpm
  const totalDuration = totalBeats * beatDur

  // Initial preview frame
  drawVideoFrame(ctx, w, h, track, 0, opts.aspectRatio)

  ;(async () => {
    try {
      const audioBuffer = await renderTrackOffline(track, sound)
      if (cancelled) return

      audioCtx          = new AudioContext()
      const source      = audioCtx.createBufferSource()
      source.buffer     = audioBuffer
      const gain        = audioCtx.createGain()
      gain.gain.value   = 0.88
      const audioDest   = audioCtx.createMediaStreamDestination()
      source.connect(gain)
      gain.connect(audioDest)

      const videoStream    = canvas.captureStream(30)
      const combinedStream = new MediaStream([
        ...videoStream.getVideoTracks(),
        ...audioDest.stream.getAudioTracks(),
      ])

      const mimeType = pickMimeType()
      recorder       = new MediaRecorder(combinedStream, mimeType ? { mimeType } : undefined)
      const chunks: Blob[] = []
      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }
      recorder.onstop = () => {
        if (cancelled) return
        onDone(new Blob(chunks, { type: mimeType || 'video/webm' }))
      }

      recorder.start(100)
      const t0 = audioCtx.currentTime
      source.start(0)

      const animate = () => {
        if (cancelled) return
        const elapsed  = audioCtx!.currentTime - t0
        const beat     = elapsed * (track.bpm / 60)

        drawVideoFrame(ctx, w, h, track, Math.min(beat, totalBeats), opts.aspectRatio)
        opts.onProgress?.(beat, totalBeats)

        if (elapsed < totalDuration + 0.15) {
          rafId = requestAnimationFrame(animate)
        } else {
          recorder?.stop()
          audioCtx?.close()
        }
      }

      rafId = requestAnimationFrame(animate)

    } catch (err) {
      if (!cancelled) onError(err instanceof Error ? err : new Error(String(err)))
    }
  })()

  return {
    cancel() {
      cancelled = true
      cancelAnimationFrame(rafId)
      try { recorder?.stop() } catch {}
      audioCtx?.close()
    },
  }
}

export function exportTrackAsVideo(
  track: BassTrack,
  sound: BassSound,
  canvas: HTMLCanvasElement,
  opts: VideoExportOptions,
): { handle: VideoExportHandle; promise: Promise<void> } {
  let handle!: VideoExportHandle
  const promise = new Promise<void>((resolve, reject) => {
    handle = startVideoExport(track, sound, canvas, opts,
      blob => {
        const safe = track.name.replace(/[^a-z0-9_\-\s]/gi, '').trim() || 'bass-tab'
        const ext  = opts.aspectRatio === '9:16' ? 'short' : 'video'
        downloadBlob(blob, `${safe}-${ext}.webm`)
        resolve()
      },
      reject,
    )
  })
  return { handle, promise }
}
