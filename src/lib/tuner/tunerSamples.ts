// Lightweight sample playback for the tuner's string-pin clicks and reference tone.
// Reuses the same local sample sets as the Chord Player (public/audio/guitar-*, public/samples/modo)
// without pulling in audioEngine.ts's full mixing/effects/drum pipeline — this page only ever
// needs to play one note at a time.
import { preloadSampleDir, scheduleSampledNoteByDir } from '@/lib/bassTab/sampleEngine'

export type TunerInstrumentId = 'bass4' | 'bass5' | 'electric' | 'acoustic' | 'ukulele'

// Kept in sync with GUITAR_TYPE_NOTES in src/lib/audioEngine.ts
const GUITAR_NOTES: Record<string, string[]> = {
  'guitar-acoustic': ['A2', 'A3', 'A4', 'As2', 'As3', 'As4', 'B2', 'B3', 'B4', 'C3', 'C4', 'C5', 'Cs3', 'Cs4', 'D3', 'D4', 'Ds3', 'Ds4', 'E2', 'E3', 'E4', 'F3', 'F4', 'Fs3', 'Fs4', 'G3', 'G4', 'Gs3', 'Gs4'],
  'guitar-electric': ['A2', 'A3', 'A4', 'A5', 'C3', 'C4', 'C5', 'C6', 'Cs2', 'Ds3', 'Ds4', 'Ds5', 'E2', 'Fs2', 'Fs3', 'Fs4', 'Fs5'],
  'guitar-nylon': ['A2', 'A3', 'A4', 'A5', 'As5', 'B1', 'B2', 'B3', 'B4', 'Cs3', 'Cs4', 'Cs5', 'D2', 'D3', 'E2', 'E3', 'E4', 'E5', 'Fs2', 'Fs3', 'Fs4', 'Fs5', 'G3', 'G5', 'Gs2', 'Gs4', 'Gs5'],
}

// Which local sample set backs each tuner instrument. Ukulele has no dedicated sample set in the
// repo, so it borrows the nylon-string guitar samples — the closest real timbre available — pitch
// -shifted up into ukulele range.
const INSTRUMENT_SOURCE: Record<TunerInstrumentId, { kind: 'guitar'; dir: string } | { kind: 'bass'; dir: string }> = {
  bass4: { kind: 'bass', dir: 'modo' },
  bass5: { kind: 'bass', dir: 'modo' },
  electric: { kind: 'guitar', dir: 'guitar-electric' },
  acoustic: { kind: 'guitar', dir: 'guitar-acoustic' },
  ukulele: { kind: 'guitar', dir: 'guitar-nylon' },
}

const NOTE_BASE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

// Guitar sample keys look like "Cs3" (C#3) or "As2" (A#2)
function guitarKeyToMidi(key: string): number {
  const m = key.match(/^([A-G])(s?)(-?\d)$/)
  if (!m) return 60
  const semis = NOTE_BASE[m[1]] + (m[2] === 's' ? 1 : 0)
  return (parseInt(m[3], 10) + 1) * 12 + semis
}

const guitarBuffers = new Map<string, Map<string, AudioBuffer | null>>()
const guitarLoading = new Map<string, Promise<void>>()

function loadGuitarDir(ctx: BaseAudioContext, dir: string): Promise<void> {
  const existing = guitarLoading.get(dir)
  if (existing) return existing
  const notes = GUITAR_NOTES[dir] ?? []
  const bufMap = new Map<string, AudioBuffer | null>()
  guitarBuffers.set(dir, bufMap)
  const p = Promise.all(notes.map(async key => {
    try {
      const res = await fetch(`/audio/${dir}/${key}.mp3`)
      bufMap.set(key, res.ok ? await ctx.decodeAudioData(await res.arrayBuffer()) : null)
    } catch {
      bufMap.set(key, null)
    }
  })).then(() => {})
  guitarLoading.set(dir, p)
  return p
}

function playGuitarBuffer(ctx: BaseAudioContext, dest: AudioNode, dir: string, targetMidi: number, durationSec: number, velocity: number): void {
  const bufMap = guitarBuffers.get(dir)
  if (!bufMap) return
  let bestKey: string | null = null, bestDist = Infinity, bestMidi = 0
  for (const key of GUITAR_NOTES[dir] ?? []) {
    const midi = guitarKeyToMidi(key)
    const d = Math.abs(midi - targetMidi)
    if (d < bestDist) { bestDist = d; bestKey = key; bestMidi = midi }
  }
  if (!bestKey) return
  const buf = bufMap.get(bestKey)
  if (!buf) return

  const src = ctx.createBufferSource()
  src.buffer = buf
  src.playbackRate.value = 2 ** ((targetMidi - bestMidi) / 12)

  const gain = ctx.createGain()
  const attackSec = 0.006
  const relSec = Math.min(0.06, durationSec * 0.1)
  const now = ctx.currentTime
  gain.gain.setValueAtTime(0, now)
  gain.gain.linearRampToValueAtTime(velocity, now + attackSec)
  gain.gain.setValueAtTime(velocity, now + durationSec - relSec)
  gain.gain.linearRampToValueAtTime(0, now + durationSec)

  src.connect(gain)
  gain.connect(dest)
  src.start(now)
  src.stop(now + durationSec + 0.02)
}

export function preloadTunerInstrument(ctx: BaseAudioContext, inst: TunerInstrumentId): Promise<void> {
  const source = INSTRUMENT_SOURCE[inst]
  return source.kind === 'bass' ? preloadSampleDir(ctx, source.dir) : loadGuitarDir(ctx, source.dir)
}

export function playTunerNote(ctx: BaseAudioContext, dest: AudioNode, inst: TunerInstrumentId, midi: number, durationSec = 2.2, velocity = 0.85): void {
  const source = INSTRUMENT_SOURCE[inst]
  if (source.kind === 'bass') {
    // Bass samples played at true pitch read as too muddy/low for a quick tuning-preview click —
    // shift preview playback up an octave. Purely cosmetic: pitch detection and the target-frequency
    // table elsewhere still use the real (untransposed) note.
    scheduleSampledNoteByDir(ctx, dest, source.dir, midi + 12, ctx.currentTime, durationSec, velocity)
  } else {
    playGuitarBuffer(ctx, dest, source.dir, midi, durationSec, velocity)
  }
}
