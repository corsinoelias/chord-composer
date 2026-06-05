import React, { useRef, useState } from 'react'
import {
  Play, Square, RotateCcw, Repeat,
  Undo2, Redo2, Trash2, Download, Share2, Bell, BellOff, Music,
} from 'lucide-react'
import { type BassSound, type SnapValue } from '../../lib/bassTab/types'

const T = {
  bg:          'hsl(224 20% 11%)',
  surface:     'hsl(224 18% 17%)',
  surfaceHov:  'hsl(224 18% 23%)',
  border:      'hsl(224 15% 22%)',
  text:        'hsl(220 14% 82%)',
  muted:       'hsl(220 10% 50%)',
  primary:     'hsl(262 83% 58%)',
  primaryBg:   'hsl(262 60% 25%)',
  primaryText: 'hsl(262 80% 85%)',
  danger:      'hsl(0 72% 51%)',
  dangerBg:    'hsl(0 60% 20%)',
  amber:       'hsl(38 92% 50%)',
  amberBg:     'hsl(38 60% 18%)',
  green:       'hsl(142 71% 45%)',
  greenBg:     'hsl(142 40% 16%)',
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
  onZoomIn: () => void; onZoomOut: () => void; onZoomReset: () => void
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
    onBarsChange, onZoomIn, onZoomOut, onZoomReset, onFretChange, onVolumeChange,
    onUndo, onRedo, onClearAll, onExportAscii, onExportMidi, onShareUrl, onMetronomeToggle,
  } = props

  // ── Tap tempo ─────────────────────────────────────────────────────────────
  const tapTimesRef = useRef<number[]>([])
  const [tapFlash, setTapFlash] = useState(false)
  const tapFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleTap = () => {
    const now = Date.now()
    const recent = tapTimesRef.current.filter(t => now - t < 4000)
    recent.push(now)
    tapTimesRef.current = recent.slice(-8)

    if (tapFlashTimer.current) clearTimeout(tapFlashTimer.current)
    setTapFlash(true)
    tapFlashTimer.current = setTimeout(() => setTapFlash(false), 120)

    if (recent.length >= 2) {
      const intervals = recent.slice(1).map((t, i) => t - recent[i])
      const avg = intervals.reduce((a, b) => a + b) / intervals.length
      onBpmChange(Math.max(40, Math.min(240, Math.round(60000 / avg))))
    }
  }

  return (
    <div style={{
      background: T.bg, borderBottom: `1px solid ${T.border}`, fontFamily: FONT,
      flexShrink: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center',
      gap: 4, padding: '5px 10px', userSelect: 'none',
    }}>

      {/* ── Playback ──────────────────────────────────────────────────────── */}
      <Group>
        {/* Play/Stop — primary action, larger */}
        <button
          onClick={isPlaying ? onStop : onPlay}
          title={isPlaying ? 'Stop  Space' : 'Play  Space'}
          style={{
            width: 38, height: 38, borderRadius: 8,
            background: isPlaying ? T.dangerBg : T.primaryBg,
            border: `1px solid ${isPlaying ? T.danger : T.primary}`,
            color: isPlaying ? T.danger : T.primaryText,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', flexShrink: 0, transition: 'all 0.12s',
            boxShadow: isPlaying ? `0 0 10px ${T.danger}44` : `0 0 10px ${T.primary}33`,
          }}
        >
          {isPlaying ? <Square size={15} /> : <Play size={15} />}
        </button>
        <IconBtn onClick={onStop} title="Reset to start">
          <RotateCcw size={12} />
        </IconBtn>
      </Group>

      <Divider />

      {/* ── Loop + Metro ──────────────────────────────────────────────────── */}
      <Group>
        <IconBtn onClick={onLoopToggle} title="Loop" active={loop}
          activeBg={T.greenBg} activeColor={T.green} activeBorder={T.green}>
          <Repeat size={12} />
        </IconBtn>
        <IconBtn onClick={onMetronomeToggle} title="Metronome click" active={metronome}
          activeBg={T.amberBg} activeColor={T.amber} activeBorder={T.amber}>
          {metronome ? <Bell size={12} /> : <BellOff size={12} />}
        </IconBtn>
      </Group>

      <Divider />

      {/* ── History ───────────────────────────────────────────────────────── */}
      <Group>
        <IconBtn onClick={onUndo} title="Undo  Ctrl+Z" disabled={!canUndo}>
          <Undo2 size={12} />
        </IconBtn>
        <IconBtn onClick={onRedo} title="Redo  Ctrl+Y" disabled={!canRedo}>
          <Redo2 size={12} />
        </IconBtn>
      </Group>

      <Divider />

      {/* ── BPM — scrub input + tap ────────────────────────────────────────── */}
      <Group>
        <LabeledControl label="BPM">
          <ScrubInput
            value={bpm} min={40} max={240}
            onChange={onBpmChange}
            width={58}
            title="Drag ◂▸ or scroll · Shift+drag for ±0.1 · double-click to type"
          />
        </LabeledControl>
        <TapButton flash={tapFlash} onClick={handleTap} />
      </Group>

      <Divider />

      {/* ── Snap — quick buttons ──────────────────────────────────────────── */}
      <LabeledControl label="Grid">
        <SegmentedBtns
          options={[
            { value: 0.25,    label: '¼' },
            { value: 0.125,   label: '⅛' },
            { value: 0.0625,  label: '¹⁄₁₆' },
            { value: 0.03125, label: '¹⁄₃₂' },
          ]}
          value={snap}
          onChange={v => onSnapChange(v as SnapValue)}
        />
      </LabeledControl>

      <Divider />

      {/* ── Sound ─────────────────────────────────────────────────────────── */}
      <LabeledControl label="Sound">
        <SegmentedBtns
          options={[
            { value: 'electric', label: 'Elec' },
            { value: 'picked',   label: 'Pick' },
            { value: 'synth',    label: 'Synth' },
            { value: 'slap',     label: 'Slap' },
          ]}
          value={sound}
          onChange={v => onSoundChange(v as BassSound)}
        />
      </LabeledControl>

      <Divider />

      {/* ── Bars ──────────────────────────────────────────────────────────── */}
      <LabeledControl label="Bars">
        <StepInput
          value={totalBars} min={1} max={64}
          onChange={onBarsChange}
          options={[2, 4, 8, 16, 32]}
        />
      </LabeledControl>

      <Divider />

      {/* ── Volume ────────────────────────────────────────────────────────── */}
      <LabeledControl label={`Vol ${Math.round(volume * 100)}%`}>
        <input
          type="range" min={0} max={1} step={0.01} value={volume}
          onChange={e => onVolumeChange(Number(e.target.value))}
          style={{ width: 72, accentColor: T.primary, cursor: 'pointer', height: 28 }}
        />
      </LabeledControl>

      {/* ── Fret editor (when note selected) ─────────────────────────────── */}
      {hasSelectedNote && selectedNoteFret !== null && (
        <>
          <Divider />
          <LabeledControl label="Fret">
            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <StepBtn onClick={() => onFretChange(Math.max(0, selectedNoteFret - 1))} label="−" />
              <ScrubInput
                value={selectedNoteFret} min={0} max={24}
                onChange={onFretChange}
                width={40}
                title="Drag to change fret · double-click to type"
              />
              <StepBtn onClick={() => onFretChange(Math.min(24, selectedNoteFret + 1))} label="+" />
            </div>
          </LabeledControl>
        </>
      )}

      {/* ── Right side: zoom + export ─────────────────────────────────────── */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>

        {/* Zoom */}
        <Group>
          <IconBtn onClick={onZoomOut} title="Zoom out" disabled={zoom <= 0.4}>
            <span style={{ fontSize: 12, lineHeight: 1 }}>−</span>
          </IconBtn>
          <button
            onClick={onZoomReset}
            title="Click to reset zoom to 100%"
            style={{
              minWidth: 42, height: 28, padding: '0 6px',
              background: zoom !== 1 ? T.surfaceHov : T.surface,
              border: `1px solid ${zoom !== 1 ? T.primary + '55' : T.border}`,
              borderRadius: 5, color: zoom !== 1 ? T.primaryText : T.muted,
              fontSize: 11, fontFamily: FONT, cursor: zoom !== 1 ? 'pointer' : 'default',
              fontVariantNumeric: 'tabular-nums',
              transition: 'all 0.1s',
            }}
          >
            {Math.round(zoom * 100)}%
          </button>
          <IconBtn onClick={onZoomIn} title="Zoom in" disabled={zoom >= 4}>
            <span style={{ fontSize: 12, lineHeight: 1 }}>+</span>
          </IconBtn>
        </Group>

        <Divider />

        {/* Export */}
        <Group>
          <IconBtn onClick={onExportAscii} title="Copy ASCII tab">
            <Download size={12} />
          </IconBtn>
          <IconBtn onClick={onExportMidi} title="Download MIDI (.mid)">
            <Music size={12} />
          </IconBtn>
          <IconBtn onClick={onShareUrl} title="Copy share URL">
            <Share2 size={12} />
          </IconBtn>
        </Group>

        <Divider />

        <IconBtn onClick={onClearAll} title="Clear all notes"
          hoverBg={T.dangerBg} hoverColor={T.danger} hoverBorder={T.danger + '88'}>
          <Trash2 size={12} />
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
  return <div style={{ width: 1, height: 22, background: T.border, flexShrink: 0, margin: '0 1px' }} />
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
  activeBorder?: string
  hoverBg?: string
  hoverColor?: string
  hoverBorder?: string
}

function IconBtn({ children, onClick, title, disabled, active, activeBg, activeColor, activeBorder, hoverBg, hoverColor, hoverBorder }: IconBtnProps) {
  const [hov, setHov] = useState(false)

  const bg     = active ? (activeBg    ?? T.primaryBg)   : hov ? (hoverBg    ?? T.surfaceHov) : T.surface
  const color  = active ? (activeColor ?? T.primaryText)  : hov ? (hoverColor ?? T.text)       : T.muted
  const border = active ? (activeBorder ?? T.primary)     : hov ? (hoverBorder ?? T.border)    : T.border

  return (
    <button
      onClick={onClick} disabled={disabled} title={title}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 28, height: 28, background: bg, color, cursor: disabled ? 'not-allowed' : 'pointer',
        border: `1px solid ${border}`, borderRadius: 6,
        opacity: disabled ? 0.28 : 1, transition: 'all 0.1s',
        fontFamily: 'inherit', flexShrink: 0,
      }}
    >
      {children}
    </button>
  )
}

function StepBtn({ onClick, label }: { onClick: () => void; label: string }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: 22, height: 28, background: hov ? T.surfaceHov : T.surface,
        border: `1px solid ${T.border}`, borderRadius: 5,
        color: T.text, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 0.08s',
      }}
    >
      {label}
    </button>
  )
}

// ── ScrubInput: drag or scroll to change value, double-click to type ───────
interface ScrubInputProps {
  value: number; min: number; max: number; step?: number
  onChange: (v: number) => void; width?: number; title?: string
}

function ScrubInput({ value, min, max, step = 1, onChange, width = 58, title }: ScrubInputProps) {
  const [editing, setEditing]   = useState(false)
  const [editStr, setEditStr]   = useState(String(value))
  const [hov, setHov]           = useState(false)
  const dragRef  = useRef<{ x: number; val: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const clamp = (v: number) => Math.max(min, Math.min(max, Math.round(v / step) * step))

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (editing) return
    e.preventDefault()
    dragRef.current = { x: e.clientX, val: value }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return
    // Normal drag = ±1 per pixel; Shift = ±0.1 per pixel (fine)
    const sensitivity = e.shiftKey ? 0.1 : 1
    const delta = (e.clientX - dragRef.current.x) * sensitivity
    onChange(clamp(dragRef.current.val + delta))
  }

  const handlePointerUp = () => { dragRef.current = null }

  const handleDblClick = () => {
    setEditing(true)
    setEditStr(String(value))
    requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.select() })
  }

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    onChange(clamp(value + (e.deltaY < 0 ? step : -step)))
  }

  const commit = () => {
    const v = parseFloat(editStr)
    if (!isNaN(v)) onChange(clamp(v))
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number" value={editStr}
        onChange={e => setEditStr(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
        style={{
          width, height: 28, background: T.surface, border: `1px solid ${T.primary}`,
          borderRadius: 5, color: T.text, fontSize: 12, textAlign: 'center',
          fontFamily: FONT, outline: 'none',
        }}
      />
    )
  }

  const isDragging = !!dragRef.current

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={handleDblClick}
      onWheel={handleWheel}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      title={title}
      style={{
        width, height: 28,
        background: isDragging ? T.surfaceHov : T.surface,
        border: `1px solid ${(hov || isDragging) ? T.primary + '88' : T.border}`,
        borderRadius: 5, color: T.text,
        fontSize: 12, fontFamily: FONT, fontVariantNumeric: 'tabular-nums',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
        cursor: 'ew-resize', userSelect: 'none', touchAction: 'none',
        transition: 'border-color 0.1s, background 0.1s',
      }}
    >
      <span style={{ fontSize: 8, color: hov ? T.muted : 'transparent', lineHeight: 1, transition: 'color 0.1s' }}>◂</span>
      <span>{value}</span>
      <span style={{ fontSize: 8, color: hov ? T.muted : 'transparent', lineHeight: 1, transition: 'color 0.1s' }}>▸</span>
    </div>
  )
}

// ── Tap Tempo button ────────────────────────────────────────────────────────
function TapButton({ flash, onClick }: { flash: boolean; onClick: () => void }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      title="Tap to set tempo"
      style={{
        height: 28, padding: '0 8px',
        background: flash ? T.amberBg : hov ? T.surfaceHov : T.surface,
        border: `1px solid ${flash ? T.amber : hov ? T.border : T.border}`,
        borderRadius: 5, color: flash ? T.amber : T.muted,
        fontSize: 10, fontWeight: 600, letterSpacing: '0.04em',
        fontFamily: FONT, cursor: 'pointer',
        transition: 'all 0.1s',
      }}
    >
      TAP
    </button>
  )
}

// ── Segmented button group (snap / sound) ───────────────────────────────────
interface SegOption { value: number | string; label: string }
interface SegProps   { options: SegOption[]; value: number | string; onChange: (v: number | string) => void }

function SegmentedBtns({ options, value, onChange }: SegProps) {
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {options.map(opt => {
        const active = opt.value === value
        return (
          <SegBtn key={String(opt.value)} label={opt.label} active={active}
            onClick={() => onChange(opt.value)} />
        )
      })}
    </div>
  )
}

function SegBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        height: 28, padding: '0 7px',
        background: active ? T.primaryBg : hov ? T.surfaceHov : T.surface,
        border: `1px solid ${active ? T.primary : hov ? T.border : T.border}`,
        borderRadius: 5,
        color: active ? T.primaryText : hov ? T.text : T.muted,
        fontSize: 11, fontFamily: FONT, cursor: 'pointer', flexShrink: 0,
        transition: 'all 0.1s',
      }}
    >
      {label}
    </button>
  )
}

// ── Step input for Bars: shows value with prev/next quick options ───────────
function StepInput({ value, min, max, onChange, options }: { value: number; min: number; max: number; onChange: (v: number) => void; options: number[] }) {
  const [open, setOpen] = useState(false)
  const [hov, setHov]   = useState(false)

  // Find prev/next in options list
  const idx  = options.indexOf(value)
  const prev = idx > 0 ? options[idx - 1] : (value > min ? value - 1 : null)
  const next = idx < options.length - 1 ? options[idx + 1] : (value < max ? value + 1 : null)

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: 2 }}>
        <StepBtn onClick={() => prev !== null && onChange(prev)} label="−" />
        <button
          onClick={() => setOpen(o => !o)}
          onMouseEnter={() => setHov(true)}
          onMouseLeave={() => setHov(false)}
          title="Click for presets"
          style={{
            width: 36, height: 28, background: hov ? T.surfaceHov : T.surface,
            border: `1px solid ${open ? T.primary + '88' : T.border}`, borderRadius: 5,
            color: T.text, fontSize: 12, fontFamily: FONT, cursor: 'pointer',
            fontVariantNumeric: 'tabular-nums', transition: 'all 0.1s',
          }}
        >
          {value}
        </button>
        <StepBtn onClick={() => next !== null && onChange(next)} label="+" />
      </div>
      {open && (
        <div
          style={{
            position: 'absolute', bottom: '100%', left: 0, marginBottom: 4,
            background: 'hsl(224 20% 14%)',
            border: `1px solid ${T.border}`, borderRadius: 7,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            padding: 4, display: 'flex', flexDirection: 'column', gap: 2, zIndex: 9999, minWidth: 80,
          }}
          onMouseLeave={() => setOpen(false)}
        >
          {options.map(opt => (
            <button
              key={opt}
              onClick={() => { onChange(opt); setOpen(false) }}
              style={{
                background: opt === value ? T.primaryBg : 'transparent',
                border: 'none', borderRadius: 5,
                color: opt === value ? T.primaryText : T.text,
                padding: '4px 10px', fontSize: 12, textAlign: 'left',
                fontFamily: FONT, cursor: 'pointer',
              }}
              onMouseEnter={e => { (e.target as HTMLElement).style.background = opt === value ? T.primaryBg : T.surfaceHov }}
              onMouseLeave={e => { (e.target as HTMLElement).style.background = opt === value ? T.primaryBg : 'transparent' }}
            >
              {opt} bars
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
