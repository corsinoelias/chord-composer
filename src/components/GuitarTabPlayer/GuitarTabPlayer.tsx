import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import type { GuitarNote, GuitarTrack, GuitarSound, GuitarStringIndex, LoopRange } from '../../lib/guitarTab/types'
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
import { GuitarFretboard } from './GuitarFretboard'
import { GuitarPhotoFretboard } from './GuitarPhotoFretboard'
import { GuitarTransport } from './GuitarTransport'
import { GuitarChordHelper } from './GuitarChordHelper'
import { GuitarSeekBar } from './GuitarSeekBar'
import { GuitarNotationView } from './GuitarNotationView'
import { GuitarRecordingOverlay } from './GuitarRecordingOverlay'
import { GuitarSongLibrary } from './GuitarSongLibrary'
import { GUITAR_PRESETS } from '../../data/guitarPresets'

const STORAGE_KEY = 'guitar-tab-track-v1'

const STRING_COLORS = ['#0284c7','#7c3aed','#059669','#d97706','#ea580c','#dc2626']
const STRING_NAMES  = ['e','B','G','D','A','E']

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
  const [showChordHelper, setShowChordHelper] = useState(true)
  const [showFretboard, setShowFretboard]     = useState(true)
  const [viewMode, setViewMode]       = useState<'tab' | 'grid' | 'notation' | 'fretboard' | 'text'>('tab')
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
  const [showMixer, setShowMixer]         = useState(false)

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
        fret, startBeat: cursorBeat, durationBeats: 1, velocity: 0.8,
      }
      addNote(note)
      setCursorBeat(c => c + 1)
    }
  }, [isPlaying, sound, track.capo, cursorBeat, addNote])

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
    updateNote(selectedNoteId, { fret })
    previewNote(selectedNote?.stringIndex ?? 0, fret, sound, track.capo)
  }, [selectedNoteId, selectedNote, sound, track.capo, updateNote])

  // ── Chord helper ──────────────────────────────────────────────────────────
  const handleInsertChord = useCallback((notes: GuitarNote[]) => {
    beginEdit()
    notes.forEach(n => addNote(n))
    setCursorBeat(c => c + 1)
  }, [beginEdit, addNote])

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

  const totalBeats = track.totalBars * track.beatsPerBar
  const soloActive = soloedStrings.some(Boolean)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', minHeight: 0, background: '#ffffff', fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif", color: '#1e293b' }}>

      {/* ── Navigation bar ── */}
      <div style={{
        flexShrink: 0, height: 50,
        background: 'hsl(224 20% 8%)',
        borderBottom: '1px solid hsl(224 15% 18%)',
        display: 'flex', alignItems: 'center', gap: 8,
        paddingLeft: 16, paddingRight: 16,
        fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
      }}>
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

        <span style={{ color: 'hsl(224 15% 35%)', fontSize: 14, fontWeight: 300, flexShrink: 0 }}>/</span>
        <a href="/tools/"
          style={{ fontSize: 13, color: 'hsl(220 10% 48%)', textDecoration: 'none', flexShrink: 0, transition: 'color 0.12s' }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'hsl(220 10% 68%)'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'hsl(220 10% 48%)'}
        >Tools</a>
        <span style={{ color: 'hsl(224 15% 30%)', fontSize: 14, fontWeight: 300, flexShrink: 0 }}>/</span>

        <span style={{
          fontSize: 12, fontWeight: 500, color: 'hsl(262 60% 75%)',
          background: 'hsl(262 40% 15%)', padding: '2px 9px', borderRadius: 20,
          border: '1px solid hsl(262 40% 22%)', flexShrink: 0,
        }}>Guitar</span>

        <span style={{ color: 'hsl(224 15% 28%)', fontSize: 12, flexShrink: 0 }}>—</span>

        {editingName ? (
          <input
            autoFocus
            defaultValue={track.name}
            onBlur={e => { setTrack(t => ({ ...t, name: e.target.value.trim() || 'New Guitar Tab' })); setEditingName(false) }}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur() }}
            style={{
              background: 'hsl(224 18% 17%)', border: '1px solid hsl(262 50% 40%)', borderRadius: 6,
              color: 'hsl(220 14% 88%)', fontSize: 13, fontWeight: 500,
              padding: '2px 8px', outline: 'none', width: 180, maxWidth: 220,
              fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
            }}
          />
        ) : (
          <span
            onClick={() => setEditingName(true)}
            title="Click to rename"
            style={{
              fontSize: 13, fontWeight: 500, color: 'hsl(220 14% 68%)',
              cursor: 'text', padding: '2px 4px', borderRadius: 4,
              maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              transition: 'color 0.12s',
            }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'hsl(220 14% 88%)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'hsl(220 14% 68%)'}
          >{track.name || 'New Guitar Tab'}</span>
        )}

        <div style={{ flex: 1 }} />

        {GUITAR_PRESETS.length > 0 && (
          <button
            onClick={() => setShowSongLibrary(true)}
            title="Load a preset song"
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500,
              cursor: 'pointer', border: '1px solid hsl(224 15% 28%)',
              background: 'hsl(224 18% 14%)', color: 'hsl(220 10% 62%)',
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
        )}

        <span style={{
          fontSize: 11, color: 'hsl(220 10% 50%)',
          background: 'hsl(224 18% 14%)', padding: '2px 8px', borderRadius: 10,
          border: '1px solid hsl(224 15% 20%)',
        }}>
          {track.notes.length} {track.notes.length === 1 ? 'note' : 'notes'}
        </span>
      </div>

      {/* Transport */}
      <GuitarTransport
        isPlaying={isPlaying || isCountingIn}
        loop={loop}
        metronome={metronome}
        bpm={track.bpm}
        sound={sound}
        capo={track.capo}
        totalBars={track.totalBars}
        zoom={zoom}
        volume={volume}
        playbackSpeed={playbackSpeed}
        countIn={countIn}
        selectedNoteFret={selectedNote?.fret ?? null}
        hasSelectedNote={!!selectedNote}
        canUndo={canUndo}
        canRedo={canRedo}
        onPlay={handlePlay}
        onStop={handleStop}
        onRewind={handleRewind}
        onLoopToggle={() => setLoop(l => !l)}
        onMetronomeToggle={() => setMetronome(m => !m)}
        onBpmChange={bpm => handleBpmChange(bpm, isPlaying)}
        onSoundChange={setSound}
        onCapoChange={handleCapoChange}
        onBarsChange={handleBarsChange}
        onZoomIn={() => setZoom(z => Math.min(4, z + 0.2))}
        onZoomOut={() => setZoom(z => Math.max(0.3, z - 0.2))}
        onFretChange={handleFretChange}
        onVolumeChange={setVolume}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onClearAll={handleClearAll}
        onExportAscii={handleExportAscii}
        onExportMidi={handleExportMidi}
        onRecord={() => setShowRecording(true)}
        onImportMidi={() => midiInputRef.current?.click()}
        onImportGp={() => gpInputRef.current?.click()}
        onSpeedChange={setPlaybackSpeed}
        onCountInChange={setCountIn}
        onExportImage={handleExportImage}
      />

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

      {/* View toggles + string mixer toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', borderRadius: 7, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <ViewToggle label="Tab"      active={viewMode === 'tab'}      onClick={() => setViewMode('tab')}      style={{ borderRadius: 0, border: 'none' }} />
          <div style={{ width: 1, background: '#e2e8f0' }} />
          <ViewToggle label="Grid"     active={viewMode === 'grid'}     onClick={() => setViewMode('grid')}     style={{ borderRadius: 0, border: 'none' }} />
          <div style={{ width: 1, background: '#e2e8f0' }} />
          <ViewToggle label="Notation" active={viewMode === 'notation'} onClick={() => setViewMode('notation')} style={{ borderRadius: 0, border: 'none' }} />
          <div style={{ width: 1, background: '#e2e8f0' }} />
          <ViewToggle label="Guitar"   active={viewMode === 'fretboard'} onClick={() => setViewMode('fretboard')} style={{ borderRadius: 0, border: 'none' }} />
          <div style={{ width: 1, background: '#e2e8f0' }} />
          <ViewToggle label="Text"     active={viewMode === 'text'}     onClick={() => setViewMode('text')}     style={{ borderRadius: 0, border: 'none' }} />
        </div>
        <ViewToggle label="Fretboard" active={showFretboard}   onClick={() => setShowFretboard(v => !v)} />
        <ViewToggle label="Chords"    active={showChordHelper}  onClick={() => setShowChordHelper(v => !v)} />
        <ViewToggle label="Loop"      active={!!loopRange}      onClick={() => setLoopRange(r => r ? null : { startBeat: 0, endBeat: Math.ceil(totalBeats / 2) })} />
        <ViewToggle label="Colors"    active={noteColors}       onClick={() => setNoteColors(v => !v)} />
        <ViewToggle label="Mixer"     active={showMixer}        onClick={() => setShowMixer(v => !v)} />
      </div>

      {/* String mixer panel */}
      {showMixer && (
        <div style={{ flexShrink: 0, background: '#f8fafc', borderBottom: '1px solid #e2e8f0', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: 4 }}>Strings</span>
          {STRING_NAMES.map((name, si) => {
            const col   = STRING_COLORS[si]
            const muted = mutedStrings[si]
            const soloed = soloedStrings[si]
            const dimmed = (!soloed && soloActive) || muted
            return (
              <div key={si} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                <span style={{ fontFamily: 'ui-monospace,monospace', fontSize: 11, fontWeight: 700, color: dimmed ? '#cbd5e1' : col }}>{name}</span>
                <div style={{ display: 'flex', gap: 2 }}>
                  <button
                    onClick={() => toggleMute(si)}
                    title={muted ? 'Unmute' : 'Mute'}
                    style={{ width: 22, height: 18, fontSize: 9, fontWeight: 700, borderRadius: 3, border: `1px solid ${muted ? '#dc2626' : '#e2e8f0'}`, background: muted ? '#fee2e2' : '#fff', color: muted ? '#dc2626' : '#94a3b8', cursor: 'pointer', lineHeight: 1 }}
                  >M</button>
                  <button
                    onClick={() => toggleSolo(si)}
                    title={soloed ? 'Unsolo' : 'Solo'}
                    style={{ width: 22, height: 18, fontSize: 9, fontWeight: 700, borderRadius: 3, border: `1px solid ${soloed ? '#16a34a' : '#e2e8f0'}`, background: soloed ? '#dcfce7' : '#fff', color: soloed ? '#16a34a' : '#94a3b8', cursor: 'pointer', lineHeight: 1 }}
                  >S</button>
                </div>
              </div>
            )
          })}
          {(mutedStrings.some(Boolean) || soloActive) && (
            <button
              onClick={() => { setMutedStrings(Array(6).fill(false)); setSoloedStrings(Array(6).fill(false)) }}
              style={{ marginLeft: 8, fontSize: 10, color: '#7c3aed', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
            >Reset</button>
          )}
        </div>
      )}

      {/* Seek bar */}
      <GuitarSeekBar
        currentBeat={currentBeat}
        totalBeats={totalBeats}
        beatsPerBar={track.beatsPerBar}
        isPlaying={isPlaying}
        onSeek={handleSeek}
        loopRange={loopRange}
        onLoopRangeChange={setLoopRange}
      />

      {/* Fretboard */}
      {showFretboard && (
        <GuitarFretboard
          activeFrets={activeFrets}
          attackSignals={attackSignals}
          onNoteClick={handleFretboardClick}
          maxHeight={200}
        />
      )}

      {/* Main editor view */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
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
            background: 'rgba(0,0,0,0.55)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            zIndex: 20, pointerEvents: 'none',
          }}>
            <div style={{
              fontSize: 80, fontWeight: 900, color: '#ffffff',
              lineHeight: 1, fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
              textShadow: '0 0 40px rgba(124,58,237,0.8)',
              animation: 'countInPulse 0.08s ease-out',
            }}>
              {countdownBeat}
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 10, letterSpacing: '0.1em', fontWeight: 600 }}>
              COUNT IN
            </div>
          </div>
        )}
      </div>

      {/* Chord Helper */}
      {showChordHelper && (
        <GuitarChordHelper
          cursorBeat={cursorBeat}
          onInsertChord={handleInsertChord}
        />
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
          style={{ position: 'fixed', left: ctxMenu.x + 8, top: ctxMenu.y - 50, background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 12, zIndex: 100, display: 'flex', alignItems: 'center', gap: 10 }}
        >
          <span style={{ fontSize: 11, color: '#64748b' }}>Fret</span>
          <input
            type="number" min={0} max={24}
            defaultValue={track.notes.find(n => n.id === ctxMenu.noteId)?.fret ?? 0}
            autoFocus
            style={{ width: 52, height: 30, textAlign: 'center', border: '1px solid #7c3aed', borderRadius: 6, fontSize: 14, fontWeight: 700, color: '#7c3aed' }}
            onChange={e => {
              const v = Math.max(0, Math.min(24, parseInt(e.target.value, 10) || 0))
              updateNote(ctxMenu.noteId, { fret: v })
            }}
          />
          <button
            onClick={() => { deleteNote(ctxMenu.noteId); setCtxMenu(null) }}
            style={{ height: 30, padding: '0 10px', borderRadius: 6, border: '1px solid #fee2e2', background: '#fff1f1', color: '#dc2626', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
          >
            Delete
          </button>
        </div>
      )}

      {/* Toast */}
      {toastMsg && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#1e293b', color: '#f8fafc', padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 500, boxShadow: '0 4px 16px rgba(0,0,0,0.2)', zIndex: 200, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
          {toastMsg}
        </div>
      )}

      {/* Count-in pulse animation */}
      <style>{`@keyframes countInPulse { from { transform: scale(1.3); opacity: 0.5 } to { transform: scale(1); opacity: 1 } }`}</style>
    </div>
  )
}

function ViewToggle({ label, active, onClick, style: extraStyle }: { label: string; active: boolean; onClick: () => void; style?: React.CSSProperties }) {
  return (
    <button
      onClick={onClick}
      style={{ height: 26, padding: '0 10px', borderRadius: 6, border: `1px solid ${active ? '#7c3aed' : '#e2e8f0'}`, background: active ? '#ede9fe' : '#ffffff', color: active ? '#7c3aed' : '#64748b', fontSize: 11, fontWeight: 600, cursor: 'pointer', ...extraStyle }}
    >
      {label}
    </button>
  )
}
