import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { type BassNote, type BassTrack, type BassSound, type SnapValue, type StringIndex, DEFAULT_TRACK } from '../../lib/bassTab/types'
import { DEFAULT_INTRO_TRACK } from '../../data/defaultBassTab'
import { TabScore } from './TabScore'
import { snapToGrid, findNoteAtBeat, clampDuration } from '../../lib/bassTab/bassTheory'
import { startPlayback, stopPlayback, setMasterVolume, previewNote } from '../../lib/bassTab/bassAudio'
import { toAsciiTab, encodeTrackToHash, decodeTrackFromHash, copyToClipboard, exportMidiFile } from '../../lib/bassTab/exportTab'
import { BassTabTransport } from './BassTabTransport'
import { BassTabFretboard } from './BassTabFretboard'
import { BassTabGrid } from './BassTabGrid'
import { BassRealisticDisplay } from './BassRealisticDisplay'
import { useIsMobile } from '../../hooks/use-mobile'

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
  return { ...DEFAULT_INTRO_TRACK }
}

interface CtxMenu { x: number; y: number; noteId?: string; bar?: number }

export function BassTabPlayer() {
  const isMobile = useIsMobile()

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
  const [guitarView, setGuitarView]     = useState(false)
  const [viewMode, setViewMode]         = useState<'notation' | 'grid'>('notation')
  const [noteDuration, setNoteDuration] = useState<number>(0.5)
  const [ctxMenu, setCtxMenu]           = useState<CtxMenu | null>(null)
  const [toast, setToast]               = useState<string | null>(null)
  // Responsive UI state
  const [transportExpanded, setTransportExpanded]   = useState(false)
  const [desktopCompact, setDesktopCompact]         = useState(false)
  const [fretboardVisible, setFretboardVisible]     = useState(true)
  const [fitWidth, setFitWidth]                     = useState(false)
  const [splitView, setSplitView]                   = useState(false)
  const [isWide, setIsWide]                         = useState(false)
  const [isShortScreen, setIsShortScreen]           = useState(false)

  useEffect(() => {
    const check = () => {
      setIsWide(window.innerWidth >= 1200)
      setIsShortScreen(window.innerHeight < 700)
    }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Auto-compact on short desktop screens
  useEffect(() => {
    if (!isMobile && isShortScreen) {
      setDesktopCompact(true)
      setFretboardVisible(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isShortScreen, isMobile])

  // Auto-show fretboard when playback starts on mobile
  useEffect(() => {
    if (isPlaying && isMobile) setFretboardVisible(true)
  }, [isPlaying, isMobile])

  // Switch view (bottom nav handler)
  const handleSelectView = useCallback((view: 'notation' | 'grid' | 'guitar') => {
    if (view === 'guitar') { setGuitarView(true) }
    else { setGuitarView(false); setViewMode(view) }
  }, [])

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

  // ── Sync duration picker with selected note ───────────────────────────────
  useEffect(() => {
    if (!selectedNoteId) return
    const n = track.notes.find(x => x.id === selectedNoteId)
    if (n) setNoteDuration(n.durationBeats)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNoteId])

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

  const insertBar = useCallback((afterBar: number) => {
    setTrack(t => {
      const pivot = (afterBar + 1) * t.beatsPerBar
      return {
        ...t,
        totalBars: t.totalBars + 1,
        notes: t.notes.map(n => n.startBeat >= pivot ? { ...n, startBeat: n.startBeat + t.beatsPerBar } : n),
        sections: t.sections?.map(s => s.startBar > afterBar ? { ...s, startBar: s.startBar + 1 } : s),
      }
    })
  }, [])

  const deleteBar = useCallback((bar: number) => {
    setTrack(t => {
      if (t.totalBars <= 1) return t
      const start = bar * t.beatsPerBar
      const end   = start + t.beatsPerBar
      return {
        ...t,
        totalBars: t.totalBars - 1,
        notes: t.notes
          .filter(n => n.startBeat < start || n.startBeat >= end)
          .map(n => n.startBeat >= end ? { ...n, startBeat: n.startBeat - t.beatsPerBar } : n),
        sections: t.sections
          ?.filter(s => s.startBar !== bar)
          .map(s => s.startBar > bar ? { ...s, startBar: s.startBar - 1 } : s),
      }
    })
  }, [])

  const handleSectionChange = useCallback((sections: import('../../lib/bassTab/types').TrackSection[]) => {
    setTrack(t => ({ ...t, sections }))
  }, [])

  const handleNoteDurationChange = useCallback((d: number) => {
    setNoteDuration(d)
    if (selectedNoteId && selectedNote) {
      const totalBeats = track.totalBars * track.beatsPerBar
      const safe = clampDuration(track.notes, selectedNote.stringIndex, selectedNote.startBeat, d, totalBeats, selectedNoteId)
      if (safe > 0) {
        beginEdit()
        updateNote(selectedNoteId, { durationBeats: safe })
      }
    }
  }, [selectedNoteId, selectedNote, track, beginEdit, updateNote])

  // ── Fretboard tap → place note + preview ─────────────────────────────────
  const handleFretboardNote = useCallback((stringIndex: number, fret: number) => {
    previewNote(stringIndex, fret, sound)
    const totalBeats = track.totalBars * track.beatsPerBar
    const beat = Math.min(cursorBeat, totalBeats - snap)
    if (findNoteAtBeat(track.notes, stringIndex, beat)) return
    const safeDur = clampDuration(track.notes, stringIndex, beat, noteDuration, totalBeats)
    if (safeDur <= 0) return
    const newNote: BassNote = {
      id: crypto.randomUUID(),
      stringIndex: stringIndex as StringIndex,
      fret, startBeat: beat, durationBeats: safeDur, velocity: 0.8,
    }
    addNote(newNote)
    setSelectedId(newNote.id)
    const next = snapToGrid(beat + safeDur, snap)
    setCursorBeat(Math.min(next, totalBeats))
  }, [cursorBeat, snap, track, addNote, sound, noteDuration])

  const handleNotePreview = useCallback((stringIndex: StringIndex, fret: number) => {
    previewNote(stringIndex, fret, sound)
  }, [sound])

  // ── Duplicate ─────────────────────────────────────────────────────────────
  const duplicateNote = useCallback((id?: string | null) => {
    const note = track.notes.find(n => n.id === (id ?? selectedNoteId))
    if (!note) return
    const newBeat = note.startBeat + note.durationBeats
    const totalBeats = track.totalBars * track.beatsPerBar
    if (newBeat >= totalBeats) return
    if (findNoteAtBeat(track.notes, note.stringIndex, newBeat)) return
    const safeDur = clampDuration(track.notes, note.stringIndex, newBeat, note.durationBeats, totalBeats)
    if (safeDur <= 0) return
    const dup: BassNote = { ...note, id: crypto.randomUUID(), startBeat: newBeat, durationBeats: safeDur }
    addNote(dup)
    setSelectedId(dup.id)
  }, [track.notes, selectedNoteId, track.totalBars, track.beatsPerBar, addNote])

  // ── Auto-sync totalBars with notes ────────────────────────────────────────
  useEffect(() => {
    const maxEnd = track.notes.reduce((max, n) => Math.max(max, n.startBeat + n.durationBeats), 0)
    const needed = Math.max(4, Math.ceil(maxEnd / track.beatsPerBar) + 1)
    if (needed !== track.totalBars) {
      setTrack(t => ({ ...t, totalBars: needed }))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track.notes, track.beatsPerBar])

  // ── Transport ─────────────────────────────────────────────────────────────
  const handleBpmChange = useCallback((bpm: number) => {
    if (isPlaying) { stopPlayback(); setIsPlaying(false); setCurrentBeat(0) }
    setTrack(t => ({ ...t, bpm }))
  }, [isPlaying])

  const handleSoundChange = useCallback((s: BassSound) => {
    setSound(s)
    if (!isPlaying) return
    const from = currentBeat
    startPlayback(track, from, s,
      beat => setCurrentBeat(beat),
      () => setIsPlaying(false),
      loop, metronome,
    )
  }, [isPlaying, currentBeat, track, loop, metronome])

  const handleFretChange = useCallback((fret: number) => {
    if (!selectedNoteId) return
    updateNote(selectedNoteId, { fret })
    if (selectedNote) previewNote(selectedNote.stringIndex, fret, sound)
  }, [selectedNoteId, updateNote, selectedNote, sound])

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
    if (noteEl) {
      e.preventDefault()
      setCtxMenu({ x: e.clientX, y: e.clientY, noteId: noteEl.dataset.noteId! })
      setSelectedId(noteEl.dataset.noteId!)
      return
    }
    const barEl = (e.target as HTMLElement).closest('[data-bar]') as HTMLElement | null
    if (barEl) {
      e.preventDefault()
      setCtxMenu({ x: e.clientX, y: e.clientY, bar: Number((barEl as HTMLElement).getAttribute('data-bar')) })
    }
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

      // Duration shortcuts: 1=whole 2=half 3=quarter 4=eighth 5=sixteenth
      const durMap: Record<string, number> = { Digit1: 4, Digit2: 2, Digit3: 1, Digit4: 0.5, Digit5: 0.25 }
      if (!e.ctrlKey && !e.metaKey && !e.altKey && durMap[e.code]) {
        e.preventDefault(); handleNoteDurationChange(durMap[e.code])
      }

      if (selectedNote) {
        if (e.code === 'ArrowUp')   { e.preventDefault(); updateNote(selectedNote.id, { fret: Math.min(24, selectedNote.fret + 1) }) }
        if (e.code === 'ArrowDown') { e.preventDefault(); updateNote(selectedNote.id, { fret: Math.max(0, selectedNote.fret - 1) }) }
        if (e.code === 'ArrowRight') {
          e.preventDefault()
          const nb = snapToGrid(selectedNote.startBeat + snap, snap)
          const tot = track.totalBars * track.beatsPerBar
          if (nb + selectedNote.durationBeats <= tot && !findNoteAtBeat(track.notes, selectedNote.stringIndex, nb, selectedNote.id))
            updateNote(selectedNote.id, { startBeat: nb })
        }
        if (e.code === 'ArrowLeft') {
          e.preventDefault()
          const nb = Math.max(0, snapToGrid(selectedNote.startBeat - snap, snap))
          if (!findNoteAtBeat(track.notes, selectedNote.stringIndex, nb, selectedNote.id))
            updateNote(selectedNote.id, { startBeat: nb })
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isPlaying, handlePlay, handleStop, selectedNoteId, deleteNote, selectedNote, updateNote, snap, handleUndo, handleRedo, duplicateNote])

  const activeView: 'notation' | 'grid' | 'guitar' = guitarView ? 'guitar' : viewMode

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
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div
        style={{
          flexShrink: 0, height: 44,
          background: 'hsl(224 20% 8%)',
          borderBottom: '1px solid hsl(224 15% 18%)',
          display: 'flex', alignItems: 'center', gap: 8,
          paddingLeft: 16, paddingRight: 16,
          fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
        }}
      >
        {/* Logo */}
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
          {!isMobile && (
            <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: '-0.025em', color: 'hsl(220 14% 90%)' }}>
              ChordSequence
            </span>
          )}
        </a>

        <span style={{ color: 'hsl(224 15% 35%)', fontSize: 16, fontWeight: 300 }}>/</span>

        <span style={{
          fontSize: 13, fontWeight: 500, color: 'hsl(262 60% 75%)',
          background: 'hsl(262 40% 15%)', padding: '2px 10px', borderRadius: 20,
          border: '1px solid hsl(262 40% 22%)',
        }}>
          Bass Tab
        </span>

        <div style={{ flex: 1 }} />

        {/* Desktop: note count + view toggles + beat counter */}
        {!isMobile && (
          <>
            <span style={{
              fontSize: 11, color: 'hsl(220 10% 50%)',
              background: 'hsl(224 18% 14%)',
              padding: '2px 8px', borderRadius: 10,
              border: '1px solid hsl(224 15% 20%)',
            }}>
              {track.notes.length} {track.notes.length === 1 ? 'note' : 'notes'}
            </span>

            <button
              onClick={() => setGuitarView(v => !v)}
              title={guitarView ? 'Switch to Tab view' : 'Switch to Bass guitar view'}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '3px 10px', borderRadius: 20,
                fontSize: 11, fontWeight: 500, cursor: 'pointer', border: '1px solid',
                borderColor: guitarView ? 'hsl(262 40% 40%)' : 'hsl(224 15% 28%)',
                background:  guitarView ? 'hsl(262 40% 18%)' : 'hsl(224 18% 14%)',
                color:       guitarView ? 'hsl(262 80% 80%)' : 'hsl(220 10% 55%)',
                transition: 'all 0.15s',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18"/>
              </svg>
              {guitarView ? 'Tab' : 'Bass guitar'}
            </button>

            {!guitarView && (
              <button
                onClick={() => setViewMode(m => m === 'notation' ? 'grid' : 'notation')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '3px 10px', borderRadius: 20,
                  fontSize: 11, fontWeight: 500, cursor: 'pointer', border: '1px solid',
                  borderColor: viewMode === 'notation' ? 'hsl(262 40% 40%)' : 'hsl(224 15% 28%)',
                  background:  viewMode === 'notation' ? 'hsl(262 40% 18%)' : 'hsl(224 18% 14%)',
                  color:       viewMode === 'notation' ? 'hsl(262 80% 80%)' : 'hsl(220 10% 55%)',
                  transition: 'all 0.15s',
                }}
              >
                {viewMode === 'notation' ? 'Notation' : 'Grid'}
              </button>
            )}

            {!guitarView && isWide && (
              <button
                onClick={() => setSplitView(v => !v)}
                title={splitView ? 'Exit split view' : 'Split: tab + bass guitar side by side'}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '3px 10px', borderRadius: 20,
                  fontSize: 11, fontWeight: 500, cursor: 'pointer', border: '1px solid',
                  borderColor: splitView ? 'hsl(192 70% 40%)' : 'hsl(224 15% 28%)',
                  background:  splitView ? 'hsl(192 60% 14%)' : 'hsl(224 18% 14%)',
                  color:       splitView ? 'hsl(192 80% 75%)' : 'hsl(220 10% 55%)',
                  transition: 'all 0.15s',
                }}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="1" y="1" width="4" height="10" rx="1" />
                  <rect x="7" y="1" width="4" height="10" rx="1" />
                </svg>
                Split
              </button>
            )}

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
          </>
        )}

        {/* Mobile: note count (compact) */}
        {isMobile && (
          <span style={{ fontSize: 11, color: 'hsl(220 10% 40%)', fontFamily: 'ui-monospace, monospace' }}>
            {track.notes.length}n
          </span>
        )}
      </div>

      {/* ── Transport ─────────────────────────────────────────────────────── */}
      <BassTabTransport
        isPlaying={isPlaying} loop={loop} bpm={track.bpm} snap={snap} sound={sound}
        totalBars={track.totalBars} zoom={zoom} volume={volume} noteDuration={noteDuration}
        hasSelectedNote={!!selectedNote} selectedNoteFret={selectedNote?.fret ?? null}
        canUndo={history.past.length > 0} canRedo={history.future.length > 0} metronome={metronome}
        onPlay={handlePlay} onStop={handleStop} onLoopToggle={() => setLoop(l => !l)}
        onBpmChange={handleBpmChange} onSnapChange={setSnap} onSoundChange={handleSoundChange}
        onBarsChange={(bars) => setTrack(t => ({ ...t, totalBars: bars }))}
        onZoomIn={() => handleZoomChange(zoom + 0.25)} onZoomOut={() => handleZoomChange(zoom - 0.25)} onZoomReset={() => handleZoomChange(1)}
        onFretChange={handleFretChange} onVolumeChange={handleVolumeChange}
        onUndo={handleUndo} onRedo={handleRedo}
        onClearAll={handleClearAll} onExportAscii={handleExportAscii}
        onExportMidi={handleExportMidi} onShareUrl={handleShareUrl}
        onMetronomeToggle={() => setMetronome(m => !m)}
        onNoteDurationChange={handleNoteDurationChange}
        isMobile={isMobile}
        compact={isMobile && !transportExpanded}
        onToggleExpand={() => setTransportExpanded(e => !e)}
        currentBeat={currentBeat}
        beatsPerBar={track.beatsPerBar}
        fitWidth={fitWidth}
        onFitWidthToggle={() => setFitWidth(f => !f)}
        desktopCompact={desktopCompact}
        onToggleDesktopCompact={() => setDesktopCompact(c => !c)}
      />

      {/* ── Main content ──────────────────────────────────────────────────── */}
      {guitarView ? (
        <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
          <BassRealisticDisplay activeFrets={activeFrets} attackSignals={attackSignals} />
        </div>
      ) : splitView && isWide ? (
        /* ── Split view: tab left, bass guitar right ── */
        <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
            {viewMode === 'notation' ? (
              <TabScore
                track={track} zoom={zoom} snap={snap} currentBeat={currentBeat}
                cursorBeat={cursorBeat} isPlaying={isPlaying} selectedNoteId={selectedNoteId}
                sound={sound} noteDuration={noteDuration} fitWidth={fitWidth}
                onAddNote={addNote} onUpdateNote={updateNote} onDeleteNote={deleteNote}
                onSelectNote={setSelectedId} onCursorBeatChange={setCursorBeat}
                onBeginEdit={beginEdit} onSectionChange={handleSectionChange}
              />
            ) : (
              <BassTabGrid
                track={track} zoom={zoom} snap={snap} currentBeat={currentBeat}
                cursorBeat={cursorBeat} isPlaying={isPlaying} selectedNoteId={selectedNoteId}
                fitWidth={fitWidth}
                onAddNote={addNote} onUpdateNote={updateNote} onDeleteNote={deleteNote}
                onSelectNote={setSelectedId} onCursorBeatChange={setCursorBeat}
                onZoomChange={handleZoomChange} onBeginEdit={beginEdit}
                onNotePreview={handleNotePreview} onLongPressNote={handleLongPress}
              />
            )}
          </div>
          {/* Divider */}
          <div style={{ width: 1, background: 'hsl(224 15% 18%)', flexShrink: 0 }} />
          {/* Bass guitar panel */}
          <div style={{ width: '40%', minWidth: 280, flexShrink: 0, overflow: 'hidden' }}>
            <BassRealisticDisplay activeFrets={activeFrets} attackSignals={attackSignals} />
          </div>
        </div>
      ) : (
        <>
          {/* Fretboard with collapse toggle */}
          <div style={{ flexShrink: 0 }}>
            <button
              onClick={() => setFretboardVisible(v => !v)}
              style={{
                width: '100%', height: isMobile ? 22 : 16,
                background: 'hsl(224 20% 10%)',
                border: 'none',
                borderBottom: fretboardVisible ? 'none' : '1px solid hsl(224 15% 18%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                color: 'hsl(220 10% 32%)', fontSize: isMobile ? 10 : 9,
                fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
                cursor: 'pointer', userSelect: 'none',
                letterSpacing: '0.04em',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => { if (!isMobile) (e.currentTarget as HTMLElement).style.background = 'hsl(224 20% 13%)' }}
              onMouseLeave={e => { if (!isMobile) (e.currentTarget as HTMLElement).style.background = 'hsl(224 20% 10%)' }}
            >
              <span>{fretboardVisible ? '▲' : '▼'}</span>
              <span>Strings</span>
              <span>{fretboardVisible ? '▲' : '▼'}</span>
            </button>
            <div style={{
              overflow: 'hidden',
              maxHeight: fretboardVisible ? 280 : 0,
              transition: 'max-height 0.2s ease',
            }}>
              <BassTabFretboard activeFrets={activeFrets} attackSignals={attackSignals} onNoteClick={handleFretboardNote} />
            </div>
          </div>

          {viewMode === 'notation' ? (
            <TabScore
              track={track} zoom={zoom} snap={snap} currentBeat={currentBeat}
              cursorBeat={cursorBeat} isPlaying={isPlaying} selectedNoteId={selectedNoteId}
              sound={sound} noteDuration={noteDuration} fitWidth={fitWidth}
              onAddNote={addNote} onUpdateNote={updateNote} onDeleteNote={deleteNote}
              onSelectNote={setSelectedId} onCursorBeatChange={setCursorBeat}
              onBeginEdit={beginEdit} onSectionChange={handleSectionChange}
            />
          ) : (
            <BassTabGrid
              track={track} zoom={zoom} snap={snap} currentBeat={currentBeat}
              cursorBeat={cursorBeat} isPlaying={isPlaying} selectedNoteId={selectedNoteId}
              fitWidth={fitWidth}
              onAddNote={addNote} onUpdateNote={updateNote} onDeleteNote={deleteNote}
              onSelectNote={setSelectedId} onCursorBeatChange={setCursorBeat}
              onZoomChange={handleZoomChange} onBeginEdit={beginEdit}
              onNotePreview={handleNotePreview} onLongPressNote={handleLongPress}
            />
          )}
        </>
      )}

      {/* ── Desktop status bar ────────────────────────────────────────────── */}
      {!isMobile && (
        <StatusBar
          isPlaying={isPlaying} selectedNote={selectedNote}
          currentBeat={currentBeat} beatsPerBar={track.beatsPerBar} loop={loop}
          guitarView={guitarView}
        />
      )}

      {/* ── Mobile bottom navigation ──────────────────────────────────────── */}
      {isMobile && (
        <div style={{
          flexShrink: 0, height: 58,
          background: 'hsl(224 20% 9%)',
          borderTop: '1px solid hsl(224 15% 16%)',
          display: 'flex',
        }}>
          {([
            { id: 'notation', label: 'Tab',    icon: <TabIcon /> },
            { id: 'grid',     label: 'Grid',   icon: <GridIcon /> },
            { id: 'guitar',   label: 'Guitar', icon: <GuitarIcon /> },
          ] as const).map(tab => {
            const isActive = activeView === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => handleSelectView(tab.id)}
                style={{
                  flex: 1, height: '100%',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  borderTop: `2px solid ${isActive ? 'hsl(262 83% 58%)' : 'transparent'}`,
                  color: isActive ? 'hsl(262 80% 85%)' : 'hsl(220 10% 42%)',
                  transition: 'color 0.15s, border-color 0.15s',
                  touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
                  fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
                }}
              >
                {tab.icon}
                <span style={{ fontSize: 10, fontWeight: isActive ? 600 : 400, letterSpacing: '0.02em' }}>
                  {tab.label}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* Context menu */}
      {ctxMenu && (() => {
        const menuStyle: React.CSSProperties = {
          position: 'fixed', left: ctxMenu.x, top: ctxMenu.y, zIndex: 9999,
          background: 'hsl(224 20% 14%)',
          border: '1px solid hsl(224 15% 22%)',
          borderRadius: 8,
          boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px hsl(224 15% 22%)',
          minWidth: 180, overflow: 'hidden',
          fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
        }
        const CtxBtn = ({ label, onClick, danger, disabled }: { label: string; onClick: () => void; danger?: boolean; disabled?: boolean }) => (
          <button
            onClick={onClick}
            disabled={disabled}
            style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '8px 14px', fontSize: 12, cursor: disabled ? 'not-allowed' : 'pointer',
              background: 'transparent', border: 'none',
              color: disabled ? 'hsl(220 10% 38%)' : danger ? 'hsl(0 72% 65%)' : 'hsl(220 14% 80%)',
              transition: 'background 0.08s', fontFamily: 'inherit',
            }}
            onMouseEnter={e => { if (!disabled) (e.target as HTMLElement).style.background = 'hsl(224 15% 22%)' }}
            onMouseLeave={e => { (e.target as HTMLElement).style.background = 'transparent' }}
          >
            {label}
          </button>
        )
        const Sep = () => <div style={{ height: 1, background: '#2d2d40', margin: '2px 0' }} />

        if (ctxMenu.bar !== undefined) {
          const bar = ctxMenu.bar
          return (
            <div style={menuStyle} onPointerDown={e => e.stopPropagation()}>
              <CtxBtn label={`Insert bar before ${bar + 1}`} onClick={() => { insertBar(bar - 1); closeCtxMenu() }} />
              <CtxBtn label={`Insert bar after ${bar + 1}`}  onClick={() => { insertBar(bar);     closeCtxMenu() }} />
              <Sep />
              <CtxBtn label="Add section here" onClick={() => {
                const name = window.prompt('Section name:')
                if (name?.trim()) handleSectionChange([...(track.sections ?? []), { name: name.trim(), startBar: bar }].sort((a, b) => a.startBar - b.startBar))
                closeCtxMenu()
              }} />
              <Sep />
              <CtxBtn label="Delete this bar" danger disabled={track.totalBars <= 1}
                onClick={() => { deleteBar(bar); closeCtxMenu() }} />
            </div>
          )
        }

        if (ctxMenu.noteId) {
          const nid = ctxMenu.noteId
          return (
            <div style={menuStyle} onPointerDown={e => e.stopPropagation()}>
              <CtxBtn label="Duplicate  Ctrl+D" onClick={() => { duplicateNote(nid); closeCtxMenu() }} />
              <Sep />
              <CtxBtn label="Fret +1  ↑" onClick={() => { const n = track.notes.find(x => x.id === nid); if(n) updateNote(n.id, {fret: Math.min(24, n.fret+1)}); closeCtxMenu() }} />
              <CtxBtn label="Fret -1  ↓" onClick={() => { const n = track.notes.find(x => x.id === nid); if(n) updateNote(n.id, {fret: Math.max(0, n.fret-1)}); closeCtxMenu() }} />
              <Sep />
              <CtxBtn label="Delete  Del" danger onClick={() => { deleteNote(nid); closeCtxMenu() }} />
            </div>
          )
        }

        return null
      })()}

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

// ── Status bar ────────────────────────────────────────────────────────────
const STRING_NAMES = ['G', 'D', 'A', 'E']
function StatusBar({ isPlaying, selectedNote, currentBeat, beatsPerBar, loop, guitarView }: {
  isPlaying: boolean; selectedNote: import('../../lib/bassTab/types').BassNote | null
  currentBeat: number; beatsPerBar: number; loop: boolean; guitarView: boolean
}) {
  let hints: { text: string; accent?: boolean }[]

  if (guitarView) {
    hints = [
      { text: 'Drag · pan   Shift+drag · rotate   Ctrl+scroll · zoom' },
      { text: 'Double-click · reset view' },
    ]
  } else if (isPlaying) {
    const bar  = Math.floor(currentBeat / beatsPerBar) + 1
    const beat = Math.floor(currentBeat % beatsPerBar) + 1
    hints = [
      { text: `${bar}:${beat}`, accent: true },
      { text: 'Space · stop' },
      { text: `Loop ${loop ? 'on' : 'off'}` },
    ]
  } else if (selectedNote) {
    hints = [
      { text: `Fret ${selectedNote.fret} · ${STRING_NAMES[selectedNote.stringIndex]} string`, accent: true },
      { text: '↑↓ · fret' },
      { text: '←→ · move' },
      { text: 'Ctrl+D · duplicate' },
      { text: 'Del · delete' },
    ]
  } else {
    hints = [
      { text: 'Space · play/stop' },
      { text: 'Click staff · place note' },
      { text: 'Ctrl+scroll · zoom' },
      { text: 'Right-click · menu' },
    ]
  }

  return (
    <div style={{
      height: 26, background: 'hsl(224 20% 7%)',
      borderTop: '1px solid hsl(224 15% 16%)',
      display: 'flex', alignItems: 'center', gap: 16,
      paddingLeft: 16, paddingRight: 16,
      fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
      overflow: 'hidden',
    }}>
      {hints.map((h, i) => (
        <span key={i} style={{
          fontSize: 10, whiteSpace: 'nowrap',
          color: h.accent ? 'hsl(262 70% 72%)' : 'hsl(220 10% 38%)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {h.text}
        </span>
      ))}
    </div>
  )
}

// ── Bottom nav icons ───────────────────────────────────────────────────────
function TabIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <line x1="3" y1="7"  x2="17" y2="7"  />
      <line x1="3" y1="10" x2="17" y2="10" />
      <line x1="3" y1="13" x2="17" y2="13" />
      <line x1="3" y1="16" x2="17" y2="16" />
      <circle cx="7"  cy="7"  r="2" fill="currentColor" stroke="none" />
      <circle cx="13" cy="13" r="2" fill="currentColor" stroke="none" />
    </svg>
  )
}

function GridIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <rect x="3" y="3" width="6" height="6" rx="1" />
      <rect x="11" y="3" width="6" height="6" rx="1" />
      <rect x="3" y="11" width="6" height="6" rx="1" />
      <rect x="11" y="11" width="6" height="6" rx="1" />
    </svg>
  )
}

function GuitarIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 3 L15 3 L15 8 Q18 9 18 13 Q18 18 12 18 Q6 18 6 13 Q6 9 9 8 Z" />
      <circle cx="12" cy="13" r="2" />
      <line x1="9" y1="18" x2="9" y2="22" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="15" y1="18" x2="15" y2="22" />
    </svg>
  )
}
