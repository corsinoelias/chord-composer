import { type BassTrack, type BassSound } from './types'
import { fretToFrequency } from './bassTheory'

let audioCtx: AudioContext | null = null
let masterGain: GainNode | null = null
let scheduledOscillators: OscillatorNode[] = []
let isPlayingFlag = false
let animFrameId: number | null = null
let playStartAudioTime = 0

interface SoundParams {
  waveform: OscillatorType
  attack: number; decay: number; sustain: number; release: number
  filterFreq: number; harmGain: number
}

const SOUND_PARAMS: Record<BassSound, SoundParams> = {
  electric: { waveform: 'sine',     attack: 0.020, decay: 0.15, sustain: 0.60, release: 0.30, filterFreq: 1200, harmGain: 0.20 },
  picked:   { waveform: 'sawtooth', attack: 0.005, decay: 0.08, sustain: 0.60, release: 0.15, filterFreq: 2000, harmGain: 0.15 },
  synth:    { waveform: 'sawtooth', attack: 0.010, decay: 0.05, sustain: 0.90, release: 0.10, filterFreq:  800, harmGain: 0.30 },
  slap:     { waveform: 'square',   attack: 0.003, decay: 0.06, sustain: 0.40, release: 0.10, filterFreq: 3000, harmGain: 0.10 },
}

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

function scheduleNote(
  ctx: AudioContext, dest: AudioNode,
  freq: number, startTime: number, duration: number, velocity: number, sound: BassSound,
) {
  const p = SOUND_PARAMS[sound]

  const osc1 = ctx.createOscillator()
  osc1.type = p.waveform
  osc1.frequency.setValueAtTime(freq, startTime)

  const osc2 = ctx.createOscillator()
  osc2.type = 'triangle'
  osc2.frequency.setValueAtTime(freq * 2, startTime)

  const harmGain = ctx.createGain()
  harmGain.gain.value = p.harmGain

  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = p.filterFreq
  filter.Q.value = 1.2

  const env = ctx.createGain()
  const endTime = startTime + duration
  const releaseStart = Math.max(startTime + p.attack + p.decay, endTime - p.release)

  env.gain.setValueAtTime(0, startTime)
  env.gain.linearRampToValueAtTime(velocity, startTime + p.attack)
  env.gain.linearRampToValueAtTime(velocity * p.sustain, startTime + p.attack + p.decay)
  env.gain.setValueAtTime(velocity * p.sustain, releaseStart)
  env.gain.linearRampToValueAtTime(0, endTime + 0.01)

  osc1.connect(filter)
  osc2.connect(harmGain)
  harmGain.connect(filter)
  filter.connect(env)
  env.connect(dest)

  const stopAt = endTime + 0.05
  osc1.start(startTime); osc1.stop(stopAt)
  osc2.start(startTime); osc2.stop(stopAt)
  scheduledOscillators.push(osc1, osc2)
}

function scheduleMetronome(
  ctx: AudioContext,
  _dest: AudioNode,   // unused — click bypasses masterGain so it's always audible
  startAudioTime: number, fromBeat: number, totalBeats: number,
  bpm: number, beatsPerBar: number,
) {
  const beatDur = 60 / bpm

  for (let beat = 0; beat < totalBeats; beat++) {
    if (beat < fromBeat - 0.001) continue
    const t = startAudioTime + (beat - fromBeat) * beatDur
    if (t < ctx.currentTime - 0.01) continue

    const isDown = beat % beatsPerBar === 0

    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = isDown ? 1200 : 900

    const env = ctx.createGain()
    env.gain.setValueAtTime(0, t)
    env.gain.linearRampToValueAtTime(isDown ? 0.7 : 0.5, t + 0.005)
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.1)

    osc.connect(env)
    // Bypass masterGain — click is always audible regardless of instrument volumes
    env.connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.12)
    scheduledOscillators.push(osc)
  }
}

// Preview a single note immediately (for fretboard taps / note selection)
export function previewNote(stringIndex: number, fret: number, sound: BassSound): void {
  const ctx = ensureCtx()
  if (!masterGain) return
  const freq = fretToFrequency(stringIndex, fret)
  scheduleNote(ctx, masterGain, freq, ctx.currentTime + 0.01, 0.5, 0.75, sound)
}

export function startPlayback(
  track: BassTrack,
  fromBeat: number,
  sound: BassSound,
  onBeatUpdate: (beat: number) => void,
  onEnd: () => void,
  loop: boolean,
  metronome = false,
) {
  stopPlayback()
  const ctx = ensureCtx()
  playStartAudioTime = ctx.currentTime + 0.05
  isPlayingFlag = true

  const beatDur = 60 / track.bpm
  const totalBeats = track.totalBars * track.beatsPerBar
  const endAudioTime = playStartAudioTime + (totalBeats - fromBeat) * beatDur

  for (const note of track.notes) {
    if (note.startBeat < fromBeat || note.startBeat >= totalBeats) continue
    const noteStart = playStartAudioTime + (note.startBeat - fromBeat) * beatDur
    const noteDur = Math.max(0.05, note.durationBeats * beatDur)
    const freq = fretToFrequency(note.stringIndex, note.fret)
    scheduleNote(ctx, masterGain!, freq, noteStart, noteDur, note.velocity, sound)
  }

  if (metronome) {
    scheduleMetronome(ctx, masterGain!, playStartAudioTime, fromBeat, totalBeats, track.bpm, track.beatsPerBar)
  }

  function tick() {
    if (!isPlayingFlag) return
    const elapsed = ctx.currentTime - playStartAudioTime
    const beat = fromBeat + elapsed * (track.bpm / 60)
    onBeatUpdate(Math.min(beat, totalBeats))

    if (ctx.currentTime >= endAudioTime) {
      if (loop) {
        startPlayback(track, 0, sound, onBeatUpdate, onEnd, loop, metronome)
      } else {
        stopPlayback()
        onBeatUpdate(0)
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
  for (const osc of scheduledOscillators) { try { osc.stop() } catch { /* already stopped */ } }
  scheduledOscillators = []
}

export function setMasterVolume(vol: number) {
  if (masterGain) masterGain.gain.value = Math.max(0, Math.min(1, vol))
}
