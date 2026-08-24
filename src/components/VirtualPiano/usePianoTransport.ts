import { useCallback, useEffect, useRef, useState } from 'react'

// Song playback transport: play/pause, scrub, loop A-B, speed 50-150%, and
// a practice mode that scores the player's own key hits instead of sounding
// notes automatically. Replaces the old fire-and-forget setTimeout scheduling
// (one timeout per note-on/off, no way to pause or seek) with a single rAF
// clock driven by `posSec`, same model as a real transport bar.
//
// Hot-path state (exact playback position, per-note judged/hit flags) lives
// in refs so the waterfall canvas can read it every frame without forcing a
// React re-render. `posSec` is still mirrored into state, but throttled, so
// the scrub bar and time readout update smoothly without repainting at 60fps.

export interface TransportNote { midi: number; time: number; dur: number }
export interface TransportSong { name: string; bpm: number; notes: TransportNote[] }
export interface JudgedNote extends TransportNote { judged: 'hit' | 'miss' | null }

const POS_FLUSH_MS = 100 // UI-visible posSec update cadence (scrub bar / time text only — the canvas reads posSecRef directly every rAF frame, independent of this). Kept low-frequency on purpose: usePianoTransport is called directly in VirtualPiano, so every flush here re-renders that whole component tree — see PianoKeys.tsx's React.memo comment for why that used to make the falling-notes canvas stutter.
const HIT_WINDOW = 0.35
const MISS_GRACE = 0.35

interface Args {
  onNoteOn: (midi: number, vel: number) => void
  onNoteOff: (midi: number) => void
}

export function usePianoTransport({ onNoteOn, onNoteOff }: Args) {
  const [song, setSong] = useState<TransportSong | null>(null)
  const [posSec, setPosSec] = useState(0)
  const [totalDur, setTotalDur] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [practice, setPractice] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [loopOn, setLoopOn] = useState(false)
  const [loopStart, setLoopStart] = useState(0)
  const [loopEnd, setLoopEnd] = useState(0)
  const [scoreHit, setScoreHit] = useState(0)
  const [scoreMissed, setScoreMissed] = useState(0)

  const notesRef = useRef<JudgedNote[]>([])
  const posSecRef = useRef(0)
  const totalDurRef = useRef(0)
  const playingRef = useRef(false)
  const practiceRef = useRef(false)
  const speedRef = useRef(1)
  const loopOnRef = useRef(false)
  const loopStartRef = useRef(0)
  const loopEndRef = useRef(0)
  const scanPosRef = useRef(0)
  const lastWallRef = useRef(0)
  const lastFlushRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const onNoteOnRef = useRef(onNoteOn); onNoteOnRef.current = onNoteOn
  const onNoteOffRef = useRef(onNoteOff); onNoteOffRef.current = onNoteOff

  const stopSounding = useCallback((atPos: number) => {
    notesRef.current.forEach(n => {
      if (n.time <= atPos && atPos < n.time + n.dur) onNoteOffRef.current(n.midi)
    })
  }, [])

  const scanAuto = useCallback((from: number, to: number) => {
    if (from >= to) return
    notesRef.current.forEach(n => {
      const onT = n.time, offT = n.time + n.dur
      if (onT > from && onT <= to) onNoteOnRef.current(n.midi, 0.8)
      if (offT > from && offT <= to) onNoteOffRef.current(n.midi)
    })
  }, [])

  const flushPos = useCallback((force = false) => {
    const now = performance.now()
    if (!force && now - lastFlushRef.current < POS_FLUSH_MS) return
    lastFlushRef.current = now
    setPosSec(posSecRef.current)
  }, [])

  const load = useCallback((s: TransportSong, opts: { practice?: boolean; autoplay?: boolean } = {}) => {
    stopSounding(posSecRef.current)
    const notes: JudgedNote[] = [...s.notes].sort((a, b) => a.time - b.time).map(n => ({ ...n, judged: null }))
    const dur = notes.length ? notes.reduce((m, n) => Math.max(m, n.time + n.dur), 0) + 0.6 : 0
    notesRef.current = notes
    totalDurRef.current = dur
    posSecRef.current = 0
    scanPosRef.current = 0
    loopStartRef.current = 0
    loopEndRef.current = dur
    loopOnRef.current = false
    practiceRef.current = !!opts.practice
    speedRef.current = 1
    setSong(s)
    setTotalDur(dur)
    setPosSec(0)
    setLoopStart(0)
    setLoopEnd(dur)
    setLoopOn(false)
    setPractice(!!opts.practice)
    setSpeed(1)
    setScoreHit(0)
    setScoreMissed(0)
    if (opts.autoplay) {
      playingRef.current = true
      lastWallRef.current = performance.now()
      setPlaying(true)
    } else {
      playingRef.current = false
      setPlaying(false)
    }
  }, [stopSounding])

  const close = useCallback(() => {
    stopSounding(posSecRef.current)
    playingRef.current = false
    notesRef.current = []
    totalDurRef.current = 0
    setSong(null)
    setPlaying(false)
    setTotalDur(0)
    setPosSec(0)
  }, [stopSounding])

  const seek = useCallback((sec: number) => {
    const dur = totalDurRef.current
    const clamped = Math.max(0, Math.min(dur, sec))
    stopSounding(posSecRef.current)
    posSecRef.current = clamped
    scanPosRef.current = clamped - 0.0005
    notesRef.current.forEach(n => {
      if (n.time + n.dur < clamped - 0.05) {
        if (practiceRef.current && n.judged === null) n.judged = 'miss'
      } else if (n.time > clamped + 0.05) {
        n.judged = null
      }
    })
    if (practiceRef.current) {
      setScoreHit(notesRef.current.filter(n => n.judged === 'hit').length)
      setScoreMissed(notesRef.current.filter(n => n.judged === 'miss').length)
    }
    flushPos(true)
  }, [stopSounding, flushPos])

  const play = useCallback(() => {
    if (!notesRef.current.length) return
    if (posSecRef.current >= totalDurRef.current - 0.02) seek(loopOnRef.current ? loopStartRef.current : 0)
    playingRef.current = true
    lastWallRef.current = performance.now()
    scanPosRef.current = posSecRef.current - 0.0005
    setPlaying(true)
  }, [seek])

  const pause = useCallback(() => {
    stopSounding(posSecRef.current)
    playingRef.current = false
    setPlaying(false)
  }, [stopSounding])

  const togglePlay = useCallback(() => { (playingRef.current ? pause : play)() }, [play, pause])

  const setSpeedValue = useCallback((v: number) => { speedRef.current = v; setSpeed(v) }, [])

  const setLoop = useCallback((on: boolean) => { loopOnRef.current = on; setLoopOn(on) }, [])

  const setLoopRange = useCallback((start: number, end: number) => {
    const dur = totalDurRef.current
    const s = Math.max(0, Math.min(dur, start))
    const e = Math.max(s, Math.min(dur, end))
    loopStartRef.current = s; loopEndRef.current = e
    setLoopStart(s); setLoopEnd(e)
  }, [])

  const setPracticeMode = useCallback((on: boolean) => {
    practiceRef.current = on
    setPractice(on)
    if (on) stopSounding(posSecRef.current)
  }, [stopSounding])

  /** Call when the player hits a key while practice mode is active — scores the nearest unjudged note. */
  const registerHit = useCallback((midi: number) => {
    if (!practiceRef.current || !notesRef.current.length) return
    const now = posSecRef.current
    let best: JudgedNote | null = null
    let bestDelta = HIT_WINDOW
    for (const n of notesRef.current) {
      if (n.judged || n.midi !== midi) continue
      const delta = Math.abs(now - n.time)
      if (delta < bestDelta) { best = n; bestDelta = delta }
    }
    if (best) {
      best.judged = 'hit'
      setScoreHit(h => h + 1)
    }
  }, [])

  useEffect(() => {
    const tick = () => {
      rafRef.current = requestAnimationFrame(tick)
      if (!playingRef.current) return
      const now = performance.now()
      const dt = ((now - lastWallRef.current) / 1000) * speedRef.current
      lastWallRef.current = now
      const newPos = posSecRef.current + dt
      const loopCeil = loopOnRef.current ? loopEndRef.current : totalDurRef.current

      if (newPos >= loopCeil) {
        if (!practiceRef.current) scanAuto(scanPosRef.current, loopCeil)
        if (loopOnRef.current) {
          seek(loopStartRef.current)
          playingRef.current = true
          lastWallRef.current = performance.now()
          scanPosRef.current = loopStartRef.current - 0.0005
        } else {
          stopSounding(loopCeil)
          posSecRef.current = totalDurRef.current
          playingRef.current = false
          setPlaying(false)
          flushPos(true)
        }
      } else {
        if (!practiceRef.current) {
          scanAuto(scanPosRef.current, newPos)
        } else {
          let changed = false
          notesRef.current.forEach(n => {
            if (!n.judged && n.time + n.dur + MISS_GRACE < newPos) { n.judged = 'miss'; changed = true }
          })
          if (changed) setScoreMissed(notesRef.current.filter(n => n.judged === 'miss').length)
        }
        posSecRef.current = newPos
        scanPosRef.current = newPos
        flushPos()
      }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    song, notesRef, posSec, posSecRef, totalDur, playing, practice, speed,
    loopOn, loopStart, loopEnd, scoreHit, scoreMissed,
    load, close, play, pause, togglePlay, seek,
    setSpeed: setSpeedValue, setLoop, setLoopRange, setPractice: setPracticeMode, registerHit,
  }
}

export type PianoTransport = ReturnType<typeof usePianoTransport>
