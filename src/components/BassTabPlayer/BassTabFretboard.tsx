import React, { useState } from 'react'
import { STRINGS, fretToNoteName } from '../../lib/bassTab/bassTheory'

const FRET_COUNT   = 12
const CELL_W       = 52
const OPEN_W       = 44
const LABEL_W      = 56
const ROW_H        = 44
const NECK_W       = OPEN_W + FRET_COUNT * CELL_W   // exact neck width — no overflow

const SINGLE_DOT_FRETS = [3, 5, 7, 9]

interface FretboardProps {
  activeFrets: (number | null)[]
  onNoteClick?: (stringIndex: number, fret: number) => void
}

export function BassTabFretboard({ activeFrets, onNoteClick }: FretboardProps) {
  const [hovered, setHovered] = useState<[number, number] | null>(null)
  const isInteractive = !!onNoteClick
  const totalW = LABEL_W + NECK_W

  const STRING_BORDER_H = [1.5, 2, 2.5, 3.5]

  return (
    <div
      className="flex-shrink-0 border-b border-gray-700"
      style={{ background: '#07050a', overflowX: 'auto', overflowY: 'hidden' }}
    >
      {/* Fixed-width inner — never stretches beyond the 12 frets */}
      <div style={{ width: totalW }}>

        {/* ── Fret-number header ─────────────────────────────────────────── */}
        <div style={{
          display: 'flex',
          height: 28,
          background: '#0f0f1a',
          borderBottom: '1px solid #1a1a2e',
          userSelect: 'none',
        }}>
          <div style={{ width: LABEL_W, flexShrink: 0 }} />

          {/* Open column */}
          <div style={{
            width: OPEN_W, flexShrink: 0,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            color: '#4b5563', fontSize: 10, fontFamily: 'monospace',
          }}>
            <span>O</span>
            <span style={{ fontSize: 8, color: '#2d3748' }}>{fretToNoteName(3, 0)}</span>
          </div>

          {/* Frets 1–12 */}
          {Array.from({ length: FRET_COUNT }, (_, i) => {
            const f = i + 1
            const isMarker = [3, 5, 7, 9, 12].includes(f)
            return (
              <div key={f} style={{
                width: CELL_W, flexShrink: 0,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                color: isMarker ? '#6b7280' : '#2d3748',
                fontSize: 10, fontFamily: 'monospace',
              }}>
                <span>{f}</span>
                {/* E1 note name reference — helps bassist locate positions */}
                <span style={{ fontSize: 8, color: '#2a3545', lineHeight: 1 }}>
                  {fretToNoteName(3, f)}
                </span>
              </div>
            )
          })}
        </div>

        {/* ── String rows ─────────────────────────────────────────────────── */}
        {STRINGS.map((s, si) => {
          const isRowHov = hovered?.[0] === si

          return (
            <div key={si} style={{
              display: 'flex',
              height: ROW_H,
              position: 'relative',
              borderBottom: si < 3 ? '1px solid #120900' : 'none',
            }}>
              {/* String label */}
              <div style={{
                width: LABEL_W, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: '#07050a',
                borderRight: '2px solid #1a1a2e',
                zIndex: 3,
              }}>
                <span style={{ color: s.color, fontSize: 11, fontFamily: 'monospace', fontWeight: 700 }}>
                  {s.displayName}
                </span>
              </div>

              {/* Neck body — EXACT width, ends at last fret */}
              <div style={{
                position: 'absolute',
                left: LABEL_W,
                width: NECK_W,
                top: 0, bottom: 0,
                background: 'linear-gradient(to bottom, #1a0c00 0%, #1f1000 50%, #1a0c00 100%)',
              }} />

              {/* Neck end cap */}
              <div style={{
                position: 'absolute',
                left: LABEL_W + NECK_W - 4,
                width: 4,
                top: 0, bottom: 0,
                background: '#4a2e14',
                borderRadius: '0 2px 2px 0',
              }} />

              {/* String wire — same exact width as neck */}
              <div style={{
                position: 'absolute',
                left: LABEL_W,
                width: NECK_W,
                top: '50%',
                height: STRING_BORDER_H[si],
                background: isRowHov ? s.color : '#c4a07a',
                transform: 'translateY(-50%)',
                transition: 'background 0.12s',
                pointerEvents: 'none',
                zIndex: 1,
              }} />

              {/* Open string cell */}
              <FretCell
                isHovered={hovered?.[0] === si && hovered?.[1] === 0}
                isActive={activeFrets[si] === 0}
                width={OPEN_W}
                color={s.color}
                darkColor={s.darkColor}
                label="0"
                noteName={fretToNoteName(si, 0)}
                isInteractive={isInteractive}
                isOpen
                borderRight="4px solid #d4b896"
                onEnter={() => isInteractive && setHovered([si, 0])}
                onLeave={() => setHovered(null)}
                onClick={() => onNoteClick?.(si, 0)}
              />

              {/* Fret cells 1–12 */}
              {Array.from({ length: FRET_COUNT }, (_, i) => {
                const f = i + 1
                const hasDot = SINGLE_DOT_FRETS.includes(f) && si === 2
                const hasDoubleDot = f === 12 && (si === 0 || si === 3)
                return (
                  <FretCell
                    key={f}
                    isHovered={hovered?.[0] === si && hovered?.[1] === f}
                    isActive={activeFrets[si] === f}
                    hasDot={hasDot || hasDoubleDot}
                    width={CELL_W}
                    color={s.color}
                    darkColor={s.darkColor}
                    label={String(f)}
                    noteName={fretToNoteName(si, f)}
                    isInteractive={isInteractive}
                    borderRight="1px solid #5a4a38"
                    onEnter={() => isInteractive && setHovered([si, f])}
                    onLeave={() => setHovered(null)}
                    onClick={() => onNoteClick?.(si, f)}
                  />
                )
              })}
            </div>
          )
        })}

        {/* ── Info footer ─────────────────────────────────────────────────── */}
        <div style={{
          height: 18,
          background: '#0f0f1a',
          borderTop: '1px solid #1a1a2e',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          userSelect: 'none',
        }}>
          {hovered ? (
            <span style={{ color: STRINGS[hovered[0]].color, fontSize: 10, fontFamily: 'monospace' }}>
              {STRINGS[hovered[0]].displayName} · Fret {hovered[1]} · {fretToNoteName(hovered[0], hovered[1])}
              {isInteractive && ' — tap to place note at cursor ↓'}
            </span>
          ) : (
            <span style={{ color: '#2d3748', fontSize: 10, fontFamily: 'monospace' }}>
              {isInteractive ? 'Tap a fret to place note at the cursor' : ''}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Cell ─────────────────────────────────────────────────────────────────────
interface CellProps {
  isHovered: boolean; isActive: boolean; hasDot?: boolean; isOpen?: boolean
  width: number; color: string; darkColor: string
  label: string; noteName: string; isInteractive: boolean
  borderRight?: string
  onEnter: () => void; onLeave: () => void; onClick: () => void
}

function FretCell({ isHovered, isActive, hasDot, isOpen=false, width, color, darkColor, label, noteName, isInteractive, borderRight, onEnter, onLeave, onClick }: CellProps) {
  return (
    <div
      style={{
        width, flexShrink: 0, position: 'relative', zIndex: 2,
        background: isHovered ? `${color}20` : 'transparent',
        borderRight,
        cursor: isInteractive ? 'pointer' : 'default',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 0.06s',
        touchAction: 'none',
      }}
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
      onClick={onClick}
    >
      {hasDot && !isActive && (
        <div style={{ position:'absolute', width:7, height:7, borderRadius:'50%', background:'#3a2810', zIndex:0, pointerEvents:'none' }} />
      )}
      {isActive && (
        <div style={{
          width:30, height:30, borderRadius:'50%',
          background: darkColor, border:`2.5px solid ${color}`,
          boxShadow:`0 0 10px ${color}80`,
          display:'flex', alignItems:'center', justifyContent:'center',
          color:'white', fontSize:11, fontWeight:700, fontFamily:'monospace',
          pointerEvents:'none', zIndex:4, flexShrink:0,
        }}>{isOpen ? '0' : label}</div>
      )}
      {isHovered && !isActive && (
        <span style={{ color, fontSize:11, fontFamily:'monospace', fontWeight:700, pointerEvents:'none', zIndex:4 }}>
          {noteName}
        </span>
      )}
    </div>
  )
}
