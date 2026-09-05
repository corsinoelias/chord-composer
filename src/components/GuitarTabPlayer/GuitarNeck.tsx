import { useRef, useEffect, type MutableRefObject, type RefObject } from 'react'
import {
  type NeckGeometry,
  hitCell,
  rowFromY,
  cellX,
} from '@/lib/guitar/neckGeometry'
import { fretToNoteName } from '@/lib/guitarTab/guitarTheory'

const PRIMARY = 'hsl(262 83% 52%)'
const PRIMARY_LIT = 'hsl(262 83% 66%)'
const STRING_REST = 'hsl(220 12% 72%)'
const STRING_LIVE = 'hsl(262 83% 74%)'

export interface Vib { amp: number; t0: number; freq: number }

interface Props {
  geo: NeckGeometry
  fbRef: RefObject<HTMLDivElement>
  /** One fret per row (row 0 = high e), -1 = muted/not in the shape. Doubles as what
   *  a sweep sounds, so it stays all-open with no chord picked even though nothing is drawn. */
  shapeRows: number[]
  /** False when no chord is picked: the rows still drive the strum, but drawing six
   *  open-string dots on an empty neck would read as a chord nobody chose. */
  hasShape: boolean
  /** Recently played fret per row, drives the lit dot. */
  activeRows: (number | null)[]
  /** Fret positions to light up across the whole neck, e.g. every C. */
  highlightRows: number[][]
  vibRef: MutableRefObject<Vib[]>
  labelMode: 'notes' | 'frets'
  onPlay: (row: number, fret: number) => void
}

/**
 * The playable neck. Shapes go in the SVG, text and note dots go in an HTML layer on
 * top of it — because the SVG is stretched with preserveAspectRatio="none" so the
 * strings always span the panel, and anything round inside it comes out as an
 * ellipse. The strumming board already splits itself this way for the same reason.
 */
export function GuitarNeck({
  geo, fbRef, shapeRows, hasShape, activeRows, highlightRows, vibRef, labelMode, onPlay,
}: Props) {
  const stringRefs = useRef<(SVGPathElement | null)[]>([null, null, null, null, null, null])
  const draggingRef = useRef(false)
  const lastRowRef = useRef(-1)
  const downCellRef = useRef<{ row: number; fret: number } | null>(null)
  const sweptRef = useRef(false)
  const geoRef = useRef(geo)
  geoRef.current = geo
  const shapeRef = useRef(shapeRows)
  shapeRef.current = shapeRows

  // Imperative string animation. Kept off React state so a 60fps wobble never
  // re-renders the tree; everything it reads is a ref, so it mounts once.
  useEffect(() => {
    let raf = 0
    const frame = () => {
      const g = geoRef.current
      const t = performance.now() / 1000
      const length = g.x1 - g.x0
      const seg = Math.max(24, length / 24)
      for (let i = 0; i < 6; i++) {
        const el = stringRefs.current[i]
        if (!el) continue
        const v = vibRef.current[i]
        const age = t - v.t0
        const amp = age < 0 ? 0 : v.amp * Math.exp(-age * 2.6) * (g.gap / 44)
        const y = g.ys[i]
        const xStart = g.openCol ? g.openCol.x : g.x0
        if (amp < 0.35) {
          el.setAttribute('d', `M${xStart} ${y} L${g.x1} ${y}`)
          el.setAttribute('stroke', STRING_REST)
        } else {
          const sway = Math.sin(t * v.freq * 6.283)
          let d = `M${xStart} ${y}`
          for (let x = g.x0 + seg; x < g.x1; x += seg) {
            const env = Math.sin((Math.PI * (x - g.x0)) / length)
            d += ` L${x.toFixed(1)} ${(y + amp * env * sway).toFixed(2)}`
          }
          d += ` L${g.x1} ${y}`
          el.setAttribute('d', d)
          el.setAttribute('stroke', STRING_LIVE)
        }
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [vibRef])

  const toViewBox = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const g = geoRef.current
    return {
      xv: ((e.clientX - r.left) / r.width) * g.width,
      yv: ((e.clientY - r.top) / r.height) * g.height,
    }
  }

  /** The fret a string sounds when it is swept rather than aimed at: whatever the
   *  current chord shape puts under the finger, or open when there is no shape. */
  const sweepFret = (row: number): number => {
    const f = shapeRef.current[row]
    if (f === undefined) return 0
    return f
  }

  const handleDown = (e: React.PointerEvent<SVGSVGElement>) => {
    e.currentTarget.setPointerCapture?.(e.pointerId)
    draggingRef.current = true
    sweptRef.current = false
    const { xv, yv } = toViewBox(e)
    const cell = hitCell(geoRef.current, xv, yv)
    downCellRef.current = cell
    // Sound the exact cell straight away: a tap has to be instant, and at this point
    // there is no way to know yet whether this is a tap or the start of a strum.
    if (cell) {
      lastRowRef.current = cell.row
      onPlay(cell.row, cell.fret)
    } else {
      lastRowRef.current = rowFromY(geoRef.current, yv)
    }
  }

  // Crossing into a new row mid-drag is a strum, not an aim: play every row passed
  // over, at its shape fret, so a sweep sounds the chord the way a pick would.
  const handleMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!draggingRef.current) return
    const { yv } = toViewBox(e)
    const row = rowFromY(geoRef.current, yv)
    if (row < 0 || row === lastRowRef.current) return
    // The gesture has just revealed itself as a strum. The first string was played at
    // whatever fret the finger happened to land on, which is right for a tap and wrong
    // for a chord — so re-strike it on the shape. A pick really does catch a string
    // twice on the way in, so the correction sounds like playing, not like a glitch.
    if (!sweptRef.current) {
      sweptRef.current = true
      const down = downCellRef.current
      if (down) {
        const sf = sweepFret(down.row)
        if (sf >= 0 && sf !== down.fret) onPlay(down.row, sf)
      }
    }

    const from = lastRowRef.current
    if (from < 0) {
      const f = sweepFret(row)
      if (f >= 0) onPlay(row, f)
    } else {
      const dir = row > from ? 1 : -1
      for (let k = from + dir; k !== row + dir; k += dir) {
        const f = sweepFret(k)
        if (f >= 0) onPlay(k, f)
      }
    }
    lastRowRef.current = row
  }

  const handleUp = () => {
    draggingRef.current = false
    lastRowRef.current = -1
    downCellRef.current = null
  }

  const openX = geo.openCol ? geo.openCol.x : geo.x0

  // Dots drawn on the HTML layer: the chord shape, then whatever is ringing on top.
  const shapeDots = hasShape
    ? shapeRows.map((fret, row) => ({ row, fret })).filter(d => d.fret >= 0)
    : []
  const highlightDots = highlightRows
    .flatMap((frets, row) => frets.map(fret => ({ row, fret })))
    .filter(d => d.fret >= geo.fretFrom && d.fret <= geo.fretTo)

  const dotStyle = (row: number, fret: number) => ({
    position: 'absolute' as const,
    left: `${(cellX(geo, fret) / geo.width) * 100}%`,
    top: `${(geo.ys[row] / geo.height) * 100}%`,
    transform: 'translate(-50%, -50%)',
    width: geo.dotR * 2,
    height: geo.dotR * 2,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: "'Space Mono', ui-monospace, monospace",
    fontWeight: 700,
    lineHeight: 1,
    pointerEvents: 'none' as const,
  })

  const dotLabel = (row: number, fret: number) =>
    labelMode === 'notes' ? fretToNoteName(row, fret) : String(fret)

  return (
    <div
      ref={fbRef}
      style={{
        flex: '1 1 auto', minHeight: 190, position: 'relative',
        background: 'hsl(224 26% 11%)', overflow: 'hidden',
      }}
    >
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(110% 80% at 50% -10%, hsl(262 60% 34% / 0.5), transparent 62%)',
      }} />

      <svg
        viewBox={geo.viewBox}
        preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none', display: 'block' }}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
        onPointerLeave={handleUp}
      >
        <defs>
          <linearGradient id="csNeckWood" x1="0" y1="0" x2="0" y2="1">
            <stop offset={0} stopColor="hsl(28 40% 26%)" stopOpacity={0.5} />
            <stop offset={0.5} stopColor="hsl(24 35% 14%)" stopOpacity={0.18} />
            <stop offset={1} stopColor="hsl(20 30% 8%)" stopOpacity={0.55} />
          </linearGradient>
        </defs>

        <rect x={geo.board.x} y={geo.board.y} width={geo.board.w} height={geo.board.h} fill="hsl(24 30% 12%)" />
        <rect x={geo.board.x} y={geo.board.y} width={geo.board.w} height={geo.board.h} fill="url(#csNeckWood)" />

        {geo.fretLines.map((f, i) => (
          <rect key={i} x={f.x} y={f.y} width={f.w} height={f.h} fill="hsl(35 12% 60%)" />
        ))}
        {geo.inlays.map((d, i) => (
          <ellipse key={i} cx={d.x} cy={d.y} rx={d.r} ry={d.r} fill="hsl(40 20% 90%)" opacity={0.13} />
        ))}

        <rect x={geo.nut.x} y={geo.nut.y} width={geo.nut.w} height={geo.nut.h} rx={2} fill="hsl(40 30% 86%)" />

        {geo.strings.map((s, i) => (
          <path
            key={i}
            d={s.d}
            ref={el => { stringRefs.current[i] = el }}
            fill="none"
            stroke={STRING_REST}
            strokeWidth={s.strokeWidth}
            strokeLinecap="round"
          />
        ))}
      </svg>

      {/* HTML layer: nothing here is stretched by the viewBox */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {geo.strings.map((s, i) => (
          <span key={`s${i}`} style={{
            position: 'absolute', left: `${s.leftPct}%`, top: `${s.topPct}%`,
            transform: 'translate(-50%, -50%)',
            fontFamily: "'Space Mono', ui-monospace, monospace", fontWeight: 700,
            lineHeight: 1, fontSize: s.fontSize, color: 'hsl(40 25% 80%)',
          }}>{s.label}</span>
        ))}

        {geo.fretNumbers.map(f => (
          <span key={`f${f.fret}`} style={{
            position: 'absolute', left: `${f.leftPct}%`, top: `${f.topPct}%`,
            transform: 'translate(-50%, -50%)',
            fontFamily: "'Space Mono', ui-monospace, monospace",
            fontSize: f.fontSize, color: 'hsl(220 12% 52%)',
          }}>{f.fret}</span>
        ))}

        {highlightDots.map(d => (
          <span key={`h${d.row}-${d.fret}`} style={{
            ...dotStyle(d.row, d.fret),
            background: 'hsl(262 83% 66% / 0.16)',
            border: '1.5px solid hsl(262 60% 70% / 0.75)',
            color: 'hsl(262 55% 86%)',
            fontSize: geo.dotR * 0.74,
          }}>{dotLabel(d.row, d.fret)}</span>
        ))}

        {shapeDots.map(d => (
          <span key={`c${d.row}-${d.fret}`} style={{
            ...dotStyle(d.row, d.fret),
            background: d.fret === 0 ? 'transparent' : PRIMARY,
            border: d.fret === 0 ? '2px solid hsl(40 25% 82%)' : `1px solid ${PRIMARY_LIT}`,
            color: d.fret === 0 ? 'hsl(40 25% 82%)' : '#fff',
            fontSize: geo.dotR * 0.8,
            boxShadow: d.fret === 0 ? 'none' : '0 2px 10px hsl(262 83% 40% / 0.6)',
          }}>{d.fret === 0 ? '' : dotLabel(d.row, d.fret)}</span>
        ))}

        {activeRows.map((fret, row) => fret === null ? null : (
          <span key={`a${row}`} style={{
            ...dotStyle(row, fret),
            background: 'hsl(48 96% 60%)',
            border: '1px solid hsl(48 96% 74%)',
            color: 'hsl(28 60% 16%)',
            fontSize: geo.dotR * 0.8,
            boxShadow: '0 0 16px hsl(48 96% 60% / 0.65)',
          }}>{dotLabel(row, fret)}</span>
        ))}

        {/* Muted markers for strings the shape does not play */}
        {(hasShape ? shapeRows : []).map((fret, row) => fret !== -1 ? null : (
          <span key={`m${row}`} style={{
            position: 'absolute',
            left: `${((openX + (geo.openCol ? geo.openCol.w / 2 : 10)) / geo.width) * 100}%`,
            top: `${(geo.ys[row] / geo.height) * 100}%`,
            transform: 'translate(-50%, -50%)',
            fontFamily: "'Space Mono', ui-monospace, monospace",
            fontSize: Math.max(11, geo.dotR * 0.9), color: 'hsl(220 12% 50%)', pointerEvents: 'none',
          }}>✕</span>
        ))}
      </div>

    </div>
  )
}
