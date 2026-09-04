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
 *
 * **History is pushed from the event handler, never from inside a `setTrack`
 * updater.** Updaters must be pure: React calls them more than once and against
 * different base states (the eager-dispatch path, then again while rendering,
 * and twice more under StrictMode). Pushing a snapshot from in there recorded
 * the state *after* the edit as well as before it, so undo appeared to do
 * nothing. `trackRef` holds the last committed track, which is exactly the
 * "before" an event handler wants.
 */

const MAX_HISTORY = 60

/**
 * An undo snapshot is `{ hits, totalBars }`, not just the hits: applying a
 * shorter tab or deleting a bar changes both, and restoring only the hits would
 * strand them outside a track too short to reach them.
 */
interface Snapshot { hits: DrumHit[]; totalBars: number }
interface History { past: Snapshot[]; future: Snapshot[] }

const snapshot = (t: DrumTrack): Snapshot => ({ hits: t.hits, totalBars: t.totalBars })

export interface UseDrumTrackEditorReturn {
  track: DrumTrack
  setTrack: React.Dispatch<React.SetStateAction<DrumTrack>>
  canUndo: boolean
  canRedo: boolean
  addHit: (hit: DrumHit) => void
  deleteHit: (id: string) => void
  replaceHits: (hits: DrumHit[], totalBars?: number) => void
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

  // Assigned during render, so it always holds the last committed track.
  const trackRef = useRef(track)
  trackRef.current = track

  useEffect(() => {
    try { localStorage.setItem(DRUM_STORAGE_KEY, JSON.stringify(track)) } catch { /* private mode, quota */ }
  }, [track])

  /**
   * Record the current track as the state undo will come back to.
   *
   * The snapshot is taken *before* `setHistory`, not inside its updater: React
   * runs an updater whenever it likes — including during a later render, by
   * which point `trackRef.current` is already the edited track and the snapshot
   * would record the "after" instead of the "before".
   */
  const commit = useCallback(() => {
    const before = snapshot(trackRef.current)
    setHistory(h => ({ past: [...h.past.slice(-MAX_HISTORY + 1), before], future: [] }))
  }, [])

  const addHit = useCallback((hit: DrumHit) => {
    commit()
    setTrack(t => ({ ...t, hits: [...t.hits, hit] }))
  }, [commit])

  const deleteHit = useCallback((id: string) => {
    if (!trackRef.current.hits.some(h => h.id === id)) return
    commit()
    setTrack(t => ({ ...t, hits: t.hits.filter(h => h.id !== id) }))
  }, [commit])

  const replaceHits = useCallback((hits: DrumHit[], totalBars?: number) => {
    commit()
    setTrack(t => ({ ...t, hits, totalBars: totalBars ?? t.totalBars }))
  }, [commit])

  const beginEdit = useCallback(() => { commit() }, [commit])

  const insertBar = useCallback((afterBar: number) => {
    commit()
    setTrack(t => {
      const pivot = (afterBar + 1) * t.beatsPerBar
      return {
        ...t,
        totalBars: t.totalBars + 1,
        hits: t.hits.map(h => h.startBeat >= pivot ? { ...h, startBeat: h.startBeat + t.beatsPerBar } : h),
        sections: t.sections?.map(s => s.startBar > afterBar ? { ...s, startBar: s.startBar + 1 } : s),
      }
    })
  }, [commit])

  const deleteBar = useCallback((bar: number) => {
    if (trackRef.current.totalBars <= 1) return
    commit()
    setTrack(t => {
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
  }, [commit])

  const setTotalBars = useCallback((bars: number) => {
    const next = Math.max(1, Math.min(32, bars))
    if (next === trackRef.current.totalBars) return
    commit()
    setTrack(t => {
      const limit = next * t.beatsPerBar
      return {
        ...t,
        totalBars: next,
        hits: t.hits.filter(h => h.startBeat < limit),
        // Sections that started in the bars just dropped would otherwise linger
        // in the saved track and in share links, pointing at nothing.
        sections: t.sections?.filter(s => s.startBar < next),
      }
    })
  }, [commit])

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
    if (!trackRef.current.hits.length) return
    commit()
    setTrack(t => ({ ...t, hits: [] }))
  }, [commit])

  const undo = useCallback(() => {
    const prev = history.past[history.past.length - 1]
    if (!prev) return
    const current = snapshot(trackRef.current)
    setHistory(h => ({ past: h.past.slice(0, -1), future: [current, ...h.future] }))
    setTrack(t => ({ ...t, hits: prev.hits, totalBars: prev.totalBars }))
  }, [history.past])

  const redo = useCallback(() => {
    const next = history.future[0]
    if (!next) return
    const current = snapshot(trackRef.current)
    setHistory(h => ({ past: [...h.past, current], future: h.future.slice(1) }))
    setTrack(t => ({ ...t, hits: next.hits, totalBars: next.totalBars }))
  }, [history.future])

  return {
    track, setTrack,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    addHit, deleteHit, replaceHits, beginEdit,
    insertBar, deleteBar, setTotalBars, setSections,
    setBpm, setBeatsPerBar, loadTrack, clearAll, undo, redo,
  }
}
