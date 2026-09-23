import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import type { GuitarNote, GuitarTrack, GuitarSound, GuitarStringIndex, GuitarTechnique, LoopRange } from '../../lib/guitarTab/types'
import { DEFAULT_TRACK } from '../../lib/guitarTab/types'
import { startPlayback, stopPlayback, setMasterVolume, previewNote, startRecordingMetronome, prepareSoundfont } from '../../lib/guitarTab/guitarAudio'
import { toAsciiTab, exportMidiFile, copyToClipboard } from '../../lib/guitarTab/exportTab'
import { StringTabText } from '../tabtext/StringTabText'
import { stringNotesSignature, type StringNote } from '../../lib/tabtext/adapters/strings'
import { importMidiFile } from '../../lib/guitarTab/midiImport'
import { parseGpFile } from '../../lib/guitarTab/gpImport'
import { useGuitarTrackEditor } from '../../hooks/useGuitarTrackEditor'
import { GuitarTabGrid } from './GuitarTabGrid'
import { GuitarTabView } from './GuitarTabView'
import { GuitarTabNeck } from './GuitarTabNeck'
import { GuitarPhotoFretboard } from './GuitarPhotoFretboard'
import { GuitarTransport } from './GuitarTransport'
import { GuitarInspector } from './GuitarInspector'
import { clampDuration, type ChordShape } from '../../lib/guitarTab/guitarTheory'
import { T, STRING_NAMES, iconBtn, sectionLabel } from './theme'
import { GuitarNotationView } from './GuitarNotationView'
import { GuitarRecordingOverlay } from './GuitarRecordingOverlay'
import { GuitarSongLibrary } from './GuitarSongLibrary'
import { GUITAR_PRESETS } from '../../data/guitarPresets'

const STORAGE_KEY = 'guitar-tab-track-v1'

/** Where the Text view remembers rests, spacing and bars per line. */
const TEXT_FORMAT_KEY = 'guitar-tab-text-format-v1'

// First-time visitors (nothing saved yet) get a short, recognizable demo loaded instead of a
// blank grid — hitting Play should immediately show what the editor does, same reasoning as the
// GuitarTabPreview on /tools/guitar-tab/.
const DEFAULT_DEMO_PRESET_ID = 'preset-twinkletwinkle'

function loadTrack(): GuitarTrack {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULT_TRACK, ...JSON.parse(raw) }
  } catch {}
  const demo = GUITAR_PRESETS.find(p => p.id === DEFAULT_DEMO_PRESET_ID)
  if (demo) return { id: demo.id, name: demo.name, bpm: demo.bpm, beatsPerBar: demo.beatsPerBar, totalBars: demo.totalBars, notes: demo.notes, capo: demo.capo, sections: demo.sections }
  return { ...DEFAULT_TRACK }
}

interface CtxMenu { x: number; y: number; noteId: string }

export function GuitarTabPlayer({ initialPreset }: { initialPreset?: string } = {}) {
  const initialTrack = useMemo(() => {
    if (initialPreset) {
      const p = GUITAR_PRESETS.find(pr => pr.id === initialPreset)
      if (p) return { id: p.id, name: p.name, bpm: p.bpm, beatsPerBar: p.beatsPerBar, totalBars: p.totalBars, notes: p.notes, capo: p.capo, sections: p.sections }
    }
    if (typeof window !== 'undefined') return loadTrack()
    return { ...DEFAULT_TRACK }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const {
    track, setTrack, canUndo, canRedo,
    addNote, updateNote, deleteNote, beginEdit,
    insertBar, deleteBar,
    handleBpmChange, handleBeatsPerBarChange, handleCapoChange,
    handleLoadPreset, handleClearAll, handleUndo, handleRedo, resetHistory,
  } = useGuitarTrackEditor(initialTrack)

  const [isPlaying, setIsPlaying]     = useState(false)
  const [currentBeat, setCurrentBeat] = useState(0)
  const [cursorBeat, setCursorBeat]   = useState(0)
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const [sound, setSound]             = useState<GuitarSound>('sf2')
  const [loop, setLoop]               = useState(true)
  const [metronome, setMetronome]     = useState(false)
  const [volume, setVolume]           = useState(0.75)
  const [zoom, setZoom]               = useState(1)
  const [loopRange, setLoopRange]     = useState<LoopRange | null>(null)
  const [showRecording, setShowRecording] = useState(false)
  const [ctxMenu, setCtxMenu]         = useState<CtxMenu | null>(null)
  const [showFretboard, setShowFretboard]     = useState(true)
  const [viewMode, setViewMode]       = useState<ViewMode>('tab')
  const [toastMsg, setToastMsg]       = useState<string | null>(null)
  const [editingName, setEditingName] = useState(false)
  const [showSongLibrary, setShowSongLibrary] = useState(false)

  // ── New features ──────────────────────────────────────────────────────────────
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [countIn, setCountIn]             = useState<0 | 1 | 2>(0)
  const [isCountingIn, setIsCountingIn]   = useState(false)
  const [countdownBeat, setCountdownBeat] = useState<number | null>(null)
  const [mutedStrings, setMutedStrings]   = useState<boolean[]>(Array(6).fill(false))
  const [soloedStrings, setSoloedStrings] = useState<boolean[]>(Array(6).fill(false))
  const [noteColors, setNoteColors]       = useState(false)
  const [noteDuration, setNoteDuration]   = useState(1)
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [menu, setMenu]                   = useState<'import' | 'export' | null>(null)
  const isCompact = useIsCompact()

  const countInStopRef    = useRef<(() => void) | null>(null)
  const midiInputRef      = useRef<HTMLInputElement | null>(null)
  const gpInputRef        = useRef<HTMLInputElement | null>(null)

  const loopRef      = useRef(loop)
  const metroRef     = useRef(metronome)
  const loopRangeRef = useRef(loopRange)
  loopRef.current      = loop
  metroRef.current     = metronome
  loopRangeRef.current = loopRange

  useEffect(() => { setMasterVolume(volume) }, [volume])

  // Pre-load soundfont when SF2 is selected so first note plays without delay
  useEffect(() => {
    if (sound.startsWith('sf2')) prepareSoundfont(sound).catch(() => {})
  }, [sound])

  const showToast = (msg: string) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(null), 2500)
  }

  // ── Mute/Solo applied to track before playback ────────────────────────────
  const filteredTrack = useMemo<GuitarTrack>(() => {
    const soloActive = soloedStrings.some(Boolean)
    if (!mutedStrings.some(Boolean) && !soloActive) return track
    return {
      ...track,
      notes: track.notes.map(n => ({
        ...n,
        muted: n.muted || mutedStrings[n.stringIndex] || (soloActive && !soloedStrings[n.stringIndex]),
      })),
    }
  }, [track, mutedStrings, soloedStrings])

  // ── Attack signals for fretboard animation ────────────────────────────────
  const [attackSignals, setAttackSignals] = useState<({ fret: number; v: number } | null)[]>(
    Array(6).fill(null)
  )
  const prevBeatRef = useRef(0)

  const onBeatUpdate = useCallback((beat: number) => {
    setCurrentBeat(beat)
    const prevBeat = prevBeatRef.current
    const going = beat >= prevBeat
    if (going) {
      const activePerString: Record<number, { fret: number; vel: number }> = {}
      for (const n of track.notes) {
        if (n.startBeat > prevBeat && n.startBeat <= beat) {
          activePerString[n.stringIndex] = { fret: n.fret, vel: n.velocity }
        }
      }
      if (Object.keys(activePerString).length) {
        setAttackSignals(prev => {
          const next = [...prev]
          for (const [si, { fret }] of Object.entries(activePerString)) {
            next[Number(si)] = { fret, v: (next[Number(si)]?.v ?? 0) + 1 }
          }
          return next
        })
      }
    }
    prevBeatRef.current = beat
  }, [track.notes])

  // ── Playback ──────────────────────────────────────────────────────────────
  const doPlay = useCallback(async () => {
    setIsPlaying(true)
    const bpmWithSpeed = playbackSpeed !== 1 ? Math.round(filteredTrack.bpm * playbackSpeed) : filteredTrack.bpm
    const playTrack = bpmWithSpeed !== filteredTrack.bpm ? { ...filteredTrack, bpm: bpmWithSpeed } : filteredTrack
    prevBeatRef.current = cursorBeat
    await startPlayback(
      playTrack, cursorBeat, sound,
      onBeatUpdate,
      () => { setIsPlaying(false); setCurrentBeat(0) },
      () => loopRef.current,
      () => metroRef.current,
      () => loopRangeRef.current,
    )
  }, [filteredTrack, playbackSpeed, cursorBeat, sound, onBeatUpdate])

  const handlePlay = useCallback(async () => {
    if (countIn > 0) {
      setIsCountingIn(true)
      setCountdownBeat(1)
      const totalCountBeats = countIn * filteredTrack.beatsPerBar
      const { stop } = startRecordingMetronome(
        filteredTrack.bpm,
        filteredTrack.beatsPerBar,
        totalCountBeats,
        (beat) => setCountdownBeat((beat % filteredTrack.beatsPerBar) + 1),
        () => {
          setIsCountingIn(false)
          setCountdownBeat(null)
          doPlay()
        },
      )
      countInStopRef.current = stop
    } else {
      doPlay()
    }
  }, [countIn, filteredTrack.bpm, filteredTrack.beatsPerBar, doPlay])

  const handleStop = useCallback(() => {
    if (countInStopRef.current) { countInStopRef.current(); countInStopRef.current = null }
    setIsCountingIn(false)
    setCountdownBeat(null)
    stopPlayback()
    setIsPlaying(false)
    setCurrentBeat(0)
  }, [])

  const handleRewind = useCallback(() => {
    setCursorBeat(0)
    if (!isPlaying) setCurrentBeat(0)
  }, [isPlaying])

  const handleSeek = useCallback((beat: number) => {
    setCursorBeat(beat)
    if (!isPlaying) setCurrentBeat(beat)
  }, [isPlaying])

  // ── Note preview (fretboard click) ────────────────────────────────────────
  const handleFretboardClick = useCallback((si: number, fret: number) => {
    previewNote(si, fret, sound, track.capo)
    if (!isPlaying) {
      const note: GuitarNote = {
        id: crypto.randomUUID(),
        stringIndex: si as GuitarStringIndex,
        fret, startBeat: cursorBeat, durationBeats: noteDuration, velocity: 0.8,
      }
      addNote(note)
      setCursorBeat(c => c + noteDuration)
    }
  }, [isPlaying, sound, track.capo, cursorBeat, noteDuration, addNote])

  const handleNotePreview = useCallback((si: GuitarStringIndex, fret: number) => {
    previewNote(si, fret, sound, track.capo)
  }, [sound, track.capo])

  // ── Active frets for fretboard ────────────────────────────────────────────
  const activeFrets: (number | null)[] = useMemo(() => {
    const result: (number | null)[] = Array(6).fill(null)
    for (const n of track.notes) {
      if (currentBeat >= n.startBeat && currentBeat < n.startBeat + n.durationBeats) {
        result[n.stringIndex] = n.fret
      }
    }
    return result
  }, [track.notes, currentBeat])

  // ── Note editing via context menu ─────────────────────────────────────────
  const selectedNote = track.notes.find(n => n.id === selectedNoteId) ?? null

  const handleLongPress = useCallback((noteId: string, x: number, y: number) => {
    setCtxMenu({ x, y, noteId })
  }, [])

  const handleFretChange = useCallback((fret: number) => {
    if (!selectedNoteId) return
    beginEdit()
    updateNote(selectedNoteId, { fret, muted: false })
    previewNote(selectedNote?.stringIndex ?? 0, fret, sound, track.capo)
  }, [selectedNoteId, selectedNote, sound, track.capo, beginEdit, updateNote])

  /** Sets the length of the next notes and, when a note is selected, of that note too. */
  const handleNoteDurationChange = useCallback((beats: number) => {
    setNoteDuration(beats)
    if (!selectedNote) return
    const others = track.notes.filter(n => n.id !== selectedNote.id)
    const safe = clampDuration(others, selectedNote.stringIndex, selectedNote.startBeat, beats, track.totalBars * track.beatsPerBar)
    if (safe <= 0 || safe === selectedNote.durationBeats) return
    beginEdit()
    updateNote(selectedNote.id, { durationBeats: safe })
  }, [selectedNote, track.notes, track.totalBars, track.beatsPerBar, beginEdit, updateNote])

  const handleTechniqueChange = useCallback((technique: GuitarTechnique | undefined) => {
    if (!selectedNoteId) return
    beginEdit()
    updateNote(selectedNoteId, { technique })
  }, [selectedNoteId, beginEdit, updateNote])

  // ── Chords ────────────────────────────────────────────────────────────────
  const handleInsertChord = useCallback((chord: ChordShape) => {
    beginEdit()
    for (const n of chord.notes) {
      if (!n) continue
      addNote({
        id: crypto.randomUUID(),
        stringIndex: n.stringIndex as GuitarStringIndex,
        fret: n.fret, startBeat: cursorBeat, durationBeats: noteDuration, velocity: 0.8,
      })
    }
    setCursorBeat(c => c + noteDuration)
  }, [beginEdit, addNote, cursorBeat, noteDuration])

  // ── Recording ─────────────────────────────────────────────────────────────
  const handleRecordingComplete = useCallback((notes: GuitarNote[]) => {
    beginEdit()
    setTrack(t => ({ ...t, notes }))
    setShowRecording(false)
    showToast(`Recorded ${notes.length} note${notes.length !== 1 ? 's' : ''}`)
  }, [beginEdit, setTrack])

  // ── MIDI import ───────────────────────────────────────────────────────────
  const handleMidiImport = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const buf = e.target!.result as ArrayBuffer
        const result = importMidiFile(buf, file.name.replace(/\.mid$/i, ''))
        stopPlayback(); setIsPlaying(false)
        setTrack(result.track)
        resetHistory()
        const removed = result.totalRaw - result.noteCount - result.skipped
        const msg = `Imported ${result.noteCount} notes`
          + (removed > 0 ? ` — ${removed} drums/other tracks removed` : '')
          + (result.noteCount >= 400 ? ' (capped at 400)' : '')
        showToast(msg)
      } catch {
        showToast('Error reading MIDI file — is it a valid .mid?')
      }
    }
    reader.readAsArrayBuffer(file)
  }, [setTrack])

  // ── GP import ────────────────────────────────────────────────────────────
  const handleGpImport = useCallback((file: File) => {
    const reader = new FileReader()
    showToast('Parsing file…')
    reader.onload = async (e) => {
      try {
        const buf = e.target!.result as ArrayBuffer
        const partial = await parseGpFile(buf)
        stopPlayback(); setIsPlaying(false)
        setTrack(t => ({ ...t, ...partial }))
        resetHistory()
        showToast(`Imported ${partial.notes?.length ?? 0} notes from ${partial.name ?? 'file'}`)
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Error parsing file')
      }
    }
    reader.readAsArrayBuffer(file)
  }, [setTrack])

  // ── Text view ─────────────────────────────────────────────────────────────
  /**
   * The playhead as a getter, so the text view's cursor can run on its own
   * animation frame instead of re-rendering this component sixty times a
   * second — the rule the drum tab's grid and score already follow.
   */
  const beatRef = useRef(0)
  beatRef.current = currentBeat
  const getBeat = useCallback(() => beatRef.current, [])

  /**
   * Applied on blur or with Apply, and idempotent: a tab describing the notes
   * already in the track does nothing and records no undo step. That matters
   * because Apply fires twice for one click — the button blurs the textarea
   * first — and comparing the music is the only guard a stale closure cannot
   * slip past.
   */
  const applyTabText = useCallback((notes: StringNote[], bars: number) => {
    const next: GuitarNote[] = notes.map((n, i) => ({
      id: n.id ?? `txt-${Date.now().toString(36)}-${i}`,
      stringIndex: n.stringIndex as GuitarStringIndex,
      fret: n.fret,
      startBeat: n.startBeat,
      durationBeats: n.durationBeats,
      velocity: n.velocity,
      technique: n.technique as GuitarNote['technique'],
      muted: n.muted,
    }))
    if (
      bars === track.totalBars &&
      stringNotesSignature(next) === stringNotesSignature(track.notes)
    ) return
    beginEdit()
    setTrack(t => ({ ...t, notes: next, totalBars: bars }))
  }, [track.notes, track.totalBars, beginEdit, setTrack])

  // ── Export ────────────────────────────────────────────────────────────────
  const handleExportAscii = useCallback(async () => {
    const ascii = toAsciiTab(track)
    const ok = await copyToClipboard(ascii)
    showToast(ok ? 'ASCII tab copied to clipboard!' : 'Could not copy — try again')
  }, [track])

  const handleExportMidi = useCallback(() => {
    const bytes = exportMidiFile(track)
    const blob  = new Blob([bytes.buffer as ArrayBuffer], { type: 'audio/midi' })
    const url   = URL.createObjectURL(blob)
    const a     = document.createElement('a')
    a.href = url; a.download = `${track.name || 'guitar-tab'}.mid`
    a.click(); URL.revokeObjectURL(url)
  }, [track])

  // ── Export as image ───────────────────────────────────────────────────────
  const handleExportImage = useCallback((format: 'svg' | 'png') => {
    const svgEl = document.querySelector('[data-export-svg] svg') as SVGSVGElement | null
      ?? document.querySelector('svg[data-export-svg]') as SVGSVGElement | null
    if (!svgEl) {
      showToast('Switch to Tab or Notation view to export')
      return
    }
    svgEl.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    const w = svgEl.width.baseVal.value || svgEl.getBoundingClientRect().width
    const h = svgEl.height.baseVal.value || svgEl.getBoundingClientRect().height
    bg.setAttribute('width', String(w)); bg.setAttribute('height', String(h)); bg.setAttribute('fill', '#ffffff')
    svgEl.insertBefore(bg, svgEl.firstChild)
    const svgStr = new XMLSerializer().serializeToString(svgEl)
    svgEl.removeChild(bg)
    if (format === 'svg') {
      const blob = new Blob([svgStr], { type: 'image/svg+xml' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `${track.name || 'guitar-tab'}.svg`
      a.click(); URL.revokeObjectURL(url)
      showToast('SVG downloaded!')
      return
    }
    const encoded = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr)
    const img = new window.Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = w * 2; canvas.height = h * 2
      const c = canvas.getContext('2d')!
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, canvas.width, canvas.height)
      c.scale(2, 2); c.drawImage(img, 0, 0)
      canvas.toBlob(blob => {
        if (!blob) { showToast('PNG export failed'); return }
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a'); a.href = url; a.download = `${track.name || 'guitar-tab'}.png`
        a.click(); URL.revokeObjectURL(url)
        showToast('PNG downloaded!')
      })
    }
    img.src = encoded
  }, [track.name])

  // ── Bars change ───────────────────────────────────────────────────────────
  const handleBarsChange = useCallback((bars: number) => {
    setTrack(t => ({ ...t, totalBars: Math.max(1, bars) }))
  }, [setTrack])

  // ── String mute/solo helpers ──────────────────────────────────────────────
  const toggleMute = useCallback((si: number) => {
    setMutedStrings(prev => {
      const next = [...prev]
      next[si] = !next[si]
      if (next[si]) { // muting clears solo
        setSoloedStrings(s => { const n = [...s]; n[si] = false; return n })
      }
      return next
    })
  }, [])

  const toggleSolo = useCallback((si: number) => {
    setSoloedStrings(prev => {
      const next = [...prev]
      next[si] = !next[si]
      if (next[si]) { // soloing clears mute on that string
        setMutedStrings(s => { const n = [...s]; n[si] = false; return n })
      }
      return next
    })
  }, [])

  // ── Click outside context menu ────────────────────────────────────────────
  useEffect(() => {
    if (!ctxMenu) return
    const close = () => setCtxMenu(null)
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [ctxMenu])

  // ── Keyboard ──────────────────────────────────────────────────────────────
  // Editor-wide keys. The views keep their own (the tab's fret digits, x, arrows,
  // Enter, Backspace; the grid's copy/paste) — anything a view already handled
  // arrives here with defaultPrevented and is left alone. Nothing fires while
  // typing in a field, so the Text view's textarea and the BPM box stay plain.
  const [showKeys, setShowKeys] = useState(false)
  const keyHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {})
  // Held +/− repeats faster than React re-renders, so the tempo steps from a ref.
  const bpmRef = useRef(track.bpm)
  bpmRef.current = track.bpm
  const stepBpm = (delta: number) => {
    const next = Math.max(20, Math.min(300, bpmRef.current + delta))
    bpmRef.current = next
    handleBpmChange(next, isPlaying)
  }
  keyHandlerRef.current = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null
    const typing = !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))
    if (typing || showRecording || showSongLibrary) return

    const mod = e.ctrlKey || e.metaKey
    const k = e.key

    if (k === 'Escape') {
      if (showKeys || menu || inspectorOpen || ctxMenu) {
        setShowKeys(false); setMenu(null); setInspectorOpen(false); setCtxMenu(null)
        e.preventDefault()
      } else if (!e.defaultPrevented && selectedNoteId) {
        setSelectedNoteId(null)
      }
      return
    }
    if (e.defaultPrevented) return

    if (mod && !e.altKey) {
      const lower = k.toLowerCase()
      if (lower === 'z' && !e.shiftKey) { e.preventDefault(); if (canUndo) handleUndo() }
      else if (lower === 'y' || (lower === 'z' && e.shiftKey)) { e.preventDefault(); if (canRedo) handleRedo() }
      return
    }
    if (e.altKey) return

    switch (k) {
      case ' ':
        // Also stops a focused button from being "clicked" by the space bar.
        e.preventDefault()
        if (isPlaying || isCountingIn) handleStop(); else handlePlay()
        return
      case 'Home':
        e.preventDefault(); handleRewind(); return
      case 'l': case 'L':
        setLoop(v => !v); return
      case 'm': case 'M':
        setMetronome(v => !v); return
      case '+': case '=':
        e.preventDefault(); stepBpm(1); return
      case '-': case '_':
        e.preventDefault(); stepBpm(-1); return
      case '[': case ']': {
        // Shorter / longer note: steps through the inspector's durations.
        const order = [0.25, 0.5, 1, 2, 4]
        const current = selectedNote?.durationBeats ?? noteDuration
        const i = order.findIndex(v => v >= current - 1e-6)
        const next = order[Math.max(0, Math.min(order.length - 1, (i < 0 ? 2 : i) + (k === ']' ? 1 : -1)))]
        e.preventDefault(); handleNoteDurationChange(next); return
      }
      case 'Delete': case 'Backspace':
        if (selectedNoteId && !isPlaying) { e.preventDefault(); deleteNote(selectedNoteId); setSelectedNoteId(null) }
        return
      case '?':
        e.preventDefault(); setShowKeys(v => !v); return
    }
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyHandlerRef.current(e)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ── Menus close on any outside press ──────────────────────────────────────
  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [menu])

  const totalBeats = track.totalBars * track.beatsPerBar
  const fretboardView = viewMode === 'tab' || viewMode === 'grid'
  const maxFret = track.notes.reduce((m, n) => (n.fret > m ? n.fret : m), 0)
  const trackName  = track.name || 'New Guitar Tab'
  const meta = [
    `${track.beatsPerBar}/4`,
    track.capo ? `Capo ${track.capo}` : null,
    `${track.totalBars} ${track.totalBars === 1 ? 'bar' : 'bars'}`,
    `${track.notes.length} ${track.notes.length === 1 ? 'note' : 'notes'}`,
  ].filter(Boolean).join(' · ')

  const inspector = (
    <GuitarInspector
      selectedNote={selectedNote}
      beatsPerBar={track.beatsPerBar}
      noteDuration={noteDuration}
      onNoteDurationChange={handleNoteDurationChange}
      onFretChange={handleFretChange}
      onTechniqueChange={handleTechniqueChange}
      sound={sound}
      onSoundChange={setSound}
      capo={track.capo}
      onCapoChange={handleCapoChange}
      onBeatsPerBarChange={handleBeatsPerBarChange}
      totalBars={track.totalBars}
      onBarsChange={handleBarsChange}
      mutedStrings={mutedStrings}
      soloedStrings={soloedStrings}
      onToggleMute={toggleMute}
      onToggleSolo={toggleSolo}
      onResetStrings={() => { setMutedStrings(Array(6).fill(false)); setSoloedStrings(Array(6).fill(false)) }}
      onInsertChord={handleInsertChord}
      onClearAll={handleClearAll}
    />
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', minHeight: 0, background: T.bg, fontFamily: T.sans, color: T.text }}>

      {/* ── Top bar ── */}
      <div style={{ flexShrink: 0, height: 52, display: 'flex', alignItems: 'center', gap: isCompact ? 4 : 10, padding: isCompact ? '0 8px' : '0 20px', borderBottom: `1px solid ${T.border}`, background: T.bg }}>
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', flexShrink: 0 }} title="ChordSequence home">
          <div style={{ width: 26, height: 26, borderRadius: 7, background: T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
            </svg>
          </div>
          {!isCompact && <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.025em', color: T.text }}>ChordSequence</span>}
        </a>
        {!isCompact && <>
          <span style={{ color: T.borderStrong, fontWeight: 300 }}>/</span>
          <a href="/tools/guitar-tab/" style={{ fontSize: 13, color: T.muted, textDecoration: 'none', whiteSpace: 'nowrap' }}>Guitar Tab</a>
        </>}

        <div style={{ flex: 1 }} />

        <button title="Undo (Ctrl+Z)" onClick={handleUndo} disabled={!canUndo} style={iconBtn(false, !canUndo)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13"/></svg>
        </button>
        <button title="Redo (Ctrl+Y)" onClick={handleRedo} disabled={!canRedo} style={iconBtn(false, !canRedo)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 019-9 9 9 0 016 2.3l3 2.7"/></svg>
        </button>
        {!isCompact && (
          <button title="Keyboard shortcuts (?)" onClick={() => setShowKeys(v => !v)} style={iconBtn(showKeys)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M18 13h.01M8 16h8"/></svg>
          </button>
        )}
        {!isCompact && <div style={{ width: 1, height: 20, background: T.border, margin: '0 4px' }} />}

        {GUITAR_PRESETS.length > 0 && (
          <button onClick={() => setShowSongLibrary(true)} title="Load a preset song" style={textBtn}>Songs</button>
        )}
        <div style={{ position: 'relative' }} onPointerDown={e => e.stopPropagation()}>
          <button onClick={() => setMenu(m => m === 'import' ? null : 'import')} style={textBtn}>Import</button>
          {menu === 'import' && (
            <Menu>
              <MenuItem label="Import MIDI…" onClick={() => { setMenu(null); midiInputRef.current?.click() }} />
              <MenuItem label="Import .gp / .gpx…" onClick={() => { setMenu(null); gpInputRef.current?.click() }} />
              <MenuItem label="Record from fretboard…" onClick={() => { setMenu(null); if (!isPlaying) setShowRecording(true) }} />
            </Menu>
          )}
        </div>
        <div style={{ position: 'relative' }} onPointerDown={e => e.stopPropagation()}>
          <button
            onClick={() => setMenu(m => m === 'export' ? null : 'export')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, height: 32, padding: isCompact ? '0 10px' : '0 14px', borderRadius: 8, border: 'none', background: T.accent, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export
          </button>
          {menu === 'export' && (
            <Menu>
              <MenuItem label="Copy as ASCII tab" onClick={() => { setMenu(null); handleExportAscii() }} />
              <MenuItem label="Download MIDI" onClick={() => { setMenu(null); handleExportMidi() }} />
              <MenuItem label="Download SVG" onClick={() => { setMenu(null); handleExportImage('svg') }} />
              <MenuItem label="Download PNG" onClick={() => { setMenu(null); handleExportImage('png') }} />
            </Menu>
          )}
        </div>
        {isCompact && (
          <button title="Note, track and chords" onClick={() => setInspectorOpen(true)} style={iconBtn(inspectorOpen)}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>
          </button>
        )}
      </div>

      {/* Hidden file inputs */}
      <input
        ref={midiInputRef}
        type="file" accept=".mid,.midi" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleMidiImport(f); e.target.value = '' }}
      />
      <input
        ref={gpInputRef}
        type="file" accept=".gp,.gp3,.gp4,.gp5,.gpx,.gp7" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleGpImport(f); e.target.value = '' }}
      />

      {/* ── Views on a phone: a row of tabs instead of the rail */}
      {isCompact && (
        <div style={{ flexShrink: 0, display: 'flex', gap: 2, padding: '6px 10px', borderBottom: `1px solid ${T.border}`, overflowX: 'auto' }}>
          {VIEWS.map(v => (
            <button key={v.id} onClick={() => setViewMode(v.id)} style={railBtn(viewMode === v.id, true)}>{v.label}</button>
          ))}
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>

        {/* ── View rail */}
        {!isCompact && (
          <nav aria-label="Views" style={{ width: 68, flexShrink: 0, borderRight: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '14px 0' }}>
            {VIEWS.map(v => (
              <button key={v.id} onClick={() => setViewMode(v.id)} style={railBtn(viewMode === v.id, false)}>{v.label}</button>
            ))}
          </nav>
        )}

        {/* ── Center: title, the view, the fretboard */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: isCompact ? 10 : 18, padding: isCompact ? '12px 10px 10px' : '22px 28px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', columnGap: 14, rowGap: 4, flexWrap: 'wrap', minWidth: 0 }}>
            {editingName ? (
              <input
                autoFocus
                defaultValue={track.name}
                onBlur={e => { setTrack(t => ({ ...t, name: e.target.value.trim() || 'New Guitar Tab' })); setEditingName(false) }}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur() }}
                style={{ fontSize: isCompact ? 18 : 22, fontWeight: 700, letterSpacing: '-0.02em', color: T.text, border: 'none', borderBottom: `2px solid ${T.accent}`, outline: 'none', padding: 0, background: 'transparent', fontFamily: T.sans, minWidth: 0, width: 'min(420px, 100%)' }}
              />
            ) : (
              <span
                onClick={() => setEditingName(true)}
                title="Click to rename"
                style={{ fontSize: isCompact ? 18 : 22, fontWeight: 700, letterSpacing: '-0.02em', cursor: 'text', minWidth: 0, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >{trackName}</span>
            )}
            <span style={{ fontSize: 12, color: T.muted }}>{meta}</span>
            <div style={{ flex: 1 }} />
            <div style={{ display: 'flex', gap: 2, alignSelf: 'center' }}>
              {fretboardView && <Toggle label="Fretboard" on={showFretboard} onClick={() => setShowFretboard(v => !v)} />}
              <Toggle label="Colors" on={noteColors} onClick={() => setNoteColors(v => !v)} />
              <Toggle label="−" title="Zoom out" onClick={() => setZoom(z => Math.max(0.3, z - 0.2))} />
              <Toggle label="+" title="Zoom in" onClick={() => setZoom(z => Math.min(4, z + 0.2))} />
            </div>
          </div>

          {/* Main editor view — the tab is one fixed-height strip, so it keeps its own height
              and the fretboard sits at the bottom, as in the design; the others fill the column */}
          <div style={{ flex: viewMode === 'tab' ? '0 1 auto' : 1, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative', border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden', background: T.bg }}>
            {viewMode === 'tab' ? (
              <GuitarTabView
                track={track}
                zoom={zoom}
                currentBeat={currentBeat}
                cursorBeat={cursorBeat}
                isPlaying={isPlaying}
                selectedNoteId={selectedNoteId}
                sound={sound}
                noteColors={noteColors}
                onAddNote={addNote}
                onUpdateNote={updateNote}
                onDeleteNote={deleteNote}
                onSelectNote={setSelectedNoteId}
                onCursorBeatChange={setCursorBeat}
                onBeginEdit={beginEdit}
                onNotePreview={handleNotePreview}
                noteDuration={noteDuration}
                onNoteDurationChange={setNoteDuration}
                noteToolsElsewhere={!isCompact}
              />
            ) : viewMode === 'grid' ? (
              <GuitarTabGrid
                track={track}
                zoom={zoom}
                currentBeat={currentBeat}
                cursorBeat={cursorBeat}
                isPlaying={isPlaying}
                selectedNoteId={selectedNoteId}
                onAddNote={addNote}
                onUpdateNote={updateNote}
                onDeleteNote={deleteNote}
                onSelectNote={setSelectedNoteId}
                onCursorBeatChange={setCursorBeat}
                onZoomChange={setZoom}
                onBeginEdit={beginEdit}
                onNotePreview={handleNotePreview}
                onLongPressNote={handleLongPress}
              />
            ) : viewMode === 'notation' ? (
              <GuitarNotationView
                track={track}
                zoom={zoom}
                isPlaying={isPlaying}
                currentBeat={currentBeat}
                getBeat={getBeat}
              />
            ) : viewMode === 'text' ? (
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 12 }}>
                <StringTabText
                  track={track}
                  labels={STRING_NAMES}
                  storageKey={TEXT_FORMAT_KEY}
                  onApply={applyTabText}
                  getBeat={getBeat}
                  isPlaying={isPlaying}
                  onSeekBeat={setCursorBeat}
                />
              </div>
            ) : (
              <GuitarPhotoFretboard
                activeFrets={activeFrets}
                attackSignals={attackSignals}
              />
            )}

            {/* Count-in overlay */}
            {isCountingIn && countdownBeat !== null && (
              <div style={{
                position: 'absolute', inset: 0,
                background: 'rgba(255,255,255,0.82)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                zIndex: 20, pointerEvents: 'none',
              }}>
                <div style={{
                  fontSize: 80, fontWeight: 900, color: T.accent,
                  lineHeight: 1, fontFamily: T.sans,
                  animation: 'countInPulse 0.08s ease-out',
                }}>
                  {countdownBeat}
                </div>
                <div style={{ fontSize: 13, color: T.muted, marginTop: 10, letterSpacing: '0.1em', fontWeight: 600 }}>
                  COUNT IN
                </div>
              </div>
            )}
          </div>

          {viewMode === 'tab' && <div style={{ flex: 1 }} />}

          {/* Fretboard — only under the views you edit in; Score and Text are for reading and need the height */}
          {showFretboard && fretboardView && (
            <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {!isCompact && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={sectionLabel}>Fretboard</span>
                  <span style={{ fontSize: 11, color: T.muted }}>Tap a fret to place a note at the cursor</span>
                </div>
              )}
              <div style={{ borderRadius: 10, overflow: 'hidden' }}>
                <GuitarTabNeck
                  activeFrets={activeFrets}
                  attackSignals={attackSignals}
                  onNoteClick={handleFretboardClick}
                  selected={isPlaying ? null : selectedNote}
                  maxFret={maxFret}
                  height={isCompact ? 200 : 236}
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Inspector */}
        {!isCompact && (
          <aside aria-label="Note, track and chords" style={{ width: 272, flexShrink: 0, borderLeft: `1px solid ${T.border}`, background: T.panel, overflowY: 'auto' }}>
            {inspector}
          </aside>
        )}
      </div>

      {/* ── Transport */}
      <GuitarTransport
        isPlaying={isPlaying || isCountingIn}
        loop={loop}
        metronome={metronome}
        countIn={countIn}
        bpm={track.bpm}
        playbackSpeed={playbackSpeed}
        volume={volume}
        currentBeat={currentBeat}
        totalBeats={totalBeats}
        beatsPerBar={track.beatsPerBar}
        loopRange={loopRange}
        compact={isCompact}
        onPlay={handlePlay}
        onStop={handleStop}
        onRewind={handleRewind}
        onLoopToggle={() => setLoop(l => !l)}
        onMetronomeToggle={() => setMetronome(m => !m)}
        onCountInChange={setCountIn}
        onBpmChange={bpm => handleBpmChange(bpm, isPlaying)}
        onSpeedChange={setPlaybackSpeed}
        onVolumeChange={setVolume}
        onSeek={handleSeek}
        onLoopRangeChange={setLoopRange}
      />

      {/* Inspector as a drawer on a phone */}
      {isCompact && inspectorOpen && (
        <div onClick={() => setInspectorOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', zIndex: 90 }}>
          <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 'min(320px, 88vw)', background: T.panel, borderLeft: `1px solid ${T.border}`, overflowY: 'auto', boxShadow: '-8px 0 24px rgba(15,23,42,0.12)' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px 10px 0' }}>
              <button title="Close" onClick={() => setInspectorOpen(false)} style={iconBtn()}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            {inspector}
          </div>
        </div>
      )}

      {/* Keyboard shortcuts */}
      {showKeys && (
        <div onClick={() => setShowKeys(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', zIndex: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div role="dialog" aria-label="Keyboard shortcuts" onClick={e => e.stopPropagation()} style={{ width: 'min(560px, 100%)', maxHeight: '100%', overflowY: 'auto', background: T.bg, borderRadius: 14, boxShadow: '0 20px 48px rgba(15,23,42,0.25)', padding: '20px 22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>Keyboard shortcuts</span>
              <button title="Close (Esc)" onClick={() => setShowKeys(false)} style={iconBtn()}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '18px 28px' }}>
              {SHORTCUTS.map(group => (
                <div key={group.title} style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <span style={sectionLabel}>{group.title}</span>
                  {group.items.map(([keys, label]) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, fontSize: 13, color: T.text2 }}>
                      <span>{label}</span>
                      <span style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        {keys.map(key => (
                          <kbd key={key} style={{ minWidth: 22, height: 22, padding: '0 6px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 5, border: `1px solid ${T.border}`, borderBottomWidth: 2, background: T.panel, fontFamily: T.mono, fontSize: 11, color: T.text }}>{key}</kbd>
                        ))}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Song library modal */}
      {showSongLibrary && (
        <GuitarSongLibrary
          onSelect={preset => { handleLoadPreset(preset); setShowSongLibrary(false); showToast(`Loaded "${preset.name}"`) }}
          onClose={() => setShowSongLibrary(false)}
        />
      )}

      {/* Recording overlay */}
      {showRecording && (
        <GuitarRecordingOverlay
          track={track}
          sound={sound}
          onComplete={handleRecordingComplete}
          onCancel={() => setShowRecording(false)}
        />
      )}

      {/* Context menu */}
      {ctxMenu && (
        <div
          onPointerDown={e => e.stopPropagation()}
          style={{ position: 'fixed', left: ctxMenu.x + 8, top: ctxMenu.y - 50, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 12, zIndex: 100, display: 'flex', alignItems: 'center', gap: 10 }}
        >
          <span style={{ fontSize: 11, color: T.muted }}>Fret</span>
          <input
            type="number" min={0} max={24}
            defaultValue={track.notes.find(n => n.id === ctxMenu.noteId)?.fret ?? 0}
            autoFocus
            style={{ width: 52, height: 30, textAlign: 'center', border: `1px solid ${T.accent}`, borderRadius: 6, fontSize: 14, fontWeight: 700, color: T.accentText }}
            onChange={e => {
              const v = Math.max(0, Math.min(24, parseInt(e.target.value, 10) || 0))
              updateNote(ctxMenu.noteId, { fret: v })
            }}
          />
          <button
            onClick={() => { deleteNote(ctxMenu.noteId); setCtxMenu(null) }}
            style={{ height: 30, padding: '0 10px', borderRadius: 6, border: '1px solid #fee2e2', background: '#fff1f1', color: T.danger, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
          >
            Delete
          </button>
        </div>
      )}

      {/* Toast — above the transport */}
      {toastMsg && (
        <div style={{ position: 'fixed', bottom: 96, left: '50%', transform: 'translateX(-50%)', background: T.text, color: '#f8fafc', padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 500, boxShadow: '0 4px 16px rgba(0,0,0,0.2)', zIndex: 200, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
          {toastMsg}
        </div>
      )}

      {/* Count-in pulse animation */}
      <style>{`@keyframes countInPulse { from { transform: scale(1.3); opacity: 0.5 } to { transform: scale(1); opacity: 1 } }`}</style>
    </div>
  )
}

type ViewMode = 'tab' | 'grid' | 'notation' | 'fretboard' | 'text'

/** The rail, top to bottom. "Score" is the notation view; "Guitar" the photo fretboard. */
const VIEWS: { id: ViewMode; label: string }[] = [
  { id: 'tab',       label: 'Tab' },
  { id: 'notation',  label: 'Score' },
  { id: 'grid',      label: 'Grid' },
  { id: 'fretboard', label: 'Guitar' },
  { id: 'text',      label: 'Text' },
]

const MOD = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'

/** What the shortcuts panel lists — kept next to the handler's cases. */
const SHORTCUTS: { title: string; items: [string[], string][] }[] = [
  { title: 'Playback', items: [
    [['Space'], 'Play / stop'],
    [['Home'], 'Back to start'],
    [['L'], 'Loop on / off'],
    [['M'], 'Metronome on / off'],
    [['+', '−'], 'Tempo up / down'],
  ] },
  { title: 'Editing', items: [
    [[MOD, 'Z'], 'Undo'],
    [[MOD, 'Y'], 'Redo'],
    [['[', ']'], 'Shorter / longer note'],
    [['Del'], 'Delete selected note'],
    [['Esc'], 'Deselect · close'],
  ] },
  { title: 'In the Tab view', items: [
    [['0–24'], 'Type a fret at the cursor'],
    [['X'], 'Muted note'],
    [['←', '→'], 'Move along the bar'],
    [['↑', '↓'], 'Change string'],
    [['Enter'], 'Next position'],
  ] },
  { title: 'Help', items: [
    [['?'], 'Show these shortcuts'],
  ] },
]

/** Below this width the rail becomes a row of tabs and the inspector a drawer. */
const COMPACT_QUERY = '(max-width: 900px)'

function useIsCompact(): boolean {
  const [compact, setCompact] = useState(() => typeof window !== 'undefined' && window.matchMedia(COMPACT_QUERY).matches)
  useEffect(() => {
    const mq = window.matchMedia(COMPACT_QUERY)
    const on = () => setCompact(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return compact
}

const textBtn: React.CSSProperties = {
  height: 32, padding: '0 10px', borderRadius: 7, border: 'none', background: 'transparent',
  fontSize: 13, color: T.text2, cursor: 'pointer', fontFamily: T.sans, whiteSpace: 'nowrap',
}

function railBtn(active: boolean, horizontal: boolean): React.CSSProperties {
  return {
    width: horizontal ? 'auto' : 52, height: horizontal ? 30 : 40, padding: horizontal ? '0 12px' : 0,
    borderRadius: 8, border: 'none', flexShrink: 0, cursor: 'pointer', fontFamily: T.sans,
    fontSize: horizontal ? 12 : 11, fontWeight: 600,
    background: active ? T.accentSoft : 'transparent',
    color: active ? T.accentText : T.muted,
  }
}

/** A dot-and-label switch, as in the design's view toggles. Without `on` it is a plain action. */
function Toggle({ label, on, title, onClick }: { label: string; on?: boolean; title?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-pressed={on}
      style={{ display: 'flex', alignItems: 'center', gap: 6, height: 28, minWidth: 28, justifyContent: 'center', padding: '0 9px', borderRadius: 7, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: on === undefined ? 15 : 12, fontWeight: 500, fontFamily: T.sans, color: on === false ? T.muted : T.text }}
      onMouseEnter={e => (e.currentTarget.style.background = T.well)}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      {on !== undefined && <span style={{ width: 6, height: 6, borderRadius: 999, background: on ? T.accent : T.borderStrong }} />}
      {label}
    </button>
  )
}

function Menu({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 6, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 10, boxShadow: '0 8px 24px rgba(15,23,42,0.12)', padding: 6, zIndex: 60, minWidth: 190, display: 'flex', flexDirection: 'column', gap: 2 }}>
      {children}
    </div>
  )
}

function MenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{ padding: '8px 12px', borderRadius: 6, border: 'none', background: 'transparent', color: T.text2, fontSize: 13, textAlign: 'left', cursor: 'pointer', width: '100%', fontFamily: T.sans }}
      onMouseEnter={e => (e.currentTarget.style.background = T.panel)}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      {label}
    </button>
  )
}
