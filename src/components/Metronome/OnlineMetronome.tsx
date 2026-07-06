import React, { useState, useRef, useCallback, useEffect } from 'react'

const MIN_BPM = 20
const MAX_BPM = 300
const LOOKAHEAD_MS = 25
const SCHEDULE_AHEAD_S = 0.12

function scheduleClick(ctx: AudioContext, time: number, isAccent: boolean) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.type = 'sine'
  osc.frequency.value = isAccent ? 1100 : 880
  gain.gain.setValueAtTime(isAccent ? 1.0 : 0.55, time)
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.035)
  osc.start(time)
  osc.stop(time + 0.035)
}

type TimeSignature = { label: string; beats: number; accents: boolean[] }

function compoundAccents(beats: number): boolean[] {
  return Array.from({ length: beats }, (_, i) => i % 3 === 0)
}

const TIME_SIGNATURES: TimeSignature[] = [
  { label: '4/4',  beats: 4,  accents: [true, false, false, false] },
  { label: '3/4',  beats: 3,  accents: [true, false, false] },
  { label: '2/4',  beats: 2,  accents: [true, false] },
  { label: '6/8',  beats: 6,  accents: compoundAccents(6) },
  { label: '9/8',  beats: 9,  accents: compoundAccents(9) },
  { label: '12/8', beats: 12, accents: compoundAccents(12) },
  { label: '5/4',  beats: 5,  accents: [true, false, false, false, false] },
  { label: '7/8',  beats: 7,  accents: [true, false, false, false, false, false, false] },
]

export function OnlineMetronome() {
  const [playing, setPlaying]             = useState(false)
  const [bpm, setBpmState]                = useState(120)
  const [timeSigIndex, setTimeSigIndexState] = useState(0)
  const [activeBeat, setActiveBeat]       = useState(-1) // -1 = idle

  const timeSignature = TIME_SIGNATURES[timeSigIndex]

  const bpmRef              = useRef(120)
  const timeSigRef          = useRef(TIME_SIGNATURES[0])
  const ctxRef              = useRef<AudioContext | null>(null)
  const intervalRef         = useRef<ReturnType<typeof setInterval> | null>(null)
  const rafRef              = useRef<number | null>(null)
  const nextBeatTimeRef     = useRef(0)
  const schedulerBeatRef    = useRef(0)
  const beatQueueRef        = useRef<{ time: number; beat: number }[]>([])
  const tapTimesRef         = useRef<number[]>([])

  const setBpm = useCallback((v: number | ((prev: number) => number)) => {
    setBpmState(prev => {
      const next = typeof v === 'function' ? v(prev) : v
      const clamped = Math.max(MIN_BPM, Math.min(MAX_BPM, next))
      bpmRef.current = clamped
      return clamped
    })
  }, [])

  const setTimeSignature = useCallback((index: number) => {
    timeSigRef.current = TIME_SIGNATURES[index]
    setTimeSigIndexState(index)
    schedulerBeatRef.current = 0
  }, [])

  const visualLoop = useCallback(() => {
    if (!ctxRef.current) return
    const now = ctxRef.current.currentTime
    while (beatQueueRef.current.length > 0 && beatQueueRef.current[0].time <= now) {
      const item = beatQueueRef.current.shift()!
      setActiveBeat(item.beat)
    }
    rafRef.current = requestAnimationFrame(visualLoop)
  }, [])

  const scheduler = useCallback(() => {
    const ctx = ctxRef.current
    if (!ctx) return
    while (nextBeatTimeRef.current < ctx.currentTime + SCHEDULE_AHEAD_S) {
      const beat = schedulerBeatRef.current
      const isAccent = timeSigRef.current.accents[beat]
      scheduleClick(ctx, nextBeatTimeRef.current, isAccent)
      beatQueueRef.current.push({ time: nextBeatTimeRef.current, beat })
      nextBeatTimeRef.current += 60 / bpmRef.current
      schedulerBeatRef.current = (schedulerBeatRef.current + 1) % timeSigRef.current.beats
    }
  }, [])

  const start = useCallback(() => {
    const ctx = new AudioContext()
    ctxRef.current = ctx
    schedulerBeatRef.current = 0
    nextBeatTimeRef.current = ctx.currentTime + 0.05
    beatQueueRef.current = []
    intervalRef.current = setInterval(scheduler, LOOKAHEAD_MS)
    rafRef.current = requestAnimationFrame(visualLoop)
    setPlaying(true)
    setActiveBeat(0)
  }, [scheduler, visualLoop])

  const stop = useCallback(() => {
    if (intervalRef.current != null) clearInterval(intervalRef.current)
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    ctxRef.current?.close().catch(() => {})
    ctxRef.current = null
    beatQueueRef.current = []
    setPlaying(false)
    setActiveBeat(-1)
  }, [])

  const tap = useCallback(() => {
    const now = performance.now()
    const taps = tapTimesRef.current
    if (taps.length > 0 && now - taps[taps.length - 1] > 3000) {
      tapTimesRef.current = []
    }
    taps.push(now)
    if (taps.length > 8) taps.shift()
    if (taps.length >= 2) {
      let total = 0
      for (let i = 1; i < taps.length; i++) total += taps[i] - taps[i - 1]
      const avg = total / (taps.length - 1)
      setBpm(Math.round(60000 / avg))
    }
  }, [setBpm])

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.code === 'Space') { e.preventDefault(); if (playing) stop(); else start() }
      if (e.key === 't' || e.key === 'T') tap()
      if (e.key === 'ArrowRight') { e.preventDefault(); setBpm(b => b + 1) }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); setBpm(b => b - 1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [playing, start, stop, tap, setBpm])

  useEffect(() => () => { stop() }, [stop])

  const tempoLabel =
    bpm < 60  ? 'Largo' :
    bpm < 66  ? 'Larghetto' :
    bpm < 76  ? 'Adagio' :
    bpm < 108 ? 'Andante' :
    bpm < 120 ? 'Moderato' :
    bpm < 156 ? 'Allegro' :
    bpm < 176 ? 'Vivace' :
    bpm < 200 ? 'Presto' : 'Prestissimo'

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden max-w-sm mx-auto select-none">

      {/* Header */}
      <div className="px-6 pt-5 pb-4 text-center border-b border-border">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">Metronome</p>

        {/* Beat indicators */}
        <div className="flex justify-center gap-2 mb-1">
          {Array.from({ length: timeSignature.beats }, (_, i) => {
            const isActive = playing && activeBeat === i
            const isAccent = timeSignature.accents[i]
            return (
              <div
                key={i}
                className={[
                  'rounded-full transition-all duration-75',
                  isAccent ? 'w-4 h-4' : 'w-3 h-3',
                  isActive
                    ? isAccent ? 'bg-primary scale-110' : 'bg-primary/70'
                    : isAccent ? 'bg-border border-2 border-primary/30' : 'bg-border',
                ].join(' ')}
              />
            )
          })}
        </div>
      </div>

      {/* BPM display */}
      <div className="px-6 pt-5 pb-2 text-center">
        <div className="flex items-center justify-center gap-4 mb-1">
          <button
            onClick={() => setBpm(b => b - 1)}
            className="w-8 h-8 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors text-lg font-bold flex items-center justify-center"
            aria-label="Decrease BPM"
          >−</button>
          <div>
            <span className="text-6xl font-bold text-foreground tabular-nums leading-none">{bpm}</span>
            <span className="block text-xs text-muted-foreground mt-1">BPM</span>
          </div>
          <button
            onClick={() => setBpm(b => b + 1)}
            className="w-8 h-8 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors text-lg font-bold flex items-center justify-center"
            aria-label="Increase BPM"
          >+</button>
        </div>
        <p className="text-xs text-muted-foreground italic">{tempoLabel}</p>
      </div>

      {/* BPM slider */}
      <div className="px-6 pb-4">
        <input
          type="range"
          min={MIN_BPM}
          max={MAX_BPM}
          value={bpm}
          onChange={e => setBpm(Number(e.target.value))}
          className="w-full h-1.5 rounded-full accent-primary cursor-pointer"
        />
        <div className="flex justify-between text-xs text-muted-foreground/50 mt-1 px-0.5">
          <span>{MIN_BPM}</span>
          <span>{MAX_BPM}</span>
        </div>
      </div>

      {/* Time signature */}
      <div className="px-6 pb-5 border-t border-border pt-4">
        <p className="text-xs text-muted-foreground mb-2.5 font-medium">Time signature</p>
        <div className="flex gap-1.5 flex-wrap">
          {TIME_SIGNATURES.map((ts, i) => (
            <button
              key={ts.label}
              onClick={() => setTimeSignature(i)}
              className={[
                'px-2.5 h-8 rounded-lg text-sm font-semibold transition-colors',
                timeSigIndex === i
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border text-muted-foreground hover:text-foreground hover:bg-accent/50',
              ].join(' ')}
            >
              {ts.label}
            </button>
          ))}
        </div>
      </div>

      {/* Action buttons */}
      <div className="px-6 pb-6 flex gap-3">
        <button
          onClick={tap}
          className="flex-1 py-2.5 border border-border text-sm font-semibold text-muted-foreground rounded-xl hover:text-foreground hover:bg-accent/50 transition-colors"
        >
          Tap tempo
        </button>
        <button
          onClick={playing ? stop : start}
          className={[
            'flex-1 py-2.5 text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-2',
            playing
              ? 'bg-destructive/10 border border-destructive/30 text-destructive hover:bg-destructive/20'
              : 'bg-primary text-primary-foreground hover:bg-primary/90',
          ].join(' ')}
        >
          {playing ? (
            <>
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>
              Stop
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              Start
            </>
          )}
        </button>
      </div>

      {/* Keyboard hint */}
      <div className="px-6 pb-4 flex justify-center gap-4 text-xs text-muted-foreground/50">
        <span><kbd className="font-mono">Space</kbd> start/stop</span>
        <span><kbd className="font-mono">T</kbd> tap</span>
        <span><kbd className="font-mono">← →</kbd> BPM</span>
      </div>

    </div>
  )
}
