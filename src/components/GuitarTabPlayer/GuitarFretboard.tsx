import React, { useState, useRef, useEffect, useCallback } from 'react'
import { GUITAR_STRINGS, fretToNoteName, SINGLE_DOT_FRETS, DOUBLE_DOT_FRETS, MARK_FRETS } from '../../lib/guitarTab/guitarTheory'

const MIN_FRETS = 7
const MAX_FRETS = 24
const CELL_W    = 48
const OPEN_W    = 40
const LABEL_W   = 48
const ROW_H     = 44
const NATURAL_H = 26 + 6 * ROW_H + 18

// String thickness per index (high e = thin)
const STRING_H = [1.5, 2, 2.5, 3.5, 4.5, 5.5]

function vibeStartX(fret: number): number {
  if (fret === 0) return LABEL_W
  return LABEL_W + OPEN_W + (fret - 1) * CELL_W + 3
}

const FLASH_KF: Keyframe[] = [
  { transform: 'scale(1.5)', filter: 'brightness(1.8)', opacity: 1, offset: 0 },
  { transform: 'scale(1.1)', filter: 'brightness(1.3)', opacity: 1, offset: 0.3 },
  { transform: 'scale(1)',   filter: 'brightness(1)',   opacity: 1, offset: 1 },
]

interface FretboardProps {
  activeFrets: (number | null)[]
  attackSignals: ({ fret: number; v: number } | null)[]
  onNoteClick?: (stringIndex: number, fret: number) => void
  maxHeight?: number
}

type VibeInfo = { fret: number; key: number }

export function GuitarFretboard({ activeFrets, attackSignals, onNoteClick, maxHeight }: FretboardProps) {
  const [hovered, setHovered] = useState<[number, number] | null>(null)
  const isInteractive         = !!onNoteClick
  const containerRef          = useRef<HTMLDivElement>(null)
  const [fretCount, setFretCount] = useState(MIN_FRETS)
  const [scale, setScale]     = useState(1)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = () => {
      const w = el.getBoundingClientRect().width
      if (w <= 0) return
      const naturalFrets = Math.max(MIN_FRETS, Math.min(MAX_FRETS, Math.floor((w - LABEL_W - OPEN_W) / CELL_W)))
      const naturalW = LABEL_W + OPEN_W + naturalFrets * CELL_W
      const scaleW = Math.min(1, w / naturalW)
      const scaleH = maxHeight ? Math.min(1, maxHeight / NATURAL_H) : 1
      setFretCount(naturalFrets)
      setScale(Math.min(scaleW, scaleH))
    }
    const ro = new ResizeObserver(measure)
    ro.observe(el); measure()
    return () => ro.disconnect()
  }, [maxHeight])

  const neckW  = OPEN_W + fretCount * CELL_W
  const totalW = LABEL_W + neckW

  const [vibes, setVibes] = useState<VibeInfo[]>(
    GUITAR_STRINGS.map(() => ({ fret: 0, key: 0 }))
  )
  const vibeRefs     = useRef<(HTMLDivElement | null)[]>(Array(6).fill(null))
  const animRefs     = useRef<(Animation | null)[]>(Array(6).fill(null))
  const prevVibeKeys = useRef<number[]>(Array(6).fill(0))
  const prevSigVers  = useRef<(number | null)[]>(Array(6).fill(null))

  const triggerStrike = useCallback((si: number, fret: number) => {
    setVibes(prev => {
      const next = [...prev]; next[si] = { fret, key: Date.now() + si }; return next
    })
  }, [])

  useEffect(() => {
    vibes.forEach(({ key }, si) => {
      if (key === 0 || key === prevVibeKeys.current[si]) return
      prevVibeKeys.current[si] = key
      const el = vibeRefs.current[si]
      if (!el) return
      animRefs.current[si]?.cancel()
      animRefs.current[si] = el.animate(FLASH_KF, { duration: 300, easing: 'ease-out' })
    })
  }, [vibes])

  useEffect(() => {
    attackSignals.forEach((sig, si) => {
      if (!sig || sig.v === prevSigVers.current[si]) return
      prevSigVers.current[si] = sig.v
      triggerStrike(si, sig.fret)
    })
  }, [attackSignals, triggerStrike])

  const handleFretClick = useCallback((si: number, fret: number) => {
    triggerStrike(si, fret)
    onNoteClick?.(si, fret)
  }, [triggerStrike, onNoteClick])

  return (
    <div
      ref={containerRef}
      style={{ flexShrink: 0, overflow: 'hidden', background: '#fef9f0', borderBottom: '1px solid #e2e8f0', height: Math.round(NATURAL_H * scale) }}
    >
      <div style={{ width: totalW, transform: `scale(${scale})`, transformOrigin: 'top left' }}>

        {/* Fret number header */}
        <div style={{ display: 'flex', height: 26, background: '#f8fafc', borderBottom: '1px solid #e2e8f0', userSelect: 'none' }}>
          <div style={{ width: LABEL_W, flexShrink: 0 }} />
          <div style={{ width: OPEN_W, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 10, fontFamily: 'ui-monospace,monospace' }}>
            <span style={{ fontWeight: 600 }}>0</span>
          </div>
          {Array.from({ length: fretCount }, (_, i) => {
            const f = i + 1
            const isMark = MARK_FRETS.has(f)
            return (
              <div key={f} style={{ width: CELL_W, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: isMark ? '#475569' : '#cbd5e1', fontSize: 10, fontFamily: 'ui-monospace,monospace', fontWeight: isMark ? 600 : 400 }}>
                {f}
              </div>
            )
          })}
        </div>

        {/* String rows */}
        {GUITAR_STRINGS.map((s, si) => {
          const vx = vibeStartX(vibes[si].fret)
          return (
            <div key={si} style={{ display: 'flex', height: ROW_H, position: 'relative', borderBottom: si < 5 ? '1px solid #f1f5f9' : 'none', background: si % 2 === 0 ? '#fffdf7' : '#fef9f0' }}>

              {/* Label */}
              <div style={{ width: LABEL_W, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', borderRight: '2px solid #e2e8f0', zIndex: 3 }}>
                <span style={{ color: s.color, fontSize: 11, fontFamily: 'ui-monospace,monospace', fontWeight: 700 }}>{s.displayName}</span>
              </div>

              {/* Neck wood */}
              <div style={{ position: 'absolute', left: LABEL_W, width: neckW, top: 0, bottom: 0, background: 'linear-gradient(180deg, #f5e8d0 0%, #edd8b0 30%, #e5c88a 50%, #edd8b0 70%, #f5e8d0 100%)' }} />
              {/* Fret wires */}
              {Array.from({ length: fretCount }, (_, i) => (
                <div key={i} style={{ position: 'absolute', left: LABEL_W + OPEN_W + i * CELL_W, top: 0, bottom: 0, width: 3, zIndex: 2, pointerEvents: 'none', background: 'linear-gradient(90deg, #8a7560, #d4c4a0 40%, #f0e8d0 50%, #d4c4a0 60%, #8a7560)' }} />
              ))}
              {/* Nut */}
              <div style={{ position: 'absolute', left: LABEL_W + OPEN_W - 4, top: 0, bottom: 0, width: 4, zIndex: 3, pointerEvents: 'none', background: 'linear-gradient(90deg, #b8a880, #f8f0d8 40%, #fff8e8 50%, #f8f0d8 60%, #b8a880)', boxShadow: '1px 0 4px rgba(0,0,0,0.15)' }} />
              {/* Fret dots */}
              {SINGLE_DOT_FRETS.map(f => f <= fretCount && si === 2 ? (
                <div key={f} style={{ position: 'absolute', left: LABEL_W + OPEN_W + (f - 1) * CELL_W + CELL_W / 2 - 5, top: '50%', transform: 'translateY(-50%)', width: 9, height: 9, borderRadius: '50%', background: '#d4c090', opacity: 0.7, pointerEvents: 'none', zIndex: 1 }} />
              ) : null)}

              {/* Static string */}
              <div style={{ position: 'absolute', left: LABEL_W, width: neckW, top: '50%', transform: 'translateY(-50%)', height: STRING_H[si], background: `linear-gradient(180deg, rgba(255,255,255,0.6) 0%, #c8b890 40%, #908060 100%)`, pointerEvents: 'none', zIndex: 4, borderRadius: '50%', boxShadow: '0 1px 2px rgba(0,0,0,0.2)' }} />
              {/* Live string segment */}
              <div style={{ position: 'absolute', left: vx, width: LABEL_W + neckW - vx, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', zIndex: 5 }}>
                <div ref={el => { vibeRefs.current[si] = el }} style={{ width: '100%', height: STRING_H[si], background: `linear-gradient(180deg, rgba(255,255,255,0.6) 0%, #c8b890 40%, #908060 100%)`, borderRadius: '50%' }} />
              </div>

              {/* Open string cell */}
              <GuitarFretCell si={si} fret={0} s={s} isHov={hovered?.[0]===si && hovered?.[1]===0} isActive={activeFrets[si]===0} isInteractive={isInteractive} width={OPEN_W} hasDot={false} vibeKey={vibes[si].key} vibeFret={vibes[si].fret} onHov={() => isInteractive && setHovered([si, 0])} onLeave={() => setHovered(null)} onClick={() => handleFretClick(si, 0)} />

              {/* Fret cells */}
              {Array.from({ length: fretCount }, (_, i) => {
                const f = i + 1
                const hasDot = (DOUBLE_DOT_FRETS.includes(f) && (si === 0 || si === 5))
                return (
                  <GuitarFretCell key={f} si={si} fret={f} s={s} isHov={hovered?.[0]===si && hovered?.[1]===f} isActive={activeFrets[si]===f} isInteractive={isInteractive} width={CELL_W} hasDot={hasDot} vibeKey={vibes[si].key} vibeFret={vibes[si].fret} onHov={() => isInteractive && setHovered([si, f])} onLeave={() => setHovered(null)} onClick={() => handleFretClick(si, f)} />
                )
              })}
            </div>
          )
        })}

        {/* Footer */}
        <div style={{ height: 18, background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', userSelect: 'none' }}>
          {hovered ? (
            <span style={{ color: GUITAR_STRINGS[hovered[0]].color, fontSize: 10, fontFamily: 'ui-monospace,monospace' }}>
              {GUITAR_STRINGS[hovered[0]].displayName} · Fret {hovered[1]} · {fretToNoteName(hovered[0], hovered[1])}
              {isInteractive && ' — tap to place note at cursor'}
            </span>
          ) : (
            <span style={{ color: '#94a3b8', fontSize: 10, fontFamily: 'ui-monospace,monospace' }}>
              {isInteractive ? 'Tap a fret to place note at cursor' : ''}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

interface CellProps {
  si: number; fret: number; s: typeof GUITAR_STRINGS[number]
  isHov: boolean; isActive: boolean; isInteractive: boolean
  width: number; hasDot: boolean
  vibeKey: number; vibeFret: number
  onHov: () => void; onLeave: () => void; onClick: () => void
}

function GuitarFretCell({ si, fret, s, isHov, isActive, isInteractive, width, hasDot, vibeKey, vibeFret, onHov, onLeave, onClick }: CellProps) {
  const dotRef  = useRef<HTMLDivElement>(null)
  const prevKey = useRef(0)

  useEffect(() => {
    if (vibeKey === 0 || vibeKey === prevKey.current || vibeFret !== fret) return
    prevKey.current = vibeKey
    dotRef.current?.animate(FLASH_KF, { duration: 280, easing: 'ease-out' })
  }, [vibeKey, vibeFret, fret])

  return (
    <div
      style={{ width, flexShrink: 0, position: 'relative', zIndex: 5, background: isHov ? `${s.color}18` : 'transparent', cursor: isInteractive ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'none', transition: 'background 0.07s' }}
      onPointerEnter={onHov}
      onPointerLeave={onLeave}
      onClick={onClick}
    >
      {hasDot && !isActive && (
        <div style={{ position: 'absolute', width: 8, height: 8, borderRadius: '50%', background: '#d4c090', opacity: 0.8, pointerEvents: 'none', zIndex: 0 }} />
      )}
      <div
        ref={dotRef}
        style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, background: `radial-gradient(circle at 35% 30%, ${s.color}dd, ${s.color}99)`, border: `2px solid ${s.color}`, boxShadow: `0 0 10px ${s.color}60, 0 0 3px ${s.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 10, fontWeight: 700, fontFamily: 'ui-monospace,monospace', pointerEvents: 'none', zIndex: 6, opacity: isActive ? 1 : 0 }}
      >
        {fret}
      </div>
      {isHov && !isActive && (
        <span style={{ color: `${s.color}cc`, fontSize: 10, fontFamily: 'ui-monospace,monospace', fontWeight: 700, pointerEvents: 'none', zIndex: 6 }}>
          {fretToNoteName(si, fret)}
        </span>
      )}
    </div>
  )
}
