import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import type { BassNote, BassTrack, BassSound } from '../../lib/bassTab/types'
import { TabNotationView } from './TabNotationView'

interface MobileBarViewProps {
  track:       BassTrack
  currentBeat: number
  isPlaying:   boolean
  onSeek:      (beat: number) => void
  viewMode?:   'notation' | 'score' | 'grid'
  // Optional edit props — when provided, the score view becomes editable
  editable?:       boolean
  selectedNoteId?: string | null
  sound?:          BassSound
  noteDuration?:   number
  onAddNote?:      (note: BassNote) => void
  onUpdateNote?:   (id: string, patch: Partial<BassNote>) => void
  onDeleteNote?:   (id: string) => void
  onSelectNote?:   (id: string | null) => void
  onBeginEdit?:    () => void
}

// ── Colour palette ───────────────────────────────────────────────────────────
const C = {
  bg:          'var(--bt-paper)',
  string:      'var(--bt-rule)',
  stringLabel: 'var(--bt-dim)',
  noteBox:     'var(--bt-sunken)',
  noteBorder:  'var(--bt-dim)',
  noteFret:    'var(--bt-ink)',
  noteActive:  'var(--bt-accent)',
  noteActBg:   'var(--bt-accent-wash)',
  cursor:      'var(--bt-accent)',
  cursorGlow:  'var(--bt-accent-wash)',
  barLabel:    'var(--bt-muted)',
  barMuted:    'var(--bt-dim)',
  navBtn:      'var(--bt-sunken)',
  navBtnBorder:'var(--bt-rule)',
  navBtnText:  'var(--bt-muted)',
  navBtnHover: 'var(--bt-rule)',
}

// ── SVG layout (viewBox units) ────────────────────────────────────────────────
const VB_W        = 400
const LABEL_W     = 30
const RIGHT_PAD   = 12
const NOTE_W      = 400 - LABEL_W - RIGHT_PAD   // usable note area width
const STRING_Y    = [22, 50, 78, 106]            // G D A E string y-positions
const VB_H        = 130
const NOTE_BOX_W  = 26
const NOTE_BOX_H  = 20
const CURSOR_W    = 2

const STRING_NAMES = ['G', 'D', 'A', 'E']

function beatX(beatInBar: number, beatsPerBar: number): number {
  return LABEL_W + (beatInBar / beatsPerBar) * NOTE_W
}

// ── Single-bar SVG tab ───────────────────────────────────────────────────────
interface BarSVGProps {
  track:       BassTrack
  barIndex:    number
  beatInBar:   number   // -1 if cursor not in this bar
  isPlaying:   boolean
}

function BarSVG({ track, barIndex, beatInBar, isPlaying }: BarSVGProps) {
  const { notes, beatsPerBar } = track
  const barStart = barIndex * beatsPerBar
  const barEnd   = barStart + beatsPerBar

  const barNotes = notes.filter(n => n.startBeat >= barStart && n.startBeat < barEnd)

  const cursorX = beatInBar >= 0
    ? beatX(beatInBar, beatsPerBar)
    : -99

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      width="100%"
      height="100%"
      style={{ display: 'block' }}
      preserveAspectRatio="xMidYMid meet"
    >
      {/* String lines */}
      {STRING_Y.map((y, i) => (
        <g key={i}>
          <text
            x={LABEL_W - 6} y={y + 5}
            textAnchor="end"
            fontSize={11} fill={C.stringLabel}
            fontFamily="var(--bt-mono)"
          >
            {STRING_NAMES[i]}
          </text>
          <line
            x1={LABEL_W} y1={y} x2={VB_W - RIGHT_PAD} y2={y}
            stroke={C.string} strokeWidth={1}
          />
        </g>
      ))}

      {/* Beat sub-divisions (faint tick marks) */}
      {Array.from({ length: beatsPerBar - 1 }, (_, i) => {
        const x = beatX(i + 1, beatsPerBar)
        return (
          <line key={i} x1={x} y1={STRING_Y[0] - 10} x2={x} y2={STRING_Y[3] + 10}
            stroke="var(--bt-rule)" strokeWidth={1} />
        )
      })}

      {/* Cursor glow area */}
      {beatInBar >= 0 && (
        <rect
          x={cursorX - 14} y={STRING_Y[0] - 14}
          width={28}
          height={STRING_Y[3] - STRING_Y[0] + 28}
          rx={6} fill={C.cursorGlow}
        />
      )}

      {/* Notes */}
      {barNotes.map(n => {
        const x  = beatX(n.startBeat - barStart, beatsPerBar)
        const y  = STRING_Y[n.stringIndex]
        const isActive = beatInBar >= 0 &&
          beatInBar >= n.startBeat - barStart &&
          beatInBar <  n.startBeat - barStart + n.durationBeats

        return (
          <g key={n.id} transform={`translate(${x},${y})`}>
            <rect
              x={-NOTE_BOX_W / 2} y={-NOTE_BOX_H / 2}
              width={NOTE_BOX_W} height={NOTE_BOX_H} rx={4}
              fill={isActive ? C.noteActBg : C.noteBox}
              stroke={isActive ? C.noteActive : C.noteBorder}
              strokeWidth={isActive ? 1.5 : 1}
            />
            <text
              x={0} y={6}
              textAnchor="middle"
              fontSize={13} fontWeight={isActive ? '700' : '500'}
              fill={isActive ? C.noteActive : C.noteFret}
              fontFamily="var(--bt-mono)"
            >
              {n.fret}
            </text>
          </g>
        )
      })}

      {/* Beat cursor line */}
      {beatInBar >= 0 && (
        <line
          x1={cursorX} y1={STRING_Y[0] - 14}
          x2={cursorX} y2={STRING_Y[3] + 14}
          stroke={C.cursor} strokeWidth={CURSOR_W}
          strokeLinecap="round"
        />
      )}
    </svg>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export function MobileBarView({ track, currentBeat, isPlaying, onSeek, viewMode = 'notation',
  editable = false, selectedNoteId = null, sound = 'electric', noteDuration = 0.5,
  onAddNote, onUpdateNote, onDeleteNote, onSelectNote, onBeginEdit,
}: MobileBarViewProps) {
  const { beatsPerBar, totalBars } = track

  const [displayBar, setDisplayBar] = useState(() =>
    Math.min(Math.floor(currentBeat / beatsPerBar), totalBars - 1),
  )

  // Auto-advance when playback crosses into a new bar
  useEffect(() => {
    if (!isPlaying) return
    const playingBar = Math.floor(currentBeat / beatsPerBar)
    if (playingBar !== displayBar && playingBar >= 0 && playingBar < totalBars) {
      setDisplayBar(playingBar)
    }
  }, [isPlaying, currentBeat, beatsPerBar, displayBar, totalBars])

  // Navigate bar + seek playback
  const goTo = useCallback((bar: number) => {
    const b = Math.max(0, Math.min(totalBars - 1, bar))
    setDisplayBar(b)
    onSeek(b * beatsPerBar)
  }, [totalBars, beatsPerBar, onSeek])

  // Touch swipe detection
  const touchStartX = useRef(0)
  const touchStartY = useRef(0)
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }, [])
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const dx = touchStartX.current - e.changedTouches[0].clientX
    const dy = Math.abs(touchStartY.current - e.changedTouches[0].clientY)
    if (Math.abs(dx) > 45 && dy < 60) {
      goTo(displayBar + (dx > 0 ? 1 : -1))
    }
  }, [displayBar, goTo])

  const barStart = displayBar * beatsPerBar
  const barEnd   = barStart + beatsPerBar

  // Single-bar track for Score (notation) mode — filters to just the current bar
  const singleBarTrack = useMemo<BassTrack>(() => ({
    ...track,
    id:        `${track.id}-bar${displayBar}`,
    totalBars: 1,
    notes:     track.notes
      .filter(n => n.startBeat >= barStart && n.startBeat < barEnd)
      .map(n => ({ ...n, startBeat: n.startBeat - barStart })),
    sections: [],
  }), [track, displayBar, barStart, barEnd])

  const isBarActive  = Math.floor(currentBeat / beatsPerBar) === displayBar
  const beatInSingleBar = isBarActive ? Math.max(0, currentBeat - barStart) : 0

  const beatInBar = isBarActive ? currentBeat - barStart : -1

  const canPrev = displayBar > 0
  const canNext = displayBar < totalBars - 1

  return (
    <div
      style={{
        flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0,
        background: C.bg, userSelect: 'none',
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* ── Bar navigation header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 12px', flexShrink: 0,
        borderBottom: '1px solid var(--bt-card)',
      }}>
        <button
          onClick={() => goTo(displayBar - 1)}
          disabled={!canPrev}
          style={{
            width: 36, height: 36, borderRadius: 8, flexShrink: 0,
            background: canPrev ? C.navBtn : 'transparent',
            border: `1px solid ${canPrev ? C.navBtnBorder : 'transparent'}`,
            color: canPrev ? C.navBtnText : 'var(--bt-rule)',
            fontSize: 18, cursor: canPrev ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            touchAction: 'manipulation',
          }}
        >‹</button>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.barLabel, letterSpacing: '0.02em' }}>
            Compás {displayBar + 1}
          </span>
          {/* Dot indicators */}
          <div style={{ display: 'flex', gap: 4 }}>
            {Array.from({ length: totalBars }, (_, i) => (
              <div key={i} style={{
                width: i === displayBar ? 8 : 5,
                height: i === displayBar ? 8 : 5,
                borderRadius: '50%',
                background: i === displayBar
                  ? (isPlaying ? C.noteActive : 'var(--bt-muted)')
                  : 'var(--bt-rule)',
                transition: 'all 0.15s',
              }} />
            ))}
          </div>
        </div>

        <button
          onClick={() => goTo(displayBar + 1)}
          disabled={!canNext}
          style={{
            width: 36, height: 36, borderRadius: 8, flexShrink: 0,
            background: canNext ? C.navBtn : 'transparent',
            border: `1px solid ${canNext ? C.navBtnBorder : 'transparent'}`,
            color: canNext ? C.navBtnText : 'var(--bt-rule)',
            fontSize: 18, cursor: canNext ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            touchAction: 'manipulation',
          }}
        >›</button>
      </div>

      {/* ── Content: Score notation or Tab SVG ── */}
      <div style={{ flex: 1, minHeight: 0, padding: viewMode === 'score' ? '2px 0' : '8px 4px', overflow: 'hidden' }}>
        {viewMode === 'score' ? (
          <TabNotationView
            track={singleBarTrack}
            zoom={1}
            currentBeat={beatInSingleBar}
            cursorBeat={beatInSingleBar}
            isPlaying={isPlaying && isBarActive}
            selectedNoteId={editable ? selectedNoteId : null}
            sound={sound}
            noteDuration={noteDuration}
            onAddNote={editable && onAddNote
              ? (n) => onAddNote({ ...n, startBeat: n.startBeat + barStart })
              : () => {}}
            onUpdateNote={editable && onUpdateNote ? onUpdateNote : () => {}}
            onDeleteNote={editable && onDeleteNote ? onDeleteNote : () => {}}
            onSelectNote={editable && onSelectNote ? onSelectNote : () => {}}
            onCursorBeatChange={() => {}}
            onBeginEdit={editable && onBeginEdit ? onBeginEdit : () => {}}
            onSectionChange={() => {}}
          />
        ) : (
          <BarSVG
            track={track}
            barIndex={displayBar}
            beatInBar={beatInBar}
            isPlaying={isPlaying}
          />
        )}
      </div>

      {/* ── Swipe hint — shown once, fades out ── */}
      <div style={{
        textAlign: 'center', padding: '0 0 6px',
        fontSize: 10, color: 'var(--bt-dim)', flexShrink: 0,
      }}>
        desliza para navegar
      </div>
    </div>
  )
}
