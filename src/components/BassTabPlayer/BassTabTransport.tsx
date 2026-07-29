import React, { useRef, useState } from 'react'
import {
  Play, Square, SkipBack, RotateCcw,
  Undo2, Redo2, Trash2, Download, Share2, Bell, BellOff, Music, Upload,
  ChevronDown, ChevronUp, Waves, Piano, FileMusic, Guitar,
} from 'lucide-react'
import { type BassSound } from '../../lib/bassTab/types'
import { v, f } from '../../lib/bassTab/theme'
import { TransportMenu } from './TransportMenu'

const T = {
  bg:          'var(--bt-sunken)',
  surface:     'var(--bt-sunken)',
  surfaceHov:  'var(--bt-rule)',
  border:      'var(--bt-rule)',
  text:        'var(--bt-ink)',
  muted:       'var(--bt-soft)',
  primary:     'var(--bt-accent)',
  primaryBg:   'var(--bt-accent-wash)',
  primaryText: 'var(--bt-accent)',
  danger:      'var(--bt-danger)',
  dangerBg:    'var(--bt-danger-wash)',
  amber:       'var(--bt-warn)',
  amberBg:     'var(--bt-warn-wash)',
  green:       'var(--bt-ok)',
  greenBg:     'var(--bt-ok-wash)',
}

const FONT = f('ui')

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
  volume: number; noteDuration: number
  selectedNoteFret: number | null; hasSelectedNote: boolean
  canUndo: boolean; canRedo: boolean; metronome: boolean
  onPlay: () => void; onStop: () => void; onRewind: () => void; onLoopToggle: () => void
  onBpmChange: (bpm: number) => void
  onSoundChange: (sound: BassSound) => void; onBarsChange: (bars: number) => void
  onFretChange: (fret: number) => void; onVolumeChange: (vol: number) => void
  onUndo: () => void; onRedo: () => void; onClearAll: () => void
  onExportAscii: () => void; onExportMidi: () => void; onImportMidi: () => void; onImportGp: () => void
  onShareUrl: () => void; onMetronomeToggle: () => void
  onNoteDurationChange: (d: number) => void
  // Responsive additions
  isMobile?: boolean
  compact?: boolean
  onToggleExpand?: () => void
  currentBeat?: number
  beatsPerBar?: number
  // Recording
  onRecord?: () => void
  // Dock del diapasón (solo escritorio)
  fretboardVisible?: boolean
  onFretboardToggle?: () => void
  // Feature 6: MIDI input
  midiInputAvailable?: boolean
  midiInputActive?: boolean
  midiDeviceName?: string | null
  onMidiInputToggle?: () => void
  // Feature 8: export WAV
  onExportWav?: () => void
  onExportImage?: () => void
  onExportPdf?: () => void
  onExportVideo?: () => void
  // Feature 2: loop range (toggle on/off)
  loopRangeActive?: boolean
  onToggleLoopRange?: () => void
}

export function BassTabTransport(props: TransportProps) {
  const {
    isPlaying, loop, bpm, sound, totalBars, volume, noteDuration,
    selectedNoteFret, hasSelectedNote, canUndo, canRedo, metronome,
    onPlay, onStop, onRewind, onLoopToggle, onBpmChange, onSoundChange,
    onBarsChange, onFretChange, onVolumeChange,
    onUndo, onRedo, onClearAll, onExportAscii, onExportMidi, onImportMidi, onImportGp, onShareUrl, onMetronomeToggle,
    onNoteDurationChange,
    isMobile = false, compact = false, onToggleExpand,
    currentBeat = 0, beatsPerBar = 4,
    fretboardVisible, onFretboardToggle,
    midiInputAvailable, midiInputActive, midiDeviceName, onMidiInputToggle,
    onExportWav, onExportImage, onExportVideo, onExportPdf,
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
      // En escritorio el chasis lo pinta la barra oscura de dentro; en móvil
      // sigue siendo un bloque claro colgando de la cabecera.
      background: isMobile ? T.bg : 'transparent',
      borderBottom: isMobile ? `1px solid ${T.border}` : 'none',
      fontFamily: FONT,
      flexShrink: 0, userSelect: 'none', display: 'flex', flexDirection: 'column',
    }}>

      {/* ══════════════════════════════════════════════════════════════════════
          MOBILE COMPACT BAR — always visible on mobile
      ══════════════════════════════════════════════════════════════════════ */}
      {isMobile && (
        <div style={{
          height: 62, display: 'flex', alignItems: 'center', gap: 6,
          padding: '0 14px',
          borderBottom: compact ? 'none' : `1px solid ${T.border}`,
        }}>

          {/* Play / Stop */}
          <button
            onClick={isPlaying ? onStop : onPlay}
            title={isPlaying ? 'Stop' : 'Play'}
            style={{
              width: 52, height: 52, borderRadius: 26, flexShrink: 0,
              position: 'relative',
              background: isPlaying ? T.danger : T.primary,
              border: 'none',
              color: 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', transition: 'all 0.15s',
              boxShadow: isPlaying ? 'none' : `0 0 22px ${T.primary}66, 0 4px 12px rgba(0,0,0,0.3)`,
            }}
          >
            {isPlaying && (
              <span className="animate-ping" style={{
                position: 'absolute', inset: 0, borderRadius: 26,
                background: T.danger, opacity: 0.25, pointerEvents: 'none',
              }} />
            )}
            {isPlaying ? <Square size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-0.5" />}
          </button>

          {/* Record button */}
          {onRecord && (
            <button
              onClick={onRecord}
              title="Record tab"
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
                fontFamily: 'var(--bt-mono)', fontSize: 14, fontWeight: 600,
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
          COLLAPSIBLE AREA — filas plegables en móvil, barra fija en escritorio

          El `overflow: hidden` es solo para que la animación de plegado no
          desborde en móvil. En escritorio tiene que quedar fuera: los menús de
          Import y Export se abren hacia arriba y este contenedor los cortaba.
      ══════════════════════════════════════════════════════════════════════ */}
      <div style={isMobile ? {
        overflow: 'hidden',
        maxHeight: compact ? 0 : 1000,
        transition: 'max-height 0.22s ease',
      } : undefined}>

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
                    { value: 'fender', label: 'Fender' },
                    { value: 'finger', label: 'Finger' },
                    { value: 'slap',   label: 'Slap' },
                    { value: 'muted',  label: 'Muted' },
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
                <span style={{ fontSize: 12, color: T.text, minWidth: 22, textAlign: 'center', fontFamily: 'var(--bt-mono)' }}>
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
                  <span style={{ fontSize: 13, color: T.text, minWidth: 22, textAlign: 'center', fontFamily: 'var(--bt-mono)' }}>
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
              <MIconBtn onClick={onImportGp} title="Import Guitar Pro (.gp/.gpx)">
                <FileMusic size={14} />
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
                  activeBg="var(--bt-accent-wash)" activeColor="var(--bt-accent)" activeBorder="var(--bt-accent)">
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
          /* ── Desktop: una sola barra oscura ───────────────────────────────
             Antes eran dos filas y la segunda —duración, sonido y compás— hoy
             está en `BassTabToolsPanel`. Lo que queda aquí es solo lo que
             ocurre en el tiempo; el chasis oscuro lo separa del papel de la
             partitura, que es lo que tiene que leerse. */
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
            padding: '10px 14px',
            background: v('panel2'),
            borderTop: `1px solid ${v('panelRule')}`,
          }}>
            {onRecord && (
              <button
                onClick={onRecord}
                title="Record tab"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  height: 34, padding: '0 12px', flexShrink: 0,
                  border: `1px solid ${v('danger')}`, borderRadius: 9,
                  background: 'transparent', color: '#e88',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  fontFamily: 'inherit', transition: 'background .13s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = v('dangerWash') }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              >
                <span style={{ width: 8, height: 8, borderRadius: 4, background: v('danger') }} />
                Record
              </button>
            )}

            <button
              onClick={isPlaying ? onStop : onPlay}
              title={isPlaying ? 'Stop  Space' : 'Play  Space'}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                width: 104, height: 34, flexShrink: 0,
                border: 'none', borderRadius: 9,
                background: isPlaying ? v('danger') : v('accent'),
                color: '#fff', fontWeight: 700, fontSize: 12.5,
                cursor: 'pointer', fontFamily: 'inherit',
                transition: 'background .13s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = isPlaying ? v('danger') : v('accentHi')
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = isPlaying ? v('danger') : v('accent')
              }}
            >
              {isPlaying
                ? <><Square size={13} fill="currentColor" /> Stop</>
                : <><Play size={13} fill="currentColor" /> Play</>}
            </button>

            <TBtn square onClick={onRewind} title="Volver al inicio">
              <SkipBack size={14} />
            </TBtn>

            <TDivider />

            {/* Tempo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <TBtn square onClick={() => onBpmChange(Math.max(40, bpm - 1))} title="Bajar el tempo">−</TBtn>
              <ScrubInput
                value={bpm} min={40} max={240} onChange={onBpmChange} width={78} dark
                title="Arrastra ◂▸ o rueda · doble clic para escribir"
                suffix="BPM"
              />
              <TBtn square onClick={() => onBpmChange(Math.min(240, bpm + 1))} title="Subir el tempo">+</TBtn>
            </div>
            <TBtn onClick={handleTap} pressed={tapFlash} title="Marca el tempo pulsando a compás">Tap</TBtn>

            <TDivider />

            <TBtn
              onClick={onMetronomeToggle}
              pressed={metronome}
              title="Metrónomo"
            >
              {metronome ? <Bell size={13} /> : <BellOff size={13} />}
              <span>Metronome</span>
            </TBtn>
            <TBtn
              onClick={onLoopToggle}
              onAltClick={onToggleLoopRange}
              pressed={loop}
              title={loopRangeActive
                ? 'Repetir · rango A→B activo · Alt+clic para quitarlo'
                : 'Repetir · Alt+clic para fijar un rango A→B'}
            >
              <RotateCcw size={13} />
              <span>Loop</span>
            </TBtn>
            {onFretboardToggle && (
              <TBtn
                onClick={onFretboardToggle}
                pressed={!!fretboardVisible}
                title="Mostrar u ocultar el diapasón"
              >
                <Guitar size={13} />
                <span>Fretboard</span>
              </TBtn>
            )}
            {midiInputAvailable && onMidiInputToggle && (
              <TBtn
                onClick={onMidiInputToggle}
                pressed={!!midiInputActive}
                title={midiInputActive
                  ? `MIDI: ${midiDeviceName ?? 'conectado'} — pulsa para desconectar`
                  : 'Conectar un teclado MIDI'}
              >
                <Piano size={13} />
                <span>MIDI</span>
              </TBtn>
            )}

            <TDivider />

            <TBtn square onClick={onUndo} disabled={!canUndo} title="Deshacer  Ctrl+Z">
              <Undo2 size={14} />
            </TBtn>
            <TBtn square onClick={onRedo} disabled={!canRedo} title="Rehacer  Ctrl+Y">
              <Redo2 size={14} />
            </TBtn>

            <div style={{ flex: 1 }} />

            <span style={{
              color: v('dim'), fontSize: 11, fontFamily: 'var(--bt-mono)',
              whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
            }}>
              {isPlaying
                ? `Bar ${bar} · beat ${beat}`
                : hasSelectedNote && selectedNoteFret !== null
                  ? `Fret ${selectedNoteFret} · ↑↓ cambia`
                  : `${totalBars} bars · ${bpb}/4`}
            </span>

            <TransportMenu
              label="Import"
              items={[
                { group: 'Importar', label: 'MIDI',       hint: '.mid',     onClick: onImportMidi },
                { label: 'Guitar Pro', hint: '.gp/.gpx', onClick: onImportGp },
              ]}
            />
            <TransportMenu
              label="Export"
              items={[
                { group: 'Score', label: 'ASCII tab', hint: '.txt', onClick: onExportAscii },
                ...(onExportImage ? [{ label: 'Image', hint: '.png', onClick: onExportImage }] : []),
                ...(onExportPdf ? [{ label: 'PDF', hint: 'print', onClick: onExportPdf }] : []),
                { group: 'Audio & video', label: 'MIDI', hint: '.mid', onClick: onExportMidi },
                ...(onExportWav   ? [{ label: 'Audio',  hint: '.wav',  onClick: onExportWav }]   : []),
                ...(onExportVideo ? [{ label: 'Video',  hint: '.webm', onClick: onExportVideo }] : []),
                { group: 'Share', label: 'Copy link', onClick: onShareUrl },
              ]}
            />
          </div>
        )}
      </div>

    </div>
  )
}

// ── Shared label style ─────────────────────────────────────────────────────
const labelStyle: React.CSSProperties = {
  fontSize: 9, fontWeight: 600, letterSpacing: '0.06em',
  textTransform: 'uppercase', color: 'var(--bt-soft)', lineHeight: 1,
  marginBottom: 3, display: 'block',
}

// ── Sub-components ─────────────────────────────────────────────────────────

function MDivider() {
  return <div style={{ width: 1, height: 32, background: T.border, flexShrink: 0, margin: '0 2px' }} />
}

// ── Piezas de la barra oscura de escritorio ────────────────────────────────

function TDivider() {
  return <div style={{ width: 1, height: 22, background: v('panelRule'), flexShrink: 0 }} />
}

/**
 * Botón del transporte. Perfilado sobre el chasis oscuro; en estado activo se
 * rellena de acento, que es la única señal de "esto está encendido" que hay en
 * la barra — de ahí que `pressed` mande también el `aria-pressed`.
 */
function TBtn({
  children, onClick, onAltClick, title, disabled, pressed, square,
}: {
  children: React.ReactNode
  onClick?: () => void
  onAltClick?: () => void
  title?: string
  disabled?: boolean
  pressed?: boolean
  square?: boolean
}) {
  const [hov, setHov] = useState(false)
  const handleClick = (e: React.MouseEvent) => {
    if (e.altKey && onAltClick) { e.preventDefault(); onAltClick() }
    else onClick?.()
  }
  return (
    <button
      onClick={handleClick} disabled={disabled} title={title}
      aria-pressed={pressed}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        height: 30, width: square ? 30 : undefined,
        padding: square ? 0 : '0 10px', flexShrink: 0,
        border: `1px solid ${pressed ? v('accent') : v('panelRule')}`,
        borderRadius: 8,
        background: pressed ? v('accent') : hov && !disabled ? 'rgba(255,255,255,.07)' : 'transparent',
        color: pressed ? '#fff' : v('panelInk'),
        fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap',
        fontFamily: 'inherit',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.38 : 1,
        transition: 'background .13s, color .13s, border-color .13s',
      }}
    >
      {children}
    </button>
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

// ── ScrubInput ─────────────────────────────────────────────────────────────
interface ScrubInputProps {
  value: number; min: number; max: number; step?: number
  onChange: (v: number) => void; width?: number; title?: string
  /** Variante para el chasis oscuro del transporte de escritorio. */
  dark?: boolean
  /** Unidad tenue detrás del número: `BPM`. */
  suffix?: string
}

function ScrubInput({ value, min, max, step = 1, onChange, width = 58, title, dark, suffix }: ScrubInputProps) {
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
        style={{
          width, height: dark ? 30 : 32,
          background: dark ? v('panel') : T.surface,
          border: `1px solid ${T.primary}`, borderRadius: dark ? 8 : 5,
          color: dark ? v('panelInk') : T.text,
          fontSize: 12.5, textAlign: 'center', fontFamily: FONT, outline: 'none',
        }}
      />
    )
  }

  // En oscuro el número va sin caja: la maqueta lo trata como una lectura, no
  // como un campo, y el par de botones −/+ que lo flanquean ya lo delimitan.
  if (dark) {
    return (
      <div
        onPointerDown={handlePointerDown} onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp}
        onDoubleClick={handleDblClick} onWheel={handleWheel}
        title={title}
        style={{
          minWidth: width, height: 30,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
          color: v('panelInk'), fontFamily: f('mono'),
          fontSize: 12.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
          cursor: 'ew-resize', userSelect: 'none', touchAction: 'none',
        }}
      >
        <span>{value}</span>
        {suffix && (
          <span style={{ color: v('dim'), fontSize: 9.5, letterSpacing: '.1em' }}>{suffix}</span>
        )}
      </div>
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

