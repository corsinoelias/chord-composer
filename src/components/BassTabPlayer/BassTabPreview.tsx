import React, { useState, useCallback, useRef, useEffect } from 'react'
import { type BassNote, type BassTrack } from '../../lib/bassTab/types'
import { TabNotationView } from './TabNotationView'
import { startPlayback, stopPlayback } from '../../lib/bassTab/bassAudio'
import { PRESETS } from '../../data/presets'

const noop = () => {}

interface Props {
  presetId: string
  editorHref?: string
}

export function BassTabPreview({ presetId, editorHref = '/bass-tab/' }: Props) {
  const preset = PRESETS.find(p => p.id === presetId)

  const trackRef = useRef<BassTrack | null>(
    preset
      ? { id: preset.id, name: preset.name, bpm: preset.bpm, beatsPerBar: preset.beatsPerBar, totalBars: preset.totalBars, notes: preset.notes, sections: preset.sections }
      : null
  )

  const [isPlaying, setIsPlaying]     = useState(false)
  const [currentBeat, setCurrentBeat] = useState(0)
  // client:visible hydrates this island only once it scrolls into view — the Play button
  // is already in the SSR'd HTML at that point, but its onClick isn't wired up until React
  // attaches. Gate on mount so an early click can't silently no-op (no sound, no feedback).
  const [ready, setReady] = useState(false)
  useEffect(() => { setReady(true) }, [])

  const handleTogglePlay = useCallback(() => {
    if (!trackRef.current || !preset) return
    if (isPlaying) {
      stopPlayback()
      setIsPlaying(false)
      return
    }
    const totalBeats = trackRef.current.totalBars * trackRef.current.beatsPerBar
    const from = currentBeat < totalBeats ? currentBeat : 0
    setIsPlaying(true)
    startPlayback(
      trackRef.current,
      from,
      preset.defaultSound,
      (beat) => setCurrentBeat(beat),
      () => { setIsPlaying(false); setCurrentBeat(0) },
      () => true,
      () => false,
      () => null,
    )
  }, [isPlaying, currentBeat, preset])

  if (!trackRef.current || !preset) return null

  const track       = trackRef.current
  const currentBar  = Math.floor(currentBeat / track.beatsPerBar) + 1
  const totalBars   = track.totalBars
  const barFraction = (currentBeat % track.beatsPerBar) / track.beatsPerBar

  return (
    <div className="relative rounded-xl border border-border bg-background overflow-hidden" style={{ height: 196 }}>
      {/* Read-only notation — one bar at a time */}
      <div className="absolute inset-0 bottom-14 overflow-hidden pointer-events-none select-none">
        <TabNotationView
          track={track}
          zoom={1}
          currentBeat={currentBeat}
          cursorBeat={currentBeat}
          isPlaying={isPlaying}
          selectedNoteId={null}
          sound={preset.defaultSound}
          noteDuration={0.5}
          onAddNote={noop as unknown as (n: BassNote) => void}
          onUpdateNote={noop as unknown as (id: string, patch: Partial<BassNote>) => void}
          onDeleteNote={noop}
          onSelectNote={noop}
          onCursorBeatChange={noop}
          visibleBars={2}
        />
      </div>

      {/* Bar progress strip */}
      <div
        className="absolute left-0 right-0 pointer-events-none"
        style={{ bottom: 56, height: 2, background: 'var(--bt-rule)' }}
      >
        <div
          style={{
            height: '100%',
            background: 'var(--bt-accent)',
            width: `${((currentBar - 1 + barFraction) / totalBars) * 100}%`,
            transition: 'width 0.08s linear',
            boxShadow: '2px 0 6px var(--bt-accent)',
          }}
        />
      </div>

      {/* Bar counter overlay — top-right of notation area */}
      <div
        className="absolute top-2 right-2 pointer-events-none"
        style={{
          background: 'rgba(244,242,236,0.85)',
          border: '1px solid var(--bt-rule)',
          borderRadius: 6,
          padding: '2px 7px',
          fontFamily: 'ui-monospace, monospace',
          fontSize: 11,
          color: 'var(--bt-soft)',
          lineHeight: 1.6,
        }}
      >
        <span style={{ color: 'var(--bt-muted)' }}>{currentBar}</span>
        <span style={{ opacity: 0.4 }}>/{totalBars}</span>
      </div>

      {/* Bottom bar: play + song info + CTA */}
      <div className="absolute bottom-0 inset-x-0 h-14 border-t border-border bg-background/95 backdrop-blur-sm flex items-center justify-between px-4 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={handleTogglePlay}
            disabled={!ready}
            className="flex-shrink-0 w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-wait"
            aria-label={!ready ? 'Loading' : isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying
              ? <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
              : <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
            }
          </button>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{preset.name}</p>
            <p className="text-xs text-muted-foreground">{preset.artist} · {preset.bpm} BPM</p>
          </div>
        </div>
        <a
          href={editorHref}
          className="flex-shrink-0 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-primary transition-colors"
        >
          Edit
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </a>
      </div>
    </div>
  )
}
