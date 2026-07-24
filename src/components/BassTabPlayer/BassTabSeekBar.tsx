import React, { useRef, useCallback, useState } from 'react'
import type { LoopRange } from '../../lib/bassTab/types'

interface SeekBarProps {
  currentBeat:         number
  totalBeats:          number
  beatsPerBar:         number
  isPlaying:           boolean
  onSeek:              (beat: number) => void
  loopRange?:          LoopRange | null
  onLoopRangeChange?:  (range: LoopRange | null) => void
}

const C = {
  bg:        'var(--bt-paper)',
  track:     'var(--bt-card)',
  fill:      'var(--bt-accent)',
  fillPlay:  'var(--bt-accent)',
  barMark:   'var(--bt-rule)',
  beatMark:  'var(--bt-rule)',
  handle:    'var(--bt-accent)',
  label:     'var(--bt-dim)',
  border:    'var(--bt-rule)',
  loopFill:  'var(--bt-warn-wash)',
  loopIn:    'var(--bt-warn)',
  loopOut:   'var(--bt-ok)',
}

type DragTarget = 'seek' | 'loopIn' | 'loopOut' | null
type HoverTarget = 'loopIn' | 'loopOut' | null

export function BassTabSeekBar({
  currentBeat, totalBeats, beatsPerBar, isPlaying, onSeek,
  loopRange = null, onLoopRangeChange,
}: SeekBarProps) {
  const railRef      = useRef<HTMLDivElement>(null)
  const dragTarget   = useRef<DragTarget>(null)
  const [hoverTarget, setHoverTarget] = useState<HoverTarget>(null)

  const beatAt = useCallback((clientX: number): number => {
    const rail = railRef.current
    if (!rail) return 0
    const { left, width } = rail.getBoundingClientRect()
    const t = Math.max(0, Math.min(1, (clientX - left) / width))
    return Math.round(t * totalBeats * 2) / 2
  }, [totalBeats])

  const pctOf = (beat: number) => totalBeats > 0 ? Math.min(100, (beat / totalBeats) * 100) : 0

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)

    // Check if near a loop handle (within 16px)
    if (loopRange && onLoopRangeChange) {
      const rail = railRef.current
      if (rail) {
        const { left, width } = rail.getBoundingClientRect()
        const inPx  = left + (loopRange.startBeat / totalBeats) * width
        const outPx = left + (loopRange.endBeat   / totalBeats) * width
        if (Math.abs(e.clientX - inPx) <= 16) { dragTarget.current = 'loopIn';  return }
        if (Math.abs(e.clientX - outPx) <= 16) { dragTarget.current = 'loopOut'; return }
      }
    }

    dragTarget.current = 'seek'
    onSeek(beatAt(e.clientX))
  }, [beatAt, onSeek, loopRange, totalBeats, onLoopRangeChange])

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const beat = beatAt(e.clientX)

    if (dragTarget.current === 'seek') {
      onSeek(beat)
    } else if (dragTarget.current === 'loopIn' && loopRange && onLoopRangeChange) {
      const clamped = Math.max(0, Math.min(loopRange.endBeat - 1, beat))
      onLoopRangeChange({ ...loopRange, startBeat: clamped })
    } else if (dragTarget.current === 'loopOut' && loopRange && onLoopRangeChange) {
      const clamped = Math.max(loopRange.startBeat + 1, Math.min(totalBeats, beat))
      onLoopRangeChange({ ...loopRange, endBeat: clamped })
    } else if (!dragTarget.current && loopRange) {
      // Update hover target for cursor feedback
      const rail = railRef.current
      if (rail) {
        const { left, width } = rail.getBoundingClientRect()
        const inPx  = left + (loopRange.startBeat / totalBeats) * width
        const outPx = left + (loopRange.endBeat   / totalBeats) * width
        if (Math.abs(e.clientX - inPx) <= 16)       setHoverTarget('loopIn')
        else if (Math.abs(e.clientX - outPx) <= 16) setHoverTarget('loopOut')
        else                                         setHoverTarget(null)
      }
    }
  }, [beatAt, onSeek, loopRange, onLoopRangeChange, totalBeats])

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragTarget.current = null
    setHoverTarget(null)
    e.currentTarget.releasePointerCapture(e.pointerId)
  }, [])

  // Right-click: set loop range or clear it
  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!onLoopRangeChange) return
    e.preventDefault()
    const beat = beatAt(e.clientX)
    if (!loopRange) {
      const half = totalBeats / 2
      onLoopRangeChange({ startBeat: 0, endBeat: half })
    } else {
      // Right-click on left half → set loop in, right half → set loop out
      const midLoop = (loopRange.startBeat + loopRange.endBeat) / 2
      if (beat < midLoop) {
        onLoopRangeChange({ ...loopRange, startBeat: Math.max(0, beat) })
      } else {
        onLoopRangeChange({ ...loopRange, endBeat: Math.min(totalBeats, beat) })
      }
    }
  }, [beatAt, loopRange, onLoopRangeChange, totalBeats])

  const pct       = pctOf(currentBeat)
  const totalBars = Math.ceil(totalBeats / beatsPerBar)
  const curBar    = Math.floor(currentBeat / beatsPerBar) + 1
  const curBeat   = Math.floor(currentBeat % beatsPerBar) + 1

  const loopInPct  = loopRange ? pctOf(loopRange.startBeat)  : null
  const loopOutPct = loopRange ? pctOf(loopRange.endBeat) : null

  return (
    <div
      ref={railRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onContextMenu={handleContextMenu}
      style={{
        position:    'relative',
        height:      22,
        background:  C.track,
        borderBottom: `1px solid ${C.border}`,
        cursor:      hoverTarget ? 'ew-resize' : 'pointer',
        userSelect:  'none',
        touchAction: 'none',
        flexShrink:  0,
      }}
    >
      {/* Beat sub-markers */}
      {Array.from({ length: totalBars * beatsPerBar - 1 }, (_, i) => {
        const isBar = (i + 1) % beatsPerBar === 0
        if (isBar) return null
        return (
          <div key={i} style={{
            position: 'absolute', top: 4, bottom: 4,
            left: `${((i + 1) / (totalBars * beatsPerBar)) * 100}%`,
            width: 1, background: C.beatMark, pointerEvents: 'none',
          }} />
        )
      })}

      {/* Bar markers */}
      {Array.from({ length: totalBars - 1 }, (_, i) => (
        <div key={i} style={{
          position: 'absolute', top: 0, bottom: 0,
          left: `${((i + 1) * beatsPerBar / totalBeats) * 100}%`,
          width: 1, background: C.barMark, pointerEvents: 'none',
        }} />
      ))}

      {/* Loop range fill */}
      {loopRange && loopInPct !== null && loopOutPct !== null && (
        <div style={{
          position: 'absolute', top: 0, bottom: 0,
          left:  `${loopInPct}%`,
          width: `${loopOutPct - loopInPct}%`,
          background: C.loopFill,
          pointerEvents: 'none',
        }} />
      )}

      {/* Progress fill */}
      <div style={{
        position:  'absolute',
        top: 0, bottom: 0, left: 0,
        width:     `${pct}%`,
        background: isPlaying ? C.fillPlay : C.fill,
        opacity:   isPlaying ? 0.55 : 0.4,
        pointerEvents: 'none',
      }} />

      {/* Loop IN handle */}
      {loopRange && loopInPct !== null && (
        <div
          title="Loop start — drag to adjust"
          style={{
            position: 'absolute', top: 0, bottom: 0,
            left: `${loopInPct}%`,
            width: 2,
            background: hoverTarget === 'loopIn' ? 'var(--bt-warn)' : C.loopIn,
            transform: 'translateX(-1px)',
            pointerEvents: 'none',
            transition: 'background 0.1s',
          }}
        >
          {/* Grab tab at top */}
          <div style={{
            position: 'absolute', top: 0, left: '50%',
            transform: 'translateX(-50%)',
            width: 10, height: 8,
            background: hoverTarget === 'loopIn' ? 'var(--bt-warn)' : C.loopIn,
            borderRadius: '0 0 3px 3px',
            transition: 'background 0.1s',
          }} />
        </div>
      )}

      {/* Loop OUT handle */}
      {loopRange && loopOutPct !== null && (
        <div
          title="Loop end — drag to adjust"
          style={{
            position: 'absolute', top: 0, bottom: 0,
            left: `${loopOutPct}%`,
            width: 2,
            background: hoverTarget === 'loopOut' ? 'var(--bt-ok)' : C.loopOut,
            transform: 'translateX(-1px)',
            pointerEvents: 'none',
            transition: 'background 0.1s',
          }}
        >
          {/* Grab tab at top */}
          <div style={{
            position: 'absolute', top: 0, left: '50%',
            transform: 'translateX(-50%)',
            width: 10, height: 8,
            background: hoverTarget === 'loopOut' ? 'var(--bt-ok)' : C.loopOut,
            borderRadius: '0 0 3px 3px',
            transition: 'background 0.1s',
          }} />
        </div>
      )}

      {/* Scrubber handle */}
      <div style={{
        position:     'absolute',
        top:          '50%',
        left:         `${pct}%`,
        transform:    'translate(-50%, -50%)',
        width:        10,
        height:       10,
        borderRadius: '50%',
        background:   isPlaying ? C.handle : 'var(--bt-muted)',
        border:       '2px solid var(--bt-paper)',
        pointerEvents: 'none',
        boxShadow:    isPlaying ? `0 0 5px ${C.handle}88` : 'none',
        transition:   'background 0.15s',
      }} />

      {/* Position label */}
      <span style={{
        position:   'absolute',
        right:      8,
        top:        '50%',
        transform:  'translateY(-50%)',
        fontSize:   9,
        fontFamily: 'ui-monospace, monospace',
        color:      C.label,
        pointerEvents: 'none',
        letterSpacing: '0.04em',
      }}>
        {loopRange
          ? `${Math.floor(loopRange.startBeat / beatsPerBar) + 1}–${Math.ceil(loopRange.endBeat / beatsPerBar)} · ${curBar}:${curBeat}`
          : `${curBar}/${totalBars} · ${curBeat}`
        }
      </span>
    </div>
  )
}
