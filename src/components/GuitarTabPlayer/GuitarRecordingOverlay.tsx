import React, { useState, useRef, useCallback, useEffect } from 'react'
import type { GuitarNote, GuitarTrack, GuitarSound, GuitarStringIndex } from '../../lib/guitarTab/types'
import { previewNote, getAudioContext, startRecordingMetronome, startPlayback, stopPlayback } from '../../lib/guitarTab/guitarAudio'
import { GuitarTabNeck } from './GuitarTabNeck'

const SNAP = 0.25
const RECORDING_BPM = 40
const STRING_NAMES = ['e', 'B', 'G', 'D', 'A', 'E']
const STRING_COLORS = ['#0ea5e9', '#8b5cf6', '#10b981', '#f59e0b', '#f97316', '#ef4444']

type RecPhase = 'ready' | 'countdown' | 'recording' | 'reviewing'

interface Props {
  track:      GuitarTrack
  sound:      GuitarSound
  onComplete: (notes: GuitarNote[]) => void
  onCancel:   () => void
}

const DURATION_OPTS = [
  { v: 4,    label: '𝅝',  title: 'Whole (4 beats)' },
  { v: 2,    label: '𝅗𝅥', title: 'Half (2 beats)' },
  { v: 1,    label: '♩',  title: 'Quarter (1 beat)' },
  { v: 0.5,  label: '♪',  title: 'Eighth (½ beat)' },
  { v: 0.25, label: '𝅘𝅥𝅮', title: '16th (¼ beat)' },
]

// ── Compact bar preview ────────────────────────────────────────────────────────
const VB_W = 420; const LABEL_W = 24; const RIGHT_PAD = 8
const ROW_H = 20; const TOP_PAD = 14
const VB_H = TOP_PAD + ROW_H * 6 + 8

function beatX(beat: number, bpb: number) { return LABEL_W + (beat / bpb) * (VB_W - LABEL_W - RIGHT_PAD) }

function LiveBarPreview({ notes, currentBeat, beatsPerBar, totalBars }: {
  notes: GuitarNote[]; currentBeat: number; beatsPerBar: number; totalBars: number
}) {
  const bar = Math.min(Math.floor(currentBeat / beatsPerBar), totalBars - 1)
  const barStart = bar * beatsPerBar
  const barEnd   = barStart + beatsPerBar
  const beatInBar = currentBeat - barStart
  const cursorX  = beatX(beatInBar, beatsPerBar)
  const barNotes = notes.filter(n => n.startBeat >= barStart && n.startBeat < barEnd)

  return (
    <div style={{ padding: '0 12px' }}>
      <div style={{ fontSize: 10, color: '#ef4444', fontWeight: 600, marginBottom: 4, fontFamily: 'ui-sans-serif, sans-serif', display: 'flex', gap: 8 }}>
        <span>● LIVE</span>
        <span style={{ color: '#64748b', fontWeight: 400 }}>Bar {bar + 1} / {totalBars}</span>
        <span style={{ marginLeft: 'auto', color: '#64748b', fontWeight: 400 }}>{barNotes.length} note{barNotes.length !== 1 ? 's' : ''}</span>
      </div>
      <div style={{ background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <svg viewBox={`0 0 ${VB_W} ${VB_H}`} width="100%" height={90} preserveAspectRatio="xMidYMid meet">
          {/* String lines */}
          {STRING_NAMES.map((name, si) => {
            const y = TOP_PAD + si * ROW_H + ROW_H / 2
            return (
              <g key={si}>
                <text x={LABEL_W - 3} y={y + 4} textAnchor="end" fontSize={9}
                  fill={STRING_COLORS[si]} fontFamily="ui-monospace,monospace" fontWeight="bold">{name}</text>
                <line x1={LABEL_W} y1={y} x2={VB_W - RIGHT_PAD} y2={y} stroke="#e2e8f0" strokeWidth={1} />
              </g>
            )
          })}
          {/* Beat dividers */}
          {Array.from({ length: beatsPerBar - 1 }, (_, i) => (
            <line key={i}
              x1={beatX(i + 1, beatsPerBar)} y1={TOP_PAD}
              x2={beatX(i + 1, beatsPerBar)} y2={VB_H - 4}
              stroke="#f1f5f9" strokeWidth={1} />
          ))}
          {/* Cursor glow */}
          <rect x={cursorX - 14} y={TOP_PAD - 2} width={28} height={VB_H - TOP_PAD}
            rx={4} fill="rgba(239,68,68,0.08)" />
          {/* Notes */}
          {barNotes.map(n => {
            const x = beatX(n.startBeat - barStart, beatsPerBar)
            const y = TOP_PAD + n.stringIndex * ROW_H + ROW_H / 2
            return (
              <g key={n.id} transform={`translate(${x},${y})`}>
                <rect x={-13} y={-9} width={26} height={18} rx={4}
                  fill="#ede9fe" stroke="#7c3aed" strokeWidth={1.5} />
                <text x={0} y={4} textAnchor="middle" fontSize={11} fontWeight={700}
                  fill="#5b21b6" fontFamily="ui-monospace,monospace">{n.fret}</text>
              </g>
            )
          })}
          {/* Cursor line */}
          <line x1={cursorX} y1={TOP_PAD - 4} x2={cursorX} y2={VB_H}
            stroke="#ef4444" strokeWidth={2} strokeLinecap="round" />
        </svg>
      </div>
    </div>
  )
}

function snapBeat(beat: number) { return Math.round(beat / SNAP) * SNAP }

function cleanNotes(notes: GuitarNote[], totalBeats: number): GuitarNote[] {
  const sorted = [...notes].sort((a, b) => a.startBeat - b.startBeat)
  const clamped = sorted
    .filter(n => n.startBeat >= 0 && n.startBeat < totalBeats)
    .map(n => ({ ...n, durationBeats: Math.min(n.durationBeats, totalBeats - n.startBeat) }))
    .filter(n => n.durationBeats > 0)
  const result: GuitarNote[] = []
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

export function GuitarRecordingOverlay({ track, sound, onComplete, onCancel }: Props) {
  const [phase, setPhase]               = useState<RecPhase>('ready')
  const [countdownNum, setCountdownNum] = useState(track.beatsPerBar)
  const [beatPulse, setBeatPulse]       = useState(-1)
  const [noteDuration, setNoteDuration] = useState(1)
  const [currentRecBeat, setCurrentRecBeat] = useState(0)
  const [liveNotes, setLiveNotes]       = useState<GuitarNote[]>([])
  const [reviewNotes, setReviewNotes]   = useState<GuitarNote[]>([])

  const totalBeats = track.totalBars * track.beatsPerBar
  const beatDur    = 60 / RECORDING_BPM

  const phaseRef           = useRef<RecPhase>('ready')
  const durationRef        = useRef(1)
  const recordStartRef     = useRef(0)
  const notesAccumRef      = useRef<GuitarNote[]>([])
  const stopCountdownRef   = useRef<(() => void) | null>(null)
  const stopRecordingRef   = useRef<(() => void) | null>(null)
  const animRef            = useRef<number | null>(null)
  const finalizeCalledRef  = useRef(false)

  phaseRef.current    = phase
  durationRef.current = noteDuration

  const cleanup = useCallback(() => {
    stopCountdownRef.current?.(); stopCountdownRef.current = null
    stopRecordingRef.current?.(); stopRecordingRef.current = null
    if (animRef.current !== null) { cancelAnimationFrame(animRef.current); animRef.current = null }
  }, [])
  useEffect(() => () => { cleanup(); stopPlayback() }, [cleanup])

  const doFinalize = useCallback(() => {
    if (phaseRef.current !== 'recording') return
    if (finalizeCalledRef.current) return
    finalizeCalledRef.current = true
    cleanup()
    const cleaned = cleanNotes(notesAccumRef.current, totalBeats)
    setReviewNotes(cleaned)
    setLiveNotes([])
    setPhase('reviewing')
    phaseRef.current = 'reviewing'
  }, [cleanup, totalBeats])

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
    recordStartRef.current   = metro.startAudioTime

    const ctx = getAudioContext()
    const loop = () => {
      if (phaseRef.current !== 'recording') return
      const beat = Math.max(0, (ctx.currentTime - metro.startAudioTime) / beatDur)
      setCurrentRecBeat(beat)
      if (beat < totalBeats) animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
  }, [track.beatsPerBar, totalBeats, beatDur, doFinalize])

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
  }, [track.beatsPerBar, doStartRecording])

  const handleFretClick = useCallback((si: number, fret: number) => {
    if (phaseRef.current !== 'recording') return
    const ctx = getAudioContext()
    const rawBeat  = (ctx.currentTime - recordStartRef.current) / beatDur
    const startBeat = Math.min(Math.max(0, snapBeat(rawBeat)), totalBeats - durationRef.current)
    const note: GuitarNote = {
      id: crypto.randomUUID(),
      stringIndex: si as GuitarStringIndex, fret,
      startBeat, durationBeats: durationRef.current, velocity: 0.8,
    }
    notesAccumRef.current = [...notesAccumRef.current, note]
    setLiveNotes([...notesAccumRef.current])
    previewNote(si, fret, sound, track.capo)
  }, [beatDur, totalBeats, sound, track.capo])

  const handleRetry = useCallback(() => {
    stopPlayback(); cleanup()
    setPhase('ready'); phaseRef.current = 'ready'
    setReviewNotes([]); setLiveNotes([])
    notesAccumRef.current = []
    finalizeCalledRef.current = false
  }, [cleanup])

  const progress   = totalBeats > 0 ? Math.min(1, currentRecBeat / totalBeats) : 0
  const currentBar = Math.min(Math.floor(currentRecBeat / track.beatsPerBar), track.totalBars - 1)

  const emptyAttacks: ({ fret: number; v: number } | null)[] = Array(6).fill(null)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#ffffff', display: 'flex', flexDirection: 'column', fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif", overflowY: 'hidden' }}>

      {/* Header */}
      <div style={{ flexShrink: 0, height: 50, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {phase === 'recording' && (
            <div className="rec-blink" style={{ width: 9, height: 9, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 6px #ef4444' }} />
          )}
          <span style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>
            {phase === 'ready' ? 'Record guitar tab'
              : phase === 'countdown' ? 'Get ready...'
              : phase === 'recording' ? `Recording · ${currentBar + 1}/${track.totalBars}`
              : 'Review recording'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {(phase === 'ready' || phase === 'reviewing') && (
            <button
              onClick={phase === 'ready' ? onCancel : handleRetry}
              style={{ height: 32, padding: '0 12px', borderRadius: 8, background: 'transparent', border: '1px solid #e2e8f0', color: '#64748b', fontSize: 12, cursor: 'pointer' }}
            >
              {phase === 'ready' ? 'Cancel' : 'Record again'}
            </button>
          )}
        </div>
      </div>

      {/* READY */}
      {phase === 'ready' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28, padding: 24 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 17, fontWeight: 600, color: '#1e293b', marginBottom: 8 }}>{track.name || 'Untitled'}</div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>{track.totalBars} bars · {RECORDING_BPM} BPM · {track.beatsPerBar}/4</div>
            <div style={{ fontSize: 12, color: '#64748b', maxWidth: 280, lineHeight: 1.6, textAlign: 'center' }}>
              You'll hear one bar countdown. Then tap the fretboard to record notes at the right time.
            </div>
          </div>
          <button
            onClick={doStartCountdown}
            style={{ width: 140, height: 140, borderRadius: '50%', background: '#fff1f1', border: '3px solid #ef4444', color: '#ef4444', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, boxShadow: '0 0 40px rgba(239,68,68,0.25)', fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', transition: 'box-shadow 0.15s' }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.boxShadow = '0 0 60px rgba(239,68,68,0.4)')}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.boxShadow = '0 0 40px rgba(239,68,68,0.25)')}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="#ef4444"><circle cx="12" cy="12" r="7" /></svg>
            RECORD
          </button>
        </div>
      )}

      {/* COUNTDOWN */}
      {phase === 'countdown' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28, padding: 24 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            {Array.from({ length: track.beatsPerBar }, (_, i) => (
              <div key={i} style={{ width: beatPulse === i ? 14 : 8, height: beatPulse === i ? 14 : 8, borderRadius: '50%', background: beatPulse === i ? '#7c3aed' : '#e2e8f0', transition: 'all 0.08s' }} />
            ))}
          </div>
          <div key={countdownNum} className="countdown-pop" style={{ fontSize: 160, fontWeight: 900, lineHeight: 1, color: '#7c3aed', fontVariantNumeric: 'tabular-nums', userSelect: 'none' }}>
            {countdownNum}
          </div>
          <p style={{ fontSize: 13, color: '#64748b', letterSpacing: '0.04em' }}>Get ready to play...</p>
          <DurationPicker noteDuration={noteDuration} setNoteDuration={v => { setNoteDuration(v); durationRef.current = v }} />
        </div>
      )}

      {/* RECORDING */}
      {phase === 'recording' && (
        <>
          <div style={{ flexShrink: 0, height: 3, background: '#f1f5f9' }}>
            <div style={{ height: '100%', background: '#ef4444', width: `${progress * 100}%`, transition: 'width 0.08s linear' }} />
          </div>
          <div style={{ flexShrink: 0, padding: '10px 0 6px', display: 'flex', justifyContent: 'center', gap: 12 }}>
            {Array.from({ length: track.beatsPerBar }, (_, i) => (
              <div key={i} style={{ width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: beatPulse === i ? 16 : 9, height: beatPulse === i ? 16 : 9, borderRadius: '50%', background: beatPulse === i ? '#ef4444' : '#e2e8f0', transition: 'all 0.08s' }} />
              </div>
            ))}
          </div>
          <div style={{ flexShrink: 0 }}>
            <LiveBarPreview notes={liveNotes} currentBeat={currentRecBeat} beatsPerBar={track.beatsPerBar} totalBars={track.totalBars} />
          </div>
          <div style={{ flexShrink: 0, padding: '8px 12px 4px' }}>
            <DurationPicker noteDuration={noteDuration} setNoteDuration={v => { setNoteDuration(v); durationRef.current = v }} />
          </div>
          <div style={{ flexShrink: 0 }}>
            <GuitarTabNeck
              activeFrets={Array(6).fill(null)}
              attackSignals={emptyAttacks}
              onNoteClick={handleFretClick}
              height={260}
            />
          </div>
          <div style={{ flexShrink: 0, padding: '8px 12px 16px', marginTop: 'auto' }}>
            <button
              onClick={() => doFinalize()}
              style={{ width: '100%', height: 48, borderRadius: 12, background: '#fff1f1', border: '1px solid #ef4444', color: '#ef4444', fontSize: 13, fontWeight: 700, letterSpacing: '0.04em', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="18" height="18" rx="2" /></svg>
              STOP RECORDING
            </button>
          </div>
        </>
      )}

      {/* REVIEWING */}
      {phase === 'reviewing' && (
        <>
          {reviewNotes.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: '#94a3b8' }}>
              <div style={{ fontSize: 40 }}>🎸</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#64748b' }}>No notes recorded</div>
              <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', maxWidth: 240, lineHeight: 1.5 }}>Tap the strings on the fretboard while recording.</div>
            </div>
          ) : (
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 12px' }}>
              <ReviewGrid notes={reviewNotes} beatsPerBar={track.beatsPerBar} totalBars={track.totalBars} />
            </div>
          )}

          <div style={{ flexShrink: 0, padding: '8px 12px 20px', display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid #e2e8f0' }}>
            {reviewNotes.length > 0 && (
              <button
                onClick={() => { stopPlayback(); onComplete(reviewNotes) }}
                style={{ width: '100%', height: 50, borderRadius: 12, background: '#f0fdf4', border: '1px solid #16a34a', color: '#16a34a', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
              >
                Use this recording
              </button>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleRetry} style={{ flex: 1, height: 42, borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0', color: '#64748b', fontSize: 12, cursor: 'pointer' }}>
                Record again
              </button>
              <button onClick={onCancel} style={{ flex: 1, height: 42, borderRadius: 10, background: 'transparent', border: '1px solid #e2e8f0', color: '#94a3b8', fontSize: 12, cursor: 'pointer' }}>
                Discard
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

function DurationPicker({ noteDuration, setNoteDuration }: { noteDuration: number; setNoteDuration: (v: number) => void }) {
  return (
    <div style={{ width: '100%', maxWidth: 360 }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8, textAlign: 'center' }}>Note Duration</div>
      <div style={{ display: 'flex', gap: 4 }}>
        {DURATION_OPTS.map(o => {
          const active = noteDuration === o.v
          return (
            <button key={o.v} onClick={() => setNoteDuration(o.v)} title={o.title}
              style={{ flex: 1, height: 48, background: active ? '#ede9fe' : '#f8fafc', border: `1px solid ${active ? '#7c3aed' : '#e2e8f0'}`, borderRadius: 10, color: active ? '#7c3aed' : '#94a3b8', fontSize: 20, cursor: 'pointer', touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent', transition: 'all 0.1s' }}>
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ReviewGrid({ notes, beatsPerBar, totalBars }: { notes: GuitarNote[]; beatsPerBar: number; totalBars: number }) {
  const totalBeats = totalBars * beatsPerBar
  const colW = 60
  const rowH = 28
  const labelW = 20
  const width = labelW + totalBeats * colW

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${width} ${STRING_NAMES.length * rowH + 8}`} width={Math.min(width, 600)} height={STRING_NAMES.length * rowH + 8} style={{ display: 'block' }}>
        {STRING_NAMES.map((name, si) => {
          const y = 4 + si * rowH + rowH / 2
          return (
            <g key={si}>
              <text x={labelW - 3} y={y + 4} textAnchor="end" fontSize={9} fill={STRING_COLORS[si]} fontWeight="bold" fontFamily="ui-monospace,monospace">{name}</text>
              <line x1={labelW} y1={y} x2={width} y2={y} stroke="#e2e8f0" strokeWidth={1} />
            </g>
          )
        })}
        {/* Bar lines */}
        {Array.from({ length: totalBars + 1 }, (_, b) => (
          <line key={b} x1={labelW + b * beatsPerBar * colW} y1={4} x2={labelW + b * beatsPerBar * colW} y2={STRING_NAMES.length * rowH + 4} stroke="#cbd5e1" strokeWidth={b === 0 || b === totalBars ? 1.5 : 0.8} />
        ))}
        {/* Notes */}
        {notes.map(n => {
          const x = labelW + n.startBeat * colW
          const y = 4 + n.stringIndex * rowH + rowH / 2
          const w = Math.max(24, n.durationBeats * colW - 4)
          return (
            <g key={n.id}>
              <rect x={x + 2} y={y - 10} width={w} height={20} rx={4} fill="#ede9fe" stroke="#7c3aed" strokeWidth={1.5} />
              <text x={x + 2 + w / 2} y={y + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill="#5b21b6" fontFamily="ui-monospace,monospace">{n.fret}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
