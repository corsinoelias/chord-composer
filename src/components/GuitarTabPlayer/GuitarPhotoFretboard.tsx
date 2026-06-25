import React, { useRef, useLayoutEffect, useState, useEffect } from 'react'

// ── Strategy ───────────────────────────────────────────────────────────────────
// guitar-first.svg is PORTRAIT (1200 × 3650 viewBox).
// We rotate the <img> 90° CW so the guitar appears horizontal:
//   portrait TOP  → screen LEFT  (headstock/nut on left)
//   portrait BOTTOM→ screen RIGHT (body on right)
//   portrait LEFT  → screen BOTTOM (low E at bottom)
//   portrait RIGHT → screen TOP    (high e at top, standard)
//
// After rotation, screen coords for a portrait fraction (fx, fy):
//   screen_x = fy * rendH − offY      (fy = position along neck, 0=nut, 1=heel)
//   screen_y = (1 − fx) × cH          (fx = string position, 0=highE,1=lowE)
//
// rendH = SVG_H × (cH / SVG_W)  — the rendered height of the portrait img in
//   cover-fill mode (fills img width = cH, overflows in height = cW).
// offY  = scroll × max(0, rendH − cW)  — horizontal scroll in landscape = vertical
//   scroll in portrait (objectPositionY).
//
// Calibration from img19 (Guitar 1 main neck layer in guitar-first.svg):
//   nut  at SVG y_frac ≈ 0.153, heel (22fr) at ≈ 0.558
//   lowE at SVG x_frac ≈ 0.272, highE at ≈ 0.417
// ──────────────────────────────────────────────────────────────────────────────

const SVG_W = 1200
const SVG_H = 3650

const FB = {
  nut:  { lowE: { x: 0.272, y: 0.153 }, highE: { x: 0.417, y: 0.153 } },
  heel: { lowE: { x: 0.272, y: 0.558 }, highE: { x: 0.417, y: 0.558 } },
}

function fbFrac(t: number, s: number) {
  const lx = FB.nut.lowE.x  + t * (FB.heel.lowE.x  - FB.nut.lowE.x )
  const ly = FB.nut.lowE.y  + t * (FB.heel.lowE.y  - FB.nut.lowE.y )
  const rx = FB.nut.highE.x + t * (FB.heel.highE.x - FB.nut.highE.x)
  const ry = FB.nut.highE.y + t * (FB.heel.highE.y - FB.nut.highE.y)
  return { fx: rx + s * (lx - rx), fy: ry + s * (ly - ry) }
}

function fretT(n: number) {
  return n === 0 ? 0 : (1 - Math.pow(2, -n / 12)) / (1 - Math.pow(2, -22 / 12))
}
function slotT(n: number) {
  return n === 0 ? -0.035 : (fretT(n - 1) + fretT(n)) / 2
}
function fretAtT(t: number) {
  if (t <= 0) return 0
  if (t >= 1) return MAX_FRETS
  return -12 * Math.log2(1 - t * (1 - Math.pow(2, -22 / 12)))
}

const MAX_FRETS    = 22
const STRING_COLORS = ['#38bdf8', '#a78bfa', '#34d399', '#fbbf24', '#fb923c', '#f87171']
const STRING_W      = [0.8, 1.2, 1.7, 2.5, 3.5, 4.6]
const SINGLE_DOTS   = new Set([3, 5, 7, 9, 15, 17, 19, 21])
const DOUBLE_DOTS   = new Set([12])

interface Props {
  activeFrets:   (number | null)[]
  attackSignals: ({ fret: number; v: number } | null)[]
}

export function GuitarPhotoFretboard({ activeFrets, attackSignals }: Props) {
  const outerRef = useRef<HTMLDivElement>(null)
  const [size, setSize]     = useState({ w: 0, h: 0 })
  // 0 = show headstock end, 1 = show body end
  const [scroll, setScroll] = useState(0)
  const initDone            = useRef(false)

  const dotGrpRefs = useRef<(SVGGElement | null)[][]>(
    Array.from({ length: 6 }, () => Array(MAX_FRETS + 1).fill(null)),
  )
  const prevSigV = useRef<(number | null)[]>(Array(6).fill(null))

  useLayoutEffect(() => {
    const el = outerRef.current
    if (!el) return
    const upd = () => {
      const r = el.getBoundingClientRect()
      setSize({ w: r.width, h: r.height })
    }
    upd()
    const ro = new ResizeObserver(upd)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const cW = size.w   // outer container width  (landscape: large)
  const cH = size.h   // outer container height (landscape: small)

  // cover scale fills img width (= cH) → scale = cH / SVG_W
  const imgScale = cH > 0 ? cH / SVG_W : 0
  const rendH    = SVG_H * imgScale         // img rendered height in portrait space
  const ovfY     = Math.max(0, rendH - cW)  // portrait overflow (= landscape scroll range)
  const offY     = scroll * ovfY

  // Initialise scroll so that the nut appears at left edge
  useEffect(() => {
    if (initDone.current || cH <= 0 || cW <= 0) return
    initDone.current = true
    const nutY = FB.nut.lowE.y * rendH
    setScroll(ovfY > 0 ? nutY / ovfY : 0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cH, cW])

  // Portrait fraction (fx, fy) → screen pixel after 90° CW rotation
  function toScreen(fx: number, fy: number) {
    return {
      x: fy * rendH - offY,
      y: (1 - fx) * cH,
    }
  }
  function fbPx(t: number, s: number) {
    const { fx, fy } = fbFrac(t, s)
    return toScreen(fx, fy)
  }

  // Dot radius (inter-string gap at mid-neck)
  const dotR = (() => {
    if (cH === 0) return 8
    const a = toScreen(FB.nut.highE.x, (FB.nut.lowE.y + FB.heel.lowE.y) / 2)
    const b = toScreen(FB.heel.highE.x, (FB.nut.lowE.y + FB.heel.lowE.y) / 2)
    // string span on screen = distance between lowE and highE in Y
    const sLow  = toScreen(FB.nut.lowE.x,  (FB.nut.lowE.y  + FB.heel.lowE.y)  / 2)
    const sHigh = toScreen(FB.nut.highE.x, (FB.nut.highE.y + FB.heel.highE.y) / 2)
    const span = Math.abs(sLow.y - sHigh.y)
    return Math.max(5, Math.min(span / 5 * 0.9, 22))
  })()

  // Visible fret range for indicator
  const visRange = (() => {
    if (rendH === 0) return { lo: 0, hi: MAX_FRETS }
    const nutY  = FB.nut.lowE.y
    const heelY = FB.heel.lowE.y
    const nH    = heelY - nutY
    const lo = Math.max(0, Math.ceil(fretAtT(Math.max(0, (offY / rendH - nutY) / nH))))
    const hi = Math.min(MAX_FRETS, Math.ceil(fretAtT(Math.min(1, ((offY + cW) / rendH - nutY) / nH))))
    return { lo, hi }
  })()

  // Attack flash
  useEffect(() => {
    attackSignals.forEach((sig, si) => {
      if (!sig || sig.v === prevSigV.current[si]) return
      prevSigV.current[si] = sig.v
      dotGrpRefs.current[si]?.[sig.fret]?.animate(
        [{ filter: 'brightness(3.5)', transform: 'scale(1.55)' },
         { filter: 'brightness(1)',   transform: 'scale(1)'    }] as Keyframe[],
        { duration: 280, easing: 'ease-out' },
      )
    })
  }, [attackSignals])

  // objectPosition: controls which part of the portrait image is visible vertically.
  // After 90° CW rotation on the img element, this becomes horizontal scroll.
  const objPosY = ovfY > 0 ? (offY / ovfY) * 100 : 0

  return (
    <div
      ref={outerRef}
      style={{
        position: 'relative',
        flex: 1, minHeight: 0,
        background: '#060606',
        // clip-path clips VISUAL output (not layout), so the rotated img
        // (whose layout extends above/below the container) is clipped correctly.
        clipPath: 'inset(0)',
        overflow: 'hidden',
      }}
    >
      {/* Guitar image — portrait img rotated 90° CW to appear horizontal */}
      <img
        src="/guitar-first.svg"
        alt=""
        draggable={false}
        style={{
          position: 'absolute',
          // Declared portrait size (will become landscape after rotation)
          width:  cH > 0 ? `${cH}px` : '100%',
          height: cH > 0 ? `${cW}px` : '100%',
          // Center the portrait rect in the landscape container
          left: cH > 0 ? `${(cW - cH) / 2}px` : 0,
          top:  cH > 0 ? `${(cH - cW) / 2}px` : 0,
          // Rotate 90° CW about element center
          transformOrigin: 'center',
          transform: cH > 0 ? 'rotate(90deg)' : 'none',
          objectFit: 'cover',
          // objectPosition Y controls vertical scroll inside the portrait img.
          // After rotation this corresponds to horizontal position in landscape.
          objectPosition: `50% ${objPosY.toFixed(2)}%`,
          userSelect: 'none',
          pointerEvents: 'none',
        }}
      />

      {/* SVG overlay — drawn in SCREEN (landscape) space */}
      {cH > 0 && (
        <svg
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            overflow: 'visible',
          }}
        >
          {/* Subtle neck tint */}
          <polygon
            points={[fbPx(0,-0.15), fbPx(0,1.15), fbPx(1,1.15), fbPx(1,-0.15)]
              .map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
            fill="rgba(0,0,0,0.08)"
          />

          {/* Fret wires */}
          {Array.from({ length: MAX_FRETS }, (_, i) => {
            const t  = fretT(i + 1)
            const a  = fbPx(t, -0.18); const b = fbPx(t, 1.18)
            return (
              <line key={i}
                x1={a.x.toFixed(1)} y1={a.y.toFixed(1)}
                x2={b.x.toFixed(1)} y2={b.y.toFixed(1)}
                stroke="rgba(220,200,140,0.22)" strokeWidth={0.9}
              />
            )
          })}

          {/* Nut */}
          {(() => {
            const a = fbPx(0, -0.18); const b = fbPx(0, 1.18)
            return <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke="rgba(250,240,185,0.9)" strokeWidth={3} />
          })()}

          {/* Position inlay dots */}
          {Array.from({ length: MAX_FRETS }, (_, i) => {
            const f = i + 1
            if (!SINGLE_DOTS.has(f) && !DOUBLE_DOTS.has(f)) return null
            const t = (fretT(f - 1) + fretT(f)) / 2
            const r = Math.max(3, dotR * 0.38)
            if (DOUBLE_DOTS.has(f)) {
              const p1 = fbPx(t, 0.25); const p2 = fbPx(t, 0.75)
              return (
                <g key={f}>
                  <circle cx={p1.x} cy={p1.y} r={r} fill="rgba(220,200,120,0.55)" />
                  <circle cx={p2.x} cy={p2.y} r={r} fill="rgba(220,200,120,0.55)" />
                </g>
              )
            }
            const c = fbPx(t, 0.5)
            return <circle key={f} cx={c.x} cy={c.y} r={r} fill="rgba(220,200,120,0.55)" />
          })}

          {/* Strings */}
          {STRING_W.map((sw, si) => {
            const s  = si / 5
            const a  = fbPx(-0.03, s); const b = fbPx(1.03, s)
            return (
              <line key={si}
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke={`rgba(210,185,130,${0.28 + si * 0.065})`}
                strokeWidth={sw}
              />
            )
          })}

          {/* Active note circles */}
          {activeFrets.map((fret, si) => {
            if (fret === null) return null
            const t   = slotT(fret)
            const s   = si / 5
            const pos = fbPx(t, s)
            const col = STRING_COLORS[si]
            return (
              <g key={si}
                ref={el => { dotGrpRefs.current[si][fret] = el }}
                style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
              >
                <circle cx={pos.x} cy={pos.y} r={dotR * 2.0} fill={`${col}18`} />
                <circle cx={pos.x} cy={pos.y} r={dotR * 1.4} fill={`${col}30`} />
                <circle cx={pos.x} cy={pos.y} r={dotR}
                  fill={col} stroke="rgba(255,255,255,0.70)" strokeWidth={1.2}
                  style={{ filter: `drop-shadow(0 0 ${dotR * 0.7}px ${col})` }}
                />
                {dotR >= 7 && (
                  <text x={pos.x} y={pos.y + 0.5}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize={Math.round(dotR * 0.8)} fontFamily="ui-monospace,monospace"
                    fontWeight="700" fill="white"
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    {fret}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      )}

      {/* Navigation controls */}
      <div style={{
        position: 'absolute', bottom: 10, right: 12, zIndex: 20,
        display: 'flex', alignItems: 'center', gap: 5,
        background: 'rgba(0,0,0,0.72)', borderRadius: 8, padding: '4px 10px',
        border: '1px solid rgba(255,255,255,0.10)', backdropFilter: 'blur(6px)',
      }}>
        <span style={{
          color: 'rgba(255,255,255,0.45)', fontSize: 10,
          fontFamily: 'ui-monospace,monospace', minWidth: 44,
        }}>
          {visRange.lo}–{visRange.hi}fr
        </span>
        <NavBtn label="◀" title="Nut / lower frets"
          onClick={() => setScroll(s => Math.max(0, s - 0.08))} />
        <NavBtn label="▶" title="Higher frets / body"
          onClick={() => setScroll(s => Math.min(1, s + 0.08))} />
      </div>
    </div>
  )
}

function NavBtn({ label, onClick, title }: { label: string; onClick: () => void; title: string }) {
  return (
    <button onClick={onClick} title={title} style={{
      width: 30, height: 30, borderRadius: 6,
      background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.18)',
      color: 'rgba(255,255,255,0.85)', fontSize: 16, fontWeight: 700,
      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {label}
    </button>
  )
}
