import React, { useState, useRef, useCallback, useEffect } from 'react'

const MIN_BPM = 20
const MAX_BPM = 400
const LOOKAHEAD_MS = 25
const SCHEDULE_AHEAD_S = 0.12
const STORAGE_KEY = 'metronome.settings.v1'

const ACCENT = 'oklch(0.55 0.16 250)'
const TEXT = '#15181d'
const MUTED = '#5c6470'
const FAINT = '#8a929c'
const BORDER = '#d8dde3'
const BORDER_LIGHT = '#e3e7ec'
const RING_TRACK = '#e6eaef'

const SIG_OPTIONS = ['2/4', '3/4', '4/4', '5/4', '6/8', '7/8', '9/8', '12/8']
const SUB_OPTIONS = [
  { v: 1, label: 'Quarter notes' },
  { v: 2, label: 'Eighth notes' },
  { v: 3, label: 'Triplets' },
  { v: 4, label: 'Sixteenth notes' },
  { v: 5, label: 'Quintuplets' },
  { v: 6, label: 'Sextuplets' },
]

function accentsForSig(num: number, den: number): number[] {
  return Array.from({ length: num }, (_, i) =>
    i === 0 || (den === 8 && num > 3 && i % 3 === 0) ? 2 : 1
  )
}

function tempoName(bpm: number): string {
  return bpm < 40 ? 'Grave' :
    bpm < 60 ? 'Largo' :
    bpm < 66 ? 'Larghetto' :
    bpm < 76 ? 'Adagio' :
    bpm < 108 ? 'Andante' :
    bpm < 120 ? 'Moderato' :
    bpm < 156 ? 'Allegro' :
    bpm < 176 ? 'Vivace' :
    bpm < 200 ? 'Presto' : 'Prestissimo'
}

type SavedSettings = {
  bpm: number; num: number; den: number; sub: number; vol: number; accents: number[]
  speedOn: boolean; speedEvery: number; speedInc: number; speedMax: number
  gapOn: boolean; gapPlay: number; gapMute: number
}

export function OnlineMetronome() {
  const [bpm, setBpmState] = useState(120)
  const [playing, setPlaying] = useState(false)
  const [num, setNum] = useState(4)
  const [den, setDen] = useState(4)
  const [sub, setSub] = useState(1)
  const [vol, setVol] = useState(0.8)
  const [accents, setAccents] = useState<number[]>([2, 1, 1, 1])
  const [beat, setBeat] = useState(-1)
  const [muted, setMuted] = useState(false)
  const [flashOn, setFlashOn] = useState(false)
  const [speedOn, setSpeedOn] = useState(false)
  const [speedEvery, setSpeedEvery] = useState(4)
  const [speedInc, setSpeedInc] = useState(2)
  const [speedMax, setSpeedMax] = useState(160)
  const [gapOn, setGapOn] = useState(false)
  const [gapPlay, setGapPlay] = useState(1)
  const [gapMute, setGapMute] = useState(1)

  const bpmRef = useRef(bpm)
  const numRef = useRef(num)
  const subRef = useRef(sub)
  const accentsRef = useRef(accents)
  const speedRef = useRef({ speedOn, speedEvery, speedInc, speedMax })
  const gapRef = useRef({ gapOn, gapPlay, gapMute })

  const ctxRef = useRef<AudioContext | null>(null)
  const masterRef = useRef<GainNode | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const rafRef = useRef<number | null>(null)
  const nextTimeRef = useRef(0)
  const curRef = useRef({ beat: 0, sub: 0, bar: 0 })
  const barsSinceIncRef = useRef(0)
  const queueRef = useRef<{ time: number; beat: number; muted: boolean }[]>([])
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tapsRef = useRef<number[]>([])
  const lastTapRef = useRef(0)
  const ringRef = useRef<HTMLDivElement | null>(null)
  const lastBeatTimeRef = useRef<{ time: number; beat: number } | null>(null)

  bpmRef.current = bpm
  numRef.current = num
  subRef.current = sub
  accentsRef.current = accents
  speedRef.current = { speedOn, speedEvery, speedInc, speedMax }
  gapRef.current = { gapOn, gapPlay, gapMute }

  // Load saved settings on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const s = JSON.parse(raw) as Partial<SavedSettings>
      if (typeof s.bpm === 'number') setBpmState(Math.max(MIN_BPM, Math.min(MAX_BPM, s.bpm)))
      if (typeof s.num === 'number') setNum(s.num)
      if (typeof s.den === 'number') setDen(s.den)
      if (typeof s.sub === 'number') setSub(s.sub)
      if (typeof s.vol === 'number') setVol(s.vol)
      if (Array.isArray(s.accents)) setAccents(s.accents)
      if (typeof s.speedOn === 'boolean') setSpeedOn(s.speedOn)
      if (typeof s.speedEvery === 'number') setSpeedEvery(s.speedEvery)
      if (typeof s.speedInc === 'number') setSpeedInc(s.speedInc)
      if (typeof s.speedMax === 'number') setSpeedMax(s.speedMax)
      if (typeof s.gapOn === 'boolean') setGapOn(s.gapOn)
      if (typeof s.gapPlay === 'number') setGapPlay(s.gapPlay)
      if (typeof s.gapMute === 'number') setGapMute(s.gapMute)
    } catch { /* ignore corrupt/unavailable storage */ }
  }, [])

  // Persist settings (debounced)
  useEffect(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => {
      try {
        const s: SavedSettings = { bpm, num, den, sub, vol, accents, speedOn, speedEvery, speedInc, speedMax, gapOn, gapPlay, gapMute }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
      } catch { /* storage unavailable (private mode, quota) */ }
    }, 300)
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current) }
  }, [bpm, num, den, sub, vol, accents, speedOn, speedEvery, speedInc, speedMax, gapOn, gapPlay, gapMute])

  const setBpm = useCallback((v: number) => {
    setBpmState(Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(v))))
  }, [])

  const nudge = useCallback((d: number) => setBpm(bpmRef.current + d), [setBpm])

  const ensureAudio = useCallback(() => {
    if (!ctxRef.current) {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
      const master = ctx.createGain()
      master.connect(ctx.destination)
      ctxRef.current = ctx
      masterRef.current = master
    }
    masterRef.current!.gain.value = vol * vol
    if (ctxRef.current.state === 'suspended') ctxRef.current.resume()
  }, [vol])

  const click = useCallback((t: number, kind: 'acc' | 'norm' | 'sub') => {
    const ctx = ctxRef.current!
    const level = kind === 'acc' ? 1 : kind === 'norm' ? 0.55 : 0.28
    const g = ctx.createGain()
    g.connect(masterRef.current!)
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.value = kind === 'acc' ? 1568 : kind === 'norm' ? 1046 : 1319
    o.connect(g)
    o.start(t)
    o.stop(t + 0.06)
    g.gain.setValueAtTime(level * 0.7, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.06)
  }, [])

  const gapMuted = useCallback((bar: number) => {
    const { gapOn, gapPlay, gapMute } = gapRef.current
    if (!gapOn) return false
    return (bar % (gapPlay + gapMute)) >= gapPlay
  }, [])

  const scheduleTick = useCallback(() => {
    const ctx = ctxRef.current
    if (!ctx) return
    while (nextTimeRef.current < ctx.currentTime + SCHEDULE_AHEAD_S) {
      const { beat: b, sub: s, bar } = curRef.current
      const isMuted = gapMuted(bar)
      if (s === 0) {
        const lvl = accentsRef.current[b] ?? 1
        if (!isMuted && lvl > 0) click(nextTimeRef.current, lvl === 2 ? 'acc' : 'norm')
        queueRef.current.push({ time: nextTimeRef.current, beat: b, muted: isMuted })
      } else if (!isMuted) {
        click(nextTimeRef.current, 'sub')
      }
      nextTimeRef.current += (60 / bpmRef.current) / subRef.current

      let ns = s + 1, nb = b, nbar = bar
      if (ns >= subRef.current) {
        ns = 0
        nb++
        if (nb >= numRef.current) {
          nb = 0
          nbar++
          const sp = speedRef.current
          if (sp.speedOn) {
            barsSinceIncRef.current += 1
            if (barsSinceIncRef.current >= sp.speedEvery && bpmRef.current < sp.speedMax) {
              barsSinceIncRef.current = 0
              setBpm(Math.min(sp.speedMax, bpmRef.current + sp.speedInc))
            }
          }
        }
      }
      curRef.current = { beat: nb, sub: ns, bar: nbar }
    }
  }, [click, gapMuted, setBpm])

  const drawRef = useRef<() => void>(() => {})
  drawRef.current = () => {
    const ctx = ctxRef.current
    if (!ctx) return
    const t = ctx.currentTime
    let n: { time: number; beat: number; muted: boolean } | undefined
    while (queueRef.current.length && queueRef.current[0].time <= t) n = queueRef.current.shift()
    if (n) {
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current)
      lastBeatTimeRef.current = { time: n.time, beat: n.beat }
      setBeat(n.beat)
      setMuted(n.muted)
      setFlashOn(true)
      flashTimeoutRef.current = setTimeout(() => setFlashOn(false), 95)
    }
    const el = ringRef.current
    const lastBeat = lastBeatTimeRef.current
    if (el && lastBeat) {
      const beatDur = 60 / bpmRef.current
      const frac = Math.min(1, Math.max(0, (t - lastBeat.time) / beatDur))
      const prog = Math.min(100, ((lastBeat.beat + frac) / numRef.current) * 100)
      el.style.background = `conic-gradient(${ACCENT} 0 ${prog}%, ${RING_TRACK} ${prog}% 100%)`
    }
    rafRef.current = requestAnimationFrame(() => drawRef.current())
  }

  const stop = useCallback(() => {
    if (timerRef.current != null) clearInterval(timerRef.current)
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    lastBeatTimeRef.current = null
    if (ringRef.current) ringRef.current.style.background = ''
    setPlaying(false)
    setBeat(-1)
    setFlashOn(false)
  }, [])

  const start = useCallback(() => {
    ensureAudio()
    curRef.current = { beat: 0, sub: 0, bar: 0 }
    queueRef.current = []
    barsSinceIncRef.current = 0
    nextTimeRef.current = ctxRef.current!.currentTime + 0.08
    timerRef.current = setInterval(scheduleTick, LOOKAHEAD_MS)
    setPlaying(true)
    setBeat(-1)
    rafRef.current = requestAnimationFrame(() => drawRef.current())
  }, [ensureAudio, scheduleTick])

  const toggle = useCallback(() => { playing ? stop() : start() }, [playing, start, stop])

  const tap = useCallback(() => {
    const now = performance.now()
    if (!tapsRef.current.length || now - lastTapRef.current > 2500) tapsRef.current = []
    tapsRef.current.push(now)
    lastTapRef.current = now
    if (tapsRef.current.length > 6) tapsRef.current.shift()
    if (tapsRef.current.length >= 2) {
      const iv: number[] = []
      for (let i = 1; i < tapsRef.current.length; i++) iv.push(tapsRef.current[i] - tapsRef.current[i - 1])
      setBpm(60000 / (iv.reduce((a, b) => a + b, 0) / iv.length))
    }
  }, [setBpm])

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      if (e.code === 'Space') { e.preventDefault(); toggle() }
      else if (e.key === 'ArrowUp') { e.preventDefault(); nudge(e.shiftKey ? 10 : 1) }
      else if (e.key === 'ArrowDown') { e.preventDefault(); nudge(e.shiftKey ? -10 : -1) }
      else if (e.key === 'ArrowRight') { e.preventDefault(); nudge(5) }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); nudge(-5) }
      else if (e.key === 't' || e.key === 'T') tap()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle, nudge, tap])

  useEffect(() => () => {
    if (timerRef.current != null) clearInterval(timerRef.current)
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current)
    ctxRef.current?.close().catch(() => {})
  }, [])

  const setSig = useCallback((value: string) => {
    const [n, d] = value.split('/').map(Number)
    setNum(n)
    setDen(d)
    setAccents(accentsForSig(n, d))
  }, [])

  const cycleAccent = (i: number) => {
    setAccents(prev => {
      const next = prev.slice()
      next[i] = next[i] === 2 ? 1 : next[i] === 1 ? 0 : 2
      return next
    })
  }

  const onVol = (v: number) => {
    setVol(v)
    if (masterRef.current) masterRef.current.gain.value = v * v
  }

  const flashActive = flashOn && !muted
  const circLabel = playing && beat >= 0 ? String(beat + 1) : `${num}/${den}`
  const circCaption = playing ? (muted ? 'SILENT' : `${num}/${den}`) : 'READY'
  const circFg = playing && beat >= 0 ? (accents[beat] === 2 && !muted ? ACCENT : TEXT) : FAINT

  const speedSummary = speedOn
    ? `Every ${speedEvery} bar${speedEvery > 1 ? 's' : ''}, tempo goes up by ${speedInc} BPM until it reaches ${speedMax} BPM.`
    : 'Off — tempo stays constant.'
  const gapSummary = gapOn
    ? `${gapPlay} bar${gapPlay > 1 ? 's' : ''} with click, then ${gapMute} silent bar${gapMute > 1 ? 's' : ''}, repeating.`
    : 'Off — every bar clicks.'

  return (
    <div
      style={{
        minHeight: 'calc(100dvh - 64px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 22,
        padding: '64px 20px 48px',
        position: 'relative',
        boxSizing: 'border-box',
        fontFamily: "'IBM Plex Sans', Helvetica, Arial, sans-serif",
        color: TEXT,
        userSelect: 'none',
      }}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px' }}>
        <h1 style={{ fontWeight: 700, letterSpacing: '0.02em', fontSize: 15, margin: 0 }}>Online metronome</h1>
        <div style={{ fontSize: 12, color: MUTED, letterSpacing: '0.04em' }}>free · precise · in your browser</div>
      </div>

      {/* Circle indicator */}
      <div style={{ height: 196, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 176, height: 176, position: 'relative' }}>
          <div
            ref={ringRef}
            style={{ position: 'absolute', inset: 16, borderRadius: '50%', background: `conic-gradient(${ACCENT} 0 0%, ${RING_TRACK} 0% 100%)` }}
          />
          <div
            style={{
              position: 'absolute', inset: 25, borderRadius: '50%', background: '#fff', border: `1px solid ${BORDER_LIGHT}`,
              boxShadow: '0 2px 12px rgba(20,25,35,0.07)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              transition: 'transform 90ms ease', transform: flashActive ? 'scale(1.05)' : 'scale(1)',
            }}
          >
            <div
              style={{
                fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, lineHeight: 1, transition: 'color 90ms ease',
                color: circFg, fontSize: playing && beat >= 0 ? 42 : 24,
              }}
            >
              {circLabel}
            </div>
            <div style={{ fontSize: 10, letterSpacing: '0.14em', color: FAINT, marginTop: 5 }}>{circCaption}</div>
          </div>
          {accents.map((lvl, i) => {
            const active = playing && beat === i && !muted
            const ang = (360 / num) * i
            return (
              <div
                key={i}
                style={{
                  position: 'absolute', left: '50%', top: '50%', width: 16, height: 16, margin: '-8px 0 0 -8px',
                  borderRadius: '50%', boxSizing: 'border-box',
                  transition: 'transform 90ms ease, background 90ms ease, box-shadow 90ms ease',
                  background: active ? ACCENT : lvl === 2 ? ACCENT : lvl === 1 ? '#c3cad3' : '#fff',
                  border: lvl === 0 ? '2px dashed #c3cad3' : '2px solid #fff',
                  boxShadow: active ? `0 0 0 4px oklch(0.55 0.16 250 / 0.18)` : '0 1px 3px rgba(20,25,35,0.12)',
                  transform: `rotate(${ang}deg) translateY(-72px) rotate(-${ang}deg)${active ? ' scale(1.4)' : ' scale(1)'}`,
                }}
              />
            )
          })}
        </div>
      </div>

      {/* BPM display */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(10px,4vw,22px)' }}>
        <button
          onClick={() => nudge(-1)}
          aria-label="Decrease BPM"
          style={{ width: 52, height: 52, borderRadius: '50%', border: `1.5px solid ${BORDER}`, background: '#fff', fontSize: 26, color: TEXT, cursor: 'pointer', lineHeight: 1 }}
        >−</button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 'clamp(72px,16vw,104px)', fontWeight: 600, lineHeight: 1, letterSpacing: '-0.03em' }}>
            {bpm}
          </div>
          <div style={{ fontSize: 13, color: MUTED, letterSpacing: '0.12em', marginTop: 6 }}>{tempoName(bpm).toUpperCase()} · BPM</div>
        </div>
        <button
          onClick={() => nudge(1)}
          aria-label="Increase BPM"
          style={{ width: 52, height: 52, borderRadius: '50%', border: `1.5px solid ${BORDER}`, background: '#fff', fontSize: 26, color: TEXT, cursor: 'pointer', lineHeight: 1 }}
        >+</button>
      </div>

      <input
        type="range"
        min={MIN_BPM}
        max={MAX_BPM}
        value={bpm}
        onChange={e => setBpm(Number(e.target.value))}
        style={{ width: 'min(520px,84vw)', accentColor: ACCENT }}
      />

      {/* Beat accent dots */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 12, alignItems: 'center', maxWidth: '92vw' }}>
          {accents.map((lvl, i) => {
            const active = playing && beat === i && !muted
            return (
              <button
                key={i}
                onClick={() => cycleAccent(i)}
                title="tap to change accent"
                style={{
                  width: 30, height: 30, borderRadius: '50%', cursor: 'pointer',
                  transition: 'transform 80ms ease, background 80ms ease',
                  border: lvl === 0 ? '2px dashed #b9c1cb' : active ? `2px solid ${ACCENT}` : '2px solid transparent',
                  background: active ? ACCENT : lvl === 2 ? ACCENT : lvl === 1 ? '#b9c1cb' : 'transparent',
                  transform: active ? 'scale(1.3)' : 'scale(1)',
                }}
              />
            )
          })}
        </div>
        <div style={{ fontSize: 11.5, color: FAINT }}>tap a dot: strong accent · normal · silent</div>
      </div>

      {/* Tap / Play / Volume */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 'clamp(10px,3vw,18px)', marginTop: 4 }}>
        <button
          onClick={tap}
          style={{ height: 56, padding: '0 22px', borderRadius: 28, border: `1.5px solid ${BORDER}`, background: '#fff', fontSize: 14, fontWeight: 600, letterSpacing: '0.05em', cursor: 'pointer', color: TEXT }}
        >
          TAP
        </button>
        <button
          onClick={toggle}
          aria-label="play or pause"
          style={{ width: 88, height: 88, borderRadius: '50%', border: 'none', cursor: 'pointer', background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 18px oklch(0.55 0.16 250 / 0.35)' }}
        >
          {playing ? (
            <div style={{ display: 'flex', gap: 7 }}>
              <div style={{ width: 8, height: 30, background: '#fff', borderRadius: 2 }} />
              <div style={{ width: 8, height: 30, background: '#fff', borderRadius: 2 }} />
            </div>
          ) : (
            <div style={{ width: 0, height: 0, borderTop: '17px solid transparent', borderBottom: '17px solid transparent', borderLeft: '26px solid #fff', marginLeft: 7 }} />
          )}
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: 110 }}>
          <label style={{ fontSize: 11, color: MUTED, letterSpacing: '0.06em' }}>VOLUME</label>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(vol * 100)}
            onChange={e => onVol(Number(e.target.value) / 100)}
            style={{ width: '100%', accentColor: ACCENT }}
          />
        </div>
      </div>

      {/* Time signature & subdivision */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, justifyContent: 'center', marginTop: 4 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11, color: MUTED, letterSpacing: '0.06em' }}>
          TIME SIGNATURE
          <select
            value={`${num}/${den}`}
            onChange={e => setSig(e.target.value)}
            style={{ height: 40, minWidth: 88, border: `1.5px solid ${BORDER}`, borderRadius: 8, background: '#fff', fontSize: 14, padding: '0 10px', color: TEXT }}
          >
            {SIG_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11, color: MUTED, letterSpacing: '0.06em' }}>
          SUBDIVISION
          <select
            value={sub}
            onChange={e => setSub(Number(e.target.value))}
            style={{ height: 40, minWidth: 130, border: `1.5px solid ${BORDER}`, borderRadius: 8, background: '#fff', fontSize: 14, padding: '0 10px', color: TEXT }}
          >
            {SUB_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
          </select>
        </label>
      </div>

      {/* Speed trainer / Silent bars */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, justifyContent: 'center', width: 'min(760px,100%)', marginTop: 10, boxSizing: 'border-box' }}>
        <div style={{ flex: 1, minWidth: 'min(300px,100%)', border: `1.5px solid ${BORDER_LIGHT}`, borderRadius: 14, background: '#fff', padding: '18px 20px', boxSizing: 'border-box' }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={speedOn}
              onChange={e => setSpeedOn(e.target.checked)}
              style={{ width: 20, height: 20, marginTop: 1, accentColor: ACCENT, cursor: 'pointer' }}
            />
            <span>
              <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600 }}>Speed trainer</span>
              <span style={{ display: 'block', fontSize: 12.5, color: MUTED, lineHeight: 1.5, marginTop: 2 }}>
                Raises the tempo automatically while you play — great for building speed.
              </span>
            </span>
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 14, opacity: speedOn ? 1 : 0.45 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: MUTED }}>
              EVERY (BARS)
              <input
                type="number" min={1} max={64} value={speedEvery}
                onChange={e => setSpeedEvery(Math.max(1, Number(e.target.value) || 1))}
                style={{ width: 70, height: 36, border: `1.5px solid ${BORDER}`, borderRadius: 7, textAlign: 'center', fontSize: 14 }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: MUTED }}>
              ADD (BPM)
              <input
                type="number" min={1} max={20} value={speedInc}
                onChange={e => setSpeedInc(Math.max(1, Number(e.target.value) || 1))}
                style={{ width: 70, height: 36, border: `1.5px solid ${BORDER}`, borderRadius: 7, textAlign: 'center', fontSize: 14 }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: MUTED }}>
              UP TO (BPM)
              <input
                type="number" min={20} max={400} value={speedMax}
                onChange={e => setSpeedMax(Math.max(20, Math.min(400, Number(e.target.value) || 160)))}
                style={{ width: 70, height: 36, border: `1.5px solid ${BORDER}`, borderRadius: 7, textAlign: 'center', fontSize: 14 }}
              />
            </label>
          </div>
          <div style={{ fontSize: 12, color: FAINT, marginTop: 10 }}>{speedSummary}</div>
        </div>

        <div style={{ flex: 1, minWidth: 'min(300px,100%)', border: `1.5px solid ${BORDER_LIGHT}`, borderRadius: 14, background: '#fff', padding: '18px 20px', boxSizing: 'border-box' }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={gapOn}
              onChange={e => setGapOn(e.target.checked)}
              style={{ width: 20, height: 20, marginTop: 1, accentColor: ACCENT, cursor: 'pointer' }}
            />
            <span>
              <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600 }}>Silent bars</span>
              <span style={{ display: 'block', fontSize: 12.5, color: MUTED, lineHeight: 1.5, marginTop: 2 }}>
                Mutes the click for some bars so you keep time on your own.
              </span>
            </span>
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 14, opacity: gapOn ? 1 : 0.45 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: MUTED }}>
              BARS WITH CLICK
              <input
                type="number" min={1} max={16} value={gapPlay}
                onChange={e => setGapPlay(Math.max(1, Number(e.target.value) || 1))}
                style={{ width: 70, height: 36, border: `1.5px solid ${BORDER}`, borderRadius: 7, textAlign: 'center', fontSize: 14 }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: MUTED }}>
              BARS SILENT
              <input
                type="number" min={1} max={16} value={gapMute}
                onChange={e => setGapMute(Math.max(1, Number(e.target.value) || 1))}
                style={{ width: 70, height: 36, border: `1.5px solid ${BORDER}`, borderRadius: 7, textAlign: 'center', fontSize: 14 }}
              />
            </label>
          </div>
          <div style={{ fontSize: 12, color: FAINT, marginTop: 10 }}>{gapSummary}</div>
        </div>
      </div>
    </div>
  )
}
