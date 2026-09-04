import { useState, useCallback, useEffect, useRef } from 'react'
import { stopPlayback } from '../lib/drumTab/drumAudio'
import { DRUM_STORAGE_KEY, type DrumHit, type DrumSection, type DrumTrack } from '../lib/drumTab/types'

/**
 * Editing state for a drum track: 60-step undo/redo over the hit list, and
 * persistence to localStorage.
 *
 * Sibling of `useTrackEditor` (the bass tab's), deliberately not a generalisation
 * of it. The two differ in more than the element type — the bass keeps `notes`
 * with a `durationBeats` and grows `totalBars` from where notes *end*, while a
 * drum stroke has no duration and bars are fixed by the pattern — so a shared
 * hook would need four injected accessors to serve two callers. If a third
 * timeline editor ever appears, that is the moment to extract the common core.
 */

const MAX_HISTORY = 60

/**
 * An undo snapshot is `{ hits, totalBars }`, not just the hits: applying a shorter
 * tab or deleting a bar changes both, and restoring only the hits would strand them
 * outside a track too short to reach them.
 */
interface Snapshot { hits: DrumHit[]; totalBars: number }
interface History { past: Snapshot[]; future: Snapshot[] }

export interface UseDrumTrackEditorReturn {
  track: DrumTrack
  setTrack: React.Dispatch<React.SetStateAction<DrumTrack>>
  canUndo: boolean
  canRedo: boolean
  addHit: (hit: DrumHit) => void
  updateHit: (id: string, patch: Partial<DrumHit>) => void
  deleteHit: (id: string) => void
  replaceHits: (hits: DrumHit[]) => void
  beginEdit: () => void
  insertBar: (afterBar: number) => void
  deleteBar: (bar: number) => void
  setTotalBars: (bars: number) => void
  setSections: (sections: DrumSection[]) => void
  setBpm: (bpm: number, stopFirst: boolean) => void
  setBeatsPerBar: (bpb: number) => void
  loadTrack: (next: DrumTrack) => void
  clearAll: () => void
  undo: () => void
  redo: () => void
}

export function useDrumTrackEditor(initial: DrumTrack): UseDrumTrackEditorReturn {
  const [track, setTrack]     = useState<DrumTrack>(initial)
  const [history, setHistory] = useState<History>({ past: [], future: [] })

  const trackRef = useRef(track)
  trackRef.current = track

  useEffect(() => {
    try { localStorage.setItem(DRUM_STORAGE_KEY, JSON.stringify(track)) } catch { /* private mode, quota */ }
  }, [track])

  const pushHistory = useCallback((prev: Snapshot) => {
    setHistory(h => ({ past: [...h.past.slice(-MAX_HISTORY + 1), prev], future: [] }))
  }, [])

  const snapshot = (t: DrumTrack): Snapshot => ({ hits: t.hits, totalBars: t.totalBars })

  const addHit = useCallback((hit: DrumHit) => {
    setTrack(t => { pushHistory(snapshot(t)); return { ...t, hits: [...t.hits, hit] } })
  }, [pushHistory])

  const updateHit = useCallback((id: string, patch: Partial<DrumHit>) => {
    setTrack(t => ({ ...t, hits: t.hits.map(h => h.id === id ? { ...h, ...patch } : h) }))
  }, [])

  const deleteHit = useCallback((id: string) => {
    setTrack(t => { pushHistory(snapshot(t)); return { ...t, hits: t.hits.filter(h => h.id !== id) } })
  }, [pushHistory])

  const replaceHits = useCallback((hits: DrumHit[]) => {
    setTrack(t => { pushHistory(snapshot(t)); return { ...t, hits } })
  }, [pushHistory])

  const beginEdit = useCallback(() => {
    setTrack(t => { pushHistory(snapshot(t)); return t })
  }, [pushHistory])

  const insertBar = useCallback((afterBar: number) => {
    setTrack(t => {
      pushHistory(snapshot(t))
      const pivot = (afterBar + 1) * t.beatsPerBar
      return {
        ...t,
        totalBars: t.totalBars + 1,
        hits: t.hits.map(h => h.startBeat >= pivot ? { ...h, startBeat: h.startBeat + t.beatsPerBar } : h),
        sections: t.sections?.map(s => s.startBar > afterBar ? { ...s, startBar: s.startBar + 1 } : s),
      }
    })
  }, [pushHistory])

  const deleteBar = useCallback((bar: number) => {
    setTrack(t => {
      if (t.totalBars <= 1) return t
      pushHistory(snapshot(t))
      const start = bar * t.beatsPerBar
      const end   = start + t.beatsPerBar
      return {
        ...t,
        totalBars: t.totalBars - 1,
        hits: t.hits
          .filter(h => h.startBeat < start || h.startBeat >= end)
          .map(h => h.startBeat >= end ? { ...h, startBeat: h.startBeat - t.beatsPerBar } : h),
        sections: t.sections
          ?.filter(s => s.startBar !== bar)
          .map(s => s.startBar > bar ? { ...s, startBar: s.startBar - 1 } : s),
      }
    })
  }, [pushHistory])

  const setTotalBars = useCallback((bars: number) => {
    setTrack(t => {
      const next = Math.max(1, Math.min(32, bars))
      if (next === t.totalBars) return t
      pushHistory(snapshot(t))
      const limit = next * t.beatsPerBar
      return { ...t, totalBars: next, hits: t.hits.filter(h => h.startBeat < limit) }
    })
  }, [pushHistory])

  const setSections = useCallback((sections: DrumSection[]) => {
    setTrack(t => ({ ...t, sections }))
  }, [])

  const setBpm = useCallback((bpm: number, stopFirst: boolean) => {
    if (stopFirst) stopPlayback()
    setTrack(t => ({ ...t, bpm }))
  }, [])

  const setBeatsPerBar = useCallback((bpb: number) => {
    setTrack(t => ({ ...t, beatsPerBar: bpb }))
  }, [])

  const loadTrack = useCallback((next: DrumTrack) => {
    stopPlayback()
    setHistory({ past: [], future: [] })
    setTrack(next)
  }, [])

  const clearAll = useCallback(() => {
    setTrack(t => {
      if (!t.hits.length) return t
      pushHistory(snapshot(t))
      return { ...t, hits: [] }
    })
  }, [pushHistory])

  const undo = useCallback(() => {
    setHistory(h => {
      if (!h.past.length) return h
      const prev = h.past[h.past.length - 1]
      const current = snapshot(trackRef.current)
      setTrack(t => ({ ...t, hits: prev.hits, totalBars: prev.totalBars }))
      return { past: h.past.slice(0, -1), future: [current, ...h.future] }
    })
  }, [])

  const redo = useCallback(() => {
    setHistory(h => {
      if (!h.future.length) return h
      const next = h.future[0]
      const current = snapshot(trackRef.current)
      setTrack(t => ({ ...t, hits: next.hits, totalBars: next.totalBars }))
      return { past: [...h.past, current], future: h.future.slice(1) }
    })
  }, [])

  return {
    track, setTrack,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    addHit, updateHit, deleteHit, replaceHits, beginEdit,
    insertBar, deleteBar, setTotalBars, setSections,
    setBpm, setBeatsPerBar, loadTrack, clearAll, undo, redo,
  }
}
