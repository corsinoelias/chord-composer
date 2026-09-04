import {
  DRUM_ROWS, ROW_BY_PIECE, STEPS_PER_BEAT, makeHitId,
  type DrumArticulation, type DrumHit, type DrumRow, type DrumTrack,
} from '../../drumTab/types'
import type { TabTextModel } from '../types'
import { parseTabGeometry, type ParsedTabGeometry } from '../parse'

/**
 * The drum kit's half of the ASCII tab: which letter labels a row, which
 * character a stroke is written with, and how hard `X` is compared to `x`.
 * Everything about lines, bars and columns is in `lib/tabtext`.
 */

// Real-world tabs are inconsistent about labels, and rejecting a paste over the
// label is a bad first impression.
const LABEL_ALIASES: Record<string, string> = {
  B: 'BD', BASS: 'BD', KICK: 'BD', K: 'BD', BD: 'BD',
  S: 'SD', SN: 'SD', SNARE: 'SD', SD: 'SD',
  // No `CH`: in the wild that is a china cymbal, which this kit does not have.
  // Folding it into the hi-hat would put a china line's crashes onto the hats
  // and — because two labels would then be the same row — make the parser read
  // one system as two. Better reported as an unknown label.
  H: 'HH', HC: 'HH', HHC: 'HH', HIHAT: 'HH', HH: 'HH',
  HO: 'OH', HHO: 'OH', OH: 'OH',
  C: 'CC', CR: 'CC', CRASH: 'CC', CC: 'CC',
  R: 'RD', RC: 'RD', RIDE: 'RD', RD: 'RD',
  T1: 'HT', HT: 'HT', TH: 'HT',
  T2: 'MT', MT: 'MT', TM: 'MT', T: 'MT',
  T3: 'FT', FT: 'FT', TF: 'FT', FLOOR: 'FT',
  HF: 'HF', HHF: 'HF', F: 'HF',
  CS: 'CS', XS: 'CS', RIM: 'CS',
  BL: 'BL', CB: 'BL', COW: 'BL',
}

const ROW_BY_LETTER: Record<string, DrumRow> = Object.fromEntries(
  DRUM_ROWS.map(r => [r.tabLetter, r]),
)

/** Cymbals, hats and the cross stick are written with `x`; drums with `o`. */
export function isXHead(pieceId: string): boolean {
  return pieceId.startsWith('hh-') || pieceId.startsWith('crash')
    || pieceId.startsWith('ride') || pieceId === 'stick'
}

/**
 * What a character in a hit position means.
 *
 * `+` and `o` on a hi-hat line are the closed/open convention; `f` is a flam
 * and `d` a drag, which are strokes with grace notes rather than characters to
 * report as unreadable.
 */
const GHOST_CHARS = new Set(['g', 'G'])
const HIT_CHARS = new Set(['o', 'O', 'x', 'X', 'b', 'B', '+'])

/** Strokes that are more than one hit of the stick, in the letters tabs use. */
const ARTICULATION_CHARS: Record<string, DrumArticulation> = {
  f: 'flam', F: 'flam',
  d: 'drag', D: 'drag',
}

export const TAB_CHARS = new Set([...GHOST_CHARS, ...HIT_CHARS, ...Object.keys(ARTICULATION_CHARS)])

export function resolveDrumRow(rawLabel: string): { key: string; label: string } | null {
  const key = rawLabel.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  if (!key) return null
  const letter = LABEL_ALIASES[key] ?? key
  const row = ROW_BY_LETTER[letter]
  return row ? { key: row.id, label: row.tabLetter } : null
}

/** Rows always shown even when empty, so there is somewhere to type. */
const ALWAYS_SHOWN = new Set(['crash-edge', 'hh-closed', 'snare', 'kick'])

export function drumTrackToModel(
  track: DrumTrack,
  columnsPerBeat = STEPS_PER_BEAT,
): TabTextModel {
  const used = new Set(track.hits.map(h => h.pieceId))
  const rows = DRUM_ROWS.filter(r => used.has(r.id) || ALWAYS_SHOWN.has(r.id))
  const cells = new Map<string, Map<number, string>>()

  for (const row of rows) cells.set(row.id, new Map())

  for (const hit of track.hits) {
    const bucket = cells.get(hit.pieceId)
    if (!bucket) continue
    const column = Math.round(hit.startBeat * columnsPerBeat)
    if (column < 0) continue
    const base = isXHead(hit.pieceId) ? 'x' : 'o'
    // A flam or a drag is written with its own letter, which is what says the
    // stroke has grace notes; its dynamic goes with the letter's case.
    const head = hit.articulation === 'flam' ? 'f' : hit.articulation === 'drag' ? 'd' : base
    const token = hit.articulation
      ? (hit.velocity >= 0.95 ? head.toUpperCase() : head)
      : hit.velocity <= 0.55 ? 'g' : hit.velocity >= 0.95 ? base.toUpperCase() : base
    // Two strokes rounding to the same column can only be drawn once; the
    // louder one wins, so a flam does not read as a ghost note.
    const existing = bucket.get(column)
    if (existing && existing === existing.toUpperCase() && token !== token.toUpperCase()) continue
    bucket.set(column, token)
  }

  return {
    rows: rows.map(r => ({ key: r.id, label: r.tabLetter })),
    beatsPerBar: track.beatsPerBar,
    totalBars: track.totalBars,
    columnsPerBeat,
    cells,
    header: `♩ = ${track.bpm} bpm    ${track.totalBars} bars × ${track.beatsPerBar}/4`,
    sections: track.sections,
  }
}

export function parseDrumGeometry(text: string, beatsPerBar = 4): ParsedTabGeometry {
  return parseTabGeometry(text, { beatsPerBar, resolveRow: resolveDrumRow })
}

export interface DrumParseResult {
  hits: DrumHit[]
  bars: number
  sections: { name: string; startBar: number }[]
  unknownLabels: string[]
  unknownChars: string[]
}

/**
 * Interpolating between count-line marks lands on exact positions in an even
 * tab and on float noise in an uneven one. Snapping to a 48th of a beat keeps
 * triplets and thirty-second bursts — both of which appear in real tabs — while
 * removing 0.24999-style drift that would print back as a different column.
 */
const SNAP = 48

export function drumHitsFromText(text: string, beatsPerBar = 4): DrumParseResult {
  const parsed = parseDrumGeometry(text, beatsPerBar)
  const hits: DrumHit[] = []
  const unknownChars = new Set<string>()

  for (const row of parsed.rows) {
    const drumRow = ROW_BY_PIECE[row.key]
    if (!drumRow) continue
    for (const cell of row.cells) {
      // One character is one stroke: `ddX` in a spaced tab is three strokes on
      // consecutive columns, not one token three characters wide.
      const ch = cell.text[0]
      const articulation: DrumArticulation | undefined = ARTICULATION_CHARS[ch]
      let velocity: number
      if (GHOST_CHARS.has(ch)) velocity = 0.5
      else if (articulation) velocity = ch === ch.toUpperCase() ? 1 : drumRow.defaultVel
      else if (HIT_CHARS.has(ch)) {
        velocity = ch !== ch.toLowerCase() && ch !== '+' ? 1 : drumRow.defaultVel
      } else {
        unknownChars.add(ch)
        continue
      }
      hits.push({
        id: makeHitId(),
        pieceId: drumRow.id,
        startBeat: Math.max(0, Math.round(cell.beat * SNAP) / SNAP),
        velocity,
        ...(articulation ? { articulation } : {}),
      })
    }
  }

  hits.sort((a, b) => a.startBeat - b.startBeat)
  return {
    hits,
    bars: parsed.bars,
    sections: parsed.sections,
    unknownLabels: parsed.unknownLabels,
    unknownChars: [...unknownChars],
  }
}
