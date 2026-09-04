import type { DrumKitId, DrumPieceId } from '../virtualDrums/drumSynth'

export type { DrumKitId, DrumPieceId }

/**
 * One drum stroke, positioned in beats rather than in a 16-step grid cell.
 *
 * The 16-step grid is only one way to look at this: modelling a hit by its beat
 * gets non-4/4 bars, multi-bar loops, swing and triplets for free (all of which
 * `src/lib/styles.ts` already produces), and it is what the notation view needs
 * — a staff draws note *values*, not cells. The grid is derived from these hits,
 * never the other way round.
 */
/**
 * A stroke that is more than one hit of the stick.
 *
 * `flam` is a grace note a few milliseconds before the main stroke; `drag` is
 * two. Both are written in real tabs (`f` and `d`) and both appear in the tabs
 * this player was tested against, where they used to parse as plain strokes —
 * audible as a single hit, which is the one thing a flam is not.
 */
export type DrumArticulation = 'flam' | 'drag'

export interface DrumHit {
  id: string
  pieceId: DrumPieceId
  startBeat: number   // float, 0-indexed beats from the top of the track
  velocity: number    // 0-1 (0.5 reads as a ghost note)
  articulation?: DrumArticulation
}

/** One stick hit: how far before the written beat, and how hard relative to it. */
export interface Strike {
  /**
   * Seconds *before* the written position.
   *
   * Seconds rather than beats on purpose: a flam is a physical gesture — the
   * two sticks are about 30 ms apart whether the tune is at 60 or at 180 — and
   * expressing it in beats would make it a thirty-second note at one tempo and
   * inaudible at another.
   */
  lead: number
  /** Multiplied into the hit's velocity. Grace notes are quieter than the stroke. */
  gain: number
}

const PLAIN: Strike[] = [{ lead: 0, gain: 1 }]
const FLAM: Strike[] = [{ lead: 0.030, gain: 0.55 }, { lead: 0, gain: 1 }]
const DRAG: Strike[] = [
  { lead: 0.058, gain: 0.42 },
  { lead: 0.029, gain: 0.48 },
  { lead: 0, gain: 1 },
]

/**
 * What a hit actually sounds like, as one or more strikes.
 *
 * One function so the live transport, the WAV render and the MIDI export cannot
 * disagree about what a flam is — the same reason `mixedVelocity` exists.
 */
export function strikesFor(articulation: DrumArticulation | undefined): Strike[] {
  if (articulation === 'flam') return FLAM
  if (articulation === 'drag') return DRAG
  return PLAIN
}

export interface DrumSection {
  name: string
  startBar: number
}

/**
 * One kit piece's channel settings — how loud it sits in the kit, and whether
 * it is heard at all.
 *
 * Separate from `DrumHit.velocity` on purpose, because they are different
 * things wearing the same units. Velocity is how hard *this* stroke was played:
 * it is what makes a ghost note a ghost note, and it varies stroke to stroke.
 * Level is where the whole piece sits in the mix, and applies to every stroke
 * on it. Before this existed the only control was a row slider that rewrote
 * every hit's velocity at once, which flattened the first to achieve the
 * second — turning down the hi-hat also erased its ghost notes.
 *
 * There is no pan: `drumSynth` plays mono into its own master, and a pan
 * control that did nothing would be worse than none.
 */
export interface DrumChannel {
  /**
   * 0-1, multiplied into the strike. 1 = as written, 0 = silent.
   *
   * It does not go above 1 because it could not do anything there:
   * `drumSynth.play` clamps velocity into `[0.1, 1]`, so a "120%" that quietly
   * became 100% would be a control that lies about what it does.
   */
  gain: number
  mute: boolean
  solo: boolean
}

/**
 * Below this a strike is silent rather than quiet. The synth clamps velocity up
 * to 0.1, so without this a level dragged to zero would still be audible.
 */
const SILENT_BELOW = 0.02

export type DrumMix = Partial<Record<DrumPieceId, DrumChannel>>

export const DEFAULT_CHANNEL: DrumChannel = { gain: 1, mute: false, solo: false }

export interface DrumTrack {
  id: string
  name: string
  bpm: number
  beatsPerBar: number
  totalBars: number
  kit: DrumKitId
  hits: DrumHit[]
  sections?: DrumSection[]
  /** Per-piece level and mute/solo. Absent means every piece as written. */
  mix?: DrumMix
  /**
   * 0-1 swing on the "and" of each beat, same meaning as `StylePattern.swing`:
   * 0 = straight, 1 = full triplet. Applied at playback only — the hits keep
   * their straight positions, because "swing 8ths" is a performance direction,
   * not something a chart notates as triplet fractions.
   */
  swing?: number
}

/** True while any piece is soloed — at which point everything else is silent. */
export function hasSolo(mix: DrumMix | undefined): boolean {
  if (!mix) return false
  for (const key in mix) {
    if (mix[key as DrumPieceId]?.solo) return true
  }
  return false
}

/**
 * The velocity a stroke is actually played at, or `null` when the mix silences
 * it. One function so the transport and the audition button cannot disagree
 * about whether a muted piece makes a sound.
 */
export function mixedVelocity(
  mix: DrumMix | undefined,
  pieceId: DrumPieceId,
  velocity: number,
  soloActive = hasSolo(mix),
): number | null {
  const channel = mix?.[pieceId]
  if (channel?.mute) return null
  if (soloActive && !channel?.solo) return null
  const scaled = velocity * (channel?.gain ?? 1)
  if (scaled < SILENT_BELOW) return null
  return Math.min(1, scaled)
}

/** Extra beats to delay a hit for swing feel. Only the "and" 8th of a beat moves. */
export function swingOffsetBeats(startBeat: number, swing: number | undefined): number {
  if (!swing || swing <= 0) return 0
  const slot = Math.round(startBeat * STEPS_PER_BEAT)
  if (slot % 4 !== 2) return 0
  return swing * (2 / 3 - 0.5)
}

/**
 * The kit pieces the tab exposes, in the order they are stacked — top to bottom
 * in both the grid and the ASCII tab, which is the order drum notation uses
 * (cymbals above, drums below, foot pedals last).
 *
 * This is the single dictionary shared by the grid rows, the notation mapping
 * and the text parser. `styleKey` ties each row back to the rhythm arrays in
 * `src/lib/styles.ts` so the library can seed itself from the chord player's
 * own styles; `tabLetter` is the standard ASCII drum-tab abbreviation.
 */
export interface DrumRow {
  id: DrumPieceId
  label: string
  short: string
  tabLetter: string
  /** Key in `StylePattern['rhythm']`, when this piece has one. */
  styleKey?: 'kick' | 'snare' | 'snareStick' | 'hihat' | 'hihatOpen' | 'hihatFoot'
    | 'tom1' | 'tom2' | 'floorTom' | 'ride' | 'crash'
  defaultVel: number
}

export const DRUM_ROWS: DrumRow[] = [
  { id: 'crash-edge', label: 'Crash',          short: 'Crash',  tabLetter: 'CC', styleKey: 'crash',      defaultVel: 0.95 },
  { id: 'ride-body',  label: 'Ride',           short: 'Ride',   tabLetter: 'RD', styleKey: 'ride',       defaultVel: 0.8  },
  // No style in `styles.ts` writes a bell part, but the kit has one and the
  // Clave / Afrobeat step presets are built on a cowbell — which is what
  // `ride-bell` is in the electronic kit, and a ride bell ping in the acoustic one.
  { id: 'ride-bell',  label: 'Bell',           short: 'Bell',   tabLetter: 'BL',                         defaultVel: 0.8  },
  { id: 'hh-closed',  label: 'Hi-hat closed',  short: 'HH cl.', tabLetter: 'HH', styleKey: 'hihat',      defaultVel: 0.6  },
  { id: 'hh-open',    label: 'Hi-hat open',    short: 'HH op.', tabLetter: 'OH', styleKey: 'hihatOpen',  defaultVel: 0.6  },
  { id: 'snare',      label: 'Snare',          short: 'Snare',  tabLetter: 'SD', styleKey: 'snare',      defaultVel: 0.95 },
  { id: 'stick',      label: 'Cross stick',    short: 'X-stick',tabLetter: 'CS', styleKey: 'snareStick', defaultVel: 0.85 },
  { id: 'tom-hi',     label: 'High tom',       short: 'Tom hi', tabLetter: 'HT', styleKey: 'tom1',       defaultVel: 0.9  },
  { id: 'tom-lo',     label: 'Mid tom',        short: 'Tom lo', tabLetter: 'MT', styleKey: 'tom2',       defaultVel: 0.9  },
  { id: 'tom-floor',  label: 'Floor tom',      short: 'Floor',  tabLetter: 'FT', styleKey: 'floorTom',   defaultVel: 0.9  },
  { id: 'kick',       label: 'Kick',           short: 'Kick',   tabLetter: 'BD', styleKey: 'kick',       defaultVel: 1    },
  { id: 'hh-foot',    label: 'Hi-hat foot',    short: 'HH ft.', tabLetter: 'HF', styleKey: 'hihatFoot',  defaultVel: 0.55 },
]

export const ROW_BY_PIECE: Record<string, DrumRow> = Object.fromEntries(
  DRUM_ROWS.map(r => [r.id, r]),
)

export function rowIndexOf(pieceId: DrumPieceId): number {
  return DRUM_ROWS.findIndex(r => r.id === pieceId)
}

/** Grid resolution. 4 = sixteenth notes, the resolution `styles.ts` is written in. */
export const STEPS_PER_BEAT = 4

/**
 * Width of the kit-piece label gutter, shared by the step grid and the
 * arrangement lane below it. It lives here rather than in either component
 * because the two only line their bars up while they agree on it, and a pair of
 * constants that must match is the kind that stops matching.
 *
 * Two of them because 152px is 39% of a 390px phone. The narrow one fits the
 * icon and the short name and nothing else, which is all there is room for —
 * the player picks one and passes it to both components.
 */
export const GRID_LABEL_W = 152
export const GRID_LABEL_W_NARROW = 92

export type DrumView = 'score' | 'grid' | 'text'

export interface LoopRange {
  startBeat: number
  endBeat: number
}

export const DRUM_STORAGE_KEY = 'drum-tab-track-v1'

/**
 * Order-independent fingerprint of a hit list — what was struck, where, how hard.
 * Ids are deliberately excluded: two parses of the same tab produce the same
 * music with different ids, and for "did this actually change anything?" only
 * the music counts.
 */
export function hitsSignature(hits: DrumHit[]): string {
  return hits
    .map(h => `${h.pieceId}@${h.startBeat.toFixed(4)}:${h.velocity.toFixed(2)}${h.articulation ? ':' + h.articulation : ''}`)
    .sort()
    .join('|')
}

let hitSeq = 0
export function makeHitId(): string {
  hitSeq += 1
  return `h${Date.now().toString(36)}${hitSeq.toString(36)}`
}
