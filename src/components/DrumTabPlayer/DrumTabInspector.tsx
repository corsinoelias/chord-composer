import React, { useCallback } from 'react'
import {
  DEFAULT_CHANNEL, DRUM_ROWS, ROW_BY_PIECE, hasSolo,
  type DrumChannel, type DrumMix, type DrumPieceId,
} from '../../lib/drumTab/types'
import { BT, alpha, f } from '../../lib/bassTab/theme'
import { PART_ICON } from './partIcons'

/**
 * Kit inspector: one piece up close, and the whole kit as a mixer.
 *
 * The two sliders here are the point of the panel, and they are not the same
 * control twice:
 *
 *  - **Level** is where the piece sits in the mix (`DrumTrack.mix`). It applies
 *    to every stroke and leaves the written pattern alone.
 *  - **Velocity** rewrites how hard the strokes in this row were played. It is
 *    the pattern, not the mix — turning it down is writing ghost notes, not
 *    turning the fader down.
 *
 * Before the mix existed only the second one did, sitting in the grid's row
 * gutter, and it was doing both jobs badly: quietening the hi-hat also flattened
 * the ghost notes that made it a hi-hat part. Splitting them is why this panel
 * exists, so they are deliberately shown together, where the difference is
 * visible.
 */

const PANEL_W = 268

interface Props {
  selectedPiece: DrumPieceId | null
  mix: DrumMix | undefined
  /** Current velocity of the selected row's hits, if it has any. */
  rowVelocity: number | null
  /** Pieces the pattern actually uses, marked in the mixer list. */
  usedPieces: Set<DrumPieceId>
  onSelectPiece: (piece: DrumPieceId) => void
  onChannelChange: (piece: DrumPieceId, patch: Partial<DrumChannel>) => void
  onRowVelocityChange: (piece: DrumPieceId, velocity: number) => void
  /** Overridden when it is embedded in the phone sheet rather than a column. */
  width?: number | string
  bordered?: boolean
}

function channelOf(mix: DrumMix | undefined, piece: DrumPieceId): DrumChannel {
  return mix?.[piece] ?? DEFAULT_CHANNEL
}

function DrumTabInspectorImpl({
  selectedPiece, mix, rowVelocity, usedPieces,
  onSelectPiece, onChannelChange, onRowVelocityChange,
  width = PANEL_W, bordered = true,
}: Props) {
  const soloActive = hasSolo(mix)
  const row = selectedPiece ? ROW_BY_PIECE[selectedPiece] : null
  const channel = selectedPiece ? channelOf(mix, selectedPiece) : DEFAULT_CHANNEL

  const toggle = useCallback((piece: DrumPieceId, key: 'mute' | 'solo') => {
    onChannelChange(piece, { [key]: !channelOf(mix, piece)[key] })
  }, [mix, onChannelChange])

  const sectionLabel: React.CSSProperties = {
    fontFamily: f('ui'), fontSize: 11, fontWeight: 700,
    color: BT.dim, textTransform: 'uppercase', letterSpacing: '.07em',
  }

  return (
    <aside
      aria-label="Kit inspector"
      style={{
        width, flexShrink: 0, minHeight: 0,
        display: 'flex', flexDirection: 'column',
        background: BT.card,
        borderLeft: bordered ? '1px solid ' + BT.rule : 'none',
      }}
    >
      {/* ── The selected piece ─────────────────────────────────────────── */}
      <div style={{ padding: '13px 15px', borderBottom: '1px solid ' + BT.rule, flexShrink: 0 }}>
        {row ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              {(() => { const Icon = PART_ICON[row.id]; return <Icon style={{ width: 17, height: 17, color: BT.muted }} /> })()}
              <span style={{ fontFamily: f('ui'), fontSize: 14, fontWeight: 700, color: BT.ink, flex: 1 }}>
                {row.label}
              </span>
              <span style={{ fontFamily: f('mono'), fontSize: 10.5, color: BT.dim }}>{row.tabLetter}</span>
            </div>

            <Fader
              label="Level"
              hint="Where it sits in the mix"
              value={channel.gain}
              min={0} max={1} step={0.05}
              display={Math.round(channel.gain * 100) + '%'}
              onChange={v => onChannelChange(row.id, { gain: v })}
            />

            <Fader
              label="Velocity"
              hint="How hard the strokes are written"
              value={rowVelocity ?? 0}
              min={0.2} max={1} step={0.05}
              display={rowVelocity === null ? 'no hits' : Math.round(rowVelocity * 100) + '%'}
              disabled={rowVelocity === null}
              onChange={v => onRowVelocityChange(row.id, v)}
            />

            <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
              <StateButton
                on={channel.mute}
                tone="danger"
                label="Mute"
                onClick={() => toggle(row.id, 'mute')}
              />
              <StateButton
                on={channel.solo}
                tone="ok"
                label="Solo"
                onClick={() => toggle(row.id, 'solo')}
              />
            </div>
          </>
        ) : (
          <p style={{
            margin: 0, fontFamily: f('ui'), fontSize: 12.5, color: BT.soft, lineHeight: 1.5,
          }}>
            Click a drum on the kit, or a row name in the grid, to set its level
            here.
          </p>
        )}
      </div>

      {/* ── The kit as a mixer ─────────────────────────────────────────── */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 15px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
          <span style={sectionLabel}>Kit mixer</span>
          {soloActive && (
            <span style={{ fontFamily: f('ui'), fontSize: 11, color: BT.ok, fontWeight: 600 }}>
              solo on
            </span>
          )}
        </div>

        {DRUM_ROWS.map(r => {
          const ch = channelOf(mix, r.id)
          const silent = ch.mute || (soloActive && !ch.solo)
          const selected = r.id === selectedPiece
          return (
            <div
              key={r.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 7, padding: '4px 5px',
                borderRadius: 7, marginBottom: 1,
                background: selected ? BT.accentWash : 'transparent',
                opacity: usedPieces.has(r.id) ? 1 : 0.5,
              }}
            >
              <button
                type="button"
                onClick={() => onSelectPiece(r.id)}
                title={'Select ' + r.label}
                style={{
                  width: 58, flexShrink: 0, textAlign: 'left', padding: 0, cursor: 'pointer',
                  background: 'none', border: 'none',
                  color: silent ? BT.dim : BT.ink,
                  fontFamily: f('ui'), fontSize: 11, fontWeight: selected ? 700 : 500,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  textDecoration: silent ? 'line-through' : 'none',
                }}
              >
                {r.short}
              </button>
              <input
                type="range"
                min={0} max={1} step={0.05}
                value={ch.gain}
                onChange={e => onChannelChange(r.id, { gain: Number(e.target.value) })}
                aria-label={r.label + ' level'}
                style={{ flex: 1, minWidth: 0, accentColor: BT.accent, cursor: 'pointer' }}
              />
              <MiniToggle on={ch.mute} tone="danger" letter="M"
                title={r.label + (ch.mute ? ' — unmute' : ' — mute')}
                onClick={() => toggle(r.id, 'mute')} />
              <MiniToggle on={ch.solo} tone="ok" letter="S"
                title={r.label + (ch.solo ? ' — unsolo' : ' — solo')}
                onClick={() => toggle(r.id, 'solo')} />
            </div>
          )
        })}

        <p style={{
          margin: '10px 0 0', fontFamily: f('ui'), fontSize: 11, color: BT.soft, lineHeight: 1.45,
        }}>
          Faded rows are pieces this pattern does not use yet.
        </p>
      </div>
    </aside>
  )
}

function Fader({
  label, hint, value, min, max, step, display, disabled, onChange,
}: {
  label: string
  hint: string
  value: number
  min: number
  max: number
  step: number
  display: string
  disabled?: boolean
  onChange: (v: number) => void
}) {
  return (
    <div style={{ marginBottom: 10, opacity: disabled ? 0.5 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 3 }}>
        <span style={{ fontFamily: f('ui'), fontSize: 11.5, fontWeight: 600, color: BT.ink }}>
          {label}
        </span>
        <span style={{
          marginLeft: 'auto', fontFamily: f('mono'), fontSize: 11, color: BT.muted,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {display}
        </span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        disabled={disabled}
        onChange={e => onChange(Number(e.target.value))}
        aria-label={label}
        style={{ width: '100%', accentColor: BT.accent, cursor: disabled ? 'default' : 'pointer' }}
      />
      <span style={{ fontFamily: f('ui'), fontSize: 10.5, color: BT.soft }}>{hint}</span>
    </div>
  )
}

function StateButton({
  on, tone, label, onClick,
}: {
  on: boolean
  tone: 'danger' | 'ok'
  label: string
  onClick: () => void
}) {
  const color = tone === 'danger' ? BT.danger : BT.ok
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      style={{
        flex: 1, padding: '6px 0', borderRadius: 8, cursor: 'pointer',
        border: '1px solid ' + (on ? color : BT.rule),
        background: on ? (tone === 'danger' ? BT.dangerWash : BT.okWash) : 'transparent',
        color: on ? color : BT.muted,
        fontFamily: f('ui'), fontSize: 12, fontWeight: 600,
      }}
    >
      {label}
    </button>
  )
}

function MiniToggle({
  on, tone, letter, title, onClick,
}: {
  on: boolean
  tone: 'danger' | 'ok'
  letter: string
  title: string
  onClick: () => void
}) {
  const color = tone === 'danger' ? BT.danger : BT.ok
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={on}
      style={{
        width: 19, height: 19, flexShrink: 0, padding: 0, borderRadius: 5, cursor: 'pointer',
        display: 'grid', placeItems: 'center',
        border: '1px solid ' + (on ? color : BT.rule),
        background: on ? alpha(tone === 'danger' ? 'danger' : 'ok', 0.14) : 'transparent',
        color: on ? color : BT.dim,
        fontFamily: f('mono'), fontSize: 9.5, fontWeight: 600,
      }}
    >
      {letter}
    </button>
  )
}

/**
 * Memoised. The player re-renders on every sixteenth to move its position
 * readout; this band only changes when one of its own props does.
 */
export const DrumTabInspector = React.memo(DrumTabInspectorImpl)
