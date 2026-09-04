import React, { useMemo } from 'react'
import { DRUM_ROWS, type DrumPieceId, type DrumTrack } from '../../lib/drumTab/types'
import { BT, alpha } from '../../lib/bassTab/theme'

/**
 * The pattern fingerprint shown beside every rhythm in the library.
 *
 * It is not a small editor — nothing here is clickable and no velocity is
 * readable at this size. Its only job is to make two grooves distinguishable
 * at a glance in a list of 32, so that picking "Reggaeton" is a matter of
 * recognising a shape rather than reading a word.
 *
 * Built from `div`s in a grid rather than SVG or canvas: at 90×34 px there is
 * no geometry to compute, and the DOM version inherits the theme tokens
 * directly instead of needing literal colours passed in.
 */

/**
 * `DRUM_ROWS` has 12 pieces and 34 px fits about five stripes, so the pieces
 * are grouped. The grouping keeps the vertical order of the grid — cymbals up
 * top, kick at the bottom — so a thumbnail and the editor read the same way.
 *
 * Two lanes are empty in most rhythms (Cymbals in 25 of the 32 presets, Toms in
 * 29), which was measured, not guessed. They stay anyway: fixed lane positions
 * are what makes two thumbnails comparable, and a lane that collapses when
 * empty would move the rest and turn every fingerprint into a different shape.
 */
const THUMB_LANES: { label: string; ids: DrumPieceId[] }[] = [
  { label: 'Cymbals', ids: ['crash-edge', 'ride-body', 'ride-bell'] },
  { label: 'Hi-hat',  ids: ['hh-closed', 'hh-open', 'hh-foot'] },
  { label: 'Snare',   ids: ['snare', 'stick'] },
  { label: 'Toms',    ids: ['tom-hi', 'tom-lo', 'tom-floor'] },
  { label: 'Kick',    ids: ['kick'] },
]

/**
 * Every piece must land in exactly one lane. Without this, adding a row to
 * `DRUM_ROWS` later would drop it from every thumbnail silently — the grooves
 * that use it would just look emptier than they are.
 */
if (import.meta.env?.DEV) {
  const placed = THUMB_LANES.flatMap(l => l.ids)
  const missing = DRUM_ROWS.filter(r => !placed.includes(r.id)).map(r => r.id)
  if (missing.length) {
    console.warn(`DrumPatternThumb: pieces with no lane — ${missing.join(', ')}`)
  }
}

const STEPS_PER_BEAT = 4

interface Props {
  track: DrumTrack
  /** Box width in px. The step columns divide whatever is left after padding. */
  width?: number
  height?: number
  /** Surface the box sits on, so it reads as inset rather than as another card. */
  background?: string
}

/** Loudest hit per lane per 16th-note column, for the first bar only. */
function firstBarGrid(track: DrumTrack): number[][] {
  const cols = Math.max(1, Math.round(track.beatsPerBar * STEPS_PER_BEAT))
  const grid = THUMB_LANES.map(() => new Array<number>(cols).fill(0))
  for (const hit of track.hits) {
    // One bar is enough to identify a groove, and it is all that fits: a
    // four-bar track across 90 px would give each column 1.4 px.
    if (hit.startBeat >= track.beatsPerBar) continue
    const col = Math.floor(hit.startBeat * STEPS_PER_BEAT)
    if (col < 0 || col >= cols) continue
    const lane = THUMB_LANES.findIndex(l => l.ids.includes(hit.pieceId))
    if (lane < 0) continue
    grid[lane][col] = Math.max(grid[lane][col], hit.velocity)
  }
  return grid
}

/** Accent / normal / ghost, matching how the grid itself reads velocity. */
function cellColor(velocity: number): string {
  if (velocity <= 0)   return alpha('rule', 0.9)
  if (velocity >= 0.9) return BT.accent
  if (velocity >= 0.5) return alpha('accent', 0.55)
  return alpha('accent', 0.28)
}

export function DrumPatternThumb({
  track,
  width = 90,
  height = 34,
  background = BT.sunken,
}: Props) {
  const grid = useMemo(() => firstBarGrid(track), [track])
  const cols = grid[0]?.length ?? 16

  return (
    <div
      role="img"
      aria-label={`Pattern shape for ${track.name}`}
      style={{
        flex: 'none', width, height, padding: '3px 4px', borderRadius: 6,
        background, display: 'flex', flexDirection: 'column',
        justifyContent: 'center', gap: 1,
      }}
    >
      {grid.map((lane, i) => (
        <div
          key={THUMB_LANES[i].label}
          style={{
            display: 'grid', gap: 1, height: 4,
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
          }}
        >
          {lane.map((velocity, col) => (
            <div key={col} style={{ borderRadius: 1, background: cellColor(velocity) }} />
          ))}
        </div>
      ))}
    </div>
  )
}
