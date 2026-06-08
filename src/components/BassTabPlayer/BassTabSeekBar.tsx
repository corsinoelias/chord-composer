import React, { useRef, useCallback } from 'react'

interface SeekBarProps {
  currentBeat:  number
  totalBeats:   number
  beatsPerBar:  number
  isPlaying:    boolean
  onSeek:       (beat: number) => void
}

const C = {
  bg:       'hsl(224 22% 8%)',
  track:    'hsl(224 15% 14%)',
  fill:     'hsl(262 70% 50%)',
  fillPlay: 'hsl(262 83% 60%)',
  barMark:  'hsl(224 15% 22%)',
  beatMark: 'hsl(224 15% 16%)',
  handle:   'hsl(262 83% 72%)',
  label:    'hsl(220 10% 38%)',
  border:   'hsl(224 15% 18%)',
}

export function BassTabSeekBar({
  currentBeat, totalBeats, beatsPerBar, isPlaying, onSeek,
}: SeekBarProps) {
  const railRef    = useRef<HTMLDivElement>(null)
  const dragging   = useRef(false)

  const beatAt = useCallback((clientX: number): number => {
    const rail = railRef.current
    if (!rail) return 0
    const { left, width } = rail.getBoundingClientRect()
    const t = Math.max(0, Math.min(1, (clientX - left) / width))
    // Snap to nearest half-beat for comfortable precision
    return Math.round(t * totalBeats * 2) / 2
  }, [totalBeats])

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragging.current = true
    onSeek(beatAt(e.clientX))
  }, [beatAt, onSeek])

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return
    onSeek(beatAt(e.clientX))
  }, [beatAt, onSeek])

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = false
    e.currentTarget.releasePointerCapture(e.pointerId)
  }, [])

  const pct        = totalBeats > 0 ? Math.min(100, (currentBeat / totalBeats) * 100) : 0
  const totalBars  = Math.ceil(totalBeats / beatsPerBar)
  const curBar     = Math.floor(currentBeat / beatsPerBar) + 1
  const curBeat    = Math.floor(currentBeat % beatsPerBar) + 1

  return (
    <div
      ref={railRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
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

      {/* Progress fill */}
      <div style={{
        position:   'absolute',
        top: 0, bottom: 0, left: 0,
        width:      `${pct}%`,
        background: isPlaying ? C.fillPlay : C.fill,
        opacity:    isPlaying ? 0.55 : 0.4,
        pointerEvents: 'none',
      }} />

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
        position:    'absolute',
        right:       8,
        top:         '50%',
        transform:   'translateY(-50%)',
        fontSize:    9,
        fontFamily:  'ui-monospace, monospace',
        color:       C.label,
        pointerEvents: 'none',
        letterSpacing: '0.04em',
      }}>
        {curBar}/{totalBars} · {curBeat}
      </span>
    </div>
  )
}
