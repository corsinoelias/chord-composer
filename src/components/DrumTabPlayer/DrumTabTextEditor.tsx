import React, { useCallback, useEffect, useMemo, useState } from 'react'
import type { DrumTrack } from '../../lib/drumTab/types'
import { parseDrumTab, toDrumTab, TAB_LEGEND } from '../../lib/drumTab/drumTabText'
import { copyToClipboard } from '../../lib/drumTab/exportDrumTab'
import { BT, alpha, f } from '../../lib/bassTab/theme'

/**
 * The ASCII tab view: paste a drum tab from anywhere and it becomes a playable
 * track; edit the track anywhere else and this shows it back in the same format.
 *
 * The textarea is a draft, not the model. Typing does not mutate the track on
 * every keystroke — a half-typed bar is not a valid tab — so the draft is
 * applied on blur or with the Apply button, and reset from the track whenever
 * the track changes underneath (loading a preset, editing in the Grid).
 */

interface Props {
  track: DrumTrack
  onApply: (text: string) => void
}

export function DrumTabTextEditor({ track, onApply }: Props) {
  const canonical = useMemo(() => toDrumTab(track), [track])
  const [draft, setDraft] = useState(canonical)
  const [copied, setCopied] = useState(false)

  useEffect(() => { setDraft(canonical) }, [canonical])

  const parsed = useMemo(() => parseDrumTab(draft, track.beatsPerBar), [draft, track.beatsPerBar])
  const dirty = draft !== canonical

  // Fires twice for one click on Apply — the button blurs the textarea first, so
  // `onBlur` runs and then `onClick` does. That is deliberate rather than
  // defended against here: `onApply` ignores a tab that matches the track it
  // already has, which is a guard no stale closure can slip past. Trying to
  // dedupe here with a ref did not work, because the second handler is captured
  // before the first one's re-render.
  const apply = useCallback(() => {
    onApply(draft)
  }, [draft, onApply])

  const copy = useCallback(async () => {
    const ok = await copyToClipboard(draft)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    }
  }, [draft])

  return (
    <div style={{
      background: BT.card, border: '1px solid ' + BT.rule, borderRadius: 12,
      padding: 12, display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <textarea
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={apply}
        spellCheck={false}
        aria-label="Drum tab, as text"
        style={{
          width: '100%', minHeight: 200, resize: 'vertical',
          fontFamily: f('mono'), fontSize: 13, lineHeight: 1.65,
          color: BT.ink, background: BT.sunken,
          border: '1px solid ' + (dirty ? alpha('accent', 0.5) : BT.rule),
          borderRadius: 8, padding: 10, whiteSpace: 'pre', overflowX: 'auto',
        }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={apply}
          disabled={!dirty}
          style={{
            padding: '6px 14px', borderRadius: 8, cursor: dirty ? 'pointer' : 'default',
            border: '1px solid ' + (dirty ? BT.accent : BT.rule),
            background: dirty ? BT.accent : BT.sunken,
            color: dirty ? '#fff' : BT.dim,
            fontFamily: f('ui'), fontSize: 13, fontWeight: 600,
          }}
        >
          {dirty ? 'Apply changes' : 'Up to date'}
        </button>
        <button
          type="button"
          onClick={copy}
          style={{
            padding: '6px 14px', borderRadius: 8, cursor: 'pointer',
            border: '1px solid ' + BT.rule, background: BT.card, color: BT.ink,
            fontFamily: f('ui'), fontSize: 13, fontWeight: 600,
          }}
        >
          {copied ? 'Copied' : 'Copy tab'}
        </button>
        <span style={{ fontFamily: f('ui'), fontSize: 12, color: BT.muted }}>
          {parsed.hits.length} hits · {parsed.bars} bars
        </span>
        {parsed.unknownLabels.length > 0 && (
          <span style={{ fontFamily: f('ui'), fontSize: 12, color: BT.warn }}>
            Unknown line{parsed.unknownLabels.length > 1 ? 's' : ''}: {[...new Set(parsed.unknownLabels)].join(', ')}
          </span>
        )}
      </div>

      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '4px 14px',
        paddingTop: 8, borderTop: '1px solid ' + BT.rule,
      }}>
        {TAB_LEGEND.map(item => (
          <span key={item.letter} style={{ fontFamily: f('ui'), fontSize: 11, color: BT.soft }}>
            <b style={{ fontFamily: f('mono'), color: BT.ink }}>{item.letter}</b> {item.label}
          </span>
        ))}
        <span style={{ fontFamily: f('ui'), fontSize: 11, color: BT.soft }}>
          <b style={{ fontFamily: f('mono'), color: BT.ink }}>x</b>/<b style={{ fontFamily: f('mono'), color: BT.ink }}>o</b> hit ·{' '}
          <b style={{ fontFamily: f('mono'), color: BT.ink }}>X</b>/<b style={{ fontFamily: f('mono'), color: BT.ink }}>O</b> accent ·{' '}
          <b style={{ fontFamily: f('mono'), color: BT.ink }}>g</b> ghost ·{' '}
          <b style={{ fontFamily: f('mono'), color: BT.ink }}>-</b> rest
        </span>
      </div>
    </div>
  )
}
