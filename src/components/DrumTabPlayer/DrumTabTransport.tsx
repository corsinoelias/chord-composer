import React from 'react'
import {
  Play, Square, Repeat, Music2, Volume2, Undo2, Redo2,
  Library, Share2, Trash2, Minus, Plus,
} from 'lucide-react'
import type { DrumKitId, DrumView } from '../../lib/drumTab/types'
import { BT, alpha, f } from '../../lib/bassTab/theme'

const MIN_BPM = 40
const MAX_BPM = 260

interface Props {
  isPlaying: boolean
  bpm: number
  kit: DrumKitId
  loop: boolean
  metronome: boolean
  volume: number
  view: DrumView
  totalBars: number
  canUndo: boolean
  canRedo: boolean
  trackName: string
  shareLabel: string
  onTogglePlay: () => void
  onBpmChange: (bpm: number) => void
  onKitChange: (kit: DrumKitId) => void
  onLoopChange: (loop: boolean) => void
  onMetronomeChange: (on: boolean) => void
  onVolumeChange: (v: number) => void
  onViewChange: (view: DrumView) => void
  onTotalBarsChange: (bars: number) => void
  onUndo: () => void
  onRedo: () => void
  onOpenLibrary: () => void
  onShare: () => void
  onClear: () => void
  onNameChange: (name: string) => void
}

const VIEWS: { id: DrumView; label: string }[] = [
  { id: 'score', label: 'Notation' },
  { id: 'grid',  label: 'Grid' },
  { id: 'text',  label: 'Text' },
]

const KITS: { id: DrumKitId; label: string }[] = [
  { id: 'acoustic',   label: 'Acoustic' },
  { id: 'electronic', label: 'Electronic' },
]

function IconButton({
  onClick, disabled, active, title, children,
}: {
  onClick: () => void
  disabled?: boolean
  active?: boolean
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={active}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 34, height: 34, borderRadius: 8,
        border: '1px solid ' + (active ? BT.accent : BT.panelRule),
        background: active ? alpha('accent', 0.22) : 'transparent',
        color: disabled ? BT.dim : BT.panelInk,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {children}
    </button>
  )
}

function Segmented<T extends string>({
  options, value, onChange, ariaLabel,
}: {
  options: { id: T; label: string }[]
  value: T
  onChange: (v: T) => void
  ariaLabel: string
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      style={{
        display: 'inline-flex', padding: 2, gap: 2, borderRadius: 9,
        background: BT.panel2, border: '1px solid ' + BT.panelRule,
      }}
    >
      {options.map(opt => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          aria-pressed={value === opt.id}
          style={{
            padding: '5px 12px', borderRadius: 7, border: 'none', cursor: 'pointer',
            background: value === opt.id ? BT.accent : 'transparent',
            color: value === opt.id ? '#fff' : BT.panelInk,
            fontFamily: f('ui'), fontSize: 12, fontWeight: 600,
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

export function DrumTabTransport({
  isPlaying, bpm, kit, loop, metronome, volume, view, totalBars,
  canUndo, canRedo, trackName, shareLabel,
  onTogglePlay, onBpmChange, onKitChange, onLoopChange, onMetronomeChange,
  onVolumeChange, onViewChange, onTotalBarsChange, onUndo, onRedo,
  onOpenLibrary, onShare, onClear, onNameChange,
}: Props) {
  const labelStyle: React.CSSProperties = {
    fontFamily: f('ui'), fontSize: 11, fontWeight: 600,
    color: BT.dim, textTransform: 'uppercase', letterSpacing: '.06em',
  }

  return (
    <div style={{
      background: BT.panel, border: '1px solid ' + BT.panelRule, borderRadius: 12,
      padding: 12, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14,
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
        <span style={labelStyle}>BPM</span>
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
          style={{
            width: 62, padding: '5px 7px', borderRadius: 7,
            border: '1px solid ' + BT.panelRule, background: BT.panel2, color: BT.panelInk,
            fontFamily: f('mono'), fontSize: 13, fontVariantNumeric: 'tabular-nums',
          }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={labelStyle}>Bars</span>
        <IconButton onClick={() => onTotalBarsChange(totalBars - 1)} disabled={totalBars <= 1} title="Remove a bar">
          <Minus size={15} />
        </IconButton>
        <span style={{
          minWidth: 20, textAlign: 'center', color: BT.panelInk,
          fontFamily: f('mono'), fontSize: 13, fontVariantNumeric: 'tabular-nums',
        }}>
          {totalBars}
        </span>
        <IconButton onClick={() => onTotalBarsChange(totalBars + 1)} disabled={totalBars >= 32} title="Add a bar">
          <Plus size={15} />
        </IconButton>
      </div>

      <Segmented options={KITS} value={kit} onChange={onKitChange} ariaLabel="Drum kit" />

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

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Volume2 size={15} style={{ color: BT.dim }} aria-hidden="true" />
        <input
          type="range"
          min={0} max={1} step={0.02}
          value={volume}
          onChange={e => onVolumeChange(Number(e.target.value))}
          aria-label="Volume"
          style={{ width: 78, accentColor: BT.accent, cursor: 'pointer' }}
        />
      </div>

      <div style={{ flex: 1, minWidth: 12 }} />

      <input
        value={trackName}
        onChange={e => onNameChange(e.target.value)}
        aria-label="Pattern name"
        placeholder="Untitled groove"
        style={{
          width: 150, padding: '5px 9px', borderRadius: 7,
          border: '1px solid ' + BT.panelRule, background: BT.panel2, color: BT.panelInk,
          fontFamily: f('ui'), fontSize: 13, fontWeight: 600,
        }}
      />

      <Segmented options={VIEWS} value={view} onChange={onViewChange} ariaLabel="View" />

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <IconButton onClick={onOpenLibrary} title="Rhythm library">
          <Library size={16} />
        </IconButton>
        <IconButton onClick={onShare} title={shareLabel}>
          <Share2 size={16} />
        </IconButton>
        <IconButton onClick={onClear} title="Clear all hits">
          <Trash2 size={16} />
        </IconButton>
      </div>
    </div>
  )
}
