import React, { useRef, useState } from 'react'
import {
  Play, Square, RotateCcw, Repeat,
  Undo2, Redo2, Trash2, Download, Share2, Bell, BellOff, Music,
  ChevronDown, ChevronUp,
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

const DURATION_OPTS = [
  { v: 4,    label: '𝅝',  sub: '4b',  title: 'Whole (4 beats) — key 1' },
  { v: 2,    label: '𝅗𝅥',  sub: '2b',  title: 'Half (2 beats) — key 2' },
  { v: 1,    label: '♩',  sub: '1b',  title: 'Quarter (1 beat) — key 3' },
  { v: 0.5,  label: '♪',  sub: '½b',  title: 'Eighth (½ beat) — key 4' },
  { v: 0.25, label: '𝅘𝅥𝅯', sub: '¼b',  title: '16th (¼ beat) — key 5' },
]

interface TransportProps {
  isPlaying: boolean; loop: boolean; bpm: number
  snap: SnapValue; sound: BassSound; totalBars: number
  zoom: number; volume: number; noteDuration: number
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
}

export function BassTabTransport(props: TransportProps) {
  const {
    isPlaying, loop, bpm, snap, sound, totalBars, zoom, volume, noteDuration,
    selectedNoteFret, hasSelectedNote, canUndo, canRedo, metronome,
    onPlay, onStop, onLoopToggle, onBpmChange, onSnapChange, onSoundChange,
    onBarsChange, onZoomIn, onZoomOut, onZoomReset, onFretChange, onVolumeChange,
    onUndo, onRedo, onClearAll, onExportAscii, onExportMidi, onShareUrl, onMetronomeToggle,
    onNoteDurationChange,
    isMobile = false, compact = false, onToggleExpand,
    currentBeat = 0, beatsPerBar = 4,
    fitWidth = false, onFitWidthToggle,
    desktopCompact = false, onToggleDesktopCompact,
  } = props

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
                    { value: 'electric', label: 'Elec' },
                    { value: 'picked',   label: 'Pick' },
                    { value: 'synth',    label: 'Synth' },
                    { value: 'slap',     label: 'Slap' },
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

              <div style={{ flex: 1, minWidth: 110 }}>
                <div style={labelStyle}>Grid</div>
                <div style={{ display: 'flex', gap: 3 }}>
                  {([
                    { value: 0.25   as SnapValue, label: '¼' },
                    { value: 0.125  as SnapValue, label: '⅛' },
                    { value: 0.0625 as SnapValue, label: '¹⁄₁₆' },
                  ]).map(opt => {
                    const active = snap === opt.value
                    return (
                      <button
                        key={opt.value}
                        onClick={() => onSnapChange(opt.value)}
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
              <MIconBtn onClick={onLoopToggle} active={loop} title="Loop"
                activeBg={T.greenBg} activeColor={T.green} activeBorder={T.green}>
                <Repeat size={14} />
              </MIconBtn>
              <MIconBtn onClick={onMetronomeToggle} active={metronome} title="Metronome"
                activeBg={T.amberBg} activeColor={T.amber} activeBorder={T.amber}>
                {metronome ? <Bell size={14} /> : <BellOff size={14} />}
              </MIconBtn>

              <MDivider />

              {/* Bars */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <MIconBtn onClick={() => onBarsChange(Math.max(1, totalBars - 1))} title="Remove bar">
                  <span style={{ fontSize: 14, lineHeight: 1 }}>−</span>
                </MIconBtn>
                <span style={{ fontSize: 12, color: T.text, minWidth: 28, textAlign: 'center', fontFamily: 'ui-monospace, monospace' }}>
                  {totalBars}
                </span>
                <MIconBtn onClick={() => onBarsChange(Math.min(64, totalBars + 1))} title="Add bar">
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

              <MIconBtn onClick={onExportAscii} title="Copy ASCII tab">
                <Download size={14} />
              </MIconBtn>
              <MIconBtn onClick={onExportMidi} title="Download MIDI">
                <Music size={14} />
              </MIconBtn>
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
          /* ── Desktop layout (unchanged) ─────────────────────────────── */
          <>
            {/* Row 1 */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '4px 10px', borderBottom: `1px solid ${T.border}`,
              overflowX: 'auto', overflowY: 'hidden',
            }}>
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
                <IconBtn onClick={onStop} title="Reset to start">
                  <RotateCcw size={12} />
                </IconBtn>
              </Group>

              <Divider />

              <Group>
                <IconBtn onClick={onLoopToggle} title="Loop" active={loop}
                  activeBg={T.greenBg} activeColor={T.green} activeBorder={T.green}>
                  <Repeat size={12} />
                </IconBtn>
                <IconBtn onClick={onMetronomeToggle} title="Metronome" active={metronome}
                  activeBg={T.amberBg} activeColor={T.amber} activeBorder={T.amber}>
                  {metronome ? <Bell size={12} /> : <BellOff size={12} />}
                </IconBtn>
              </Group>

              <Divider />

              <Group>
                <IconBtn onClick={onUndo} title="Undo  Ctrl+Z" disabled={!canUndo}>
                  <Undo2 size={12} />
                </IconBtn>
                <IconBtn onClick={onRedo} title="Redo  Ctrl+Y" disabled={!canRedo}>
                  <Redo2 size={12} />
                </IconBtn>
              </Group>

              <Divider />

              <Group>
                <LabeledControl label="BPM">
                  <ScrubInput value={bpm} min={40} max={240} onChange={onBpmChange} width={54}
                    title="Drag ◂▸ or scroll · double-click to type" />
                </LabeledControl>
                <TapButton flash={tapFlash} onClick={handleTap} />
              </Group>

              <Divider />

              <LabeledControl label="Bars">
                <StepInput value={totalBars} min={1} max={64} onChange={onBarsChange} options={[2, 4, 8, 16, 32]} />
              </LabeledControl>

              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Group>
                  <IconBtn onClick={onZoomOut} title="Zoom out" disabled={zoom <= 0.4 || fitWidth}>
                    <span style={{ fontSize: 12, lineHeight: 1 }}>−</span>
                  </IconBtn>
                  <button
                    onClick={fitWidth ? undefined : onZoomReset}
                    title={fitWidth ? 'Fit mode active' : 'Reset zoom to 100%'}
                    style={{
                      minWidth: 40, height: 32, padding: '0 5px',
                      background: fitWidth ? T.primaryBg : zoom !== 1 ? T.surfaceHov : T.surface,
                      border: `1px solid ${fitWidth ? T.primary : zoom !== 1 ? T.primary + '55' : T.border}`,
                      borderRadius: 5,
                      color: fitWidth ? T.primaryText : zoom !== 1 ? T.primaryText : T.muted,
                      fontSize: 11, fontFamily: FONT,
                      cursor: fitWidth ? 'default' : zoom !== 1 ? 'pointer' : 'default',
                      fontVariantNumeric: 'tabular-nums', transition: 'all 0.1s',
                    }}
                  >
                    {fitWidth ? 'fit' : `${Math.round(zoom * 100)}%`}
                  </button>
                  <IconBtn onClick={onZoomIn} title="Zoom in" disabled={zoom >= 4 || fitWidth}>
                    <span style={{ fontSize: 12, lineHeight: 1 }}>+</span>
                  </IconBtn>
                  <IconBtn
                    onClick={onFitWidthToggle} title="Fit to window width"
                    active={fitWidth} activeBg={T.primaryBg} activeColor={T.primaryText} activeBorder={T.primary}
                  >
                    <span style={{ fontSize: 12, lineHeight: 1, letterSpacing: '-1px' }}>↔</span>
                  </IconBtn>
                </Group>

                <Divider />

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

                <Divider />

                <IconBtn onClick={onToggleDesktopCompact} title={desktopCompact ? 'Show more controls' : 'Hide controls row'}>
                  {desktopCompact ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
                </IconBtn>
              </div>
            </div>

            {/* Row 2 — collapsible */}
            <div style={{ overflow: 'hidden', maxHeight: desktopCompact ? 0 : 58, transition: 'max-height 0.18s ease' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', overflowX: 'auto', overflowY: 'hidden' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: T.primary, lineHeight: 1 }}>
                  Duration
                </span>
                <DurationPicker value={noteDuration} onChange={onNoteDurationChange} prominent />
              </div>

              <Divider />

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

              <LabeledControl label={`Vol ${Math.round(volume * 100)}%`}>
                <input
                  type="range" min={0} max={1} step={0.01} value={volume}
                  onChange={e => onVolumeChange(Number(e.target.value))}
                  style={{ width: 68, accentColor: T.primary, cursor: 'pointer', height: 32 }}
                />
              </LabeledControl>

              {hasSelectedNote && selectedNoteFret !== null && (
                <>
                  <Divider />
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
            </div>{/* end accordion */}
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
  const bg     = active ? (activeBg    ?? T.primaryBg)  : hov ? (hoverBg    ?? T.surfaceHov) : T.surface
  const color  = active ? (activeColor ?? T.primaryText) : hov ? (hoverColor ?? T.text)       : T.muted
  const border = active ? (activeBorder ?? T.primary)    : hov ? (hoverBorder ?? T.border)    : T.border
  return (
    <button
      onClick={onClick} disabled={disabled} title={title}
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
  const h = prominent ? 36 : 28
  return (
    <button
      onClick={onClick} title={title}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        height: h, padding: prominent ? '0 10px' : '0 7px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
        background: active ? T.primaryBg : hov ? T.surfaceHov : T.surface,
        border: `1px solid ${active ? T.primary : T.border}`,
        borderRadius: 6, color: active ? T.primaryText : hov ? T.text : T.muted,
        cursor: 'pointer', flexShrink: 0, transition: 'all 0.1s',
        boxShadow: active ? `0 0 8px ${T.primary}44` : 'none',
      }}
    >
      <span style={{ fontSize: prominent ? 14 : 12, lineHeight: 1 }}>{label}</span>
      {prominent && <span style={{ fontSize: 8, lineHeight: 1, opacity: 0.7 }}>{sub}</span>}
    </button>
  )
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
