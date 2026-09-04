import { DRUM_ROWS, STEPS_PER_BEAT, type DrumHit, type DrumPieceId } from './types'

/**
 * Percussion notation for the Drum Tab Player.
 *
 * The score is drawn with VexFlow (already a dependency — the bass and guitar
 * score views use it, with Bravura self-hosted), so this module does no drawing.
 * What it owns is the part VexFlow can't know: where each kit piece sits on a
 * percussion staff, which notehead it takes, and how a list of hits becomes the
 * two rhythmic voices a drum chart is written in.
 *
 * Staff positions follow the standard percussion key, expressed as treble-clef
 * pitches the way every VexFlow percussion example does (bottom line = E4):
 *
 *   A5  crash          (one ledger above)     x
 *   G5  hi-hat                                x
 *   F5  ride / bell    (top line)             x / diamond
 *   E5  high tom       (4th space)            •
 *   D5  mid tom        (4th line)             •
 *   C5  snare / stick  (3rd space)            • / x
 *   A4  floor tom      (2nd space)            •
 *   F4  kick           (1st space)            •
 *   D4  hi-hat foot    (one ledger below)     x
 */

/** Which of the two written voices a piece belongs to. */
export type DrumVoice = 'up' | 'down'

export interface PieceNotation {
  /** VexFlow key, including its notehead suffix (`x2` = cross, `d2` = diamond). */
  key: string
  voice: DrumVoice
}

export const PIECE_NOTATION: Record<DrumPieceId, PieceNotation> = {
  'crash-edge': { key: 'a/5/x2', voice: 'up' },
  'crash-body': { key: 'a/5/x2', voice: 'up' },
  'crash-bell': { key: 'a/5/d2', voice: 'up' },
  'ride-edge':  { key: 'f/5/x2', voice: 'up' },
  'ride-body':  { key: 'f/5/x2', voice: 'up' },
  'ride-bell':  { key: 'f/5/d2', voice: 'up' },
  'hh-closed':  { key: 'g/5/x2', voice: 'up' },
  'hh-open':    { key: 'g/5/x2', voice: 'up' },
  'tom-hi':     { key: 'e/5',    voice: 'up' },
  'tom-lo':     { key: 'd/5',    voice: 'up' },
  'tom-floor':  { key: 'a/4',    voice: 'up' },
  'snare':      { key: 'c/5',    voice: 'up' },
  'stick':      { key: 'c/5/x2', voice: 'up' },
  // Feet get the down-stem voice, which is what makes a drum chart readable:
  // one rhythm above the beam line, one below.
  'kick':       { key: 'f/4',    voice: 'down' },
  'hh-foot':    { key: 'd/4/x2', voice: 'down' },
}

/** Pieces drawn with a small circle above the note (open hi-hat). */
export const OPEN_PIECES = new Set<DrumPieceId>(['hh-open'])

/** Ghost notes (velocity at or below this) are written in parentheses. */
export const GHOST_MAX_VELOCITY = 0.55

const NOTATION_ORDER = new Map<DrumPieceId, number>(
  DRUM_ROWS.map((r, i) => [r.id, i]),
)

/** beats → VexFlow duration token, snapped to the 16th grid the editor uses. */
export function beatsToVexDuration(beats: number, isRest = false): string {
  let base: string
  if (beats >= 3.5)       base = 'w'
  else if (beats >= 2.5)  base = isRest ? 'h' : 'hd'
  else if (beats >= 1.75) base = 'h'
  else if (beats >= 1.25) base = isRest ? 'q' : 'qd'
  else if (beats >= 0.875) base = 'q'
  else if (beats >= 0.625) base = isRest ? '8' : '8d'
  else if (beats >= 0.375) base = '8'
  else                     base = '16'
  return isRest ? base + 'r' : base
}

export function vexDurationToBeats(dur: string): number {
  const clean  = dur.replace('r', '')
  const dotted = clean.endsWith('d')
  const key    = dotted ? clean.slice(0, -1) : clean
  const base: Record<string, number> = { w: 4, h: 2, q: 1, '8': 0.5, '16': 0.25 }
  return (base[key] ?? 0.25) * (dotted ? 1.5 : 1)
}

export interface NotatedItem {
  /** Beat offset inside the bar. */
  beatInBar: number
  duration: string
  isRest: boolean
  pieces: { pieceId: DrumPieceId; key: string; open: boolean; ghost: boolean }[]
}

/**
 * Turns one bar's hits into a rhythmic sequence for a single voice: a chord at
 * every subdivision that has hits, a rest across every gap. A drum stroke has no
 * duration of its own, so a note lasts until the next event in its own voice —
 * which is how drum charts are written and read.
 */
export function buildVoiceSequence(
  hits: DrumHit[],
  barStartBeat: number,
  beatsPerBar: number,
  voice: DrumVoice,
): NotatedItem[] {
  const totalSlots = Math.round(beatsPerBar * STEPS_PER_BEAT)
  const slotMap = new Map<number, DrumHit[]>()

  for (const h of hits) {
    const notation = PIECE_NOTATION[h.pieceId]
    if (!notation || notation.voice !== voice) continue
    const slot = Math.round((h.startBeat - barStartBeat) * STEPS_PER_BEAT)
    if (slot < 0 || slot >= totalSlots) continue
    const arr = slotMap.get(slot) ?? []
    arr.push(h)
    slotMap.set(slot, arr)
  }

  const seq: NotatedItem[] = []
  let cursor = 0
  while (cursor < totalSlots) {
    let next = totalSlots
    for (let s = cursor + 1; s < totalSlots; s++) {
      if (slotMap.has(s)) { next = s; break }
    }
    const group = slotMap.get(cursor)
    const beatInBar = cursor / STEPS_PER_BEAT
    const spanBeats = (next - cursor) / STEPS_PER_BEAT

    if (!group) {
      seq.push({ beatInBar, duration: beatsToVexDuration(spanBeats, true), isRest: true, pieces: [] })
      cursor = next
      continue
    }

    // One key per staff position — two pieces sharing a line (a crash edge and a
    // crash body, say) would make VexFlow draw two noteheads on top of each other.
    const seen = new Set<string>()
    const pieces = group
      .sort((a, b) => (NOTATION_ORDER.get(a.pieceId) ?? 99) - (NOTATION_ORDER.get(b.pieceId) ?? 99))
      .filter(h => {
        const key = PIECE_NOTATION[h.pieceId].key
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .map(h => ({
        pieceId: h.pieceId,
        key: PIECE_NOTATION[h.pieceId].key,
        open: OPEN_PIECES.has(h.pieceId),
        ghost: h.velocity <= GHOST_MAX_VELOCITY,
      }))

    const duration = beatsToVexDuration(spanBeats, false)
    seq.push({ beatInBar, duration, isRest: false, pieces })
    cursor += Math.max(1, Math.round(vexDurationToBeats(duration) * STEPS_PER_BEAT))
  }

  return seq
}

/** VexFlow needs the rest to sit somewhere; these are the conventional lines. */
export const REST_KEY: Record<DrumVoice, string> = {
  up:   'c/5',
  down: 'f/4',
}
