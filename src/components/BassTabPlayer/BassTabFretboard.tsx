import React, { useState, useRef, useEffect, useCallback } from 'react'
import { STRINGS, fretToNoteName } from '../../lib/bassTab/bassTheory'

const MIN_FRETS  = 12
const MAX_FRETS  = 24
const CELL_W     = 52
const OPEN_W     = 44
const LABEL_W    = 56
const ROW_H      = 48
const NATURAL_H  = 27 + 4 * ROW_H + 19  // header + rows + footer (≈238px)

// Per-string physical appearance
const STRING_H    = [2, 3, 4.5, 6.5]
const STRING_GRAD = [
  'linear-gradient(180deg, rgba(255,255,255,0.8) 0%, #d8d8d8 35%, #909090 100%)',
  'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, #c8b880 35%, #887038 100%)',
  'linear-gradient(180deg, rgba(255,255,255,0.4) 0%, #b89860 35%, #705028 100%)',
  'linear-gradient(180deg, rgba(255,255,255,0.25) 0%, #a07848 35%, #583818 100%)',
]

// Vibration config per string (G2→E1)
const VIBE = [
  { amp: 2.0, dur: 1100, glow:  5 },
  { amp: 2.8, dur: 1400, glow:  8 },
  { amp: 3.6, dur: 1700, glow: 11 },
  { amp: 4.8, dur: 2000, glow: 16 },
]

// X position where the vibrating segment starts for a given fret
function vibeStartX(fret: number): number {
  if (fret === 0) return LABEL_W
  return LABEL_W + OPEN_W + (fret - 1) * CELL_W + 3
}

// Keyframes: decaying oscillation. Inner div has no CSS transform, so plain translateY works.
function pluckKeyframes(amp: number, color: string, glow: number): Keyframe[] {
  const N = 24
  return Array.from({ length: N + 1 }, (_, i) => {
    const t     = i / N
    const decay = Math.exp(-t * 3.5)
    const dir   = i % 2 === 0 ? -1 : 1
    const y     = amp * decay * dir
    const g     = glow * Math.exp(-t * 2.2)
    return {
      offset: t,
      transform: `translateY(${y.toFixed(2)}px)`,
      boxShadow: g > 0.3
        ? `0 0 ${g.toFixed(1)}px ${color}cc, 0 0 ${(g * 2.5).toFixed(1)}px ${color}40`
        : 'none',
    }
  })
}

const SINGLE_DOT_FRETS = [3, 5, 7, 9, 15, 17, 19, 21]
const DOUBLE_DOT_FRETS = [12, 24]
const MARK_FRETS = new Set([3, 5, 7, 9, 12, 15, 17, 19, 21, 24])

interface FretboardProps {
  activeFrets: (number | null)[]
  attackSignals: ({ fret: number; v: number } | null)[]
  onNoteClick?: (stringIndex: number, fret: number) => void
}

// vibeInfo[si] = { fret, key } — key changes on every attack to trigger the effect
type VibeInfo = { fret: number; key: number }

export function BassTabFretboard({ activeFrets, attackSignals, onNoteClick }: FretboardProps) {
  const [hovered, setHovered]     = useState<[number, number] | null>(null)
  const isInteractive             = !!onNoteClick
  const containerRef              = useRef<HTMLDivElement>(null)
  const [fretCount, setFretCount] = useState(MIN_FRETS)
  const [scale, setScale]         = useState(1)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = () => {
      const w = el.getBoundingClientRect().width
      if (w <= 0) return
      // Fill available width with as many frets as possible (min 12, max 24)
      const naturalFrets = Math.max(MIN_FRETS, Math.min(MAX_FRETS, Math.floor((w - LABEL_W - OPEN_W) / CELL_W)))
      const naturalW = LABEL_W + OPEN_W + naturalFrets * CELL_W
      setFretCount(naturalFrets)
      setScale(Math.min(1, w / naturalW))
    }
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    measure()
    return () => ro.disconnect()
  }, [])

  const neckW  = OPEN_W + fretCount * CELL_W
  const totalW = LABEL_W + neckW

  // Vibration state: one entry per string
  const [vibes, setVibes] = useState<VibeInfo[]>(
    STRINGS.map(() => ({ fret: 0, key: 0 }))
  )

  // Refs for the inner animated div of each string's live segment
  const vibeRefs = useRef<(HTMLDivElement | null)[]>([null, null, null, null])
  const animRefs = useRef<(Animation | null)[]>([null, null, null, null])
  const prevVibeKeys  = useRef<number[]>([0, 0, 0, 0])
  const prevSigVersions = useRef<(number | null)[]>([null, null, null, null])

  // ── Strike: reposition live segment + queue animation ──────────────────
  const triggerStrike = useCallback((si: number, fret: number) => {
    setVibes(prev => {
      const next = [...prev]
      next[si] = { fret, key: Date.now() + si }
      return next
    })
  }, [])

  // ── Run string vibration after vibes state settles ─────────────────────
  useEffect(() => {
    vibes.forEach(({ key }, si) => {
      if (key === 0 || key === prevVibeKeys.current[si]) return
      prevVibeKeys.current[si] = key
      const el = vibeRefs.current[si]
      if (!el) return
      animRefs.current[si]?.cancel()
      const v = VIBE[si]
      animRefs.current[si] = el.animate(
        pluckKeyframes(v.amp, STRINGS[si].color, v.glow),
        { duration: v.dur, easing: 'linear' },
      )
    })
  }, [vibes])

  // ── Watch attackSignals from BassTabPlayer (playback attacks) ──────────
  // Uses note IDs + backward-beat detection, so same-fret repeats and
  // loop restarts all fire correctly.
  useEffect(() => {
    attackSignals.forEach((sig, si) => {
      if (!sig || sig.v === prevSigVersions.current[si]) return
      prevSigVersions.current[si] = sig.v
      triggerStrike(si, sig.fret)
    })
  }, [attackSignals, triggerStrike])

  // ── Fretboard click: trigger strike directly (no round-trip needed) ────
  const handleFretClick = useCallback((si: number, fret: number) => {
    triggerStrike(si, fret)
    onNoteClick?.(si, fret)
  }, [triggerStrike, onNoteClick])

  return (
    <div
      ref={containerRef}
      className="flex-shrink-0"
      style={{
        background: '#07050a',
        overflow: 'hidden',
        borderBottom: '1px solid hsl(224 15% 16%)',
        height: Math.round(NATURAL_H * scale),
      }}
    >
      <div style={{ width: totalW, transform: `scale(${scale})`, transformOrigin: 'top left' }}>

        {/* ── Fret-number header ─────────────────────────────────────────── */}
        <div style={{ display:'flex', height:26, background:'hsl(224 20% 9%)', borderBottom:'1px solid hsl(224 15% 16%)', userSelect:'none' }}>
          <div style={{ width: LABEL_W, flexShrink: 0 }} />
          <div style={{ width:OPEN_W, flexShrink:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', color:'hsl(220 10% 38%)', fontSize:10, fontFamily:'ui-monospace,monospace' }}>
            <span style={{ fontWeight:600 }}>0</span>
            <span style={{ fontSize:8, color:'hsl(220 10% 28%)' }}>{fretToNoteName(3, 0)}</span>
          </div>
          {Array.from({ length: fretCount }, (_, i) => {
            const f = i + 1
            const isMark = MARK_FRETS.has(f)
            return (
              <div key={f} style={{ width:CELL_W, flexShrink:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', color:isMark?'hsl(220 10% 48%)':'hsl(220 10% 28%)', fontSize:10, fontFamily:'ui-monospace,monospace' }}>
                <span style={{ fontWeight: isMark ? 600 : 400 }}>{f}</span>
                <span style={{ fontSize:8, color:'hsl(220 10% 22%)', lineHeight:1 }}>{fretToNoteName(3, f)}</span>
              </div>
            )
          })}
        </div>

        {/* ── String rows ─────────────────────────────────────────────────── */}
        {STRINGS.map((s, si) => (
          <StringRow
            key={si}
            s={s} si={si}
            neckW={neckW} fretCount={fretCount}
            activeFret={activeFrets[si]}
            vibeFret={vibes[si].fret}
            vibeKey={vibes[si].key}
            vibeRef={el => { vibeRefs.current[si] = el }}
            hovered={hovered}
            isInteractive={isInteractive}
            onHover={setHovered}
            onClear={() => setHovered(null)}
            onClick={handleFretClick}
          />
        ))}

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div style={{ height:18, background:'hsl(224 20% 9%)', borderTop:'1px solid hsl(224 15% 16%)', display:'flex', alignItems:'center', justifyContent:'center', userSelect:'none' }}>
          {hovered ? (
            <span style={{ color: STRINGS[hovered[0]].color, fontSize:10, fontFamily:'ui-monospace,monospace' }}>
              {STRINGS[hovered[0]].displayName} · Fret {hovered[1]} · {fretToNoteName(hovered[0], hovered[1])}
              {isInteractive && ' — tap to place note at cursor ↓'}
            </span>
          ) : (
            <span style={{ color:'hsl(220 10% 28%)', fontSize:10, fontFamily:'ui-monospace,monospace' }}>
              {isInteractive ? 'Tap a fret to place note at cursor' : ''}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── String row ────────────────────────────────────────────────────────────────
interface RowProps {
  s: typeof STRINGS[number]; si: number
  neckW: number; fretCount: number
  activeFret: number | null
  vibeFret: number
  vibeKey: number
  vibeRef: (el: HTMLDivElement | null) => void
  hovered: [number, number] | null
  isInteractive: boolean
  onHover: (h: [number, number]) => void
  onClear: () => void
  onClick: (si: number, fret: number) => void
}

function StringRow({ s, si, neckW, fretCount, activeFret, vibeFret, vibeKey, vibeRef, hovered, isInteractive, onHover, onClear, onClick }: RowProps) {
  const vx = vibeStartX(vibeFret)

  return (
    <div style={{ display:'flex', height:ROW_H, position:'relative', borderBottom: si < 3 ? '1px solid #0e0600' : 'none' }}>

      {/* Label */}
      <div style={{ width:LABEL_W, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', background:'hsl(224 20% 9%)', borderRight:'2px solid hsl(224 15% 16%)', zIndex:3 }}>
        <span style={{ color:s.color, fontSize:11, fontFamily:'ui-monospace,monospace', fontWeight:700 }}>{s.displayName}</span>
      </div>

      {/* Neck wood */}
      <div style={{
        position:'absolute', left:LABEL_W, width:neckW, top:0, bottom:0,
        background:`
          repeating-linear-gradient(91deg, transparent 0px, transparent 22px, rgba(0,0,0,0.055) 22px, transparent 24px),
          repeating-linear-gradient(89deg, transparent 0px, transparent 38px, rgba(0,0,0,0.04) 38px, transparent 40px),
          linear-gradient(180deg, #1e0d00 0%, #2d1500 25%, #201000 50%, #2d1500 75%, #1e0d00 100%)
        `,
      }} />

      {/* Neck end cap */}
      <div style={{ position:'absolute', left:LABEL_W+neckW-5, width:5, top:0, bottom:0, background:'linear-gradient(90deg, #4a2810, #6a3c1a)', borderRadius:'0 2px 2px 0', zIndex:2 }} />

      {/* Fret wires */}
      {Array.from({ length: fretCount }, (_, i) => (
        <div key={i} style={{ position:'absolute', left:LABEL_W+OPEN_W+i*CELL_W, top:0, bottom:0, width:3, zIndex:2, pointerEvents:'none', background:'linear-gradient(90deg, #3a3028, #b8a888 40%, #e8d8b8 50%, #b8a888 60%, #3a3028)' }} />
      ))}

      {/* Nut */}
      <div style={{ position:'absolute', left:LABEL_W+OPEN_W-5, top:0, bottom:0, width:5, zIndex:3, pointerEvents:'none', background:'linear-gradient(90deg, #2a1808, #e8dcc0 30%, #f5f0dc 50%, #e8dcc0 70%, #2a1808)', boxShadow:'2px 0 6px rgba(0,0,0,0.5)' }} />

      {/* ── String: dead segment (NEVER changes — fully static) ─────────── */}
      <div style={{
        position:'absolute', left:LABEL_W, width:neckW,
        top:'50%', transform:'translateY(-50%)',
        height:STRING_H[si], background:STRING_GRAD[si],
        pointerEvents:'none', zIndex:4, borderRadius:'50%',
        boxShadow:'0 1px 2px rgba(0,0,0,0.5)',
      }} />

      {/* ── String: live segment (fret to bridge — vibrates on attack) ─── */}
      <div style={{
        position:'absolute', left:vx, width:LABEL_W+neckW-vx,
        top:'50%', transform:'translateY(-50%)',
        pointerEvents:'none', zIndex:5,
      }}>
        <div
          ref={vibeRef}
          style={{
            width:'100%', height:STRING_H[si],
            background:STRING_GRAD[si],
            borderRadius:'50%',
          }}
        />
      </div>

      {/* Open string cell */}
      <FretCell si={si} fret={0} s={s}
        isHov={hovered?.[0]===si && hovered?.[1]===0}
        isActive={activeFret===0}
        isInteractive={isInteractive}
        width={OPEN_W} hasDot={false}
        vibeKey={vibeKey} vibeFret={vibeFret}
        onHov={() => isInteractive && onHover([si, 0])}
        onLeave={onClear}
        onClick={() => onClick(si, 0)}
      />

      {/* Fret cells 1–N */}
      {Array.from({ length: fretCount }, (_, i) => {
        const f = i + 1
        const hasDot = (SINGLE_DOT_FRETS.includes(f) && si === 2)
                    || (DOUBLE_DOT_FRETS.includes(f) && (si === 0 || si === 3))
        return (
          <FretCell key={f} si={si} fret={f} s={s}
            isHov={hovered?.[0]===si && hovered?.[1]===f}
            isActive={activeFret===f}
            isInteractive={isInteractive}
            width={CELL_W}
            hasDot={hasDot}
            vibeKey={vibeKey} vibeFret={vibeFret}
            onHov={() => isInteractive && onHover([si, f])}
            onLeave={onClear}
            onClick={() => onClick(si, f)}
          />
        )
      })}
    </div>
  )
}

// ── Fret cell ─────────────────────────────────────────────────────────────────
interface CellProps {
  si: number; fret: number; s: typeof STRINGS[number]
  isHov: boolean; isActive: boolean; isInteractive: boolean
  width: number; hasDot: boolean
  vibeKey: number; vibeFret: number
  onHov: () => void; onLeave: () => void; onClick: () => void
}

// opacity:1 in keyframes overrides CSS opacity:0 during flash.
// fill:'none' (default) restores CSS opacity when animation ends.
const FLASH_KF: Keyframe[] = [
  { transform: 'scale(1.6)',  filter: 'brightness(3)',   opacity: 1, offset: 0 },
  { transform: 'scale(1.15)', filter: 'brightness(1.8)', opacity: 1, offset: 0.28 },
  { transform: 'scale(1)',    filter: 'brightness(1)',   opacity: 1, offset: 1 },
]

function FretCell({ si, fret, s, isHov, isActive, isInteractive, width, hasDot, vibeKey, vibeFret, onHov, onLeave, onClick }: CellProps) {
  const dotRef  = useRef<HTMLDivElement>(null)
  const prevKey = useRef(0)

  // Dot is ALWAYS mounted (opacity:0 when inactive).
  // dotRef.current is always set → no isFlashing state, no race condition.
  // Each unique vibeKey triggers one animation call, regardless of interval.
  useEffect(() => {
    if (vibeKey === 0 || vibeKey === prevKey.current || vibeFret !== fret) return
    prevKey.current = vibeKey
    dotRef.current?.animate(FLASH_KF, { duration: 380, easing: 'ease-out' })
  }, [vibeKey, vibeFret, fret])

  return (
    <div
      style={{
        width, flexShrink:0, position:'relative', zIndex:5,
        background: isHov ? `${s.color}18` : 'transparent',
        cursor: isInteractive ? 'pointer' : 'default',
        display:'flex', alignItems:'center', justifyContent:'center',
        touchAction:'none', transition:'background 0.07s',
      }}
      onPointerEnter={onHov}
      onPointerLeave={onLeave}
      onClick={onClick}
    >
      {hasDot && !isActive && (
        <div style={{ position:'absolute', width:9, height:9, borderRadius:'50%', background:'radial-gradient(circle at 38% 35%, #f8f5e8, #d8d0a8 52%, #b0a870)', boxShadow:'0 1px 3px rgba(0,0,0,0.6), inset 0 1px 1px rgba(255,255,255,0.5)', pointerEvents:'none', zIndex:0 }} />
      )}
      <div
        ref={dotRef}
        style={{
          width:32, height:32, borderRadius:'50%', flexShrink:0,
          background:`radial-gradient(circle at 38% 30%, ${s.color}dd, ${s.darkColor})`,
          border:`2px solid ${s.color}`,
          boxShadow:`0 0 14px ${s.color}99, 0 0 4px ${s.color}, inset 0 1px 2px rgba(255,255,255,0.25)`,
          display:'flex', alignItems:'center', justifyContent:'center',
          color:'white', fontSize:11, fontWeight:700, fontFamily:'ui-monospace,monospace',
          pointerEvents:'none', zIndex:6,
          opacity: isActive ? 1 : 0,
        }}
      >
        {fret}
      </div>
      {isHov && !isActive && (
        <span style={{ color:`${s.color}cc`, fontSize:11, fontFamily:'ui-monospace,monospace', fontWeight:700, pointerEvents:'none', zIndex:6 }}>
          {fretToNoteName(si, fret)}
        </span>
      )}
    </div>
  )
}
