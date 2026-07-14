import React, { useState } from 'react'
import type { GuitarSound } from '../../lib/guitarTab/types'

const C = {
  bg:      '#f8fafc',
  surface: '#ffffff',
  border:  '#e2e8f0',
  text:    '#1e293b',
  muted:   '#64748b',
  primary: '#7c3aed',
  danger:  '#dc2626',
  green:   '#16a34a',
}

interface TransportProps {
  isPlaying: boolean
  loop: boolean
  metronome: boolean
  bpm: number
  sound: GuitarSound
  capo: number
  totalBars: number
  zoom: number
  volume: number
  playbackSpeed: number
  countIn: 0 | 1 | 2
  selectedNoteFret: number | null
  hasSelectedNote: boolean
  canUndo: boolean
  canRedo: boolean
  isMobile?: boolean
  onPlay: () => void
  onStop: () => void
  onRewind: () => void
  onLoopToggle: () => void
  onMetronomeToggle: () => void
  onBpmChange: (bpm: number) => void
  onSoundChange: (sound: GuitarSound) => void
  onCapoChange: (capo: number) => void
  onBarsChange: (bars: number) => void
  onZoomIn: () => void
  onZoomOut: () => void
  onFretChange: (fret: number) => void
  onVolumeChange: (vol: number) => void
  onUndo: () => void
  onRedo: () => void
  onClearAll: () => void
  onExportAscii: () => void
  onExportMidi: () => void
  onImportMidi?: () => void
  onImportGp?: () => void
  onRecord?: () => void
  onSpeedChange: (speed: number) => void
  onCountInChange: (countIn: 0 | 1 | 2) => void
  onExportImage?: (format: 'svg' | 'png') => void
}

const SOUNDS: { value: GuitarSound; label: string }[] = [
  { value: 'acoustic',        label: 'Acoustic' },
  { value: 'nylon',           label: 'Nylon' },
  { value: 'clean',           label: 'Clean' },
  { value: 'synth',           label: 'Synth' },
  { value: 'sf2',             label: 'Steel ★' },
  { value: 'sf2-nylon',       label: 'Nylon ★' },
  { value: 'sf2-clean',       label: 'Clean ★' },
  { value: 'sf2-jazz',        label: 'Jazz ★' },
  { value: 'sf2-muted',       label: 'Muted ★' },
  { value: 'sf2-distortion',  label: 'Distorted ★' },
  { value: 'sf2-overdrive',   label: 'Overdrive ★' },
  { value: 'sf2-harmonics',   label: 'Harmonics ★' },
]

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2]

export function GuitarTransport({
  isPlaying, loop, metronome, bpm, sound, capo, totalBars, zoom, volume,
  playbackSpeed, countIn,
  selectedNoteFret, hasSelectedNote, canUndo, canRedo, isMobile,
  onPlay, onStop, onRewind, onLoopToggle, onMetronomeToggle,
  onBpmChange, onSoundChange, onCapoChange, onBarsChange,
  onZoomIn, onZoomOut,
  onFretChange, onVolumeChange, onUndo, onRedo, onClearAll,
  onExportAscii, onExportMidi, onImportMidi, onImportGp, onRecord,
  onSpeedChange, onCountInChange, onExportImage,
}: TransportProps) {
  const [showExport, setShowExport] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [bpmInput, setBpmInput]     = useState(String(bpm))

  const commitBpm = () => {
    const v = parseInt(bpmInput, 10)
    if (v >= 20 && v <= 300) onBpmChange(v)
    else setBpmInput(String(bpm))
  }

  const cycleCountIn = () => {
    onCountInChange(countIn === 0 ? 1 : countIn === 1 ? 2 : 0)
  }

  return (
    <div style={{ background: C.bg, borderBottom: `1px solid ${C.border}`, padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 8, userSelect: 'none' }}>

      {/* Row 1: playback + main controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>

        <IconBtn title="Rewind" onClick={onRewind} disabled={isPlaying}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>
        </IconBtn>

        <button
          onClick={isPlaying ? onStop : onPlay}
          title={isPlaying ? 'Stop' : 'Play'}
          style={{ height: 34, width: 68, borderRadius: 8, border: 'none', background: isPlaying ? C.danger : C.primary, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
        >
          {isPlaying
            ? <><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12"/></svg> Stop</>
            : <><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> Play</>
          }
        </button>

        <IconBtn title="Loop" onClick={onLoopToggle} active={loop}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 014-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>
        </IconBtn>

        <IconBtn title="Metronome" onClick={onMetronomeToggle} active={metronome}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m12 3-6 18h12L12 3z"/><path d="M8.5 13.5h7"/></svg>
        </IconBtn>

        {/* Count-in */}
        <button
          onClick={cycleCountIn}
          title={countIn === 0 ? 'Count-in: Off — click to enable' : `Count-in: ${countIn} bar${countIn > 1 ? 's' : ''} — click to change`}
          style={{
            height: 32, padding: '0 8px', borderRadius: 7, fontSize: 11, fontWeight: 600,
            border: `1px solid ${countIn > 0 ? C.primary : C.border}`,
            background: countIn > 0 ? '#ede9fe' : C.surface,
            color: countIn > 0 ? C.primary : C.muted,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>
          {countIn === 0 ? 'Count-in' : `${countIn}${countIn === 1 ? ' bar' : ' bars'}`}
        </button>

        <div style={{ width: 1, height: 28, background: C.border }} />

        {/* BPM */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={() => onBpmChange(Math.max(20, bpm - 1))} style={smallBtn}>−</button>
          <input
            type="number" min={20} max={300}
            value={bpmInput}
            onChange={e => setBpmInput(e.target.value)}
            onBlur={commitBpm}
            onKeyDown={e => e.key === 'Enter' && commitBpm()}
            style={{ width: 52, height: 28, textAlign: 'center', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, fontWeight: 700, color: C.text, background: C.surface, outline: 'none' }}
          />
          <button onClick={() => onBpmChange(Math.min(300, bpm + 1))} style={smallBtn}>+</button>
          <span style={{ fontSize: 10, color: C.muted, marginLeft: 2 }}>BPM</span>
        </div>

        {/* Speed */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 10, color: C.muted }}>Speed</span>
          <select
            value={playbackSpeed}
            onChange={e => onSpeedChange(Number(e.target.value))}
            style={{ height: 28, padding: '0 4px', border: `1px solid ${playbackSpeed !== 1 ? C.primary : C.border}`, borderRadius: 6, fontSize: 12, fontWeight: 600, color: playbackSpeed !== 1 ? C.primary : C.text, background: playbackSpeed !== 1 ? '#ede9fe' : C.surface, cursor: 'pointer' }}
          >
            {SPEEDS.map(s => (
              <option key={s} value={s}>{s === 1 ? '1× (normal)' : `${s}×`}</option>
            ))}
          </select>
        </div>

        <div style={{ width: 1, height: 28, background: C.border }} />

        {/* Sound */}
        <select
          value={sound}
          onChange={e => onSoundChange(e.target.value as GuitarSound)}
          style={{ height: 28, padding: '0 6px', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, color: C.text, background: C.surface, cursor: 'pointer' }}
        >
          {SOUNDS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>

        {/* Capo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 11, color: C.muted }}>Capo</span>
          <select
            value={capo}
            onChange={e => onCapoChange(Number(e.target.value))}
            style={{ height: 28, padding: '0 4px', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, color: C.text, background: C.surface, cursor: 'pointer' }}
          >
            {Array.from({ length: 8 }, (_, i) => (
              <option key={i} value={i}>{i === 0 ? 'None' : `Fret ${i}`}</option>
            ))}
          </select>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <IconBtn title="Undo (Ctrl+Z)" onClick={onUndo} disabled={!canUndo}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13"/></svg>
          </IconBtn>
          <IconBtn title="Redo (Ctrl+Y)" onClick={onRedo} disabled={!canRedo}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 019-9 9 9 0 016 2.3l3 2.7"/></svg>
          </IconBtn>

          {/* Files dropdown */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowExport(v => !v)} style={{ height: 28, padding: '0 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, color: C.muted, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Files
            </button>
            {showExport && (
              <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', padding: 6, zIndex: 50, minWidth: 170, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <ExportItem label="Copy as ASCII Tab" onClick={() => { onExportAscii(); setShowExport(false) }} />
                <ExportItem label="Export MIDI" onClick={() => { onExportMidi(); setShowExport(false) }} />
                {onExportImage && <>
                  <ExportItem label="Export as SVG" onClick={() => { onExportImage('svg'); setShowExport(false) }} />
                  <ExportItem label="Export as PNG" onClick={() => { onExportImage('png'); setShowExport(false) }} />
                </>}
              </div>
            )}
          </div>

          {/* Import dropdown — separate from Files/Export so it doesn't get missed */}
          {(onImportMidi || onImportGp) && (
            <div style={{ position: 'relative' }}>
              <button onClick={() => setShowImport(v => !v)} style={{ height: 28, padding: '0 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, color: C.muted, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7,4 12,9 17,4"/><line x1="12" y1="9" x2="12" y2="21"/></svg>
                Import
              </button>
              {showImport && (
                <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', padding: 6, zIndex: 50, minWidth: 190, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {onImportMidi && <ExportItem label="Import MIDI…" onClick={() => { onImportMidi(); setShowImport(false) }} />}
                  {onImportGp && <ExportItem label="Import .gp / .gpx…" onClick={() => { onImportGp(); setShowImport(false) }} />}
                </div>
              )}
            </div>
          )}

          {onRecord && (
            <IconBtn title="Record from fretboard" onClick={onRecord} disabled={isPlaying}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="#ef4444"><circle cx="12" cy="12" r="7"/></svg>
            </IconBtn>
          )}

          <IconBtn title="Clear all notes" onClick={onClearAll}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
          </IconBtn>
        </div>
      </div>

      {/* Row 2: fret edit + bars + zoom + volume */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {hasSelectedNote && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: C.muted }}>Fret</span>
            <input
              type="number" min={0} max={24}
              value={selectedNoteFret ?? 0}
              onChange={e => onFretChange(Math.max(0, Math.min(24, parseInt(e.target.value, 10) || 0)))}
              style={{ width: 48, height: 26, textAlign: 'center', border: `1px solid ${C.primary}`, borderRadius: 6, fontSize: 12, fontWeight: 700, color: C.primary, background: '#f5f3ff', outline: 'none' }}
            />
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={() => onBarsChange(Math.max(1, totalBars - 1))} style={smallBtn}>−</button>
          <span style={{ fontSize: 12, color: C.text, fontWeight: 600, minWidth: 30, textAlign: 'center' }}>{totalBars}</span>
          <button onClick={() => onBarsChange(totalBars + 1)} style={smallBtn}>+</button>
          <span style={{ fontSize: 10, color: C.muted }}>bars</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 8 }}>
          <button onClick={onZoomOut} style={smallBtn}>−</button>
          <span style={{ fontSize: 10, color: C.muted }}>Zoom</span>
          <button onClick={onZoomIn} style={smallBtn}>+</button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 8 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19 11,5"/><path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07"/></svg>
          <input
            type="range" min={0} max={1} step={0.01} value={volume}
            onChange={e => onVolumeChange(Number(e.target.value))}
            style={{ width: 80, accentColor: C.primary }}
          />
        </div>
      </div>
    </div>
  )
}

function IconBtn({ children, onClick, disabled, active, title }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; active?: boolean; title?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        width: 32, height: 32, borderRadius: 7,
        border: `1px solid ${active ? '#7c3aed' : '#e2e8f0'}`,
        background: active ? '#ede9fe' : '#ffffff',
        color: active ? '#7c3aed' : disabled ? '#cbd5e1' : '#475569',
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.1s',
      }}
    >
      {children}
    </button>
  )
}

function ExportItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{ padding: '7px 12px', borderRadius: 6, border: 'none', background: 'transparent', color: '#374151', fontSize: 12, textAlign: 'left', cursor: 'pointer', width: '100%' }}
      onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      {label}
    </button>
  )
}

const smallBtn: React.CSSProperties = {
  width: 24, height: 24, borderRadius: 5, border: '1px solid #e2e8f0',
  background: '#ffffff', color: '#374151', fontSize: 14, fontWeight: 600,
  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  lineHeight: 1,
}
