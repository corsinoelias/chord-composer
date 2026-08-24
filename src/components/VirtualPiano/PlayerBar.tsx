import React, { useCallback, useRef, useState } from 'react'
import type { PianoTransport } from './usePianoTransport'
import { TEAL, TEXT_DIM, TEXT_HI, TEXT_MED, VIOLET, VIOLET_2, ghostBtn, iconBtn, optionStyle } from './pianoTheme'

interface Props {
  transport: PianoTransport
  onClose: () => void
}

function fmtMMSS(sec: number): string {
  const s = Math.max(0, Math.round(sec || 0))
  const m = Math.floor(s / 60)
  return m + ':' + String(s % 60).padStart(2, '0')
}

// Sits directly below the keyboard, not above it — falling notes travel a
// single continuous path from the top of the visualizer down through the
// keys with nothing in between (see VirtualPiano.tsx's stage layout comment).
// Collapses to one row (title/play/time/loop) under ~560px so a 2-octave
// keyboard still gets the vertical space it needs; see pianoTheme mobile note.
export function PlayerBar({ transport, onClose }: Props) {
  const { song, posSec, totalDur, playing, practice, speed, loopOn, loopStart, loopEnd, scoreHit, scoreMissed } = transport
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState<null | 'seek' | 'loop-start' | 'loop-end'>(null)

  const posFromClientX = useCallback((clientX: number) => {
    const el = trackRef.current
    if (!el || totalDur <= 0) return 0
    const rect = el.getBoundingClientRect()
    const frac = rect.width ? Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) : 0
    return frac * totalDur
  }, [totalDur])

  const beginDrag = useCallback((kind: 'seek' | 'loop-start' | 'loop-end', e: React.PointerEvent) => {
    e.preventDefault()
    setDragging(kind)
    const move = (ev: PointerEvent) => {
      const sec = posFromClientX(ev.clientX)
      if (kind === 'seek') transport.seek(sec)
      else if (kind === 'loop-start') transport.setLoopRange(Math.min(sec, transport.loopEnd - 0.2), transport.loopEnd)
      else transport.setLoopRange(transport.loopStart, Math.max(sec, transport.loopStart + 0.2))
    }
    const up = () => {
      setDragging(null)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    if (kind === 'seek') transport.seek(posFromClientX(e.clientX))
  }, [posFromClientX, transport])

  if (!song) return null

  const pct = totalDur > 0 ? (posSec / totalDur) * 100 : 0
  const lp0 = totalDur > 0 ? (loopStart / totalDur) * 100 : 0
  const lp1 = totalDur > 0 ? (loopEnd / totalDur) * 100 : 100

  return (
    <div className="vp-player-bar" style={{
      position: 'relative', zIndex: 6, margin: '0 10px 10px', padding: '10px 12px calc(10px + env(safe-area-inset-bottom, 0px))',
      background: 'rgba(255,255,255,.055)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 16,
      backdropFilter: 'blur(10px)', display: 'flex', flexDirection: 'column', gap: 9,
    }}>
      <style>{`
        @media (max-width: 560px) {
          .vp-player-bar .vp-pb-scrub, .vp-player-bar .vp-pb-vol,
          .vp-player-bar .vp-pb-speed, .vp-player-bar .vp-pb-practice,
          .vp-player-bar .vp-pb-score { display: none !important; }
          .vp-player-bar .vp-pb-restart { display: none !important; }
        }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: '1 1 auto', minWidth: 0, fontFamily: "'Fraunces', Georgia, serif", fontWeight: 600, fontSize: 14, color: TEXT_HI, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {song.name}
        </div>
        <button
          className="vp-pb-practice"
          onClick={() => transport.setPractice(!practice)}
          title="Practice: play along and score your hits"
          style={{
            display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
            background: practice ? TEAL : 'rgba(255,255,255,.08)', border: '1px solid ' + (practice ? TEAL : 'rgba(255,255,255,.16)'),
            color: practice ? '#0b3a30' : TEXT_MED, padding: '7px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer',
          }}
        >
          Practice
        </button>
        <button onClick={onClose} title="Close player" style={iconBtn()}>✕</button>
      </div>

      <div className="vp-pb-scrub" style={{ padding: '2px 0', userSelect: 'none' }}>
        <div
          ref={trackRef}
          onPointerDown={(e) => beginDrag('seek', e)}
          style={{ position: 'relative', height: 32, borderRadius: 10, background: 'rgba(255,255,255,.08)', cursor: 'pointer', touchAction: 'none' }}
        >
          {loopOn && (
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: lp0 + '%', width: Math.max(0, lp1 - lp0) + '%', background: 'rgba(124,92,255,.30)', borderRadius: 9, pointerEvents: 'none' }} />
          )}
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: pct + '%', background: 'rgba(245,242,255,.22)', borderRadius: '9px 0 0 9px', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', top: -3, bottom: -3, width: 2, left: pct + '%', background: '#fff', boxShadow: '0 0 8px rgba(255,255,255,.85)', pointerEvents: 'none' }} />
          {loopOn && (
            <>
              <div onPointerDown={(e) => { e.stopPropagation(); beginDrag('loop-start', e) }} style={{ position: 'absolute', top: -4, bottom: -4, width: 18, marginLeft: -9, left: lp0 + '%', cursor: 'ew-resize', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: 5, alignSelf: 'stretch', borderRadius: 4, background: dragging === 'loop-start' ? '#fff' : VIOLET_2 }} />
              </div>
              <div onPointerDown={(e) => { e.stopPropagation(); beginDrag('loop-end', e) }} style={{ position: 'absolute', top: -4, bottom: -4, width: 18, marginLeft: -9, left: lp1 + '%', cursor: 'ew-resize', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: 5, alignSelf: 'stretch', borderRadius: 4, background: dragging === 'loop-end' ? '#fff' : VIOLET_2 }} />
              </div>
            </>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button
          className="vp-pb-restart"
          onClick={() => transport.seek(loopOn ? loopStart : 0)}
          title="Restart"
          style={iconBtn()}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 5v14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><path d="M18 6L8 12l10 6V6z" fill="currentColor" /></svg>
        </button>
        <button
          onClick={() => transport.togglePlay()}
          title={playing ? 'Pause' : 'Play'}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: VIOLET, border: '1px solid ' + VIOLET, color: '#fff', width: 44, height: 44, borderRadius: 12, cursor: 'pointer' }}
        >
          {playing
            ? <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
            : <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5v14l12-7z" /></svg>}
        </button>
        <div className="vp-pb-vol" style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, color: TEXT_MED }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M4 9v6h4l5 5V4L8 9H4z" fill="currentColor" /><path d="M16 8a5 5 0 0 1 0 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
        </div>
        <div style={{ fontFamily: 'IBM Plex Mono, ui-monospace, monospace', fontSize: 12.5, color: TEXT_MED, whiteSpace: 'nowrap' }}>
          {fmtMMSS(posSec)} / {fmtMMSS(totalDur)}
        </div>
        <div style={{ flex: '1 1 auto', minWidth: 6 }} />
        {practice && (
          <div className="vp-pb-score" style={{ fontSize: 12, color: TEXT_DIM, whiteSpace: 'nowrap' }}>
            <b style={{ color: TEAL }}>{scoreHit}</b> hit · {scoreMissed} missed
          </div>
        )}
        <select
          className="vp-pb-speed"
          value={speed}
          onChange={(e) => transport.setSpeed(parseFloat(e.target.value))}
          title="Playback speed"
          style={{ fontFamily: 'inherit', background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.16)', color: TEXT_MED, borderRadius: 10, padding: '7px 8px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
        >
          <option style={optionStyle} value="0.5">50%</option>
          <option style={optionStyle} value="0.75">75%</option>
          <option style={optionStyle} value="1">100%</option>
          <option style={optionStyle} value="1.25">125%</option>
          <option style={optionStyle} value="1.5">150%</option>
        </select>
        <button
          onClick={() => transport.setLoop(!loopOn)}
          title="Loop"
          style={{ ...ghostBtn(), ...(loopOn ? { background: VIOLET, borderColor: VIOLET, color: '#fff' } : {}), padding: '8px 10px' }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M17 2l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><path d="M3 12v-1a4 4 0 0 1 4-4h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><path d="M7 22l-4-4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><path d="M21 12v1a4 4 0 0 1-4 4H3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        </button>
      </div>
    </div>
  )
}
