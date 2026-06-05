import React from 'react'
import {
  Play, Square, RotateCcw, Repeat, ZoomIn, ZoomOut,
  Undo2, Redo2, Trash2, Download, Share2, Bell, BellOff, Music,
} from 'lucide-react'
import { type BassSound, type SnapValue, SNAP_OPTIONS } from '../../lib/bassTab/types'

// ── Design tokens — dark surface matching the app's dark-mode palette ─────
const T = {
  bg:      'hsl(224 20% 11%)',
  surface: 'hsl(224 18% 17%)',
  surfaceHov: 'hsl(224 18% 23%)',
  border:  'hsl(224 15% 22%)',
  text:    'hsl(220 14% 82%)',
  muted:   'hsl(220 10% 50%)',
  primary: 'hsl(262 83% 58%)',
  primaryBg: 'hsl(262 60% 25%)',
  primaryText: 'hsl(262 80% 85%)',
  danger:  'hsl(0 72% 51%)',
  amber:   'hsl(38 92% 50%)',
  amberBg: 'hsl(38 60% 18%)',
}

const FONT = "'Inter', ui-sans-serif, system-ui, sans-serif"

interface TransportProps {
  isPlaying: boolean; loop: boolean; bpm: number
  snap: SnapValue; sound: BassSound; totalBars: number
  zoom: number; volume: number
  selectedNoteFret: number | null; hasSelectedNote: boolean
  canUndo: boolean; canRedo: boolean; metronome: boolean
  onPlay: () => void; onStop: () => void; onLoopToggle: () => void
  onBpmChange: (bpm: number) => void; onSnapChange: (snap: SnapValue) => void
  onSoundChange: (sound: BassSound) => void; onBarsChange: (bars: number) => void
  onZoomIn: () => void; onZoomOut: () => void
  onFretChange: (fret: number) => void; onVolumeChange: (vol: number) => void
  onUndo: () => void; onRedo: () => void; onClearAll: () => void
  onExportAscii: () => void; onExportMidi: () => void
  onShareUrl: () => void; onMetronomeToggle: () => void
}

export function BassTabTransport(props: TransportProps) {
  const {
    isPlaying, loop, bpm, snap, sound, totalBars, zoom, volume,
    selectedNoteFret, hasSelectedNote, canUndo, canRedo, metronome,
    onPlay, onStop, onLoopToggle, onBpmChange, onSnapChange, onSoundChange,
    onBarsChange, onZoomIn, onZoomOut, onFretChange, onVolumeChange,
    onUndo, onRedo, onClearAll, onExportAscii, onExportMidi, onShareUrl, onMetronomeToggle,
  } = props

  return (
    <div
      style={{
        background: T.bg,
        borderBottom: `1px solid ${T.border}`,
        fontFamily: FONT,
        flexShrink: 0,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 4,
        padding: '6px 12px',
        userSelect: 'none',
      }}
    >
      {/* ── Playback ──────────────────────────────────────────────────── */}
      <Group>
        <IconBtn
          onClick={isPlaying ? onStop : onPlay}
          title={isPlaying ? 'Stop (Space)' : 'Play (Space)'}
          active={isPlaying}
          activeBg={isPlaying ? T.danger : T.primary}
          size={34}
        >
          {isPlaying ? <Square size={14} /> : <Play size={14} />}
        </IconBtn>
        <IconBtn onClick={onStop} title="Reset">
          <RotateCcw size={13} />
        </IconBtn>
        <IconBtn
          onClick={onLoopToggle} title="Loop"
          active={loop} activeBg={T.primaryBg} activeColor={T.primaryText}
        >
          <Repeat size={13} />
        </IconBtn>
        <IconBtn
          onClick={onMetronomeToggle} title="Metronome click"
          active={metronome} activeBg={T.amberBg} activeColor={T.amber}
        >
          {metronome ? <Bell size={13} /> : <BellOff size={13} />}
        </IconBtn>
      </Group>

      <Divider />

      {/* ── History ───────────────────────────────────────────────────── */}
      <Group>
        <IconBtn onClick={onUndo} title="Undo (Ctrl+Z)" disabled={!canUndo}>
          <Undo2 size={13} />
        </IconBtn>
        <IconBtn onClick={onRedo} title="Redo (Ctrl+Y)" disabled={!canRedo}>
          <Redo2 size={13} />
        </IconBtn>
      </Group>

      <Divider />

      {/* ── Tempo ─────────────────────────────────────────────────────── */}
      <LabeledControl label="BPM">
        <NumInput
          value={bpm} min={40} max={240} width={52}
          onChange={v => onBpmChange(Math.max(40, Math.min(240, v)))}
        />
      </LabeledControl>

      {/* ── Snap ──────────────────────────────────────────────────────── */}
      <LabeledControl label="Snap">
        <StyledSelect value={snap} onChange={e => onSnapChange(Number(e.target.value) as SnapValue)} width={64}>
          {SNAP_OPTIONS.map(o => <option key={o.label} value={o.value}>{o.label}</option>)}
        </StyledSelect>
      </LabeledControl>

      {/* ── Sound ─────────────────────────────────────────────────────── */}
      <LabeledControl label="Sound">
        <StyledSelect value={sound} onChange={e => onSoundChange(e.target.value as BassSound)} width={80}>
          <option value="electric">Electric</option>
          <option value="picked">Picked</option>
          <option value="synth">Synth</option>
          <option value="slap">Slap</option>
        </StyledSelect>
      </LabeledControl>

      {/* ── Bars ──────────────────────────────────────────────────────── */}
      <LabeledControl label="Bars">
        <StyledSelect value={totalBars} onChange={e => onBarsChange(Number(e.target.value))} width={54}>
          {[2, 4, 8, 16, 32].map(b => <option key={b} value={b}>{b}</option>)}
        </StyledSelect>
      </LabeledControl>

      <Divider />

      {/* ── Volume ────────────────────────────────────────────────────── */}
      <LabeledControl label="Vol">
        <input
          type="range" min={0} max={1} step={0.01} value={volume}
          onChange={e => onVolumeChange(Number(e.target.value))}
          style={{ width: 68, accentColor: T.primary, cursor: 'pointer' }}
        />
      </LabeledControl>

      <Divider />

      {/* ── Zoom ──────────────────────────────────────────────────────── */}
      <Group>
        <span style={{ fontSize: 11, color: T.muted, minWidth: 34, textAlign: 'right' }}>
          {Math.round(zoom * 100)}%
        </span>
        <IconBtn onClick={onZoomOut} title="Zoom out" disabled={zoom <= 0.5}>
          <ZoomOut size={13} />
        </IconBtn>
        <IconBtn onClick={onZoomIn} title="Zoom in" disabled={zoom >= 4}>
          <ZoomIn size={13} />
        </IconBtn>
      </Group>

      {/* ── Fret editor (when note selected) ─────────────────────────── */}
      {hasSelectedNote && selectedNoteFret !== null && (
        <>
          <Divider />
          <LabeledControl label="Fret">
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <SmallBtn onClick={() => onFretChange(Math.max(0, selectedNoteFret - 1))}>−</SmallBtn>
              <NumInput
                value={selectedNoteFret} min={0} max={24} width={44}
                onChange={v => onFretChange(Math.max(0, Math.min(24, v)))}
              />
              <SmallBtn onClick={() => onFretChange(Math.min(24, selectedNoteFret + 1))}>+</SmallBtn>
            </div>
          </LabeledControl>
        </>
      )}

      {/* ── Actions (right-aligned) ───────────────────────────────────── */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
        <IconBtn onClick={onExportAscii} title="Copy ASCII tab">
          <Download size={13} />
        </IconBtn>
        <IconBtn onClick={onExportMidi} title="Download MIDI">
          <Music size={13} />
        </IconBtn>
        <IconBtn onClick={onShareUrl} title="Copy share URL">
          <Share2 size={13} />
        </IconBtn>
        <Divider />
        <IconBtn
          onClick={onClearAll} title="Clear all notes"
          hoverBg="hsl(0 60% 20%)" hoverColor={T.danger}
        >
          <Trash2 size={13} />
        </IconBtn>
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────

function Group({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>{children}</div>
}

function Divider() {
  return <div style={{ width: 1, height: 20, background: T.border, flexShrink: 0 }} />
}

function LabeledControl({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}>
      <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.muted, lineHeight: 1 }}>
        {label}
      </span>
      {children}
    </div>
  )
}

interface IconBtnProps {
  children: React.ReactNode
  onClick?: () => void
  title?: string
  disabled?: boolean
  active?: boolean
  activeBg?: string
  activeColor?: string
  hoverBg?: string
  hoverColor?: string
  size?: number
}

function IconBtn({ children, onClick, title, disabled, active, activeBg, activeColor, hoverBg, hoverColor, size = 30 }: IconBtnProps) {
  const [hov, setHov] = React.useState(false)
  const bg    = active ? (activeBg ?? T.primaryBg) : hov ? (hoverBg ?? T.surfaceHov) : T.surface
  const color = active ? (activeColor ?? T.primaryText) : hov ? (hoverColor ?? T.text) : T.muted

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: size, height: size,
        background: bg, color, border: 'none', borderRadius: 6,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.3 : 1,
        transition: 'background 0.1s, color 0.1s',
        fontFamily: 'inherit', flexShrink: 0,
      }}
    >
      {children}
    </button>
  )
}

function SmallBtn({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  const [hov, setHov] = React.useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 22, height: 28,
        background: hov ? T.surfaceHov : T.surface, color: T.text,
        border: 'none', borderRadius: 5, cursor: 'pointer',
        fontSize: 15, fontFamily: 'inherit', flexShrink: 0,
      }}
    >
      {children}
    </button>
  )
}

function NumInput({ value, min, max, width, onChange }: { value: number; min: number; max: number; width: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number" min={min} max={max} value={value}
      onChange={e => { const v = Number(e.target.value); if (!isNaN(v)) onChange(v) }}
      style={{
        width, height: 28,
        background: T.surface,
        border: `1px solid ${T.border}`,
        borderRadius: 5, color: T.text,
        fontSize: 12, textAlign: 'center',
        fontFamily: 'inherit',
        outline: 'none',
      }}
      onFocus={e => { e.target.style.borderColor = T.primary }}
      onBlur={e => { e.target.style.borderColor = T.border }}
    />
  )
}

function StyledSelect({ value, onChange, children, width }: { value: string | number; onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void; children: React.ReactNode; width: number }) {
  return (
    <select
      value={value} onChange={onChange}
      style={{
        width, height: 28,
        background: T.surface,
        border: `1px solid ${T.border}`,
        borderRadius: 5, color: T.text,
        fontSize: 12, paddingLeft: 6,
        fontFamily: 'inherit',
        outline: 'none', cursor: 'pointer',
      }}
      onFocus={e => { e.target.style.borderColor = T.primary }}
      onBlur={e => { e.target.style.borderColor = T.border }}
    >
      {children}
    </select>
  )
}
