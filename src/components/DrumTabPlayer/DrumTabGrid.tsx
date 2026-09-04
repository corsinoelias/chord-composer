import React, { useCallback, useMemo, useRef } from 'react'
import { DRUM_ROWS, STEPS_PER_BEAT, type DrumPieceId, type DrumTrack } from '../../lib/drumTab/types'
import { BT, alpha, f } from '../../lib/bassTab/theme'
import { PART_ICON } from './partIcons'

/**
 * Step grid: one row per kit piece, one cell per sixteenth note.
 *
 * Cells are a *view* of `track.hits`, not the storage — the model is hits at
 * beat positions (see `lib/drumTab/types.ts`), which is what lets the same track
 * carry a 6/8 bar or a swung groove that a fixed 16-cell matrix could not.
 */

const LABEL_W  = 132
const CELL_W   = 26
const CELL_H   = 26
const CELL_GAP = 2
const ROW_GAP  = 3

const ALWAYS_VISIBLE: DrumPieceId[] = ['crash-edge', 'hh-closed', 'snare', 'kick']

interface Props {
  track: DrumTrack
  currentBeat: number
  isPlaying: boolean
  /** Bars shown at once; the rest scroll. `null` = all of them. */
  barWindow: { start: number; count: number } | null
  onToggleCell: (pieceId: DrumPieceId, slot: number) => void
  onSetRowVelocity: (pieceId: DrumPieceId, velocity: number) => void
  onPreviewRow: (pieceId: DrumPieceId) => void
}

export function DrumTabGrid({
  track, currentBeat, isPlaying, barWindow,
  onToggleCell, onSetRowVelocity, onPreviewRow,
}: Props) {
  const slotsPerBar = track.beatsPerBar * STEPS_PER_BEAT
  const firstBar    = barWindow ? barWindow.start : 0
  const barCount    = barWindow ? Math.min(barWindow.count, track.totalBars - firstBar) : track.totalBars
  const firstSlot   = firstBar * slotsPerBar
  const totalSlots  = Math.max(0, barCount) * slotsPerBar

  // Painting state: dragging across cells applies the value the first cell got,
  // so a sweep fills a row instead of toggling each cell twice.
  const paintRef = useRef<{ value: boolean } | null>(null)

  const { cells, rowVelocity } = useMemo(() => {
    const cells = new Set<string>()
    const rowVelocity: Partial<Record<DrumPieceId, number>> = {}
    for (const h of track.hits) {
      const slot = Math.round(h.startBeat * STEPS_PER_BEAT)
      cells.add(h.pieceId + '@' + slot)
      if (rowVelocity[h.pieceId] === undefined) rowVelocity[h.pieceId] = h.velocity
    }
    return { cells, rowVelocity }
  }, [track.hits])

  // Rows the track uses, plus the four staples — a 15-row grid for a
  // kick-and-snare pattern is mostly empty space.
  const visibleRows = useMemo(() => {
    const used = new Set(track.hits.map(h => h.pieceId))
    return DRUM_ROWS.filter(r => used.has(r.id) || ALWAYS_VISIBLE.includes(r.id))
  }, [track.hits])

  const playSlot = isPlaying ? Math.floor(currentBeat * STEPS_PER_BEAT + 1e-6) : -1

  const handleDown = useCallback((pieceId: DrumPieceId, slot: number, on: boolean) => {
    paintRef.current = { value: !on }
    onToggleCell(pieceId, slot)
  }, [onToggleCell])

  const handleEnter = useCallback((pieceId: DrumPieceId, slot: number, on: boolean) => {
    const paint = paintRef.current
    if (!paint || on === paint.value) return
    onToggleCell(pieceId, slot)
  }, [onToggleCell])

  const endPaint = useCallback(() => { paintRef.current = null }, [])

  const gridW = totalSlots * (CELL_W + CELL_GAP)

  return (
    <div
      style={{ background: BT.card, border: '1px solid ' + BT.rule, borderRadius: 12, overflow: 'hidden' }}
      onPointerUp={endPaint}
      onPointerLeave={endPaint}
    >
      {/* Bar / beat ruler */}
      <div style={{ display: 'flex', borderBottom: '1px solid ' + BT.rule, background: BT.sunken }}>
        <div style={{ width: LABEL_W, flexShrink: 0 }} />
        <div style={{ overflow: 'hidden', flex: 1 }}>
          <div style={{ display: 'flex', gap: CELL_GAP, width: gridW, padding: '5px 0' }}>
            {Array.from({ length: totalSlots }, (_, i) => {
              const slot        = firstSlot + i
              const isBarStart  = slot % slotsPerBar === 0
              const isBeatStart = slot % STEPS_PER_BEAT === 0
              const beatInBar   = Math.floor((slot % slotsPerBar) / STEPS_PER_BEAT) + 1
              return (
                <div
                  key={slot}
                  style={{
                    width: CELL_W, textAlign: 'center',
                    fontSize: 10, fontFamily: f('mono'), fontVariantNumeric: 'tabular-nums',
                    color: isBarStart ? BT.bar : isBeatStart ? BT.muted : BT.dim,
                    fontWeight: isBarStart ? 700 : 500,
                  }}
                >
                  {isBarStart ? Math.floor(slot / slotsPerBar) + 1 : isBeatStart ? beatInBar : ''}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex' }}>
        {/* Row labels */}
        <div style={{ width: LABEL_W, flexShrink: 0, borderRight: '1px solid ' + BT.rule }}>
          {visibleRows.map(row => {
            const Icon = PART_ICON[row.id]
            const vel  = rowVelocity[row.id] ?? row.defaultVel
            return (
              <div
                key={row.id}
                style={{
                  height: CELL_H + ROW_GAP, display: 'flex', alignItems: 'center', gap: 6,
                  padding: '0 8px', borderBottom: '1px solid ' + alpha('rule', 0.5),
                }}
              >
                <button
                  type="button"
                  onClick={() => onPreviewRow(row.id)}
                  title={'Play ' + row.label}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0,
                    background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                    color: BT.ink, textAlign: 'left',
                  }}
                >
                  <Icon style={{ width: 16, height: 16, color: BT.muted, flexShrink: 0 }} />
                  <span style={{
                    fontSize: 11, fontWeight: 600, fontFamily: f('ui'),
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {row.short}
                  </span>
                </button>
                <input
                  type="range"
                  min={0.3} max={1} step={0.05}
                  value={vel}
                  onChange={e => onSetRowVelocity(row.id, Number(e.target.value))}
                  title={row.label + ' velocity'}
                  aria-label={row.label + ' velocity'}
                  style={{ width: 40, accentColor: BT.accent, cursor: 'pointer' }}
                />
              </div>
            )
          })}
        </div>

        {/* Cells */}
        <div style={{ flex: 1, overflowX: 'auto' }}>
          <div style={{ width: gridW }}>
            {visibleRows.map(row => (
              <div
                key={row.id}
                style={{
                  display: 'flex', gap: CELL_GAP, height: CELL_H + ROW_GAP,
                  alignItems: 'center', borderBottom: '1px solid ' + alpha('rule', 0.5),
                }}
              >
                {Array.from({ length: totalSlots }, (_, i) => {
                  const slot        = firstSlot + i
                  const on          = cells.has(row.id + '@' + slot)
                  const isBarStart  = slot % slotsPerBar === 0
                  const isBeatStart = slot % STEPS_PER_BEAT === 0
                  const isPlayhead  = slot === playSlot
                  return (
                    <button
                      key={slot}
                      type="button"
                      onPointerDown={() => handleDown(row.id, slot, on)}
                      onPointerEnter={() => handleEnter(row.id, slot, on)}
                      aria-label={row.label + ' step ' + (slot + 1)}
                      aria-pressed={on}
                      style={{
                        width: CELL_W, height: CELL_H, padding: 0, cursor: 'pointer',
                        borderRadius: 5,
                        border: isBarStart
                          ? '1px solid ' + alpha('bar', 0.45)
                          : '1px solid ' + (on ? 'transparent' : BT.rule),
                        background: on
                          ? BT.accent
                          : isPlayhead ? BT.accentWash
                          : isBeatStart ? BT.sunken
                          : BT.card,
                        boxShadow: isPlayhead && !on ? 'inset 0 0 0 2px ' + alpha('accent', 0.5) : 'none',
                        transition: 'background 60ms linear',
                        touchAction: 'none',
                      }}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
