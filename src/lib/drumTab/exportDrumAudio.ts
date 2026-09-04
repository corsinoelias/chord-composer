import { createDrumEngine } from '../virtualDrums/drumSynth'
import { downloadWav, normalizeBuffer, renderOffline } from '../audio/offline'
import { getDrumEngine } from './drumAudio'
import { soundingHits } from './drumMidi'
import { safeFileName } from '../smf'
import { strikesFor, type DrumTrack } from './types'

/**
 * The track as a WAV file.
 *
 * The render is the same kit, not a second one: `createDrumEngine` is handed an
 * `OfflineAudioContext` and the live engine's already-decoded samples, so every
 * voice, the compressor, the saturation and the reverb are the ones that were
 * playing a second ago. And the notes come from `soundingHits()` — the same
 * list the MIDI export writes and the transport schedules — so the mix (mute,
 * solo, level) and the swing cannot say one thing on the speakers and another
 * in the file.
 */

/** Room for a crash to ring out after the last bar rather than being cut off. */
const TAIL_SECONDS = 2.5

export interface DrumWavOptions {
  /** How many times the pattern is written into the file. */
  repeats?: number
  /** Four counted beats of the metronome before the first bar. */
  countIn?: boolean
}

export async function renderDrumTrack(
  track: DrumTrack,
  options: DrumWavOptions = {},
): Promise<AudioBuffer> {
  const repeats = Math.max(1, Math.round(options.repeats ?? 1))
  const live = getDrumEngine()
  // Waited on rather than raced: an export that starts before the samples have
  // decoded is a file full of the synthesized fallbacks.
  await live.samplesReady()

  const beatDur = 60 / track.bpm
  const loopBeats = track.totalBars * track.beatsPerBar
  const countInBeats = options.countIn ? track.beatsPerBar : 0
  const duration = (countInBeats + loopBeats * repeats) * beatDur + TAIL_SECONDS
  const sampleRate = live.context().sampleRate

  const hits = soundingHits(track)

  return renderOffline({
    duration,
    sampleRate,
    schedule(context) {
      const engine = createDrumEngine({ context, samples: live.sampleCache() })

      if (countInBeats) {
        for (let beat = 0; beat < countInBeats; beat++) {
          // The count-in is the kit's own cross stick rather than the transport's
          // click: the click lives on the live context's destination, and an
          // exported file should not need a second signal chain to have one.
          engine.play(track.kit, 'stick', beat === 0 ? 0.9 : 0.6, beat * beatDur)
        }
      }

      for (let pass = 0; pass < repeats; pass++) {
        const offset = (countInBeats + pass * loopBeats) * beatDur
        for (const { hit, beat, velocity } of hits) {
          // Same strikes the transport schedules, so a flam is a flam in the
          // file too rather than the single hit a literal render would give.
          for (const strike of strikesFor(hit.articulation)) {
            const at = offset + beat * beatDur - strike.lead
            if (at < 0) continue
            engine.play(track.kit, hit.pieceId, velocity * strike.gain, at)
          }
        }
      }
    },
  })
}

export async function exportDrumWav(track: DrumTrack, options?: DrumWavOptions): Promise<void> {
  const buffer = await renderDrumTrack(track, options)
  normalizeBuffer(buffer)
  downloadWav(buffer, `${safeFileName(track.name, 'drum-tab')}.wav`)
}
