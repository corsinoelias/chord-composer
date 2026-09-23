import React, { useEffect, useState } from 'react'
import type { LoopRange } from '../../lib/guitarTab/types'
import { GuitarSeekBar } from './GuitarSeekBar'
import { T, iconBtn, formatTime } from './theme'

interface TransportProps {
  isPlaying: boolean
  loop: boolean
  metronome: boolean
  countIn: 0 | 1 | 2
  bpm: number
  playbackSpeed: number
  volume: number
  currentBeat: number
  totalBeats: number
  beatsPerBar: number
  loopRange: LoopRange | null
  /** Phone width: the seek bar takes its own row above the buttons. */
  compact?: boolean
  onPlay: () => void
  onStop: () => void
  onRewind: () => void
  onLoopToggle: () => void
  onMetronomeToggle: () => void
  onCountInChange: (countIn: 0 | 1 | 2) => void
  onBpmChange: (bpm: number) => void
  onSpeedChange: (speed: number) => void
  onVolumeChange: (vol: number) => void
  onSeek: (beat: number) => void
  onLoopRangeChange: (range: LoopRange | null) => void
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2]

/** Design 1b's bottom bar: play controls, the song's timeline, tempo, speed and volume. */
export function GuitarTransport({
  isPlaying, loop, metronome, countIn, bpm, playbackSpeed, volume,
  currentBeat, totalBeats, beatsPerBar, loopRange, compact,
  onPlay, onStop, onRewind, onLoopToggle, onMetronomeToggle, onCountInChange,
  onBpmChange, onSpeedChange, onVolumeChange, onSeek, onLoopRangeChange,
}: TransportProps) {
  const [bpmInput, setBpmInput] = useState(String(bpm))
  useEffect(() => { setBpmInput(String(bpm)) }, [bpm])

  const commitBpm = () => {
    const v = parseInt(bpmInput, 10)
    if (v >= 20 && v <= 300) onBpmChange(v)
    else setBpmInput(String(bpm))
  }

  const secPerBeat = 60 / (bpm * playbackSpeed)
  const nextCountIn = (countIn === 0 ? 1 : countIn === 1 ? 2 : 0) as 0 | 1 | 2

  const buttons = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
      <button title="Back to start" onClick={onRewind} disabled={isPlaying} style={iconBtn(false, isPlaying)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>
      </button>
      <button
        title={isPlaying ? 'Stop' : 'Play'}
        onClick={isPlaying ? onStop : onPlay}
        style={{ width: 44, height: 44, borderRadius: 999, border: 'none', background: T.accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: `0 4px 14px ${T.accentRing}`, flexShrink: 0 }}
      >
        {isPlaying
          ? <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1.5"/></svg>
          : <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>}
      </button>
      <button title={loop ? 'Loop: on' : 'Loop: off'} onClick={onLoopToggle} style={iconBtn(loop)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 014-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>
      </button>
      <button
        title={loopRange ? 'Loop a section: on — drag the orange and green handles on the timeline' : 'Loop a section'}
        onClick={() => onLoopRangeChange(loopRange ? null : { startBeat: 0, endBeat: Math.ceil(totalBeats / 2) })}
        style={{ ...iconBtn(!!loopRange), width: 'auto', padding: '0 7px', fontSize: 11, fontWeight: 700, fontFamily: T.mono }}
      >A–B</button>
      <button title={metronome ? 'Metronome: on' : 'Metronome: off'} onClick={onMetronomeToggle} style={iconBtn(metronome)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m12 3-6 18h12L12 3z"/><path d="M8.5 13.5h7"/></svg>
      </button>
      <button
        title={countIn === 0 ? 'Count-in: off' : `Count-in: ${countIn} bar${countIn > 1 ? 's' : ''}`}
        onClick={() => onCountInChange(nextCountIn)}
        style={{ ...iconBtn(countIn > 0), width: countIn > 0 ? 'auto' : 32, padding: countIn > 0 ? '0 8px' : 0, gap: 4, fontSize: 11, fontWeight: 600 }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>
        {countIn > 0 && `${countIn} bar${countIn > 1 ? 's' : ''}`}
      </button>
    </div>
  )

  const timeline = (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ fontFamily: T.mono, fontSize: 12, color: T.text, fontVariantNumeric: 'tabular-nums' }}>{formatTime(currentBeat * secPerBeat)}</span>
      <GuitarSeekBar
        currentBeat={currentBeat}
        totalBeats={totalBeats}
        beatsPerBar={beatsPerBar}
        isPlaying={isPlaying}
        onSeek={onSeek}
        loopRange={loopRange}
        onLoopRangeChange={onLoopRangeChange}
      />
      <span style={{ fontFamily: T.mono, fontSize: 12, color: T.muted, fontVariantNumeric: 'tabular-nums' }}>{formatTime(totalBeats * secPerBeat)}</span>
    </div>
  )

  const tempo = (
    <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 10 : 16, flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <button title="Slower" onClick={() => onBpmChange(Math.max(20, bpm - 1))} style={{ ...iconBtn(false, false, 26), fontSize: 16 }}>−</button>
        <input
          type="number" min={20} max={300} aria-label="Tempo (BPM)"
          value={bpmInput}
          onChange={e => setBpmInput(e.target.value)}
          onBlur={commitBpm}
          onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          style={{ width: 40, height: 28, textAlign: 'center', border: 'none', borderRadius: 6, background: 'transparent', fontFamily: T.mono, fontSize: 16, fontWeight: 600, color: T.text, outline: 'none', MozAppearance: 'textfield' } as React.CSSProperties}
        />
        <button title="Faster" onClick={() => onBpmChange(Math.min(300, bpm + 1))} style={{ ...iconBtn(false, false, 26), fontSize: 16 }}>+</button>
        <span style={{ fontSize: 11, color: T.muted, marginLeft: 2 }}>BPM</span>
      </div>
      <select
        value={playbackSpeed}
        onChange={e => onSpeedChange(Number(e.target.value))}
        title="Practice speed"
        style={{ height: 28, padding: '0 8px', borderRadius: 7, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans, background: playbackSpeed !== 1 ? T.accentSoft : T.well, color: playbackSpeed !== 1 ? T.accentText : T.text }}
      >
        {SPEEDS.map(s => <option key={s} value={s}>{s}×</option>)}
      </select>
      {!compact && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: T.muted }} title="Volume">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19 11,5"/><path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07"/></svg>
          <input
            type="range" min={0} max={1} step={0.01} value={volume}
            onChange={e => onVolumeChange(Number(e.target.value))}
            style={{ width: 80, accentColor: T.accent }}
          />
        </label>
      )}
    </div>
  )

  if (compact) {
    return (
      <div style={{ flexShrink: 0, borderTop: `1px solid ${T.border}`, background: T.panel, padding: '8px 12px 10px', display: 'flex', flexDirection: 'column', gap: 6, userSelect: 'none' }}>
        {timeline}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          {buttons}
          {tempo}
        </div>
      </div>
    )
  }

  return (
    <div style={{ flexShrink: 0, height: 68, borderTop: `1px solid ${T.border}`, background: T.panel, display: 'flex', alignItems: 'center', gap: 22, padding: '0 20px', userSelect: 'none' }}>
      {buttons}
      {timeline}
      {tempo}
    </div>
  )
}
