import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { Plus, Minus, Copy, Trash2 } from 'lucide-react'
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
import { BT_VARS, v } from '../../lib/bassTab/theme'
import { BassTabToolsPanel } from './BassTabToolsPanel'

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
  // Alto del diapasón en el dock. 240 no es arbitrario: por debajo de ~240 el
  // mástil se encoge tanto que ni con los 24 trastes llena el ancho de un
  // escritorio de 1440, y sobra fondo a los lados.
  const fretboardHeight = isShortScreen ? 170 : 240
  const [editingTrackName, setEditingTrackName]   = useState(false)
  const [recordingOpen, setRecordingOpen]         = useState(false)
  const [exportImageOpen, setExportImageOpen]   = useState(false)
  const [exportVideoOpen, setExportVideoOpen]   = useState(false)

  // En pantallas bajas el diapasón se pliega solo: con el transporte al pie y
  // la partitura en su tarjeta, es lo primero que sobra.
  useEffect(() => {
    if (!isMobile && isShortScreen) setFretboardVisible(false)
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

  // ── Rail de compases ──────────────────────────────────────────────────────
  // Índice del último compás que contiene notas. Es el que se duplica: el
  // último compás del track casi siempre está vacío, porque `useTrackEditor`
  // mantiene uno de margen al final.
  const lastContentBar = useMemo(() => {
    if (!track.notes.length) return -1
    return Math.max(...track.notes.map(n => Math.floor(n.startBeat / track.beatsPerBar)))
  }, [track.notes, track.beatsPerBar])

  const handleAddBar = useCallback(() => {
    setTrack(t => ({ ...t, totalBars: Math.min(64, t.totalBars + 1) }))
  }, [setTrack])

  const handleDeleteLastBar = useCallback(() => {
    if (track.totalBars <= 1) return
    beginEdit()
    deleteBar(track.totalBars - 1)
  }, [track.totalBars, beginEdit, deleteBar])

  const handleDuplicateLastBar = useCallback(() => {
    if (lastContentBar < 0) return
    const bpb   = track.beatsPerBar
    const start = lastContentBar * bpb
    const inBar = track.notes.filter(n => n.startBeat >= start && n.startBeat < start + bpb)
    if (!inBar.length) return
    beginEdit()
    // No hay que desplazar nada: por definición, después de `lastContentBar`
    // solo quedan compases vacíos.
    setTrack(t => ({
      ...t,
      totalBars: Math.min(64, Math.max(t.totalBars, lastContentBar + 3)),
      notes: [
        ...t.notes,
        ...inBar.map(n => ({ ...n, id: crypto.randomUUID(), startBeat: n.startBeat + bpb })),
      ],
    }))
    showToast(`Compás ${lastContentBar + 1} duplicado`)
  }, [lastContentBar, track.beatsPerBar, track.notes, beginEdit, setTrack, showToast])

  // Transponer = mover el traste, porque en la misma cuerda un traste es un
  // semitono. Es todo o nada: si una sola nota se saldría del diapasón, no se
  // mueve ninguna — transponer media línea la desafina respecto al resto.
  const handleTranspose = useCallback((delta: number) => {
    if (!track.notes.length) return
    const blocked = track.notes.some(n => n.fret + delta < 0 || n.fret + delta > 24)
    if (blocked) {
      showToast(delta > 0 ? 'Alguna nota pasaría del traste 24' : 'Alguna nota bajaría del traste 0')
      return
    }
    beginEdit()
    setTrack(t => ({ ...t, notes: t.notes.map(n => ({ ...n, fret: n.fret + delta })) }))
  }, [track.notes, beginEdit, setTrack, showToast])

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

  // El transporte se monta en sitios distintos según el ancho —colgando de la
  // cabecera en móvil, al pie en escritorio—, así que se declara una sola vez
  // aquí en lugar de repetir treinta props en dos ramas del JSX.
  const transportEl = (
    <BassTabTransport
      isPlaying={isPlaying} loop={loop} bpm={track.bpm} sound={sound}
      totalBars={track.totalBars} volume={volume} noteDuration={noteDuration}
      hasSelectedNote={!!selectedNote} selectedNoteFret={selectedNote?.fret ?? null}
      canUndo={canUndo} canRedo={canRedo} metronome={metronome}
      onPlay={handlePlay} onStop={handleStop} onRewind={handleRewind} onLoopToggle={handleLoopToggle}
      onBpmChange={handleBpmChange} onSoundChange={handleSoundChange}
      onBarsChange={(bars) => setTrack(t => ({ ...t, totalBars: bars }))}
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
      fretboardVisible={fretboardVisible}
      onFretboardToggle={isMobile || activeView === 'guitar' ? undefined : () => setFretboardVisible(f => !f)}
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
  )

  return (
    <div
      className="flex flex-col"
      style={{
        ...BT_VARS,
        height: '100dvh', position: 'relative',
        fontFamily: 'var(--bt-ui)',
        overflow: 'hidden', overscrollBehavior: 'none',
        background: v('paper'), color: v('ink'),
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
          background: 'var(--bt-card)',
          borderBottom: '1px solid var(--bt-rule)',
          display: 'flex', alignItems: 'center', gap: 8,
          paddingLeft: 16, paddingRight: 16,
          fontFamily: 'var(--bt-ui)',
        }}
      >
        {/* Logo */}
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', flexShrink: 0 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 7,
            background: 'var(--bt-accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 12px transparent',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
            </svg>
          </div>
          {!isMobile && (
            <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: '-0.025em', color: 'var(--bt-ink)' }}>
              ChordSequence
            </span>
          )}
        </a>

        <span style={{ color: 'var(--bt-dim)', fontSize: 14, fontWeight: 300, flexShrink: 0 }}>/</span>

        {!isMobile && (
          <>
            <a href="/tools/" style={{
              fontSize: 13, color: 'var(--bt-soft)', textDecoration: 'none',
              flexShrink: 0, transition: 'color 0.12s',
            }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--bt-ink)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--bt-soft)'}
            >
              Tools
            </a>
            <span style={{ color: 'var(--bt-dim)', fontSize: 14, fontWeight: 300, flexShrink: 0 }}>/</span>
          </>
        )}

        <span style={{
          fontSize: 12, fontWeight: 500, color: 'var(--bt-accent)',
          background: 'var(--bt-accent-wash)', padding: '2px 9px', borderRadius: 20,
          border: '1px solid var(--bt-accent-wash)',
          flexShrink: 0,
        }}>
          Bass Tab
        </span>

        <span style={{ color: 'var(--bt-dim)', fontSize: 12, flexShrink: 0 }}>—</span>

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
              background: 'var(--bt-sunken)',
              border: '1px solid var(--bt-accent)',
              borderRadius: 6,
              color: 'var(--bt-ink)',
              fontSize: 13, fontWeight: 500,
              padding: '2px 8px',
              outline: 'none',
              width: 180, maxWidth: 220,
              fontFamily: 'var(--bt-ui)',
            }}
          />
        ) : (
          <span
            onClick={() => setEditingTrackName(true)}
            title="Click to rename"
            style={{
              fontSize: 13, fontWeight: 500,
              color: 'var(--bt-muted)',
              cursor: 'text',
              padding: '2px 4px',
              borderRadius: 4,
              maxWidth: 200,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              transition: 'color 0.12s',
            }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--bt-ink)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--bt-muted)'}
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
            borderColor: 'var(--bt-dim)',
            background: 'var(--bt-card)',
            color: 'var(--bt-muted)',
            transition: 'all 0.15s', flexShrink: 0,
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--bt-accent)'; (e.currentTarget as HTMLElement).style.color = 'var(--bt-accent)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--bt-dim)'; (e.currentTarget as HTMLElement).style.color = 'var(--bt-muted)' }}
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
              fontSize: 11, color: 'var(--bt-soft)',
              background: 'var(--bt-card)',
              padding: '2px 8px', borderRadius: 10,
              border: '1px solid var(--bt-rule)',
            }}>
              {track.notes.length} {track.notes.length === 1 ? 'note' : 'notes'}
            </span>


            {isPlaying && (
              <span style={{
                fontSize: 11, fontFamily: 'var(--bt-mono)',
                color: 'var(--bt-accent)',
                background: 'var(--bt-accent-wash)',
                padding: '2px 10px', borderRadius: 10,
                border: '1px solid var(--bt-accent-wash)',
                minWidth: 52, textAlign: 'center',
              }}>
                {`${Math.floor(currentBeat / track.beatsPerBar) + 1}:${Math.floor(currentBeat % track.beatsPerBar) + 1}`}
              </span>
            )}
          </>
        )}

        {/* Mobile: note count (compact) */}
        {isMobile && (
          <span style={{ fontSize: 11, color: 'var(--bt-dim)', fontFamily: 'var(--bt-mono)' }}>
            {track.notes.length}n
          </span>
        )}
      </div>

      {/* ── Transporte (móvil: colgando de la cabecera) ───────────────────── */}
      {isMobile && (
        <>
          {transportEl}
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
        </>
      )}

      {/* ── View bar (desktop) ────────────────────────────────────────────── */}
      {!isMobile && (
        <div style={{
          display: 'flex', alignItems: 'center',
          height: 44, flexShrink: 0,
          background: v('sunken'),
          borderBottom: `1px solid ${v('rule')}`,
          padding: '0 10px', gap: 8,
        }}>
          {([
            { id: 'tab',    label: 'Tab',         icon: <TabIcon /> },
            { id: 'score',  label: 'Score',        icon: <ScoreIcon /> },
            { id: 'grid',   label: 'Grid',         icon: <GridIcon /> },
            { id: 'guitar', label: 'Bass Guitar',  icon: <GuitarIcon /> },
          ] as const).map(view => {
            const active = activeView === view.id
            return (
              <button key={view.id} onClick={() => setActiveView(view.id)}
                aria-pressed={active}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '0 13px', height: 30,
                  background: active ? v('accent') : 'transparent',
                  border: 'none', borderRadius: 7,
                  color: active ? '#fff' : v('soft'),
                  fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', transition: 'background .12s, color .12s',
                  fontFamily: 'var(--bt-ui)',
                  boxShadow: active ? v('shadow') : 'none',
                  userSelect: 'none',
                }}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.color = v('ink') }}
                onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.color = v('soft') }}
              >
                {view.icon}
                <span>{view.label}</span>
              </button>
            )
          })}

          <div style={{ flex: 1 }} />

          {/* Zoom. Vive aquí y no en el transporte porque afecta a lo que se
              ve, igual que el conmutador de vistas que tiene al lado. */}
          {activeView !== 'guitar' && (
            <div style={{
              display: 'flex', alignItems: 'center', overflow: 'hidden',
              border: `1px solid ${v('rule')}`, borderRadius: 8, background: v('card'),
            }}>
              <ZoomBtn title="Alejar" onClick={() => handleZoomChange(zoom - 0.25)} disabled={fitWidth || zoom <= 0.4}>−</ZoomBtn>
              <ZoomBtn title="Acercar" onClick={() => handleZoomChange(zoom + 0.25)} disabled={fitWidth || zoom >= 4}>+</ZoomBtn>
              <ZoomBtn
                title="Ajustar al ancho de la ventana"
                onClick={() => setFitWidth(f => !f)}
                active={fitWidth}
                wide
              >
                {fitWidth ? 'Fit' : `${Math.round(zoom * 100)}%`}
              </ZoomBtn>
            </div>
          )}
        </div>
      )}

      {/* ── Main content ──────────────────────────────────────────────────── */}
      {/* Fila: panel de herramientas + lienzo. El panel es solo de escritorio —
          en móvil no cabe, y allí estos mismos controles siguen estando en el
          transporte, que ya tiene su propia disposición compacta. */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {!isMobile && (
          <BassTabToolsPanel
            noteDuration={noteDuration} onNoteDurationChange={handleNoteDurationChange}
            sound={sound} onSoundChange={handleSoundChange}
            beatsPerBar={track.beatsPerBar} onBeatsPerBarChange={handleBeatsPerBarChange}
            volume={volume} onVolumeChange={handleVolumeChange}
          />
        )}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      {activeView === 'guitar' ? (
        <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
          <BassRealisticDisplay activeFrets={activeFrets} attackSignals={attackSignals} />
        </div>
      ) : (
        <>
          {/* Mobile: Edit (editable notation) or Score (read-only notation) */}
          {isMobile ? (
            activeView === 'tab' ? (
              <MobileBarView
                track={track} currentBeat={currentBeat} isPlaying={isPlaying}
                onSeek={handleSeek} viewMode="score"
                editable selectedNoteId={selectedNoteId} sound={sound} noteDuration={noteDuration}
                onAddNote={addNote} onUpdateNote={updateNote} onDeleteNote={deleteNote}
                onSelectNote={setSelectedId} onBeginEdit={beginEdit}
              />
            ) : activeView === 'score' ? (
              <MobileBarView
                track={track} currentBeat={currentBeat} isPlaying={isPlaying}
                onSeek={handleSeek} viewMode="score"
              />
            ) : null
          ) : (
            /* Lienzo de escritorio.
               La partitura va dentro de una tarjeta sobre el fondo `paper` en
               vez de ocupar el ancho completo: separa el papel del cromo que lo
               rodea, que es lo que hace legible una partitura. El rail de
               compases ocupa la segunda columna del grid. */
            <div style={{
              flex: 1, minHeight: 0, overflow: 'hidden',
              display: 'grid', gridTemplateColumns: '1fr 40px', gap: 10,
              padding: 14, background: v('paper'),
            }}>
              <div style={{
                minWidth: 0, display: 'flex',
                // Tab y Score son pentagramas de alto fijo: centrados se leen
                // como una hoja, no como algo pegado al borde superior. Grid es
                // un piano roll y sí quiere todo el alto disponible.
                alignItems: activeView === 'grid' ? 'stretch' : 'center',
                background: v('card'),
                border: `1px solid ${v('rule')}`,
                borderRadius: 12, boxShadow: v('shadow'),
                padding: '10px 0',
                overflow: 'hidden',
              }}>
                {activeView === 'tab' ? (
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
              </div>

              <BarRail
                canDeleteBar={track.totalBars > 1}
                hasNotes={track.notes.length > 0}
                onAddBar={handleAddBar}
                onDuplicateBar={handleDuplicateLastBar}
                onDeleteBar={handleDeleteLastBar}
                onTransposeUp={() => handleTranspose(1)}
                onTransposeDown={() => handleTranspose(-1)}
                onClearAll={handleClearAll}
              />
            </div>
          )}

          {/* ── Dock del diapasón ─────────────────────────────────────────
              Debajo de la partitura, no encima: la partitura es lo que se
              lee y va arriba; el diapasón es el instrumento y descansa al
              pie, sobre su propio chasis oscuro. Se pliega desde el
              conmutador del transporte. */}
          {!isMobile && (
            <div style={{
              flexShrink: 0, overflow: 'hidden',
              maxHeight: fretboardVisible ? fretboardHeight + 20 : 0,
              transition: 'max-height 0.2s ease',
              background: v('panel'),
              borderTop: `1px solid ${v('panelRule')}`,
            }}>
              <div style={{ padding: '10px 14px' }}>
                <div style={{ borderRadius: 10, overflow: 'hidden' }}>
                  <BassTabFretboard
                    activeFrets={activeFrets} attackSignals={attackSignals}
                    onNoteClick={handleFretboardNote}
                    maxHeight={fretboardHeight}
                  />
                </div>
              </div>
            </div>
          )}
        </>
      )}
        </div>
      </div>

      {/* ── Bloque inferior de escritorio: seek + transporte ───────────────
          La barra de estado que había aquí desaparece: repetía el compás:pulso
          que ahora lleva el propio transporte y los atajos que lista el panel
          lateral. */}
      {!isMobile && (
        <div style={{ flexShrink: 0 }}>
          <div style={{ padding: '0 14px 6px', background: v('paper') }}>
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
          {transportEl}
        </div>
      )}

      {/* ── Mobile bottom navigation ──────────────────────────────────────── */}
      {isMobile && (
        <div style={{
          flexShrink: 0, height: 62,
          background: 'var(--bt-sunken)',
          borderTop: '1px solid var(--bt-rule)',
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
                  background: isActive ? 'var(--bt-accent-wash)' : 'transparent',
                  border: `1px solid ${isActive ? 'var(--bt-accent)' : 'transparent'}`,
                  borderRadius: 12,
                  cursor: 'pointer',
                  color: isActive ? 'var(--bt-accent)' : 'var(--bt-soft)',
                  transition: 'all 0.15s',
                  touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
                  fontFamily: 'var(--bt-ui)',
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
          background: 'var(--bt-rule)',
          border: '1px solid var(--bt-rule)',
          borderRadius: 8,
          boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px var(--bt-rule)',
          minWidth: 180, overflow: 'hidden',
          fontFamily: 'var(--bt-ui)',
        }
        const CtxBtn = ({ label, onClick, danger, disabled }: { label: string; onClick: () => void; danger?: boolean; disabled?: boolean }) => (
          <button
            onClick={onClick}
            disabled={disabled}
            style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '8px 14px', fontSize: 12, cursor: disabled ? 'not-allowed' : 'pointer',
              background: 'transparent', border: 'none',
              color: disabled ? 'var(--bt-dim)' : danger ? 'var(--bt-danger)' : 'var(--bt-ink)',
              transition: 'background 0.08s', fontFamily: 'inherit',
            }}
            onMouseEnter={e => { if (!disabled) (e.target as HTMLElement).style.background = 'var(--bt-rule)' }}
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
          background: 'rgba(28,27,25,0.55)', backdropFilter: 'blur(6px)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 14,
          border: '2px dashed var(--bt-accent)',
          pointerEvents: 'none',
        }}>
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none"
            stroke="var(--bt-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18V5l12-2v13"/>
            <circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
          </svg>
          <span style={{ color: 'var(--bt-accent)', fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>
            Drop MIDI or Guitar Pro file
          </span>
          <span style={{ color: 'var(--bt-muted)', fontSize: 13 }}>
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
            background: 'var(--bt-sunken)',
            border: '1px solid var(--bt-rule)',
            borderRadius: 14, padding: '24px 26px',
            width: 340, maxWidth: '92vw',
            boxShadow: '0 20px 60px rgba(0,0,0,0.65)',
            fontFamily: 'var(--bt-ui)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 9,
                background: 'var(--bt-accent-wash)', border: '1px solid var(--bt-accent-wash)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                  stroke="var(--bt-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
                </svg>
              </div>
              <div>
                <div style={{ color: 'var(--bt-ink)', fontWeight: 600, fontSize: 15, lineHeight: 1.2 }}>
                  MIDI ready to import
                </div>
                <div style={{ color: 'var(--bt-soft)', fontSize: 12, marginTop: 3 }}>
                  {midiPending.selectedTrackName}
                </div>
              </div>
            </div>

            <div style={{
              background: 'var(--bt-paper)', borderRadius: 9,
              padding: '12px 14px',
              display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr',
              gap: '8px 0', marginBottom: 16,
              border: '1px solid var(--bt-rule)',
            }}>
              {([
                { label: 'Notes', value: midiPending.track.notes.length },
                { label: 'BPM',   value: midiPending.track.bpm },
                { label: 'Bars',  value: midiPending.track.totalBars },
                { label: 'Time',  value: `${midiPending.track.beatsPerBar}/4` },
              ] as const).map(({ label, value }) => (
                <div key={label} style={{ textAlign: 'center' }}>
                  <div style={{ color: 'var(--bt-dim)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {label}
                  </div>
                  <div style={{ color: 'var(--bt-accent)', fontSize: 16, fontWeight: 700, fontFamily: 'var(--bt-mono)', marginTop: 2 }}>
                    {value}
                  </div>
                </div>
              ))}
            </div>

            {midiPending.warnings.length > 0 && (
              <div style={{
                background: 'rgba(184,121,31,0.10)', border: '1px solid rgba(184,121,31,0.35)',
                borderRadius: 7, padding: '9px 12px', marginBottom: 16,
              }}>
                {midiPending.warnings.map((w, i) => (
                  <div key={i} style={{ color: '#b8791f', fontSize: 12, lineHeight: 1.5 }}>
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
                  background: 'transparent', border: '1px solid var(--bt-rule)',
                  color: 'var(--bt-muted)', fontSize: 13, fontWeight: 500,
                  cursor: 'pointer', fontFamily: 'inherit', transition: 'border-color 0.12s, color 0.12s',
                }}
                onMouseEnter={e => { const el = e.currentTarget; el.style.borderColor = 'var(--bt-dim)'; el.style.color = 'var(--bt-muted)' }}
                onMouseLeave={e => { const el = e.currentTarget; el.style.borderColor = 'var(--bt-rule)'; el.style.color = 'var(--bt-muted)' }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleImportTrack(midiPending.track)}
                style={{
                  flex: 2, padding: '9px 0', borderRadius: 8,
                  background: 'var(--bt-accent)', border: 'none',
                  color: 'white', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit',
                  boxShadow: '0 0 18px transparent',
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
            background: 'rgba(214,69,69,0.10)', border: '1px solid rgba(214,69,69,0.35)',
            color: 'var(--bt-danger)', borderRadius: 9,
            padding: '10px 18px', fontSize: 13, maxWidth: 340, textAlign: 'center',
            boxShadow: '0 6px 24px rgba(0,0,0,0.5)',
            fontFamily: 'var(--bt-ui)',
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
            background: 'var(--bt-accent-hi)',
            color: 'white', borderRadius: 10,
            padding: '9px 20px', fontSize: 13, zIndex: 9999,
            fontFamily: 'var(--bt-ui)',
            fontWeight: 500,
            boxShadow: '0 4px 20px rgba(0,0,0,0.5), 0 0 0 1px var(--bt-accent-wash)',
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

// ── Zoom (barra de vistas) ─────────────────────────────────────────────────
function ZoomBtn({ children, title, onClick, disabled, active, wide }: {
  children: React.ReactNode
  title: string
  onClick: () => void
  disabled?: boolean
  active?: boolean
  wide?: boolean
}) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick} disabled={disabled} title={title} aria-pressed={active}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        width: wide ? undefined : 28, height: 28,
        padding: wide ? '0 9px' : 0,
        border: 'none',
        borderLeft: wide ? `1px solid ${v('rule')}` : 'none',
        background: active ? v('accentWash') : hov && !disabled ? v('sunken') : 'transparent',
        color: active ? v('accent') : hov && !disabled ? v('ink') : v('muted'),
        fontSize: wide ? 11 : 13,
        fontWeight: wide ? 600 : 400,
        fontVariantNumeric: 'tabular-nums',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        fontFamily: 'var(--bt-ui)',
        transition: 'background .12s, color .12s',
      }}
    >
      {children}
    </button>
  )
}

// ── Rail de compases ───────────────────────────────────────────────────────
/**
 * Columna de acciones a la derecha de la partitura.
 *
 * Están aquí y no en el transporte porque operan sobre lo que se ve —añadir,
 * duplicar o quitar compases, y transponer— y conviene tenerlas al lado del
 * lienzo sin que tapen la partitura. El transporte queda para lo que pasa en
 * el tiempo.
 */
function BarRail({
  canDeleteBar, hasNotes,
  onAddBar, onDuplicateBar, onDeleteBar,
  onTransposeUp, onTransposeDown, onClearAll,
}: {
  canDeleteBar: boolean
  hasNotes: boolean
  onAddBar: () => void
  onDuplicateBar: () => void
  onDeleteBar: () => void
  onTransposeUp: () => void
  onTransposeDown: () => void
  onClearAll: () => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
      <RailBtn title="Añadir un compás al final" onClick={onAddBar}>
        <Plus size={15} />
      </RailBtn>
      <RailBtn title="Duplicar el último compás con notas" onClick={onDuplicateBar} disabled={!hasNotes}>
        <Copy size={14} />
      </RailBtn>
      <RailBtn title="Quitar el último compás" onClick={onDeleteBar} disabled={!canDeleteBar}>
        <Minus size={15} />
      </RailBtn>

      <div style={{ height: 6 }} />

      <RailBtn title="Subir un semitono" onClick={onTransposeUp} disabled={!hasNotes}>
        <span style={{ fontSize: 15, lineHeight: 1 }}>♯</span>
      </RailBtn>
      <RailBtn title="Bajar un semitono" onClick={onTransposeDown} disabled={!hasNotes}>
        <span style={{ fontSize: 15, lineHeight: 1 }}>♭</span>
      </RailBtn>

      <div style={{ height: 6 }} />

      <RailBtn title="Borrar todas las notas" onClick={onClearAll} disabled={!hasNotes} danger>
        <Trash2 size={14} />
      </RailBtn>
    </div>
  )
}

function RailBtn({ children, title, onClick, disabled, danger }: {
  children: React.ReactNode
  title: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}) {
  const accent = danger ? v('danger') : v('accent')
  return (
    <button
      onClick={onClick} disabled={disabled} title={title} aria-label={title}
      style={{
        width: 34, height: 34, flexShrink: 0,
        display: 'grid', placeItems: 'center',
        background: v('card'),
        border: `1px solid ${v('rule')}`,
        borderRadius: 9,
        color: v('muted'),
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.35 : 1,
        transition: 'color .13s, border-color .13s',
      }}
      onMouseEnter={e => {
        if (disabled) return
        const el = e.currentTarget as HTMLElement
        el.style.color = accent
        el.style.borderColor = accent
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLElement
        el.style.color = v('muted')
        el.style.borderColor = v('rule')
      }}
    >
      {children}
    </button>
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
