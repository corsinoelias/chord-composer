import { useState, useCallback, useEffect } from 'react'
import type { BassNote, BassTrack, TrackSection } from '../lib/bassTab/types'
import { stopPlayback } from '../lib/bassTab/bassAudio'
import type { Preset } from '../data/presets'

const STORAGE_KEY = 'bass-tab-track-v1'
const MAX_HISTORY = 60

interface History { past: BassNote[][]; future: BassNote[][] }

interface UseTrackEditorReturn {
  track: BassTrack
  setTrack: React.Dispatch<React.SetStateAction<BassTrack>>
  history: History
  canUndo: boolean
  canRedo: boolean
  addNote: (note: BassNote) => void
  updateNote: (id: string, patch: Partial<BassNote>) => void
  deleteNote: (id: string) => void
  beginEdit: () => void
  pushHistory: (notes: BassNote[]) => void
  insertBar: (afterBar: number) => void
  deleteBar: (bar: number) => void
  handleSectionChange: (sections: TrackSection[]) => void
  handleBpmChange: (bpm: number, stopPlaybackFirst: boolean) => void
  handleBeatsPerBarChange: (bpb: number) => void
  handleLoadPreset: (preset: Preset) => BassNote[]  // returns defaultSound hint via notes
  handleLoadPresetFull: (preset: Preset) => { sound: BassTrack['id'] }
  handleImportTrack: (imported: BassTrack) => void
  handleClearAll: () => void
  handleUndo: () => void
  handleRedo: () => void
}

export function useTrackEditor(initial: BassTrack): UseTrackEditorReturn {
  const [track, setTrack]     = useState<BassTrack>(initial)
  const [history, setHistory] = useState<History>({ past: [], future: [] })

  // Persist to localStorage
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(track)) } catch {}
  }, [track])

  // Auto-sync totalBars with notes
  useEffect(() => {
    const maxEnd = track.notes.reduce((max, n) => Math.max(max, n.startBeat + n.durationBeats), 0)
    const needed = Math.max(4, Math.ceil(maxEnd / track.beatsPerBar) + 1)
    if (needed !== track.totalBars) {
      setTrack(t => ({ ...t, totalBars: needed }))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track.notes, track.beatsPerBar])

  const pushHistory = useCallback((prevNotes: BassNote[]) => {
    setHistory(h => ({
      past:   [...h.past.slice(-MAX_HISTORY + 1), prevNotes],
      future: [],
    }))
  }, [])

  const addNote = useCallback((note: BassNote) => {
    setTrack(t => { pushHistory(t.notes); return { ...t, notes: [...t.notes, note] } })
  }, [pushHistory])

  const updateNote = useCallback((id: string, patch: Partial<BassNote>) => {
    setTrack(t => ({ ...t, notes: t.notes.map(n => n.id === id ? { ...n, ...patch } : n) }))
  }, [])

  const deleteNote = useCallback((id: string) => {
    setTrack(t => { pushHistory(t.notes); return { ...t, notes: t.notes.filter(n => n.id !== id) } })
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
        notes:    t.notes.map(n => n.startBeat >= pivot ? { ...n, startBeat: n.startBeat + t.beatsPerBar } : n),
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

  const handleSectionChange = useCallback((sections: TrackSection[]) => {
    setTrack(t => ({ ...t, sections }))
  }, [])

  const handleBpmChange = useCallback((bpm: number, stopFirst: boolean) => {
    if (stopFirst) { stopPlayback() }
    setTrack(t => ({ ...t, bpm }))
  }, [])

  const handleBeatsPerBarChange = useCallback((bpb: number) => {
    setTrack(t => ({ ...t, beatsPerBar: bpb }))
  }, [])

  const handleLoadPresetFull = useCallback((preset: Preset) => {
    stopPlayback()
    setHistory({ past: [], future: [] })
    setTrack({
      id: preset.id, name: preset.name, bpm: preset.bpm,
      beatsPerBar: preset.beatsPerBar, totalBars: preset.totalBars,
      notes: preset.notes, sections: preset.sections,
    })
    return { sound: preset.defaultSound }
  }, [])

  // Legacy wrapper returning notes array (kept for compat)
  const handleLoadPreset = useCallback((preset: Preset) => {
    handleLoadPresetFull(preset)
    return preset.notes
  }, [handleLoadPresetFull])

  const handleImportTrack = useCallback((imported: BassTrack) => {
    stopPlayback()
    setHistory({ past: [], future: [] })
    setTrack(imported)
  }, [])

  const handleClearAll = useCallback(() => {
    setTrack(t => {
      if (t.notes.length === 0) return t
      pushHistory(t.notes)
      return { ...t, notes: [] }
    })
  }, [pushHistory])

  const handleUndo = useCallback(() => {
    setHistory(h => {
      if (!h.past.length) return h
      const prev = h.past[h.past.length - 1]
      setTrack(t => ({ ...t, notes: prev }))
      return { past: h.past.slice(0, -1), future: [track.notes, ...h.future] }
    })
  }, [track.notes])

  const handleRedo = useCallback(() => {
    setHistory(h => {
      if (!h.future.length) return h
      const next = h.future[0]
      setTrack(t => ({ ...t, notes: next }))
      return { past: [...h.past, track.notes], future: h.future.slice(1) }
    })
  }, [track.notes])

  return {
    track, setTrack, history,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    addNote, updateNote, deleteNote, beginEdit, pushHistory,
    insertBar, deleteBar,
    handleSectionChange, handleBpmChange, handleBeatsPerBarChange,
    handleLoadPreset, handleLoadPresetFull, handleImportTrack, handleClearAll,
    handleUndo, handleRedo,
  }
}
