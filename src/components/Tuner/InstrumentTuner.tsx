import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { analytics } from '@/lib/analytics'
import { preloadTunerInstrument, playTunerNote, type TunerInstrumentId } from '@/lib/tuner/tunerSamples'

// ── Note math ──────────────────────────────────────────────────────────────
const SEMIS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

function midiOf(n: string): number {
  const m = n.match(/^([A-G])([b#]?)(-?\d)$/)
  if (!m) return 69
  let s = SEMIS[m[1]]
  if (m[2] === 'b') s--
  if (m[2] === '#') s++
  return (parseInt(m[3], 10) + 1) * 12 + s
}

// Strips the trailing octave digit, keeps any accidental, then swaps it for the ♭/♯ glyph.
function labelOf(n: string): string {
  return n.replace(/-?\d$/, '').replace('b', '♭').replace('#', '♯')
}

// ── Instrument / tuning data (ported verbatim from the design) ─────────────
interface Tuning { name: string; notes: string[] }
interface Instrument { id: string; label: string; tunings: Tuning[] }

const INSTRUMENTS: Instrument[] = [
  { id: 'bass4', label: 'Bass (4-string)', tunings: [
    { name: 'Standard', notes: ['E1', 'A1', 'D2', 'G2'] },
    { name: 'Drop D', notes: ['D1', 'A1', 'D2', 'G2'] },
    { name: 'Drop C', notes: ['C1', 'A1', 'D2', 'G2'] },
    { name: 'Half Step Down', notes: ['Eb1', 'Ab1', 'Db2', 'Gb2'] },
    { name: 'Full Step Down', notes: ['D1', 'G1', 'C2', 'F2'] },
    { name: 'BEAD', notes: ['B0', 'E1', 'A1', 'D2'] } ] },
  { id: 'bass5', label: 'Bass (5-string)', tunings: [
    { name: 'Standard', notes: ['B0', 'E1', 'A1', 'D2', 'G2'] },
    { name: 'Drop A', notes: ['A0', 'E1', 'A1', 'D2', 'G2'] },
    { name: 'High C', notes: ['E1', 'A1', 'D2', 'G2', 'C3'] } ] },
  { id: 'electric', label: 'Electric', tunings: [
    { name: 'Standard', notes: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'] },
    { name: 'Drop D', notes: ['D2', 'A2', 'D3', 'G3', 'B3', 'E4'] },
    { name: 'Half Step Down', notes: ['Eb2', 'Ab2', 'Db3', 'Gb3', 'Bb3', 'Eb4'] },
    { name: 'Full Step Down', notes: ['D2', 'G2', 'C3', 'F3', 'A3', 'D4'] },
    { name: 'DADGAD', notes: ['D2', 'A2', 'D3', 'G3', 'A3', 'D4'] },
    { name: 'Open G', notes: ['D2', 'G2', 'D3', 'G3', 'B3', 'D4'] } ] },
  { id: 'acoustic', label: 'Acoustic', tunings: [
    { name: 'Standard', notes: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'] },
    { name: 'Drop D', notes: ['D2', 'A2', 'D3', 'G3', 'B3', 'E4'] },
    { name: 'Half Step Down', notes: ['Eb2', 'Ab2', 'Db3', 'Gb3', 'Bb3', 'Eb4'] },
    { name: 'Open D', notes: ['D2', 'A2', 'D3', 'F#3', 'A3', 'D4'] } ] },
  { id: 'ukulele', label: 'Ukulele', tunings: [
    { name: 'Standard', notes: ['G4', 'C4', 'E4', 'A4'] },
    { name: 'Low G', notes: ['G3', 'C4', 'E4', 'A4'] },
    { name: 'Baritone', notes: ['D3', 'G3', 'B3', 'E4'] } ] },
]

const PURPLE = '#6d28d9', GREEN = '#16a34a', AMBER = '#d97706', GREY = '#cfc8e2'

const THUMBS: Record<string, string> = {
  bass4: '/images/tuner/thumb-bass4.webp',
  bass5: '/images/tuner/thumb-bass5.webp',
  electric: '/images/tuner/thumb-electric.webp',
  acoustic: '/images/tuner/thumb-acoustic.webp',
  ukulele: '/images/tuner/thumb-ukulele.webp',
}

interface Peg { side: 'L' | 'R'; kx: number; ky: number; px: number; py: number; bx: number }
interface Headstock { src: string; w: number; h: number; nutY: number; pegs: Peg[] }

// Headstock maps (% of image box). pegs indexed low string -> high string.
// kx/ky = butterfly key center (pin anchor), px/py = string post, bx = string x at frame bottom.
const HEADSTOCKS: Record<string, Headstock> = {
  bass4: { src: '/images/tuner/bass4-headstock.webp', w: 352, h: 528, nutY: 62.5, pegs: [
    { side: 'L', kx: 29, ky: 50.4, px: 44.4, py: 52, bx: 47.6 },
    { side: 'L', kx: 32, ky: 38.4, px: 48.3, py: 41, bx: 51.6 },
    { side: 'L', kx: 38, ky: 27.7, px: 52.2, py: 31.9, bx: 55.2 },
    { side: 'L', kx: 41.5, ky: 16, px: 55.7, py: 21.5, bx: 58.9 } ] },
  bass5: { src: '/images/tuner/bass5-headstock.webp', w: 352, h: 528, nutY: 71.8, pegs: [
    { side: 'L', kx: 19.6, ky: 52.2, px: 37.9, py: 57.1, bx: 40.1 },
    { side: 'L', kx: 24.7, ky: 38.6, px: 42.6, py: 43.9, bx: 44.9 },
    { side: 'L', kx: 28.4, ky: 26.4, px: 46.7, py: 30.8, bx: 49.8 },
    { side: 'L', kx: 33.5, ky: 12.7, px: 51.5, py: 17.8, bx: 54.6 },
    { side: 'R', kx: 78.9, ky: 45.9, px: 60.6, py: 51, bx: 59.4 } ] },
  acoustic: { src: '/images/tuner/acoustic-headstock.webp', w: 352, h: 528, nutY: 75, pegs: [
    { side: 'L', kx: 18.8, ky: 54, px: 36.4, py: 55, bx: 38.1 },
    { side: 'L', kx: 18.8, ky: 36, px: 36.4, py: 36.5, bx: 43.1 },
    { side: 'L', kx: 18.8, ky: 18.5, px: 36.4, py: 19, bx: 48.1 },
    { side: 'R', kx: 80.5, ky: 18.5, px: 63.3, py: 19, bx: 53.1 },
    { side: 'R', kx: 80.5, ky: 36, px: 63.3, py: 36.5, bx: 58.1 },
    { side: 'R', kx: 80.5, ky: 54, px: 63.3, py: 55, bx: 63.2 } ] },
  electric: { src: '/images/tuner/electric-headstock.webp', w: 352, h: 528, nutY: 74.7, pegs: [
    { side: 'L', kx: 27.4, ky: 52.7, px: 34, py: 59.6, bx: 37.3 },
    { side: 'L', kx: 29.2, ky: 45.3, px: 38.4, py: 50.3, bx: 41.7 },
    { side: 'L', kx: 32.6, ky: 36, px: 42.5, py: 41.1, bx: 45.9 },
    { side: 'L', kx: 36.1, ky: 27.1, px: 46.3, py: 31.8, bx: 50.1 },
    { side: 'L', kx: 39.6, ky: 17.8, px: 50.1, py: 22.9, bx: 54.2 },
    { side: 'L', kx: 43.7, ky: 9.3, px: 54.1, py: 13.9, bx: 58.4 } ] },
  ukulele: { src: '/images/tuner/ukulele-headstock.webp', w: 352, h: 528, nutY: 66.3, pegs: [
    { side: 'L', kx: 26.1, ky: 47.6, px: 40.6, py: 51.4, bx: 41.9 },
    { side: 'L', kx: 31.6, ky: 35.4, px: 46, py: 39.9, bx: 48.3 },
    { side: 'L', kx: 35.3, ky: 24.7, px: 50.2, py: 28.1, bx: 53.9 },
    { side: 'L', kx: 39, ky: 14.2, px: 55.6, py: 16.7, bx: 58.2 } ] },
}

const A4 = 440
const TOL = 5 // ± cents considered "in tune"
const YL = Math.max(TOL + 5, 15) // ± cents considered "close" (amber zone)

function freqOf(note: string): number {
  return A4 * Math.pow(2, (midiOf(note) - 69) / 12)
}

// ── Pitch detection (NSDF-style normalized autocorrelation, ported verbatim) ─
function detectPitch(buf: Float32Array, sr: number): number {
  const N = buf.length
  let rms = 0
  for (let i = 0; i < N; i++) rms += buf[i] * buf[i]
  rms = Math.sqrt(rms / N)
  if (rms < 0.01) return -1

  const W = 2048
  const minLag = Math.max(2, Math.floor(sr / 1200))
  const maxLag = Math.min(Math.floor(sr / 26), N - W - 1)
  let e0 = 0
  for (let j = 0; j < W; j++) e0 += buf[j] * buf[j]
  let eLag = 0
  for (let j = minLag; j < minLag + W; j++) eLag += buf[j] * buf[j]

  const norms = new Float32Array(maxLag + 2)
  let globalMax = 0
  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0
    for (let j = 0; j < W; j++) corr += buf[j] * buf[j + lag]
    const v = corr / Math.sqrt(e0 * eLag + 1e-12)
    norms[lag] = v
    if (v > globalMax) globalMax = v
    eLag += buf[lag + W] * buf[lag + W] - buf[lag] * buf[lag]
  }
  if (globalMax < 0.85) return -1

  const thresh = 0.9 * globalMax
  let pick = -1
  for (let lag = minLag + 1; lag < maxLag; lag++) {
    if (norms[lag] >= thresh && norms[lag] >= norms[lag - 1] && norms[lag] >= norms[lag + 1]) { pick = lag; break }
  }
  if (pick < 0) return -1

  const a = norms[pick - 1], b = norms[pick], c = norms[pick + 1]
  const denom = a - 2 * b + c
  const shift = denom !== 0 ? 0.5 * (a - c) / denom : 0
  return sr / (pick + shift)
}

// ── Gauge geometry ───────────────────────────────────────────────────────────
function gaugePoint(c: number, r: number): string {
  return `${(210 + r * Math.sin((c * 0.9 * Math.PI) / 180)).toFixed(1)} ${(225 - r * Math.cos((c * 0.9 * Math.PI) / 180)).toFixed(1)}`
}
function gaugeArc(c1: number, c2: number): string {
  return `M ${gaugePoint(c1, 200)} A 200 200 0 0 1 ${gaugePoint(c2, 200)}`
}

type MicState = 'idle' | 'listening' | 'denied'
type Mode = 'manual' | 'auto'

export function InstrumentTuner() {
  const [instId, setInstId] = useState<string>('acoustic')
  const [tuningIdx, setTuningIdx] = useState(0)
  const [mode, setMode] = useState<Mode>('manual')
  const [selIdx, setSelIdx] = useState(0)
  const [mic, setMic] = useState<MicState>('idle')
  const [micError, setMicError] = useState('')
  const [freq, setFreq] = useState(0)
  const [cents, setCents] = useState(0)
  const [hasSignal, setHasSignal] = useState(false)
  const [live, setLive] = useState(false)

  // Instance-like mutable state that must survive across animation frames without re-rendering.
  const emaRef = useRef<number | null>(null)
  const historyRef = useRef<number[]>([])
  const pendSelRef = useRef<{ i: number; n: number } | null>(null)
  const silenceRef = useRef(0)
  const tunedRef = useRef(false)
  // performance.now() timestamp until which live detection is suppressed — set whenever we play
  // our own preview sound, since the mic (with echo cancellation deliberately off, for accuracy)
  // would otherwise pick up that speaker output as if it were a real played note.
  const mutedUntilRef = useRef(0)
  const PREVIEW_DURATION_SEC = 2.2
  const PREVIEW_TAIL_SEC = 0.5 // extra guard for room reverb/decay after playback ends

  const streamRef = useRef<MediaStream | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const bufRef = useRef<Float32Array<ArrayBuffer>>(new Float32Array(4096) as Float32Array<ArrayBuffer>)
  const rafRef = useRef<number | null>(null)
  const lastDetectRef = useRef(0)
  const toneCtxRef = useRef<AudioContext | null>(null)

  const inst = useMemo(() => INSTRUMENTS.find(i => i.id === instId) ?? INSTRUMENTS[0], [instId])
  const tuning = useMemo(() => inst.tunings[Math.min(tuningIdx, inst.tunings.length - 1)], [inst, tuningIdx])
  const head = HEADSTOCKS[inst.id]

  // Preview sound (string-pin clicks + reference tone) — separate, lightweight context from the
  // mic-input one below, so real sample playback works before the user grants mic permission.
  const getPreviewCtx = useCallback((): AudioContext => {
    if (!toneCtxRef.current) {
      toneCtxRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    }
    return toneCtxRef.current
  }, [])

  // Preload the current instrument's real samples on first load and whenever it changes, so
  // clicking a string pin or the reference tone button plays instantly with no fetch stall.
  useEffect(() => {
    preloadTunerInstrument(getPreviewCtx(), instId as TunerInstrumentId).catch(() => {})
  }, [instId, getPreviewCtx])

  const previewNote = useCallback((midi: number) => {
    const ctx = getPreviewCtx()
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    playTunerNote(ctx, ctx.destination, instId as TunerInstrumentId, midi, PREVIEW_DURATION_SEC)

    // Mute live pitch detection for the duration of the preview (+ a tail for room decay) so the
    // mic doesn't try to read back our own speaker output as a played note.
    mutedUntilRef.current = performance.now() + (PREVIEW_DURATION_SEC + PREVIEW_TAIL_SEC) * 1000
    emaRef.current = null
    historyRef.current = []
    pendSelRef.current = null
    silenceRef.current = 0
    setHasSignal(false)
    setLive(false)
  }, [instId, getPreviewCtx])

  const resetSignal = useCallback((extra: { selIdx?: number; mode?: Mode; instId?: string; tuningIdx?: number }) => {
    emaRef.current = null
    historyRef.current = []
    pendSelRef.current = null
    setHasSignal(false)
    setLive(false)
    if (extra.selIdx !== undefined) setSelIdx(extra.selIdx)
    if (extra.mode !== undefined) setMode(extra.mode)
    if (extra.instId !== undefined) setInstId(extra.instId)
    if (extra.tuningIdx !== undefined) setTuningIdx(extra.tuningIdx)
  }, [])

  // String-pin / note-button click: select the string and play the real sample for it
  const selectString = useCallback((i: number, notes: string[]) => {
    resetSignal({ selIdx: i, mode: 'manual' })
    previewNote(midiOf(notes[i]))
  }, [resetSignal, previewNote])

  // ── Pitch update (mirrors the design's _update) ───────────────────────────
  const update = useCallback((f: number) => {
    const notes = tuning.notes
    let idx = selIdx
    if (mode === 'auto') {
      let best = 0, bestD = Infinity
      notes.forEach((n, i) => {
        const d = Math.abs(1200 * Math.log2(f / freqOf(n)))
        if (d < bestD) { bestD = d; best = i }
      })
      // Require 3 consecutive agreeing frames before switching strings (no flicker)
      if (bestD < 450 && best !== idx) {
        pendSelRef.current = pendSelRef.current && pendSelRef.current.i === best
          ? { i: best, n: pendSelRef.current.n + 1 }
          : { i: best, n: 1 }
        if (pendSelRef.current.n >= 3) { idx = best; emaRef.current = null; pendSelRef.current = null; setSelIdx(best) }
      } else {
        pendSelRef.current = null
      }
    }
    const target = freqOf(notes[idx])
    const raw = 1200 * Math.log2(f / target)
    // Adaptive smoothing: gentle for small wobble, fast for real changes
    if (emaRef.current == null) emaRef.current = raw
    else {
      const diff = raw - emaRef.current, ad = Math.abs(diff)
      if (ad > 30) emaRef.current = raw // new pluck / big turn of the peg
      else emaRef.current += Math.min(0.35, 0.07 + ad * 0.012) * diff
    }
    let c = emaRef.current
    if (Math.abs(c) < 0.7) c = 0 // dead zone at center
    setFreq(f)
    setCents(c)
    setHasSignal(true)
    setLive(true)
  }, [tuning, selIdx, mode])

  // `loop` re-schedules itself via requestAnimationFrame(loop), so its identity must stay stable
  // forever — if it depended on `update` (which changes on every string/tuning selection), the
  // running rAF chain would stay pinned to whichever `update` closure existed when startMic() first
  // fired, silently ignoring every later selection change. Route through a ref instead so the loop
  // always calls the *current* update.
  const updateRef = useRef(update)
  useEffect(() => { updateRef.current = update }, [update])

  const loop = useCallback(() => {
    rafRef.current = requestAnimationFrame(loop)
    const now = performance.now()
    if (now - lastDetectRef.current < 33) return
    lastDetectRef.current = now
    if (performance.now() < mutedUntilRef.current) return // suppressed while our own preview sound plays
    const analyser = analyserRef.current, ctx = ctxRef.current
    if (!analyser || !ctx) return
    analyser.getFloatTimeDomainData(bufRef.current)
    const f = detectPitch(bufRef.current, ctx.sampleRate)
    if (f > 0) {
      historyRef.current.push(f)
      if (historyRef.current.length > 11) historyRef.current.shift()
      const sorted = [...historyRef.current].sort((a, b) => a - b)
      const med = sorted[Math.floor(sorted.length / 2)]
      updateRef.current(med)
      silenceRef.current = 0
    } else {
      // Hold the last reading on the needle; just mark the signal as stale
      silenceRef.current += 1
      if (silenceRef.current > 16) {
        historyRef.current = []
        pendSelRef.current = null
        setLive(false)
      }
    }
  }, [])

  const startMic = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      })
      streamRef.current = stream
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      ctxRef.current = ctx
      const src = ctx.createMediaStreamSource(stream)
      // Band-pass: kill DC offset / rumble below 25 Hz and noise above ~1.5 kHz
      const hp = ctx.createBiquadFilter()
      hp.type = 'highpass'; hp.frequency.value = 25; hp.Q.value = 0.7
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'; lp.frequency.value = 1500; lp.Q.value = 0.7
      const an = ctx.createAnalyser()
      an.fftSize = 4096
      src.connect(hp); hp.connect(lp); lp.connect(an)
      analyserRef.current = an
      bufRef.current = new Float32Array(an.fftSize) as Float32Array<ArrayBuffer>
      lastDetectRef.current = 0
      historyRef.current = []
      setMic('listening')
      analytics.toolWidgetUsed('tuner')
      loop()
    } catch (e) {
      const name = e instanceof DOMException ? e.name : 'unknown error'
      let msg = `Microphone access failed (${name}). `
      if (name === 'NotFoundError') msg = 'No microphone was found on this device. '
      else if (name === 'NotAllowedError' || name === 'SecurityError') msg = "Microphone access was blocked. Click the mic/camera icon in your browser's address bar to allow it, then try again. "
      msg += 'You can still tune by ear with the reference tone.'
      setMicError(msg)
      setMic('denied')
    }
  }, [loop])

  const playTone = useCallback(() => {
    previewNote(midiOf(tuning.notes[Math.min(selIdx, tuning.notes.length - 1)]))
  }, [tuning, selIdx, previewNote])

  const toggleAuto = useCallback(() => setMode(m => (m === 'auto' ? 'manual' : 'auto')), [])

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    ctxRef.current?.close().catch(() => {})
    toneCtxRef.current?.close().catch(() => {})
  }, [])

  // ── Derived render values ──────────────────────────────────────────────────
  const notes = tuning.notes
  const selectedIdx = Math.min(selIdx, notes.length - 1)
  const absCents = Math.abs(cents)
  const inTune = hasSignal && live && (tunedRef.current ? absCents <= TOL + 3 : absCents <= TOL)
  tunedRef.current = inTune

  const clamped = Math.max(-50, Math.min(50, cents))
  const needleDeg = hasSignal ? clamped * 0.9 : 0
  const statusColor = !hasSignal || !live ? '#6f6790' : inTune ? GREEN : AMBER
  const needleColor = !hasSignal ? GREY : !live ? '#b6aed0' : inTune ? GREEN : PURPLE
  let statusText = 'Play a string to begin'
  if (mic === 'idle') statusText = 'Microphone is off'
  else if (hasSignal && !live) statusText = 'Holding last reading — play again'
  else if (hasSignal) statusText = inTune ? 'In tune' : cents < 0 ? 'Too low — tighten the string' : 'Too high — loosen the string'

  const target = freqOf(notes[selectedIdx])

  const stringsDisplay = useMemo(() => notes.map((n, i) => {
    const sel = i === selectedIdx
    const good = sel && inTune
    return {
      note: labelOf(n),
      border: good ? GREEN : sel ? PURPLE : GREY,
      bg: good ? '#e8f7ee' : sel ? '#f2edfb' : '#ffffff',
      color: good ? GREEN : sel ? PURPLE : '#4b4463',
      onSelect: () => selectString(i, notes),
    }
  }).reverse(), [notes, selectedIdx, inTune, selectString])

  const pinYs = useMemo(() => {
    const ys: Record<number, number> = {}
    if (!head) return ys
    const MIN = 9.5
    for (const side of ['L', 'R'] as const) {
      const grp = head.pegs
        .map((p, i) => ({ i, ky: p.ky, side: p.side }))
        .filter(p => p.side === side)
        .sort((a, b) => a.ky - b.ky)
      if (!grp.length) continue
      let gapOk = true
      for (let j = 1; j < grp.length; j++) if (grp[j].ky - grp[j - 1].ky < MIN) gapOk = false
      if (gapOk) { grp.forEach(g => { ys[g.i] = g.ky }); continue }
      const span = (grp.length - 1) * MIN
      const mean = grp.reduce((s, g) => s + g.ky, 0) / grp.length
      const start = Math.max(5.5, Math.min(mean - span / 2, 94.5 - span))
      grp.forEach((g, j) => { ys[g.i] = +(start + j * MIN).toFixed(1) })
    }
    return ys
  }, [head])

  const pegPins = useMemo(() => {
    if (!head) return []
    return notes.map((n, i) => {
      const pg = head.pegs[i]
      const sel = i === selectedIdx
      const good = sel && inTune
      return {
        note: labelOf(n), kx: pg.kx, ky: pg.ky, pinY: pinYs[i] ?? pg.ky,
        lx: pg.side === 'L' ? 15.3 : 84.7,
        isLeft: pg.side === 'L', isRight: pg.side === 'R',
        border: good ? GREEN : sel ? PURPLE : GREY,
        bg: good ? '#e8f7ee' : sel ? '#f2edfb' : '#ffffff',
        color: good ? GREEN : sel ? PURPLE : '#4b4463',
        onSelect: () => selectString(i, notes),
      }
    })
  }, [head, notes, selectedIdx, inTune, pinYs, selectString])

  const stringPoints = useMemo(() => {
    if (!head) return ''
    const selPeg = head.pegs[selectedIdx]
    return `${selPeg.px},${selPeg.py} ${selPeg.bx},${head.nutY} ${selPeg.bx},100`
  }, [head, selectedIdx])

  const instruments = useMemo(() => INSTRUMENTS.map(i => {
    const sel = i.id === inst.id
    return {
      id: i.id, label: i.label, selected: sel,
      thumb: THUMBS[i.id],
      border: sel ? PURPLE : '#e5e0f0', color: sel ? PURPLE : '#4b4463',
      onSelect: () => resetSignal({ instId: i.id, tuningIdx: 0, selIdx: 0 }),
    }
  }), [inst, resetSignal])

  const tunings = useMemo(() => inst.tunings.map((t, i) => {
    const sel = i === Math.min(tuningIdx, inst.tunings.length - 1)
    return {
      name: t.name, selected: sel,
      notesLabel: t.notes.map(labelOf).join(' '),
      border: sel ? PURPLE : '#e5e0f0', bg: sel ? '#f2edfb' : '#ffffff',
      onSelect: () => resetSignal({ tuningIdx: i, selIdx: 0 }),
    }
  }), [inst, tuningIdx, resetSignal])

  const arcTrack = gaugeArc(-50, 50)
  const arcYellow = `${gaugeArc(-YL, -TOL)} ${gaugeArc(TOL, YL)}`
  const arcGreen = gaugeArc(-TOL, TOL)
  const { tickMinorD, tickMajorD, tickZeroD } = useMemo(() => {
    let minor = '', major = ''
    for (let c = -50; c <= 50; c += 10) {
      if (c === 0) continue
      const isMajor = Math.abs(c) === 50
      const seg = `M ${gaugePoint(c, isMajor ? 170 : 178)} L ${gaugePoint(c, 188)} `
      if (isMajor) major += seg; else minor += seg
    }
    return { tickMinorD: minor, tickMajorD: major, tickZeroD: `M ${gaugePoint(0, 170)} L ${gaugePoint(0, 188)}` }
  }, [])

  const freqTable = useMemo(() => notes.map((n, i) => ({
    string: `String ${notes.length - i}${i === 0 ? ' (thickest)' : i === notes.length - 1 ? ' (thinnest)' : ''}`,
    note: labelOf(n) + (n.match(/-?\d$/)?.[0] ?? ''),
    hz: freqOf(n).toFixed(2),
  })), [notes])

  const auto = mode === 'auto'
  const currentSelectionLabel = `${inst.label} — ${tuning.name}`
  const toneLabel = `Play reference tone · ${labelOf(notes[selectedIdx])}`
  const bigNote = labelOf(notes[selectedIdx])
  const centsLabel = hasSignal ? `${cents >= 0 ? '+' : '−'}${Math.abs(cents).toFixed(0)}¢` : '—'
  const freqLine = `${hasSignal ? freq.toFixed(1) + ' Hz detected · ' : ''}target ${target.toFixed(2)} Hz`

  const fontSans: React.CSSProperties = { fontFamily: "'Archivo', sans-serif" }
  const fontMono: React.CSSProperties = { fontFamily: "'IBM Plex Mono', monospace" }

  return (
    <div style={{ ...fontSans, color: '#241f33' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 32, alignItems: 'flex-start', justifyContent: 'center' }}>

        {/* Headstock / string picker */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'stretch', flex: '0 1 auto' }}>
          {head ? (
            <div style={{ position: 'relative', width: 'min(352px, 90vw)', aspectRatio: '2 / 3' }}>
              <div role="img" aria-label="Headstock" style={{ position: 'absolute', inset: 0, backgroundImage: `url('${head.src}')`, backgroundSize: 'contain', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', pointerEvents: 'none' }} />
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                {pegPins.map((p, i) => (
                  <line key={i} x1={p.lx} y1={p.pinY} x2={p.kx} y2={p.ky} stroke={p.border} strokeWidth={2} vectorEffect="non-scaling-stroke" />
                ))}
                <polyline points={stringPoints} fill="none" stroke={inTune ? GREEN : PURPLE} strokeWidth={3.5} vectorEffect="non-scaling-stroke" strokeLinecap="round" opacity={0.8} />
              </svg>
              {pegPins.map((p, i) => (
                <button
                  key={i}
                  onClick={p.onSelect}
                  aria-label={`Select string ${p.note}`}
                  style={{
                    position: 'absolute', [p.isLeft ? 'left' : 'right']: 6, top: `calc(${p.pinY}% - 24px)`,
                    width: 48, height: 48, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    ...fontMono, fontSize: 19, fontWeight: 600, border: `2px solid ${p.border}`, background: p.bg, color: p.color,
                    cursor: 'pointer', transition: 'all 0.15s', boxShadow: '0 2px 8px rgba(36,31,51,0.08)',
                  }}
                >
                  {p.note}
                </button>
              ))}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-around', gap: 10, padding: '12px 0' }}>
              {stringsDisplay.map((s, i) => (
                <button key={i} onClick={s.onSelect} aria-label={`Select string ${s.note}`} style={{ display: 'flex', alignItems: 'center', gap: 0, border: 'none', background: 'none', padding: 0, cursor: 'pointer' }}>
                  <span style={{ width: 56, height: 56, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', ...fontMono, fontSize: 20, fontWeight: 600, border: `2px solid ${s.border}`, background: s.bg, color: s.color, transition: 'all 0.15s' }}>{s.note}</span>
                  <span style={{ width: 28, height: 2, background: s.border }} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Gauge + controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, flex: '1 1 420px', minWidth: 0 }}>
          <div style={{ background: '#ffffff', border: '1px solid #e5e0f0', borderRadius: 20, padding: 'clamp(16px,4vw,28px) clamp(16px,4vw,28px) 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <svg viewBox="0 0 420 240" style={{ width: '100%', maxWidth: 440, height: 'auto', display: 'block' }}>
              <path d={arcTrack} stroke="#eeeaf6" strokeWidth={13} fill="none" strokeLinecap="round" />
              <path d={arcYellow} stroke="#fbbf24" strokeWidth={13} fill="none" />
              <path d={arcGreen} stroke="#22c55e" strokeWidth={13} fill="none" />
              <path d={tickMinorD} stroke="#d8d1e8" strokeWidth={2} fill="none" />
              <path d={tickMajorD} stroke="#b9aed6" strokeWidth={3} fill="none" />
              <path d={tickZeroD} stroke="#6d28d9" strokeWidth={3} fill="none" />
              <text x="103.9" y="122.9" textAnchor="middle" fill="#a49bc4" style={{ ...fontMono, fontSize: 11 }}>−50</text>
              <text x="210" y="79" textAnchor="middle" fill="#a49bc4" style={{ ...fontMono, fontSize: 11 }}>0</text>
              <text x="316.1" y="122.9" textAnchor="middle" fill="#a49bc4" style={{ ...fontMono, fontSize: 11 }}>+50</text>
              <g style={{ transform: `rotate(${needleDeg}deg)`, transformOrigin: '210px 225px', transition: 'transform 0.35s cubic-bezier(0.22,1,0.36,1)' }}>
                <line x1="210" y1="225" x2="210" y2="62" stroke={needleColor} strokeWidth={4} strokeLinecap="round" />
              </g>
              <circle cx="210" cy="225" r="13" fill={needleColor} />
            </svg>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginTop: 8 }}>
              <span style={{ ...fontMono, fontSize: 'clamp(38px,9vw,52px)', fontWeight: 600, lineHeight: 1, color: statusColor }}>{bigNote}</span>
              <span style={{ ...fontMono, fontSize: 18, color: '#6f6790' }}>{centsLabel}</span>
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: statusColor }}>{statusText}</div>
            <div style={{ ...fontMono, fontSize: 13, color: '#a49bc4' }}>{freqLine}</div>
            <div style={{ display: 'flex', gap: 16, marginTop: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#6f6790' }}><span style={{ width: 10, height: 10, borderRadius: 3, background: '#22c55e' }} />In tune (±{TOL}¢)</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#6f6790' }}><span style={{ width: 10, height: 10, borderRadius: 3, background: '#fbbf24' }} />Close (±{YL}¢)</span>
            </div>
            <button onClick={playTone} style={{ marginTop: 10, border: '1px solid #ded2f5', background: '#f2edfb', color: '#4c1d95', borderRadius: 10, padding: '8px 16px', ...fontSans, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{toneLabel}</button>
          </div>

          {mic === 'idle' && (
            <button onClick={startMic} style={{ border: 'none', borderRadius: 14, background: '#6d28d9', color: '#ffffff', ...fontSans, fontSize: 17, fontWeight: 700, padding: '16px 24px', cursor: 'pointer', letterSpacing: '0.02em' }}>Enable microphone to start tuning</button>
          )}
          {mic === 'listening' && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: '#f2edfb', border: '1px solid #ded2f5', borderRadius: 14, padding: '12px 18px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="animate-pulse" style={{ width: 10, height: 10, borderRadius: '50%', background: '#6d28d9' }} />
                <span style={{ fontSize: 14, fontWeight: 600, color: '#4c1d95' }}>Listening… play one string at a time</span>
              </div>
              <button onClick={toggleAuto} style={{ border: `1px solid ${auto ? PURPLE : '#cfc8e2'}`, background: auto ? PURPLE : '#ffffff', color: auto ? '#ffffff' : '#4b4463', borderRadius: 10, padding: '8px 14px', ...fontSans, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{auto ? 'Auto string detect: ON' : 'Auto string detect: OFF'}</button>
            </div>
          )}
          {mic === 'denied' && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: '#fdf1e7', border: '1px solid #f3d9bd', borderRadius: 14, padding: '12px 18px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 14, color: '#92400e', maxWidth: 520 }}>{micError || 'Microphone access was blocked.'}</span>
              <button onClick={startMic} style={{ border: 'none', background: '#92400e', color: '#ffffff', borderRadius: 10, padding: '8px 16px', ...fontSans, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Try again</button>
            </div>
          )}

          <div>
            <h2 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 800, letterSpacing: '0.1em', color: '#6f6790' }}>SWITCH INSTRUMENT</h2>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {instruments.map(i => (
                <button key={i.id} onClick={i.onSelect} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: 10, borderRadius: 14, border: `2px solid ${i.border}`, background: '#ffffff', cursor: 'pointer' }}>
                  <div role="img" aria-label={i.label} style={{ width: 96, height: 68, backgroundImage: `url('${i.thumb}')`, backgroundSize: 'contain', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }} />
                  <span style={{ ...fontSans, fontSize: 13, fontWeight: 600, color: i.color }}>{i.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <h2 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 800, letterSpacing: '0.1em', color: '#6f6790' }}>SELECT TUNING</h2>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }} role="radiogroup" aria-label="Select tuning">
              {tunings.map((t, i) => (
                <button key={i} onClick={t.onSelect} role="radio" aria-checked={t.selected} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, padding: '10px 16px', borderRadius: 12, border: `2px solid ${t.border}`, background: t.bg, cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ ...fontSans, fontSize: 14, fontWeight: 700, color: '#241f33' }}>{t.name}</span>
                  <span style={{ ...fontMono, fontSize: 12, color: '#6f6790' }}>{t.notesLabel}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Target frequencies — depends on the live selection, so it lives in the island */}
      <div style={{ marginTop: 40 }}>
        <h2 style={{ margin: '0 0 6px', fontSize: 28, fontWeight: 800, letterSpacing: '-0.01em' }}>Target frequencies</h2>
        <p style={{ margin: '0 0 16px', fontSize: 15, color: '#6f6790' }}>Current selection: {currentSelectionLabel}.</p>
        <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid #e5e0f0', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', background: '#faf9fc', padding: '12px 20px', fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', color: '#6f6790', borderBottom: '1px solid #e5e0f0' }}>
            <span>STRING</span><span>NOTE</span><span>FREQUENCY</span>
          </div>
          {freqTable.map((row, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '12px 20px', fontSize: 15, borderBottom: '1px solid #f1eef8' }}>
              <span style={{ color: '#6f6790' }}>{row.string}</span>
              <span style={{ ...fontMono, fontWeight: 600 }}>{row.note}</span>
              <span style={{ ...fontMono, color: '#6d28d9' }}>{row.hz} Hz</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
