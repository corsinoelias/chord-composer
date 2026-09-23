import React, { useRef, useCallback, useState } from 'react'
import type { LoopRange } from '../../lib/guitarTab/types'
import { T } from './theme'

interface SeekBarProps {
  currentBeat:        number
  totalBeats:         number
  beatsPerBar:        number
  isPlaying:          boolean
  onSeek:             (beat: number) => void
  loopRange?:         LoopRange | null
  onLoopRangeChange?: (range: LoopRange | null) => void
}

type DragTarget  = 'seek' | 'loopIn' | 'loopOut' | null
type HoverTarget = 'loopIn' | 'loopOut' | null

export function GuitarSeekBar({
  currentBeat, totalBeats, beatsPerBar, isPlaying, onSeek,
  loopRange = null, onLoopRangeChange,
}: SeekBarProps) {
  const railRef    = useRef<HTMLDivElement>(null)
  const dragTarget = useRef<DragTarget>(null)
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
    if (loopRange && onLoopRangeChange) {
      const rail = railRef.current
      if (rail) {
        const { left, width } = rail.getBoundingClientRect()
        const inPx  = left + (loopRange.startBeat / totalBeats) * width
        const outPx = left + (loopRange.endBeat   / totalBeats) * width
        if (Math.abs(e.clientX - inPx) <= 16)  { dragTarget.current = 'loopIn';  return }
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
      onLoopRangeChange({ ...loopRange, startBeat: Math.max(0, Math.min(loopRange.endBeat - 1, beat)) })
    } else if (dragTarget.current === 'loopOut' && loopRange && onLoopRangeChange) {
      onLoopRangeChange({ ...loopRange, endBeat: Math.max(loopRange.startBeat + 1, Math.min(totalBeats, beat)) })
    } else if (!dragTarget.current && loopRange) {
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

  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!onLoopRangeChange) return
    e.preventDefault()
    const beat = beatAt(e.clientX)
    if (!loopRange) {
      onLoopRangeChange({ startBeat: 0, endBeat: totalBeats / 2 })
    } else {
      const mid = (loopRange.startBeat + loopRange.endBeat) / 2
      if (beat < mid) onLoopRangeChange({ ...loopRange, startBeat: Math.max(0, beat) })
      else            onLoopRangeChange({ ...loopRange, endBeat: Math.min(totalBeats, beat) })
    }
  }, [beatAt, loopRange, onLoopRangeChange, totalBeats])

  const pct        = pctOf(currentBeat)
  const totalBars  = Math.ceil(totalBeats / beatsPerBar)
  const loopInPct  = loopRange ? pctOf(loopRange.startBeat) : null
  const loopOutPct = loopRange ? pctOf(loopRange.endBeat)   : null

  // The hit area is 22 px tall; the rail drawn inside it is 6. Loop handles span the
  // whole hit area so they stay easy to grab.
  return (
    <div
      ref={railRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onContextMenu={handleContextMenu}
      title="Click to seek · right-click to set the loop range"
      style={{ position: 'relative', flex: 1, minWidth: 0, height: 22, cursor: hoverTarget ? 'ew-resize' : 'pointer', userSelect: 'none', touchAction: 'none' }}
    >
      <div style={{ position: 'absolute', left: 0, right: 0, top: 8, height: 6, borderRadius: 999, background: T.well, overflow: 'hidden', pointerEvents: 'none' }}>
        {/* Loop fill */}
        {loopRange && loopInPct !== null && loopOutPct !== null && (
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${loopInPct}%`, width: `${loopOutPct - loopInPct}%`, background: 'rgba(217,119,6,0.18)' }} />
        )}
        {/* Progress fill */}
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${pct}%`, borderRadius: 999, background: T.accent }} />
        {/* Bar ticks */}
        {Array.from({ length: totalBars - 1 }, (_, i) => (
          <div key={i} style={{ position: 'absolute', top: 0, bottom: 0, left: `${((i + 1) * beatsPerBar / totalBeats) * 100}%`, width: 2, background: T.bg }} />
        ))}
      </div>
      {/* Loop IN handle */}
      {loopRange && loopInPct !== null && (
        <div style={{ position: 'absolute', top: 2, bottom: 2, left: `${loopInPct}%`, width: 3, borderRadius: 2, background: hoverTarget === 'loopIn' ? '#f59e0b' : '#d97706', transform: 'translateX(-1.5px)', pointerEvents: 'none' }} />
      )}
      {/* Loop OUT handle */}
      {loopRange && loopOutPct !== null && (
        <div style={{ position: 'absolute', top: 2, bottom: 2, left: `${loopOutPct}%`, width: 3, borderRadius: 2, background: hoverTarget === 'loopOut' ? '#22c55e' : '#16a34a', transform: 'translateX(-1.5px)', pointerEvents: 'none' }} />
      )}
      {/* Scrubber */}
      <div style={{ position: 'absolute', top: '50%', left: `${pct}%`, width: 12, height: 12, margin: '-6px 0 0 -6px', borderRadius: '50%', background: '#ffffff', border: `1px solid ${T.borderStrong}`, boxShadow: `0 0 0 3px ${T.accentRing}`, pointerEvents: 'none', opacity: isPlaying || pct > 0 ? 1 : 0.9 }} />
    </div>
  )
}
