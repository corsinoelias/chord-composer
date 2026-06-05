import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { type BassNote, type BassTrack, type BassSound, type SnapValue, type StringIndex, DEFAULT_TRACK } from '../../lib/bassTab/types'
import { snapToGrid } from '../../lib/bassTab/bassTheory'
import { startPlayback, stopPlayback, setMasterVolume, previewNote } from '../../lib/bassTab/bassAudio'
import { toAsciiTab, encodeTrackToHash, decodeTrackFromHash, copyToClipboard, exportMidiFile } from '../../lib/bassTab/exportTab'
import { BassTabTransport } from './BassTabTransport'
import { BassTabFretboard } from './BassTabFretboard'
import { BassTabGrid } from './BassTabGrid'

const STORAGE_KEY = 'bass-tab-track-v1'
const MAX_HISTORY = 60

interface History { past: BassNote[][]; future: BassNote[][] }

function loadTrack(): BassTrack {
  // First check URL hash for shared track
  if (typeof window !== 'undefined') {
    const fromHash = decodeTrackFromHash(window.location.hash)
    if (fromHash) return fromHash
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULT_TRACK, ...JSON.parse(raw) }
  } catch {}
  return { ...DEFAULT_TRACK }
}

interface CtxMenu { x: number; y: number; noteId: string }

export function BassTabPlayer() {
  const [track, setTrack]               = useState<BassTrack>(loadTrack)
  const [history, setHistory]           = useState<History>({ past: [], future: [] })
  const [isPlaying, setIsPlaying]       = useState(false)
  const [currentBeat, setCurrentBeat]   = useState(0)
  const [cursorBeat, setCursorBeat]     = useState(0)
  const [zoom, setZoom]                 = useState(1)
  const [snap, setSnap]                 = useState<SnapValue>(0.25)
  const [sound, setSound]               = useState<BassSound>('electric')
  const [loop, setLoop]                 = useState(true)
  const [volume, setVolume]             = useState(0.75)
  const [selectedNoteId, setSelectedId] = useState<string | null>(null)
  const [metronome, setMetronome]       = useState(false)
  const [ctxMenu, setCtxMenu]           = useState<CtxMenu | null>(null)
  const [toast, setToast]               = useState<string | null>(null)

  // Persist to localStorage
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(track)) } catch {}
  }, [track])

  // Toast helper
  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2000)
  }, [])

  const selectedNote = useMemo(
    () => track.notes.find(n => n.id === selectedNoteId) ?? null,
    [track.notes, selectedNoteId],
  )

  // ── History ───────────────────────────────────────────────────────────────
  const pushHistory = useCallback((prevNotes: BassNote[]) => {
    setHistory(h => ({
      past: [...h.past.slice(-MAX_HISTORY + 1), prevNotes],
      future: [],
    }))
  }, [])

  const handleUndo = useCallback(() => {
    setHistory(h => {
      if (!h.past.length) return h
      const prev = h.past[h.past.length - 1]
      setTrack(t => {
        return { ...t, notes: prev }
      })
      return { past: h.past.slice(0, -1), future: [track.notes, ...h.future] }
    })
    setSelectedId(null)
  }, [track.notes])

  const handleRedo = useCallback(() => {
    setHistory(h => {
      if (!h.future.length) return h
      const next = h.future[0]
      setTrack(t => ({ ...t, notes: next }))
      return { past: [...h.past, track.notes], future: h.future.slice(1) }
    })
    setSelectedId(null)
  }, [track.notes])

  // ── Active frets ─────────────────────────────────────────────────────────
  const activeFrets = useMemo((): (number | null)[] => {
    const active: (number | null)[] = [null, null, null, null]
    for (const note of track.notes) {
      if (currentBeat >= note.startBeat && currentBeat < note.startBeat + note.durationBeats) {
        active[note.stringIndex] = note.fret
      }
    }
    return active
  }, [track.notes, currentBeat])

  // ── Attack signals: fires on every distinct note attack (playback) ────────
  // Tracks by noteId + backward-beat jump so loops and back-to-back same-fret
  // notes all trigger correctly.
  const prevNoteIds   = useRef<(string | null)[]>([null, null, null, null])
  const prevBeatRef   = useRef(-1)
  const [attackSignals, setAttackSignals] = useState<({ fret: number; v: number } | null)[]>(
    [null, null, null, null],
  )

  useEffect(() => {
    const jumpedBack = currentBeat < prevBeatRef.current - 0.5
    prevBeatRef.current = currentBeat

    const newIds: (string | null)[] = [null, null, null, null]
    const attacks: { si: number; fret: number }[] = []

    for (const note of track.notes) {
      if (currentBeat >= note.startBeat && currentBeat < note.startBeat + note.durationBeats) {
        newIds[note.stringIndex] = note.id
        if (note.id !== prevNoteIds.current[note.stringIndex] || jumpedBack) {
          attacks.push({ si: note.stringIndex, fret: note.fret })
        }
      }
    }

    prevNoteIds.current = newIds

    if (attacks.length > 0) {
      const now = Date.now()
      setAttackSignals(prev => {
        const next = [...prev]
        attacks.forEach(({ si, fret }, i) => { next[si] = { fret, v: now + i } })
        return next
      })
    }
  }, [track.notes, currentBeat])

  // ── Playback ──────────────────────────────────────────────────────────────
  const handlePlay = useCallback(() => {
    const totalBeats = track.totalBars * track.beatsPerBar
    const from = currentBeat < totalBeats ? currentBeat : 0
    setIsPlaying(true)
    startPlayback(track, from, sound,
      (beat) => setCurrentBeat(beat),
      () => setIsPlaying(false),
      loop,
      metronome,
    )
  }, [track, currentBeat, sound, loop, metronome])

  const handleStop = useCallback(() => {
    stopPlayback()
    setIsPlaying(false)
    setCurrentBeat(0)
  }, [])

  // ── Note mutations ─────────────────────────────────────────────────────────
  const addNote = useCallback((note: BassNote) => {
    setTrack(t => { pushHistory(t.notes); return { ...t, notes: [...t.notes, note] } })
  }, [pushHistory])

  const updateNote = useCallback((id: string, patch: Partial<BassNote>) => {
    setTrack(t => ({
      ...t,
      notes: t.notes.map(n => n.id === id ? { ...n, ...patch } : n),
    }))
  }, [])

  const deleteNote = useCallback((id: string) => {
    setTrack(t => { pushHistory(t.notes); return { ...t, notes: t.notes.filter(n => n.id !== id) } })
    setSelectedId(prev => prev === id ? null : prev)
  }, [pushHistory])

  const beginEdit = useCallback(() => {
    setTrack(t => { pushHistory(t.notes); return t })
  }, [pushHistory])

  // ── Fretboard tap → place note + preview ─────────────────────────────────
  const handleFretboardNote = useCallback((stringIndex: number, fret: number) => {
    previewNote(stringIndex, fret, sound)
    const totalBeats = track.totalBars * track.beatsPerBar
    const beat = Math.min(cursorBeat, totalBeats - snap)
    const newNote: BassNote = {
      id: crypto.randomUUID(),
      stringIndex: stringIndex as StringIndex,
      fret, startBeat: beat, durationBeats: 1.0, velocity: 0.8,
    }
    addNote(newNote)
    setSelectedId(newNote.id)
    const next = snapToGrid(beat + 1.0, snap)
    setCursorBeat(Math.min(next, totalBeats))
  }, [cursorBeat, snap, track, addNote, sound])

  const handleNotePreview = useCallback((stringIndex: StringIndex, fret: number) => {
    previewNote(stringIndex, fret, sound)
  }, [sound])

  // ── Duplicate ─────────────────────────────────────────────────────────────
  const duplicateNote = useCallback((id?: string | null) => {
    const note = track.notes.find(n => n.id === (id ?? selectedNoteId))
    if (!note) return
    const dup: BassNote = { ...note, id: crypto.randomUUID(), startBeat: note.startBeat + note.durationBeats }
    addNote(dup)
    setSelectedId(dup.id)
  }, [track.notes, selectedNoteId, addNote])

  // ── Transport ─────────────────────────────────────────────────────────────
  const handleBpmChange = useCallback((bpm: number) => {
    if (isPlaying) { stopPlayback(); setIsPlaying(false); setCurrentBeat(0) }
    setTrack(t => ({ ...t, bpm }))
  }, [isPlaying])

  const handleFretChange = useCallback((fret: number) => {
    if (selectedNoteId) updateNote(selectedNoteId, { fret })
  }, [selectedNoteId, updateNote])

  const handleVolumeChange = useCallback((vol: number) => {
    setVolume(vol); setMasterVolume(vol)
  }, [])

  const handleZoomChange = useCallback((z: number) => {
    setZoom(Math.max(0.4, Math.min(4, z)))
  }, [])

  const handleClearAll = useCallback(() => {
    if (track.notes.length === 0) return
    pushHistory(track.notes)
    setTrack(t => ({ ...t, notes: [] }))
    setSelectedId(null)
  }, [track.notes, pushHistory])

  const handleExportAscii = useCallback(async () => {
    const tab = toAsciiTab(track)
    const ok = await copyToClipboard(tab)
    showToast(ok ? 'ASCII tab copied!' : 'Could not copy')
  }, [track, showToast])

  const handleExportMidi = useCallback(() => {
    exportMidiFile(track)
    showToast(`${track.name}.mid downloaded`)
  }, [track, showToast])

  const handleShareUrl = useCallback(async () => {
    const hash = encodeTrackToHash(track)
    const url = window.location.origin + window.location.pathname + hash
    const ok = await copyToClipboard(url)
    showToast(ok ? 'Share URL copied!' : 'Could not copy')
  }, [track, showToast])

  const handleLongPress = useCallback((noteId: string, x: number, y: number) => {
    setCtxMenu({ x, y, noteId })
    setSelectedId(noteId)
  }, [])

  // ── Context menu ──────────────────────────────────────────────────────────
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    const noteEl = (e.target as HTMLElement).closest('[data-note-id]') as HTMLElement | null
    if (!noteEl) return
    e.preventDefault()
    setCtxMenu({ x: e.clientX, y: e.clientY, noteId: noteEl.dataset.noteId! })
    setSelectedId(noteEl.dataset.noteId!)
  }, [])

  const closeCtxMenu = useCallback(() => setCtxMenu(null), [])

  // Close context menu on outside click
  useEffect(() => {
    if (!ctxMenu) return
    const h = () => closeCtxMenu()
    window.addEventListener('pointerdown', h, { once: true })
    return () => window.removeEventListener('pointerdown', h)
  }, [ctxMenu, closeCtxMenu])

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'SELECT') return

      if (e.code === 'Space') { e.preventDefault(); isPlaying ? handleStop() : handlePlay() }
      if ((e.code === 'Delete' || e.code === 'Backspace') && selectedNoteId) { e.preventDefault(); deleteNote(selectedNoteId) }
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ' && !e.shiftKey) { e.preventDefault(); handleUndo() }
      if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyY' || (e.code === 'KeyZ' && e.shiftKey))) { e.preventDefault(); handleRedo() }
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyD') { e.preventDefault(); duplicateNote() }

      if (selectedNote) {
        if (e.code === 'ArrowUp')    { e.preventDefault(); updateNote(selectedNote.id, { fret: Math.min(24, selectedNote.fret + 1) }) }
        if (e.code === 'ArrowDown')  { e.preventDefault(); updateNote(selectedNote.id, { fret: Math.max(0, selectedNote.fret - 1) }) }
        if (e.code === 'ArrowRight') { e.preventDefault(); updateNote(selectedNote.id, { startBeat: snapToGrid(selectedNote.startBeat + snap, snap) }) }
        if (e.code === 'ArrowLeft')  { e.preventDefault(); updateNote(selectedNote.id, { startBeat: Math.max(0, snapToGrid(selectedNote.startBeat - snap, snap)) }) }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isPlaying, handlePlay, handleStop, selectedNoteId, deleteNote, selectedNote, updateNote, snap, handleUndo, handleRedo, duplicateNote])

  return (
    <div
      className="flex flex-col text-white"
      style={{
        height: '100dvh',
        fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
        overflow: 'hidden', overscrollBehavior: 'none',
        background: 'hsl(224 24% 8%)',
      }}
      onContextMenu={handleContextMenu}
    >
      {/* ── Header — matches app nav aesthetic ────────────────────────────── */}
      <div
        style={{
          flexShrink: 0, height: 44,
          background: 'hsl(224 20% 8%)',
          borderBottom: '1px solid hsl(224 15% 18%)',
          backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', gap: 8,
          paddingLeft: 16, paddingRight: 16,
          fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
        }}
      >
        {/* Logo mark */}
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', flexShrink: 0 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 7,
            background: 'hsl(262 83% 58%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 12px hsl(262 83% 58% / 0.35)',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
            </svg>
          </div>
          <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: '-0.025em', color: 'hsl(220 14% 90%)' }}>
            ChordSequence
          </span>
        </a>

        {/* Breadcrumb separator */}
        <span style={{ color: 'hsl(224 15% 35%)', fontSize: 16, fontWeight: 300 }}>/</span>

        {/* Current tool */}
        <span style={{
          fontSize: 13, fontWeight: 500,
          color: 'hsl(262 60% 75%)',
          background: 'hsl(262 40% 15%)',
          padding: '2px 10px', borderRadius: 20,
          border: '1px solid hsl(262 40% 22%)',
        }}>
          Bass Tab
        </span>

        <div style={{ flex: 1 }} />

        {/* Note count pill */}
        <span style={{
          fontSize: 11, color: 'hsl(220 10% 50%)',
          background: 'hsl(224 18% 14%)',
          padding: '2px 8px', borderRadius: 10,
          border: '1px solid hsl(224 15% 20%)',
        }}>
          {track.notes.length} {track.notes.length === 1 ? 'note' : 'notes'}
        </span>

        {/* Beat counter (when playing) */}
        {isPlaying && (
          <span style={{
            fontSize: 11, fontFamily: 'ui-monospace, monospace',
            color: 'hsl(262 60% 75%)',
            background: 'hsl(262 40% 15%)',
            padding: '2px 10px', borderRadius: 10,
            border: '1px solid hsl(262 40% 22%)',
            minWidth: 52, textAlign: 'center',
          }}>
            {`${Math.floor(currentBeat / track.beatsPerBar) + 1}:${Math.floor(currentBeat % track.beatsPerBar) + 1}`}
          </span>
        )}
      </div>

      {/* Transport */}
      <BassTabTransport
        isPlaying={isPlaying} loop={loop} bpm={track.bpm} snap={snap} sound={sound}
        totalBars={track.totalBars} zoom={zoom} volume={volume}
        hasSelectedNote={!!selectedNote} selectedNoteFret={selectedNote?.fret ?? null}
        canUndo={history.past.length > 0} canRedo={history.future.length > 0} metronome={metronome}
        onPlay={handlePlay} onStop={handleStop} onLoopToggle={() => setLoop(l => !l)}
        onBpmChange={handleBpmChange} onSnapChange={setSnap} onSoundChange={setSound}
        onBarsChange={(bars) => setTrack(t => ({ ...t, totalBars: bars }))}
        onZoomIn={() => handleZoomChange(zoom + 0.25)} onZoomOut={() => handleZoomChange(zoom - 0.25)} onZoomReset={() => handleZoomChange(1)}
        onFretChange={handleFretChange} onVolumeChange={handleVolumeChange}
        onUndo={handleUndo} onRedo={handleRedo}
        onClearAll={handleClearAll} onExportAscii={handleExportAscii}
        onExportMidi={handleExportMidi} onShareUrl={handleShareUrl}
        onMetronomeToggle={() => setMetronome(m => !m)}
      />

      {/* Fretboard */}
      <BassTabFretboard activeFrets={activeFrets} attackSignals={attackSignals} onNoteClick={handleFretboardNote} />

      {/* Grid */}
      <BassTabGrid
        track={track} zoom={zoom} snap={snap} currentBeat={currentBeat}
        cursorBeat={cursorBeat} isPlaying={isPlaying} selectedNoteId={selectedNoteId}
        onAddNote={addNote} onUpdateNote={updateNote} onDeleteNote={deleteNote}
        onSelectNote={setSelectedId} onCursorBeatChange={setCursorBeat}
        onZoomChange={handleZoomChange} onBeginEdit={beginEdit}
        onNotePreview={handleNotePreview} onLongPressNote={handleLongPress}
      />

      {/* Status bar */}
      <div
        className="flex items-center gap-4 px-4 flex-shrink-0 hidden sm:flex"
        style={{
          height: 26, background: 'hsl(224 20% 7%)',
          borderTop: '1px solid hsl(224 15% 16%)',
          fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
        }}
      >
        {[
          'Space · play/stop',
          'Del · delete',
          'Ctrl+D · duplicate',
          '↑↓ · fret   ←→ · move',
          'Ctrl+scroll · zoom',
          'Right-click · menu',
        ].map(hint => (
          <span key={hint} style={{ fontSize: 10, color: 'hsl(220 10% 38%)', whiteSpace: 'nowrap' }}>
            {hint}
          </span>
        ))}
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <div
          style={{
            position: 'fixed', left: ctxMenu.x, top: ctxMenu.y, zIndex: 9999,
            background: 'hsl(224 20% 14%)',
            border: '1px solid hsl(224 15% 22%)',
            borderRadius: 8,
            boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px hsl(224 15% 22%)',
            minWidth: 168, overflow: 'hidden',
            fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
          }}
          onPointerDown={e => e.stopPropagation()}
        >
          {[
            { label: 'Duplicate  Ctrl+D', action: () => { duplicateNote(ctxMenu.noteId); closeCtxMenu() } },
            { label: '───────────────', action: null },
            { label: 'Fret +1  ↑',  action: () => { const n = track.notes.find(x => x.id === ctxMenu.noteId); if(n) updateNote(n.id, {fret: Math.min(24, n.fret+1)}); closeCtxMenu() } },
            { label: 'Fret -1  ↓',  action: () => { const n = track.notes.find(x => x.id === ctxMenu.noteId); if(n) updateNote(n.id, {fret: Math.max(0, n.fret-1)}); closeCtxMenu() } },
            { label: '───────────────', action: null },
            { label: 'Delete  Del',  action: () => { deleteNote(ctxMenu.noteId); closeCtxMenu() }, danger: true },
          ].map((item, i) => item.action === null ? (
            <div key={i} style={{ height: 1, background: '#2d2d40', margin: '2px 0' }} />
          ) : (
            <button
              key={i}
              onClick={item.action}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '8px 14px', fontSize: 12, cursor: 'pointer',
                background: 'transparent', border: 'none',
                color: (item as { danger?: boolean }).danger ? 'hsl(0 72% 65%)' : 'hsl(220 14% 80%)',
                transition: 'background 0.08s',
                fontFamily: 'inherit',
              }}
              onMouseEnter={e => { (e.target as HTMLElement).style.background = 'hsl(224 15% 22%)' }}
              onMouseLeave={e => { (e.target as HTMLElement).style.background = 'transparent' }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          style={{
            position: 'fixed', bottom: 40, left: '50%', transform: 'translateX(-50%)',
            background: 'hsl(262 83% 50%)',
            color: 'white', borderRadius: 10,
            padding: '9px 20px', fontSize: 13, zIndex: 9999,
            fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
            fontWeight: 500,
            boxShadow: '0 4px 20px rgba(0,0,0,0.5), 0 0 0 1px hsl(262 60% 60% / 0.3)',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {toast}
        </div>
      )}
    </div>
  )
}
