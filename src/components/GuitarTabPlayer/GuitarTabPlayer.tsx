import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import type { GuitarNote, GuitarTrack, GuitarSound, GuitarStringIndex, LoopRange } from '../../lib/guitarTab/types'
import { DEFAULT_TRACK } from '../../lib/guitarTab/types'
import { startPlayback, stopPlayback, setMasterVolume, previewNote } from '../../lib/guitarTab/guitarAudio'
import { toAsciiTab, exportMidiFile, copyToClipboard } from '../../lib/guitarTab/exportTab'
import { importMidiFile } from '../../lib/guitarTab/midiImport'
import { useGuitarTrackEditor } from '../../hooks/useGuitarTrackEditor'
import { GuitarTabGrid } from './GuitarTabGrid'
import { GuitarTabView } from './GuitarTabView'
import { GuitarFretboard } from './GuitarFretboard'
import { GuitarPhotoFretboard } from './GuitarPhotoFretboard'
import { GuitarTransport } from './GuitarTransport'
import { GuitarChordHelper } from './GuitarChordHelper'
import { GuitarSeekBar } from './GuitarSeekBar'
import { GuitarRecordingOverlay } from './GuitarRecordingOverlay'
import { GUITAR_PRESETS } from '../../data/guitarPresets'

const STORAGE_KEY = 'guitar-tab-track-v1'

function loadTrack(): GuitarTrack {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULT_TRACK, ...JSON.parse(raw) }
  } catch {}
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
  const [sound, setSound]             = useState<GuitarSound>('acoustic')
  const [loop, setLoop]               = useState(true)
  const [metronome, setMetronome]     = useState(false)
  const [volume, setVolume]           = useState(0.75)
  const [zoom, setZoom]               = useState(1)
  const [loopRange, setLoopRange]     = useState<LoopRange | null>(null)
  const [showRecording, setShowRecording] = useState(false)
  const [ctxMenu, setCtxMenu]         = useState<CtxMenu | null>(null)
  const [showChordHelper, setShowChordHelper] = useState(true)
  const [showFretboard, setShowFretboard]     = useState(true)
  const [viewMode, setViewMode]       = useState<'tab' | 'grid' | 'fretboard'>('tab')
  const [toastMsg, setToastMsg]       = useState<string | null>(null)
  const [editingName, setEditingName] = useState(false)
  const midiInputRef      = useRef<HTMLInputElement | null>(null)
  const presetsSelectRef  = useRef<HTMLSelectElement | null>(null)

  const loopRef    = useRef(loop)
  const metroRef   = useRef(metronome)
  const loopRangeRef = useRef(loopRange)
  loopRef.current      = loop
  metroRef.current     = metronome
  loopRangeRef.current = loopRange

  useEffect(() => { setMasterVolume(volume) }, [volume])

  const showToast = (msg: string) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(null), 2500)
  }

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
  const handlePlay = useCallback(async () => {
    setIsPlaying(true)
    prevBeatRef.current = cursorBeat
    await startPlayback(
      track, cursorBeat, sound,
      onBeatUpdate,
      () => { setIsPlaying(false); setCurrentBeat(0) },
      () => loopRef.current,
      () => metroRef.current,
      () => loopRangeRef.current,
    )
  }, [track, cursorBeat, sound, onBeatUpdate])

  const handleStop = useCallback(() => {
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
      } catch (err) {
        showToast('Error reading MIDI file — is it a valid .mid?')
      }
    }
    reader.readAsArrayBuffer(file)
  }, [setTrack])

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

  // ── Bars change ───────────────────────────────────────────────────────────
  const handleBarsChange = useCallback((bars: number) => {
    setTrack(t => ({ ...t, totalBars: Math.max(1, bars) }))
  }, [setTrack])

  // ── Click outside context menu ────────────────────────────────────────────
  useEffect(() => {
    if (!ctxMenu) return
    const close = () => setCtxMenu(null)
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [ctxMenu])

  const totalBeats = track.totalBars * track.beatsPerBar

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
          <>
            <button
              onClick={() => presetsSelectRef.current?.click()}
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
            <select
              ref={presetsSelectRef}
              onChange={e => {
                const p = GUITAR_PRESETS.find(pr => pr.id === e.target.value)
                if (p) handleLoadPreset(p)
                e.target.value = ''
              }}
              defaultValue=""
              style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
            >
              <option value="" disabled>Load preset…</option>
              {GUITAR_PRESETS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </>
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
        isPlaying={isPlaying}
        loop={loop}
        metronome={metronome}
        bpm={track.bpm}
        sound={sound}
        capo={track.capo}
        totalBars={track.totalBars}
        zoom={zoom}
        volume={volume}
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
      />

      {/* Hidden MIDI file input */}
      <input
        ref={midiInputRef}
        type="file" accept=".mid,.midi" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleMidiImport(f); e.target.value = '' }}
      />

      {/* View toggles */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', borderRadius: 7, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <ViewToggle label="Tab"    active={viewMode === 'tab'}      onClick={() => setViewMode('tab')}      style={{ borderRadius: 0, border: 'none' }} />
          <div style={{ width: 1, background: '#e2e8f0' }} />
          <ViewToggle label="Grid"   active={viewMode === 'grid'}     onClick={() => setViewMode('grid')}     style={{ borderRadius: 0, border: 'none' }} />
          <div style={{ width: 1, background: '#e2e8f0' }} />
          <ViewToggle label="Guitar" active={viewMode === 'fretboard'} onClick={() => setViewMode('fretboard')} style={{ borderRadius: 0, border: 'none' }} />
        </div>
        <ViewToggle label="Fretboard" active={showFretboard}   onClick={() => setShowFretboard(v => !v)} />
        <ViewToggle label="Chords"    active={showChordHelper}  onClick={() => setShowChordHelper(v => !v)} />
        <ViewToggle label="Loop"      active={!!loopRange}      onClick={() => setLoopRange(r => r ? null : { startBeat: 0, endBeat: Math.ceil(totalBeats / 2) })} />
      </div>

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
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {viewMode === 'tab' ? (
          <GuitarTabView
            track={track}
            zoom={zoom}
            currentBeat={currentBeat}
            cursorBeat={cursorBeat}
            isPlaying={isPlaying}
            selectedNoteId={selectedNoteId}
            sound={sound}
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
        ) : (
          <GuitarPhotoFretboard
            activeFrets={activeFrets}
            attackSignals={attackSignals}
          />
        )}
      </div>

      {/* Chord Helper */}
      {showChordHelper && (
        <GuitarChordHelper
          cursorBeat={cursorBeat}
          onInsertChord={handleInsertChord}
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

      {/* Context menu (fret edit on long-press) */}
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
