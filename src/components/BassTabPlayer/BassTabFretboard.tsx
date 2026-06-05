import React, { useState, useRef, useEffect } from 'react'
import { STRINGS, fretToNoteName } from '../../lib/bassTab/bassTheory'

const FRET_COUNT  = 12
const CELL_W      = 52
const OPEN_W      = 44
const LABEL_W     = 56
const ROW_H       = 48
const NECK_W      = OPEN_W + FRET_COUNT * CELL_W

// ── Per-string physical appearance ───────────────────────────────────────────
const STRING_H = [2, 3, 4.5, 6.5]   // visual thickness px (G2→E1)
const STRING_GRAD = [
  // G2 — thin nickel, bright highlight
  'linear-gradient(180deg, rgba(255,255,255,0.8) 0%, #d8d8d8 35%, #909090 100%)',
  // D2 — slightly wound
  'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, #c8b880 35%, #887038 100%)',
  // A1 — wound bronze
  'linear-gradient(180deg, rgba(255,255,255,0.4) 0%, #b89860 35%, #705028 100%)',
  // E1 — thick wound, dark bronze
  'linear-gradient(180deg, rgba(255,255,255,0.25) 0%, #a07848 35%, #583818 100%)',
]

// ── Vibration parameters per string ──────────────────────────────────────────
const VIBE = [
  { amp: 2.0, dur: 1100, glow:  5 },  // G2
  { amp: 2.8, dur: 1400, glow:  8 },  // D2
  { amp: 3.6, dur: 1700, glow: 11 },  // A1
  { amp: 4.8, dur: 2000, glow: 16 },  // E1
]

function buildPluckKeyframes(amp: number, color: string, glowR: number): Keyframe[] {
  const N = 24
  return Array.from({ length: N + 1 }, (_, i) => {
    const t = i / N
    const decay = Math.exp(-t * 3.5)
    const dir   = i % 2 === 0 ? -1 : 1
    const y     = amp * decay * dir
    const g     = glowR * Math.exp(-t * 2.2)
    return {
      offset: t,
      transform: `translateY(${y.toFixed(2)}px)`,
      boxShadow: `0 0 ${g.toFixed(1)}px ${color}cc, 0 0 ${(g * 2.5).toFixed(1)}px ${color}40`,
    }
  })
}

const SINGLE_DOT_FRETS = [3, 5, 7, 9]

interface FretboardProps {
  activeFrets: (number | null)[]
  onNoteClick?: (stringIndex: number, fret: number) => void
}

export function BassTabFretboard({ activeFrets, onNoteClick }: FretboardProps) {
  const [hovered, setHovered] = useState<[number, number] | null>(null)
  const isInteractive = !!onNoteClick
  const totalW = LABEL_W + NECK_W

  // Refs for Web Animations API on each string wire
  const wireRefs   = useRef<(HTMLDivElement | null)[]>([null, null, null, null])
  const animRefs   = useRef<(Animation | null)[]>([null, null, null, null])
  const prevFrets  = useRef<(number | null)[]>([null, null, null, null])

  // Trigger vibration when a string starts playing
  useEffect(() => {
    activeFrets.forEach((fret, si) => {
      const prev = prevFrets.current[si]
      if (fret !== null && fret !== prev) {
        const el = wireRefs.current[si]
        if (!el) return
        animRefs.current[si]?.cancel()
        const v  = VIBE[si]
        const kf = buildPluckKeyframes(v.amp, STRINGS[si].color, v.glow)
        animRefs.current[si] = el.animate(kf, {
          duration: v.dur,
          easing: 'linear',
          fill: 'forwards',
        })
      }
      // Note released — snap string back
      if (fret === null && prev !== null) {
        const el = wireRefs.current[si]
        if (el) {
          animRefs.current[si]?.cancel()
          animRefs.current[si] = el.animate(
            [{ transform: 'translateY(0px)', boxShadow: '0 0 0px transparent' }],
            { duration: 80, fill: 'forwards' },
          )
        }
      }
      prevFrets.current[si] = fret
    })
  }, [activeFrets])

  return (
    <div
      className="flex-shrink-0"
      style={{ background: '#07050a', overflowX: 'auto', overflowY: 'hidden', borderBottom: '1px solid hsl(224 15% 16%)' }}
    >
      <div style={{ width: totalW }}>

        {/* ── Fret-number header ─────────────────────────────────────────── */}
        <div style={{ display:'flex', height:26, background:'hsl(224 20% 9%)', borderBottom:'1px solid hsl(224 15% 16%)', userSelect:'none' }}>
          <div style={{ width: LABEL_W, flexShrink: 0 }} />
          <div style={{ width: OPEN_W, flexShrink:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', color:'hsl(220 10% 38%)', fontSize:10, fontFamily:'ui-monospace,monospace' }}>
            <span style={{ fontWeight: 600 }}>0</span>
            <span style={{ fontSize: 8, color:'hsl(220 10% 28%)' }}>{fretToNoteName(3, 0)}</span>
          </div>
          {Array.from({ length: FRET_COUNT }, (_, i) => {
            const f = i + 1
            const isMark = [3, 5, 7, 9, 12].includes(f)
            return (
              <div key={f} style={{ width:CELL_W, flexShrink:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', color: isMark ? 'hsl(220 10% 48%)' : 'hsl(220 10% 28%)', fontSize:10, fontFamily:'ui-monospace,monospace' }}>
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
            activeFret={activeFrets[si]}
            hovered={hovered}
            isInteractive={isInteractive}
            wireRef={el => { wireRefs.current[si] = el }}
            onHover={setHovered}
            onClear={() => setHovered(null)}
            onClick={onNoteClick}
          />
        ))}

        {/* ── Hover info footer ──────────────────────────────────────────── */}
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
  activeFret: number | null
  hovered: [number, number] | null
  isInteractive: boolean
  wireRef: (el: HTMLDivElement | null) => void
  onHover: (h: [number, number]) => void
  onClear: () => void
  onClick?: (si: number, fret: number) => void
}

function StringRow({ s, si, activeFret, hovered, isInteractive, wireRef, onHover, onClear, onClick }: RowProps) {
  const isActive = activeFret !== null
  const rowGlow  = isActive ? `${s.color}10` : 'transparent'

  return (
    <div style={{ display:'flex', height:ROW_H, position:'relative', borderBottom: si < 3 ? `1px solid #0e0600` : 'none', background: rowGlow, transition:'background 0.25s' }}>

      {/* String label */}
      <div style={{ width:LABEL_W, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', background:'hsl(224 20% 9%)', borderRight:'2px solid hsl(224 15% 16%)', zIndex:3 }}>
        <span style={{ color: s.color, fontSize:11, fontFamily:'ui-monospace,monospace', fontWeight:700 }}>{s.displayName}</span>
      </div>

      {/* Neck wood body */}
      <div style={{
        position:'absolute', left:LABEL_W, width:NECK_W, top:0, bottom:0,
        background: `
          repeating-linear-gradient(91deg, transparent 0px, transparent 22px, rgba(0,0,0,0.055) 22px, transparent 24px),
          repeating-linear-gradient(89deg, transparent 0px, transparent 38px, rgba(0,0,0,0.04) 38px, transparent 40px),
          linear-gradient(180deg, #1e0d00 0%, #2d1500 25%, #201000 50%, #2d1500 75%, #1e0d00 100%)
        `,
      }} />

      {/* Neck end cap */}
      <div style={{ position:'absolute', left:LABEL_W+NECK_W-5, width:5, top:0, bottom:0, background:'linear-gradient(90deg, #4a2810, #6a3c1a)', borderRadius:'0 2px 2px 0', zIndex:2 }} />

      {/* Fret wires (metallic vertical lines) */}
      {Array.from({ length: FRET_COUNT }, (_, i) => (
        <div key={i} style={{
          position:'absolute',
          left: LABEL_W + OPEN_W + i * CELL_W,
          top:0, bottom:0, width:3, zIndex:2, pointerEvents:'none',
          background:'linear-gradient(90deg, #3a3028, #b8a888 40%, #e8d8b8 50%, #b8a888 60%, #3a3028)',
        }} />
      ))}

      {/* Open-string "nut" — thicker bone/ivory bar */}
      <div style={{
        position:'absolute', left:LABEL_W+OPEN_W-5, top:0, bottom:0, width:5, zIndex:3, pointerEvents:'none',
        background:'linear-gradient(90deg, #2a1808, #e8dcc0 30%, #f5f0dc 50%, #e8dcc0 70%, #2a1808)',
        boxShadow:'2px 0 6px rgba(0,0,0,0.5)',
      }} />

      {/* String wire */}
      <div
        ref={wireRef}
        style={{
          position:'absolute',
          left: LABEL_W,
          width: NECK_W,
          top:'50%', transform:'translateY(-50%)',
          height: STRING_H[si],
          background: STRING_GRAD[si],
          pointerEvents:'none',
          zIndex:4,
          borderRadius: '50%',
          boxShadow: isActive ? `0 0 3px ${s.color}80` : '0 1px 2px rgba(0,0,0,0.5)',
          transition: 'box-shadow 0.1s',
        }}
      />

      {/* Open string cell */}
      <FretCell
        si={si} fret={0} s={s}
        isHov={hovered?.[0]===si && hovered?.[1]===0}
        isActive={activeFret===0}
        isInteractive={isInteractive}
        width={OPEN_W} hasDot={false}
        onHov={() => isInteractive && onHover([si, 0])}
        onLeave={onClear}
        onClick={() => onClick?.(si, 0)}
      />

      {/* Fret cells 1–12 */}
      {Array.from({ length: FRET_COUNT }, (_, i) => {
        const f = i + 1
        const hasDot  = SINGLE_DOT_FRETS.includes(f) && si === 2
        const hasDouble = f === 12 && (si === 0 || si === 3)
        return (
          <FretCell
            key={f} si={si} fret={f} s={s}
            isHov={hovered?.[0]===si && hovered?.[1]===f}
            isActive={activeFret===f}
            isInteractive={isInteractive}
            width={CELL_W} hasDot={hasDot || hasDouble}
            onHov={() => isInteractive && onHover([si, f])}
            onLeave={onClear}
            onClick={() => onClick?.(si, f)}
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
  onHov: () => void; onLeave: () => void; onClick: () => void
}

function FretCell({ fret, s, isHov, isActive, isInteractive, width, hasDot, onHov, onLeave, onClick }: CellProps) {
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
      {/* Position inlay (pearl-like) */}
      {hasDot && !isActive && (
        <div style={{
          position:'absolute',
          width:9, height:9, borderRadius:'50%',
          background:'radial-gradient(circle at 38% 35%, #f8f5e8, #d8d0a8 52%, #b0a870)',
          boxShadow:'0 1px 3px rgba(0,0,0,0.6), inset 0 1px 1px rgba(255,255,255,0.5)',
          pointerEvents:'none', zIndex:0,
        }} />
      )}

      {/* Active note marker */}
      {isActive && (
        <div style={{
          width:32, height:32, borderRadius:'50%', flexShrink:0,
          background: `radial-gradient(circle at 38% 30%, ${s.color}dd, ${s.darkColor})`,
          border:`2px solid ${s.color}`,
          boxShadow:`0 0 14px ${s.color}99, 0 0 4px ${s.color}, inset 0 1px 2px rgba(255,255,255,0.25)`,
          display:'flex', alignItems:'center', justifyContent:'center',
          color:'white', fontSize:11, fontWeight:700, fontFamily:'ui-monospace,monospace',
          pointerEvents:'none', zIndex:6,
        }}>
          {fret}
        </div>
      )}

      {/* Hover ghost */}
      {isHov && !isActive && (
        <span style={{ color:`${s.color}cc`, fontSize:11, fontFamily:'ui-monospace,monospace', fontWeight:700, pointerEvents:'none', zIndex:6 }}>
          {fretToNoteName(si, fret)}
        </span>
      )}
    </div>
  )
}
