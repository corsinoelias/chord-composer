import { type GuitarTrack, type GuitarSound, type LoopRange } from './types'
import { fretToFrequency } from './guitarTheory'

let audioCtx: AudioContext | null = null
let masterGain: GainNode | null = null
let scheduledNodes: OscillatorNode[] = []
let isPlayingFlag = false
let animFrameId: number | null = null
let playStartAudioTime = 0

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

function scheduleGuitarNote(
  ctx: AudioContext,
  dest: AudioNode,
  freq: number,
  startTime: number,
  duration: number,
  velocity: number,
  sound: GuitarSound,
) {
  // Primary oscillator — triangle for warmth, sawtooth for brighter sounds
  const osc1 = ctx.createOscillator()
  osc1.type = sound === 'synth' ? 'sawtooth' : 'triangle'
  osc1.frequency.setValueAtTime(freq, startTime)

  const osc2 = ctx.createOscillator()
  osc2.type = 'sine'
  osc2.frequency.setValueAtTime(freq * 2, startTime)

  const osc3 = ctx.createOscillator()
  osc3.type = 'sine'
  osc3.frequency.setValueAtTime(freq * 3, startTime)

  const gain2 = ctx.createGain()
  gain2.gain.value = sound === 'nylon' ? 0.12 : 0.20

  const gain3 = ctx.createGain()
  gain3.gain.value = sound === 'nylon' ? 0.04 : 0.08

  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = sound === 'acoustic' ? 3200
    : sound === 'nylon' ? 2800
    : sound === 'clean' ? 5000
    : 2000
  filter.Q.value = 0.8

  // Guitar pluck envelope: very fast attack, fast decay into low sustain
  const env = ctx.createGain()
  const attack  = 0.003
  const decay   = sound === 'nylon' ? 0.30 : sound === 'acoustic' ? 0.20 : 0.12
  const sustain = sound === 'nylon' ? 0.25 : 0.15
  const release = 0.20
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
  filter.connect(env)
  env.connect(dest)

  const stopAt = endTime + release + 0.05
  osc1.start(startTime); osc1.stop(stopAt)
  osc2.start(startTime); osc2.stop(stopAt)
  osc3.start(startTime); osc3.stop(stopAt)
  scheduledNodes.push(osc1, osc2, osc3)
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
  scheduledNodes.push(osc)
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

  const segEnd = loopEnd()
  for (const note of track.notes) {
    if (note.startBeat < fromBeat || note.startBeat >= segEnd) continue
    const noteStart = playStartAudioTime + (note.startBeat - fromBeat) * beatDur
    const noteDur   = Math.max(0.05, note.durationBeats * beatDur)
    const freq      = fretToFrequency(note.stringIndex, note.fret, track.capo)
    scheduleGuitarNote(ctx, masterGain!, freq, noteStart, noteDur, note.velocity, sound)
  }

  let nextMetroBeat = Math.ceil(fromBeat)
  const METRO_LOOKAHEAD = 0.3

  function tick() {
    if (!isPlayingFlag) return
    const elapsed = ctx.currentTime - playStartAudioTime
    const beat    = fromBeat + elapsed / beatDur

    const lookaheadCutoff = ctx.currentTime + METRO_LOOKAHEAD
    while (nextMetroBeat < loopEnd()) {
      const clickTime = playStartAudioTime + (nextMetroBeat - fromBeat) * beatDur
      if (clickTime > lookaheadCutoff) break
      if (getMetronome()) {
        scheduleMetronomeClick(ctx, clickTime, nextMetroBeat % track.beatsPerBar === 0)
      }
      nextMetroBeat++
    }

    onBeatUpdate(Math.min(beat, loopEnd()))

    if (ctx.currentTime >= endAudioTime()) {
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
  for (const osc of scheduledNodes) { try { osc.stop() } catch { /* already stopped */ } }
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
