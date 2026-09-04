import { createDrumEngine, type DrumEngine } from '../virtualDrums/drumSynth'
import { hasSolo, mixedVelocity, strikesFor, swingOffsetBeats, STEPS_PER_BEAT } from './types'
import type { DrumTrack, DrumHit, DrumMix, LoopRange, DrumKitId, DrumPieceId } from './types'

/**
 * Transport for the Drum Tab Player.
 *
 * The sound itself comes entirely from `createDrumEngine()` (the Virtual Drums
 * kit — real samples for the acoustic kit, synthesis for the electronic one).
 * What this module adds is the scheduling.
 *
 * **Nothing about the track is snapshotted.** The scheduler holds a cursor —
 * "the next sixteenth I have not handed to the audio clock yet" — and on every
 * pass re-reads the live track through `getTrack()` to decide what that
 * sixteenth sounds like. So editing a cell, dragging BPM, switching kit, muting
 * a piece or adding a bar is heard on the very next step instead of on the next
 * loop, and none of it needs the transport restarted. It is the same model
 * `DrumMachine.tsx` uses, which is why that page already felt live and this one
 * did not.
 *
 * Two clocks drive it, deliberately:
 *
 * - a `setInterval` fills the lookahead window, because `requestAnimationFrame`
 *   is throttled (or stopped) in a background tab, which would starve the audio
 *   clock and drop the whole pattern;
 * - a `requestAnimationFrame` loop reports the playhead, because that is a
 *   painting job and should not run more often than the screen does.
 *
 * The lookahead is short on purpose. The old 0.5 s window meant an edit could
 * be up to half a second of already-committed audio too late to matter — the
 * "I changed it right before it played and nothing happened" this replaces.
 * 0.12 s is under the ~150 ms where a listener stops hearing an edit as
 * immediate, and still four scheduling passes deep at the 25 ms timer.
 */

let engine: DrumEngine | null = null
let isPlayingFlag = false
let schedulerId: ReturnType<typeof setInterval> | null = null
let animFrameId: number | null = null
let clickNodes: { osc: OscillatorNode; stopAt: number }[] = []
let masterVolume = 0.9

/** Seconds of audio committed ahead of the clock. See the note above. */
const LOOKAHEAD = 0.12
/** How often the window is refilled. Four passes fit inside one lookahead. */
const SCHEDULE_MS = 25
/** Lead-in before the first step, so the first hit is never late. */
const START_LEAD = 0.06

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
  if (schedulerId !== null) { clearInterval(schedulerId); schedulerId = null }
  if (animFrameId !== null) { cancelAnimationFrame(animFrameId); animFrameId = null }
  const now = engine ? engine.now() : 0
  for (const c of clickNodes) {
    if (c.stopAt > now) { try { c.osc.stop(now) } catch { /* already stopped */ } }
  }
  clickNodes = []
  // Kit voices are one-shots that ring out on their own — cutting them here
  // would clip a crash mid-decay on every Stop.
}

/**
 * Move the playhead while the transport runs. Consumed by the next scheduling
 * pass rather than applied here, so a seek can never interleave with the window
 * being filled and leave half a bar of stale audio committed behind it.
 */
let pendingSeekBeat: number | null = null

export function seekPlayback(beat: number): void {
  if (!isPlayingFlag) return
  pendingSeekBeat = beat
}

/**
 * Hits bucketed by sixteenth, rebuilt only when the hit array's identity
 * changes. The editor replaces the array on every edit, so this is both the
 * change detector and the index — a scheduling pass that finds the same array
 * it saw last time does no work at all.
 *
 * Buckets are keyed by the *nearest* sixteenth; a hit that does not sit exactly
 * on one keeps its remainder and is scheduled that far after the step, so
 * imported tabs with off-grid strokes still play where they were written.
 */
let bucketSource: DrumHit[] | null = null
let bucketsBySlot = new Map<number, DrumHit[]>()

function hitsAtSlot(hits: DrumHit[], slot: number): DrumHit[] | undefined {
  if (hits !== bucketSource) {
    const next = new Map<number, DrumHit[]>()
    for (const h of hits) {
      const s = Math.round(h.startBeat * STEPS_PER_BEAT)
      const at = next.get(s)
      if (at) at.push(h)
      else next.set(s, [h])
    }
    bucketsBySlot = next
    bucketSource = hits
  }
  return bucketsBySlot.get(slot)
}

export interface DrumPlaybackHandles {
  /** The live track. Re-read every pass — this is what makes edits immediate. */
  getTrack: () => DrumTrack
  getLoop: () => boolean
  getMetronome: () => boolean
  getLoopRange: () => LoopRange | null
  /** Called on every animation frame with the interpolated beat position. */
  onBeat: (beat: number) => void
  onEnd: () => void
}

export async function startPlayback(
  fromBeat: number,
  h: DrumPlaybackHandles,
): Promise<void> {
  stopPlayback()
  const e = ensureEngine()
  const ctx = e.context()
  isPlayingFlag = true
  pendingSeekBeat = null

  // iOS/Android: the context can be suspended — its currentTime is meaningless
  // until resume() resolves, so everything scheduled before that lands at once.
  if (ctx.state !== 'running') {
    await ctx.resume()
  }
  if (!isPlayingFlag) return

  /** Next sixteenth to commit, absolute from the top of the track. */
  let cursor   = Math.max(0, Math.round(fromBeat * STEPS_PER_BEAT))
  /** The audio time that sixteenth lands on. */
  let cursorAt = ctx.currentTime + START_LEAD
  /** Set once the last step of a non-looping pass has been committed. */
  let finishAt: number | null = null

  // What the playhead paints from: the last step that has actually sounded,
  // plus the ones still queued ahead of the clock.
  type Step = { slot: number; at: number; dur: number }
  let queue: Step[] = []
  let head: Step = { slot: cursor, at: cursorAt, dur: 60 / h.getTrack().bpm / STEPS_PER_BEAT }

  /** The half-open slot range being played, from the live track each pass. */
  function windowSlots(track: DrumTrack): { start: number; end: number } {
    const total = track.totalBars * track.beatsPerBar * STEPS_PER_BEAT
    const r = h.getLoopRange()
    if (!r) return { start: 0, end: total }
    return {
      start: Math.max(0, Math.round(r.startBeat * STEPS_PER_BEAT)),
      end: Math.min(total, Math.round(r.endBeat * STEPS_PER_BEAT)),
    }
  }

  function fill(): void {
    if (!isPlayingFlag || finishAt !== null) return
    const track   = h.getTrack()
    const now     = ctx.currentTime
    const beatDur = 60 / track.bpm
    const slotDur = beatDur / STEPS_PER_BEAT
    const { start, end } = windowSlots(track)
    // A window with nothing in it (every bar deleted mid-play) would spin here.
    if (end <= start) return

    if (pendingSeekBeat !== null) {
      cursor = Math.min(end - 1, Math.max(start, Math.round(pendingSeekBeat * STEPS_PER_BEAT)))
      cursorAt = now + 0.02
      pendingSeekBeat = null
      queue = []
      head = { slot: cursor, at: cursorAt, dur: slotDur }
    }

    // Fell behind the clock — a long frame, a throttled tab, a GC pause. Dumping
    // the backlog into the past would fire it all at once as a flam, so the
    // cursor is dragged forward to now and the missed steps are simply not heard.
    if (cursorAt < now) cursorAt = now + 0.005

    // Bars removed under the cursor, or a loop range that moved behind it.
    if (cursor >= end || cursor < start) cursor = start

    const mix   = track.mix
    const solo  = hasSolo(mix)
    const metro = h.getMetronome()
    const horizon = now + LOOKAHEAD

    while (cursorAt < horizon) {
      const hits = hitsAtSlot(track.hits, cursor)
      if (hits) {
        for (const hit of hits) {
          const vel = mixedVelocity(mix, hit.pieceId, hit.velocity, solo)
          if (vel === null) continue
          // Whatever the hit's beat is that the nearest sixteenth is not, plus
          // the swing push, expressed as a delay from the step's own time.
          const offBeats = (hit.startBeat - cursor / STEPS_PER_BEAT)
            + swingOffsetBeats(hit.startBeat, track.swing)
          const at = cursorAt + offBeats * beatDur
          // A plain stroke is one strike at `at`; a flam or a drag adds its
          // grace notes ahead of it. Their lead is in seconds, so it does not
          // stretch with the tempo — see `strikesFor`.
          for (const strike of strikesFor(hit.articulation)) {
            e.play(track.kit, hit.pieceId, vel * strike.gain, Math.max(now, at - strike.lead))
          }
        }
      }
      if (metro && cursor % STEPS_PER_BEAT === 0) {
        scheduleMetronomeClick(ctx, cursorAt, (cursor / STEPS_PER_BEAT) % track.beatsPerBar === 0)
      }
      queue.push({ slot: cursor, at: cursorAt, dur: slotDur })

      cursor++
      cursorAt += slotDur
      if (cursor >= end) {
        if (!h.getLoop()) { finishAt = cursorAt; return }
        cursor = start
      }
    }

    if (clickNodes.length > 60) {
      clickNodes = clickNodes.filter(c => c.stopAt > now - 0.1)
    }
  }

  function frame(): void {
    if (!isPlayingFlag) return
    const now = ctx.currentTime
    while (queue.length && queue[0].at <= now) head = queue.shift()!

    if (finishAt !== null && now >= finishAt) {
      const range = h.getLoopRange()
      stopPlayback()
      h.onBeat(range ? range.startBeat : 0)
      h.onEnd()
      return
    }

    // Between two steps the playhead is interpolated, so it travels rather than
    // hopping — the score cursor in particular reads as a moving line.
    const into = head.dur > 0 ? (now - head.at) / head.dur : 0
    h.onBeat((head.slot + Math.max(0, Math.min(1, into))) / STEPS_PER_BEAT)

    animFrameId = requestAnimationFrame(frame)
  }

  fill()
  schedulerId = setInterval(fill, SCHEDULE_MS)
  animFrameId = requestAnimationFrame(frame)
}
