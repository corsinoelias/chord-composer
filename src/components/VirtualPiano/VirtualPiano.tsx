import React, { useCallback, useEffect, useRef, useState } from 'react'
import { PIANO_SONGS, type PianoNote, type PianoSong } from '../../lib/virtualPiano/pianoSongs'
import { getPianoSample, loadPianoSamples } from '../../lib/virtualPiano/pianoSamples'

// Ported from the user's Claude Design project "Piano virtual realista"
// (Virtual Piano.dc.html) — same audio synthesis, recording, marks, MIDI
// in/out, song library and waterfall behavior as the original. The
// synthesized 'piano' voice from that design is kept as "Classic Piano";
// 'acoustic' is a real sampled grand piano (see pianoSamples.ts), reusing
// the same sample set as the Chord Player's own engine.

type InstrumentId = 'acoustic' | 'piano' | 'epiano' | 'organ' | 'synth' | 'strings' | 'musicbox'
type LabelMode = 'none' | 'notes' | 'keys'
type Notation = 'latina' | 'anglo'
type RecState = 'idle' | 'count' | 'rec' | 'done'
type BannerMode = 'auto' | 'wf' | 'result'

interface Banner { name: string; mode: BannerMode }
interface RecEvent { midi: number; vel: number; inst: InstrumentId; tOn: number; tOff: number | null }
interface WfNote { midi: number; t: number; dur: number; hit: boolean; missed: boolean }
interface WfState { mode: 'auto' | 'wf'; notes: WfNote[]; start: number; lead: number }
interface Voice { release: (t: number) => void }
interface PlayableSong { name: string; bpm: number; notes: PianoNote[] }

const ACCENT = '#7C3AED'
const WOOD_BG = 'linear-gradient(172deg, #37332e 0%, #1a1714 55%, #23201b 100%)'

const WS = [0, 2, 4, 5, 7, 9, 11]
const LAT = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si']
const ANG = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const ROW = 'QWERTYUIOP'

function buildSampleVoice(ctx: BaseAudioContext, dest: AudioNode, buf: AudioBuffer, t: number, vel: number): Voice {
  const peak = 0.32 * vel
  const source = ctx.createBufferSource()
  source.buffer = buf
  const gainNode = ctx.createGain()
  source.connect(gainNode)
  gainNode.connect(dest)
  gainNode.gain.setValueAtTime(0.0001, t)
  gainNode.gain.linearRampToValueAtTime(peak, t + 0.01)
  source.start(t)
  return {
    release: (rt: number) => {
      gainNode.gain.cancelScheduledValues(rt)
      gainNode.gain.setValueAtTime(gainNode.gain.value, rt)
      gainNode.gain.linearRampToValueAtTime(0.0001, rt + 0.28)
      try { source.stop(rt + 0.35) } catch { /* already stopped */ }
    },
  }
}

function buildVoice(ctx: BaseAudioContext, dest: AudioNode, inst: InstrumentId, midi: number, t: number, vel: number): Voice {
  if (inst === 'acoustic') {
    const buf = getPianoSample(midi)
    if (buf) return buildSampleVoice(ctx, dest, buf, t, vel)
    inst = 'piano' // sample not loaded yet (or genuinely missing) — fall through to synthesis
  }

  const f = 440 * Math.pow(2, (midi - 69) / 12)
  const out = ctx.createGain()
  out.connect(dest)
  const oscs: OscillatorNode[] = []
  const mk = (type: OscillatorType, freq: number, g: number) => {
    const o = ctx.createOscillator()
    o.type = type; o.frequency.value = freq
    const gn = ctx.createGain(); gn.gain.value = g
    o.connect(gn); gn.connect(out); o.start(t)
    oscs.push(o)
    return o
  }
  const env = out.gain
  const peak = 0.32 * vel
  env.setValueAtTime(0.0001, t)
  let relTime = 0.3
  if (inst === 'piano') {
    mk('triangle', f, 1); mk('sine', f * 2, 0.28); mk('sine', f * 3.001, 0.08)
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800 + 3500 * vel
    out.disconnect(); out.connect(lp); lp.connect(dest)
    env.linearRampToValueAtTime(peak, t + 0.006)
    env.setTargetAtTime(peak * 0.12, t + 0.006, 1.4)
    relTime = 0.25
  } else if (inst === 'epiano') {
    mk('sine', f, 1); mk('sine', f * 3, 0.14)
    const lfo = ctx.createOscillator(); lfo.frequency.value = 5.2
    const lg = ctx.createGain(); lg.gain.value = 0.12 * peak
    lfo.connect(lg); lg.connect(env); lfo.start(t); oscs.push(lfo)
    env.linearRampToValueAtTime(peak, t + 0.004)
    env.setTargetAtTime(peak * 0.2, t + 0.004, 1.1)
    relTime = 0.2
  } else if (inst === 'organ') {
    mk('sine', f, 0.5); mk('sine', f * 2, 0.34); mk('sine', f * 3, 0.18); mk('sine', f * 4, 0.12)
    env.linearRampToValueAtTime(peak, t + 0.03)
    relTime = 0.09
  } else if (inst === 'synth') {
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 4
    lp.frequency.setValueAtTime(250, t)
    lp.frequency.exponentialRampToValueAtTime(2600 + 2000 * vel, t + 0.09)
    out.disconnect(); out.connect(lp); lp.connect(dest)
    mk('sawtooth', f * Math.pow(2, -0.06 / 12), 0.5); mk('sawtooth', f * Math.pow(2, 0.06 / 12), 0.5)
    env.linearRampToValueAtTime(peak, t + 0.01)
    env.setTargetAtTime(peak * 0.65, t + 0.01, 0.4)
    relTime = 0.22
  } else if (inst === 'strings') {
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200
    out.disconnect(); out.connect(lp); lp.connect(dest)
    mk('sawtooth', f, 0.34); mk('sawtooth', f * Math.pow(2, 0.09 / 12), 0.34); mk('sawtooth', f * Math.pow(2, -0.09 / 12), 0.34)
    env.linearRampToValueAtTime(peak * 0.9, t + 0.35)
    relTime = 0.5
  } else { // musicbox
    mk('sine', f, 1); mk('sine', f * 4.2, 0.22); mk('sine', f * 7.9, 0.06)
    env.linearRampToValueAtTime(peak, t + 0.003)
    env.setTargetAtTime(0.0001, t + 0.003, 0.45)
    relTime = 0.12
  }
  return {
    release: (rt: number) => {
      env.cancelScheduledValues(rt)
      env.setTargetAtTime(0.0001, rt, relTime / 3)
      oscs.forEach(o => { try { o.stop(rt + relTime * 2 + 0.1) } catch { /* already stopped */ } })
    },
  }
}

function download(blob: Blob, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}

function encodeWav(buf: AudioBuffer): Blob {
  const n = buf.length, ch = buf.numberOfChannels, sr = buf.sampleRate
  const bytes = 44 + n * ch * 2
  const ab = new ArrayBuffer(bytes)
  const dv = new DataView(ab)
  const ws = (o: number, s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)) }
  ws(0, 'RIFF'); dv.setUint32(4, bytes - 8, true); ws(8, 'WAVE'); ws(12, 'fmt ')
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, ch, true)
  dv.setUint32(24, sr, true); dv.setUint32(28, sr * ch * 2, true); dv.setUint16(32, ch * 2, true)
  dv.setUint16(34, 16, true); ws(36, 'data'); dv.setUint32(40, n * ch * 2, true)
  let off = 44
  const chans: Float32Array[] = []
  for (let c = 0; c < ch; c++) chans.push(buf.getChannelData(c))
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) {
    const s = Math.max(-1, Math.min(1, chans[c][i]))
    dv.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true); off += 2
  }
  return new Blob([ab], { type: 'audio/wav' })
}

function parseMidiFile(d: Uint8Array, name: string): PlayableSong {
  let p = 0
  const u32 = () => (d[p++] << 24) | (d[p++] << 16) | (d[p++] << 8) | d[p++]
  const u16 = () => (d[p++] << 8) | d[p++]
  if (u32() !== 0x4d546864) throw new Error('bad header')
  u32(); u16()
  const nTracks = u16()
  const div = u16()
  let uspb = 500000
  const raw: { tick: number; midi: number; on: boolean; vel: number }[] = []
  for (let tr = 0; tr < nTracks; tr++) {
    if (u32() !== 0x4d54726b) throw new Error('bad track')
    const len = u32()
    const end = p + len
    let tick = 0, run = 0
    while (p < end) {
      let v = 0, b
      do { b = d[p++]; v = (v << 7) | (b & 0x7f) } while (b & 0x80)
      tick += v
      let st = d[p]
      if (st & 0x80) { p++; run = st } else st = run
      const cmd = st & 0xf0
      if (cmd === 0x90 || cmd === 0x80) {
        const note = d[p++], vel = d[p++]
        raw.push({ tick, midi: note, on: cmd === 0x90 && vel > 0, vel: vel / 127 })
      } else if (cmd === 0xa0 || cmd === 0xb0 || cmd === 0xe0) p += 2
      else if (cmd === 0xc0 || cmd === 0xd0) p += 1
      else if (st === 0xff) {
        const type = d[p++]
        let l = 0; do { b = d[p++]; l = (l << 7) | (b & 0x7f) } while (b & 0x80)
        if (type === 0x51) uspb = (d[p] << 16) | (d[p + 1] << 8) | d[p + 2]
        p += l
      } else if (st === 0xf0 || st === 0xf7) {
        let l = 0; do { b = d[p++]; l = (l << 7) | (b & 0x7f) } while (b & 0x80)
        p += l
      } else break
    }
    p = end
  }
  const bpm = 60000000 / uspb
  const beats = (t: number) => t / div
  const open: Record<number, { tick: number }> = {}
  const notes: PianoNote[] = []
  raw.sort((a, b) => a.tick - b.tick)
  raw.forEach(ev => {
    if (ev.on) open[ev.midi] = ev
    else if (open[ev.midi]) {
      const o = open[ev.midi]
      notes.push([ev.midi, beats(o.tick), Math.max(beats(ev.tick - o.tick), 0.1)])
      delete open[ev.midi]
    }
  })
  return { name: name.replace(/\.midi?$/i, ''), bpm, notes }
}

function btn(on: boolean): React.CSSProperties {
  return {
    fontFamily: 'inherit', borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer',
    background: on ? ACCENT : '#EDE8F5', color: on ? '#FFFFFF' : '#2B2438',
    border: '1px solid ' + (on ? ACCENT : '#D9D0E8'), fontWeight: on ? 600 : 400,
  }
}

export function VirtualPiano() {
  const [baseOctave, setBaseOctave] = useState(3)
  const [nOct, setNOct] = useState(3)
  const [octOverride, setOctOverride] = useState<number | null>(null)
  const [instrument, setInstrument] = useState<InstrumentId>('acoustic')
  const [volume, setVolume] = useState(0.8)
  const [labelMode, setLabelMode] = useState<LabelMode>('none')
  const [notation, setNotation] = useState<Notation>('latina')
  const [active, setActive] = useState<Record<number, boolean>>({})
  const [marked, setMarked] = useState<number[]>([])
  const [markMode, setMarkMode] = useState(false)
  const [recState, setRecState] = useState<RecState>('idle')
  const [recSecs, setRecSecs] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [midiName, setMidiName] = useState('')
  const [banner, setBanner] = useState<Banner | null>(null)
  const [wfScore, setWfScore] = useState(0)
  const [wfTotal, setWfTotal] = useState(0)
  const [playRecActive, setPlayRecActive] = useState(false)
  const [isFs, setIsFs] = useState(false)
  const [fauxFs, setFauxFs] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [recMenu, setRecMenu] = useState(false)

  // Mirrors of state for use inside imperative callbacks (keyboard/MIDI/timers)
  // that must always read the latest value without being recreated every render.
  const baseOctaveRef = useRef(baseOctave); baseOctaveRef.current = baseOctave
  const nOctRef = useRef(nOct); nOctRef.current = nOct
  const octOverrideRef = useRef(octOverride); octOverrideRef.current = octOverride
  const instrumentRef = useRef(instrument); instrumentRef.current = instrument
  const volumeRef = useRef(volume); volumeRef.current = volume
  const activeRef = useRef(active); activeRef.current = active
  const markedRef = useRef(marked); markedRef.current = marked
  const markModeRef = useRef(markMode); markModeRef.current = markMode
  const recStateRef = useRef(recState); recStateRef.current = recState
  const fauxFsRef = useRef(fauxFs); fauxFsRef.current = fauxFs
  const wfScoreRef = useRef(wfScore); wfScoreRef.current = wfScore
  const wfTotalRef = useRef(wfTotal); wfTotalRef.current = wfTotal

  const wfCanvasRef = useRef<HTMLCanvasElement>(null)
  const pianoWrapRef = useRef<HTMLDivElement>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const masterRef = useRef<GainNode | null>(null)
  const voicesRef = useRef<Record<number, Voice>>({})
  const timeoutsRef = useRef<number[]>([])
  const recEventsRef = useRef<RecEvent[]>([])
  const heldCodesRef = useRef<Record<string, number>>({})
  const wfRef = useRef<WfState | null>(null)
  const rafIdRef = useRef<number | null>(null)
  const ptrRef = useRef(false)
  const recStartRef = useRef(0)
  const countTimerRef = useRef<number | null>(null)
  const recTimerRef = useRef<number | null>(null)

  const computeAutoOct = () => {
    const w = window.innerWidth
    return w < 540 ? 1 : w < 900 ? 2 : 3
  }

  const resize = useCallback(() => {
    if (octOverrideRef.current !== null) return
    const nOctNew = computeAutoOct()
    if (nOctNew !== nOctRef.current) {
      setNOct(nOctNew)
      setBaseOctave(b => Math.min(b, 7 - nOctNew))
    }
  }, [])

  const setDensity = useCallback((n: number | null) => {
    if (n === null) {
      setOctOverride(null)
      const nOctNew = computeAutoOct()
      setNOct(nOctNew)
      setBaseOctave(b => Math.min(b, 7 - nOctNew))
    } else {
      setOctOverride(n)
      setNOct(n)
      setBaseOctave(b => Math.min(b, 7 - n))
    }
  }, [])

  const ensureCtx = useCallback((): AudioContext => {
    if (!ctxRef.current) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new AC()
      const master = ctx.createGain()
      master.gain.value = volumeRef.current
      const comp = ctx.createDynamicsCompressor()
      master.connect(comp)
      comp.connect(ctx.destination)
      ctxRef.current = ctx
      masterRef.current = master
    }
    if (ctxRef.current.state === 'suspended') ctxRef.current.resume()
    return ctxRef.current
  }, [])

  const wfHit = useCallback((midi: number) => {
    const wf = wfRef.current
    if (!wf) return
    const el = performance.now() / 1000 - wf.start
    const n = wf.notes.find(n => !n.hit && !n.missed && n.midi === midi && Math.abs(n.t - el) < 0.35)
    if (n) { n.hit = true; setWfScore(s => s + 1) }
  }, [])

  const noteOn = useCallback((midi: number, vel = 0.9) => {
    if (midi < 12 || midi > 108) return
    const ctx = ensureCtx()
    const t = ctx.currentTime
    if (voicesRef.current[midi]) voicesRef.current[midi].release(t)
    voicesRef.current[midi] = buildVoice(ctx, masterRef.current as GainNode, instrumentRef.current, midi, t, vel)
    if (recStateRef.current === 'rec') {
      recEventsRef.current.push({ midi, vel, inst: instrumentRef.current, tOn: performance.now() / 1000 - recStartRef.current, tOff: null })
    }
    if (wfRef.current && wfRef.current.mode === 'wf') wfHit(midi)
    setActive(a => ({ ...a, [midi]: true }))
  }, [ensureCtx, wfHit])

  const noteOff = useCallback((midi: number) => {
    const v = voicesRef.current[midi]
    if (v) { v.release((ctxRef.current as AudioContext).currentTime); delete voicesRef.current[midi] }
    if (recStateRef.current === 'rec') {
      const evs = recEventsRef.current
      for (let i = evs.length - 1; i >= 0; i--) {
        if (evs[i].midi === midi && evs[i].tOff === null) { evs[i].tOff = performance.now() / 1000 - recStartRef.current; break }
      }
    }
    setActive(a => { const next = { ...a }; delete next[midi]; return next })
  }, [])

  const stopAll = useCallback(() => {
    timeoutsRef.current.forEach(clearTimeout)
    timeoutsRef.current = []
    Object.keys(voicesRef.current).forEach(m => noteOff(+m))
    if (rafIdRef.current != null) cancelAnimationFrame(rafIdRef.current)
    wfRef.current = null
  }, [noteOff])

  const whiteMidi = useCallback((i: number) => {
    const oct = baseOctaveRef.current + Math.floor(i / 7)
    return 12 * (oct + 1) + WS[i % 7]
  }, [])

  const codeToMidi = useCallback((code: string): number | null => {
    if (code.startsWith('Key')) {
      const i = ROW.indexOf(code[3])
      if (i >= 0) return whiteMidi(i)
    }
    if (code.startsWith('Digit')) {
      const dgt = +code[5]
      const wi = (dgt === 0 ? 10 : dgt) - 2
      if (wi >= 0 && [0, 1, 3, 4, 5].includes(wi % 7)) return whiteMidi(wi) + 1
    }
    return null
  }, [whiteMidi])

  const keyX = useCallback((midi: number): [number, number, boolean] | null => {
    const bo = baseOctaveRef.current
    const no = nOctRef.current
    const nW = no * 7 + 1
    const pc = ((midi % 12) + 12) % 12
    const oct = Math.floor(midi / 12) - 1 - bo
    const wIdx = WS.indexOf(pc)
    if (wIdx >= 0) {
      const i = oct * 7 + wIdx
      if (i < 0 || i >= nW) return null
      return [i / nW, 1 / nW, false]
    }
    const wBefore = WS.indexOf(pc - 1)
    const i = oct * 7 + wBefore
    if (i < 0 || i >= nW - 1) return null
    const bw = 0.62 / nW
    return [(i + 1) / nW - bw / 2, bw, true]
  }, [])

  const wfDraw = useCallback(() => {
    const cv = wfCanvasRef.current
    const wf = wfRef.current
    if (!cv || !wf) return
    const W = cv.clientWidth, H = cv.clientHeight
    if (cv.width !== W * 2) { cv.width = W * 2; cv.height = H * 2 }
    const g = cv.getContext('2d')
    if (!g) return
    g.setTransform(2, 0, 0, 2, 0, 0)
    g.clearRect(0, 0, W, H)
    const el = performance.now() / 1000 - wf.start
    const lead = wf.lead
    const auto = wf.mode === 'auto'
    let allDone = true
    wf.notes.forEach(n => {
      if (!auto && !n.hit && !n.missed && n.t < el - 0.35) n.missed = true
      const yBottom = ((el - (n.t - lead)) / lead) * H
      const h = Math.max(10, (n.dur / lead) * H)
      const yTop = yBottom - h
      if (yTop > H + 5) return
      if (yBottom < H + h + 20) allDone = false
      if (!auto && n.hit) return
      const pos = keyX(n.midi)
      if (!pos) return
      const [x, w, black] = pos
      if (auto) {
        const hue = (n.midi % 12) * 30
        g.fillStyle = `hsl(${hue} 65% ${black ? 48 : 60}%)`
      } else {
        g.fillStyle = n.missed ? 'rgba(150,140,125,.25)' : black ? ACCENT : ACCENT + 'cc'
      }
      g.beginPath()
      g.roundRect(x * W + 1, Math.min(yTop, H), w * W - 2, Math.min(h - 2, H - yTop), 4)
      g.fill()
    })
    g.fillStyle = 'rgba(239,233,224,.25)'
    g.fillRect(0, H - 1, W, 1)
    if (!auto && allDone && el > lead) {
      const sc = wfScoreRef.current, tot = wfTotalRef.current
      wfRef.current = null
      if (rafIdRef.current != null) cancelAnimationFrame(rafIdRef.current)
      setBanner({ name: `Score: ${sc} of ${tot} notes`, mode: 'result' })
    }
  }, [keyX])

  const startWfLoop = useCallback(() => {
    const loop = () => {
      if (!wfRef.current) return
      wfDraw()
      rafIdRef.current = requestAnimationFrame(loop)
    }
    rafIdRef.current = requestAnimationFrame(loop)
  }, [wfDraw])

  const toggleMarkNote = useCallback((midi: number) => {
    setMarked(prev => {
      const next = prev.includes(midi) ? prev.filter(m => m !== midi) : [...prev, midi]
      history.replaceState(null, '', next.length ? '#m=' + next.join(',') : location.pathname + location.search)
      return next
    })
  }, [])

  const doPlayMarks = useCallback(() => {
    const seq = [...markedRef.current]
    ensureCtx()
    seq.forEach((midi, i) => {
      timeoutsRef.current.push(window.setTimeout(() => noteOn(midi, 0.85), i * 450))
      timeoutsRef.current.push(window.setTimeout(() => noteOff(midi), i * 450 + 380))
    })
  }, [ensureCtx, noteOn, noteOff])

  const doToggleRecord = useCallback(() => {
    const st = recStateRef.current
    if (st === 'idle') {
      let n = 4
      setRecState('count'); setCountdown(n)
      countTimerRef.current = window.setInterval(() => {
        n--
        if (n > 0) { setCountdown(n); return }
        if (countTimerRef.current != null) clearInterval(countTimerRef.current)
        recEventsRef.current = []
        recStartRef.current = performance.now() / 1000
        recTimerRef.current = window.setInterval(() => {
          const secs = Math.floor(performance.now() / 1000 - recStartRef.current)
          if (secs >= 300) doToggleRecord()
          else setRecSecs(secs)
        }, 1000)
        setRecState('rec'); setRecSecs(0)
      }, 800)
    } else if (st === 'count') {
      if (countTimerRef.current != null) clearInterval(countTimerRef.current)
      setRecState('idle')
    } else if (st === 'rec') {
      if (recTimerRef.current != null) clearInterval(recTimerRef.current)
      const now = performance.now() / 1000 - recStartRef.current
      recEventsRef.current.forEach(ev => { if (ev.tOff === null) ev.tOff = now })
      setRecState(recEventsRef.current.length ? 'done' : 'idle')
    }
  }, [])

  const recDuration = useCallback(() => {
    const evs = recEventsRef.current
    if (!evs.length) return '0:00'
    const t = Math.round(Math.max(...evs.map(e => e.tOff ?? 0)))
    return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0')
  }, [])

  const doPlayRec = useCallback(() => {
    stopAll()
    setPlayRecActive(true)
    const lead = 3.2
    let maxT = 0
    recEventsRef.current.forEach(ev => {
      const tOff = ev.tOff ?? ev.tOn
      timeoutsRef.current.push(window.setTimeout(() => noteOn(ev.midi, ev.vel), (ev.tOn + lead) * 1000))
      timeoutsRef.current.push(window.setTimeout(() => noteOff(ev.midi), (tOff + lead) * 1000))
      maxT = Math.max(maxT, tOff)
    })
    wfRef.current = {
      mode: 'auto',
      notes: recEventsRef.current.map(ev => ({ midi: ev.midi, t: ev.tOn + lead, dur: Math.max((ev.tOff ?? ev.tOn) - ev.tOn, 0.15), hit: false, missed: false })),
      start: performance.now() / 1000, lead,
    }
    setBanner({ name: 'Your recording', mode: 'auto' })
    startWfLoop()
    timeoutsRef.current.push(window.setTimeout(() => {
      stopAll()
      setPlayRecActive(false)
      setBanner(null)
    }, (maxT + lead) * 1000 + 600))
  }, [stopAll, noteOn, noteOff, startWfLoop])

  const fitSong = useCallback((song: PlayableSong) => {
    const midis = song.notes.map(n => n[0])
    const lo = Math.min(...midis)
    let base = Math.floor(lo / 12) - 1
    const hi = Math.max(...midis)
    const span = 12 * (nOctRef.current + 0.5)
    while (12 * (base + 1) + span < hi && base < 6) base++
    setBaseOctave(Math.max(1, Math.min(6, base)))
  }, [])

  const doPlayAuto = useCallback((song: PlayableSong) => {
    stopAll()
    fitSong(song)
    ensureCtx()
    const spb = 60 / song.bpm
    const lead = 3.2
    let end = 0
    song.notes.forEach(([midi, start, dur]) => {
      const t0 = (start * spb + lead) * 1000, t1 = (start * spb + Math.max(dur * 0.92, 0.15) * spb + lead) * 1000
      timeoutsRef.current.push(window.setTimeout(() => noteOn(midi, 0.85), t0))
      timeoutsRef.current.push(window.setTimeout(() => noteOff(midi), t1))
      end = Math.max(end, t1)
    })
    wfRef.current = {
      mode: 'auto',
      notes: song.notes.map(([midi, start, dur]) => ({ midi, t: start * spb + lead, dur: dur * spb, hit: false, missed: false })),
      start: performance.now() / 1000, lead,
    }
    timeoutsRef.current.push(window.setTimeout(() => { stopAll(); setBanner(null) }, end + 1200))
    setBanner({ name: song.name, mode: 'auto' })
    setLibraryOpen(false)
    startWfLoop()
  }, [stopAll, fitSong, ensureCtx, noteOn, noteOff, startWfLoop])

  const doPlayWf = useCallback((song: PlayableSong) => {
    stopAll()
    fitSong(song)
    ensureCtx()
    const spb = 60 / song.bpm
    wfRef.current = {
      mode: 'wf',
      notes: song.notes.map(([midi, start, dur]) => ({ midi, t: start * spb + 3.2, dur: dur * spb, hit: false, missed: false })),
      start: performance.now() / 1000, lead: 3.2,
    }
    setBanner({ name: song.name, mode: 'wf' })
    setWfScore(0)
    setWfTotal(song.notes.length)
    setLibraryOpen(false)
    startWfLoop()
  }, [stopAll, fitSong, ensureCtx, startWfLoop])

  const doStopSong = useCallback(() => {
    stopAll()
    setBanner(null)
  }, [stopAll])

  const doLoadMidi = useCallback(() => {
    const inp = document.createElement('input')
    inp.type = 'file'
    inp.accept = '.mid,.midi,audio/midi'
    inp.onchange = async () => {
      const file = inp.files?.[0]
      if (!file) return
      try {
        const song = parseMidiFile(new Uint8Array(await file.arrayBuffer()), file.name)
        if (!song.notes.length) throw new Error('no notes')
        doPlayAuto(song)
      } catch {
        setBanner({ name: 'Could not read that MIDI file', mode: 'result' })
      }
    }
    inp.click()
  }, [doPlayAuto])

  const doDlWav = useCallback(async () => {
    const evs = recEventsRef.current
    if (!evs.length) return
    const dur = Math.max(...evs.map(e => e.tOff ?? e.tOn)) + 2
    const sr = 44100
    const ctx = new OfflineAudioContext(2, Math.ceil(dur * sr), sr)
    const master = ctx.createGain()
    master.gain.value = volumeRef.current
    const comp = ctx.createDynamicsCompressor()
    master.connect(comp); comp.connect(ctx.destination)
    evs.forEach(ev => {
      const v = buildVoice(ctx, master, ev.inst, ev.midi, ev.tOn + 0.05, ev.vel)
      v.release((ev.tOff ?? ev.tOn) + 0.05)
    })
    const buf = await ctx.startRendering()
    download(encodeWav(buf), 'piano-recording.wav')
  }, [])

  const doDlMidi = useCallback(() => {
    const evs = recEventsRef.current
    if (!evs.length) return
    const PROG: Record<InstrumentId, number> = { acoustic: 0, piano: 0, epiano: 4, organ: 19, synth: 81, strings: 48, musicbox: 10 }
    const div = 480, uspb = 500000 // 120 bpm
    const list: { t: number; b: number[] }[] = []
    evs.forEach(ev => {
      const tick = (s: number) => Math.round(s * 1e6 / uspb * div)
      list.push({ t: tick(ev.tOn), b: [0x90, ev.midi, Math.round(ev.vel * 127)] })
      list.push({ t: tick(ev.tOff ?? ev.tOn), b: [0x80, ev.midi, 0] })
    })
    list.sort((a, b) => a.t - b.t)
    const bytes: number[] = []
    const vlq = (v: number) => { const st = [v & 0x7f]; while ((v >>= 7)) st.push((v & 0x7f) | 0x80); return st.reverse() }
    bytes.push(0, 0xc0 | 0, PROG[evs[0].inst] || 0)
    let last = 0
    list.forEach(ev => { bytes.push(...vlq(ev.t - last), ...ev.b); last = ev.t })
    bytes.push(0, 0xff, 0x2f, 0)
    const track = [77, 84, 114, 107, (bytes.length >> 24) & 255, (bytes.length >> 16) & 255, (bytes.length >> 8) & 255, bytes.length & 255, ...bytes]
    const head = [77, 84, 104, 100, 0, 0, 0, 6, 0, 0, 0, 1, div >> 8, div & 255]
    download(new Blob([new Uint8Array([...head, ...track])], { type: 'audio/midi' }), 'piano-recording.mid')
  }, [])

  const toggleFullscreen = useCallback(() => {
    if (fauxFsRef.current) { setFauxFs(false); return }
    if (document.fullscreenElement) { document.exitFullscreen(); return }
    // Fullscreen just the piano wrapper (not document.documentElement) — this
    // component is embedded in the site's own page, which has its own navbar
    // and footer above/below it that shouldn't come along into fullscreen.
    const el = pianoWrapRef.current
    const p = el?.requestFullscreen ? el.requestFullscreen() : Promise.reject()
    Promise.resolve(p).catch(() => setFauxFs(true))
  }, [])

  const keyDownHandler = useCallback((e: KeyboardEvent) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
    const target = e.target as HTMLElement
    if (target && /INPUT|SELECT|TEXTAREA/.test(target.tagName)) return
    if (e.code === 'Escape' && fauxFsRef.current) { setFauxFs(false); return }
    if (e.code === 'Space') { e.preventDefault(); if (markedRef.current.length) doPlayMarks(); return }
    const midi = codeToMidi(e.code)
    if (midi !== null && !heldCodesRef.current[e.code]) {
      heldCodesRef.current[e.code] = midi
      if (markModeRef.current) toggleMarkNote(midi)
      noteOn(midi)
    }
  }, [codeToMidi, doPlayMarks, noteOn, toggleMarkNote])

  const keyUpHandler = useCallback((e: KeyboardEvent) => {
    const midi = heldCodesRef.current[e.code]
    if (midi !== undefined) { delete heldCodesRef.current[e.code]; noteOff(midi) }
  }, [noteOff])

  useEffect(() => {
    const onResize = () => resize()
    const onPtrDown = () => { ptrRef.current = true }
    const onPtrUp = () => { ptrRef.current = false }
    const onFsChange = () => setIsFs(!!document.fullscreenElement)
    window.addEventListener('keydown', keyDownHandler)
    window.addEventListener('keyup', keyUpHandler)
    window.addEventListener('resize', onResize)
    window.addEventListener('pointerdown', onPtrDown, true)
    window.addEventListener('pointerup', onPtrUp, true)
    document.addEventListener('fullscreenchange', onFsChange)
    resize()
    const m = (location.hash.match(/m=([\d,]+)/) || [])[1]
    if (m) setMarked(m.split(',').map(Number).filter(n => n >= 12 && n <= 108))

    const nav = navigator as Navigator & { requestMIDIAccess?: () => Promise<MIDIAccess> }
    if (nav.requestMIDIAccess) {
      nav.requestMIDIAccess().then(acc => {
        const hook = () => {
          let name = ''
          acc.inputs.forEach(inp => {
            name = inp.name ?? ''
            inp.onmidimessage = (msg) => {
              const data = msg.data
              if (!data) return
              const [st, note, vel] = data
              const cmd = st & 0xf0
              if (cmd === 0x90 && vel > 0) noteOn(note, vel / 127)
              else if (cmd === 0x80 || (cmd === 0x90 && vel === 0)) noteOff(note)
            }
          })
          setMidiName(name)
        }
        hook()
        acc.onstatechange = hook
      }).catch(() => {})
    }

    // Preload the real piano samples right away (per-page load, not on first
    // keypress) so "Acoustic Piano" is ready by the time someone plays —
    // deferred to idle time so the 88 pooled fetches don't compete with
    // hydration/the skeleton hand-off.
    const win = window as Window & { requestIdleCallback?: (cb: () => void) => number; cancelIdleCallback?: (id: number) => void }
    const startPreload = () => loadPianoSamples(ensureCtx())
    const idleId = win.requestIdleCallback ? win.requestIdleCallback(startPreload) : window.setTimeout(startPreload, 1)

    return () => {
      if (win.requestIdleCallback && win.cancelIdleCallback) win.cancelIdleCallback(idleId)
      else clearTimeout(idleId)
      window.removeEventListener('keydown', keyDownHandler)
      window.removeEventListener('keyup', keyUpHandler)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('pointerdown', onPtrDown, true)
      window.removeEventListener('pointerup', onPtrUp, true)
      document.removeEventListener('fullscreenchange', onFsChange)
      stopAll()
      if (ctxRef.current) ctxRef.current.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const keyHandlers = useCallback((midi: number) => ({
    down: (e: React.PointerEvent) => {
      e.preventDefault()
      try { (e.currentTarget as Element).releasePointerCapture(e.pointerId) } catch { /* not captured */ }
      if (markModeRef.current) toggleMarkNote(midi)
      noteOn(midi)
    },
    up: () => { if (activeRef.current[midi]) noteOff(midi) },
    enter: () => { if (ptrRef.current) noteOn(midi) },
  }), [toggleMarkNote, noteOn, noteOff])

  const label = (midi: number, isBlack: boolean): string => {
    if (labelMode === 'none') return ''
    if (labelMode === 'keys') {
      const pc = midi % 12
      const oct = Math.floor(midi / 12) - 1 - baseOctave
      if (!isBlack) {
        const i = oct * 7 + WS.indexOf(pc)
        return i >= 0 && i < 10 ? ROW[i] : ''
      }
      const wi = oct * 7 + WS.indexOf(pc - 1)
      if (wi < 0 || wi > 8) return ''
      const d = wi + 2
      return d <= 9 ? String(d) : '0'
    }
    const names = notation === 'latina' ? LAT : ANG
    return names[midi % 12] + (Math.floor(midi / 12) - 1)
  }

  const octDown = useCallback(() => setBaseOctave(b => Math.max(1, b - 1)), [])
  const octUp = useCallback(() => setBaseOctave(b => Math.min(6, b + 1)), [])

  // ---------- derived render values ----------
  const nW = nOct * 7 + 1
  interface KeyRenderData { midi: number; label: string; style: React.CSSProperties; dotStyle: React.CSSProperties; down: (e: React.PointerEvent) => void; up: () => void; enter: () => void }
  const whites: KeyRenderData[] = []
  const blacks: KeyRenderData[] = []
  for (let i = 0; i < nW; i++) {
    const midi = whiteMidi(i)
    const act = !!active[midi]
    const isMarked = marked.includes(midi)
    whites.push({
      midi,
      ...keyHandlers(midi),
      label: label(midi, false),
      style: {
        flex: 1, position: 'relative', minWidth: 0, cursor: 'pointer', userSelect: 'none', touchAction: 'none',
        border: '1px solid #a49c8e', borderTop: 'none', borderRadius: '0 0 6px 6px',
        background: act ? 'linear-gradient(#d9d2c4, #c9c0b0)' : 'linear-gradient(#fdfcf8, #efeade)',
        boxShadow: act ? 'inset 0 3px 8px rgba(0,0,0,.3)' : 'inset 0 -7px 0 rgba(0,0,0,.07), 0 3px 5px rgba(0,0,0,.4)',
        transform: act ? 'translateY(1px)' : 'none',
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center',
        paddingBottom: 8, gap: 6,
      },
      dotStyle: {
        display: isMarked ? 'block' : 'none', width: 10, height: 10, borderRadius: '50%',
        background: ACCENT, boxShadow: '0 0 6px ' + ACCENT,
      },
    })
    if (i < nW - 1 && [0, 1, 3, 4, 5].includes(i % 7)) {
      const bm = midi + 1
      const bact = !!active[bm]
      const bmarked = marked.includes(bm)
      const bw = 62 / nW
      blacks.push({
        midi: bm,
        ...keyHandlers(bm),
        label: label(bm, true),
        style: {
          position: 'absolute', top: 0, left: ((i + 1) * 100 / nW - bw / 2) + '%', width: bw + '%', height: '62%',
          cursor: 'pointer', userSelect: 'none', touchAction: 'none', zIndex: 2,
          background: bact ? 'linear-gradient(#55504a, #2b2825)' : 'linear-gradient(#3c3934, #131110)',
          border: '1px solid #000', borderTop: 'none', borderRadius: '0 0 5px 5px',
          boxShadow: bact ? 'inset 0 2px 6px rgba(0,0,0,.6)' : 'inset 0 -5px 0 rgba(255,255,255,.06), 0 4px 6px rgba(0,0,0,.55)',
          transform: bact ? 'translateY(1px)' : 'none',
          display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center',
          paddingBottom: 6, gap: 5,
        },
        dotStyle: {
          display: bmarked ? 'block' : 'none', width: 8, height: 8, borderRadius: '50%',
          background: ACCENT, boxShadow: '0 0 6px ' + ACCENT,
        },
      })
    }
  }

  const diffs: { name: PianoSong['diff']; color: string }[] = [
    { name: 'Easy', color: '#7BC47F' },
    { name: 'Medium', color: ACCENT },
    { name: 'Hard', color: '#D97757' },
  ]
  const groups = diffs.map(d => ({
    ...d,
    songs: PIANO_SONGS.filter(sg => sg.diff === d.name).map(sg => ({
      name: sg.name, tags: sg.tags,
      playAuto: () => doPlayAuto(sg),
      playWf: () => doPlayWf(sg),
    })),
  })).filter(g => g.songs.length)

  const mm = Math.floor(recSecs / 60), ss = String(recSecs % 60).padStart(2, '0')
  const bannerTexts: Record<BannerMode, string> = { auto: 'Now playing: ', wf: 'Waterfall mode — hit the notes when they reach the line: ', result: '' }

  const recLabel = recState === 'count' ? `Ready? ${countdown}…`
    : recState === 'rec' ? `■ Stop ${mm}:${ss}`
    : recState === 'done' ? '● Recording ready' : '● Record'
  const recBtnStyle: React.CSSProperties = {
    ...btn(recState !== 'idle'),
    ...(recState === 'count' ? { animation: 'pianoRecBlink 0.8s infinite' } : {}),
    ...(recState === 'rec' ? { background: '#c0392b', borderColor: '#c0392b', color: '#fff', animation: 'pianoRecBlink 1.4s infinite' } : {}),
  }
  const recMenuShown = recState === 'done' && recMenu
  const playRecLabel = playRecActive ? '▶ Playing…' : `▶ Play (${recDuration()})`
  const hasMarks = marked.length > 0
  const bannerText = banner ? bannerTexts[banner.mode] + banner.name : ''
  const bannerScore = banner && banner.mode === 'wf' ? `${wfScore} / ${wfTotal} hits` : ''
  const wfAreaStyle: React.CSSProperties = {
    display: banner && (banner.mode === 'wf' || banner.mode === 'auto') ? 'block' : 'none',
    height: 230, marginBottom: 4, background: 'rgba(0,0,0,.35)', borderRadius: 8, overflow: 'hidden',
  }
  const fsLabel = (isFs || fauxFs) ? '⛶ Exit full screen' : '⛶ Full screen'
  const pianoWrapStyle: React.CSSProperties = fauxFs
    ? { position: 'fixed', inset: 0, zIndex: 40, background: '#F5F2FA', padding: '16px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }
    : isFs
      ? { width: '100%', height: '100%', background: '#F5F2FA', padding: '16px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }
      : { padding: '0 10px', width: '100%' }
  const midiText = midiName ? 'MIDI: ' + midiName : 'MIDI: no device'
  const midiColor = midiName ? '#7BC47F' : '#8A7FA0'
  const volumePct = Math.round(volume * 100)
  const octLabel = `C${baseOctave}–C${baseOctave + nOct}`

  const shortcutRows = [
    { label: 'Black keys', keys: ['2', '3', '·', '5', '6', '7', '·', '9', '0'] },
    { label: 'White keys', keys: ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'] },
  ]

  const faqs = [
    { q: 'Can I use a real MIDI keyboard?', a: 'Yes — connect a MIDI keyboard and use Chrome or Edge. It is detected automatically and its name appears in the badge at the top right. Anything you play on it sounds here and can be recorded too, with velocity sensitivity.' },
    { q: 'Does it work on phones and tablets?', a: 'Yes — the piano adapts to your screen, showing fewer, bigger keys on small devices, and supports multi-touch so you can play chords with several fingers. You can also force a specific key density in Settings.' },
    { q: 'WAV or MIDI — which download should I pick?', a: 'WAV is a finished audio file — share it or listen anywhere. MIDI stores the notes themselves, so you can open it in any music software (GarageBand, Ableton, MuseScore…) to edit the notes or change the instrument.' },
    { q: 'How do I share my marked notes?', a: 'Marks are saved in the page address as you make them — just copy the URL from your browser and send it. Whoever opens it sees the same keys marked and can play them with the space bar.' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#F5F2FA', color: '#2B2438', fontFamily: "'Outfit', sans-serif", display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @keyframes pianoRecBlink { 0%,100% { opacity: 1; } 50% { opacity: .35; } }
        .vp-root input[type=range] { accent-color: #7C3AED; }
        .vp-root ::-webkit-scrollbar { height: 8px; width: 8px; }
        .vp-root ::-webkit-scrollbar-thumb { background: #D9D0E8; border-radius: 4px; }
        .vp-root details > summary { cursor: pointer; list-style: none; }
        .vp-root details > summary::-webkit-details-marker { display: none; }
        .vp-root a { color: #7C3AED; }
        .vp-root a:hover { color: #9A6BF5; }
      `}</style>
      <div className="vp-root">

      {/* Header */}
      <header style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 12, padding: '20px 24px 8px 24px' }}>
        <span />
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: -0.5, textAlign: 'center', whiteSpace: 'nowrap' }}>Virtual Piano</h1>
        <span style={{ justifySelf: 'end', fontSize: 12, color: midiColor, border: '1px solid #D9D0E8', borderRadius: 999, padding: '4px 12px' }}>{midiText}</span>
      </header>

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '10px 24px 14px 24px' }}>
        <div
          onMouseEnter={() => { if (recStateRef.current === 'done') setRecMenu(true) }}
          onMouseLeave={() => setRecMenu(false)}
          style={{ position: 'relative' }}
        >
          <button onClick={doToggleRecord} style={recBtnStyle}>{recLabel}</button>
          {recMenuShown && (
            <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 30, paddingTop: 4 }}>
              <div style={{ background: '#EDE8F5', border: '1px solid #D9D0E8', borderRadius: 10, boxShadow: '0 10px 30px rgba(43,36,56,.18)', minWidth: 170, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <button onClick={doPlayRec} style={{ fontFamily: 'inherit', background: 'transparent', color: '#2B2438', border: 'none', textAlign: 'left', padding: '10px 14px', fontSize: 13, cursor: 'pointer' }}>{playRecLabel}</button>
                <button onClick={doDlWav} style={{ fontFamily: 'inherit', background: 'transparent', color: '#2B2438', border: 'none', textAlign: 'left', padding: '10px 14px', fontSize: 13, cursor: 'pointer' }}>Download WAV</button>
                <button onClick={doDlMidi} style={{ fontFamily: 'inherit', background: 'transparent', color: '#2B2438', border: 'none', textAlign: 'left', padding: '10px 14px', fontSize: 13, cursor: 'pointer' }}>Download MIDI</button>
                <button onClick={() => { stopAll(); setRecState('idle'); setRecSecs(0); setRecMenu(false); setBanner(null); setPlayRecActive(false) }} style={{ fontFamily: 'inherit', background: 'transparent', color: '#6E6482', border: 'none', borderTop: '1px solid #D9D0E8', textAlign: 'left', padding: '10px 14px', fontSize: 13, cursor: 'pointer' }}>New recording</button>
              </div>
            </div>
          )}
        </div>
        <button onClick={() => setMarkMode(v => !v)} style={btn(markMode)}>Mark</button>
        {hasMarks && (
          <>
            <button onClick={doPlayMarks} style={btn(true)}>Play ▸</button>
            <button onClick={() => { setMarked([]); history.replaceState(null, '', location.pathname + location.search) }} style={{ fontFamily: 'inherit', background: 'transparent', color: '#6E6482', border: '1px solid #D9D0E8', borderRadius: 8, padding: '8px 12px', fontSize: 13, cursor: 'pointer' }}>Clear marks</button>
          </>
        )}
        <button onClick={() => setLibraryOpen(true)} style={btn(libraryOpen)}>♪ Songs</button>
        <button onClick={doLoadMidi} style={{ fontFamily: 'inherit', background: '#EDE8F5', color: '#2B2438', border: '1px solid #D9D0E8', borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer' }}>Open MIDI…</button>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <select
            value={instrument}
            onChange={(e) => setInstrument(e.target.value as InstrumentId)}
            style={{ fontFamily: 'inherit', background: '#EDE8F5', color: '#2B2438', border: '1px solid #D9D0E8', borderRadius: 8, padding: '8px 10px', fontSize: 13, cursor: 'pointer' }}
          >
            <option value="acoustic">Acoustic Piano</option>
            <option value="piano">Classic Piano</option>
            <option value="epiano">Electric Piano</option>
            <option value="organ">Organ</option>
            <option value="synth">Synthesizer</option>
            <option value="strings">Strings</option>
            <option value="musicbox">Music Box</option>
          </select>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#EDE8F5', border: '1px solid #D9D0E8', borderRadius: 8, padding: 2 }}>
            <button onClick={octDown} style={{ fontFamily: 'inherit', background: 'transparent', color: '#2B2438', border: 'none', borderRadius: 6, padding: '6px 10px', fontSize: 15, cursor: 'pointer' }}>−</button>
            <span style={{ fontSize: 13, color: '#6E6482', minWidth: 66, textAlign: 'center' }}>Octave {octLabel}</span>
            <button onClick={octUp} style={{ fontFamily: 'inherit', background: 'transparent', color: '#2B2438', border: 'none', borderRadius: 6, padding: '6px 10px', fontSize: 15, cursor: 'pointer' }}>+</button>
          </div>
          <button onClick={toggleFullscreen} style={{ fontFamily: 'inherit', background: '#EDE8F5', color: '#2B2438', border: '1px solid #D9D0E8', borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer' }}>{fsLabel}</button>
          <button onClick={() => setSettingsOpen(true)} style={{ fontFamily: 'inherit', background: '#EDE8F5', color: '#2B2438', border: '1px solid #D9D0E8', borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer' }}>⚙ Settings</button>
        </div>
      </div>

      {/* Song banner */}
      {banner && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '0 16px 10px 16px', background: '#FFFFFF', border: '1px solid #D9D0E8', borderRadius: 10, padding: '10px 16px', fontSize: 14 }}>
          <span style={{ color: ACCENT }}>♪</span>
          <span>{bannerText}</span>
          <span style={{ color: '#6E6482', fontSize: 13 }}>{bannerScore}</span>
          <button onClick={doStopSong} style={{ marginLeft: 'auto', fontFamily: 'inherit', background: '#D9D0E8', color: '#2B2438', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>Stop</button>
        </div>
      )}

      {/* Piano */}
      <div ref={pianoWrapRef} style={pianoWrapStyle}>
        {(fauxFs || isFs) && (
          <button onClick={toggleFullscreen} style={{ alignSelf: 'flex-end', marginBottom: 10, fontFamily: 'inherit', background: '#EDE8F5', color: '#2B2438', border: '1px solid #D9D0E8', borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer' }}>✕ Exit full screen</button>
        )}
        <div style={{ width: '100%', background: WOOD_BG, borderRadius: 14, padding: '12px 12px 16px 12px', boxShadow: '0 14px 40px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.07)' }}>
          <div style={wfAreaStyle}>
            <canvas ref={wfCanvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
          </div>
          <div style={{ height: 7, background: ACCENT, borderRadius: '3px 3px 0 0', boxShadow: '0 1px 3px rgba(0,0,0,.6)', marginBottom: 1 }} />
          <div style={{ position: 'relative', display: 'flex', height: 'clamp(130px, 24vw, 230px)' }}>
            {whites.map(k => (
              <div key={k.midi} onPointerDown={k.down} onPointerUp={k.up} onPointerEnter={k.enter} onPointerLeave={k.up} style={k.style}>
                <div style={k.dotStyle} />
                <span style={{ fontSize: 'clamp(9px, 1.2vw, 13px)', color: '#8a8175', fontWeight: 500, pointerEvents: 'none' }}>{k.label}</span>
              </div>
            ))}
            {blacks.map(k => (
              <div key={k.midi} onPointerDown={k.down} onPointerUp={k.up} onPointerEnter={k.enter} onPointerLeave={k.up} style={k.style}>
                <div style={k.dotStyle} />
                <span style={{ fontSize: 'clamp(8px, 1vw, 11px)', color: '#cfc7b9', fontWeight: 500, pointerEvents: 'none' }}>{k.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Help line */}
      <p style={{ textAlign: 'center', color: '#8A7FA0', fontSize: 13, margin: '14px 24px', lineHeight: 1.6 }}>
        The <b style={{ color: '#574A6E' }}>Q W E R T Y U I O P</b> row plays the white keys and the number row <b style={{ color: '#574A6E' }}>2 3 · 5 6 7 · 9 0</b> plays the black keys — you can play several at once.
        With «Mark» on, click keys to mark them and play them with the space bar; marks are saved in the web address so you can share them.
      </p>

      {/* About / How it works */}
      <section style={{ maxWidth: 860, width: '100%', margin: '30px auto 50px auto', padding: '0 24px' }}>
        <h2 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 8px 0', letterSpacing: -0.4 }}>Play the piano, right in your browser</h2>
        <p style={{ color: '#6E6482', fontSize: 15, lineHeight: 1.7, margin: '0 0 8px 0' }}>Virtual Piano is a fully playable piano with a real sampled acoustic piano plus six synthesized sounds — classic and electric piano, organ, synth, strings and music box. Every key lights up and moves when you play it. Play by clicking the keys, with your computer keyboard, or by plugging in a real piano or keyboard over MIDI.</p>
        <p style={{ color: '#6E6482', fontSize: 15, lineHeight: 1.7, margin: '0 0 28px 0' }}>A fun way to practice is to pick a song from the library and play along in Waterfall mode, or record yourself and listen back — you can even download your take as audio or MIDI.</p>

        <h3 style={{ fontSize: 17, fontWeight: 600, margin: '0 0 12px 0' }}>What you can do</h3>
        <ul style={{ color: '#6E6482', fontSize: 14, lineHeight: 1.9, margin: '0 0 28px 0', paddingLeft: 22 }}>
          <li><b style={{ color: '#4C3B70' }}>Record</b> up to 5 minutes (with a 4-3-2-1 countdown), replay it with a colorful note waterfall, and download it as WAV or MIDI.</li>
          <li><b style={{ color: '#4C3B70' }}>Learn songs</b> from the library, sorted by difficulty — «Play» performs them with falling notes; «Waterfall» lets you play them yourself and counts your hits.</li>
          <li><b style={{ color: '#4C3B70' }}>Open any .mid file</b> and watch it played back with lit-up keys and colored falling notes.</li>
          <li><b style={{ color: '#4C3B70' }}>Mark keys</b> to build a sequence and play it with the space bar — marks live in the page address so you can share them.</li>
          <li><b style={{ color: '#4C3B70' }}>Customize everything</b> in Settings: volume, key density (1–5 octaves or Auto), key labels, Do-Re-Mi vs C-D-E naming, base octave — plus full-screen mode.</li>
        </ul>

        <h3 style={{ fontSize: 17, fontWeight: 600, margin: '0 0 12px 0' }}>Keyboard layout</h3>
        <p style={{ color: '#6E6482', fontSize: 14, lineHeight: 1.7, margin: '0 0 12px 0' }}>The keys map to your computer keyboard just like their physical position on the piano:</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '0 0 12px 0' }}>
          {shortcutRows.map(row => (
            <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: '#8A7FA0', minWidth: 84 }}>{row.label}</span>
              <div style={{ display: 'flex', gap: 5 }}>
                {row.keys.map((k, idx) => k === '·'
                  ? <span key={idx} style={{ color: '#C4B9D8', alignSelf: 'center' }}>·</span>
                  : row.label === 'Black keys'
                    ? <kbd key={idx} style={{ background: '#131110', border: '1px solid #D9D0E8', borderRadius: 6, padding: '5px 10px', fontSize: 13, fontFamily: 'inherit', color: '#cfc7b9' }}>{k}</kbd>
                    : <kbd key={idx} style={{ background: '#f5f0e6', border: '1px solid #a49c8e', borderRadius: 6, padding: '5px 10px', fontSize: 13, fontFamily: 'inherit', color: '#33302a' }}>{k}</kbd>
                )}
              </div>
            </div>
          ))}
        </div>
        <p style={{ color: '#6E6482', fontSize: 14, lineHeight: 1.7, margin: '0 0 28px 0' }}>Hold several keys at once to play chords. Shift the range with the Octave − / + buttons, and turn on «Shortcuts» key labels in Settings to see the mapping on the piano itself.</p>

        <h3 style={{ fontSize: 17, fontWeight: 600, margin: '0 0 12px 0' }}>Questions &amp; answers</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {faqs.map(f => (
            <div key={f.q} style={{ background: '#FFFFFF', border: '1px solid #E3DCEF', borderRadius: 12, padding: '16px 18px' }}>
              <h3 style={{ margin: '0 0 8px 0', fontSize: 15, fontWeight: 600 }}>{f.q}</h3>
              <p style={{ color: '#6E6482', fontSize: 14, lineHeight: 1.6, margin: 0 }}>{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Library modal */}
      {libraryOpen && (
        <div onClick={() => setLibraryOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(43,36,56,.4)', zIndex: 50, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '4vh 16px' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#FFFFFF', border: '1px solid #D9D0E8', borderRadius: 16, padding: 22, width: 900, maxWidth: '100%', maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(43,36,56,.25)' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Song Library</h2>
              <span style={{ color: '#6E6482', fontSize: 13 }}><b style={{ color: '#4C3B70' }}>Play</b> performs with falling notes · <b style={{ color: '#4C3B70' }}>Waterfall</b> lets you play them yourself</span>
              <button onClick={() => setLibraryOpen(false)} style={{ marginLeft: 'auto', fontFamily: 'inherit', background: 'transparent', color: '#6E6482', border: 'none', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>
            {groups.map(g => (
              <div key={g.name} style={{ marginTop: 16 }}>
                <h3 style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1.5, color: g.color, margin: '0 0 10px 0' }}>{g.name}</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
                  {g.songs.map(song => (
                    <div key={song.name} style={{ background: '#FFFFFF', border: '1px solid #E3DCEF', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ fontSize: 15, fontWeight: 500 }}>{song.name}</div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {song.tags.map(tag => (
                          <span key={tag} style={{ fontSize: 11, color: '#6E6482', background: '#EDE8F5', borderRadius: 999, padding: '3px 10px' }}>{tag}</span>
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
                        <button onClick={song.playAuto} style={btn(true)}>▶ Play</button>
                        <button onClick={song.playWf} style={{ fontFamily: 'inherit', background: '#EDE8F5', color: '#2B2438', border: '1px solid #D9D0E8', borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer' }}>▼ Waterfall</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Settings modal */}
      {settingsOpen && (
        <div onClick={() => setSettingsOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(43,36,56,.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#FFFFFF', border: '1px solid #D9D0E8', borderRadius: 16, padding: 24, width: 420, maxWidth: '100%', maxHeight: '88vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18, boxShadow: '0 20px 60px rgba(43,36,56,.25)' }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Settings</h2>
              <button onClick={() => setSettingsOpen(false)} style={{ marginLeft: 'auto', fontFamily: 'inherit', background: 'transparent', color: '#6E6482', border: 'none', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>
            <div>
              <label style={{ fontSize: 13, color: '#6E6482', display: 'block', marginBottom: 6 }}>Volume — {volumePct}%</label>
              <input
                type="range" min={0} max={100} value={volumePct}
                onChange={(e) => {
                  const v = Number(e.target.value) / 100
                  if (masterRef.current) masterRef.current.gain.value = v
                  setVolume(v)
                }}
                style={{ width: '100%' }}
              />
            </div>
            <div>
              <label style={{ fontSize: 13, color: '#6E6482', display: 'block', marginBottom: 6 }}>Key density — octaves shown</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} onClick={() => setDensity(n)} style={btn(octOverride === n)}>{n}</button>
                ))}
                <button onClick={() => setDensity(null)} style={btn(octOverride === null)}>Auto</button>
              </div>
            </div>
            <div>
              <label style={{ fontSize: 13, color: '#6E6482', display: 'block', marginBottom: 6 }}>Key labels</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => setLabelMode('notes')} style={btn(labelMode === 'notes')}>Notes</button>
                <button onClick={() => setLabelMode('keys')} style={btn(labelMode === 'keys')}>Shortcuts</button>
                <button onClick={() => setLabelMode('none')} style={btn(labelMode === 'none')}>None</button>
              </div>
            </div>
            <div>
              <label style={{ fontSize: 13, color: '#6E6482', display: 'block', marginBottom: 6 }}>Note names</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => setNotation('latina')} style={btn(notation === 'latina')}>Do Re Mi</button>
                <button onClick={() => setNotation('anglo')} style={btn(notation === 'anglo')}>C D E</button>
              </div>
            </div>
            <div>
              <label style={{ fontSize: 13, color: '#6E6482', display: 'block', marginBottom: 6 }}>Base octave</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button onClick={octDown} style={{ fontFamily: 'inherit', background: '#EDE8F5', color: '#2B2438', border: '1px solid #D9D0E8', borderRadius: 8, padding: '8px 16px', fontSize: 15, cursor: 'pointer' }}>−</button>
                <span style={{ fontSize: 15 }}>{octLabel}</span>
                <button onClick={octUp} style={{ fontFamily: 'inherit', background: '#EDE8F5', color: '#2B2438', border: '1px solid #D9D0E8', borderRadius: 8, padding: '8px 16px', fontSize: 15, cursor: 'pointer' }}>+</button>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
