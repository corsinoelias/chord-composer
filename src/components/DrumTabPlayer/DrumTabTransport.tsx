import React, { useEffect, useRef } from 'react'
import {
  Play, Square, Repeat, Music2, Volume2, Undo2, Redo2, Minus, Plus,
  ChevronDown, ChevronUp,
} from 'lucide-react'
import { STEPS_PER_BEAT } from '../../lib/drumTab/types'
import { BT, f } from '../../lib/bassTab/theme'
import { BarLabel, IconButton } from './barControls'

/**
 * Playback. Anchored to the bottom of the app, so it stays under the pointer
 * whichever view is open and however far the grid has scrolled.
 *
 * Everything about *what* the pattern is — name, kit, view, share — moved to
 * `DrumTabTopBar`. This bar only ever changes how it is being played back.
 */

const MIN_BPM = 40
const MAX_BPM = 260
const MAX_BARS = 32

interface Props {
  isPlaying: boolean
  bpm: number
  loop: boolean
  metronome: boolean
  volume: number
  totalBars: number
  beatsPerBar: number
  currentBeat: number
  canUndo: boolean
  canRedo: boolean
  /**
   * Phone: only Play, BPM and the position stay on the bar; bars, loop,
   * metronome, undo/redo and volume fold away behind the chevron. Same shape
   * and same prop names as `BassTabTransport`, so the site's two transports
   * behave alike.
   */
  compact?: boolean
  onToggleExpand?: () => void
  onTogglePlay: () => void
  onBpmChange: (bpm: number) => void
  onLoopChange: (loop: boolean) => void
  onMetronomeChange: (on: boolean) => void
  onVolumeChange: (v: number) => void
  onTotalBarsChange: (bars: number) => void
  onUndo: () => void
  onRedo: () => void
}

/** `bar.beat.sixteenth`, 1-indexed — how a drummer counts, and how a DAW reads. */
function positionLabel(currentBeat: number, beatsPerBar: number): string {
  const slot = Math.max(0, Math.floor(currentBeat * STEPS_PER_BEAT + 1e-6))
  const slotsPerBar = beatsPerBar * STEPS_PER_BEAT
  const bar = Math.floor(slot / slotsPerBar) + 1
  const beat = Math.floor((slot % slotsPerBar) / STEPS_PER_BEAT) + 1
  const sub = (slot % STEPS_PER_BEAT) + 1
  return `${bar}.${beat}.${sub}`
}

export function DrumTabTransport({
  isPlaying, bpm, loop, metronome, volume, totalBars, beatsPerBar, currentBeat,
  canUndo, canRedo,
  compact = false, onToggleExpand,
  onTogglePlay, onBpmChange, onLoopChange, onMetronomeChange,
  onVolumeChange, onTotalBarsChange, onUndo, onRedo,
}: Props) {
  const readout: React.CSSProperties = {
    fontFamily: f('mono'), fontSize: 13, fontVariantNumeric: 'tabular-nums',
    padding: '5px 9px', borderRadius: 7,
    border: '1px solid ' + BT.panelRule, background: BT.panel2, color: BT.panelInk,
    textAlign: 'center',
  }

  // Whether the secondary controls get their own folding row at all. The player
  // passes `onToggleExpand` only on a phone; everywhere else they stay inline.
  const foldable = onToggleExpand !== undefined

  /**
   * `max-height: 0` clips the folded row but leaves what is inside it focusable,
   * so a keyboard user tabs into a volume slider that is nowhere on screen.
   * `inert` fixes that; it is set on the node rather than passed as a prop
   * because React 18 does not type it.
   */
  const foldRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = foldRef.current
    if (!el) return
    if (compact) el.setAttribute('inert', '')
    else el.removeAttribute('inert')
  }, [compact])

  const bars = (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <BarLabel tone="dark">Bars</BarLabel>
        <IconButton onClick={() => onTotalBarsChange(totalBars - 1)} disabled={totalBars <= 1} title="Remove a bar">
          <Minus size={15} />
        </IconButton>
        <span style={{
          minWidth: 20, textAlign: 'center', color: BT.panelInk,
          fontFamily: f('mono'), fontSize: 13, fontVariantNumeric: 'tabular-nums',
        }}>
          {totalBars}
        </span>
        <IconButton onClick={() => onTotalBarsChange(totalBars + 1)} disabled={totalBars >= MAX_BARS} title="Add a bar">
          <Plus size={15} />
        </IconButton>
      </div>
  )

  const toggles = (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <IconButton onClick={() => onLoopChange(!loop)} active={loop} title="Loop">
          <Repeat size={16} />
        </IconButton>
        <IconButton onClick={() => onMetronomeChange(!metronome)} active={metronome} title="Metronome">
          <Music2 size={16} />
        </IconButton>
        <IconButton onClick={onUndo} disabled={!canUndo} title="Undo">
          <Undo2 size={16} />
        </IconButton>
        <IconButton onClick={onRedo} disabled={!canRedo} title="Redo">
          <Redo2 size={16} />
        </IconButton>
      </div>
  )

  const volumeControl = (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Volume2 size={15} style={{ color: '#9d978c' }} aria-hidden="true" />
        <input
          type="range"
          min={0} max={1} step={0.02}
          value={volume}
          onChange={e => onVolumeChange(Number(e.target.value))}
          aria-label="Volume"
          style={{ width: 88, accentColor: BT.accent, cursor: 'pointer' }}
        />
      </div>
  )

  return (
    <div style={{
      flexShrink: 0, background: BT.panel, borderTop: '1px solid ' + BT.panelRule,
    }}>
    <div style={{
      padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 14,
      flexWrap: foldable ? 'nowrap' : 'wrap',
    }}>
      <button
        type="button"
        onClick={onTogglePlay}
        aria-label={isPlaying ? 'Stop' : 'Play'}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '9px 18px', borderRadius: 10, border: 'none', cursor: 'pointer',
          background: isPlaying ? BT.danger : BT.accent, color: '#fff',
          fontFamily: f('ui'), fontSize: 14, fontWeight: 700,
        }}
      >
        {isPlaying ? <Square size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
        {isPlaying ? 'Stop' : 'Play'}
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <BarLabel tone="dark">BPM</BarLabel>
        <input
          type="number"
          min={MIN_BPM}
          max={MAX_BPM}
          value={bpm}
          onChange={e => {
            const n = Number(e.target.value)
            if (Number.isFinite(n)) onBpmChange(Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(n))))
          }}
          aria-label="Tempo in beats per minute"
          style={{ ...readout, width: 62 }}
        />
      </div>

      {!foldable && bars}
      {!foldable && toggles}

      <div style={{ flex: 1, minWidth: 8 }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <BarLabel tone="dark">Pos</BarLabel>
        <span
          style={{ ...readout, minWidth: 76 }}
          aria-live="off"
          title="Bar . beat . sixteenth"
        >
          {positionLabel(currentBeat, beatsPerBar)}
        </span>
      </div>

      {!foldable && volumeControl}

      {foldable && (
        <IconButton
          onClick={onToggleExpand!}
          active={!compact}
          title={compact ? 'More controls' : 'Fewer controls'}
        >
          {compact ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </IconButton>
      )}
    </div>

    {foldable && (
      <div ref={foldRef} style={{
        overflow: 'hidden',
        maxHeight: compact ? 0 : 200,
        transition: 'max-height .22s ease',
      }}>
        <div style={{
          padding: '0 14px 10px', display: 'flex', alignItems: 'center',
          gap: 14, flexWrap: 'wrap',
        }}>
          {bars}
          {toggles}
          {volumeControl}
        </div>
      </div>
    )}
    </div>
  )
}
