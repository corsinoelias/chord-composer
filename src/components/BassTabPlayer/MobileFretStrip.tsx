import React, { useEffect, useRef } from 'react'
import { triggerHaptic } from '../../lib/bassTab/haptics'

const FRET_COUNT = 25 // 0–24
const CELL_W = 56
const STRIP_H = 54

interface MobileFretStripProps {
  visible: boolean
  selectedFret: number | null
  stringColor?: string
  onFretSelect: (fret: number) => void
}

// Persistent bottom pitch-picker for the mobile "Edit" grid. Replaces the old
// one-tap-at-a-time "Fret +1/-1" context-menu buttons — dragging a note only
// ever changes its string/timing in BassTabGrid, never its fret, so this is
// the only way to set pitch on mobile (there's no fretboard dock there).
// Adapted from the fret row that shipped in the never-rendered MobileTabEditor.
export function MobileFretStrip({ visible, selectedFret, stringColor, onFretSelect }: MobileFretStripProps) {
  const stripRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = stripRef.current
    if (!el || selectedFret == null) return
    el.scrollTo({ left: selectedFret * CELL_W - el.clientWidth / 2 + CELL_W / 2, behavior: 'smooth' })
  }, [selectedFret])

  const accent = stringColor ?? 'var(--bt-accent)'

  return (
    <div
      style={{
        flexShrink: 0, overflow: 'hidden',
        maxHeight: visible ? STRIP_H : 0,
        transition: 'max-height 0.18s ease',
        background: 'var(--bt-sunken)',
        borderTop: `1px solid ${visible ? 'var(--bt-rule)' : 'transparent'}`,
      }}
    >
      <div
        ref={stripRef}
        style={{
          height: STRIP_H, display: 'flex', overflowX: 'auto',
          scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch',
        }}
      >
        {Array.from({ length: FRET_COUNT }, (_, fret) => {
          const on = fret === selectedFret
          return (
            <button
              key={fret}
              onPointerDown={e => {
                e.preventDefault()
                onFretSelect(fret)
                triggerHaptic('tap')
              }}
              aria-pressed={on}
              style={{
                flexShrink: 0, width: CELL_W, height: '100%',
                background: on ? `${accent}22` : 'transparent',
                border: 'none',
                borderRight: '1px solid var(--bt-card)',
                borderTop: `2px solid ${on ? accent : 'transparent'}`,
                color: on ? accent : 'var(--bt-soft)',
                fontSize: on ? 18 : 15, fontWeight: on ? 700 : 400,
                fontFamily: 'var(--bt-mono)',
                cursor: 'pointer', transition: 'all 0.1s',
                WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
              }}
            >
              {fret}
            </button>
          )
        })}
      </div>
    </div>
  )
}
