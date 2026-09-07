import React, { useCallback, useMemo } from 'react'
import type { DrumTrack } from '../../lib/drumTab/types'
import { parseDrumTab, renderDrumTab, TAB_LEGEND } from '../../lib/drumTab/drumTabText'
import type { RenderOptions } from '../../lib/tabtext/types'
import { TabTextEditor } from '../tabtext/TabTextEditor'
import { BT, f } from '../../lib/bassTab/theme'

/**
 * The kit's text view: paste a drum tab from anywhere and it becomes a playable
 * track; edit the track anywhere else and this shows it back.
 *
 * The editor itself — the format picker, the playhead, apply-on-blur — is
 * `components/tabtext/TabTextEditor`, shared with the other tab tools. What is
 * left here is what only drums have: the legend, and what "hits" means in the
 * status line.
 */

const FORMAT_KEY = 'drum-tab-text-format-v1'

interface Props {
  track: DrumTrack
  onApply: (text: string) => void
  getBeat?: () => number
  isPlaying?: boolean
  onSeekBeat?: (beat: number) => void
}

export function DrumTabTextEditor({ track, onApply, getBeat, isPlaying, onSeekBeat }: Props) {
  const render = useCallback(
    (options: RenderOptions) => renderDrumTab(track, options),
    [track],
  )

  const status = useCallback((draft: string) => {
    const parsed = parseDrumTab(draft, track.beatsPerBar)
    return (
    <>
      <span style={{ fontFamily: f('ui'), fontSize: 12, color: BT.muted }}>
        {parsed.hits.length} hits · {parsed.bars} bars
      </span>
      {parsed.unknownLabels.length > 0 && (
        <span style={{ fontFamily: f('ui'), fontSize: 12, color: BT.warn }}>
          Unknown line{parsed.unknownLabels.length > 1 ? 's' : ''}: {[...new Set(parsed.unknownLabels)].join(', ')}
        </span>
      )}
      {parsed.unknownChars.length > 0 && (
        <span style={{ fontFamily: f('ui'), fontSize: 12, color: BT.warn }}>
          Unknown character{parsed.unknownChars.length > 1 ? 's' : ''}: {parsed.unknownChars.join(' ')}
        </span>
      )}
    </>
    )
  }, [track.beatsPerBar])

  const legend = (
    <>
      {TAB_LEGEND.map(item => (
        <span key={item.letter} style={{ fontFamily: f('ui'), fontSize: 11, color: BT.soft }}>
          <b style={{ fontFamily: f('mono'), color: BT.ink }}>{item.letter}</b> {item.label}
        </span>
      ))}
      <span style={{ fontFamily: f('ui'), fontSize: 11, color: BT.soft }}>
        <b style={{ fontFamily: f('mono'), color: BT.ink }}>x</b>/<b style={{ fontFamily: f('mono'), color: BT.ink }}>o</b> hit ·{' '}
        <b style={{ fontFamily: f('mono'), color: BT.ink }}>X</b>/<b style={{ fontFamily: f('mono'), color: BT.ink }}>O</b> accent ·{' '}
        <b style={{ fontFamily: f('mono'), color: BT.ink }}>g</b> ghost ·{' '}
        <b style={{ fontFamily: f('mono'), color: BT.ink }}>f</b> flam ·{' '}
        <b style={{ fontFamily: f('mono'), color: BT.ink }}>d</b> drag ·{' '}
        <b style={{ fontFamily: f('mono'), color: BT.ink }}>-</b> rest
      </span>
    </>
  )

  return (
    <TabTextEditor
      render={render}
      onApply={onApply}
      getBeat={getBeat}
      isPlaying={isPlaying}
      onSeekBeat={onSeekBeat}
      storageKey={FORMAT_KEY}
      status={status}
      legend={legend}
    />
  )
}
