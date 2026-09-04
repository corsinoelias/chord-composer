import React, { useCallback, useMemo } from 'react'
import { BT, f } from '../../lib/bassTab/theme'
import { renderTab } from '../../lib/tabtext/render'
import {
  carryOverNotes, stringNotesFromText, stringTrackToModel,
  type StringNote, type StringTabTrack,
} from '../../lib/tabtext/adapters/strings'
import type { RenderOptions } from '../../lib/tabtext/types'
import { TabTextEditor } from './TabTextEditor'

/**
 * The text view for a fretted instrument — the bass tab and the guitar tab both
 * mount this one.
 *
 * They differ in exactly two things, and both are props: how many strings there
 * are and what they are called. Everything else — the format picker, the
 * playhead, apply-on-blur, the round trip through `lib/tabtext` — is the same
 * code the drum tab runs.
 *
 * Columns are bar-uniform here (`columnWidth: 'bar'`) rather than measured per
 * column: a bar holding a two-digit fret needs every column in it the same
 * width, or nothing downstream can tell which subdivision a character belongs
 * to. See `RenderOptions.columnWidth`.
 */

interface Props {
  track: StringTabTrack
  /** Thinnest string first, the order tab is written in. */
  labels: string[]
  /** Persists the format choice. One key per instrument. */
  storageKey: string
  /** Applied on blur or on Apply; ignore a text that matches what you already have. */
  onApply: (notes: StringNote[], bars: number) => void
  getBeat?: () => number
  isPlaying?: boolean
  onSeekBeat?: (beat: number) => void
  actions?: React.ReactNode
}

export function StringTabText({
  track, labels, storageKey, onApply, getBeat, isPlaying, onSeekBeat, actions,
}: Props) {
  const shape = useMemo(() => ({
    labels,
    header: (t: StringTabTrack) => `♩ = ${t.bpm} bpm    ${t.totalBars} bars × ${t.beatsPerBar}/4`,
  }), [labels])

  const render = useCallback(
    (options: RenderOptions) => renderTab(stringTrackToModel(track, shape), {
      header: true, columnWidth: 'bar', ...options,
    }),
    [track, shape],
  )

  const handleApply = useCallback((text: string) => {
    const parsed = stringNotesFromText(text, shape, track.beatsPerBar)
    // Durations and velocities are not in the text; `carryOverNotes` puts them
    // back from the notes that were already there, so applying an unedited tab
    // does not flatten the track to sixteenths.
    onApply(
      carryOverNotes(track.notes, parsed.notes),
      Math.max(1, parsed.bars || track.totalBars),
    )
  }, [shape, track.notes, track.beatsPerBar, track.totalBars, onApply])

  const status = useCallback((draft: string) => {
    const parsed = stringNotesFromText(draft, shape, track.beatsPerBar)
    return (
      <>
        <span style={{ fontFamily: f('ui'), fontSize: 12, color: BT.muted }}>
          {parsed.notes.length} notes · {parsed.bars} bars
        </span>
        {parsed.unknownLabels.length > 0 && (
          <span style={{ fontFamily: f('ui'), fontSize: 12, color: BT.warn }}>
            Unknown line{parsed.unknownLabels.length > 1 ? 's' : ''}: {[...new Set(parsed.unknownLabels)].join(', ')}
          </span>
        )}
      </>
    )
  }, [shape, track.beatsPerBar])

  const mono = { fontFamily: f('mono'), color: BT.ink }
  const legend = (
    <>
      <span style={{ fontFamily: f('ui'), fontSize: 11, color: BT.soft }}>
        Strings, thinnest first: <b style={mono}>{labels.join(' ')}</b>
      </span>
      <span style={{ fontFamily: f('ui'), fontSize: 11, color: BT.soft }}>
        <b style={mono}>0-24</b> fret · <b style={mono}>x</b> muted ·{' '}
        <b style={mono}>h</b> hammer-on · <b style={mono}>p</b> pull-off ·{' '}
        <b style={mono}>/</b> slide up · <b style={mono}>\</b> slide down ·{' '}
        <b style={mono}>b</b> bend · <b style={mono}>-</b> rest
      </span>
    </>
  )

  return (
    <TabTextEditor
      render={render}
      onApply={handleApply}
      getBeat={getBeat}
      isPlaying={isPlaying}
      onSeekBeat={onSeekBeat}
      storageKey={storageKey}
      status={status}
      legend={legend}
      actions={actions}
    />
  )
}

export default StringTabText
