import React, { useRef, useLayoutEffect, useState, useEffect } from 'react'

// ── Coordinate model ─────────────────────────────────────────────────────────
// electricGuitar.svg: portrait 325.54 × 1006.9, rotated 90° CW → horizontal.
// The img element has CSS width=cH, height=cW, positioned and rotated so it fills
// the landscape container (cW × cH).
//
// objectFit:cover picks the larger uniform scale:
//   scale_H = cW/SVG_H  (height covers) → rendW = SVG_W*cW/SVG_H
//   scale_W = cH/SVG_W  (width covers)  → rendH = SVG_H*cH/SVG_W
//
// Case A (cH ≤ rendW, scale_H wins):
//   x = cW*(1−fy)      y = fx*rendW − xOff   (xOff=(rendW−cH)/2)
//
// Case B (cH > rendW, scale_W wins, portrait top = headstock on RIGHT):
//   x = cW − fy*rendH   y = fx*cH
//
// objectPosition '50% 0%': X centered, Y top (headstock visible, bridge may clip)
//
// FB calibration — derived via getBoundingClientRect() on the actual SVG paths:
//   nut  fy = 0.183  (path1794 bottom ≈ 0.185; fitted ref = 0.1826)
//   heel fy = 0.645  (fret-22 position, fitted from frets 1-3: scale span=0.462)
//   strings fx (path4589-4599, portrait X fraction):
//     lowE=0.440, A=0.468, D=0.496, G=0.523, B=0.550, highE=0.577
// ─────────────────────────────────────────────────────────────────────────────

const SVG_W = 325.54
const SVG_H = 1006.9

const FB = {
  nut:  { lowE: { x: 0.440, y: 0.183 }, highE: { x: 0.577, y: 0.183 } },
  heel: { lowE: { x: 0.440, y: 0.645 }, highE: { x: 0.577, y: 0.645 } },
}

function fbFrac(t: number, s: number) {
  const lx = FB.nut.lowE.x  + t * (FB.heel.lowE.x  - FB.nut.lowE.x )
  const ly = FB.nut.lowE.y  + t * (FB.heel.lowE.y  - FB.nut.lowE.y )
  const rx = FB.nut.highE.x + t * (FB.heel.highE.x - FB.nut.highE.x)
  const ry = FB.nut.highE.y + t * (FB.heel.highE.y - FB.nut.highE.y)
  return { fx: rx + s * (lx - rx), fy: ry + s * (ly - ry) }
}

// t=0 → nut, t=1 → fret 22. Dot placed AT fret wire N (not between wires).
function fretT(n: number) {
  return n === 0 ? 0 : (1 - Math.pow(2, -n / 12)) / (1 - Math.pow(2, -22 / 12))
}

const MAX_FRETS     = 22
const STRING_COLORS = ['#38bdf8', '#a78bfa', '#34d399', '#fbbf24', '#fb923c', '#f87171']

interface Props {
  activeFrets:   (number | null)[]
  attackSignals: ({ fret: number; v: number } | null)[]
}

export function GuitarPhotoFretboard({ activeFrets, attackSignals }: Props) {
  const outerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

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

  const cW = size.w   // container width  (landscape: large)
  const cH = size.h   // container height (landscape: small)

  // objectFit:cover on the rotated img uses the larger of two uniform scales:
  //   scale_H = cW/SVG_H  (portrait height fills element height = cW)
  //   scale_W = cH/SVG_W  (portrait width fills element height = cH)
  // rendW = rendered portrait width at scale_H (used when scale_H >= scale_W)
  const rendW = cW > 0 ? SVG_W * cW / SVG_H : 0

  // When cH > rendW: scale_W wins (portrait WIDTH fills cH exactly, height overflows).
  // When cH <= rendW: scale_H wins (portrait HEIGHT fills cW, width clipped at ±xOff).
  const rendH_W = SVG_H * cH / SVG_W   // portrait height at scale_W
  const xOff    = (rendW - cH) / 2     // portrait width clip offset (Case A only)

  function toScreen(fx: number, fy: number) {
    if (cH <= rendW) {
      // Case A: scale by portrait height — standard landscape formula
      return {
        x: cW * (1 - fy),
        y: fx * rendW - xOff,
      }
    } else {
      // Case B: scale by portrait width — portrait height overflows (Y=0%: top visible)
      return {
        x: cW - fy * rendH_W,
        y: fx * cH,
      }
    }
  }
  function fbPx(t: number, s: number) {
    const { fx, fy } = fbFrac(t, s)
    return toScreen(fx, fy)
  }

  // Inter-string spacing → dot radius. Sized for the fret number to read at a
  // glance (≥ 12 px); on a narrow neck neighbouring dots may touch, which beats
  // a number nobody can read.
  const dotR = (() => {
    if (cH === 0) return 10
    const yLow  = toScreen(FB.nut.lowE.x,  0).y
    const yHigh = toScreen(FB.nut.highE.x, 0).y
    const gap   = Math.abs(yHigh - yLow) / 5
    return Math.max(10, Math.min(gap * 0.62, 16))
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

  return (
    <div
      ref={outerRef}
      style={{
        position: 'relative',
        flex: 1, minHeight: 0,
        background: '#060606',
        clipPath: 'inset(0)',
        overflow: 'hidden',
      }}
    >
      {/* Guitar image rotated 90° CW */}
      <img
        src="/electricGuitar.svg"
        alt=""
        draggable={false}
        style={{
          position: 'absolute',
          width:  cH > 0 ? `${cH}px` : '100%',
          height: cH > 0 ? `${cW}px` : '100%',
          left: cH > 0 ? `${(cW - cH) / 2}px` : 0,
          top:  cH > 0 ? `${(cH - cW) / 2}px` : 0,
          transformOrigin: 'center',
          transform: cH > 0 ? 'rotate(90deg)' : 'none',
          objectFit: 'cover',
          objectPosition: '50% 0%',
          userSelect: 'none',
          pointerEvents: 'none',
        }}
      />

      {/* SVG overlay — only note circles, no synthetic fretboard */}
      {cH > 0 && (
        <svg
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            overflow: 'visible',
          }}
        >
          {activeFrets.map((fret, si) => {
            if (fret === null) return null
            const t   = fretT(fret)
            const s   = si / 5
            const pos = fbPx(t, s)
            const col = STRING_COLORS[si]
            return (
              <g key={si}
                ref={el => { dotGrpRefs.current[si][fret] = el }}
                style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
              >
                <circle cx={pos.x} cy={pos.y} r={dotR * 1.7} fill={`${col}18`} />
                <circle cx={pos.x} cy={pos.y} r={dotR * 1.3} fill={`${col}30`} />
                <circle cx={pos.x} cy={pos.y} r={dotR}
                  fill={col} stroke="rgba(255,255,255,0.85)" strokeWidth={1.5}
                  style={{ filter: `drop-shadow(0 0 ${dotR * 0.7}px ${col})` }}
                />
                <text x={pos.x} y={pos.y + 0.5}
                  textAnchor="middle" dominantBaseline="central"
                  fontSize={Math.round(dotR * (fret >= 10 ? 0.95 : 1.15))} fontFamily="ui-monospace,monospace"
                  fontWeight="800" fill="white"
                  stroke="rgba(0,0,0,0.35)" strokeWidth={0.6} paintOrder="stroke"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {fret}
                </text>
              </g>
            )
          })}
        </svg>
      )}
    </div>
  )
}
