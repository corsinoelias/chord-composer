import React, { useRef, useEffect, useCallback, useState } from 'react'
import { STRINGS } from '../../lib/bassTab/bassTheory'

// ── SVG user-space constants (viewBox 0 0 2000 2000) ─────────────────────────

// String x-centre, matched to path measurements in the SVG
// Left→right in SVG = E(957) A(981) D(1005) G(1029)
const STRING_X   = [1029, 1005, 981, 957]  // indexed as [G2, D2, A1, E1]
const STRING_SW  = [3, 4, 6, 9]            // strokeWidth in SVG units [G,D,A,E] → ~2–6px on screen
const STRING_GHW = [5, 6, 8, 12]           // gradient half-width (wider than stroke = soft metallic edge)
const STRING_TOP = [139, 215, 287, 361]     // y where each string leaves the headstock

// Fret-wire y positions: 0=nut, 1..12=fret wires
const FRET_WIRE_Y = [418, 497, 572, 641, 707, 769, 826, 882, 934, 983, 1030, 1073, 1115]
const BRIDGE_Y    = 1870

// Metallic gradient stop colours (dark-edge / highlight / dark-edge)
// Horizontal gradient gives the cylindrical metallic look across the string width
const GRAD_STOPS: [string, string][] = [
  ['#909090', '#f0f0f0'],  // G2 — bright steel
  ['#a09070', '#e0d8b8'],  // D2 — warm steel
  ['#806030', '#c8a060'],  // A1 — wound bronze
  ['#583818', '#a07848'],  // E1 — wound dark bronze
]

// ── Geometry ─────────────────────────────────────────────────────────────────

function noteY(fret: number): number {
  if (fret === 0) return FRET_WIRE_Y[0] - 28
  if (fret <= 12) return (FRET_WIRE_Y[fret - 1] + FRET_WIRE_Y[fret]) / 2
  const step = FRET_WIRE_Y[12] - FRET_WIRE_Y[11]
  return FRET_WIRE_Y[12] + step * (fret - 12)
}

function segStartY(fret: number): number {
  return FRET_WIRE_Y[Math.min(Math.max(fret, 0), FRET_WIRE_Y.length - 1)]
}

/**
 * Build a wavy SVG path for the vibrating string segment.
 * Uses quadratic bezier half-waves; amplitude alternates sign each segment.
 * When amp ≈ 0 the path is a straight line.
 */
function buildWavePath(x: number, y0: number, y1: number, amp: number): string {
  const N = 5  // number of half-waves (5 gives a good bass-string look)
  const seg = (y1 - y0) / N
  let d = `M ${x} ${y0}`
  for (let i = 0; i < N; i++) {
    const yC  = y0 + (i + 0.5) * seg
    const yE  = y0 + (i + 1)   * seg
    const xC  = x + amp * (i % 2 === 0 ? 1 : -1)
    d += ` Q ${xC.toFixed(1)},${yC.toFixed(1)} ${x},${yE.toFixed(1)}`
  }
  return d
}

// ── Vibration config ──────────────────────────────────────────────────────────
// Amplitudes in SVG units.  At ZOOM=2.3 and ~640 px container: 1 SVG unit ≈ 0.74 px
// amp=4  →  ~3 px  |  amp=12  →  ~9 px
const VIBE_AMP = [4, 6, 8, 12]   // G, D, A, E
const VIBE_DUR = [900, 1100, 1300, 1600]

// ── Display transform ─────────────────────────────────────────────────────────
// Pivot ≈ neck midpoint (x≈50 %, y≈37 % of the 2000×2000 SVG)
const NECK_ORIGIN_X = '50%'
const NECK_ORIGIN_Y = '37%'
const ZOOM = 2.3

// ── Types ─────────────────────────────────────────────────────────────────────
type VibeInfo = { fret: number; key: number }

interface Props {
  activeFrets: (number | null)[]
  attackSignals: ({ fret: number; v: number } | null)[]
}

// ─────────────────────────────────────────────────────────────────────────────
export function BassRealisticDisplay({ activeFrets, attackSignals }: Props) {
  const [vibes, setVibes]     = useState<VibeInfo[]>(STRINGS.map(() => ({ fret: 0, key: 0 })))
  const [debugMode, setDebug] = useState(false)

  // Refs for animated path elements (live string segments)
  const liveRefs  = useRef<(SVGPathElement | null)[]>([null, null, null, null])
  const dotRefs   = useRef<(SVGCircleElement | null)[]>([null, null, null, null])
  const rafIds    = useRef<number[]>([0, 0, 0, 0])
  const prevKeys  = useRef<number[]>([0, 0, 0, 0])
  const prevSigV  = useRef<(number | null)[]>([null, null, null, null])
  const vibeStart = useRef<number[]>([0, 0, 0, 0])

  // ── Sine-wave animation per string ──────────────────────────────────────────
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
      if (t >= 1) {
        el.style.opacity = '0'
        return
      }
      // Envelope drives both amplitude and opacity — string fades as it settles
      const envelope = Math.exp(-t * 3.5)
      const amp = maxAmp * envelope * Math.sin(t * Math.PI * 16)
      el.style.opacity = String(Math.min(envelope * 0.88, 0.88))
      el.setAttribute('d', buildWavePath(x, sy, BRIDGE_Y, amp))
      rafIds.current[si] = requestAnimationFrame(tick)
    }
    rafIds.current[si] = requestAnimationFrame(tick)
  }, [])

  // ── Flash dot on attack ─────────────────────────────────────────────────────
  const flashDot = useCallback((si: number) => {
    dotRefs.current[si]?.animate(
      [
        { transform: 'scale(1.45)', opacity: '0.7', offset: 0 },
        { transform: 'scale(1)',    opacity: '1',   offset: 1 },
      ],
      { duration: 250, easing: 'ease-out', fill: 'none' },
    )
  }, [])

  // ── Watch playback attack signals ───────────────────────────────────────────
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

  // ── Trigger animation when vibe key changes ─────────────────────────────────
  useEffect(() => {
    vibes.forEach(({ fret, key }, si) => {
      if (key === 0 || key === prevKeys.current[si]) return
      prevKeys.current[si] = key
      startAnim(si, fret)
      flashDot(si)
    })
  }, [vibes, startAnim, flashDot])

  useEffect(() => () => { rafIds.current.forEach(cancelAnimationFrame) }, [])

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    // Outer: clips the rotated+scaled content to the available area
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>

      {/*
       * Inner wrapper — bass image + SVG overlay share this transform so they stay aligned.
       *
       * CSS background-image is used instead of <img> because CSS backgrounds always
       * respect SVG transparency; some browsers add an implicit opaque background to <img>.
       *
       * rotate(-90deg) → headstock left / body right (standard horizontal playing orientation).
       * scale(ZOOM)    → zooms in; pivot anchored at the neck midpoint (50 %, 37 %).
       */}
      <div style={{
        position:           'absolute',
        inset:              0,
        transformOrigin:    `${NECK_ORIGIN_X} ${NECK_ORIGIN_Y}`,
        transform:          `translateY(-80px) rotate(-90deg) scale(${ZOOM})`,
        backgroundImage:    'url(/bass_realistic.svg)',
        backgroundRepeat:   'no-repeat',
        backgroundPosition: 'center',
        backgroundSize:     'contain',
      }}>

        {/* SVG overlay — shares the exact coordinate space of the bass SVG */}
        <svg
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
          viewBox="0 0 2000 2000"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            {/* Metallic string gradients — horizontal so each string looks like a cylinder */}
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
                  <stop offset="0%"   stopColor={dark}    />
                  <stop offset="30%"  stopColor={light}   />
                  <stop offset="50%"  stopColor="#ffffff" stopOpacity="0.9" />
                  <stop offset="70%"  stopColor={light}   />
                  <stop offset="100%" stopColor={dark}    />
                </linearGradient>
              )
            })}

            {/* Note-dot glow filters */}
            {STRINGS.map((s, si) => (
              <filter key={si} id={`rf-glow-${si}`} x="-150%" y="-150%" width="400%" height="400%">
                <feGaussianBlur in="SourceAlpha" stdDeviation="10" result="b" />
                <feFlood floodColor={s.color} floodOpacity="0.8" result="c" />
                <feComposite in="c" in2="b" operator="in" result="shadow" />
                <feMerge><feMergeNode in="shadow" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            ))}
          </defs>

          {STRINGS.map((s, si) => {
            const x      = STRING_X[si]
            const sw     = STRING_SW[si]
            const vib    = vibes[si]
            const sy     = segStartY(vib.fret)  // live-path start; also used as d= prop anchor
            const active = activeFrets[si]
            const ny     = active !== null ? noteY(active) : 0

            return (
              <g key={si}>
                {/*
                 * Vibrating string overlay — invisible at rest (opacity:0).
                 * RAF writes the wave shape + fades opacity via envelope.
                 * Keeping it invisible when not vibrating avoids doubling the
                 * real strings that are already drawn in the SVG background.
                 */}
                <path
                  ref={el => { liveRefs.current[si] = el }}
                  d={`M ${x} ${sy} L ${x} ${BRIDGE_Y}`}
                  stroke={`url(#sg-${si})`}
                  strokeWidth={sw}
                  strokeLinecap="round"
                  fill="none"
                  style={{ opacity: 0 }}
                />

                {/* ── Note dot ── */}
                {active !== null && (
                  <g filter={`url(#rf-glow-${si})`}>
                    <circle
                      ref={el => { dotRefs.current[si] = el }}
                      cx={x} cy={ny} r={12}
                      fill={s.darkColor}
                      stroke={s.color}
                      strokeWidth={2}
                      style={{ transformOrigin: 'center', transformBox: 'fill-box' }}
                    />
                    {/*
                     * Counter-rotate the fret number +90° around the dot centre.
                     * The wrapper has rotate(-90deg), so this makes the text appear upright.
                     */}
                    <text
                      x={x} y={ny + 4}
                      transform={`rotate(90, ${x}, ${ny})`}
                      textAnchor="middle"
                      fontSize={10}
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

          {/* ── Debug calibration overlay ── */}
          {debugMode && (
            <g>
              {/* Vertical marker at each string X */}
              {STRINGS.map((s, si) => (
                <g key={si}>
                  <line
                    x1={STRING_X[si]} y1={0} x2={STRING_X[si]} y2={2000}
                    stroke={s.color} strokeWidth={1} strokeDasharray="6 4" opacity={0.7}
                  />
                  <text
                    x={STRING_X[si]} y={160}
                    transform={`rotate(90, ${STRING_X[si]}, 160)`}
                    textAnchor="middle" fontSize={18} fill={s.color}
                    fontFamily="ui-monospace, monospace"
                  >
                    {s.displayName}
                  </text>
                </g>
              ))}
              {/* Horizontal marker at each fret wire */}
              {FRET_WIRE_Y.map((y, i) => (
                <g key={i}>
                  <line
                    x1={880} y1={y} x2={1080} y2={y}
                    stroke="hsl(50 100% 65%)" strokeWidth={1} strokeDasharray="4 3" opacity={0.7}
                  />
                  <text
                    x={890} y={y - 4}
                    transform={`rotate(90, 890, ${y - 4})`}
                    fontSize={14} fill="hsl(50 100% 65%)"
                    fontFamily="ui-monospace, monospace"
                  >
                    {i === 0 ? 'NUT' : `F${i}`}
                  </text>
                </g>
              ))}
            </g>
          )}
        </svg>
      </div>

      {/* Debug toggle */}
      <button
        onClick={() => setDebug(d => !d)}
        style={{
          position: 'absolute', bottom: 8, right: 8, zIndex: 10,
          padding: '2px 8px', borderRadius: 6, cursor: 'pointer',
          fontSize: 10, fontFamily: 'ui-monospace, monospace',
          background: debugMode ? 'hsl(38 80% 20%)' : 'hsl(224 18% 12%)',
          color:      debugMode ? 'hsl(38 90% 70%)' : 'hsl(220 10% 38%)',
          border: `1px solid ${debugMode ? 'hsl(38 60% 35%)' : 'hsl(224 15% 20%)'}`,
        }}
      >
        {debugMode ? 'debug ✓' : 'debug'}
      </button>
    </div>
  )
}
