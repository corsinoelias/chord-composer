import { useCallback, useEffect, useRef } from 'react'

export type TrackId = 'kick' | 'snare' | 'clap' | 'chh' | 'ohh' | 'tom' | 'rim' | 'cow'
export type KitId = 'analog' | 'punch' | 'lofi'

export const TRACKS: { id: TrackId; name: string; accent: 'accent' | 'accent2' }[] = [
  { id: 'kick',  name: 'KICK',    accent: 'accent' },
  { id: 'snare', name: 'SNARE',   accent: 'accent' },
  { id: 'clap',  name: 'CLAP',    accent: 'accent' },
  { id: 'chh',   name: 'HH CLSD', accent: 'accent2' },
  { id: 'ohh',   name: 'HH OPEN', accent: 'accent2' },
  { id: 'tom',   name: 'TOM',     accent: 'accent' },
  { id: 'rim',   name: 'RIM',     accent: 'accent2' },
  { id: 'cow',   name: 'COWBELL', accent: 'accent2' },
]

export const KITS: Record<KitId, { name: string; kickPitch: number; kickDecay: number; snareBP: number; snDecay: number; hatHP: number; master: number }> = {
  analog: { name: 'Analog', kickPitch: 130, kickDecay: 0.5,  snareBP: 1700, snDecay: 0.2,  hatHP: 7200, master: 18000 },
  punch:  { name: 'Punch',  kickPitch: 210, kickDecay: 0.22, snareBP: 2400, snDecay: 0.12, hatHP: 9200, master: 18000 },
  lofi:   { name: 'Lo-Fi',  kickPitch: 100, kickDecay: 0.6,  snareBP: 1300, snDecay: 0.25, hatHP: 5200, master: 3200 },
}

/**
 * Shared Web Audio drum synthesis engine — every kick/snare/hat/etc is
 * synthesized from oscillators and filtered noise (no samples). Used by both
 * the step-sequenced DrumMachine and the real-time-triggered VirtualDrums;
 * `hit` takes an explicit AudioContext time so callers can either schedule
 * ahead (sequencer) or fire immediately (live play).
 */
export function useDrumSynth(kit: KitId) {
  const kitRef = useRef(kit)
  kitRef.current = kit

  const ctxRef      = useRef<AudioContext | null>(null)
  const masterRef   = useRef<GainNode | null>(null)
  const filterRef   = useRef<BiquadFilterNode | null>(null)
  const noiseBufRef = useRef<AudioBuffer | null>(null)

  const ensureCtx = useCallback(() => {
    if (!ctxRef.current) {
      const ctx = new AudioContext()
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      const master = ctx.createGain()
      master.gain.value = 0.9
      master.connect(filter)
      filter.connect(ctx.destination)
      const len = ctx.sampleRate
      const noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate)
      const d = noiseBuf.getChannelData(0)
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
      ctxRef.current = ctx
      filterRef.current = filter
      masterRef.current = master
      noiseBufRef.current = noiseBuf
    }
    filterRef.current!.frequency.value = KITS[kitRef.current].master
    if (ctxRef.current.state === 'suspended') ctxRef.current.resume()
    return ctxRef.current
  }, [])

  const noise = useCallback((t: number, dur: number, filterType: BiquadFilterType, freq: number, peak: number) => {
    const ctx = ctxRef.current!
    const src = ctx.createBufferSource()
    src.buffer = noiseBufRef.current!
    const f = ctx.createBiquadFilter()
    f.type = filterType
    f.frequency.value = freq
    f.Q.value = 1
    const g = ctx.createGain()
    g.gain.setValueAtTime(peak, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    src.connect(f); f.connect(g); g.connect(masterRef.current!)
    src.start(t); src.stop(t + dur + 0.05)
  }, [])

  const osc = useCallback((t: number, dur: number, type: OscillatorType, f0: number, f1: number | null, peak: number) => {
    const ctx = ctxRef.current!
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(f0, t)
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.5)
    const g = ctx.createGain()
    g.gain.setValueAtTime(peak, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    o.connect(g); g.connect(masterRef.current!)
    o.start(t); o.stop(t + dur + 0.05)
  }, [])

  const hit = useCallback((id: TrackId, t: number, v: number) => {
    const K = KITS[kitRef.current]
    switch (id) {
      case 'kick':
        osc(t, K.kickDecay, 'sine', K.kickPitch, 46, v * 1.15)
        break
      case 'snare':
        noise(t, K.snDecay, 'bandpass', K.snareBP, v * 0.8)
        osc(t, 0.09, 'triangle', 195, 130, v * 0.5)
        break
      case 'clap':
        for (let i = 0; i < 3; i++) noise(t + i * 0.018, 0.03, 'bandpass', 1400, v * 0.55)
        noise(t + 0.054, 0.16, 'bandpass', 1400, v * 0.5)
        break
      case 'chh':
        noise(t, 0.05, 'highpass', K.hatHP, v * 0.5)
        break
      case 'ohh':
        noise(t, 0.38, 'highpass', K.hatHP, v * 0.4)
        break
      case 'tom':
        osc(t, 0.28, 'sine', 210, 95, v * 0.85)
        break
      case 'rim':
        osc(t, 0.03, 'triangle', 1050, null, v * 0.55)
        noise(t, 0.025, 'highpass', 3200, v * 0.35)
        break
      case 'cow':
        osc(t, 0.16, 'square', 540, null, v * 0.18)
        osc(t, 0.16, 'square', 810, null, v * 0.14)
        break
    }
  }, [noise, osc])

  useEffect(() => {
    if (filterRef.current) filterRef.current.frequency.value = KITS[kit].master
  }, [kit])

  useEffect(() => () => {
    ctxRef.current?.close().catch(() => {})
    ctxRef.current = null
  }, [])

  return { ctxRef, ensureCtx, hit }
}
