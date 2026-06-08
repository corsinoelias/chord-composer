import type { BassNote, BassTrack } from './types'
import {
  fretToStaffPos, classifyDuration, stemDirection,
  STEM_LENGTH, NOTATION, staffLineY,
  getLedgerLines,
  type StaffPos, type NoteHead,
} from './notationTheory'
import { beatToX } from './tabNotation'

// ── Types ─────────────────────────────────────────────────────────────────
export interface NotatedNote {
  noteId:     string
  stringIndex: 0 | 1 | 2 | 3
  fret:       number

  // Pitch
  staffLine:  number
  noteName:   string
  octave:     number
  accidental: '#' | null
  ledgerLines: number[]   // staffLine values for ledger lines

  // Rhythm
  head:       NoteHead

  // Layout
  x:          number      // center x in SVG
  noteY:      number      // center y of notehead
  stemDir:    'up' | 'down'
  stemX:      number      // x of stem attachment
  stemTipY:   number      // y of stem tip

  // Beam grouping
  beamGroupId: number | null
}

export interface BeamGroup {
  id:     number
  notes:  NotatedNote[]
  dir:    'up' | 'down'
  x1:     number
  x2:     number
  y1:     number  // stem tip y at first note
  y2:     number  // stem tip y at last note
  level:  1 | 2   // 1=eighth beam, 2=second beam for sixteenth
}

// ── Main pipeline ─────────────────────────────────────────────────────────
export function computeNotatedNotes(
  track: BassTrack,
  pxPerBeat: number,
  notationOriginY: number,
): { notes: NotatedNote[]; beams: BeamGroup[] } {
  const ls = NOTATION.lineSpacing
  const NW = ls * 0.72   // notehead half-width
  const NH = ls * 0.52   // notehead half-height

  const notated: NotatedNote[] = track.notes.map(n => {
    const pos      = fretToStaffPos(n.stringIndex, n.fret)
    const head     = classifyDuration(n.durationBeats)
    const dir      = stemDirection(pos.staffLine)
    const noteY    = staffLineY(pos.staffLine, notationOriginY)
    const x        = beatToX(n.startBeat, pxPerBeat)
    const stemX    = dir === 'up' ? x + NW : x - NW
    const stemTipY = dir === 'up' ? noteY - STEM_LENGTH : noteY + STEM_LENGTH

    return {
      noteId:      n.id,
      stringIndex: n.stringIndex,
      fret:        n.fret,
      staffLine:   pos.staffLine,
      noteName:    pos.noteName,
      octave:      pos.octave,
      accidental:  pos.accidental,
      ledgerLines: getLedgerLines(pos.staffLine),
      head,
      x,
      noteY,
      stemDir:     dir,
      stemX,
      stemTipY,
      beamGroupId: null,
    }
  })

  // ── Beam grouping ─────────────────────────────────────────────────────
  // Group beamable notes (8th/16th) within the same beat group
  const beams: BeamGroup[] = []
  let beamCounter = 0
  const bpb = track.beatsPerBar
  const numGroups = Math.max(1, Math.round(bpb / 2))
  const groupSize = bpb / numGroups

  for (let bar = 0; bar < track.totalBars; bar++) {
    for (let g = 0; g < numGroups; g++) {
      const gStart = bar * bpb + g * groupSize
      const gEnd   = gStart + groupSize

      // Collect beamable notes in this group (beamLevel >= 1)
      const group = notated.filter(
        nn => nn.head.beamLevel >= 1 &&
              nn.x >= beatToX(gStart, pxPerBeat) - 1 &&
              nn.x < beatToX(gEnd,   pxPerBeat) - 1,
      )
      if (group.length < 2) continue

      const id  = beamCounter++

      // Unified stem direction for the whole beam group (avg position)
      const avgStaffLine = group.reduce((s, nn) => s + nn.staffLine, 0) / group.length
      const dir: 'up' | 'down' = avgStaffLine < 2 ? 'up' : 'down'

      // Re-apply uniform direction to every note in the group
      group.forEach(nn => {
        nn.stemDir  = dir
        nn.stemX    = dir === 'up' ? nn.x + NW : nn.x - NW
        nn.stemTipY = dir === 'up' ? nn.noteY - STEM_LENGTH : nn.noteY + STEM_LENGTH
        nn.beamGroupId = id
      })

      // Adjust stem tips so all go to the same slanted height
      const tipYs = group.map(nn => nn.stemTipY)
      const minY  = Math.min(...tipYs)
      const maxY  = Math.max(...tipYs)
      const avgY  = (minY + maxY) / 2

      // Beam endpoints: interpolate across the group
      const x1   = group[0].stemX
      const x2   = group[group.length - 1].stemX
      const dx   = x2 - x1 || 1
      group.forEach(nn => {
        const t = (nn.stemX - x1) / dx
        // Interpolate with subtle angle
        const targetY = avgY + (t - 0.5) * (tipYs[tipYs.length - 1] - tipYs[0]) * 0.4
        nn.stemTipY = targetY
      })

      beams.push({
        id,
        notes:  group,
        dir,
        x1, x2,
        y1: group[0].stemTipY,
        y2: group[group.length - 1].stemTipY,
        level: group.some(nn => nn.head.beamLevel === 2) ? 2 : 1,
      })
    }
  }

  return { notes: notated, beams }
}
