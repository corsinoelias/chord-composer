import { DRUM_ROWS, ROW_BY_PIECE, STEPS_PER_BEAT, type DrumHit, type DrumTrack } from './types'
import { renderTab, columnAtBeat } from '../tabtext/render'
import type { RenderOptions, RenderedTab } from '../tabtext/types'
import { drumHitsFromText, drumTrackToModel, isXHead } from '../tabtext/adapters/drums'

/**
 * ASCII drum tab — the format people actually paste from Ultimate Guitar or
 * Songsterr, and the reason this is a *tab* player and not a drum machine:
 *
 *   CC|x-------|--------|
 *   HH|x-x-x-x-|x-x-x-x-|
 *   SD|----o---|----o---|
 *   BD|o-------|o---o---|
 *
 * The format itself now lives in `src/lib/tabtext` — systems, bars, columns and
 * the count line, shared with the bass and guitar tabs — and the kit's own
 * half (labels, `x` vs `o`, accents and ghosts) in `tabtext/adapters/drums.ts`.
 * What is left here is the drum tab's public surface, unchanged, so nothing
 * upstream had to move when the format was pulled out.
 */

export interface ParseResult {
  hits: DrumHit[]
  bars: number
  /** Lines that looked like tab but whose label wasn't recognised. */
  unknownLabels: string[]
  /** Characters in a hit position that aren't a stroke or a rest. */
  unknownChars: string[]
  sections: { name: string; startBar: number }[]
}

export function parseDrumTab(text: string, beatsPerBar = 4): ParseResult {
  return drumHitsFromText(text, beatsPerBar)
}

export type DrumTabTextOptions = RenderOptions & { stepsPerBeat?: number }

/** The track as text, plus where every column landed (for the playhead). */
export function renderDrumTab(track: DrumTrack, options: DrumTabTextOptions = {}): RenderedTab {
  const { stepsPerBeat = STEPS_PER_BEAT, ...render } = options
  return renderTab(drumTrackToModel(track, stepsPerBeat), render)
}

export function toDrumTab(track: DrumTrack, options: DrumTabTextOptions = {}): string {
  return renderDrumTab(track, options).text
}

/** Legend for the text editor — same idea as the prototype's, over real labels. */
export const TAB_LEGEND = DRUM_ROWS.map(r => ({
  letter: r.tabLetter,
  label: r.label,
  char: isXHead(r.id) ? 'x' : 'o',
}))

export { isXHead, ROW_BY_PIECE, columnAtBeat }
