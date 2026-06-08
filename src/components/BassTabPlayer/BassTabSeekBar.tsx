import React, { useRef, useCallback } from 'react'
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
  bg:        'hsl(224 22% 8%)',
  track:     'hsl(224 15% 14%)',
  fill:      'hsl(262 70% 50%)',
  fillPlay:  'hsl(262 83% 60%)',
  barMark:   'hsl(224 15% 22%)',
  beatMark:  'hsl(224 15% 16%)',
  handle:    'hsl(262 83% 72%)',
  label:     'hsl(220 10% 38%)',
  border:    'hsl(224 15% 18%)',
  loopFill:  'hsl(38 80% 50% / 0.18)',
  loopIn:    'hsl(38 80% 55%)',
  loopOut:   'hsl(142 60% 45%)',
}

type DragTarget = 'seek' | 'loopIn' | 'loopOut' | null

export function BassTabSeekBar({
  currentBeat, totalBeats, beatsPerBar, isPlaying, onSeek,
  loopRange = null, onLoopRangeChange,
}: SeekBarProps) {
  const railRef      = useRef<HTMLDivElement>(null)
  const dragTarget   = useRef<DragTarget>(null)

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

    // Check if near a loop handle (within 10px)
    if (loopRange && onLoopRangeChange) {
      const rail = railRef.current
      if (rail) {
        const { left, width } = rail.getBoundingClientRect()
        const inPx  = left + (loopRange.startBeat / totalBeats) * width
        const outPx = left + (loopRange.endBeat   / totalBeats) * width
        if (Math.abs(e.clientX - inPx) <= 10) { dragTarget.current = 'loopIn';  return }
        if (Math.abs(e.clientX - outPx) <= 10) { dragTarget.current = 'loopOut'; return }
      }
    }

    dragTarget.current = 'seek'
    onSeek(beatAt(e.clientX))
  }, [beatAt, onSeek, loopRange, totalBeats, onLoopRangeChange])

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragTarget.current) return
    const beat = beatAt(e.clientX)

    if (dragTarget.current === 'seek') {
      onSeek(beat)
    } else if (dragTarget.current === 'loopIn' && loopRange && onLoopRangeChange) {
      const clamped = Math.max(0, Math.min(loopRange.endBeat - 1, beat))
      onLoopRangeChange({ ...loopRange, startBeat: clamped })
    } else if (dragTarget.current === 'loopOut' && loopRange && onLoopRangeChange) {
      const clamped = Math.max(loopRange.startBeat + 1, Math.min(totalBeats, beat))
      onLoopRangeChange({ ...loopRange, endBeat: clamped })
    }
  }, [beatAt, onSeek, loopRange, onLoopRangeChange, totalBeats])

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragTarget.current = null
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
        height:      18,
        background:  C.track,
        borderBottom: `1px solid ${C.border}`,
        cursor:      'pointer',
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
          title="Loop in (drag or right-click)"
          style={{
            position: 'absolute', top: 0, bottom: 0,
            left: `${loopInPct}%`,
            width: 3, background: C.loopIn,
            cursor: 'ew-resize', pointerEvents: 'none',
          }}
        >
          <div style={{
            position: 'absolute', top: 0, left: 0,
            width: 0, height: 0,
            borderLeft: '5px solid transparent',
            borderRight: '5px solid transparent',
            borderTop: `7px solid ${C.loopIn}`,
            transform: 'translateX(-3px)',
          }} />
        </div>
      )}

      {/* Loop OUT handle */}
      {loopRange && loopOutPct !== null && (
        <div
          title="Loop out (drag or right-click)"
          style={{
            position: 'absolute', top: 0, bottom: 0,
            left: `${loopOutPct}%`,
            width: 3, background: C.loopOut,
            cursor: 'ew-resize', pointerEvents: 'none',
          }}
        >
          <div style={{
            position: 'absolute', top: 0, right: 0,
            width: 0, height: 0,
            borderLeft: '5px solid transparent',
            borderRight: '5px solid transparent',
            borderTop: `7px solid ${C.loopOut}`,
            transform: 'translateX(2px)',
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
        background:   isPlaying ? C.handle : 'hsl(220 14% 55%)',
        border:       '2px solid hsl(224 22% 8%)',
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
