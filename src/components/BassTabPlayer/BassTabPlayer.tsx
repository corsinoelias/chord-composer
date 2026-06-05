import React, { useState, useCallback, useEffect, useMemo } from 'react'
import { type BassNote, type BassTrack, type BassSound, type SnapValue, DEFAULT_TRACK } from '../../lib/bassTab/types'
import { startPlayback, stopPlayback, setMasterVolume } from '../../lib/bassTab/bassAudio'
import { BassTabTransport } from './BassTabTransport'
import { BassTabFretboard } from './BassTabFretboard'
import { BassTabGrid } from './BassTabGrid'

const STORAGE_KEY = 'bass-tab-track-v1'

function loadTrack(): BassTrack {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULT_TRACK, ...JSON.parse(raw) }
  } catch {}
  return DEFAULT_TRACK
}

function saveTrack(track: BassTrack) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(track))
  } catch {}
}

export function BassTabPlayer() {
  const [track, setTrack]               = useState<BassTrack>(loadTrack)
  const [isPlaying, setIsPlaying]       = useState(false)
  const [currentBeat, setCurrentBeat]   = useState(0)
  const [zoom, setZoom]                 = useState(1)
  const [snap, setSnap]                 = useState<SnapValue>(0.25)
  const [sound, setSound]               = useState<BassSound>('electric')
  const [loop, setLoop]                 = useState(true)
  const [volume, setVolume]             = useState(0.75)
  const [selectedNoteId, setSelectedId] = useState<string | null>(null)

  // Persist track on change
  useEffect(() => { saveTrack(track) }, [track])

  const selectedNote = useMemo(
    () => track.notes.find(n => n.id === selectedNoteId) ?? null,
    [track.notes, selectedNoteId],
  )

  // Active frets for fretboard visualization
  const activeFrets = useMemo((): (number | null)[] => {
    const active: (number | null)[] = [null, null, null, null]
    for (const note of track.notes) {
      if (currentBeat >= note.startBeat && currentBeat < note.startBeat + note.durationBeats) {
        active[note.stringIndex] = note.fret
      }
    }
    return active
  }, [track.notes, currentBeat])

  // ── Playback ─────────────────────────────────────────────────────────────
  const handlePlay = useCallback(() => {
    const fromBeat = currentBeat >= track.totalBars * track.beatsPerBar ? 0 : currentBeat
    setIsPlaying(true)
    startPlayback(
      track, fromBeat, sound,
      (beat) => setCurrentBeat(beat),
      () => { setIsPlaying(false) },
      loop,
    )
  }, [track, currentBeat, sound, loop])

  const handleStop = useCallback(() => {
    stopPlayback()
    setIsPlaying(false)
    setCurrentBeat(0)
  }, [])

  // ── Track mutations ───────────────────────────────────────────────────────
  const addNote = useCallback((note: BassNote) => {
    setTrack(t => ({ ...t, notes: [...t.notes, note] }))
  }, [])

  const updateNote = useCallback((id: string, patch: Partial<BassNote>) => {
    setTrack(t => ({
      ...t,
      notes: t.notes.map(n => n.id === id ? { ...n, ...patch } : n),
    }))
  }, [])

  const deleteNote = useCallback((id: string) => {
    setTrack(t => ({ ...t, notes: t.notes.filter(n => n.id !== id) }))
    setSelectedId(prev => prev === id ? null : prev)
  }, [])

  // ── Transport mutations ───────────────────────────────────────────────────
  const handleBpmChange = useCallback((bpm: number) => {
    if (isPlaying) { stopPlayback(); setIsPlaying(false); setCurrentBeat(0) }
    setTrack(t => ({ ...t, bpm }))
  }, [isPlaying])

  const handleBarsChange = useCallback((totalBars: number) => {
    setTrack(t => ({ ...t, totalBars }))
  }, [])

  const handleFretChange = useCallback((fret: number) => {
    if (!selectedNoteId) return
    updateNote(selectedNoteId, { fret })
  }, [selectedNoteId, updateNote])

  const handleVolumeChange = useCallback((vol: number) => {
    setVolume(vol)
    setMasterVolume(vol)
  }, [])

  const handleZoomChange = useCallback((z: number) => {
    setZoom(Math.max(0.4, Math.min(4, z)))
  }, [])

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return
      if (e.code === 'Space') {
        e.preventDefault()
        isPlaying ? handleStop() : handlePlay()
      }
      if ((e.code === 'Delete' || e.code === 'Backspace') && selectedNoteId) {
        e.preventDefault()
        deleteNote(selectedNoteId)
      }
      // Fret up/down when note selected
      if (selectedNote) {
        if (e.code === 'ArrowUp')   { e.preventDefault(); updateNote(selectedNote.id, { fret: Math.min(24, selectedNote.fret + 1) }) }
        if (e.code === 'ArrowDown') { e.preventDefault(); updateNote(selectedNote.id, { fret: Math.max(0,  selectedNote.fret - 1) }) }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isPlaying, handlePlay, handleStop, selectedNoteId, deleteNote, selectedNote, updateNote])

  // Deselect when clicking outside
  const handleBackgroundClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) setSelectedId(null)
  }, [])

  return (
    <div
      className="flex flex-col bg-gray-900 text-white"
      style={{ height: '100dvh', fontFamily: 'ui-monospace, monospace', overflow: 'hidden' }}
      onClick={handleBackgroundClick}
    >
      {/* Transport bar */}
      <BassTabTransport
        isPlaying={isPlaying}
        loop={loop}
        bpm={track.bpm}
        snap={snap}
        sound={sound}
        totalBars={track.totalBars}
        zoom={zoom}
        volume={volume}
        hasSelectedNote={!!selectedNote}
        selectedNoteFret={selectedNote?.fret ?? null}
        onPlay={handlePlay}
        onStop={handleStop}
        onLoopToggle={() => setLoop(l => !l)}
        onBpmChange={handleBpmChange}
        onSnapChange={setSnap}
        onSoundChange={setSound}
        onBarsChange={handleBarsChange}
        onZoomIn={() => handleZoomChange(zoom + 0.25)}
        onZoomOut={() => handleZoomChange(zoom - 0.25)}
        onFretChange={handleFretChange}
        onVolumeChange={handleVolumeChange}
      />

      {/* Fretboard visualization */}
      <BassTabFretboard activeFrets={activeFrets} />

      {/* Main grid editor */}
      <BassTabGrid
        track={track}
        zoom={zoom}
        snap={snap}
        currentBeat={currentBeat}
        isPlaying={isPlaying}
        selectedNoteId={selectedNoteId}
        onAddNote={addNote}
        onUpdateNote={updateNote}
        onDeleteNote={deleteNote}
        onSelectNote={setSelectedId}
        onZoomChange={handleZoomChange}
      />

      {/* Status bar */}
      <div
        className="flex items-center gap-6 px-4 py-1.5 border-t border-gray-800 text-gray-600 text-xs flex-shrink-0"
        style={{ background: '#030712' }}
      >
        <span>Space: play/stop</span>
        <span>Del: delete selected</span>
        <span>↑↓: fret ±1</span>
        <span>Ctrl+scroll: zoom</span>
        <span className="ml-auto">{track.notes.length} notes</span>
      </div>
    </div>
  )
}
