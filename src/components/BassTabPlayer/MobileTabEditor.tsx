import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import type { BassNote, BassTrack, StringIndex, BassSound } from '../../lib/bassTab/types'
import { STRINGS, snapToGrid, clampDuration } from '../../lib/bassTab/bassTheory'
import { previewNote } from '../../lib/bassTab/bassAudio'

// ── Constants ─────────────────────────────────────────────────────────────────
const SNAP      = 0.5
const LABEL_W   = 36
const STRING_PX = [1.5, 2, 2.8, 3.8]
const DURATIONS = [
  { beats: 2,    label: '2' },
  { beats: 1,    label: '1' },
  { beats: 0.5,  label: '½' },
  { beats: 0.25, label: '¼' },
] as const

interface Props {
  track: BassTrack
  currentBeat: number
  isPlaying: boolean
  selectedNoteId: string | null
  onAddNote: (note: BassNote) => void
  onUpdateNote: (id: string, patch: Partial<BassNote>) => void
  onDeleteNote: (id: string) => void
  onSelectNote: (id: string | null) => void
  onSeek: (beat: number) => void
  onBeginEdit?: () => void
  sound: BassSound
}

// ── Component ─────────────────────────────────────────────────────────────────
export function MobileTabEditor({
  track, currentBeat, isPlaying, selectedNoteId,
  onAddNote, onUpdateNote, onDeleteNote, onSelectNote,
  onSeek, onBeginEdit, sound,
}: Props) {
  const { beatsPerBar, totalBars } = track
  const totalBeats = totalBars * beatsPerBar

  const [displayBar, setDisplayBar]       = useState(0)
  const [activeFret, setActiveFret]       = useState(0)
  const [activeDuration, setActiveDuration] = useState(1)

  const fretRowRef  = useRef<HTMLDivElement>(null)
  const swipeRef    = useRef<{ x: number; y: number } | null>(null)

  const barStart = displayBar * beatsPerBar
  const barEnd   = barStart + beatsPerBar

  const selectedNote = useMemo(
    () => track.notes.find(n => n.id === selectedNoteId) ?? null,
    [track.notes, selectedNoteId],
  )

  // Auto-advance bar during playback
  useEffect(() => {
    if (!isPlaying) return
    const bar = Math.floor(currentBeat / beatsPerBar)
    if (bar !== displayBar && bar >= 0 && bar < totalBars) setDisplayBar(bar)
  }, [isPlaying, currentBeat, beatsPerBar, displayBar, totalBars])

  // Scroll fret row to keep active fret visible
  useEffect(() => {
    const el = fretRowRef.current
    if (!el) return
    const cellW = 56
    el.scrollTo({ left: activeFret * cellW - el.clientWidth / 2 + cellW / 2, behavior: 'smooth' })
  }, [activeFret])

  // When note is selected, sync active fret to it
  useEffect(() => {
    if (selectedNote) setActiveFret(selectedNote.fret)
  }, [selectedNote?.id, selectedNote?.fret]) // eslint-disable-line react-hooks/exhaustive-deps

  // Navigate bars
  const goTo = useCallback((bar: number) => {
    const b = Math.max(0, Math.min(totalBars - 1, bar))
    setDisplayBar(b)
    onSelectNote(null)
    onSeek(b * beatsPerBar)
  }, [totalBars, beatsPerBar, onSeek, onSelectNote])

  // Tap on a string row (not on a note)
  const handleRowTap = useCallback((e: React.MouseEvent<HTMLDivElement>, si: StringIndex) => {
    if (isPlaying) return
    const target = e.target as HTMLElement
    if (target.closest('[data-note-id]')) return
    // Deselect if clicking background
    onSelectNote(null)
    const rect     = e.currentTarget.getBoundingClientRect()
    const fraction = Math.max(0, Math.min(0.9999, (e.clientX - rect.left) / rect.width))
    const rawBeat  = barStart + fraction * beatsPerBar
    const beat     = snapToGrid(rawBeat, SNAP)
    const safeDur  = clampDuration(track.notes, si, beat, activeDuration, totalBeats)
    if (safeDur <= 0) return
    onBeginEdit?.()
    const note: BassNote = {
      id: crypto.randomUUID(), stringIndex: si,
      fret: activeFret, startBeat: beat, durationBeats: safeDur, velocity: 0.8,
    }
    onAddNote(note)
    onSelectNote(note.id)
    previewNote(si, activeFret, sound)
  }, [isPlaying, barStart, beatsPerBar, activeFret, activeDuration, track.notes, totalBeats, onAddNote, onSelectNote, onBeginEdit, sound])

  // Tap on a note: first tap = select, second tap = delete
  const handleNoteTap = useCallback((e: React.MouseEvent, note: BassNote) => {
    e.stopPropagation()
    if (note.id === selectedNoteId) {
      // Second tap → delete
      onBeginEdit?.(); onDeleteNote(note.id); onSelectNote(null)
    } else {
      // First tap → select
      onSelectNote(note.id)
      previewNote(note.stringIndex, note.fret, sound)
    }
  }, [selectedNoteId, onDeleteNote, onSelectNote, onBeginEdit, sound])

  // Fret row tap — update active fret and live-update selected note
  const handleFretTap = useCallback((fret: number) => {
    setActiveFret(fret)
    if (selectedNoteId && selectedNote) {
      onBeginEdit?.(); onUpdateNote(selectedNoteId, { fret })
      previewNote(selectedNote.stringIndex, fret, sound)
    }
  }, [selectedNoteId, selectedNote, onUpdateNote, onBeginEdit, sound])

  // Duration change — also updates selected note
  const handleDurationChange = useCallback((dur: number) => {
    setActiveDuration(dur)
    if (selectedNoteId && selectedNote) {
      const safeDur = clampDuration(
        track.notes.filter(n => n.id !== selectedNoteId),
        selectedNote.stringIndex, selectedNote.startBeat, dur, totalBeats,
      )
      if (safeDur > 0) { onBeginEdit?.(); onUpdateNote(selectedNoteId, { durationBeats: safeDur }) }
    }
  }, [selectedNoteId, selectedNote, track.notes, totalBeats, onUpdateNote, onBeginEdit])

  // Swipe to navigate bars
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    swipeRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }, [])
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!swipeRef.current) return
    const dx = swipeRef.current.x - e.changedTouches[0].clientX
    const dy = Math.abs(swipeRef.current.y - e.changedTouches[0].clientY)
    swipeRef.current = null
    if (Math.abs(dx) > 50 && dy < 80) goTo(displayBar + (dx > 0 ? 1 : -1))
  }, [displayBar, goTo])

  const barNotes     = useMemo(
    () => track.notes.filter(n => n.startBeat < barEnd && n.startBeat + n.durationBeats > barStart),
    [track.notes, barStart, barEnd],
  )
  const cursorPct    = Math.min(100, Math.max(0, (currentBeat - barStart) / beatsPerBar * 100))
  const showPlayhead = currentBeat >= barStart && currentBeat <= barEnd

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--bt-paper)', userSelect: 'none', WebkitUserSelect: 'none' }}>

      {/* Bar navigation */}
      <div style={{ flexShrink: 0, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 10px', background: 'var(--bt-sunken)', borderBottom: '1px solid var(--bt-card)' }}>
        <NavBtn onClick={() => goTo(displayBar - 1)} enabled={displayBar > 0}>‹</NavBtn>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--bt-muted)', letterSpacing: '0.03em', fontFamily: 'var(--bt-ui)' }}>
            Compás {displayBar + 1} / {totalBars}
          </span>
          <div style={{ display: 'flex', gap: 4 }}>
            {Array.from({ length: totalBars }, (_, i) => (
              <div key={i} onClick={() => goTo(i)} style={{
                width: i === displayBar ? 8 : 5, height: i === displayBar ? 8 : 5,
                borderRadius: '50%', cursor: 'pointer', transition: 'all 0.12s',
                background: i === displayBar
                  ? (isPlaying ? 'var(--bt-accent)' : 'var(--bt-muted)')
                  : 'var(--bt-rule)',
              }} />
            ))}
          </div>
        </div>
        <NavBtn onClick={() => goTo(displayBar + 1)} enabled={displayBar < totalBars - 1}>›</NavBtn>
      </div>

      {/* Tab grid */}
      <div
        style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative' }}
        onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}
      >
        {STRINGS.map((s, si) => {
          const rowNotes = barNotes.filter(n => n.stringIndex === si)
          return (
            <div
              key={si}
              style={{ flex: 1, display: 'flex', minHeight: 0, borderBottom: si < 3 ? '1px solid var(--bt-card)' : 'none', cursor: 'crosshair' }}
              onClick={e => handleRowTap(e, si as StringIndex)}
            >
              {/* String label */}
              <div style={{ width: LABEL_W, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bt-sunken)', borderRight: '1px solid var(--bt-card)', pointerEvents: 'none', zIndex: 1 }}>
                <span style={{ color: s.color, fontSize: 11, fontWeight: 700, fontFamily: 'var(--bt-mono)' }}>{s.displayName}</span>
              </div>

              {/* Content */}
              <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                {/* String line */}
                <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: STRING_PX[si], background: 'var(--bt-rule)', transform: 'translateY(-50%)', pointerEvents: 'none' }} />

                {/* Beat markers */}
                {Array.from({ length: beatsPerBar - 1 }, (_, i) => (
                  <div key={i} style={{
                    position: 'absolute', top: 0, bottom: 0, width: 1, pointerEvents: 'none',
                    left: `${((i + 1) / beatsPerBar) * 100}%`,
                    background: 'var(--bt-rule)',
                  }} />
                ))}
                {/* Half-beat markers */}
                {Array.from({ length: beatsPerBar * 2 - 1 }, (_, i) => {
                  if ((i + 1) % 2 === 0) return null // skip full beats (already drawn)
                  return (
                    <div key={i} style={{
                      position: 'absolute', top: '25%', bottom: '25%', width: 1, pointerEvents: 'none',
                      left: `${((i + 1) / (beatsPerBar * 2)) * 100}%`,
                      background: 'var(--bt-card)',
                    }} />
                  )
                })}

                {/* Notes */}
                {rowNotes.map(note => {
                  const leftPct  = Math.max(0, (note.startBeat - barStart) / beatsPerBar * 100)
                  const widthPct = Math.min(100 - leftPct, note.durationBeats / beatsPerBar * 100)
                  const isSel    = note.id === selectedNoteId
                  return (
                    <div
                      key={note.id}
                      data-note-id={note.id}
                      onPointerDown={e => { e.stopPropagation(); handleNoteTap(e as unknown as React.MouseEvent, note) }}
                      style={{
                        position: 'absolute',
                        left: `${leftPct}%`, width: `max(32px, ${widthPct}%)`,
                        top: '50%', transform: 'translateY(-50%)',
                        height: 34, borderRadius: 8,
                        background: isSel ? `${s.color}2a` : `${s.darkColor}cc`,
                        border: `2px solid ${isSel ? s.color : s.darkColor}`,
                        boxShadow: isSel ? `0 0 14px ${s.color}55` : 'none',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', zIndex: 3, transition: 'box-shadow 0.1s, border-color 0.1s',
                        WebkitTapHighlightColor: 'transparent',
                        touchAction: 'manipulation',
                      }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 700, color: isSel ? s.color : `${s.color}cc`, fontFamily: 'var(--bt-mono)', pointerEvents: 'none' }}>
                        {note.fret}
                      </span>
                      {/* Delete hint on selected note */}
                      {isSel && (
                        <span style={{ position: 'absolute', top: -6, right: -6, width: 14, height: 14, borderRadius: '50%', background: 'var(--bt-danger)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: 'white', pointerEvents: 'none', fontWeight: 700 }}>
                          ×
                        </span>
                      )}
                    </div>
                  )
                })}

                {/* Playhead */}
                {showPlayhead && (
                  <div style={{ position: 'absolute', top: 0, bottom: 0, width: 2, pointerEvents: 'none', zIndex: 4, left: `${cursorPct}%`, background: 'var(--bt-accent)', boxShadow: '0 0 6px var(--bt-accent-wash)' }} />
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Duration + hint bar */}
      <div style={{ flexShrink: 0, height: 42, display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px', background: 'var(--bt-sunken)', borderTop: '1px solid var(--bt-card)' }}>
        <span style={{ fontSize: 10, color: 'var(--bt-dim)', fontFamily: 'var(--bt-ui)', letterSpacing: '0.04em', marginRight: 2 }}>DUR</span>
        {DURATIONS.map(d => {
          const on = d.beats === activeDuration
          return (
            <button key={d.beats} onClick={() => handleDurationChange(d.beats)} style={{
              height: 28, minWidth: 34, paddingInline: 8, borderRadius: 6,
              background: on ? 'var(--bt-accent-wash)' : 'var(--bt-card)',
              border: `1px solid ${on ? 'var(--bt-accent)' : 'var(--bt-rule)'}`,
              color: on ? 'var(--bt-accent)' : 'var(--bt-soft)',
              fontSize: 13, fontWeight: on ? 700 : 400,
              fontFamily: 'var(--bt-mono)', cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
            }}>
              {d.label}
            </button>
          )
        })}
        <div style={{ flex: 1 }} />
        {selectedNote ? (
          <span style={{ fontSize: 10, color: 'var(--bt-dim)', fontFamily: 'var(--bt-ui)' }}>
            toca de nuevo para borrar
          </span>
        ) : (
          <span style={{ fontSize: 10, color: 'var(--bt-dim)', fontFamily: 'var(--bt-ui)' }}>
            toca la cuerda para colocar
          </span>
        )}
      </div>

      {/* Fret row — large scrollable buttons */}
      <div
        ref={fretRowRef}
        style={{ flexShrink: 0, height: 54, display: 'flex', overflowX: 'auto', scrollbarWidth: 'none', background: 'var(--bt-card)', borderTop: '1px solid var(--bt-card)' }}
      >
        {Array.from({ length: 25 }, (_, fret) => {
          const on = fret === activeFret
          return (
            <button
              key={fret}
              onPointerDown={e => { e.preventDefault(); handleFretTap(fret) }}
              style={{
                flexShrink: 0, width: 56, height: '100%',
                background: on ? 'var(--bt-accent-wash)' : 'transparent',
                border: 'none',
                borderRight: '1px solid var(--bt-card)',
                borderTop: `2px solid ${on ? 'var(--bt-accent)' : 'transparent'}`,
                color: on ? 'var(--bt-accent)' : 'var(--bt-soft)',
                fontSize: on ? 18 : 15, fontWeight: on ? 700 : 400,
                fontFamily: 'var(--bt-mono)',
                cursor: 'pointer', transition: 'all 0.1s',
                WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
              }}
            >
              {fret}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── NavBtn ────────────────────────────────────────────────────────────────────
function NavBtn({ onClick, enabled, children }: { onClick: () => void; enabled: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={!enabled} style={{
      width: 36, height: 36, borderRadius: 8,
      background: enabled ? 'var(--bt-card)' : 'transparent',
      border: `1px solid ${enabled ? 'var(--bt-rule)' : 'transparent'}`,
      color: enabled ? 'var(--bt-muted)' : 'var(--bt-rule)',
      fontSize: 20, cursor: enabled ? 'pointer' : 'default',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
    }}>
      {children}
    </button>
  )
}
