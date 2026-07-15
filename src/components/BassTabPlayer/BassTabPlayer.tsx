import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { importMidi, type MidiImportResult } from '../../lib/import/midiImport'
import { parseGpFile } from '../../lib/bassTab/gpImport'
import { BassTabSeekBar } from './BassTabSeekBar'
import { MobileBarView } from './MobileBarView'
import { MobileTabEditor } from './MobileTabEditor'
import { type BassNote, type BassTrack, type BassSound, type SnapValue, type StringIndex, type LoopRange, DEFAULT_TRACK } from '../../lib/bassTab/types'
import { DEFAULT_INTRO_TRACK } from '../../data/defaultBassTab'
import { TabScore } from './TabScore'
import { TabNotationView } from './TabNotationView'
import { snapToGrid, findNoteAtBeat, clampDuration } from '../../lib/bassTab/bassTheory'
import { startPlayback, stopPlayback, setMasterVolume, previewNote } from '../../lib/bassTab/bassAudio'
import { RecordingOverlay } from './RecordingOverlay'
import { ExportImageModal } from './ExportImageModal'
import { ExportVideoModal } from './ExportVideoModal'
import { toAsciiTab, encodeTrackToHash, decodeTrackFromHash, copyToClipboard, exportMidiFile } from '../../lib/bassTab/exportTab'
import { exportTrackAsWav } from '../../lib/bassTab/exportAudio'
import { BassTabTransport } from './BassTabTransport'
import { analytics } from '../../lib/analytics'
import { BassTabFretboard } from './BassTabFretboard'
import { BassTabGrid } from './BassTabGrid'
import { BassRealisticDisplay } from './BassRealisticDisplay'
import { PresetPicker } from './PresetPicker'
import { type Preset, PRESETS } from '../../data/presets'
import { useIsMobile } from '../../hooks/use-mobile'
import { useTrackEditor } from '../../hooks/useTrackEditor'
import { useMidiInput } from '../../hooks/useMidiInput'

const GP_EXTENSIONS = ['gp', 'gp3', 'gp4', 'gp5', 'gpx', 'gp7']

function loadTrack(): BassTrack {
  if (typeof window !== 'undefined') {
    const fromHash = decodeTrackFromHash(window.location.hash)
    if (fromHash) return fromHash
  }
  try {
    const raw = localStorage.getItem('bass-tab-track-v1')
    if (raw) return { ...DEFAULT_TRACK, ...JSON.parse(raw) }
  } catch {}
  return { ...DEFAULT_INTRO_TRACK }
}

interface CtxMenu { x: number; y: number; noteId?: string; bar?: number }

export function BassTabPlayer({ initialPreset }: { initialPreset?: string } = {}) {
  const isMobile = useIsMobile()

  // ── Track editor hook (Feature 1: Refactor) ───────────────────────────────
  const initialTrack = useMemo(() => {
    if (initialPreset) {
      const p = PRESETS.find(pr => pr.id === initialPreset)
      if (p) return { id: p.id, name: p.name, bpm: p.bpm, beatsPerBar: p.beatsPerBar, totalBars: p.totalBars, notes: p.notes, sections: p.sections }
    }
    return loadTrack()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const {
    track, setTrack, history, canUndo, canRedo,
    addNote, updateNote, deleteNote, beginEdit, pushHistory,
    insertBar, deleteBar, handleSectionChange,
    handleBpmChange: editorBpmChange,
    handleBeatsPerBarChange,
    handleLoadPresetFull,
    handleImportTrack: editorImportTrack,
    handleClearAll,
    handleUndo, handleRedo,
  } = useTrackEditor(initialTrack)

  const [isPlaying, setIsPlaying]       = useState(false)
  const [currentBeat, setCurrentBeat]   = useState(0)
  const [cursorBeat, setCursorBeat]     = useState(0)
  const [zoom, setZoom]                 = useState(1)
  const [snap, setSnap]                 = useState<SnapValue>(0.25)
  const [sound, setSound]               = useState<BassSound>(() => {
    if (initialPreset) {
      const p = PRESETS.find(pr => pr.id === initialPreset)
      if (p) return p.defaultSound === 'electric' ? 'fender' : p.defaultSound
    }
    return 'fender'
  })
  const [loop, setLoop]                 = useState(false)
  const [volume, setVolume]             = useState(0.75)
  const [selectedNoteId, setSelectedId] = useState<string | null>(null)
  const [metronome, setMetronome]       = useState(false)
  const [activeView, setActiveView]     = useState<'tab' | 'score' | 'grid' | 'guitar'>('tab')
  const [noteDuration, setNoteDuration] = useState<number>(0.5)
  const [ctxMenu, setCtxMenu]           = useState<CtxMenu | null>(null)
  const [toast, setToast]               = useState<string | null>(null)
  // Responsive UI state
  const [showPresets, setShowPresets]               = useState(false)
  const [transportExpanded, setTransportExpanded]   = useState(false)
  const [desktopCompact, setDesktopCompact]         = useState(false)
  const [fitWidth, setFitWidth]                     = useState(() => typeof window !== 'undefined' && window.innerWidth < 768)
  // splitView removed
  const [isWide, setIsWide]                         = useState(false)
  const [isShortScreen, setIsShortScreen]           = useState(false)
  // Auto-expand totalBars to always fit notes
  useEffect(() => {
    if (!track.notes.length) return
    const lastEnd = Math.max(...track.notes.map(n => n.startBeat + n.durationBeats))
    const needed  = Math.max(Math.ceil(lastEnd / track.beatsPerBar) + 1, 4)
    if (needed > track.totalBars) setTrack(t => ({ ...t, totalBars: needed }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track.notes, track.beatsPerBar])

  // Feature 2: loop range
  const [loopRange, setLoopRange]                   = useState<LoopRange | null>(null)
  const loopRef          = useRef(loop)
  const loopRangeRef     = useRef(loopRange)
  const soundRef         = useRef(sound)
  const metronomeRef     = useRef(metronome)
  const trackRef         = useRef(track)
  useEffect(() => { loopRef.current      = loop },      [loop])
  useEffect(() => { loopRangeRef.current = loopRange }, [loopRange])
  useEffect(() => { soundRef.current     = sound },     [sound])
  useEffect(() => { metronomeRef.current = metronome }, [metronome])
  useEffect(() => { trackRef.current     = track },     [track])
  // ── MIDI import ───────────────────────────────────────────────────────────
  const [dragOver, setDragOver]                     = useState(false)
  const [midiPending, setMidiPending]               = useState<MidiImportResult | null>(null)
  const [importError, setImportError]                   = useState<string | null>(null)
  const dragCounterRef                              = useRef(0)
  const fileInputRef                                = useRef<HTMLInputElement>(null)
  const gpInputRef                                  = useRef<HTMLInputElement>(null)
  // Feature 6: MIDI input hook
  const midiInput = useMidiInput(sound)

  useEffect(() => {
    const check = () => {
      setIsWide(window.innerWidth >= 1200)
      setIsShortScreen(window.innerHeight < 700)
    }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const [fretboardVisible, setFretboardVisible]   = useState(true)
  const [editingTrackName, setEditingTrackName]   = useState(false)
  const [recordingOpen, setRecordingOpen]         = useState(false)
  const [exportImageOpen, setExportImageOpen]   = useState(false)
  const [exportVideoOpen, setExportVideoOpen]   = useState(false)

  // Auto-compact on short desktop screens
  useEffect(() => {
    if (!isMobile && isShortScreen) { setDesktopCompact(true); setFretboardVisible(false) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isShortScreen, isMobile])

  const handleLoadPreset = useCallback((preset: Preset) => {
    const { sound: presetSound } = handleLoadPresetFull(preset)
    setIsPlaying(false)
    setCurrentBeat(0)
    setCursorBeat(0)
    setSelectedId(null)
    setLoopRange(null)
    setSound((presetSound === 'electric' ? 'fender' : presetSound) as BassSound)
  }, [handleLoadPresetFull])

  // Toast helper
  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2000)
  }, [])

  // ── MIDI import handlers ───────────────────────────────────────────────────
  const handleImportTrack = useCallback((imported: BassTrack) => {
    editorImportTrack(imported)
    setIsPlaying(false)
    setCurrentBeat(0)
    setCursorBeat(0)
    setSelectedId(null)
    setLoopRange(null)
    setMidiPending(null)
    showToast(`Imported: ${imported.name}`)
  }, [editorImportTrack, showToast])

  const handleGpImport = useCallback(async (file: File) => {
    try {
      const buf = await file.arrayBuffer()
      const partial = await parseGpFile(buf)
      handleImportTrack({ ...DEFAULT_TRACK, ...partial, id: `gp-${Date.now()}` })
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Could not read file.')
      setTimeout(() => setImportError(null), 5000)
    }
  }, [handleImportTrack])

  const processDropFile = useCallback(async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext && GP_EXTENSIONS.includes(ext)) {
      handleGpImport(file)
      return
    }
    if (ext !== 'mid' && ext !== 'midi') {
      setImportError(`Format .${ext ?? '?'} not supported. Drop a .mid, .midi, or Guitar Pro file.`)
      setTimeout(() => setImportError(null), 4000)
      return
    }
    try {
      const buf = await file.arrayBuffer()
      const result = importMidi(buf)
      if (result.ok === false) {
        setImportError(result.error)
        setTimeout(() => setImportError(null), 5000)
        return
      }
      setMidiPending(result)
    } catch {
      setImportError('Could not read file.')
      setTimeout(() => setImportError(null), 4000)
    }
  }, [handleGpImport])

  const handleImportMidiClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleImportGpClick = useCallback(() => {
    gpInputRef.current?.click()
  }, [])

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processDropFile(file)
    e.target.value = ''
  }, [processDropFile])

  const handleGpFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleGpImport(file)
    e.target.value = ''
  }, [handleGpImport])

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current++
    if (e.dataTransfer.items.length > 0) setDragOver(true)
  }, [])
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current--
    if (dragCounterRef.current <= 0) { dragCounterRef.current = 0; setDragOver(false) }
  }, [])
  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault() }, [])
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current = 0
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) processDropFile(file)
  }, [processDropFile])

  const selectedNote = useMemo(
    () => track.notes.find(n => n.id === selectedNoteId) ?? null,
    [track.notes, selectedNoteId],
  )

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
  const doPlay = useCallback((fromBeat: number) => {
    startPlayback(
      trackRef.current,
      fromBeat,
      soundRef.current,
      (beat) => setCurrentBeat(beat),
      () => setIsPlaying(false),
      () => loopRef.current,
      () => metronomeRef.current,
      () => loopRangeRef.current,
    )
  }, []) // stable: uses only refs

  const handlePlay = useCallback(() => {
    const totalBeats = track.totalBars * track.beatsPerBar
    const loopFrom = loopRange ? loopRange.startBeat : 0
    const from = currentBeat < totalBeats ? currentBeat : loopFrom
    setIsPlaying(true)
    analytics.bassTabPlay()
    doPlay(from)
  }, [track, currentBeat, loopRange, doPlay])

  const handleStop = useCallback(() => {
    stopPlayback()
    setIsPlaying(false)
  }, [])

  const handleRewind = useCallback(() => {
    stopPlayback()
    setIsPlaying(false)
    setCurrentBeat(loopRange ? loopRange.startBeat : 0)
  }, [loopRange])

  const handleSeek = useCallback((beat: number) => {
    const totalBeats = track.totalBars * track.beatsPerBar
    const clamped = Math.max(0, Math.min(beat, totalBeats))
    setCurrentBeat(clamped)
    if (isPlaying) {
      stopPlayback()
      doPlay(clamped)
    }
  }, [isPlaying, track, doPlay])

  // deleteNote + setSelectedId need to be combined here
  const handleDeleteNote = useCallback((id: string) => {
    deleteNote(id)
    setSelectedId(prev => prev === id ? null : prev)
  }, [deleteNote])

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

  // ── Recording ─────────────────────────────────────────────────────────────
  const handleRecordingComplete = useCallback((notes: BassNote[]) => {
    stopPlayback()
    setIsPlaying(false)
    setCurrentBeat(0)
    beginEdit()
    setTrack(t => ({ ...t, notes }))
    setSelectedId(null)
    setRecordingOpen(false)
    showToast(`Grabación importada: ${notes.length} nota${notes.length !== 1 ? 's' : ''}`)
  }, [beginEdit, showToast])

  // ── Transport ─────────────────────────────────────────────────────────────
  const handleBpmChange = useCallback((bpm: number) => {
    const wasPlaying = isPlaying
    const fromBeat   = currentBeat
    if (wasPlaying) { stopPlayback(); setIsPlaying(false) }
    editorBpmChange(bpm, false)
    if (wasPlaying) {
      setTimeout(() => { setIsPlaying(true); doPlay(fromBeat) }, 0)
    }
  }, [isPlaying, currentBeat, editorBpmChange, doPlay])

  const handleSoundChange = useCallback((s: BassSound) => {
    setSound(s)
    if (!isPlaying) return
    stopPlayback()
    soundRef.current = s
    doPlay(currentBeat)
  }, [isPlaying, currentBeat, doPlay])

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

  const handleExportAscii = useCallback(async () => {
    const tab = toAsciiTab(track)
    const ok = await copyToClipboard(tab)
    if (ok) analytics.bassTabExport('ascii')
    showToast(ok ? 'ASCII tab copied!' : 'Could not copy')
  }, [track, showToast])

  const handleExportMidi = useCallback(() => {
    exportMidiFile(track)
    analytics.bassTabExport('midi')
    showToast(`${track.name}.mid downloaded`)
  }, [track, showToast])

  const handleExportWav = useCallback(async () => {
    showToast('Rendering audio…')
    try {
      await exportTrackAsWav(track, sound)
      analytics.bassTabExport('wav')
      showToast(`${track.name}.wav downloaded`)
    } catch {
      showToast('Export failed')
    }
  }, [track, sound, showToast])

  const handleLoopToggle = useCallback(() => {
    const next = !loop
    setLoop(next)
    if (next) {
      if (!loopRange) {
        setLoopRange({ startBeat: 0, endBeat: track.totalBars * track.beatsPerBar })
      }
    } else {
      setLoopRange(null)
    }
  }, [loop, loopRange, track.totalBars, track.beatsPerBar])

  const handleToggleLoopRange = useCallback(() => {
    if (loopRange) {
      setLoopRange(null)
      setLoop(false)
    } else {
      const totalBeats = track.totalBars * track.beatsPerBar
      setLoopRange({ startBeat: 0, endBeat: totalBeats })
      setLoop(true)
    }
  }, [loopRange, track])

  const handleShareUrl = useCallback(async () => {
    const hash = encodeTrackToHash(track)
    const url = window.location.origin + window.location.pathname + hash
    const ok = await copyToClipboard(url)
    if (ok) analytics.bassTabShared()
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
      if ((e.code === 'Delete' || e.code === 'Backspace') && selectedNoteId) { e.preventDefault(); handleDeleteNote(selectedNoteId) }
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
  }, [isPlaying, handlePlay, handleStop, selectedNoteId, handleDeleteNote, selectedNote, updateNote, snap, handleUndo, handleRedo, duplicateNote])

  return (
    <div
      className="flex flex-col text-white"
      style={{
        height: '100dvh', position: 'relative',
        fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
        overflow: 'hidden', overscrollBehavior: 'none',
        background: 'hsl(224 24% 8%)',
      }}
      onContextMenu={handleContextMenu}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div
        style={{
          flexShrink: 0, height: 50,
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

        <span style={{ color: 'hsl(224 15% 35%)', fontSize: 14, fontWeight: 300, flexShrink: 0 }}>/</span>

        {!isMobile && (
          <>
            <a href="/tools/" style={{
              fontSize: 13, color: 'hsl(220 10% 48%)', textDecoration: 'none',
              flexShrink: 0, transition: 'color 0.12s',
            }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'hsl(220 10% 68%)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'hsl(220 10% 48%)'}
            >
              Tools
            </a>
            <span style={{ color: 'hsl(224 15% 30%)', fontSize: 14, fontWeight: 300, flexShrink: 0 }}>/</span>
          </>
        )}

        <span style={{
          fontSize: 12, fontWeight: 500, color: 'hsl(262 60% 75%)',
          background: 'hsl(262 40% 15%)', padding: '2px 9px', borderRadius: 20,
          border: '1px solid hsl(262 40% 22%)',
          flexShrink: 0,
        }}>
          Bass Tab
        </span>

        <span style={{ color: 'hsl(224 15% 28%)', fontSize: 12, flexShrink: 0 }}>—</span>

        {editingTrackName ? (
          <input
            defaultValue={track.name}
            onBlur={e => { setTrack(t => ({ ...t, name: e.target.value || t.name })); setEditingTrackName(false) }}
            onKeyDown={e => {
              if (e.key === 'Enter') { setTrack(t => ({ ...t, name: (e.target as HTMLInputElement).value || t.name })); setEditingTrackName(false) }
              if (e.key === 'Escape') setEditingTrackName(false)
            }}
            autoFocus
            style={{
              background: 'hsl(224 18% 17%)',
              border: '1px solid hsl(262 50% 40%)',
              borderRadius: 6,
              color: 'hsl(220 14% 88%)',
              fontSize: 13, fontWeight: 500,
              padding: '2px 8px',
              outline: 'none',
              width: 180, maxWidth: 220,
              fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
            }}
          />
        ) : (
          <span
            onClick={() => setEditingTrackName(true)}
            title="Click to rename"
            style={{
              fontSize: 13, fontWeight: 500,
              color: 'hsl(220 14% 68%)',
              cursor: 'text',
              padding: '2px 4px',
              borderRadius: 4,
              maxWidth: 200,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              transition: 'color 0.12s',
            }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'hsl(220 14% 88%)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'hsl(220 14% 68%)'}
          >
            {track.name}
          </span>
        )}

        <div style={{ flex: 1 }} />

        {/* Presets button — both mobile and desktop */}
        <button
          onClick={() => setShowPresets(true)}
          title="Load a preset song"
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: isMobile ? '4px 10px' : '3px 10px', borderRadius: 20,
            fontSize: isMobile ? 12 : 11, fontWeight: 500, cursor: 'pointer', border: '1px solid',
            borderColor: 'hsl(224 15% 28%)',
            background: 'hsl(224 18% 14%)',
            color: 'hsl(220 10% 62%)',
            transition: 'all 0.15s', flexShrink: 0,
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'hsl(262 60% 45%)'; (e.currentTarget as HTMLElement).style.color = 'hsl(262 80% 80%)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'hsl(224 15% 28%)'; (e.currentTarget as HTMLElement).style.color = 'hsl(220 10% 62%)' }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
          </svg>
          Songs
        </button>

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
        isPlaying={isPlaying} loop={loop} bpm={track.bpm} sound={sound}
        totalBars={track.totalBars} zoom={zoom} volume={volume} noteDuration={noteDuration}
        hasSelectedNote={!!selectedNote} selectedNoteFret={selectedNote?.fret ?? null}
        canUndo={canUndo} canRedo={canRedo} metronome={metronome}
        onPlay={handlePlay} onStop={handleStop} onRewind={handleRewind} onLoopToggle={handleLoopToggle}
        onBpmChange={handleBpmChange} onSoundChange={handleSoundChange}
        onBarsChange={(bars) => setTrack(t => ({ ...t, totalBars: bars }))}
        onZoomIn={() => handleZoomChange(zoom + 0.25)} onZoomOut={() => handleZoomChange(zoom - 0.25)} onZoomReset={() => handleZoomChange(1)}
        onFretChange={handleFretChange} onVolumeChange={handleVolumeChange}
        onUndo={handleUndo} onRedo={handleRedo}
        onClearAll={handleClearAll} onExportAscii={handleExportAscii}
        onExportMidi={handleExportMidi} onImportMidi={handleImportMidiClick} onImportGp={handleImportGpClick} onShareUrl={handleShareUrl}
        onMetronomeToggle={() => setMetronome(m => !m)}
        onNoteDurationChange={handleNoteDurationChange}
        isMobile={isMobile}
        compact={isMobile && !transportExpanded}
        onToggleExpand={() => { setTransportExpanded(e => !e); setFretboardVisible(false) }}
        currentBeat={currentBeat}
        beatsPerBar={track.beatsPerBar}
        fitWidth={fitWidth}
        onFitWidthToggle={() => setFitWidth(f => !f)}
        desktopCompact={desktopCompact}
        onToggleDesktopCompact={() => setDesktopCompact(c => !c)}
        onBeatsPerBarChange={handleBeatsPerBarChange}
        midiInputAvailable={midiInput.available}
        midiInputActive={midiInput.active}
        midiDeviceName={midiInput.devices.find(d => d.id === midiInput.selectedDeviceId)?.name ?? null}
        onMidiInputToggle={midiInput.toggle}
        onExportWav={handleExportWav}
        onExportImage={() => setExportImageOpen(true)}
        onExportVideo={() => setExportVideoOpen(true)}
        loopRangeActive={!!loopRange}
        onToggleLoopRange={handleToggleLoopRange}
        onRecord={() => { stopPlayback(); setIsPlaying(false); setRecordingOpen(true) }}
      />

      {/* ── Seek bar ──────────────────────────────────────────────────────── */}
      <div style={{ padding: '4px 12px 0' }}>
        <BassTabSeekBar
          currentBeat={currentBeat}
          totalBeats={track.totalBars * track.beatsPerBar}
          beatsPerBar={track.beatsPerBar}
          isPlaying={isPlaying}
          onSeek={handleSeek}
          loopRange={loopRange}
          onLoopRangeChange={setLoopRange}
        />
      </div>

      {/* ── View bar (desktop) ────────────────────────────────────────────── */}
      {!isMobile && (
        <div style={{
          display: 'flex', alignItems: 'center',
          height: 44, flexShrink: 0,
          background: 'hsl(224 20% 9%)',
          borderBottom: '1px solid hsl(224 15% 16%)',
          padding: '0 10px', gap: 4,
        }}>
          {([
            { id: 'tab',    label: 'Tab',         icon: <TabIcon /> },
            { id: 'score',  label: 'Score',        icon: <ScoreIcon /> },
            { id: 'grid',   label: 'Grid',         icon: <GridIcon /> },
            { id: 'guitar', label: 'Bass Guitar',  icon: <GuitarIcon /> },
          ] as const).map(v => {
            const active = activeView === v.id
            return (
              <button key={v.id} onClick={() => setActiveView(v.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '0 12px', height: 30,
                  background: active ? 'hsl(262 50% 18%)' : 'transparent',
                  border: `1px solid ${active ? 'hsl(262 50% 35%)' : 'transparent'}`,
                  borderRadius: 20,
                  color: active ? 'hsl(262 80% 85%)' : 'hsl(220 10% 42%)',
                  fontSize: 11, fontWeight: active ? 600 : 400,
                  cursor: 'pointer', transition: 'all 0.12s',
                  fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
                  letterSpacing: '0.02em',
                  userSelect: 'none',
                }}
                onMouseEnter={e => { if (activeView !== v.id) (e.currentTarget as HTMLElement).style.color = 'hsl(220 10% 62%)' }}
                onMouseLeave={e => { if (activeView !== v.id) (e.currentTarget as HTMLElement).style.color = 'hsl(220 10% 42%)' }}
              >
                {v.icon}
                <span>{v.label}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* ── Main content ──────────────────────────────────────────────────── */}
      {activeView === 'guitar' ? (
        <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
          <BassRealisticDisplay activeFrets={activeFrets} attackSignals={attackSignals} />
        </div>
      ) : (
        <>
          {/* Fretboard collapsible — desktop only */}
          {!isMobile && (
            <div style={{ flexShrink: 0 }}>
              <button
                onClick={() => setFretboardVisible(v => !v)}
                style={{
                  width: '100%', height: 22, background: 'hsl(224 20% 10%)', border: 'none',
                  borderBottom: fretboardVisible ? 'none' : '1px solid hsl(224 15% 18%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                  color: 'hsl(220 10% 34%)', fontSize: 10,
                  fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
                  cursor: 'pointer', userSelect: 'none', letterSpacing: '0.04em',
                  transition: 'background 0.1s, color 0.1s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'hsl(224 20% 13%)'; (e.currentTarget as HTMLElement).style.color = 'hsl(220 10% 50%)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'hsl(224 20% 10%)'; (e.currentTarget as HTMLElement).style.color = 'hsl(220 10% 34%)' }}
              >
                {fretboardVisible ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                <span>Fretboard</span>
              </button>
              <div style={{
                overflow: 'hidden',
                maxHeight: fretboardVisible ? (isShortScreen ? 150 : 200) : 0,
                transition: 'max-height 0.2s ease',
              }}>
                <BassTabFretboard
                  activeFrets={activeFrets} attackSignals={attackSignals}
                  onNoteClick={handleFretboardNote}
                  maxHeight={isShortScreen ? 150 : 200}
                />
              </div>
            </div>
          )}

          {/* Mobile: Edit (editable notation) or Score (read-only notation) */}
          {isMobile && activeView === 'tab' ? (
            <MobileBarView
              track={track} currentBeat={currentBeat} isPlaying={isPlaying}
              onSeek={handleSeek} viewMode="score"
              editable selectedNoteId={selectedNoteId} sound={sound} noteDuration={noteDuration}
              onAddNote={addNote} onUpdateNote={updateNote} onDeleteNote={deleteNote}
              onSelectNote={setSelectedId} onBeginEdit={beginEdit}
            />
          ) : isMobile && activeView === 'score' ? (
            <MobileBarView
              track={track} currentBeat={currentBeat} isPlaying={isPlaying}
              onSeek={handleSeek} viewMode="score"
            />
          ) : isMobile ? null
          : activeView === 'tab' ? (
            <TabScore
              track={track} zoom={zoom} currentBeat={currentBeat}
              cursorBeat={cursorBeat} isPlaying={isPlaying} selectedNoteId={selectedNoteId}
              sound={sound} noteDuration={noteDuration} fitWidth={fitWidth}
              onAddNote={addNote} onUpdateNote={updateNote} onDeleteNote={deleteNote}
              onSelectNote={setSelectedId} onCursorBeatChange={setCursorBeat}
              onBeginEdit={beginEdit} onSectionChange={handleSectionChange}
            />
          ) : activeView === 'score' ? (
            <TabNotationView
              track={track} zoom={zoom} currentBeat={currentBeat}
              cursorBeat={cursorBeat} isPlaying={isPlaying} selectedNoteId={selectedNoteId}
              sound={sound} noteDuration={noteDuration} fitWidth={fitWidth}
              onAddNote={addNote} onUpdateNote={updateNote} onDeleteNote={deleteNote}
              onSelectNote={setSelectedId} onCursorBeatChange={setCursorBeat}
              onBeginEdit={beginEdit} onSectionChange={handleSectionChange}
              onFitZoomChange={handleZoomChange}
            />
          ) : (
            <BassTabGrid
              track={track} zoom={zoom} currentBeat={currentBeat}
              cursorBeat={cursorBeat} isPlaying={isPlaying} selectedNoteId={selectedNoteId}
              fitWidth={fitWidth} isMobile={isMobile}
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
          guitarView={activeView === 'guitar'}
        />
      )}

      {/* ── Mobile bottom navigation ──────────────────────────────────────── */}
      {isMobile && (
        <div style={{
          flexShrink: 0, height: 62,
          background: 'hsl(224 20% 9%)',
          borderTop: '1px solid hsl(224 15% 16%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          padding: '0 12px',
        }}>
          {([
            { id: 'tab',    label: 'Edit',  icon: <TabIcon /> },
            { id: 'score',  label: 'Score', icon: <ScoreIcon /> },
            { id: 'guitar', label: 'Bass',  icon: <GuitarIcon /> },
          ] as const).map(tab => {
            const isActive = activeView === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveView(tab.id)}
                style={{
                  flex: 1, height: 44,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
                  background: isActive ? 'hsl(262 50% 18%)' : 'transparent',
                  border: `1px solid ${isActive ? 'hsl(262 50% 32%)' : 'transparent'}`,
                  borderRadius: 12,
                  cursor: 'pointer',
                  color: isActive ? 'hsl(262 80% 85%)' : 'hsl(220 10% 42%)',
                  transition: 'all 0.15s',
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

      {/* Preset picker */}
      {showPresets && (
        <PresetPicker onSelect={handleLoadPreset} onClose={() => setShowPresets(false)} />
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
              <CtxBtn label="Delete  Del" danger onClick={() => { handleDeleteNote(nid); closeCtxMenu() }} />
            </div>
          )
        }

        return null
      })()}

      {/* ── Hidden file input for MIDI import button ──────────────────────── */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".mid,.midi"
        style={{ display: 'none' }}
        onChange={handleFileInputChange}
      />

      {/* ── Hidden file input for Guitar Pro import button ──────────────────── */}
      <input
        ref={gpInputRef}
        type="file"
        accept=".gp,.gp3,.gp4,.gp5,.gpx,.gp7"
        style={{ display: 'none' }}
        onChange={handleGpFileInputChange}
      />

      {/* ── Drag-over overlay (MIDI + Guitar Pro) ────────────────────────────── */}
      {dragOver && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 900,
          background: 'hsl(224 24% 6% / 0.88)', backdropFilter: 'blur(6px)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 14,
          border: '2px dashed hsl(262 60% 52%)',
          pointerEvents: 'none',
        }}>
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none"
            stroke="hsl(262 80% 72%)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18V5l12-2v13"/>
            <circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
          </svg>
          <span style={{ color: 'hsl(262 80% 88%)', fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>
            Drop MIDI or Guitar Pro file
          </span>
          <span style={{ color: 'hsl(220 10% 52%)', fontSize: 13 }}>
            .mid · .midi · .gp · .gp3 · .gp4 · .gp5 · .gpx · .gp7
          </span>
        </div>
      )}

      {/* ── MIDI import confirmation modal ──────────────────────────────────── */}
      {midiPending && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(3px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: 'hsl(224 20% 11%)',
            border: '1px solid hsl(224 15% 22%)',
            borderRadius: 14, padding: '24px 26px',
            width: 340, maxWidth: '92vw',
            boxShadow: '0 20px 60px rgba(0,0,0,0.65)',
            fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 9,
                background: 'hsl(262 40% 18%)', border: '1px solid hsl(262 40% 26%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                  stroke="hsl(262 80% 74%)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
                </svg>
              </div>
              <div>
                <div style={{ color: 'hsl(220 14% 90%)', fontWeight: 600, fontSize: 15, lineHeight: 1.2 }}>
                  MIDI ready to import
                </div>
                <div style={{ color: 'hsl(220 10% 48%)', fontSize: 12, marginTop: 3 }}>
                  {midiPending.selectedTrackName}
                </div>
              </div>
            </div>

            <div style={{
              background: 'hsl(224 24% 7%)', borderRadius: 9,
              padding: '12px 14px',
              display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr',
              gap: '8px 0', marginBottom: 16,
              border: '1px solid hsl(224 15% 17%)',
            }}>
              {([
                { label: 'Notes', value: midiPending.track.notes.length },
                { label: 'BPM',   value: midiPending.track.bpm },
                { label: 'Bars',  value: midiPending.track.totalBars },
                { label: 'Time',  value: `${midiPending.track.beatsPerBar}/4` },
              ] as const).map(({ label, value }) => (
                <div key={label} style={{ textAlign: 'center' }}>
                  <div style={{ color: 'hsl(220 10% 40%)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {label}
                  </div>
                  <div style={{ color: 'hsl(262 60% 80%)', fontSize: 16, fontWeight: 700, fontFamily: 'ui-monospace, monospace', marginTop: 2 }}>
                    {value}
                  </div>
                </div>
              ))}
            </div>

            {midiPending.warnings.length > 0 && (
              <div style={{
                background: 'hsl(38 50% 10%)', border: '1px solid hsl(38 60% 22%)',
                borderRadius: 7, padding: '9px 12px', marginBottom: 16,
              }}>
                {midiPending.warnings.map((w, i) => (
                  <div key={i} style={{ color: 'hsl(38 80% 68%)', fontSize: 12, lineHeight: 1.5 }}>
                    ⚠ {w}
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setMidiPending(null)}
                style={{
                  flex: 1, padding: '9px 0', borderRadius: 8,
                  background: 'transparent', border: '1px solid hsl(224 15% 24%)',
                  color: 'hsl(220 10% 52%)', fontSize: 13, fontWeight: 500,
                  cursor: 'pointer', fontFamily: 'inherit', transition: 'border-color 0.12s, color 0.12s',
                }}
                onMouseEnter={e => { const el = e.currentTarget; el.style.borderColor = 'hsl(224 15% 36%)'; el.style.color = 'hsl(220 14% 70%)' }}
                onMouseLeave={e => { const el = e.currentTarget; el.style.borderColor = 'hsl(224 15% 24%)'; el.style.color = 'hsl(220 10% 52%)' }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleImportTrack(midiPending.track)}
                style={{
                  flex: 2, padding: '9px 0', borderRadius: 8,
                  background: 'hsl(262 83% 58%)', border: 'none',
                  color: 'white', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit',
                  boxShadow: '0 0 18px hsl(262 83% 58% / 0.32)',
                  transition: 'opacity 0.12s',
                }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '0.88' }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
              >
                Load into editor
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Import error (MIDI or Guitar Pro) ────────────────────────────────── */}
      {importError && (
        <div
          onClick={() => setImportError(null)}
          style={{
            position: 'absolute', bottom: 72, left: '50%', transform: 'translateX(-50%)',
            zIndex: 1000, cursor: 'pointer',
            background: 'hsl(0 55% 18%)', border: '1px solid hsl(0 55% 32%)',
            color: 'hsl(0 80% 80%)', borderRadius: 9,
            padding: '10px 18px', fontSize: 13, maxWidth: 340, textAlign: 'center',
            boxShadow: '0 6px 24px rgba(0,0,0,0.5)',
            fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
          }}
        >
          {importError}
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

      {/* ── Export image modal ───────────────────────────────────────────── */}
      {exportImageOpen && (
        <ExportImageModal track={track} onClose={() => setExportImageOpen(false)} />
      )}

      {/* ── Export video modal ───────────────────────────────────────────── */}
      {exportVideoOpen && (
        <ExportVideoModal track={track} sound={sound} onClose={() => setExportVideoOpen(false)} />
      )}

      {/* ── Recording overlay ─────────────────────────────────────────────── */}
      {recordingOpen && (
        <RecordingOverlay
          track={track}
          sound={sound}
          onComplete={handleRecordingComplete}
          onCancel={() => setRecordingOpen(false)}
        />
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
      height: 30, background: 'hsl(224 20% 7%)',
      borderTop: '1px solid hsl(224 15% 16%)',
      display: 'flex', alignItems: 'center', gap: 18,
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
function ScoreIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      {/* 5 staff lines */}
      <line x1="2" y1="6"  x2="18" y2="6"  />
      <line x1="2" y1="8"  x2="18" y2="8"  />
      <line x1="2" y1="10" x2="18" y2="10" />
      <line x1="2" y1="12" x2="18" y2="12" />
      <line x1="2" y1="14" x2="18" y2="14" />
      {/* notehead on middle line */}
      <ellipse cx="11" cy="10" rx="2.2" ry="1.5" transform="rotate(-15,11,10)" fill="currentColor" stroke="none" />
      {/* stem */}
      <line x1="13" y1="10" x2="13" y2="5" strokeWidth="1.4" />
    </svg>
  )
}

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

// ── Fret Numpad — mobile bottom sheet ─────────────────────────────────────
