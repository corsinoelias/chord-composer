import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react'
import { STRINGS } from '../../lib/bassTab/bassTheory'

// ── SVG user-space constants (viewBox 0 0 2000 2000) ─────────────────────────
const STRING_X   = [1029, 1005, 981, 957]
const STRING_SW  = [3, 4, 6, 9]
const STRING_GHW = [5, 6, 8, 12]

// 25 entries: indices 0-24 → fret wires 1-25 (covers frets 0-24)
// Derived from equal-temperament formula: Y = 335 + 1477 * (1 - 2^(-(n+1)/12))
const FRET_WIRE_Y = [
  418, 497, 572, 641, 707, 769, 826, 882, 934, 983, 1030, 1073, 1115,
  1154, 1191, 1226, 1259, 1290, 1319, 1347, 1373, 1398, 1421, 1443, 1464,
]
const BRIDGE_Y    = 1870

const GRAD_STOPS: [string, string][] = [
  ['#909090', '#f0f0f0'],
  ['#a09070', '#e0d8b8'],
  ['#806030', '#c8a060'],
  ['#583818', '#a07848'],
]

// ── Geometry ─────────────────────────────────────────────────────────────────
function noteY(fret: number): number {
  if (fret === 0) return FRET_WIRE_Y[0] - 28
  const i = Math.min(Math.max(fret, 1), FRET_WIRE_Y.length - 1)
  return (FRET_WIRE_Y[i - 1] + FRET_WIRE_Y[i]) / 2
}

function segStartY(fret: number): number {
  return FRET_WIRE_Y[Math.min(Math.max(fret, 0), FRET_WIRE_Y.length - 1)]
}

function buildWavePath(x: number, y0: number, y1: number, amp: number): string {
  const N = 5
  const seg = (y1 - y0) / N
  let d = `M ${x} ${y0}`
  for (let i = 0; i < N; i++) {
    const yC = y0 + (i + 0.5) * seg
    const yE = y0 + (i + 1)   * seg
    const xC = x + amp * (i % 2 === 0 ? 1 : -1)
    d += ` Q ${xC.toFixed(1)},${yC.toFixed(1)} ${x},${yE.toFixed(1)}`
  }
  return d
}

// ── Vibration config ──────────────────────────────────────────────────────────
const VIBE_AMP = [4, 6, 8, 12]
const VIBE_DUR = [900, 1100, 1300, 1600]

// ── View transform ────────────────────────────────────────────────────────────
const BASE_ZOOM     = 2.3
const BASE_H        = 300
const USER_ZOOM_MIN = 0.25
const USER_ZOOM_MAX = 4.0

const DEFAULT_VT = { tx: 0, ty: -80, rot: 90, zoom: 1.0 }

type VT = typeof DEFAULT_VT

// ── Types ─────────────────────────────────────────────────────────────────────
type VibeInfo = { fret: number; key: number }

interface Props {
  activeFrets:   (number | null)[]
  attackSignals: ({ fret: number; v: number } | null)[]
}

// ─────────────────────────────────────────────────────────────────────────────
export function BassRealisticDisplay({ activeFrets, attackSignals }: Props) {
  const [vibes, setVibes]       = useState<VibeInfo[]>(STRINGS.map(() => ({ fret: 0, key: 0 })))
  const [vt, setVt]             = useState<VT>(DEFAULT_VT)
  const [isDragging, setDrag]   = useState(false)
  const [isRotating, setRotMode]= useState(false)
  const [containerH, setH]      = useState(0)

  const vtRef        = useRef<VT>(DEFAULT_VT)
  const containerRef = useRef<HTMLDivElement>(null)
  const liveRefs     = useRef<(SVGPathElement | null)[]>([null, null, null, null])
  const dotRefs      = useRef<(SVGCircleElement | null)[]>([null, null, null, null])
  const rafIds       = useRef<number[]>([0, 0, 0, 0])
  const prevKeys     = useRef<number[]>([0, 0, 0, 0])
  const prevSigV     = useRef<(number | null)[]>([null, null, null, null])
  const vibeStart    = useRef<number[]>([0, 0, 0, 0])

  // Drag state (pointer events)
  const dragRef = useRef<{
    mode: 'pan' | 'rotate'
    startX: number; startY: number
    startTx: number; startTy: number; startRot: number
  } | null>(null)

  // Touch state
  const touchRef = useRef({ mode: 'pan' as 'pan' | 'pinch', dist: 0, angle: 0, lastX: 0, lastY: 0 })

  // Stable updater — keeps ref and state in sync
  const applyVt = useCallback((patch: Partial<VT>) => {
    const next = { ...vtRef.current, ...patch }
    vtRef.current = next
    setVt(next)
  }, [])

  const applyVtFn = useCallback((fn: (v: VT) => Partial<VT>) => {
    const next = { ...vtRef.current, ...fn(vtRef.current) }
    vtRef.current = next
    setVt(next)
  }, [])

  // Adaptive base scale from container height
  const adaptiveScale = useMemo(() =>
    containerH > 0 ? Math.max(0.6, Math.min(6, (containerH / BASE_H) * BASE_ZOOM)) : BASE_ZOOM
  , [containerH])

  const totalScale = adaptiveScale * vt.zoom

  // ── ResizeObserver ──────────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(es => setH(es[0].contentRect.height))
    ro.observe(el)
    setH(el.getBoundingClientRect().height)
    return () => ro.disconnect()
  }, [])

  // ── Pointer drag (mouse / pen) ──────────────────────────────────────────────
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    const mode = e.shiftKey || e.button === 2 ? 'rotate' : 'pan'
    dragRef.current = {
      mode,
      startX: e.clientX, startY: e.clientY,
      startTx: vtRef.current.tx, startTy: vtRef.current.ty,
      startRot: vtRef.current.rot,
    }
    ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
    setDrag(true)
    setRotMode(mode === 'rotate')
  }, [])

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return
    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY
    if (drag.mode === 'pan') {
      applyVt({ tx: drag.startTx + dx, ty: drag.startTy + dy })
    } else {
      // Horizontal drag → rotation; full 360° over ~720px
      applyVt({ rot: drag.startRot + dx * 0.5 })
    }
  }, [applyVt])

  const handlePointerUp = useCallback(() => {
    dragRef.current = null
    setDrag(false)
    setRotMode(false)
  }, [])

  // Shift key changes mode mid-drag cursor feedback
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Shift' && dragRef.current) { dragRef.current.mode = 'rotate'; setRotMode(true) }
  }, [])
  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Shift' && dragRef.current) { dragRef.current.mode = 'pan'; setRotMode(false) }
  }, [])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [handleKeyDown, handleKeyUp])

  // ── Mouse wheel: zoom (ctrl) or rotate (shift) ──────────────────────────────
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault()
    if (e.ctrlKey || e.metaKey) {
      applyVtFn(v => ({ zoom: Math.max(USER_ZOOM_MIN, Math.min(USER_ZOOM_MAX, v.zoom * (1 - e.deltaY * 0.006))) }))
    } else if (e.shiftKey) {
      applyVtFn(v => ({ rot: v.rot + e.deltaY * 0.3 }))
    } else {
      // Scroll along the neck (pan X) or pan Y
      applyVtFn(v => ({ tx: v.tx - e.deltaX * 0.5, ty: v.ty - e.deltaY * 0.5 }))
    }
  }, [applyVtFn])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  // ── Touch: 1-finger pan + 2-finger pinch+rotate ─────────────────────────────
  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (e.touches.length === 1) {
      touchRef.current = {
        mode: 'pan', dist: 0, angle: 0,
        lastX: e.touches[0].clientX,
        lastY: e.touches[0].clientY,
      }
    } else if (e.touches.length === 2) {
      const dx = e.touches[1].clientX - e.touches[0].clientX
      const dy = e.touches[1].clientY - e.touches[0].clientY
      touchRef.current = {
        mode: 'pinch',
        dist:  Math.sqrt(dx * dx + dy * dy),
        angle: Math.atan2(dy, dx) * 180 / Math.PI,
        lastX: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        lastY: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      }
    }
  }, [])

  const handleTouchMove = useCallback((e: TouchEvent) => {
    e.preventDefault()
    const t = touchRef.current

    if (e.touches.length === 1 && t.mode === 'pan') {
      const dx = e.touches[0].clientX - t.lastX
      const dy = e.touches[0].clientY - t.lastY
      applyVtFn(v => ({ tx: v.tx + dx, ty: v.ty + dy }))
      t.lastX = e.touches[0].clientX
      t.lastY = e.touches[0].clientY

    } else if (e.touches.length === 2 && t.mode === 'pinch') {
      const dx = e.touches[1].clientX - e.touches[0].clientX
      const dy = e.touches[1].clientY - e.touches[0].clientY
      const newDist  = Math.sqrt(dx * dx + dy * dy)
      const newAngle = Math.atan2(dy, dx) * 180 / Math.PI
      const midX     = (e.touches[0].clientX + e.touches[1].clientX) / 2
      const midY     = (e.touches[0].clientY + e.touches[1].clientY) / 2

      let dAngle = newAngle - t.angle
      if (dAngle >  180) dAngle -= 360
      if (dAngle < -180) dAngle += 360

      const zoomFactor = t.dist > 0 ? newDist / t.dist : 1

      applyVtFn(v => ({
        zoom: Math.max(USER_ZOOM_MIN, Math.min(USER_ZOOM_MAX, v.zoom * zoomFactor)),
        rot:  v.rot + dAngle,
        tx:   v.tx + (midX - t.lastX),
        ty:   v.ty + (midY - t.lastY),
      }))

      t.dist  = newDist
      t.angle = newAngle
      t.lastX = midX
      t.lastY = midY
    }
  }, [applyVtFn])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener('touchstart', handleTouchStart, { passive: false })
    el.addEventListener('touchmove',  handleTouchMove,  { passive: false })
    return () => {
      el.removeEventListener('touchstart', handleTouchStart)
      el.removeEventListener('touchmove',  handleTouchMove)
    }
  }, [handleTouchStart, handleTouchMove])

  // ── Double-click: reset view ────────────────────────────────────────────────
  const handleDblClick = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    vtRef.current = { ...DEFAULT_VT }
    setVt({ ...DEFAULT_VT })
  }, [])

  // ── Animation ───────────────────────────────────────────────────────────────
  const startAnim = useCallback((si: number, fret: number) => {
    cancelAnimationFrame(rafIds.current[si])
    vibeStart.current[si] = performance.now()
    const maxAmp = VIBE_AMP[si]
    const dur    = VIBE_DUR[si]
    const x      = STRING_X[si]
    const sy     = segStartY(fret)
    const tick = (now: number) => {
      const el = liveRefs.current[si]
      if (!el) return
      const t = (now - vibeStart.current[si]) / dur
      if (t >= 1) { el.style.opacity = '0'; return }
      const envelope = Math.exp(-t * 3.5)
      const amp = maxAmp * envelope * Math.sin(t * Math.PI * 16)
      el.style.opacity = String(Math.min(envelope * 0.88, 0.88))
      el.setAttribute('d', buildWavePath(x, sy, BRIDGE_Y, amp))
      rafIds.current[si] = requestAnimationFrame(tick)
    }
    rafIds.current[si] = requestAnimationFrame(tick)
  }, [])

  const flashDot = useCallback((si: number) => {
    dotRefs.current[si]?.animate(
      [
        { transform: 'scale(1.5)', opacity: '0.7', offset: 0 },
        { transform: 'scale(1)',   opacity: '1',   offset: 1 },
      ],
      { duration: 240, easing: 'ease-out', fill: 'none' },
    )
  }, [])

  useEffect(() => {
    attackSignals.forEach((sig, si) => {
      if (!sig || sig.v === prevSigV.current[si]) return
      prevSigV.current[si] = sig.v
      setVibes(prev => {
        const next = [...prev]
        next[si] = { fret: sig.fret, key: Date.now() + si }
        return next
      })
    })
  }, [attackSignals])

  useEffect(() => {
    vibes.forEach(({ fret, key }, si) => {
      if (key === 0 || key === prevKeys.current[si]) return
      prevKeys.current[si] = key
      startAnim(si, fret)
      flashDot(si)
    })
  }, [vibes, startAnim, flashDot])

  useEffect(() => () => { rafIds.current.forEach(cancelAnimationFrame) }, [])

  // Normalized rotation for display (-180..180)
  const dispRot = ((((vt.rot % 360) + 540) % 360) - 180)
  const isDefault = vt.tx === DEFAULT_VT.tx && vt.ty === DEFAULT_VT.ty &&
                    Math.abs(vt.rot - DEFAULT_VT.rot) < 0.5 && Math.abs(vt.zoom - 1) < 0.02

  const cursor = isDragging ? (isRotating ? 'crosshair' : 'grabbing') : 'grab'

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={handleDblClick}
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', cursor }}
    >
      {/* Inner: bass image + SVG overlay */}
      <div style={{
        position:        'absolute',
        inset:           0,
        transformOrigin: '50% 37%',
        transform:       `translate(${vt.tx}px, ${vt.ty}px) rotate(${vt.rot}deg) scale(${totalScale})`,
        willChange:      'transform',
        pointerEvents:   'none',
      }}>
        {/* img renders SVG at screen resolution — no rasterization blur */}
        <img
          src="/bass_realistic.svg"
          aria-hidden="true"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }}
        />
        <svg
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
          viewBox="0 0 2000 2000"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            {STRINGS.map((_, si) => {
              const [dark, light] = GRAD_STOPS[si]
              const cx  = STRING_X[si]
              const ghw = STRING_GHW[si]
              return (
                <linearGradient
                  key={si} id={`sg-${si}`}
                  gradientUnits="userSpaceOnUse"
                  x1={cx - ghw} y1={0} x2={cx + ghw} y2={0}
                >
                  <stop offset="0%"   stopColor={dark}  />
                  <stop offset="30%"  stopColor={light} />
                  <stop offset="50%"  stopColor="#ffffff" stopOpacity="0.9" />
                  <stop offset="70%"  stopColor={light} />
                  <stop offset="100%" stopColor={dark}  />
                </linearGradient>
              )
            })}
            {STRINGS.map((s, si) => (
              <filter key={si} id={`rf-glow-${si}`} x="-180%" y="-180%" width="460%" height="460%">
                <feGaussianBlur in="SourceAlpha" stdDeviation="12" result="b" />
                <feFlood floodColor={s.color} floodOpacity="0.9" result="c" />
                <feComposite in="c" in2="b" operator="in" result="shadow" />
                <feMerge><feMergeNode in="shadow" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            ))}
          </defs>

          {STRINGS.map((s, si) => {
            const x      = STRING_X[si]
            const sw     = STRING_SW[si]
            const vib    = vibes[si]
            const sy     = segStartY(vib.fret)
            const active = activeFrets[si]
            const ny     = active !== null ? noteY(active) : 0

            return (
              <g key={si}>
                <path
                  ref={el => { liveRefs.current[si] = el }}
                  d={`M ${x} ${sy} L ${x} ${BRIDGE_Y}`}
                  stroke={`url(#sg-${si})`}
                  strokeWidth={sw}
                  strokeLinecap="round"
                  fill="none"
                  style={{ opacity: 0 }}
                />
                {active !== null && (
                  <g filter={`url(#rf-glow-${si})`}>
                    <circle
                      ref={el => { dotRefs.current[si] = el }}
                      cx={x} cy={ny} r={15}
                      fill={s.darkColor}
                      stroke={s.color}
                      strokeWidth={2.5}
                      style={{ transformOrigin: 'center', transformBox: 'fill-box' }}
                    />
                    <text
                      x={x} y={ny + 5}
                      transform={`rotate(${-vt.rot}, ${x}, ${ny})`}
                      textAnchor="middle"
                      fontSize={11}
                      fontWeight="bold"
                      fill="white"
                      fontFamily="ui-monospace, monospace"
                      style={{ userSelect: 'none', pointerEvents: 'none' }}
                    >
                      {active}
                    </text>
                  </g>
                )}
              </g>
            )
          })}
        </svg>
      </div>

      {/* ── Controls overlay ──────────────────────────────────────────────── */}
      <div style={{
        position: 'absolute', bottom: 10, right: 10, zIndex: 10,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
        pointerEvents: 'auto',
      }}>
        {/* Zoom */}
        <VCtrl onClick={() => applyVtFn(v => ({ zoom: Math.min(USER_ZOOM_MAX, v.zoom * 1.25) }))}>+</VCtrl>
        <VCtrl
          onClick={() => { vtRef.current = { ...DEFAULT_VT }; setVt({ ...DEFAULT_VT }) }}
          title="Reset view (or double-click bass)"
          wide
        >
          {Math.round(vt.zoom * 100)}%
        </VCtrl>
        <VCtrl onClick={() => applyVtFn(v => ({ zoom: Math.max(USER_ZOOM_MIN, v.zoom * 0.8) }))}>−</VCtrl>

        {/* Rotate buttons */}
        <div style={{ height: 4 }} />
        <VCtrl onClick={() => applyVtFn(v => ({ rot: v.rot - 15 }))} title="Rotate left 15°">↺</VCtrl>
        <VCtrl wide title="Current angle" onClick={() => {}}>{Math.round(dispRot)}°</VCtrl>
        <VCtrl onClick={() => applyVtFn(v => ({ rot: v.rot + 15 }))} title="Rotate right 15°">↻</VCtrl>
      </div>

      {/* ── Hint ──────────────────────────────────────────────────────────── */}
      {!isDragging && isDefault && containerH > 0 && (
        <div style={{
          position: 'absolute', bottom: 10, left: 10, zIndex: 10,
          color: 'hsl(220 10% 30%)', fontSize: 10,
          fontFamily: 'ui-monospace, monospace',
          pointerEvents: 'none', lineHeight: 1.6,
        }}>
          drag · shift+drag rotate<br />
          scroll · pinch · dbl-click reset
        </div>
      )}

      {/* ── Mode indicator while dragging ─────────────────────────────────── */}
      {isDragging && (
        <div style={{
          position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
          background: 'hsl(224 20% 8% / 0.8)', backdropFilter: 'blur(4px)',
          border: '1px solid hsl(224 15% 18%)',
          color: isRotating ? 'hsl(38 80% 65%)' : 'hsl(220 10% 55%)',
          fontSize: 10, fontFamily: 'ui-monospace, monospace',
          padding: '2px 10px', borderRadius: 8,
          pointerEvents: 'none', zIndex: 10,
        }}>
          {isRotating ? `rotate  ${Math.round(dispRot)}°` : 'move'}
        </div>
      )}
    </div>
  )
}

// ── Overlay control button ─────────────────────────────────────────────────────
function VCtrl({ children, onClick, title, wide }: {
  children: React.ReactNode
  onClick: () => void
  title?: string
  wide?: boolean
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width:  wide ? 48 : 28,
        height: 28,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'hsl(224 20% 10% / 0.85)',
        backdropFilter: 'blur(6px)',
        border: '1px solid hsl(224 15% 20%)',
        borderRadius: 7,
        color: 'hsl(220 10% 55%)',
        fontSize: wide ? 10 : 15,
        fontFamily: wide ? 'ui-monospace, monospace' : "'Inter', ui-sans-serif",
        cursor: onClick ? 'pointer' : 'default',
        padding: 0,
      }}
      onMouseEnter={e => {
        const b = e.currentTarget
        b.style.background = 'hsl(224 20% 18% / 0.95)'
        b.style.color = 'hsl(220 10% 85%)'
      }}
      onMouseLeave={e => {
        const b = e.currentTarget
        b.style.background = 'hsl(224 20% 10% / 0.85)'
        b.style.color = 'hsl(220 10% 55%)'
      }}
    >
      {children}
    </button>
  )
}
