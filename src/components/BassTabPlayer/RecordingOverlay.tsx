import React, { useState, useRef, useCallback, useEffect } from 'react'
import type { BassNote, BassTrack, BassSound, StringIndex } from '../../lib/bassTab/types'
import { previewNote, getAudioContext, startRecordingMetronome, startPlayback, stopPlayback } from '../../lib/bassTab/bassAudio'
import { BassTabFretboard } from './BassTabFretboard'
import { MobileBarView } from './MobileBarView'

const SNAP = 0.25
const RECORDING_BPM = 40

type RecPhase = 'ready' | 'countdown' | 'recording' | 'reviewing'

interface RecordingOverlayProps {
  track:      BassTrack
  sound:      BassSound
  onComplete: (notes: BassNote[]) => void
  onCancel:   () => void
}

const R = {
  bg:        'var(--bt-paper)',
  surface:   'var(--bt-card)',
  surfaceHi: 'var(--bt-sunken)',
  border:    'var(--bt-rule)',
  text:      'var(--bt-ink)',
  muted:     'var(--bt-soft)',
  red:       'var(--bt-danger)',
  redBg:     'rgba(214,69,69,0.10)',
  primary:   'var(--bt-accent)',
  primaryBg: 'var(--bt-accent-wash)',
  green:     'var(--bt-ok)',
  greenBg:   'var(--bt-ok-wash)',
  amber:     'var(--bt-warn)',
  font:      "'Inter', ui-sans-serif, system-ui, sans-serif",
}

const DURATION_OPTS = [
  { v: 4,    label: '𝅝',  title: 'Redonda (4 tiempos)' },
  { v: 2,    label: '𝅗𝅥', title: 'Blanca (2 tiempos)' },
  { v: 1,    label: '♩',  title: 'Negra (1 tiempo)' },
  { v: 0.5,  label: '♪',  title: 'Corchea (½ tiempo)' },
  { v: 0.25, label: '𝅘𝅥𝅮', title: 'Semicorchea (¼ tiempo)' },
]

// ── Compact bar SVG for live preview ────────────────────────────────────────
const VB_W   = 400; const LABEL_W = 30; const RIGHT_PAD = 12
const NOTE_W = VB_W - LABEL_W - RIGHT_PAD
const SY     = [24, 52, 80, 108]   // string Y positions
const VB_H   = 134
const STRING_NAMES = ['G', 'D', 'A', 'E']

function beatX(beat: number, bpb: number) { return LABEL_W + (beat / bpb) * NOTE_W }

function LiveBarPreview({ notes, currentBeat, beatsPerBar, totalBars }: {
  notes: BassNote[]; currentBeat: number; beatsPerBar: number; totalBars: number
}) {
  const bar      = Math.min(Math.floor(currentBeat / beatsPerBar), totalBars - 1)
  const barStart = bar * beatsPerBar
  const barEnd   = barStart + beatsPerBar
  const beatInBar = currentBeat - barStart
  const cursorX  = beatX(beatInBar, beatsPerBar)
  const barNotes = notes.filter(n => n.startBeat >= barStart && n.startBeat < barEnd)

  return (
    <div style={{ padding: '0 10px' }}>
      <div style={{
        fontSize: 10, color: R.muted, marginBottom: 4,
        display: 'flex', alignItems: 'center', gap: 6,
        fontFamily: R.font,
      }}>
        <span style={{ color: R.red, fontWeight: 600 }}>● PREVIEW</span>
        <span>Compás {bar + 1} / {totalBars}</span>
        <span style={{ marginLeft: 'auto', fontFamily: 'ui-monospace, monospace' }}>
          {barNotes.length} nota{barNotes.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div style={{
        background: R.surface, borderRadius: 10,
        border: `1px solid ${R.border}`, overflow: 'hidden',
      }}>
        <svg viewBox={`0 0 ${VB_W} ${VB_H}`} width="100%" height={82} preserveAspectRatio="xMidYMid meet">
          {/* String lines */}
          {SY.map((y, i) => (
            <g key={i}>
              <text x={LABEL_W - 5} y={y + 4} textAnchor="end" fontSize={10}
                fill="var(--bt-dim)" fontFamily="ui-monospace,monospace">{STRING_NAMES[i]}</text>
              <line x1={LABEL_W} y1={y} x2={VB_W - RIGHT_PAD} y2={y}
                stroke="var(--bt-rule)" strokeWidth={1} />
            </g>
          ))}
          {/* Beat sub-divisions */}
          {Array.from({ length: beatsPerBar - 1 }, (_, i) => (
            <line key={i} x1={beatX(i + 1, beatsPerBar)} y1={SY[0] - 10}
              x2={beatX(i + 1, beatsPerBar)} y2={SY[3] + 10}
              stroke="var(--bt-card)" strokeWidth={1} />
          ))}
          {/* Cursor glow */}
          <rect x={cursorX - 12} y={SY[0] - 12} width={24} height={SY[3] - SY[0] + 24}
            rx={5} fill="var(--bt-danger-wash)" />
          {/* Notes */}
          {barNotes.map(n => {
            const x = beatX(n.startBeat - barStart, beatsPerBar)
            const y = SY[n.stringIndex]
            return (
              <g key={n.id} transform={`translate(${x},${y})`}>
                <rect x={-13} y={-10} width={26} height={20} rx={4}
                  fill="var(--bt-accent-wash)" stroke="var(--bt-accent)" strokeWidth={1.5} />
                <text x={0} y={5} textAnchor="middle" fontSize={12} fontWeight={700}
                  fill="var(--bt-accent)" fontFamily="ui-monospace,monospace">{n.fret}</text>
              </g>
            )
          })}
          {/* Cursor */}
          <line x1={cursorX} y1={SY[0] - 12} x2={cursorX} y2={SY[3] + 12}
            stroke={R.red} strokeWidth={2} strokeLinecap="round" />
        </svg>
      </div>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function snapBeat(beat: number): number { return Math.round(beat / SNAP) * SNAP }

function cleanNotes(notes: BassNote[], totalBeats: number): BassNote[] {
  const sorted = [...notes].sort((a, b) => a.startBeat - b.startBeat)
  const clamped = sorted
    .filter(n => n.startBeat >= 0 && n.startBeat < totalBeats)
    .map(n => ({ ...n, durationBeats: Math.min(n.durationBeats, totalBeats - n.startBeat) }))
    .filter(n => n.durationBeats > 0)
  const result: BassNote[] = []
  for (const note of clamped) {
    const prev = [...result].reverse().find(n => n.stringIndex === note.stringIndex)
    if (prev) {
      const idx = result.lastIndexOf(prev)
      if (prev.startBeat + prev.durationBeats > note.startBeat) {
        result[idx] = { ...prev, durationBeats: Math.max(SNAP, note.startBeat - prev.startBeat) }
      }
    }
    result.push(note)
  }
  return result.filter(n => n.durationBeats > 0)
}

// ── Main component ───────────────────────────────────────────────────────────
export function RecordingOverlay({ track, sound, onComplete, onCancel }: RecordingOverlayProps) {
  const [phase, setPhase]            = useState<RecPhase>('ready')
  const [countdownNum, setCountdownNum] = useState(track.beatsPerBar)
  const [beatPulse, setBeatPulse]    = useState(-1)
  const [noteDuration, setNoteDuration] = useState(1)
  const [currentRecBeat, setCurrentRecBeat] = useState(0)
  const [liveNotes, setLiveNotes]    = useState<BassNote[]>([])
  const [reviewTrack, setReviewTrack] = useState<BassTrack | null>(null)
  const [reviewBeat, setReviewBeat]  = useState(0)
  const [reviewPlaying, setReviewPlaying] = useState(false)
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)

  const totalBeats = track.totalBars * track.beatsPerBar
  const beatDur    = 60 / RECORDING_BPM

  const phaseRef             = useRef<RecPhase>('ready')
  const durationRef          = useRef(1)
  const recordStartTimeRef   = useRef(0)
  const notesAccumRef        = useRef<BassNote[]>([])
  const stopCountdownRef     = useRef<(() => void) | null>(null)
  const stopRecordingRef     = useRef<(() => void) | null>(null)
  const animRef              = useRef<number | null>(null)
  const finalizeCalledRef    = useRef(false)

  phaseRef.current   = phase
  durationRef.current = noteDuration

  const cleanup = useCallback(() => {
    stopCountdownRef.current?.(); stopCountdownRef.current = null
    stopRecordingRef.current?.();  stopRecordingRef.current = null
    if (animRef.current !== null) { cancelAnimationFrame(animRef.current); animRef.current = null }
  }, [])

  useEffect(() => () => { cleanup(); stopPlayback() }, [cleanup])

  // ── finalize recording → go to review ─────────────────────────────────────
  const doFinalize = useCallback(() => {
    if (phaseRef.current !== 'recording') return
    if (finalizeCalledRef.current) return
    finalizeCalledRef.current = true
    cleanup()
    const cleaned = cleanNotes(notesAccumRef.current, totalBeats)
    const rev: BassTrack = { ...track, notes: cleaned }
    setReviewTrack(rev)
    setLiveNotes([])
    setPhase('reviewing')
    phaseRef.current = 'reviewing'
  }, [cleanup, track, totalBeats])

  // ── start recording ────────────────────────────────────────────────────────
  const doStartRecording = useCallback(() => {
    setPhase('recording')
    phaseRef.current = 'recording'
    finalizeCalledRef.current = false
    notesAccumRef.current = []
    setLiveNotes([])
    setCurrentRecBeat(0)

    const metro = startRecordingMetronome(
      RECORDING_BPM, track.beatsPerBar, totalBeats,
      beatIdx => setBeatPulse(beatIdx % track.beatsPerBar),
      () => doFinalize(),
    )
    stopRecordingRef.current = metro.stop
    recordStartTimeRef.current = metro.startAudioTime

    const ctx = getAudioContext()
    const loop = () => {
      if (phaseRef.current !== 'recording') return
      const beat = Math.max(0, (ctx.currentTime - metro.startAudioTime) / beatDur)
      setCurrentRecBeat(beat)
      if (beat < totalBeats) animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
  }, [track.beatsPerBar, totalBeats, beatDur, doFinalize])

  // ── countdown ─────────────────────────────────────────────────────────────
  const doStartCountdown = useCallback(() => {
    setPhase('countdown')
    phaseRef.current = 'countdown'
    const countBeats = track.beatsPerBar
    setCountdownNum(countBeats)
    setBeatPulse(-1)
    const metro = startRecordingMetronome(
      RECORDING_BPM, track.beatsPerBar, countBeats,
      beatIdx => { setCountdownNum(countBeats - beatIdx); setBeatPulse(beatIdx % track.beatsPerBar) },
      () => doStartRecording(),
    )
    stopCountdownRef.current = metro.stop
  }, [track.bpm, track.beatsPerBar, doStartRecording])

  // ── fretboard tap handler ──────────────────────────────────────────────────
  const handleFretClick = useCallback((si: number, fret: number) => {
    if (phaseRef.current !== 'recording') return
    const ctx = getAudioContext()
    const rawBeat = (ctx.currentTime - recordStartTimeRef.current) / beatDur
    const startBeat = Math.min(Math.max(0, snapBeat(rawBeat)), totalBeats - durationRef.current)
    const id = crypto.randomUUID()
    const note: BassNote = {
      id, stringIndex: si as StringIndex, fret,
      startBeat, durationBeats: durationRef.current, velocity: 0.8,
    }
    notesAccumRef.current = [...notesAccumRef.current, note]
    setLiveNotes([...notesAccumRef.current])
    previewNote(si, fret, sound)
  }, [beatDur, totalBeats, sound])

  // ── auto-play review ───────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'reviewing' || !reviewTrack || reviewTrack.notes.length === 0) return
    setReviewBeat(0)
    setReviewPlaying(true)
    startPlayback(
      reviewTrack, 0, sound,
      beat => setReviewBeat(beat),
      () => { setReviewPlaying(false); setReviewBeat(0) },
      () => false, () => false, () => null,
    )
    return () => stopPlayback()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, reviewTrack])

  const handleReviewTogglePlay = useCallback(() => {
    if (!reviewTrack) return
    if (reviewPlaying) {
      stopPlayback(); setReviewPlaying(false); setReviewBeat(0)
    } else {
      setReviewPlaying(true)
      startPlayback(
        reviewTrack, 0, sound,
        beat => setReviewBeat(beat),
        () => { setReviewPlaying(false); setReviewBeat(0) },
        () => false, () => false, () => null,
      )
    }
  }, [reviewTrack, reviewPlaying, sound])

  // ── review note editors ────────────────────────────────────────────────────
  const handleAddNote    = useCallback((n: BassNote) =>
    setReviewTrack(t => t ? { ...t, notes: [...t.notes, n] } : t), [])
  const handleUpdateNote = useCallback((id: string, p: Partial<BassNote>) =>
    setReviewTrack(t => t ? { ...t, notes: t.notes.map(n => n.id === id ? { ...n, ...p } : n) } : t), [])
  const handleDeleteNote = useCallback((id: string) => {
    setReviewTrack(t => t ? { ...t, notes: t.notes.filter(n => n.id !== id) } : t)
    setSelectedNoteId(p => p === id ? null : p)
  }, [])

  const handleUse = useCallback(() => {
    stopPlayback()
    if (reviewTrack) onComplete(reviewTrack.notes)
  }, [reviewTrack, onComplete])

  const handleRetry = useCallback(() => {
    stopPlayback()
    cleanup()
    setPhase('ready'); phaseRef.current = 'ready'
    setReviewTrack(null); setSelectedNoteId(null)
    setReviewPlaying(false); setReviewBeat(0)
    notesAccumRef.current = []
    finalizeCalledRef.current = false
  }, [cleanup])

  const progress = totalBeats > 0 ? Math.min(1, currentRecBeat / totalBeats) : 0
  const currentBar = Math.min(Math.floor(currentRecBeat / track.beatsPerBar), track.totalBars - 1)

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: R.bg, display: 'flex', flexDirection: 'column',
      fontFamily: R.font, overflowY: 'hidden',
    }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{
        flexShrink: 0, height: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 14px', borderBottom: `1px solid ${R.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {phase === 'recording' && (
            <div className="rec-blink" style={{
              width: 9, height: 9, borderRadius: '50%',
              background: R.red, boxShadow: `0 0 6px ${R.red}`,
            }} />
          )}
          <span style={{ fontSize: 14, fontWeight: 600, color: R.text }}>
            {phase === 'ready'      ? 'Grabar tablatura'
            : phase === 'countdown' ? 'Prepárate...'
            : phase === 'recording' ? `Grabando · ${currentBar + 1}/${track.totalBars}`
            :                         'Revisión'}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {phase === 'reviewing' && (
            <button
              onClick={handleReviewTogglePlay}
              style={{
                height: 32, padding: '0 12px', borderRadius: 8,
                background: reviewPlaying ? R.redBg : R.surfaceHi,
                border: `1px solid ${reviewPlaying ? R.red : R.border}`,
                color: reviewPlaying ? R.red : R.muted,
                fontSize: 12, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 5,
              }}
            >
              {reviewPlaying
                ? <><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="18" rx="1"/></svg>Stop</>
                : <><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>Play</>
              }
            </button>
          )}
          {(phase === 'ready' || phase === 'reviewing') && (
            <button
              onClick={phase === 'ready' ? onCancel : handleRetry}
              style={{
                height: 32, padding: '0 12px', borderRadius: 8,
                background: 'transparent', border: `1px solid ${R.border}`,
                color: R.muted, fontSize: 12, cursor: 'pointer',
              }}
            >
              {phase === 'ready' ? 'Cancelar' : 'Volver a grabar'}
            </button>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          READY
      ══════════════════════════════════════════════════════════════════════ */}
      {phase === 'ready' && (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 28, padding: 24,
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 17, fontWeight: 600, color: R.text, marginBottom: 8 }}>
              {track.name || 'Sin título'}
            </div>
            <div style={{ fontSize: 13, color: R.muted, marginBottom: 12 }}>
              {track.totalBars} compases · {RECORDING_BPM} BPM · {track.beatsPerBar}/4
            </div>
            <div style={{ fontSize: 12, color: R.muted, maxWidth: 280, lineHeight: 1.6 }}>
              Escucharás un compás de cuenta atrás. Luego toca las cuerdas para grabar la tablatura.
            </div>
          </div>
          <button
            onClick={doStartCountdown}
            style={{
              width: 140, height: 140, borderRadius: '50%',
              background: R.redBg, border: `3px solid ${R.red}`,
              color: R.red, cursor: 'pointer',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 6,
              boxShadow: `0 0 40px ${R.red}44`,
              fontSize: 13, fontWeight: 700, letterSpacing: '0.06em',
              transition: 'box-shadow 0.15s',
            }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.boxShadow = `0 0 60px ${R.red}77`)}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.boxShadow = `0 0 40px ${R.red}44`)}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill={R.red}>
              <circle cx="12" cy="12" r="7" />
            </svg>
            GRABAR
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          COUNTDOWN  — clean centered overlay, chord-editor style
      ══════════════════════════════════════════════════════════════════════ */}
      {phase === 'countdown' && (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 28, padding: 24,
        }}>
          {/* Beat pulse dots */}
          <div style={{ display: 'flex', gap: 10 }}>
            {Array.from({ length: track.beatsPerBar }, (_, i) => (
              <div key={i} style={{
                width: beatPulse === i ? 14 : 8, height: beatPulse === i ? 14 : 8,
                borderRadius: '50%',
                background: beatPulse === i ? R.primary : R.border,
                transition: 'all 0.08s',
              }} />
            ))}
          </div>

          {/* Giant animated countdown number */}
          <div
            key={countdownNum}
            className="countdown-pop"
            style={{
              fontSize: 160, fontWeight: 900, lineHeight: 1,
              color: R.primary,
              fontVariantNumeric: 'tabular-nums', userSelect: 'none',
              textShadow: `0 0 60px ${R.primary}55`,
            }}
          >
            {countdownNum}
          </div>

          <p style={{ fontSize: 13, color: R.muted, letterSpacing: '0.04em' }}>
            Prepárate para tocar...
          </p>

          {/* Duration picker */}
          <div style={{ width: '100%', maxWidth: 380 }}>
            <div style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.07em',
              textTransform: 'uppercase', color: R.muted, marginBottom: 8, textAlign: 'center',
            }}>Duración de nota</div>
            <div style={{ display: 'flex', gap: 4 }}>
              {DURATION_OPTS.map(o => {
                const active = noteDuration === o.v
                return (
                  <button key={o.v} onClick={() => { setNoteDuration(o.v); durationRef.current = o.v }}
                    title={o.title}
                    style={{
                      flex: 1, height: 48,
                      background: active ? R.primaryBg : R.surface,
                      border: `1px solid ${active ? R.primary : R.border}`,
                      borderRadius: 10,
                      color: active ? 'var(--bt-accent)' : R.muted,
                      fontSize: 20, cursor: 'pointer',
                      touchAction: 'manipulation',
                      WebkitTapHighlightColor: 'transparent',
                      transition: 'all 0.1s',
                    }}
                  >
                    {o.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          RECORDING
      ══════════════════════════════════════════════════════════════════════ */}
      {phase === 'recording' && (
        <>
          {/* Progress bar */}
          <div style={{ flexShrink: 0, height: 3, background: R.surface }}>
            <div style={{ height: '100%', background: R.red, width: `${progress * 100}%`, transition: 'width 0.08s linear' }} />
          </div>

          {/* Beat dots */}
          <div style={{ flexShrink: 0, padding: '10px 0 6px', display: 'flex', justifyContent: 'center', gap: 12 }}>
            {Array.from({ length: track.beatsPerBar }, (_, i) => (
              <div key={i} style={{ width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{
                  width: beatPulse === i ? 16 : 9, height: beatPulse === i ? 16 : 9,
                  borderRadius: '50%', background: beatPulse === i ? R.red : R.border,
                  transition: 'all 0.08s',
                }} />
              </div>
            ))}
          </div>

          {/* Live tab preview */}
          <div style={{ flexShrink: 0 }}>
            <LiveBarPreview
              notes={liveNotes}
              currentBeat={currentRecBeat}
              beatsPerBar={track.beatsPerBar}
              totalBars={track.totalBars}
            />
          </div>

          {/* Duration picker */}
          <div style={{ flexShrink: 0, padding: '8px 10px 4px' }}>
            <div style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.07em',
              textTransform: 'uppercase', color: R.muted, marginBottom: 5,
            }}>Duración de nota</div>
            <div style={{ display: 'flex', gap: 4 }}>
              {DURATION_OPTS.map(o => {
                const active = noteDuration === o.v
                return (
                  <button key={o.v} onClick={() => { setNoteDuration(o.v); durationRef.current = o.v }}
                    title={o.title}
                    style={{
                      flex: 1, height: 42,
                      background: active ? R.primaryBg : R.surface,
                      border: `1px solid ${active ? R.primary : R.border}`,
                      borderRadius: 8,
                      color: active ? 'var(--bt-accent)' : R.muted,
                      fontSize: 18, cursor: 'pointer',
                      touchAction: 'manipulation',
                      WebkitTapHighlightColor: 'transparent',
                      transition: 'all 0.1s',
                    }}
                  >
                    {o.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* BassTabFretboard — the real Strings component */}
          <div style={{ flexShrink: 0, padding: '4px 0 0' }}>
            <BassTabFretboard
              activeFrets={[null, null, null, null]}
              attackSignals={[null, null, null, null]}
              onNoteClick={handleFretClick}
              maxHeight={300}
            />
          </div>

          {/* Stop button */}
          <div style={{ flexShrink: 0, padding: '8px 10px 14px', marginTop: 'auto' }}>
            <button
              onClick={() => doFinalize()}
              style={{
                width: '100%', height: 48, borderRadius: 12,
                background: R.redBg, border: `1px solid ${R.red}`,
                color: R.red, fontSize: 13, fontWeight: 700,
                letterSpacing: '0.04em', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <rect x="3" y="3" width="18" height="18" rx="2" />
              </svg>
              DETENER GRABACIÓN
            </button>
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          REVIEWING
      ══════════════════════════════════════════════════════════════════════ */}
      {phase === 'reviewing' && reviewTrack && (
        <>
          {reviewTrack.notes.length === 0 ? (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 12,
              color: R.muted,
            }}>
              <div style={{ fontSize: 40 }}>🎸</div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Sin notas grabadas</div>
              <div style={{ fontSize: 12, textAlign: 'center', maxWidth: 240, lineHeight: 1.5 }}>
                Toca las cuerdas del bajo durante la grabación.
              </div>
            </div>
          ) : (
            <>
              {/* Playback state banner */}
              <div style={{
                flexShrink: 0,
                background: reviewPlaying ? R.redBg : R.surface,
                borderBottom: `1px solid ${reviewPlaying ? R.red + '44' : R.border}`,
                padding: '6px 14px',
                display: 'flex', alignItems: 'center', gap: 8,
                transition: 'all 0.2s',
              }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: reviewPlaying ? R.red : R.muted,
                  boxShadow: reviewPlaying ? `0 0 6px ${R.red}` : 'none',
                }} className={reviewPlaying ? 'rec-blink' : ''} />
                <span style={{ fontSize: 11, color: reviewPlaying ? R.red : R.muted, fontWeight: 600 }}>
                  {reviewPlaying ? 'Reproduciendo...' : 'Listo para escuchar'}
                </span>
                <span style={{ fontSize: 11, color: R.muted, marginLeft: 'auto' }}>
                  {reviewTrack.notes.length} nota{reviewTrack.notes.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                <MobileBarView
                  track={reviewTrack}
                  currentBeat={reviewBeat}
                  isPlaying={reviewPlaying}
                  onSeek={() => {}}
                  viewMode="score"
                  editable
                  selectedNoteId={selectedNoteId}
                  sound={sound}
                  noteDuration={noteDuration}
                  onAddNote={handleAddNote}
                  onUpdateNote={handleUpdateNote}
                  onDeleteNote={handleDeleteNote}
                  onSelectNote={setSelectedNoteId}
                  onBeginEdit={() => {}}
                />
              </div>
            </>
          )}

          {/* Action buttons */}
          <div style={{ flexShrink: 0, padding: '8px 12px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {track.notes.length > 0 && (
              <div style={{ fontSize: 11, color: R.muted, textAlign: 'center' }}>
                Reemplazará las {track.notes.length} nota{track.notes.length !== 1 ? 's' : ''} actuales
              </div>
            )}
            {reviewTrack.notes.length > 0 && (
              <button
                onClick={handleUse}
                style={{
                  width: '100%', height: 50, borderRadius: 12,
                  background: R.greenBg, border: `1px solid ${R.green}`,
                  color: R.green, fontSize: 14, fontWeight: 700,
                  cursor: 'pointer', letterSpacing: '0.02em',
                }}
              >
                Usar esta grabación
              </button>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleRetry} style={{
                flex: 1, height: 42, borderRadius: 10,
                background: R.surface, border: `1px solid ${R.border}`,
                color: R.muted, fontSize: 12, cursor: 'pointer',
              }}>
                Volver a grabar
              </button>
              <button onClick={onCancel} style={{
                flex: 1, height: 42, borderRadius: 10,
                background: 'transparent', border: `1px solid ${R.border}`,
                color: R.muted, fontSize: 12, cursor: 'pointer',
              }}>
                Descartar
              </button>
            </div>
          </div>
        </>
      )}

      <style>{`
        .rec-blink { animation: rec-blink 1s ease-in-out infinite; }
        @keyframes rec-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
        .countdown-pop { animation: countdown-pop 0.18s cubic-bezier(0.2, 0, 0, 1.4); }
        @keyframes countdown-pop { 0% { transform: scale(1.5); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
      `}</style>
    </div>
  )
}
