import { createDrumEngine, type DrumEngine } from '../virtualDrums/drumSynth'
import { hasSolo, mixedVelocity, swingOffsetBeats } from './types'
import type { DrumTrack, DrumHit, DrumMix, LoopRange, DrumKitId, DrumPieceId } from './types'

/**
 * Transport for the Drum Tab Player.
 *
 * The sound itself comes entirely from `createDrumEngine()` (the Virtual Drums
 * kit — real samples for the acoustic kit, synthesis for the electronic one).
 * What this module adds is the same beat-based scheduling the Bass Tab Player
 * uses in `src/lib/bassTab/bassAudio.ts`: a 0.5 s lookahead window refilled on
 * every animation frame, so hits land on the audio clock while the playhead is
 * painted from it. A plain `setTimeout` loop (what the prototype used) drifts
 * audibly within a few bars.
 */

let engine: DrumEngine | null = null
let isPlayingFlag = false
let animFrameId: number | null = null
let playStartAudioTime = 0
let clickNodes: { osc: OscillatorNode; stopAt: number }[] = []
let masterVolume = 0.9

const LOOKAHEAD = 0.5   // seconds of audio scheduled ahead of the clock

function ensureEngine(): DrumEngine {
  if (!engine) {
    engine = createDrumEngine()
    engine.setVolume(masterVolume)
  }
  return engine
}

export function getDrumEngine(): DrumEngine {
  return ensureEngine()
}

export function getAudioContext(): AudioContext {
  return ensureEngine().context()
}

export function setMasterVolume(vol: number): void {
  masterVolume = Math.max(0, Math.min(1, vol))
  if (engine) engine.setVolume(masterVolume)
}

/** Fire one piece right now — pad taps, grid clicks, row auditions. */
export function previewHit(
  kit: DrumKitId,
  pieceId: DrumPieceId,
  velocity = 0.9,
  /**
   * Passed so an audition is the same sound the transport would make: a muted
   * piece stays silent when you click its row, instead of the mixer saying one
   * thing and the speakers another.
   */
  mix?: DrumMix,
): void {
  const mixed = mixedVelocity(mix, pieceId, velocity)
  if (mixed === null) return
  velocity = mixed
  const e = ensureEngine()
  const ctx = e.context()
  if (ctx.state === 'running') {
    e.play(kit, pieceId, velocity)
  } else {
    ctx.resume().then(() => e.play(kit, pieceId, velocity)).catch(() => {})
  }
}

// Same click as the bass tab's metronome (1200 Hz downbeat / 900 Hz off-beat),
// scheduled on the drum engine's own context so it never drifts from the kit.
function scheduleMetronomeClick(ctx: AudioContext, t: number, isDown: boolean): void {
  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.value = isDown ? 1200 : 900
  const env = ctx.createGain()
  env.gain.setValueAtTime(0, t)
  env.gain.linearRampToValueAtTime(isDown ? 0.5 : 0.35, t + 0.005)
  env.gain.exponentialRampToValueAtTime(0.001, t + 0.1)
  osc.connect(env)
  env.connect(ctx.destination)
  osc.start(t)
  osc.stop(t + 0.12)
  clickNodes.push({ osc, stopAt: t + 0.15 })
}

export function isPlaying(): boolean {
  return isPlayingFlag
}

export function stopPlayback(): void {
  isPlayingFlag = false
  if (animFrameId !== null) { cancelAnimationFrame(animFrameId); animFrameId = null }
  const now = engine ? engine.now() : 0
  for (const c of clickNodes) {
    if (c.stopAt > now) { try { c.osc.stop(now) } catch { /* already stopped */ } }
  }
  clickNodes = []
  // Kit voices are one-shots that ring out on their own — cutting them here
  // would clip a crash mid-decay on every Stop.
}

export async function startPlayback(
  track: DrumTrack,
  fromBeat: number,
  onBeatUpdate: (beat: number) => void,
  onEnd: () => void,
  getLoop: () => boolean,
  getMetronome: () => boolean,
  getLoopRange: () => LoopRange | null,
  /**
   * Read per tick, like `getLoop` and `getMetronome`, so moving a fader is
   * heard within the lookahead window instead of needing the transport
   * restarted — which on a mixer would mean a gap on every drag.
   */
  getMix: () => DrumMix | undefined = () => track.mix,
): Promise<void> {
  stopPlayback()
  const e = ensureEngine()
  const ctx = e.context()
  isPlayingFlag = true

  // iOS/Android: the context can be suspended — its currentTime is meaningless
  // until resume() resolves, so everything scheduled before that lands at once.
  if (ctx.state !== 'running') {
    await ctx.resume()
  }
  if (!isPlayingFlag) return

  playStartAudioTime = ctx.currentTime + 0.06

  const beatDur    = 60 / track.bpm
  const totalBeats = track.totalBars * track.beatsPerBar
  const kit        = track.kit

  const loopEnd = () => {
    const r = getLoopRange()
    return r ? Math.min(r.endBeat, totalBeats) : totalBeats
  }
  const endAudioTime = () => playStartAudioTime + (loopEnd() - fromBeat) * beatDur

  const sortedHits: DrumHit[] = [...track.hits]
    .filter(h => h.startBeat >= fromBeat && h.startBeat < loopEnd())
    .sort((a, b) => a.startBeat - b.startBeat)

  let nextHitIdx    = 0
  let nextMetroBeat = Math.ceil(fromBeat)

  function tick() {
    if (!isPlayingFlag) return

    const now     = ctx.currentTime
    const elapsed = now - playStartAudioTime
    const beat    = fromBeat + elapsed / beatDur
    const cutoff  = now + LOOKAHEAD
    // Once per tick rather than once per hit: solo is a property of the whole
    // mix, so asking per stroke would walk the object on every scheduled note.
    const mix        = getMix()
    const soloActive = hasSolo(mix)

    if (clickNodes.length > 60) {
      clickNodes = clickNodes.filter(c => c.stopAt > now - 0.1)
    }

    while (nextHitIdx < sortedHits.length) {
      const hit = sortedHits[nextHitIdx]
      const swung = hit.startBeat + swingOffsetBeats(hit.startBeat, track.swing)
      const t = playStartAudioTime + (swung - fromBeat) * beatDur
      if (t > cutoff) break
      const vel = mixedVelocity(mix, hit.pieceId, hit.velocity, soloActive)
      if (vel !== null) e.play(kit, hit.pieceId, vel, t)
      nextHitIdx++
    }

    while (nextMetroBeat < loopEnd()) {
      const clickTime = playStartAudioTime + (nextMetroBeat - fromBeat) * beatDur
      if (clickTime > cutoff) break
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
        startPlayback(track, nextFrom, onBeatUpdate, onEnd, getLoop, getMetronome, getLoopRange, getMix)
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
