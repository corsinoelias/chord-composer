// Real sampled grand piano for the "Acoustic Piano" sound. Reuses the same
// sample files as the Chord Player's own engine (src/lib/audioEngine.ts —
// /audio/piano/1.mp3..88.mp3, MIDI 21-108, one sample per note) but is a
// standalone module: Virtual Piano owns its own audio pipeline, same as
// src/lib/virtualDrums/drumSynth.ts does for the drum kit.

const samples: Record<number, AudioBuffer | null> = {}
let loaded = false

export function arePianoSamplesLoaded(): boolean {
  return loaded
}

export function getPianoSample(midi: number): AudioBuffer | null {
  return samples[midi] ?? null
}

/**
 * Loads all 88 piano samples (1.mp3..88.mp3 = MIDI notes 21-108) with a
 * concurrency pool of 8, middle octaves (most used) first.
 */
export async function loadPianoSamples(ctx: BaseAudioContext): Promise<void> {
  if (loaded) return

  const keys = Array.from({ length: 88 }, (_, i) => i + 1).sort((a, b) => {
    const inRange = (k: number) => { const m = k + 20; return m >= 48 && m <= 96 }
    if (inRange(a) && !inRange(b)) return -1
    if (!inRange(a) && inRange(b)) return 1
    return 0
  })

  const queue = [...keys]
  const CONCURRENCY = 8

  const worker = async () => {
    while (queue.length > 0) {
      const i = queue.shift() as number
      const midiNote = i + 20
      try {
        const response = await fetch(`/audio/piano/${i}.mp3`)
        samples[midiNote] = response.ok
          ? await ctx.decodeAudioData(await response.arrayBuffer())
          : null
      } catch {
        samples[midiNote] = null
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  loaded = true
}
