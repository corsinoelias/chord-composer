import { type GuitarTrack, type GuitarSound, type LoopRange } from './types'
import { fretToFrequency } from './guitarTheory'

let audioCtx: AudioContext | null = null
let masterGain: GainNode | null = null
let isPlayingFlag = false
let animFrameId: number | null = null
let playStartAudioTime = 0

interface ScheduledNode { node: OscillatorNode | AudioBufferSourceNode; stopAt: number }
let scheduledNodes: ScheduledNode[] = []

function ensureCtx(): AudioContext {
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new AudioContext()
    masterGain = audioCtx.createGain()
    masterGain.gain.value = 0.75
    masterGain.connect(audioCtx.destination)
  }
  if (audioCtx.state === 'suspended') audioCtx.resume()
  return audioCtx
}

// ── Karplus-Strong plucked string synthesis ───────────────────────────────────
// Models a plucked string by seeding a delay-line with noise and averaging
// adjacent samples each period. High frequencies die first, leaving the warm
// fundamental — which is exactly how a real guitar string sounds.
function karplusStrong(
  sampleRate: number,
  freq: number,
  durationSecs: number,
  velocity: number,
  damping: number,
  sound: GuitarSound,
): Float32Array {
  const period = Math.max(2, Math.round(sampleRate / freq))
  const totalSamples = Math.ceil(sampleRate * durationSecs)
  const ring = new Float32Array(period)

  if (sound === 'nylon') {
    // Pre-filter excitation to simulate soft fingertip (removes harshness)
    for (let i = 0; i < period; i++) ring[i] = Math.random() * 2 - 1
    for (let pass = 0; pass < 4; pass++) {
      let prev = ring[period - 1]
      for (let i = 0; i < period; i++) {
        const cur = ring[i]
        ring[i] = (prev + cur) * 0.5
        prev = cur
      }
    }
  } else {
    // White noise for bright pick/pluck attack
    for (let i = 0; i < period; i++) ring[i] = Math.random() * 2 - 1
  }

  for (let i = 0; i < period; i++) ring[i] *= velocity

  const output = new Float32Array(totalSamples)
  let pos = 0
  for (let i = 0; i < totalSamples; i++) {
    const next = (pos + 1) % period
    output[i] = ring[pos]
    // KS averaging step: each cycle the delay line acts as a lossy lowpass
    ring[pos] = damping * (ring[pos] + ring[next]) * 0.5
    pos = next
  }

  // Soft release fade to avoid click at buffer end
  const fadeSamples = Math.min(Math.floor(sampleRate * 0.06), totalSamples)
  for (let i = 0; i < fadeSamples; i++) {
    output[totalSamples - fadeSamples + i] *= 1 - i / fadeSamples
  }

  return output
}

// ── Schedule a Karplus-Strong guitar note ─────────────────────────────────────
function scheduleKSNote(
  ctx: AudioContext,
  dest: AudioNode,
  freq: number,
  startTime: number,
  duration: number,
  velocity: number,
  sound: GuitarSound,
) {
  const sr = ctx.sampleRate

  // Frequency-dependent damping so ALL notes decay in the same target time
  // regardless of pitch. Per-second energy = damping^freq, so to reach 1%
  // in T seconds: damping = 0.01^(1/(freq × T)).
  // Without this, low strings (82 Hz) ring ~5× longer than high strings at
  // equal damping, which sounds muddy and annoying.
  const decayTime = sound === 'nylon' ? 2.5 : sound === 'clean' ? 1.2 : 1.8
  const damping = Math.pow(0.01, 1 / (freq * decayTime))

  const ksDur = Math.min(duration + decayTime * 0.6, decayTime + 0.4)
  const ksData = karplusStrong(sr, freq, ksDur, velocity, damping, sound)

  const buf = ctx.createBuffer(1, ksData.length, sr)
  buf.getChannelData(0).set(ksData)

  const src = ctx.createBufferSource()
  src.buffer = buf

  // Build a per-sound EQ chain after the raw KS output
  let chain: AudioNode = src

  if (sound === 'acoustic') {
    // Wooden body: low-mid resonance
    const body = ctx.createBiquadFilter()
    body.type = 'peaking'
    body.frequency.value = 190
    body.gain.value = 6
    body.Q.value = 1.3
    chain.connect(body); chain = body

    // Tame very high content (real acoustic isn't as bright as raw noise)
    const shelf = ctx.createBiquadFilter()
    shelf.type = 'highshelf'
    shelf.frequency.value = 4500
    shelf.gain.value = -5
    chain.connect(shelf); chain = shelf

  } else if (sound === 'nylon') {
    // Dark, warm lowpass
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 1800
    lp.Q.value = 0.6
    chain.connect(lp); chain = lp

    // Warmth boost
    const warmth = ctx.createBiquadFilter()
    warmth.type = 'peaking'
    warmth.frequency.value = 260
    warmth.gain.value = 5
    warmth.Q.value = 0.9
    chain.connect(warmth); chain = warmth

  } else if (sound === 'clean') {
    // Remove sub-bass mud
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 90
    chain.connect(hp); chain = hp

    // Presence sparkle
    const pres = ctx.createBiquadFilter()
    pres.type = 'peaking'
    pres.frequency.value = 2800
    pres.gain.value = 4
    pres.Q.value = 1.4
    chain.connect(pres); chain = pres
  }

  chain.connect(dest)

  const stopAt = startTime + ksDur + 0.05
  src.start(startTime)
  src.stop(stopAt)
  scheduledNodes.push({ node: src, stopAt })
}

// ── Synth: oscillator-based (intentionally electronic) ───────────────────────
function scheduleSynthNote(
  ctx: AudioContext,
  dest: AudioNode,
  freq: number,
  startTime: number,
  duration: number,
  velocity: number,
) {
  const osc1 = ctx.createOscillator()
  osc1.type = 'sawtooth'
  osc1.frequency.setValueAtTime(freq, startTime)

  const osc2 = ctx.createOscillator()
  osc2.type = 'sine'
  osc2.frequency.setValueAtTime(freq * 2, startTime)

  const osc3 = ctx.createOscillator()
  osc3.type = 'sine'
  osc3.frequency.setValueAtTime(freq * 3, startTime)

  const gain2 = ctx.createGain(); gain2.gain.value = 0.20
  const gain3 = ctx.createGain(); gain3.gain.value = 0.08

  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 2000
  filter.Q.value = 0.8

  const env = ctx.createGain()
  const attack = 0.003, decay = 0.12, sustain = 0.15, release = 0.20
  const endTime = startTime + Math.max(duration, 0.08)
  const releaseStart = Math.max(startTime + attack + decay, endTime - release)

  env.gain.setValueAtTime(0, startTime)
  env.gain.linearRampToValueAtTime(velocity, startTime + attack)
  env.gain.exponentialRampToValueAtTime(Math.max(0.001, velocity * sustain), startTime + attack + decay)
  env.gain.setValueAtTime(Math.max(0.001, velocity * sustain), releaseStart)
  env.gain.linearRampToValueAtTime(0.0001, endTime + release)

  osc1.connect(filter)
  osc2.connect(gain2); gain2.connect(filter)
  osc3.connect(gain3); gain3.connect(filter)
  filter.connect(env); env.connect(dest)

  const stopAt = endTime + release + 0.05
  osc1.start(startTime); osc1.stop(stopAt)
  osc2.start(startTime); osc2.stop(stopAt)
  osc3.start(startTime); osc3.stop(stopAt)
  scheduledNodes.push({ node: osc1, stopAt }, { node: osc2, stopAt }, { node: osc3, stopAt })
}

// ── Main note dispatcher ──────────────────────────────────────────────────────
function scheduleGuitarNote(
  ctx: AudioContext,
  dest: AudioNode,
  freq: number,
  startTime: number,
  duration: number,
  velocity: number,
  sound: GuitarSound,
) {
  if (sound === 'synth') {
    scheduleSynthNote(ctx, dest, freq, startTime, duration, velocity)
  } else {
    scheduleKSNote(ctx, dest, freq, startTime, duration, velocity, sound)
  }
}

function scheduleMetronomeClick(ctx: AudioContext, t: number, isDown: boolean) {
  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.value = isDown ? 1200 : 900
  const env = ctx.createGain()
  env.gain.setValueAtTime(0, t)
  env.gain.linearRampToValueAtTime(isDown ? 0.7 : 0.5, t + 0.005)
  env.gain.exponentialRampToValueAtTime(0.001, t + 0.1)
  osc.connect(env)
  env.connect(ctx.destination)
  osc.start(t)
  osc.stop(t + 0.12)
  scheduledNodes.push({ node: osc, stopAt: t + 0.15 })
}

export function previewNote(stringIndex: number, fret: number, sound: GuitarSound, capo = 0): void {
  const ctx = ensureCtx()
  if (!masterGain) return
  const freq = fretToFrequency(stringIndex, fret, capo)
  const play = () => {
    scheduleGuitarNote(ctx, masterGain!, freq, ctx.currentTime + 0.01, 0.5, 0.75, sound)
  }
  if (ctx.state === 'running') play()
  else ctx.resume().then(play).catch(() => {})
}

export async function startPlayback(
  track: GuitarTrack,
  fromBeat: number,
  sound: GuitarSound,
  onBeatUpdate: (beat: number) => void,
  onEnd: () => void,
  getLoop: () => boolean,
  getMetronome: () => boolean,
  getLoopRange: () => LoopRange | null,
) {
  stopPlayback()
  const ctx = ensureCtx()
  isPlayingFlag = true

  if (ctx.state !== 'running') await ctx.resume()
  if (!isPlayingFlag) return

  playStartAudioTime = ctx.currentTime + 0.05

  const beatDur    = 60 / track.bpm
  const totalBeats = track.totalBars * track.beatsPerBar

  const loopEnd = () => {
    const r = getLoopRange()
    return r ? Math.min(r.endBeat, totalBeats) : totalBeats
  }
  const endAudioTime = () => playStartAudioTime + (loopEnd() - fromBeat) * beatDur

  const sortedNotes = [...track.notes]
    .filter(n => n.startBeat >= fromBeat && n.startBeat < loopEnd())
    .sort((a, b) => a.startBeat - b.startBeat)

  let nextNoteIdx   = 0
  let nextMetroBeat = Math.ceil(fromBeat)
  const LOOKAHEAD   = 0.5

  function tick() {
    if (!isPlayingFlag) return
    const now     = ctx.currentTime
    const elapsed = now - playStartAudioTime
    const beat    = fromBeat + elapsed / beatDur

    const lookaheadCutoff = now + LOOKAHEAD

    if (scheduledNodes.length > 60) {
      scheduledNodes = scheduledNodes.filter(s => s.stopAt > now - 0.1)
    }

    while (nextNoteIdx < sortedNotes.length) {
      const note = sortedNotes[nextNoteIdx]
      const noteAudioTime = playStartAudioTime + (note.startBeat - fromBeat) * beatDur
      if (noteAudioTime > lookaheadCutoff) break
      if (!note.muted) {
        const noteDur = Math.max(0.05, note.durationBeats * beatDur)
        const freq    = fretToFrequency(note.stringIndex, note.fret, track.capo)
        scheduleGuitarNote(ctx, masterGain!, freq, noteAudioTime, noteDur, note.velocity, sound)
      }
      nextNoteIdx++
    }

    while (nextMetroBeat < loopEnd()) {
      const clickTime = playStartAudioTime + (nextMetroBeat - fromBeat) * beatDur
      if (clickTime > lookaheadCutoff) break
      if (getMetronome()) {
        scheduleMetronomeClick(ctx, clickTime, nextMetroBeat % track.beatsPerBar === 0)
      }
      nextMetroBeat++
    }

    onBeatUpdate(Math.min(beat, loopEnd()))

    if (now >= endAudioTime()) {
      if (getLoop()) {
        const range = getLoopRange()
        startPlayback(track, range ? range.startBeat : 0, sound, onBeatUpdate, onEnd, getLoop, getMetronome, getLoopRange)
      } else {
        const range = getLoopRange()
        stopPlayback()
        onBeatUpdate(range ? range.startBeat : 0)
        onEnd()
      }
      return
    }

    animFrameId = requestAnimationFrame(tick)
  }
  animFrameId = requestAnimationFrame(tick)
}

export function stopPlayback() {
  isPlayingFlag = false
  if (animFrameId !== null) { cancelAnimationFrame(animFrameId); animFrameId = null }
  const now = audioCtx ? audioCtx.currentTime : 0
  for (const s of scheduledNodes) {
    if (s.stopAt > now) { try { s.node.stop(now) } catch { /* already stopped */ } }
  }
  scheduledNodes = []
}

export function setMasterVolume(vol: number) {
  if (masterGain) masterGain.gain.value = Math.max(0, Math.min(1, vol))
}

export function getAudioContext(): AudioContext {
  return ensureCtx()
}

export function startRecordingMetronome(
  bpm: number,
  beatsPerBar: number,
  totalBeats: number,
  onBeat: (beatIndex: number) => void,
  onEnd: () => void,
): { stop: () => void; startAudioTime: number } {
  const ctx = ensureCtx()
  const beatDur = 60 / bpm
  const startAudioTime = ctx.currentTime + 0.15
  let stopped = false
  let nextBeat = 0
  const pending: ReturnType<typeof setTimeout>[] = []
  let rafId: number

  function tick() {
    if (stopped) return
    while (nextBeat <= totalBeats) {
      const t = startAudioTime + nextBeat * beatDur
      if (t > ctx.currentTime + 0.35) break
      if (nextBeat < totalBeats) {
        scheduleMetronomeClick(ctx, t, nextBeat % beatsPerBar === 0)
        const ms = Math.max(0, (t - ctx.currentTime) * 1000)
        pending.push(setTimeout(() => { if (!stopped) onBeat(nextBeat) }, ms))
      } else {
        const ms = Math.max(0, (t - ctx.currentTime) * 1000)
        pending.push(setTimeout(() => { if (!stopped) onEnd() }, ms))
      }
      nextBeat++
    }
    rafId = requestAnimationFrame(tick)
  }

  rafId = requestAnimationFrame(tick)
  return {
    startAudioTime,
    stop() {
      stopped = true
      cancelAnimationFrame(rafId)
      pending.forEach(clearTimeout)
    },
  }
}
