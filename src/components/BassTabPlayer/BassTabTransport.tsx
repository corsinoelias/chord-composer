import React, { useRef, useState, useEffect } from 'react'
import {
  Play, Square, SkipBack, RotateCcw,
  Undo2, Redo2, Trash2, Download, Share2, Bell, BellOff, Music, Upload,
  ChevronDown, ChevronUp, Waves, Piano, MoreHorizontal, ImageIcon, Video,
} from 'lucide-react'
import { type BassSound } from '../../lib/bassTab/types'

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

const DURATION_OPTS = [
  { v: 4,    label: 'Whole',   sub: '4 beats', title: 'Whole note (4 beats) — key 1' },
  { v: 2,    label: 'Half',    sub: '2 beats', title: 'Half note (2 beats) — key 2' },
  { v: 1,    label: 'Quarter', sub: '1 beat',  title: 'Quarter note (1 beat) — key 3' },
  { v: 0.5,  label: '8th',     sub: '½ beat',  title: 'Eighth note (½ beat) — key 4' },
  { v: 0.25, label: '16th',    sub: '¼ beat',  title: '16th note (¼ beat) — key 5' },
]

interface TransportProps {
  isPlaying: boolean; loop: boolean; bpm: number
  sound: BassSound; totalBars: number
  zoom: number; volume: number; noteDuration: number
  selectedNoteFret: number | null; hasSelectedNote: boolean
  canUndo: boolean; canRedo: boolean; metronome: boolean
  onPlay: () => void; onStop: () => void; onRewind: () => void; onLoopToggle: () => void
  onBpmChange: (bpm: number) => void
  onSoundChange: (sound: BassSound) => void; onBarsChange: (bars: number) => void
  onZoomIn: () => void; onZoomOut: () => void; onZoomReset: () => void
  onFretChange: (fret: number) => void; onVolumeChange: (vol: number) => void
  onUndo: () => void; onRedo: () => void; onClearAll: () => void
  onExportAscii: () => void; onExportMidi: () => void; onImportMidi: () => void
  onShareUrl: () => void; onMetronomeToggle: () => void
  onNoteDurationChange: (d: number) => void
  // Responsive additions
  isMobile?: boolean
  compact?: boolean
  onToggleExpand?: () => void
  currentBeat?: number
  beatsPerBar?: number
  // Desktop fit-to-width
  fitWidth?: boolean
  onFitWidthToggle?: () => void
  // Desktop compact (collapse row 2)
  desktopCompact?: boolean
  onToggleDesktopCompact?: () => void
  // Recording
  onRecord?: () => void
  // Feature 7: compound time signature (beatsPerBar already declared above)
  onBeatsPerBarChange?: (bpb: number) => void
  // Feature 6: MIDI input
  midiInputAvailable?: boolean
  midiInputActive?: boolean
  midiDeviceName?: string | null
  onMidiInputToggle?: () => void
  // Feature 8: export WAV
  onExportWav?: () => void
  onExportImage?: () => void
  onExportVideo?: () => void
  // Feature 2: loop range (toggle on/off)
  loopRangeActive?: boolean
  onToggleLoopRange?: () => void
}

export function BassTabTransport(props: TransportProps) {
  const {
    isPlaying, loop, bpm, sound, totalBars, zoom, volume, noteDuration,
    selectedNoteFret, hasSelectedNote, canUndo, canRedo, metronome,
    onPlay, onStop, onRewind, onLoopToggle, onBpmChange, onSoundChange,
    onBarsChange, onZoomIn, onZoomOut, onZoomReset, onFretChange, onVolumeChange,
    onUndo, onRedo, onClearAll, onExportAscii, onExportMidi, onImportMidi, onShareUrl, onMetronomeToggle,
    onNoteDurationChange,
    isMobile = false, compact = false, onToggleExpand,
    currentBeat = 0, beatsPerBar = 4,
    fitWidth = false, onFitWidthToggle,
    desktopCompact = false, onToggleDesktopCompact,
    onBeatsPerBarChange,
    midiInputAvailable, midiInputActive, midiDeviceName, onMidiInputToggle,
    onExportWav, onExportImage, onExportVideo,
    loopRangeActive, onToggleLoopRange,
    onRecord,
  } = props

  const bpb = beatsPerBar   // alias for clarity

  // ── Tap tempo ─────────────────────────────────────────────────────────────
  const tapTimesRef   = useRef<number[]>([])
  const [tapFlash, setTapFlash] = useState(false)
  const tapFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleTap = () => {
    const now    = Date.now()
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

  const bar  = Math.floor(currentBeat / beatsPerBar) + 1
  const beat = Math.floor(currentBeat % beatsPerBar) + 1

  return (
    <div style={{
      background: T.bg, borderBottom: `1px solid ${T.border}`, fontFamily: FONT,
      flexShrink: 0, userSelect: 'none', display: 'flex', flexDirection: 'column',
    }}>

      {/* ══════════════════════════════════════════════════════════════════════
          MOBILE COMPACT BAR — always visible on mobile
      ══════════════════════════════════════════════════════════════════════ */}
      {isMobile && (
        <div style={{
          height: 56, display: 'flex', alignItems: 'center', gap: 6,
          padding: '0 10px',
          borderBottom: compact ? 'none' : `1px solid ${T.border}`,
        }}>

          {/* Play / Stop */}
          <button
            onClick={isPlaying ? onStop : onPlay}
            title={isPlaying ? 'Stop' : 'Play'}
            style={{
              width: 44, height: 44, borderRadius: 22, flexShrink: 0,
              background: isPlaying ? T.dangerBg : T.primaryBg,
              border: `1px solid ${isPlaying ? T.danger : T.primary}`,
              color: isPlaying ? T.danger : T.primaryText,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', transition: 'all 0.12s',
              boxShadow: isPlaying ? `0 0 12px ${T.danger}55` : `0 0 12px ${T.primary}44`,
            }}
          >
            {isPlaying ? <Square size={18} /> : <Play size={18} />}
          </button>

          {/* Record button */}
          {onRecord && (
            <button
              onClick={onRecord}
              title="Grabar tablatura"
              style={{
                width: 36, height: 36, borderRadius: 18, flexShrink: 0,
                background: T.dangerBg,
                border: `1px solid ${T.danger}88`,
                color: T.danger,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
                touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="12" r="7" />
              </svg>
            </button>
          )}

          {/* Bar:Beat counter — shows when playing */}
          <div style={{ minWidth: 36, textAlign: 'center' }}>
            {isPlaying && (
              <span style={{
                fontFamily: 'ui-monospace, monospace', fontSize: 14, fontWeight: 600,
                color: T.primary, letterSpacing: '0.02em',
              }}>
                {bar}:{beat}
              </span>
            )}
          </div>

          {/* BPM + TAP */}
          <ScrubInput value={bpm} min={40} max={240} onChange={onBpmChange} width={52} title="Drag to change BPM" />
          <TapButton flash={tapFlash} onClick={handleTap} mobile />

          <div style={{ flex: 1 }} />

          {/* Undo / Redo */}
          <MIconBtn onClick={onUndo} disabled={!canUndo} title="Undo Ctrl+Z">
            <Undo2 size={15} />
          </MIconBtn>
          <MIconBtn onClick={onRedo} disabled={!canRedo} title="Redo Ctrl+Y">
            <Redo2 size={15} />
          </MIconBtn>

          {/* Expand toggle */}
          <MIconBtn
            onClick={onToggleExpand}
            title={compact ? 'More controls' : 'Less controls'}
            active={!compact}
            activeBg={T.primaryBg} activeColor={T.primaryText} activeBorder={T.primary}
          >
            {compact ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </MIconBtn>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          COLLAPSIBLE AREA — full transport on desktop, expanded rows on mobile
      ══════════════════════════════════════════════════════════════════════ */}
      <div style={{
        overflow: 'hidden',
        maxHeight: isMobile && compact ? 0 : 1000,
        transition: 'max-height 0.22s ease',
      }}>

        {isMobile ? (
          /* ── Mobile expanded rows ─────────────────────────────────────── */
          <div>

            {/* Duration — full width, tall buttons */}
            <div style={{ padding: '8px 10px 4px' }}>
              <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: T.primary, marginBottom: 5 }}>
                Duration
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {DURATION_OPTS.map(o => {
                  const active = noteDuration === o.v
                  return (
                    <button
                      key={o.v}
                      onClick={() => onNoteDurationChange(o.v)}
                      title={o.title}
                      style={{
                        flex: 1, height: 50,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
                        background: active ? T.primaryBg : T.surface,
                        border: `1px solid ${active ? T.primary : T.border}`,
                        borderRadius: 8,
                        color: active ? T.primaryText : T.muted,
                        cursor: 'pointer', transition: 'all 0.1s',
                        boxShadow: active ? `0 0 8px ${T.primary}44` : 'none',
                        touchAction: 'manipulation',
                      }}
                    >
                      <span style={{ fontSize: 20, lineHeight: 1 }}>{o.label}</span>
                      <span style={{ fontSize: 9, lineHeight: 1, opacity: 0.7 }}>{o.sub}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Sound + Grid */}
            <div style={{ display: 'flex', gap: 8, padding: '4px 10px 6px', flexWrap: 'wrap' }}>
              <div style={{ flex: 2, minWidth: 160 }}>
                <div style={labelStyle}>Sound</div>
                <div style={{ display: 'flex', gap: 3 }}>
                  {([
                    { value: 'fender',   label: 'Fender' },
                    { value: 'finger',   label: 'Finger' },
                    { value: 'slap',     label: 'Slap' },
                    { value: 'muted',    label: 'Muted' },
                  ] as const).map(opt => {
                    const active = sound === opt.value
                    return (
                      <button
                        key={opt.value}
                        onClick={() => onSoundChange(opt.value)}
                        style={{
                          flex: 1, height: 38, background: active ? T.primaryBg : T.surface,
                          border: `1px solid ${active ? T.primary : T.border}`, borderRadius: 6,
                          color: active ? T.primaryText : T.muted, fontSize: 11, fontFamily: FONT,
                          cursor: 'pointer', transition: 'all 0.1s', touchAction: 'manipulation',
                        }}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              </div>

            </div>

            {/* Secondary row: loop · metro · bars · volume · export */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 10px 9px',
              borderTop: `1px solid ${T.border}`, flexWrap: 'wrap',
            }}>
              <MIconBtn onClick={onRewind} title="Rewind to start">
                <SkipBack size={14} />
              </MIconBtn>
              <MIconBtn
                onClick={onLoopToggle}
                active={loop}
                activeBg={T.greenBg}
                activeColor={T.green}
                activeBorder={T.green}
                title="Loop playback"
              >
                <RotateCcw size={14} />
              </MIconBtn>
              <MIconBtn onClick={onMetronomeToggle} active={metronome} title="Metronome"
                activeBg={T.amberBg} activeColor={T.amber} activeBorder={T.amber}>
                {metronome ? <Bell size={14} /> : <BellOff size={14} />}
              </MIconBtn>

              <MDivider />

              {/* Bars (auto-expands with notes; +/− for manual adjustment) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <span style={{ fontSize: 9, color: T.muted, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Bars</span>
                <MIconBtn onClick={() => onBarsChange(Math.max(1, totalBars - 1))} title="Remove last bar">
                  <span style={{ fontSize: 14, lineHeight: 1 }}>−</span>
                </MIconBtn>
                <span style={{ fontSize: 12, color: T.text, minWidth: 22, textAlign: 'center', fontFamily: 'ui-monospace, monospace' }}>
                  {totalBars}
                </span>
                <MIconBtn onClick={() => onBarsChange(Math.min(64, totalBars + 1))} title="Add empty bar">
                  <span style={{ fontSize: 14, lineHeight: 1 }}>+</span>
                </MIconBtn>
              </div>

              <MDivider />

              {/* Volume */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <span style={labelStyle}>Vol {Math.round(volume * 100)}%</span>
                <input
                  type="range" min={0} max={1} step={0.05} value={volume}
                  onChange={e => onVolumeChange(Number(e.target.value))}
                  style={{ width: 80, accentColor: T.primary, cursor: 'pointer', height: 24 }}
                />
              </div>

              <div style={{ flex: 1 }} />

              {/* Fret (selected note) */}
              {hasSelectedNote && selectedNoteFret !== null && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <span style={{ ...labelStyle, marginBottom: 0 }}>Fret</span>
                  <MIconBtn onClick={() => onFretChange(Math.max(0, selectedNoteFret - 1))}>
                    <span style={{ fontSize: 14, lineHeight: 1 }}>−</span>
                  </MIconBtn>
                  <span style={{ fontSize: 13, color: T.text, minWidth: 22, textAlign: 'center', fontFamily: 'ui-monospace, monospace' }}>
                    {selectedNoteFret}
                  </span>
                  <MIconBtn onClick={() => onFretChange(Math.min(24, selectedNoteFret + 1))}>
                    <span style={{ fontSize: 14, lineHeight: 1 }}>+</span>
                  </MIconBtn>
                </div>
              )}

              <MDivider />

              <MIconBtn onClick={onImportMidi} title="Import MIDI">
                <Upload size={14} />
              </MIconBtn>
              <MIconBtn onClick={onExportAscii} title="Copy ASCII tab">
                <Download size={14} />
              </MIconBtn>
              <MIconBtn onClick={onExportMidi} title="Download MIDI">
                <Music size={14} />
              </MIconBtn>
              {onExportWav && (
                <MIconBtn onClick={onExportWav} title="Export WAV">
                  <Waves size={14} />
                </MIconBtn>
              )}
              {midiInputAvailable && onMidiInputToggle && (
                <MIconBtn onClick={onMidiInputToggle} title={midiInputActive ? 'MIDI connected — tap to disconnect' : 'Connect MIDI keyboard'}
                  active={midiInputActive}
                  activeBg="hsl(280 60% 18%)" activeColor="hsl(280 80% 70%)" activeBorder="hsl(280 70% 45%)">
                  <Piano size={14} />
                </MIconBtn>
              )}
              <MIconBtn onClick={onShareUrl} title="Copy share URL">
                <Share2 size={14} />
              </MIconBtn>
              <MIconBtn onClick={onClearAll} title="Clear all notes"
                hoverBg={T.dangerBg} hoverColor={T.danger} hoverBorder={`${T.danger}88`}>
                <Trash2 size={14} />
              </MIconBtn>
            </div>
          </div>

        ) : (
          /* ── Desktop layout ──────────────────────────────────────────── */
          <>
            {/* ── Row 1: Playback + File operations ── */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '0 10px', height: 44,
              borderBottom: `1px solid ${T.border}`,
              overflowX: 'auto', overflowY: 'hidden',
            }}>
              {/* Playback */}
              <Group>
                <button
                  onClick={isPlaying ? onStop : onPlay}
                  title={isPlaying ? 'Stop  Space' : 'Play  Space'}
                  style={{
                    width: 34, height: 34, borderRadius: 7,
                    background: isPlaying ? T.dangerBg : T.primaryBg,
                    border: `1px solid ${isPlaying ? T.danger : T.primary}`,
                    color: isPlaying ? T.danger : T.primaryText,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', flexShrink: 0, transition: 'all 0.12s',
                    boxShadow: isPlaying ? `0 0 8px ${T.danger}44` : `0 0 8px ${T.primary}33`,
                  }}
                >
                  {isPlaying ? <Square size={14} /> : <Play size={14} />}
                </button>
                <IconBtn onClick={onRewind} title="Rewind to start">
                  <SkipBack size={14} />
                </IconBtn>
                {onRecord && (
                  <IconBtn onClick={onRecord} title="Grabar tablatura"
                    activeBg={T.dangerBg} activeColor={T.danger} activeBorder={T.danger}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="12" cy="12" r="7" />
                    </svg>
                  </IconBtn>
                )}
              </Group>

              <Divider />

              {/* Loop + Metronome */}
              <Group>
                <IconBtn
                  onClick={onLoopToggle}
                  onAltClick={onToggleLoopRange}
                  title={loopRangeActive
                    ? 'Loop playback · A→B range active · Alt+click to clear range'
                    : 'Loop playback · Alt+click to set A→B range'}
                  active={loop}
                  activeBg={T.greenBg}
                  activeColor={T.green}
                  activeBorder={T.green}
                >
                  <RotateCcw size={14} />
                </IconBtn>
                <IconBtn onClick={onMetronomeToggle} title="Metronome" active={metronome}
                  activeBg={T.amberBg} activeColor={T.amber} activeBorder={T.amber}>
                  {metronome ? <Bell size={14} /> : <BellOff size={14} />}
                </IconBtn>
              </Group>

              <Divider />

              {/* Undo / Redo */}
              <Group>
                <IconBtn onClick={onUndo} title="Undo  Ctrl+Z" disabled={!canUndo}>
                  <Undo2 size={14} />
                </IconBtn>
                <IconBtn onClick={onRedo} title="Redo  Ctrl+Y" disabled={!canRedo}>
                  <Redo2 size={14} />
                </IconBtn>
              </Group>

              <Divider />

              {/* Tempo */}
              <Group>
                <LabeledControl label="BPM">
                  <ScrubInput value={bpm} min={40} max={240} onChange={onBpmChange} width={54}
                    title="Drag ◂▸ or scroll · double-click to type" />
                </LabeledControl>
                <TapButton flash={tapFlash} onClick={handleTap} />
              </Group>

              <div style={{ flex: 1 }} />

              {/* File operations */}
              <Group>
                <IconBtn onClick={onImportMidi} title="Import MIDI (.mid)">
                  <Upload size={14} />
                </IconBtn>
                <ExportDropdown
                  onExportAscii={onExportAscii}
                  onExportMidi={onExportMidi}
                  onExportWav={onExportWav}
                  onExportImage={onExportImage}
                  onExportVideo={onExportVideo}
                />
                <IconBtn onClick={onShareUrl} title="Copy share URL">
                  <Share2 size={14} />
                </IconBtn>
              </Group>

              <Divider />

              {/* Overflow: Zoom, Bars, Volume, MIDI in, Clear */}
              <OverflowMenu
                zoom={zoom} fitWidth={fitWidth ?? false}
                onZoomIn={onZoomIn} onZoomOut={onZoomOut} onZoomReset={onZoomReset}
                onFitWidthToggle={onFitWidthToggle ?? (() => {})}
                totalBars={totalBars} onBarsChange={onBarsChange}
                volume={volume} onVolumeChange={onVolumeChange}
                midiInputAvailable={midiInputAvailable}
                midiInputActive={midiInputActive}
                midiDeviceName={midiDeviceName}
                onMidiInputToggle={onMidiInputToggle}
                onClearAll={onClearAll}
              />
            </div>

            {/* ── Row 2: Composition tools (always visible) ── */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '0 10px', height: 40,
              overflowX: 'auto', overflowY: 'hidden',
            }}>
              <LabeledControl label="Duration">
                <DurationPicker value={noteDuration} onChange={onNoteDurationChange} />
              </LabeledControl>

              <Divider />

              <Divider />

              <LabeledControl label="Sound">
                <SegmentedBtns
                  options={[
                    { value: 'fender',   label: 'Fender' },
                    { value: 'finger',   label: 'Finger' },
                    { value: 'slap',     label: 'Slap' },
                    { value: 'muted',    label: 'Muted' },
                  ]}
                  value={sound}
                  onChange={v => onSoundChange(v as BassSound)}
                />
              </LabeledControl>

              {onBeatsPerBarChange && (
                <>
                  <Divider />
                  <LabeledControl label="Time">
                    <SegmentedBtns
                      options={[2, 3, 4, 5, 6, 7, 8].map(n => ({ value: n, label: `${n}/4` }))}
                      value={bpb}
                      onChange={v => onBeatsPerBarChange(v as number)}
                    />
                  </LabeledControl>
                </>
              )}

              {hasSelectedNote && selectedNoteFret !== null && (
                <>
                  <div style={{ flex: 1 }} />
                  <LabeledControl label="Fret">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <StepBtn onClick={() => onFretChange(Math.max(0, selectedNoteFret - 1))} label="−" />
                      <ScrubInput value={selectedNoteFret} min={0} max={24} onChange={onFretChange} width={38}
                        title="Drag to change fret · double-click to type" />
                      <StepBtn onClick={() => onFretChange(Math.min(24, selectedNoteFret + 1))} label="+" />
                    </div>
                  </LabeledControl>
                </>
              )}
            </div>
          </>
        )}
      </div>

    </div>
  )
}

// ── Shared label style ─────────────────────────────────────────────────────
const labelStyle: React.CSSProperties = {
  fontSize: 9, fontWeight: 600, letterSpacing: '0.06em',
  textTransform: 'uppercase', color: 'hsl(220 10% 50%)', lineHeight: 1,
  marginBottom: 3, display: 'block',
}

// ── Sub-components ─────────────────────────────────────────────────────────

function Group({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>{children}</div>
}

function Divider() {
  return <div style={{ width: 1, height: 22, background: T.border, flexShrink: 0, margin: '0 1px' }} />
}

function MDivider() {
  return <div style={{ width: 1, height: 32, background: T.border, flexShrink: 0, margin: '0 2px' }} />
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
  onAltClick?: () => void
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

function IconBtn({ children, onClick, onAltClick, title, disabled, active, activeBg, activeColor, activeBorder, hoverBg, hoverColor, hoverBorder }: IconBtnProps) {
  const [hov, setHov] = useState(false)
  const bg     = active ? (activeBg    ?? T.primaryBg)  : hov ? (hoverBg    ?? T.surfaceHov) : T.surface
  const color  = active ? (activeColor ?? T.primaryText) : hov ? (hoverColor ?? T.text)       : T.muted
  const border = active ? (activeBorder ?? T.primary)    : hov ? (hoverBorder ?? T.border)    : T.border
  const handleClick = (e: React.MouseEvent) => {
    if (e.altKey && onAltClick) { e.preventDefault(); onAltClick() }
    else onClick?.()
  }
  return (
    <button
      onClick={handleClick} disabled={disabled} title={title}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 32, height: 32, background: bg, color, cursor: disabled ? 'not-allowed' : 'pointer',
        border: `1px solid ${border}`, borderRadius: 6,
        opacity: disabled ? 0.28 : 1, transition: 'all 0.1s',
        fontFamily: 'inherit', flexShrink: 0,
      }}
    >
      {children}
    </button>
  )
}

// Mobile icon button — larger touch target
function MIconBtn({ children, onClick, title, disabled, active, activeBg, activeColor, activeBorder, hoverBg, hoverColor, hoverBorder }: IconBtnProps) {
  const [hov, setHov] = useState(false)
  const bg     = active ? (activeBg    ?? T.primaryBg)  : hov ? (hoverBg    ?? T.surfaceHov) : T.surface
  const color  = active ? (activeColor ?? T.primaryText) : hov ? (hoverColor ?? T.text)       : T.muted
  const border = active ? (activeBorder ?? T.primary)    : hov ? (hoverBorder ?? T.border)    : T.border
  return (
    <button
      onClick={onClick} disabled={disabled} title={title}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minWidth: 38, height: 38, padding: '0 6px', background: bg, color,
        cursor: disabled ? 'not-allowed' : 'pointer',
        border: `1px solid ${border}`, borderRadius: 8,
        opacity: disabled ? 0.28 : 1, transition: 'all 0.1s',
        fontFamily: 'inherit', flexShrink: 0, touchAction: 'manipulation',
        WebkitTapHighlightColor: 'transparent',
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
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        width: 22, height: 32, background: hov ? T.surfaceHov : T.surface,
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

// ── ScrubInput ─────────────────────────────────────────────────────────────
interface ScrubInputProps {
  value: number; min: number; max: number; step?: number
  onChange: (v: number) => void; width?: number; title?: string
}

function ScrubInput({ value, min, max, step = 1, onChange, width = 58, title }: ScrubInputProps) {
  const [editing, setEditing] = useState(false)
  const [editStr, setEditStr] = useState(String(value))
  const [hov, setHov]         = useState(false)
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
    const sensitivity = e.shiftKey ? 0.1 : 1
    onChange(clamp(dragRef.current.val + (e.clientX - dragRef.current.x) * sensitivity))
  }
  const handlePointerUp   = () => { dragRef.current = null }
  const handleDblClick    = () => {
    setEditing(true); setEditStr(String(value))
    requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.select() })
  }
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault(); onChange(clamp(value + (e.deltaY < 0 ? step : -step)))
  }
  const commit = () => {
    const v = parseFloat(editStr); if (!isNaN(v)) onChange(clamp(v)); setEditing(false)
  }

  if (editing) {
    return (
      <input ref={inputRef} type="number" value={editStr}
        onChange={e => setEditStr(e.target.value)} onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
        style={{ width, height: 32, background: T.surface, border: `1px solid ${T.primary}`, borderRadius: 5, color: T.text, fontSize: 12, textAlign: 'center', fontFamily: FONT, outline: 'none' }}
      />
    )
  }

  return (
    <div
      onPointerDown={handlePointerDown} onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp}
      onDoubleClick={handleDblClick} onWheel={handleWheel}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      title={title}
      style={{
        width, height: 32, background: dragRef.current ? T.surfaceHov : T.surface,
        border: `1px solid ${(hov || dragRef.current) ? T.primary + '88' : T.border}`,
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

// ── TapButton ──────────────────────────────────────────────────────────────
function TapButton({ flash, onClick, mobile }: { flash: boolean; onClick: () => void; mobile?: boolean }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      title="Tap to set tempo"
      style={{
        height: mobile ? 36 : 32, padding: '0 10px',
        background: flash ? T.amberBg : hov ? T.surfaceHov : T.surface,
        border: `1px solid ${flash ? T.amber : T.border}`,
        borderRadius: mobile ? 8 : 5,
        color: flash ? T.amber : T.muted,
        fontSize: 10, fontWeight: 600, letterSpacing: '0.04em',
        fontFamily: FONT, cursor: 'pointer', transition: 'all 0.1s',
        touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
        flexShrink: 0,
      }}
    >
      TAP
    </button>
  )
}

// ── SegmentedBtns ──────────────────────────────────────────────────────────
interface SegOption { value: number | string; label: string }
interface SegProps   { options: SegOption[]; value: number | string; onChange: (v: number | string) => void }

function SegmentedBtns({ options, value, onChange }: SegProps) {
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {options.map(opt => (
        <SegBtn key={String(opt.value)} label={opt.label} active={opt.value === value} onClick={() => onChange(opt.value)} />
      ))}
    </div>
  )
}

function SegBtn({ label, active, onClick, title }: { label: string; active: boolean; onClick: () => void; title?: string }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick} title={title}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        height: 32, padding: '0 8px',
        background: active ? T.primaryBg : hov ? T.surfaceHov : T.surface,
        border: `1px solid ${active ? T.primary : T.border}`,
        borderRadius: 5, color: active ? T.primaryText : hov ? T.text : T.muted,
        fontSize: 11, fontFamily: FONT, cursor: 'pointer', flexShrink: 0,
        transition: 'all 0.1s',
      }}
    >
      {label}
    </button>
  )
}

// ── DurationPicker ─────────────────────────────────────────────────────────
function DurationPicker({ value, onChange, prominent = false }: { value: number; onChange: (v: number) => void; prominent?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: prominent ? 3 : 2 }}>
      {DURATION_OPTS.map(o => {
        const active = value === o.v
        return (
          <DurationBtn key={o.v} label={o.label} sub={o.sub} title={o.title} active={active} prominent={prominent} onClick={() => onChange(o.v)} />
        )
      })}
    </div>
  )
}

function DurationBtn({ label, sub, title, active, prominent, onClick }: {
  label: string; sub: string; title: string; active: boolean; prominent: boolean; onClick: () => void
}) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick} title={title}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        height: 28, padding: '0 9px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
        background: active ? T.primaryBg : hov ? T.surfaceHov : T.surface,
        border: `1px solid ${active ? T.primary : T.border}`,
        borderRadius: 6, color: active ? T.primaryText : hov ? T.text : T.muted,
        cursor: 'pointer', flexShrink: 0, transition: 'all 0.1s',
        boxShadow: active ? `0 0 6px ${T.primary}33` : 'none',
      }}
    >
      <span style={{ fontSize: 11, fontWeight: active ? 600 : 400, lineHeight: 1 }}>{label}</span>
      <span style={{ fontSize: 8, lineHeight: 1, opacity: 0.55 }}>{sub}</span>
    </button>
  )
}

// ── ExportDropdown ─────────────────────────────────────────────────────────
function ExportDropdown({ onExportAscii, onExportMidi, onExportWav, onExportImage, onExportVideo }: {
  onExportAscii: () => void; onExportMidi: () => void; onExportWav?: () => void
  onExportImage?: () => void; onExportVideo?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [pos,  setPos]  = useState({ top: 0, right: 0 })
  const [hov, setHov]   = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef   = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current  && !panelRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleOpen = () => {
    if (!open && triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 4, right: window.innerWidth - r.right })
    }
    setOpen(o => !o)
  }

  return (
    <>
      <button
        ref={triggerRef}
        onClick={handleOpen}
        onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
        title="Export"
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          height: 32, padding: '0 10px', borderRadius: 6,
          background: open ? T.primaryBg : hov ? T.surfaceHov : T.surface,
          border: `1px solid ${open ? T.primary : T.border}`,
          color: open ? T.primaryText : hov ? T.text : T.muted,
          fontSize: 11, fontFamily: FONT, cursor: 'pointer',
          transition: 'all 0.1s', flexShrink: 0,
        }}
      >
        <Download size={13} />
        <span>Export</span>
        <ChevronDown size={11} style={{ opacity: 0.5 }} />
      </button>
      {open && (
        <div ref={panelRef} style={{
          position: 'fixed', top: pos.top, right: pos.right,
          background: 'hsl(224 20% 13%)',
          border: `1px solid ${T.border}`, borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.55)',
          padding: 4, minWidth: 170, zIndex: 99999,
          display: 'flex', flexDirection: 'column', gap: 1,
        }}>
          <DropdownItem icon={<Music size={13} />} label="MIDI  (.mid)"
            onClick={() => { onExportMidi(); setOpen(false) }} />
          <DropdownItem icon={<Download size={13} />} label="ASCII Tab  (.txt)"
            onClick={() => { onExportAscii(); setOpen(false) }} />
          {onExportWav && (
            <DropdownItem icon={<Waves size={13} />} label="Audio  (.wav)"
              onClick={() => { onExportWav(); setOpen(false) }} />
          )}
          {onExportImage && (
            <DropdownItem icon={<ImageIcon size={13} />} label="Image  (.png)"
              onClick={() => { onExportImage(); setOpen(false) }} />
          )}
          {onExportVideo && (
            <DropdownItem icon={<Video size={13} />} label="Video  (.webm)"
              onClick={() => { onExportVideo(); setOpen(false) }} />
          )}
        </div>
      )}
    </>
  )
}

function DropdownItem({ icon, label, onClick, danger }: {
  icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean
}) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 10px', borderRadius: 5, border: 'none',
        background: hov ? (danger ? T.dangerBg : T.surfaceHov) : 'transparent',
        color: danger ? (hov ? T.danger : `${T.danger}bb`) : hov ? T.text : T.muted,
        fontSize: 12, fontFamily: FONT, cursor: 'pointer',
        transition: 'all 0.08s', textAlign: 'left', width: '100%',
      }}
    >
      {icon}<span>{label}</span>
    </button>
  )
}

// ── OverflowMenu (⋯) ───────────────────────────────────────────────────────
interface OverflowMenuProps {
  zoom: number; fitWidth: boolean
  onZoomIn: () => void; onZoomOut: () => void; onZoomReset: () => void; onFitWidthToggle: () => void
  totalBars: number; onBarsChange: (n: number) => void
  volume: number; onVolumeChange: (v: number) => void
  midiInputAvailable?: boolean; midiInputActive?: boolean; midiDeviceName?: string | null
  onMidiInputToggle?: () => void
  onClearAll: () => void
}

function OverflowMenu(p: OverflowMenuProps) {
  const [open, setOpen]                = useState(false)
  const [pos,  setPos]                 = useState({ top: 0, right: 0 })
  const [clearConfirm, setClearConfirm] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef   = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current  && !panelRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) { setOpen(false); setClearConfirm(false) }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleOpen = () => {
    if (!open && triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 4, right: window.innerWidth - r.right })
    }
    setOpen(o => !o)
  }

  return (
    <>
      <button
        ref={triggerRef}
        onClick={handleOpen}
        title="More options"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 32, height: 32,
          background: open ? T.primaryBg : T.surface,
          color: open ? T.primaryText : T.muted,
          border: `1px solid ${open ? T.primary : T.border}`,
          borderRadius: 6, cursor: 'pointer', flexShrink: 0,
          transition: 'all 0.1s',
        }}
      >
        <MoreHorizontal size={14} />
      </button>
      {open && (
        <div ref={panelRef} style={{
          position: 'fixed', top: pos.top, right: pos.right,
          background: 'hsl(224 20% 13%)',
          border: `1px solid ${T.border}`, borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.55)',
          padding: 10, minWidth: 230, zIndex: 9999,
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>

          {/* View section */}
          <OverflowSection label="View">
            <OverflowRow label="Zoom">
              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <IconBtn onClick={p.onZoomOut} title="Zoom out" disabled={p.zoom <= 0.4 || p.fitWidth}>
                  <span style={{ fontSize: 13, lineHeight: 1 }}>−</span>
                </IconBtn>
                <button
                  onClick={p.fitWidth ? undefined : p.onZoomReset}
                  style={{
                    minWidth: 44, height: 32, padding: '0 4px',
                    background: p.fitWidth ? T.primaryBg : p.zoom !== 1 ? T.surfaceHov : T.surface,
                    border: `1px solid ${p.fitWidth ? T.primary : p.zoom !== 1 ? `${T.primary}66` : T.border}`,
                    borderRadius: 5,
                    color: p.fitWidth ? T.primaryText : p.zoom !== 1 ? T.primaryText : T.muted,
                    fontSize: 11, fontFamily: FONT,
                    cursor: p.fitWidth ? 'default' : 'pointer', transition: 'all 0.1s',
                  }}
                >
                  {p.fitWidth ? 'fit' : `${Math.round(p.zoom * 100)}%`}
                </button>
                <IconBtn onClick={p.onZoomIn} title="Zoom in" disabled={p.zoom >= 4 || p.fitWidth}>
                  <span style={{ fontSize: 13, lineHeight: 1 }}>+</span>
                </IconBtn>
                <IconBtn onClick={p.onFitWidthToggle} title="Fit to window width"
                  active={p.fitWidth} activeBg={T.primaryBg} activeColor={T.primaryText} activeBorder={T.primary}>
                  <span style={{ fontSize: 11, letterSpacing: '-1px' }}>↔</span>
                </IconBtn>
              </div>
            </OverflowRow>

            <OverflowRow label="Bars">
              <StepInput value={p.totalBars} min={1} max={64} onChange={p.onBarsChange} options={[2, 4, 8, 16, 32]} />
            </OverflowRow>

            <OverflowRow label={`Volume  ${Math.round(p.volume * 100)}%`}>
              <input
                type="range" min={0} max={1} step={0.01} value={p.volume}
                onChange={e => p.onVolumeChange(Number(e.target.value))}
                style={{ width: 90, accentColor: T.primary, cursor: 'pointer', height: 20 }}
              />
            </OverflowRow>
          </OverflowSection>

          {p.midiInputAvailable && p.onMidiInputToggle && (
            <>
              <OverflowDivider />
              <button
                onClick={p.onMidiInputToggle}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 4px', borderRadius: 5, border: 'none', background: 'transparent',
                  color: p.midiInputActive ? 'hsl(280 80% 70%)' : T.muted,
                  fontSize: 12, fontFamily: FONT, cursor: 'pointer', width: '100%',
                  transition: 'color 0.1s',
                }}
              >
                <Piano size={13} />
                <span style={{ flex: 1, textAlign: 'left' }}>
                  {p.midiInputActive ? `MIDI: ${p.midiDeviceName ?? 'connected'}` : 'MIDI Input'}
                </span>
                <div style={{
                  width: 28, height: 16, borderRadius: 8, flexShrink: 0,
                  background: p.midiInputActive ? 'hsl(280 70% 45%)' : T.border,
                  position: 'relative', transition: 'background 0.2s',
                }}>
                  <div style={{
                    position: 'absolute', top: 2,
                    left: p.midiInputActive ? 14 : 2,
                    width: 12, height: 12, borderRadius: '50%',
                    background: 'white', transition: 'left 0.15s',
                  }} />
                </div>
              </button>
            </>
          )}

          <OverflowDivider />

          {!clearConfirm ? (
            <DropdownItem icon={<Trash2 size={13} />} label="Clear all notes"
              onClick={() => setClearConfirm(true)} danger />
          ) : (
            <div>
              <div style={{ fontSize: 11, color: T.danger, marginBottom: 6, padding: '0 2px' }}>
                Delete all notes?
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  onClick={() => { p.onClearAll(); setOpen(false); setClearConfirm(false) }}
                  style={{
                    flex: 1, height: 28, background: T.dangerBg, border: `1px solid ${T.danger}`,
                    borderRadius: 5, color: T.danger, fontSize: 11, fontFamily: FONT, cursor: 'pointer',
                  }}
                >
                  Clear
                </button>
                <button
                  onClick={() => setClearConfirm(false)}
                  style={{
                    flex: 1, height: 28, background: T.surface, border: `1px solid ${T.border}`,
                    borderRadius: 5, color: T.muted, fontSize: 11, fontFamily: FONT, cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  )
}

function OverflowSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: T.primary, paddingLeft: 2 }}>
        {label}
      </div>
      {children}
    </div>
  )
}

function OverflowRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 11, color: T.muted, minWidth: 56 }}>{label}</span>
      {children}
    </div>
  )
}

function OverflowDivider() {
  return <div style={{ height: 1, background: T.border }} />
}

// ── StepInput (Bars) ───────────────────────────────────────────────────────
function StepInput({ value, min, max, onChange, options }: { value: number; min: number; max: number; onChange: (v: number) => void; options: number[] }) {
  const [open, setOpen] = useState(false)
  const [hov, setHov]   = useState(false)
  const idx  = options.indexOf(value)
  const prev = idx > 0 ? options[idx - 1] : (value > min ? value - 1 : null)
  const next = idx < options.length - 1 ? options[idx + 1] : (value < max ? value + 1 : null)

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: 2 }}>
        <StepBtn onClick={() => prev !== null && onChange(prev)} label="−" />
        <button
          onClick={() => setOpen(o => !o)}
          onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
          title="Click for presets"
          style={{
            width: 36, height: 32, background: hov ? T.surfaceHov : T.surface,
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
            background: 'hsl(224 20% 14%)', border: `1px solid ${T.border}`, borderRadius: 7,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            padding: 4, display: 'flex', flexDirection: 'column', gap: 2, zIndex: 9999, minWidth: 80,
          }}
          onMouseLeave={() => setOpen(false)}
        >
          {options.map(opt => (
            <button
              key={opt} onClick={() => { onChange(opt); setOpen(false) }}
              style={{
                background: opt === value ? T.primaryBg : 'transparent',
                border: 'none', borderRadius: 5,
                color: opt === value ? T.primaryText : T.text,
                padding: '4px 10px', fontSize: 12, textAlign: 'left', fontFamily: FONT, cursor: 'pointer',
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
