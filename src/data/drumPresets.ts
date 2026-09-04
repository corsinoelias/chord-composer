import {
  MUSICAL_STYLES, generateBarPattern, getSlotsPerBar, getStyleById,
  type StylePattern,
} from '../lib/styles'
import { PRESETS as STEP_PRESETS, PRESET_NAMES as STEP_PRESET_NAMES } from './drumMachinePresets'
import type { TrackId } from '../hooks/useDrumSynth'
import {
  DRUM_ROWS, STEPS_PER_BEAT, makeHitId,
  type DrumHit, type DrumPieceId, type DrumTrack,
} from '../lib/drumTab/types'

/**
 * The Drum Tab Player's library.
 *
 * Nothing here is a copy of a pattern. The grooves are *derived* at runtime from
 * the two sets ChordSequence already owns:
 *
 *  - `MUSICAL_STYLES` (`src/lib/styles.ts`) — the chord player's own rhythms, with
 *    their fills, swing and time signatures. Edit a style in the chord editor and
 *    this library follows.
 *  - `PRESETS` (`src/data/drumMachinePresets.ts`) — the Drum Machine's 16-step
 *    patterns.
 */

export type DrumPresetSource = 'style' | 'stepPreset'

export interface DrumPreset {
  id: string
  name: string
  category: string
  bpm: number
  source: DrumPresetSource
  /** Builds the track on demand — the library list itself stays cheap. */
  build: () => DrumTrack
}

// `styleKey` → row, for walking a StylePattern's rhythm arrays.
const ROWS_WITH_STYLE_KEY = DRUM_ROWS.filter(r => r.styleKey)

/** Bars to render for a style: at least 4 (so bar 4 gets its fill), and always a
 *  whole number of the style's own loop so a 2-bar groove isn't cut in half. */
function barsForStyle(style: StylePattern): number {
  const loopBars = style.loopBars ?? 1
  return loopBars * Math.max(1, Math.ceil(4 / loopBars))
}

export function trackFromStyle(style: StylePattern, id = `style-${style.id}`): DrumTrack {
  const slotsPerBar  = getSlotsPerBar(style)
  const beatsPerBar  = slotsPerBar / STEPS_PER_BEAT
  const totalBars    = barsForStyle(style)
  const hits: DrumHit[] = []

  for (let bar = 1; bar <= totalBars; bar++) {
    // phraseLength 4 is what the chord player uses, so bar 4 carries the fill.
    const pattern = generateBarPattern(style, bar, 4)
    for (const row of ROWS_WITH_STYLE_KEY) {
      const arr = pattern[row.styleKey!] as number[] | undefined
      if (!arr) continue
      for (let slot = 0; slot < slotsPerBar; slot++) {
        const v = arr[slot]
        if (!v || v <= 0) continue
        hits.push({
          id: makeHitId(),
          pieceId: row.id,
          startBeat: (bar - 1) * beatsPerBar + slot / STEPS_PER_BEAT,
          velocity: Math.min(1, v),
        })
      }
    }
  }

  hits.sort((a, b) => a.startBeat - b.startBeat)

  return {
    id,
    name: style.name,
    bpm: style.bpm,
    beatsPerBar,
    totalBars,
    kit: 'acoustic',
    // Straight positions, swung at playback — the same thing a real chart means
    // by "swing 8ths". Baking the offset into startBeat would make every off-beat
    // an unnotatable fraction.
    swing: style.swing,
    hits,
  }
}

// The Drum Machine synth has eight tracks; the kit has fifteen pieces. Only the
// mapping below is lossy, and only where the kit genuinely lacks the sound:
// there is no hand clap, so a clap doubles the snare (which is what a layered
// clap does anyway) and is dropped when a snare already sits on that step.
const STEP_TRACK_TO_PIECE: Record<TrackId, DrumPieceId> = {
  kick:  'kick',
  snare: 'snare',
  clap:  'snare',
  chh:   'hh-closed',
  ohh:   'hh-open',
  tom:   'tom-lo',
  rim:   'stick',
  cow:   'ride-bell',
}

export function trackFromStepPreset(name: string): DrumTrack {
  const preset = STEP_PRESETS[name] ?? STEP_PRESETS.Basic
  const beatsPerBar = 4
  const totalBars = 4
  const hits: DrumHit[] = []
  const taken = new Set<string>()

  const order: TrackId[] = ['kick', 'snare', 'chh', 'ohh', 'tom', 'rim', 'cow', 'clap']
  for (const trackId of order) {
    const bits = preset[trackId]
    if (!bits) continue
    const pieceId = STEP_TRACK_TO_PIECE[trackId]
    const row = DRUM_ROWS.find(r => r.id === pieceId)!
    for (let step = 0; step < bits.length; step++) {
      if (bits[step] !== '1') continue
      const key = `${pieceId}@${step}`
      if (taken.has(key)) continue
      taken.add(key)
      for (let bar = 0; bar < totalBars; bar++) {
        hits.push({
          id: makeHitId(),
          pieceId,
          startBeat: bar * beatsPerBar + step / STEPS_PER_BEAT,
          velocity: row.defaultVel,
        })
      }
    }
  }

  hits.sort((a, b) => a.startBeat - b.startBeat)
  return { id: `step-${name}`, name, bpm: 118, beatsPerBar, totalBars, kit: 'electronic', hits }
}

export const DRUM_PRESETS: DrumPreset[] = [
  ...MUSICAL_STYLES.map<DrumPreset>(style => ({
    id: `style-${style.id}`,
    name: style.name,
    category: style.category,
    bpm: style.bpm,
    source: 'style',
    build: () => trackFromStyle(style),
  })),
  ...STEP_PRESET_NAMES.map<DrumPreset>(name => ({
    id: `step-${name}`,
    name,
    category: 'Drum machine',
    bpm: 118,
    source: 'stepPreset',
    build: () => trackFromStepPreset(name),
  })),
]

export function getDrumPreset(id: string): DrumPreset | undefined {
  return DRUM_PRESETS.find(p => p.id === id)
}

/**
 * What the editor lands on when there is nothing in the URL or in localStorage:
 * the chord player's Rock Básico, four bars, fill on the fourth.
 */
export function defaultDrumTrack(): DrumTrack {
  const style = getStyleById('rock_basic') ?? MUSICAL_STYLES[0]
  return { ...trackFromStyle(style, 'default-rock'), name: style.name }
}
