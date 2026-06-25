import React, { useRef, useCallback, useState } from 'react'
import type { LoopRange } from '../../lib/guitarTab/types'

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
  const curBar     = Math.floor(currentBeat / beatsPerBar) + 1
  const curBeat    = Math.floor(currentBeat % beatsPerBar) + 1
  const loopInPct  = loopRange ? pctOf(loopRange.startBeat) : null
  const loopOutPct = loopRange ? pctOf(loopRange.endBeat)   : null

  return (
    <div
      ref={railRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onContextMenu={handleContextMenu}
      style={{ position: 'relative', height: 22, background: '#e2e8f0', borderBottom: '1px solid #e2e8f0', cursor: hoverTarget ? 'ew-resize' : 'pointer', userSelect: 'none', touchAction: 'none', flexShrink: 0 }}
    >
      {/* Beat markers */}
      {Array.from({ length: totalBars * beatsPerBar - 1 }, (_, i) => {
        const isBar = (i + 1) % beatsPerBar === 0
        if (isBar) return null
        return <div key={i} style={{ position: 'absolute', top: 5, bottom: 5, left: `${((i + 1) / (totalBars * beatsPerBar)) * 100}%`, width: 1, background: '#f1f5f9', pointerEvents: 'none' }} />
      })}
      {/* Bar markers */}
      {Array.from({ length: totalBars - 1 }, (_, i) => (
        <div key={i} style={{ position: 'absolute', top: 0, bottom: 0, left: `${((i + 1) * beatsPerBar / totalBeats) * 100}%`, width: 1, background: '#cbd5e1', pointerEvents: 'none' }} />
      ))}
      {/* Loop fill */}
      {loopRange && loopInPct !== null && loopOutPct !== null && (
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${loopInPct}%`, width: `${loopOutPct - loopInPct}%`, background: 'rgba(124,58,237,0.12)', pointerEvents: 'none' }} />
      )}
      {/* Progress fill */}
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${pct}%`, background: isPlaying ? '#7c3aed' : '#a78bfa', opacity: isPlaying ? 0.5 : 0.35, pointerEvents: 'none' }} />
      {/* Loop IN handle */}
      {loopRange && loopInPct !== null && (
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${loopInPct}%`, width: 2, background: hoverTarget === 'loopIn' ? '#f59e0b' : '#d97706', transform: 'translateX(-1px)', pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 10, height: 8, background: hoverTarget === 'loopIn' ? '#f59e0b' : '#d97706', borderRadius: '0 0 3px 3px' }} />
        </div>
      )}
      {/* Loop OUT handle */}
      {loopRange && loopOutPct !== null && (
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${loopOutPct}%`, width: 2, background: hoverTarget === 'loopOut' ? '#22c55e' : '#16a34a', transform: 'translateX(-1px)', pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 10, height: 8, background: hoverTarget === 'loopOut' ? '#22c55e' : '#16a34a', borderRadius: '0 0 3px 3px' }} />
        </div>
      )}
      {/* Scrubber handle */}
      <div style={{ position: 'absolute', top: '50%', left: `${pct}%`, transform: 'translate(-50%, -50%)', width: 10, height: 10, borderRadius: '50%', background: isPlaying ? '#7c3aed' : '#94a3b8', border: '2px solid #ffffff', pointerEvents: 'none', boxShadow: isPlaying ? '0 0 5px rgba(124,58,237,0.6)' : 'none', transition: 'background 0.15s' }} />
      {/* Label */}
      <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 9, fontFamily: 'ui-monospace, monospace', color: '#64748b', pointerEvents: 'none', letterSpacing: '0.04em' }}>
        {loopRange
          ? `${Math.floor(loopRange.startBeat / beatsPerBar) + 1}–${Math.ceil(loopRange.endBeat / beatsPerBar)} · ${curBar}:${curBeat}`
          : `${curBar}/${totalBars} · ${curBeat}`
        }
      </span>
    </div>
  )
}
