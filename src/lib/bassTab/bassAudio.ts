import { type BassTrack, type BassSound, type LoopRange } from './types'
import { fretToFrequency } from './bassTheory'
import { scheduleSampledNote, scheduleSampledNoteAsync, preloadAllSampledSounds, preloadSamples, preloadSamplesForMidis, warmOfflineContext, isSampledSound, stopAllSampledNodes } from './sampleEngine'

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

const SYNTH_FALLBACK: SoundParams = { waveform: 'sawtooth', attack: 0.010, decay: 0.05, sustain: 0.90, release: 0.10, filterFreq: 800, harmGain: 0.30 }

const SOUND_PARAMS: Record<BassSound, SoundParams> = {
  electric: { waveform: 'sine',     attack: 0.020, decay: 0.15, sustain: 0.60, release: 0.30, filterFreq: 1200, harmGain: 0.20 },
  picked:   { waveform: 'sawtooth', attack: 0.005, decay: 0.08, sustain: 0.60, release: 0.15, filterFreq: 2000, harmGain: 0.15 },
  synth:    { waveform: 'sawtooth', attack: 0.010, decay: 0.05, sustain: 0.90, release: 0.10, filterFreq:  800, harmGain: 0.30 },
  slap:     SYNTH_FALLBACK,
  fender:   SYNTH_FALLBACK,
  finger:   SYNTH_FALLBACK,
  muted:    SYNTH_FALLBACK,
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
  midiNote = Math.round(69 + 12 * Math.log2(freq / 440)),
) {
  if (isSampledSound(sound)) {
    scheduleSampledNote(ctx as unknown as BaseAudioContext, dest, sound, midiNote, startTime, duration, velocity)
    return
  }
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
  scheduledOscillators.push(osc)
}

// Preview a single note immediately (for fretboard taps / note selection)
export function previewNote(stringIndex: number, fret: number, sound: BassSound): void {
  const ctx = ensureCtx()
  if (!masterGain) return
  if (isSampledSound(sound)) stopAllSampledNodes()
  const freq = fretToFrequency(stringIndex, fret)
  const midiNote = Math.round(69 + 12 * Math.log2(freq / 440))
  const schedule = () => {
    if (isSampledSound(sound)) {
      // Only load the one sample needed for this specific note
      preloadSamplesForMidis(ctx, sound, [midiNote]).then(() => {
        scheduleNote(ctx, masterGain!, freq, ctx.currentTime + 0.01, 0.5, 0.75, sound)
      }).catch(() => {})
    } else {
      scheduleNote(ctx, masterGain!, freq, ctx.currentTime + 0.01, 0.5, 0.75, sound)
    }
  }
  // On mobile the context may be suspended until resume() resolves — wait for it
  if (ctx.state === 'running') {
    schedule()
  } else {
    ctx.resume().then(schedule).catch(() => {})
  }
}

export async function startPlayback(
  track: BassTrack,
  fromBeat: number,
  sound: BassSound,
  onBeatUpdate: (beat: number) => void,
  onEnd: () => void,
  getLoop: () => boolean,
  getMetronome: () => boolean,
  getLoopRange: () => LoopRange | null,
) {
  stopPlayback()
  const ctx = ensureCtx()
  isPlayingFlag = true

  // iOS/Android: context may be suspended — wait for actual resume before using currentTime
  if (ctx.state !== 'running') {
    await ctx.resume()
  }
  // Preload only the samples actually used by this track (avoids downloading all 30 files)
  if (isSampledSound(sound) && track.notes.length > 0) {
    const midiNotes = track.notes.map(n =>
      Math.round(69 + 12 * Math.log2(fretToFrequency(n.stringIndex, n.fret) / 440))
    )
    await preloadSamplesForMidis(ctx, sound, midiNotes)
  }
  // Guard: playback was stopped while we were preloading
  if (!isPlayingFlag) return

  playStartAudioTime = ctx.currentTime + 0.05

  const beatDur    = 60 / track.bpm
  const totalBeats = track.totalBars * track.beatsPerBar

  const loopEnd = () => {
    const r = getLoopRange()
    return r ? Math.min(r.endBeat, totalBeats) : totalBeats
  }
  const endAudioTime = () => playStartAudioTime + (loopEnd() - fromBeat) * beatDur

  // Schedule all notes for this playback segment
  const segEnd = loopEnd()
  for (const note of track.notes) {
    if (note.startBeat < fromBeat || note.startBeat >= segEnd) continue
    const noteStart = playStartAudioTime + (note.startBeat - fromBeat) * beatDur
    const noteDur   = Math.max(0.05, note.durationBeats * beatDur)
    const freq      = fretToFrequency(note.stringIndex, note.fret)
    scheduleNote(ctx, masterGain!, freq, noteStart, noteDur, note.velocity, sound)
  }

  // Dynamic metronome: schedule one beat at a time with a 0.3s lookahead
  let nextMetroBeat = Math.ceil(fromBeat)
  const METRO_LOOKAHEAD = 0.3

  function tick() {
    if (!isPlayingFlag) return

    const elapsed = ctx.currentTime - playStartAudioTime
    const beat    = fromBeat + elapsed / beatDur

    // Advance metronome schedule into the lookahead window
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
        const nextFrom = range ? range.startBeat : 0
        startPlayback(track, nextFrom, sound, onBeatUpdate, onEnd, getLoop, getMetronome, getLoopRange)
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

export async function renderTrackOffline(track: BassTrack, sound: BassSound): Promise<AudioBuffer> {
  const totalBeats    = track.totalBars * track.beatsPerBar
  const beatDur       = 60 / track.bpm
  const totalDuration = totalBeats * beatDur + 2
  const sampleRate    = 44100
  const numChannels   = 2

  const offCtx = new OfflineAudioContext(numChannels, Math.ceil(totalDuration * sampleRate), sampleRate)
  const gain   = offCtx.createGain()
  gain.gain.value = 0.75
  gain.connect(offCtx.destination)

  if (isSampledSound(sound)) {
    await warmOfflineContext(offCtx, sound)
    await Promise.all(track.notes
      .filter(n => n.startBeat >= 0 && n.startBeat < totalBeats)
      .map(n => {
        const noteStart = n.startBeat * beatDur
        const noteDur   = Math.max(0.05, n.durationBeats * beatDur)
        const midi      = Math.round(69 + 12 * Math.log2(fretToFrequency(n.stringIndex, n.fret) / 440))
        return scheduleSampledNoteAsync(offCtx, gain, sound, midi, noteStart + 0.05, noteDur, n.velocity)
      })
    )
  } else {
    for (const note of track.notes) {
      if (note.startBeat < 0 || note.startBeat >= totalBeats) continue
      const noteStart = note.startBeat * beatDur
      const noteDur   = Math.max(0.05, note.durationBeats * beatDur)
      const freq      = fretToFrequency(note.stringIndex, note.fret)
      scheduleNote(offCtx as unknown as AudioContext, gain, freq, noteStart + 0.05, noteDur, note.velocity, sound)
    }
  }

  return offCtx.startRendering()
}

export function stopPlayback() {
  isPlayingFlag = false
  if (animFrameId !== null) { cancelAnimationFrame(animFrameId); animFrameId = null }
  for (const osc of scheduledOscillators) { try { osc.stop() } catch { /* already stopped */ } }
  scheduledOscillators = []
  stopAllSampledNodes()
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
  const ctx          = ensureCtx()
  const beatDur      = 60 / bpm
  const startAudioTime = ctx.currentTime + 0.15
  let stopped        = false
  let nextBeat       = 0
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
