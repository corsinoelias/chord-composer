import type { BassTrack, BassSound } from './types'
import { renderTrackOffline } from './bassAudio'
import { Muxer, ArrayBufferTarget } from 'webm-muxer'

export type AspectRatio = '16:9' | '9:16' | '1:1'
export type VideoQuality = 'hd' | 'fhd'

export interface VideoExportOptions {
  aspectRatio: AspectRatio
  quality?: VideoQuality
  onProgress?: (beat: number, totalBeats: number) => void
}

export interface VideoExportHandle {
  cancel: () => void
}

// ── Dimensions ────────────────────────────────────────────────────────────────

function dims(ar: AspectRatio, q: VideoQuality = 'hd') {
  const scale = q === 'fhd' ? 1.5 : 1
  if (ar === '16:9') return { w: Math.round(1280 * scale), h: Math.round(720  * scale) }
  if (ar === '9:16') return { w: Math.round(720  * scale), h: Math.round(1280 * scale) }
  /* 1:1 */           return { w: q === 'fhd' ? 1080 : 720, h: q === 'fhd' ? 1080 : 720 }
}

function bitrate(q: VideoQuality): number {
  return q === 'fhd' ? 12_000_000 : 6_000_000
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

// Per-string color accents for the scrolling tab
const TAB_STR = [
  { body: 'rgba(50,68,118,0.75)',  hi: 'rgba(75,100,165,0.40)', glow: 'rgba(60,100,240,0.28)',  noteBg: '#0d1530', noteBd: '#2a4080', noteActiveBg: '#14204a', noteActiveBd: '#4a70f0', noteText: '#8aa4e8', noteActiveText: '#b0c8ff' },
  { body: 'rgba(35,88,100,0.75)',  hi: 'rgba(55,128,148,0.40)', glow: 'rgba(40,160,190,0.28)',  noteBg: '#0d2028', noteBd: '#1a5060', noteActiveBg: '#142c38', noteActiveBd: '#38aac0', noteText: '#7ab8c8', noteActiveText: '#a0d8e8' },
  { body: 'rgba(35,88,55,0.75)',   hi: 'rgba(55,128,78,0.40)',  glow: 'rgba(40,170,90,0.28)',   noteBg: '#0d2016', noteBd: '#1a5030', noteActiveBg: '#142820', noteActiveBd: '#38a870', noteText: '#7ab890', noteActiveText: '#a0d8b0' },
  { body: 'rgba(68,48,120,0.80)',  hi: 'rgba(105,72,174,0.45)', glow: 'rgba(139,92,246,0.35)',  noteBg: '#18102e', noteBd: '#4a2878', noteActiveBg: '#221440', noteActiveBd: '#8b5cf6', noteText: '#9880c8', noteActiveText: '#c4adff' },
]

function drawScrollingTab(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  track: BassTrack,
  currentBeat: number,
) {
  const LABEL_W    = 44
  const PAD_V      = h * 0.12
  const strArea    = h - PAD_V * 2
  const STR_GAP    = strArea / 3
  const STR_Y      = [0, STR_GAP, STR_GAP * 2, STR_GAP * 3].map(d => y + PAD_V + d)
  const PPB        = (w - LABEL_W) / 8
  const CURSOR_X   = x + LABEL_W + PPB * 2
  const NOTE_H     = STR_GAP * 0.62
  const TRAIL_FADE = 0.35   // beats over which a trail fades

  // ── 1. Background + row tints ──────────────────────────────────────────────
  ctx.fillStyle = '#0c1020'
  ctx.fillRect(x, y, w, h)

  for (let si = 0; si < 4; si++) {
    const ry = si === 0 ? y : STR_Y[si] - STR_GAP / 2
    const rh = si === 3 ? y + h - ry : STR_GAP
    ctx.fillStyle = si % 2 === 0 ? 'rgba(255,255,255,0.0)' : 'rgba(255,255,255,0.022)'
    ctx.fillRect(x + LABEL_W, ry, w - LABEL_W, rh)
  }

  // ── 2. String lines (BEFORE notes so notes draw on top) ──────────────────
  for (let si = 0; si < 4; si++) {
    const sy  = STR_Y[si]
    const ts  = TAB_STR[si]
    const sw  = STRINGS[si].totalW

    ctx.strokeStyle = STRINGS[si].shadow
    ctx.lineWidth   = sw + 1
    ctx.beginPath()
    ctx.moveTo(x + LABEL_W, sy + sw * 0.3)
    ctx.lineTo(x + w,       sy + sw * 0.3)
    ctx.stroke()

    ctx.strokeStyle = ts.body
    ctx.lineWidth   = sw
    ctx.beginPath()
    ctx.moveTo(x + LABEL_W, sy)
    ctx.lineTo(x + w,       sy)
    ctx.stroke()

    ctx.strokeStyle = ts.hi
    ctx.lineWidth   = sw * 0.35
    ctx.beginPath()
    ctx.moveTo(x + LABEL_W, sy - sw * 0.28)
    ctx.lineTo(x + w,       sy - sw * 0.28)
    ctx.stroke()
  }

  // ── 3. Active string glow ──────────────────────────────────────────────────
  for (let si = 0; si < 4; si++) {
    const hasActive = track.notes.some(
      n => n.stringIndex === si && currentBeat >= n.startBeat && currentBeat < n.startBeat + n.durationBeats,
    )
    if (!hasActive) continue
    const sy  = STR_Y[si]
    const sg  = ctx.createLinearGradient(x + LABEL_W, sy, x + w, sy)
    const col = TAB_STR[si].glow
    sg.addColorStop(0,   'transparent')
    sg.addColorStop(0.08, col)
    sg.addColorStop(0.92, col)
    sg.addColorStop(1,   'transparent')
    ctx.save()
    ctx.shadowColor = col
    ctx.shadowBlur  = 6
    ctx.strokeStyle = sg
    ctx.lineWidth   = 3
    ctx.beginPath()
    ctx.moveTo(x + LABEL_W, sy)
    ctx.lineTo(x + w,       sy)
    ctx.stroke()
    ctx.restore()
  }

  // ── 4. Cursor glow ────────────────────────────────────────────────────────
  const centerY = (STR_Y[0] + STR_Y[3]) / 2
  for (const [glowW, alpha] of [[80, 0.08], [44, 0.15], [22, 0.09]] as [number, number][]) {
    const cg = ctx.createRadialGradient(CURSOR_X, centerY, 0, CURSOR_X, centerY, glowW)
    cg.addColorStop(0, `rgba(124,77,255,${alpha})`)
    cg.addColorStop(1, 'transparent')
    ctx.fillStyle = cg
    ctx.fillRect(CURSOR_X - glowW, y, glowW * 2, h)
  }

  // ── 5. Clip note area ─────────────────────────────────────────────────────
  ctx.save()
  ctx.beginPath()
  ctx.rect(x + LABEL_W, y, w - LABEL_W, h)
  ctx.clip()

  // ── 6. Bar lines + numbers ────────────────────────────────────────────────
  const visBeatStart = currentBeat - 3
  const visBeatEnd   = currentBeat + 9
  const firstBar     = Math.max(0, Math.floor(visBeatStart / track.beatsPerBar))
  const lastBar      = Math.min(track.totalBars, Math.ceil(visBeatEnd / track.beatsPerBar))

  for (let bar = firstBar; bar <= lastBar; bar++) {
    const barBeat = bar * track.beatsPerBar
    const bx      = CURSOR_X + (barBeat - currentBeat) * PPB
    if (bx < x + LABEL_W - 4 || bx > x + w + 4) continue

    const section = track.sections?.find(s => s.startBar === bar)
    if (section) {
      // Section: full-height translucent stripe + double bar + pill
      ctx.fillStyle = 'rgba(124,77,255,0.05)'
      ctx.fillRect(bx, y, PPB * track.beatsPerBar, h)

      ctx.fillStyle = '#7c4dff'
      ctx.fillRect(bx - 3, STR_Y[0] - 12, 2, STR_Y[3] - STR_Y[0] + 24)
      ctx.fillRect(bx + 2, STR_Y[0] - 12, 4, STR_Y[3] - STR_Y[0] + 24)

      const label = section.name.toUpperCase()
      ctx.font    = `bold ${Math.round(STR_GAP * 0.30)}px ${FONT}`
      ctx.textBaseline = 'alphabetic'
      const tw    = ctx.measureText(label).width
      rr(ctx, bx + 6, STR_Y[0] - 30, tw + 12, 20, 5, '#2d1a6e', '#7c4dff', 1)
      ctx.fillStyle = '#c4b0ff'
      ctx.textAlign = 'left'
      ctx.fillText(label, bx + 12, STR_Y[0] - 14)
    } else if (bar > 0) {
      ctx.strokeStyle = 'rgba(80,96,140,0.55)'
      ctx.lineWidth   = 1.5
      ctx.beginPath()
      ctx.moveTo(bx, STR_Y[0] - 10)
      ctx.lineTo(bx, STR_Y[3] + 10)
      ctx.stroke()
    }

    if (bar < track.totalBars) {
      ctx.font      = `${Math.round(STR_GAP * 0.28)}px ${MONO}`
      ctx.fillStyle = 'rgba(90,104,140,0.70)'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
      ctx.fillText(String(bar + 1), bx + 4, STR_Y[0] - 13)

      for (let b = 1; b < track.beatsPerBar; b++) {
        const tx = bx + b * PPB
        if (tx < x + LABEL_W || tx > x + w) continue
        ctx.strokeStyle = 'rgba(35,46,75,0.75)'
        ctx.lineWidth   = 0.75
        ctx.setLineDash([3, 4])
        ctx.beginPath()
        ctx.moveTo(tx, STR_Y[0] - 5)
        ctx.lineTo(tx, STR_Y[3] + 5)
        ctx.stroke()
        ctx.setLineDash([])
      }
    }

    if (bar === track.totalBars) {
      ctx.fillStyle = 'rgba(80,96,140,0.50)'
      ctx.fillRect(bx - 4, STR_Y[0] - 10, 3, STR_Y[3] - STR_Y[0] + 20)
      ctx.fillRect(bx + 1, STR_Y[0] - 10, 6, STR_Y[3] - STR_Y[0] + 20)
    }
  }

  // ── 7. Note trails (ghost of recently-ended notes) ────────────────────────
  for (const note of track.notes) {
    const noteEnd  = note.startBeat + note.durationBeats
    const trailAge = currentBeat - noteEnd
    if (trailAge <= 0 || trailAge > TRAIL_FADE) continue

    const opacity = (1 - trailAge / TRAIL_FADE) * 0.40
    const nx      = CURSOR_X + (note.startBeat - currentBeat) * PPB
    const ny      = STR_Y[note.stringIndex]
    const noteW   = Math.max(20, note.durationBeats * PPB * 0.88)
    const nc      = TAB_STR[note.stringIndex]

    ctx.globalAlpha = opacity
    rr(ctx, nx, ny - NOTE_H / 2, noteW, NOTE_H, 5, nc.noteActiveBg + '99', nc.noteActiveBd, 1)
    ctx.globalAlpha = 1
  }

  // ── 8. Notes (ON TOP of strings) ─────────────────────────────────────────
  for (const note of track.notes) {
    if (note.startBeat + note.durationBeats < currentBeat - TRAIL_FADE - 0.1) continue
    if (note.startBeat > currentBeat + 10) continue

    const nx       = CURSOR_X + (note.startBeat - currentBeat) * PPB
    const ny       = STR_Y[note.stringIndex]
    const noteW    = Math.max(20, note.durationBeats * PPB * 0.88)
    const isActive = currentBeat >= note.startBeat && currentBeat < note.startBeat + note.durationBeats
    const nc       = TAB_STR[note.stringIndex]

    if (isActive) {
      // Per-string radial glow
      const ag = ctx.createRadialGradient(nx + noteW / 2, ny, 0, nx + noteW / 2, ny, noteW * 0.85)
      ag.addColorStop(0, nc.glow)
      ag.addColorStop(1, 'transparent')
      ctx.fillStyle = ag
      ctx.fillRect(nx - noteW * 0.25, ny - NOTE_H * 1.1, noteW * 1.5, NOTE_H * 2.2)
    }

    rr(ctx, nx, ny - NOTE_H / 2, noteW, NOTE_H, 5,
      isActive ? nc.noteActiveBg : nc.noteBg,
      isActive ? nc.noteActiveBd : nc.noteBd,
      isActive ? 2 : 1,
    )

    if (noteW > 14) {
      const fontSize = Math.min(Math.round(NOTE_H * 0.56), 15)
      ctx.font          = `bold ${fontSize}px ${MONO}`
      ctx.fillStyle     = isActive ? nc.noteActiveText : nc.noteText
      ctx.textAlign     = 'center'
      ctx.textBaseline  = 'middle'         // ← centers text vertically in the note box
      ctx.fillText(String(note.fret), nx + noteW / 2, ny)
    }
  }

  ctx.textBaseline = 'alphabetic'   // reset for everything else
  ctx.restore()

  // ── 9. Beat pulse at cursor ────────────────────────────────────────────────
  const beatFrac   = currentBeat % 1
  const isDownbeat = Math.floor(currentBeat % track.beatsPerBar) === 0
  const pulseFade  = Math.max(0, 1 - beatFrac * 9)
  if (pulseFade > 0) {
    const pulseAlpha = pulseFade * (isDownbeat ? 0.22 : 0.10)
    const pulseH     = STR_Y[3] - STR_Y[0] + 28
    const pg = ctx.createLinearGradient(CURSOR_X - 8, 0, CURSOR_X + 8, 0)
    pg.addColorStop(0,   'transparent')
    pg.addColorStop(0.5, `rgba(139,92,246,${pulseAlpha})`)
    pg.addColorStop(1,   'transparent')
    ctx.fillStyle = pg
    ctx.fillRect(CURSOR_X - 8, STR_Y[0] - 14, 16, pulseH)
  }

  // ── 10. Cursor line ────────────────────────────────────────────────────────
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

  // ── 11. Left label panel ───────────────────────────────────────────────────
  ctx.fillStyle = 'rgba(28,34,52,0.96)'
  ctx.fillRect(x, y, LABEL_W, h)
  ctx.strokeStyle = 'rgba(50,62,90,0.80)'
  ctx.lineWidth   = 1
  ctx.beginPath()
  ctx.moveTo(x + LABEL_W, y)
  ctx.lineTo(x + LABEL_W, y + h)
  ctx.stroke()

  // String labels (always on top of panel)
  for (let si = 0; si < 4; si++) {
    const sy  = STR_Y[si]
    const col = TAB_STR[si].noteActiveText
    ctx.font          = `bold ${Math.round(STR_GAP * 0.34)}px ${MONO}`
    ctx.fillStyle     = col
    ctx.textAlign     = 'center'
    ctx.textBaseline  = 'middle'
    ctx.fillText(STRING_NAMES[si], x + LABEL_W / 2, sy)
  }
  ctx.textBaseline = 'alphabetic'
}

// ════════════════════════════════════════════════════════════════════════════
// BAR VIEW  (9:16 portrait — one full bar at a time)
// ════════════════════════════════════════════════════════════════════════════

function drawBarView(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  track: BassTrack,
  currentBeat: number,
) {
  const LABEL_W  = 44
  const NOTE_W   = w - LABEL_W
  const currBar   = Math.floor(currentBeat / track.beatsPerBar)
  const beatInBar = currentBeat - currBar * track.beatsPerBar

  // ── Background ─────────────────────────────────────────────────────────────
  ctx.fillStyle = '#0c1020'
  ctx.fillRect(x, y, w, h)

  // ── Helper: draw one bar (reused for current + next) ─────────────────────
  function drawBar(
    bar: number,
    bx: number, by: number, bw: number, bh: number,
    isActive: boolean,
  ) {
    const LABEL_ROW  = Math.round(bh * 0.088)
    const PAD_V      = Math.round((bh - LABEL_ROW) * 0.075)
    const STR_SPAN   = bh - LABEL_ROW - PAD_V * 2
    const STR_GAP    = STR_SPAN / 3
    const NOTE_H     = Math.min(STR_GAP * 0.64, 52)
    const NOTE_AREA  = bw - LABEL_W
    const barStart   = bar * track.beatsPerBar
    const isEnd      = bar >= track.totalBars

    const STR_Y = Array.from({ length: 4 }, (_, i) =>
      by + LABEL_ROW + PAD_V + i * STR_GAP,
    )

    // Row alternating tint
    for (let si = 0; si < 4; si++) {
      const ry = si === 0 ? by + LABEL_ROW : STR_Y[si] - STR_GAP / 2
      const rh = si === 3 ? by + bh - ry   : STR_GAP
      ctx.fillStyle = si % 2 ? 'rgba(255,255,255,0.020)' : 'rgba(0,0,0,0)'
      ctx.fillRect(bx + LABEL_W, ry, NOTE_AREA, rh)
    }

    // ── Bar label row ──
    if (!isEnd) {
      const section = track.sections?.find(s => s.startBar === bar)
      const labelSize = Math.round(LABEL_ROW * 0.44)

      ctx.font         = `bold ${labelSize}px ${MONO}`
      ctx.fillStyle    = isActive ? '#7c4dff' : 'rgba(60,75,120,0.70)'
      ctx.textAlign    = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(`Bar ${bar + 1}`, bx + LABEL_W + 6, by + LABEL_ROW / 2)

      if (section) {
        const pillSize = Math.round(LABEL_ROW * 0.36)
        ctx.font       = `bold ${pillSize}px ${FONT}`
        const tw       = ctx.measureText(section.name.toUpperCase()).width
        const pillX    = bx + LABEL_W + 68
        const pillY    = by + LABEL_ROW / 2 - pillSize * 0.85
        rr(ctx, pillX, pillY, tw + 12, pillSize * 1.7, 4, '#2d1a6e', '#7c4dff', 1)
        ctx.fillStyle    = '#c4b0ff'
        ctx.textBaseline = 'middle'
        ctx.fillText(section.name.toUpperCase(), pillX + 6, by + LABEL_ROW / 2)
      }
      ctx.textBaseline = 'alphabetic'
    }

    // ── Beat + bar lines ──
    for (let b = 0; b <= track.beatsPerBar; b++) {
      const lx = bx + LABEL_W + (b / track.beatsPerBar) * NOTE_AREA
      const isBarLine = b === 0 || b === track.beatsPerBar
      ctx.strokeStyle = isBarLine ? 'rgba(80,96,140,0.55)' : 'rgba(35,46,75,0.70)'
      ctx.lineWidth   = isBarLine ? 1.5 : 0.75
      if (!isBarLine) ctx.setLineDash([3, 4])
      ctx.beginPath()
      ctx.moveTo(lx, STR_Y[0] - 10)
      ctx.lineTo(lx, STR_Y[3] + 10)
      ctx.stroke()
      ctx.setLineDash([])
    }

    // ── String lines (drawn BEFORE notes) ──
    for (let si = 0; si < 4; si++) {
      const sy = STR_Y[si]
      const ts = TAB_STR[si]
      const sw = STRINGS[si].totalW * (isActive ? 1 : 0.65)

      // Active string glow
      if (isActive) {
        const strActive = track.notes.some(
          n => n.stringIndex === si &&
               currentBeat >= n.startBeat &&
               currentBeat < n.startBeat + n.durationBeats,
        )
        if (strActive) {
          ctx.save()
          ctx.shadowColor = ts.glow
          ctx.shadowBlur  = 6
          ctx.strokeStyle = ts.glow
          ctx.lineWidth   = sw + 2.5
          ctx.beginPath()
          ctx.moveTo(bx + LABEL_W, sy)
          ctx.lineTo(bx + bw, sy)
          ctx.stroke()
          ctx.restore()
        }
      }

      ctx.globalAlpha = isActive ? 1 : 0.50
      ctx.strokeStyle = ts.body
      ctx.lineWidth   = sw
      ctx.beginPath()
      ctx.moveTo(bx + LABEL_W, sy)
      ctx.lineTo(bx + bw, sy)
      ctx.stroke()
      ctx.globalAlpha = 1
    }

    // ── Notes (clipped to note area, drawn on top of strings) ──
    ctx.save()
    ctx.beginPath()
    ctx.rect(bx + LABEL_W, by + LABEL_ROW, NOTE_AREA, bh - LABEL_ROW)
    ctx.clip()

    if (!isEnd) {
      const barNotes = track.notes.filter(
        n => n.startBeat >= barStart && n.startBeat < barStart + track.beatsPerBar,
      )

      for (const note of barNotes) {
        const beat      = note.startBeat - barStart
        const nx        = bx + LABEL_W + (beat / track.beatsPerBar) * NOTE_AREA
        const ny        = STR_Y[note.stringIndex]
        const noteW     = Math.max(20, (note.durationBeats / track.beatsPerBar) * NOTE_AREA * 0.92)
        const noteActive = isActive &&
          currentBeat >= note.startBeat &&
          currentBeat < note.startBeat + note.durationBeats
        const nc = TAB_STR[note.stringIndex]

        if (noteActive) {
          const ag = ctx.createRadialGradient(nx + noteW / 2, ny, 0, nx + noteW / 2, ny, noteW * 0.80)
          ag.addColorStop(0, nc.glow)
          ag.addColorStop(1, 'transparent')
          ctx.fillStyle = ag
          ctx.fillRect(nx - noteW * 0.12, ny - NOTE_H * 1.2, noteW * 1.24, NOTE_H * 2.4)
        }

        ctx.globalAlpha = isActive ? 1 : 0.48
        rr(ctx, nx, ny - NOTE_H / 2, noteW, NOTE_H, 6,
          noteActive ? nc.noteActiveBg : nc.noteBg,
          noteActive ? nc.noteActiveBd : nc.noteBd,
          noteActive ? 2.5 : 1,
        )

        if (noteW > 14) {
          const fontSize    = Math.min(Math.round(NOTE_H * 0.56), 22)
          ctx.font          = `bold ${fontSize}px ${MONO}`
          ctx.fillStyle     = noteActive ? nc.noteActiveText : nc.noteText
          ctx.textAlign     = 'center'
          ctx.textBaseline  = 'middle'
          ctx.fillText(String(note.fret), nx + noteW / 2, ny)
        }
        ctx.globalAlpha = 1
      }
    }

    ctx.textBaseline = 'alphabetic'
    ctx.restore()

    // ── Playhead (only in active bar) ──
    if (isActive) {
      const phX = bx + LABEL_W + (beatInBar / track.beatsPerBar) * NOTE_AREA

      // Beat pulse
      const beatFracOfBeat = currentBeat % 1
      const isDownbeat     = Math.floor(currentBeat) % track.beatsPerBar === 0
      const pulseFade      = Math.max(0, 1 - beatFracOfBeat * 9)
      if (pulseFade > 0) {
        const pa = pulseFade * (isDownbeat ? 0.24 : 0.11)
        const pg = ctx.createLinearGradient(phX - 12, 0, phX + 12, 0)
        pg.addColorStop(0,   'transparent')
        pg.addColorStop(0.5, `rgba(139,92,246,${pa})`)
        pg.addColorStop(1,   'transparent')
        ctx.fillStyle = pg
        ctx.fillRect(phX - 12, STR_Y[0] - 16, 24, STR_Y[3] - STR_Y[0] + 32)
      }

      ctx.save()
      ctx.shadowColor = '#7c4dff'
      ctx.shadowBlur  = 12
      ctx.strokeStyle = '#8b5cf6'
      ctx.lineWidth   = 2.5
      ctx.beginPath()
      ctx.moveTo(phX, STR_Y[0] - 16)
      ctx.lineTo(phX, STR_Y[3] + 16)
      ctx.stroke()
      ctx.restore()

      const tri = 7
      ctx.fillStyle = '#8b5cf6'
      ctx.beginPath()
      ctx.moveTo(phX - tri, STR_Y[0] - 16)
      ctx.lineTo(phX + tri, STR_Y[0] - 16)
      ctx.lineTo(phX,       STR_Y[0] - 16 + tri * 1.2)
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(phX - tri, STR_Y[3] + 16)
      ctx.lineTo(phX + tri, STR_Y[3] + 16)
      ctx.lineTo(phX,       STR_Y[3] + 16 - tri * 1.2)
      ctx.fill()
    }

    // ── Left label panel (always on top) ──
    ctx.fillStyle = 'rgba(28,34,52,0.97)'
    ctx.fillRect(bx, by, LABEL_W, bh)
    ctx.strokeStyle = 'rgba(50,62,90,0.70)'
    ctx.lineWidth   = 1
    ctx.beginPath()
    ctx.moveTo(bx + LABEL_W, by)
    ctx.lineTo(bx + LABEL_W, by + bh)
    ctx.stroke()

    for (let si = 0; si < 4; si++) {
      const col = isActive ? TAB_STR[si].noteActiveText : 'rgba(55,68,105,0.80)'
      ctx.font         = `bold ${Math.round(STR_GAP * 0.36)}px ${MONO}`
      ctx.fillStyle    = col
      ctx.textAlign    = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(STRING_NAMES[si], bx + LABEL_W / 2, STR_Y[si])
    }
    ctx.textBaseline = 'alphabetic'
  }

  // ── Render current bar (top 2/3) + next bar preview (bottom 1/3) ─────────
  const CURR_H = Math.round(h * 0.67)
  const NEXT_H = h - CURR_H
  drawBar(currBar, x, y, w, CURR_H, true)

  // Divider
  ctx.fillStyle = 'rgba(50,62,90,0.55)'
  ctx.fillRect(x, y + CURR_H, w, 1)

  // "Next" label
  const nextLabelSize = Math.round(NEXT_H * 0.18)
  ctx.font         = `bold ${nextLabelSize}px ${FONT}`
  ctx.fillStyle    = 'rgba(109,40,217,0.55)'
  ctx.textAlign    = 'right'
  ctx.textBaseline = 'middle'
  ctx.fillText('NEXT', x + w - Math.round(w * 0.025), y + CURR_H + NEXT_H * 0.14)
  ctx.textBaseline = 'alphabetic'

  if (currBar + 1 < track.totalBars) {
    ctx.globalAlpha = 0.50
    drawBar(currBar + 1, x, y + CURR_H, w, NEXT_H, false)
    ctx.globalAlpha = 1
  }
}

// ════════════════════════════════════════════════════════════════════════════
// HEADER
// ════════════════════════════════════════════════════════════════════════════

function drawHeader(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  track: BassTrack, currentBeat: number,
) {
  // Background gradient (slightly lighter at top)
  const bg = ctx.createLinearGradient(x, y, x, y + h)
  bg.addColorStop(0, '#111827')
  bg.addColorStop(1, '#0c1020')
  ctx.fillStyle = bg
  ctx.fillRect(x, y, w, h)

  // Left accent bar
  const accentW = Math.max(3, Math.round(w * 0.003))
  const accent = ctx.createLinearGradient(x, y, x, y + h)
  accent.addColorStop(0, '#a78bfa')
  accent.addColorStop(1, '#6d28d9')
  ctx.fillStyle = accent
  ctx.fillRect(x, y, accentW, h)

  // Bottom separator with glow tint
  const sep = ctx.createLinearGradient(x, y + h - 1, x + w, y + h - 1)
  sep.addColorStop(0,    'rgba(109,40,217,0.0)')
  sep.addColorStop(0.15, 'rgba(109,40,217,0.55)')
  sep.addColorStop(0.85, 'rgba(109,40,217,0.55)')
  sep.addColorStop(1,    'rgba(109,40,217,0.0)')
  ctx.fillStyle = sep
  ctx.fillRect(x, y + h - 1, w, 1)

  const PAD    = accentW + Math.round(w * 0.018)
  const topY   = y + h * 0.34
  const botY   = y + h * 0.72

  // Track name (top line)
  const nameSize = Math.round(h * 0.36)
  ctx.font      = `700 ${nameSize}px ${FONT}`
  ctx.fillStyle = '#e2e8f4'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(track.name, x + PAD, topY + nameSize * 0.36)

  // Meta line (bottom)
  const metaSize = Math.round(h * 0.24)
  ctx.font      = `${metaSize}px ${FONT}`
  ctx.fillStyle = 'rgba(100,116,160,0.90)'
  ctx.fillText(`${track.bpm} BPM · ${track.beatsPerBar}/4 · ${track.totalBars} bars`, x + PAD, botY + metaSize * 0.36)

  // Right: bar:beat counter
  const bar  = Math.floor(currentBeat / track.beatsPerBar) + 1
  const beat = Math.floor(currentBeat % track.beatsPerBar) + 1
  const ctrSize = Math.round(h * 0.40)
  ctx.font      = `700 ${ctrSize}px ${MONO}`
  ctx.fillStyle = '#a78bfa'
  ctx.textAlign = 'right'

  // Subtle glow behind counter
  ctx.save()
  ctx.shadowColor = '#7c4dff'
  ctx.shadowBlur  = Math.round(h * 0.25)
  ctx.fillText(`${bar}:${beat}`, x + w - Math.round(w * 0.018), topY + ctrSize * 0.36)
  ctx.restore()

  // chordsequence.com brand (below counter)
  const brandSize = Math.round(h * 0.20)
  ctx.font      = `${brandSize}px ${FONT}`
  ctx.fillStyle = 'rgba(109,40,217,0.70)'
  ctx.textAlign = 'right'
  ctx.fillText('chordsequence.com', x + w - Math.round(w * 0.018), botY + brandSize * 0.36)

  ctx.textBaseline = 'alphabetic'
}

// ════════════════════════════════════════════════════════════════════════════
// FOOTER (progress bar)
// ════════════════════════════════════════════════════════════════════════════

function drawFooter(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  track: BassTrack, currentBeat: number,
) {
  const totalBeats = track.totalBars * track.beatsPerBar
  const progress   = Math.min(currentBeat / totalBeats, 1)

  ctx.fillStyle = '#080c14'
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = 'rgba(50,62,90,0.60)'
  ctx.fillRect(x, y, w, 1)

  const PAD  = Math.round(w * 0.016)
  const barH = Math.max(4, Math.round(h * 0.22))
  const barY = y + (h - barH) / 2
  const barW = w - PAD * 2

  rr(ctx, x + PAD, barY, barW, barH, barH / 2, '#141c2e')

  const fillW = barW * progress
  if (fillW > 0) {
    const pg = ctx.createLinearGradient(x + PAD, 0, x + PAD + fillW, 0)
    pg.addColorStop(0, '#4c1d95')
    pg.addColorStop(1, '#8b5cf6')
    rr(ctx, x + PAD, barY, fillW, barH, barH / 2, undefined)
    ctx.fillStyle = pg
    ctx.fill()

    const tipX = x + PAD + fillW
    const tipY = barY + barH / 2
    const tg   = ctx.createRadialGradient(tipX, tipY, 0, tipX, tipY, barH * 2)
    tg.addColorStop(0, 'rgba(139,92,246,0.70)')
    tg.addColorStop(1, 'transparent')
    ctx.fillStyle = tg
    ctx.beginPath()
    ctx.arc(tipX, tipY, barH * 2, 0, Math.PI * 2)
    ctx.fill()
  }
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
  const is11  = ar === '1:1'

  const HEADER_H = is169 ? 52 : is11 ? 60 : 70
  const FOOTER_H = is169 ? 28 : is11 ? 32 : 48
  const FRET_H   = is169 ? Math.round((h - HEADER_H - FOOTER_H) * 0.46)
                 : is11  ? Math.round((h - HEADER_H - FOOTER_H) * 0.42)
                         : Math.round((h - HEADER_H - FOOTER_H) * 0.36)
  const TAB_Y    = HEADER_H + FRET_H
  const TAB_H    = h - TAB_Y - FOOTER_H

  drawHeader(ctx, 0, 0, w, HEADER_H, track, currentBeat)
  drawFretboard(ctx, 0, HEADER_H, w, FRET_H, activeFrets)

  ctx.fillStyle = 'rgba(30,38,60,0.80)'
  ctx.fillRect(0, TAB_Y, w, 1)

  if (ar === '9:16') {
    drawBarView(ctx, 0, TAB_Y, w, TAB_H, track, currentBeat)
  } else {
    drawScrollingTab(ctx, 0, TAB_Y, w, TAB_H, track, currentBeat)
  }
  drawFooter(ctx, 0, h - FOOTER_H, w, FOOTER_H, track, currentBeat)
}

// ════════════════════════════════════════════════════════════════════════════
// EXPORT PIPELINE — WebCodecs (primary) + MediaRecorder (fallback)
// ════════════════════════════════════════════════════════════════════════════

const FPS = 30

function supportsWebCodecs(): boolean {
  return (
    typeof VideoEncoder !== 'undefined' &&
    typeof AudioEncoder !== 'undefined' &&
    typeof VideoFrame   !== 'undefined' &&
    typeof AudioData    !== 'undefined'
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Chrome's AudioEncoder (Opus) only accepts 48000 Hz. Resample if needed.
async function resampleTo48k(buf: AudioBuffer): Promise<AudioBuffer> {
  if (buf.sampleRate === 48000) return buf
  const length = Math.ceil(buf.duration * 48000)
  const offCtx = new OfflineAudioContext(buf.numberOfChannels, length, 48000)
  const src    = offCtx.createBufferSource()
  src.buffer   = buf
  src.connect(offCtx.destination)
  src.start(0)
  return offCtx.startRendering()
}

// Pick the best VP9 codec string the encoder actually supports.
async function pickVP9Codec(w: number, h: number, fps: number, bps: number): Promise<string> {
  for (const codec of ['vp09.00.41.08', 'vp09.00.31.08', 'vp09.00.20.08', 'vp09.00.10.08']) {
    try {
      const res = await VideoEncoder.isConfigSupported({ codec, width: w, height: h, bitrate: bps, framerate: fps })
      if (res.supported) return codec
    } catch {}
  }
  throw new Error('VP9 VideoEncoder not supported in this browser')
}

// ── WebCodecs path ────────────────────────────────────────────────────────────
// Renders every frame precisely, muxes with perfect A/V sync and seekable index.

async function exportWithWebCodecs(
  track: BassTrack,
  sound: BassSound,
  canvas: HTMLCanvasElement,
  opts: VideoExportOptions,
  signal: { cancelled: boolean },
  onDone:  (blob: Blob) => void,
  onError: (err: Error) => void,
) {
  try {
    const q = opts.quality ?? 'hd'
    const { w, h } = dims(opts.aspectRatio, q)
    canvas.width  = w
    canvas.height = h
    const ctx2d = canvas.getContext('2d')!

    const totalBeats  = track.totalBars * track.beatsPerBar
    const totalSec    = totalBeats * (60 / track.bpm)
    const totalFrames = Math.ceil(totalSec * FPS)
    const bps         = bitrate(q)

    // Pre-render audio then resample to 48 kHz (Opus requirement)
    const rawAudio    = await renderTrackOffline(track, sound)
    if (signal.cancelled) return
    const audioBuffer = await resampleTo48k(rawAudio)
    if (signal.cancelled) return

    const sampleRate  = audioBuffer.sampleRate   // always 48000 now
    const numChannels = audioBuffer.numberOfChannels

    // Check codec support before setting up the muxer
    const videoCodec = await pickVP9Codec(w, h, FPS, bps)
    if (signal.cancelled) return

    const muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: { codec: 'V_VP9', width: w, height: h, frameRate: FPS },
      audio: { codec: 'A_OPUS', numberOfChannels: numChannels, sampleRate },
      firstTimestampBehavior: 'offset',
    })

    let encErr: Error | null = null

    const videoEncoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error:  e => { encErr = e instanceof Error ? e : new Error(String(e)) },
    })
    videoEncoder.configure({ codec: videoCodec, width: w, height: h, bitrate: bps, framerate: FPS })

    const audioEncoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error:  e => { encErr = e instanceof Error ? e : new Error(String(e)) },
    })
    audioEncoder.configure({ codec: 'opus', numberOfChannels: numChannels, sampleRate, bitrate: 192_000 })

    // ── Video frames ──────────────────────────────────────────────────────────
    for (let i = 0; i < totalFrames; i++) {
      if (signal.cancelled || encErr) break

      const t         = i / FPS
      const beat      = Math.min(t * (track.bpm / 60), totalBeats)
      const timestamp = Math.round(t * 1_000_000)
      const duration  = Math.round(1_000_000 / FPS)

      drawVideoFrame(ctx2d, w, h, track, beat, opts.aspectRatio)
      opts.onProgress?.(beat, totalBeats)

      // ImageBitmap is more reliable than passing canvas directly to VideoFrame
      const bitmap = await createImageBitmap(canvas)
      const frame  = new VideoFrame(bitmap, { timestamp, duration })
      bitmap.close()
      videoEncoder.encode(frame, { keyFrame: i % (FPS * 2) === 0 })
      frame.close()

      if (i % 8 === 0) await new Promise<void>(r => setTimeout(r, 0))
    }

    if (signal.cancelled) { videoEncoder.close(); audioEncoder.close(); return }
    if (encErr) throw encErr

    // ── Audio chunks (f32-planar at 48 kHz) ──────────────────────────────────
    const channelData = Array.from({ length: numChannels }, (_, ch) => audioBuffer.getChannelData(ch))
    const CHUNK = 4096

    for (let offset = 0; offset < audioBuffer.length; offset += CHUNK) {
      if (signal.cancelled || encErr) break

      const length    = Math.min(CHUNK, audioBuffer.length - offset)
      const timestamp = Math.round((offset / sampleRate) * 1_000_000)

      const buf = new Float32Array(length * numChannels)
      for (let ch = 0; ch < numChannels; ch++) {
        buf.set(channelData[ch].subarray(offset, offset + length), ch * length)
      }

      const ad = new AudioData({
        format: 'f32-planar', sampleRate,
        numberOfFrames: length, numberOfChannels: numChannels,
        timestamp, data: buf,
      })
      audioEncoder.encode(ad)
      ad.close()
    }

    if (signal.cancelled) { videoEncoder.close(); audioEncoder.close(); return }
    if (encErr) throw encErr

    await videoEncoder.flush()
    await audioEncoder.flush()
    muxer.finalize()

    if (signal.cancelled) return

    const { buffer } = muxer.target as { buffer: ArrayBuffer }
    onDone(new Blob([buffer], { type: 'video/webm' }))

  } catch (err) {
    if (!signal.cancelled) onError(err instanceof Error ? err : new Error(String(err)))
  }
}

// ── MediaRecorder fallback ────────────────────────────────────────────────────
// Used when WebCodecs is not available (Firefox, older Safari).
// Known limitations: no seek index, real-time speed, potential A/V drift.

function pickMimeType(): string {
  for (const mt of ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']) {
    if (MediaRecorder.isTypeSupported(mt)) return mt
  }
  return ''
}

function exportWithMediaRecorder(
  track: BassTrack,
  sound: BassSound,
  canvas: HTMLCanvasElement,
  opts: VideoExportOptions,
  signal: { cancelled: boolean },
  onDone:  (blob: Blob) => void,
  onError: (err: Error) => void,
): { cleanup: () => void } {
  let rafId    = 0
  let audioCtx: AudioContext | null  = null
  let recorder: MediaRecorder | null = null

  const q = opts.quality ?? 'hd'
  const { w, h } = dims(opts.aspectRatio, q)
  canvas.width  = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!

  const totalBeats    = track.totalBars * track.beatsPerBar
  const totalDuration = totalBeats * (60 / track.bpm)

  drawVideoFrame(ctx, w, h, track, 0, opts.aspectRatio)

  ;(async () => {
    try {
      const audioBuffer = await renderTrackOffline(track, sound)
      if (signal.cancelled) return

      audioCtx = new AudioContext()
      const source = audioCtx.createBufferSource()
      source.buffer = audioBuffer
      const gain = audioCtx.createGain()
      gain.gain.value = 0.88
      const audioDest = audioCtx.createMediaStreamDestination()
      source.connect(gain)
      gain.connect(audioDest)

      const videoStream    = canvas.captureStream(FPS)
      const combinedStream = new MediaStream([
        ...videoStream.getVideoTracks(),
        ...audioDest.stream.getAudioTracks(),
      ])

      const mimeType = pickMimeType()
      const recOpts: MediaRecorderOptions = { videoBitsPerSecond: bitrate(q), ...(mimeType ? { mimeType } : {}) }
      recorder = new MediaRecorder(combinedStream, recOpts)
      const chunks: Blob[] = []
      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }
      recorder.onstop = () => {
        if (!signal.cancelled) onDone(new Blob(chunks, { type: mimeType || 'video/webm' }))
      }

      recorder.start(100)
      const t0 = audioCtx.currentTime
      source.start(0)

      const animate = () => {
        if (signal.cancelled) return
        const elapsed = audioCtx!.currentTime - t0
        const beat    = elapsed * (track.bpm / 60)
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
      if (!signal.cancelled) onError(err instanceof Error ? err : new Error(String(err)))
    }
  })()

  return {
    cleanup() {
      cancelAnimationFrame(rafId)
      try { recorder?.stop() } catch {}
      audioCtx?.close()
    },
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function startVideoExport(
  track:   BassTrack,
  sound:   BassSound,
  canvas:  HTMLCanvasElement,
  opts:    VideoExportOptions,
  onDone:  (blob: Blob) => void,
  onError: (err: Error) => void,
): VideoExportHandle {
  const signal = { cancelled: false }

  // Draw initial preview frame
  const { w: pw, h: ph } = dims(opts.aspectRatio, opts.quality ?? 'hd')
  canvas.width  = pw
  canvas.height = ph
  drawVideoFrame(canvas.getContext('2d')!, pw, ph, track, 0, opts.aspectRatio)

  let mrCleanup: (() => void) | null = null

  if (supportsWebCodecs()) {
    exportWithWebCodecs(track, sound, canvas, opts, signal, onDone, err => {
      if (signal.cancelled) return
      // WebCodecs failed — fall back to MediaRecorder transparently
      console.warn('[video export] WebCodecs failed, falling back to MediaRecorder:', err.message)
      const { cleanup } = exportWithMediaRecorder(track, sound, canvas, opts, signal, onDone, onError)
      mrCleanup = cleanup
    })
  } else {
    const { cleanup } = exportWithMediaRecorder(track, sound, canvas, opts, signal, onDone, onError)
    mrCleanup = cleanup
  }

  return {
    cancel() {
      signal.cancelled = true
      mrCleanup?.()
    },
  }
}
