import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DRUM_ROWS, GRID_LABEL_W, STEPS_PER_BEAT,
  type DrumArticulation, type DrumPieceId, type DrumTrack,
} from '../../lib/drumTab/types'
import { BT, alpha, f } from '../../lib/bassTab/theme'
import { PART_ICON } from './partIcons'

/**
 * Step grid: one row per kit piece, one cell per sixteenth note.
 *
 * Cells are a *view* of `track.hits`, not the storage — the model is hits at
 * beat positions (see `lib/drumTab/types.ts`), which is what lets the same track
 * carry a 6/8 bar or a swung groove that a fixed 16-cell matrix could not.
 *
 * Cell size is measured, not fixed. In the old boxed layout 26 × 26 always fit;
 * full-screen it is the wrong number in every direction — it wasted half the
 * width on a one-bar pattern, still hid bars 3 and 4 of a four-bar one, and left
 * the bottom half of the screen empty. So the space the bars need is divided by
 * the space there is, on both axes, clamped to a range where a sixteenth is
 * still a sixteenth and not a tile. Only past the lower clamp does it scroll.
 *
 * **The playhead is one moving element, not a state the cells read.** It used to
 * arrive as a `currentBeat` prop, which re-rendered every cell in the grid on
 * every animation frame — four bars of sixteenths across twelve rows is ~750
 * buttons rebuilt sixty times a second, and on a phone that is the frame budget
 * gone. Now the grid renders when the *pattern* changes, and a single absolutely
 * positioned column is moved over it from `getBeat()` by its own frame loop.
 */


const CELL_GAP = 2
const ROW_GAP  = 3

/**
 * A cell narrower than this is not a pointer target any more. 11 is chosen so
 * four bars of sixteenths still fit a 1280px laptop beside the library rail —
 * the width one step below where the common case starts scrolling.
 */
const MIN_CELL_W = 11
/** Past this the grid stops looking like sixteenths and starts looking like tiles. */
const MAX_CELL_W = 34
const FALLBACK_CELL_W = 26

const MIN_ROW_H = 22
/**
 * Rows grow into spare height, but only this far. It is deliberately close to
 * `MAX_CELL_W`, so a cell stays roughly square and keeps reading as one step of
 * sixteen rather than a bar of a chart.
 *
 * Capping by a constant rather than by the measured cell width is what keeps
 * this stable: tying row height to cell width closed a loop — taller rows
 * overflow, the overflow raises a vertical scrollbar, the scrollbar narrows the
 * cells, narrower cells shorten the rows, the overflow goes away — and React
 * hit "Maximum update depth exceeded" oscillating around it.
 */
const MAX_ROW_H = 32
const FALLBACK_ROW_H = 29
/** The bar/beat ruler, which the rows do not get to share. */
const RULER_H = 27

const ALWAYS_VISIBLE: DrumPieceId[] = ['crash-edge', 'hh-closed', 'snare', 'kick']

interface Props {
  track: DrumTrack
  /**
   * Reads the live playhead. A getter rather than a number so that the beat
   * moving does not re-render the grid — see the note above.
   */
  getBeat: () => number
  isPlaying: boolean
  /** Bars shown at once; the rest scroll. `null` = all of them. */
  barWindow: { start: number; count: number } | null
  /** Row the kit stage considers current — kept visible and marked. */
  selectedPiece?: DrumPieceId | null
  /** Label gutter width, shared with the arrangement lane so bars line up. */
  labelW?: number
  /**
   * Phone: dropped, so the narrow gutter has room for the piece name. The same
   * control lives in the inspector, which on a phone is inside the sheet.
   */
  showRowVelocity?: boolean
  onToggleCell: (pieceId: DrumPieceId, slot: number) => void
  /**
   * Plain → flam → drag → plain, on a step that already has a stroke. Reached
   * with alt-click or a right-click, both of which are "change this one" rather
   * than "draw", so neither collides with dragging across cells to paint.
   */
  onCycleArticulation?: (pieceId: DrumPieceId, slot: number) => void
  onSetRowVelocity: (pieceId: DrumPieceId, velocity: number) => void
  onPreviewRow: (pieceId: DrumPieceId) => void
  onSelectRow?: (pieceId: DrumPieceId) => void
}

function DrumTabGridImpl({
  track, getBeat, isPlaying, barWindow, selectedPiece, labelW = GRID_LABEL_W, showRowVelocity = true,
  onToggleCell, onCycleArticulation, onSetRowVelocity, onPreviewRow, onSelectRow,
}: Props) {
  const slotsPerBar = track.beatsPerBar * STEPS_PER_BEAT
  const firstBar    = barWindow ? barWindow.start : 0
  const barCount    = barWindow ? Math.min(barWindow.count, track.totalBars - firstBar) : track.totalBars
  const firstSlot   = firstBar * slotsPerBar
  const totalSlots  = Math.max(0, barCount) * slotsPerBar

  // Space available to the cells: the box minus the ruler, minus the row labels.
  // Measuring the scroll container rather than the content means the reading
  // never chases its own tail — the container is sized by flex, the content by
  // this measurement, so it settles in one pass.
  const cellsRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const [cellsW, setCellsW] = useState(0)
  const [frameH, setFrameH] = useState(0)

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return
    const cells = cellsRef.current
    const frame = frameRef.current
    // Rounded, and only stored when the whole pixel actually changed.
    // `contentRect` is fractional, so storing it raw re-rendered the grid on
    // sub-pixel jitter for a cell size that never moved.
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        if (entry.target === cells) {
          const w = Math.round(entry.contentRect.width)
          setCellsW(prev => (prev === w ? prev : w))
        }
        if (entry.target === frame) {
          const h = Math.round(entry.contentRect.height)
          setFrameH(prev => (prev === h ? prev : h))
        }
      }
    })
    if (cells) ro.observe(cells)
    if (frame) ro.observe(frame)
    return () => ro.disconnect()
  }, [])

  // Height the rows may share out. Taken from the frame, which flex sizes, and
  // not from the card, which hugs its rows — measuring the card would feed its
  // own content height back into the row height that produced it.
  const bodyH = Math.max(0, frameH - RULER_H)

  const cellW = useMemo(() => {
    if (!cellsW || !totalSlots) return FALLBACK_CELL_W
    const fit = Math.floor(cellsW / totalSlots) - CELL_GAP
    return Math.max(MIN_CELL_W, Math.min(MAX_CELL_W, fit))
  }, [cellsW, totalSlots])

  // Painting state: dragging across cells applies the value the first cell got,
  // so a sweep fills a row instead of toggling each cell twice.
  const paintRef = useRef<{ value: boolean } | null>(null)

  const { cells, rowVelocity } = useMemo(() => {
    // A map rather than a set: the value is the stroke's articulation, so a flam
    // can be drawn as one instead of looking exactly like a plain hit.
    const cells = new Map<string, DrumArticulation | undefined>()
    const rowVelocity: Partial<Record<DrumPieceId, number>> = {}
    for (const h of track.hits) {
      const slot = Math.round(h.startBeat * STEPS_PER_BEAT)
      cells.set(h.pieceId + '@' + slot, h.articulation)
      if (rowVelocity[h.pieceId] === undefined) rowVelocity[h.pieceId] = h.velocity
    }
    return { cells, rowVelocity }
  }, [track.hits])

  // Rows the track uses, plus the four staples — a 15-row grid for a
  // kick-and-snare pattern is mostly empty space. The selected piece joins them
  // so that clicking a drum on the kit stage reveals a row to write into, even
  // one the pattern has not touched yet.
  const visibleRows = useMemo(() => {
    const used = new Set(track.hits.map(h => h.pieceId))
    return DRUM_ROWS.filter(
      r => used.has(r.id) || ALWAYS_VISIBLE.includes(r.id) || r.id === selectedPiece,
    )
  }, [track.hits, selectedPiece])

  const rowH = useMemo(() => {
    if (!bodyH || !visibleRows.length) return FALLBACK_ROW_H
    return Math.max(MIN_ROW_H, Math.min(MAX_ROW_H, Math.floor(bodyH / visibleRows.length)))
  }, [bodyH, visibleRows.length])
  const cellH = rowH - ROW_GAP

  const handleDown = useCallback((
    e: React.PointerEvent,
    pieceId: DrumPieceId,
    slot: number,
    on: boolean,
  ) => {
    // Alt-click and right-click change the stroke that is there; they never
    // create or erase one, so a mis-hit on an empty cell does nothing.
    if (on && onCycleArticulation && (e.altKey || e.button === 2)) {
      e.preventDefault()
      onCycleArticulation(pieceId, slot)
      return
    }
    if (e.button === 2) return
    paintRef.current = { value: !on }
    onToggleCell(pieceId, slot)
  }, [onToggleCell, onCycleArticulation])

  const handleEnter = useCallback((pieceId: DrumPieceId, slot: number, on: boolean) => {
    const paint = paintRef.current
    if (!paint || on === paint.value) return
    onToggleCell(pieceId, slot)
  }, [onToggleCell])

  const endPaint = useCallback(() => { paintRef.current = null }, [])

  // Past the minimum cell width the cells scroll sideways; the ruler has to go
  // with them, or the bar numbers stop naming the columns underneath.
  const rulerRef = useRef<HTMLDivElement>(null)
  const syncRuler = useCallback(() => {
    const ruler = rulerRef.current
    const cells = cellsRef.current
    if (ruler && cells) ruler.scrollLeft = cells.scrollLeft
  }, [])

  const gridW = totalSlots * (cellW + CELL_GAP)

  // ── The moving playhead ───────────────────────────────────────────────────
  // Read from a ref so the frame loop below never has to be torn down and
  // rebuilt when the grid is re-measured.
  const playheadRef = useRef<HTMLDivElement>(null)
  const layoutRef   = useRef({ cellW, firstSlot, totalSlots })
  layoutRef.current = { cellW, firstSlot, totalSlots }

  useEffect(() => {
    const bar = playheadRef.current
    if (!bar) return
    if (!isPlaying) { bar.style.opacity = '0'; return }

    let raf = 0
    let lastX = -1
    const paint = () => {
      const { cellW, firstSlot, totalSlots } = layoutRef.current
      const index = Math.floor(getBeat() * STEPS_PER_BEAT + 1e-6) - firstSlot
      if (index < 0 || index >= totalSlots) {
        // Playing a bar this window is not showing (desktop shows them all, so
        // this is the phone's one-bar pager between the beat moving and the
        // page following it).
        bar.style.opacity = '0'
      } else {
        const x = index * (cellW + CELL_GAP)
        if (x !== lastX) {
          lastX = x
          bar.style.transform = `translateX(${x}px)`
          bar.style.width = cellW + 'px'
          // Keep the sounding step on screen when the grid is wider than its box.
          const box = cellsRef.current
          if (box) {
            const left = box.scrollLeft
            const right = left + box.clientWidth
            if (x < left) box.scrollLeft = Math.max(0, x - cellW)
            else if (x + cellW > right) box.scrollLeft = x + cellW * 2 - box.clientWidth
          }
        }
        bar.style.opacity = '1'
      }
      raf = requestAnimationFrame(paint)
    }
    raf = requestAnimationFrame(paint)
    return () => cancelAnimationFrame(raf)
  }, [isPlaying, getBeat])

  return (
    <div ref={frameRef} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
    <div
      style={{
        background: BT.card, border: '1px solid ' + BT.rule, borderRadius: 12, overflow: 'hidden',
        display: 'flex', flexDirection: 'column', minHeight: 0,
      }}
      onPointerUp={endPaint}
      onPointerLeave={endPaint}
    >
      {/* Bar / beat ruler */}
      <div style={{ display: 'flex', flexShrink: 0, borderBottom: '1px solid ' + BT.rule, background: BT.sunken }}>
        <div style={{ width: labelW, flexShrink: 0 }} />
        <div ref={rulerRef} style={{ overflow: 'hidden', flex: 1 }}>
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
                    width: cellW, textAlign: 'center',
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

      {/* `scrollbar-gutter: stable` so the cells keep the same width whether or
          not the rows overflow — otherwise the measured width, and with it the
          cell width, changes the moment a scrollbar appears. */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflowY: 'auto', scrollbarGutter: 'stable' }}>
        {/* Row labels */}
        <div style={{ width: labelW, flexShrink: 0, borderRight: '1px solid ' + BT.rule }}>
          {visibleRows.map(row => {
            const Icon = PART_ICON[row.id]
            const vel  = rowVelocity[row.id] ?? row.defaultVel
            const selected = row.id === selectedPiece
            return (
              <div
                key={row.id}
                style={{
                  height: rowH, display: 'flex', alignItems: 'center', gap: 6,
                  padding: '0 8px', borderBottom: '1px solid ' + alpha('rule', 0.5),
                  background: selected ? BT.accentWash : 'transparent',
                  boxShadow: selected ? 'inset 3px 0 0 ' + BT.accent : 'none',
                }}
              >
                <button
                  type="button"
                  onClick={() => { onPreviewRow(row.id); onSelectRow?.(row.id) }}
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
                {showRowVelocity && (
                <input
                  type="range"
                  min={0.3} max={1} step={0.05}
                  value={vel}
                  onChange={e => onSetRowVelocity(row.id, Number(e.target.value))}
                  title={row.label + ' velocity'}
                  aria-label={row.label + ' velocity'}
                  style={{ width: 40, accentColor: BT.accent, cursor: 'pointer' }}
                />
                )}
              </div>
            )
          })}
        </div>

        {/* Cells */}
        <div ref={cellsRef} onScroll={syncRuler} style={{ flex: 1, minWidth: 0, overflowX: 'auto' }}>
          <div style={{ width: gridW, position: 'relative' }}>
            {/* A translucent wash laid over the column rather than a background
                set on sixteen cells: at 0.16 alpha a written step still reads
                as written underneath it, and one element moves instead of a
                row of them changing colour. */}
            <div
              ref={playheadRef}
              aria-hidden="true"
              style={{
                position: 'absolute', top: 0, bottom: 0, left: 0, width: cellW,
                background: alpha('accent', 0.16),
                borderRadius: 5, pointerEvents: 'none', opacity: 0, zIndex: 2,
                willChange: 'transform',
              }}
            />
            {visibleRows.map(row => (
              <div
                key={row.id}
                style={{
                  position: 'relative',
                  display: 'flex', gap: CELL_GAP, height: rowH,
                  alignItems: 'center', borderBottom: '1px solid ' + alpha('rule', 0.5),
                }}
              >
                {Array.from({ length: totalSlots }, (_, i) => {
                  const slot        = firstSlot + i
                  const key         = row.id + '@' + slot
                  const on          = cells.has(key)
                  const articulation = cells.get(key)
                  const isBarStart  = slot % slotsPerBar === 0
                  const isBeatStart = slot % STEPS_PER_BEAT === 0
                  return (
                    <button
                      key={slot}
                      type="button"
                      onPointerDown={e => handleDown(e, row.id, slot, on)}
                      onPointerEnter={() => handleEnter(row.id, slot, on)}
                      onContextMenu={e => e.preventDefault()}
                      aria-label={
                        row.label + ' step ' + (slot + 1) + (articulation ? ', ' + articulation : '')
                      }
                      aria-pressed={on}
                      title={on && onCycleArticulation ? 'Alt-click for a flam or a drag' : undefined}
                      style={{
                        width: cellW, height: cellH, padding: 0, cursor: 'pointer',
                        borderRadius: 5,
                        display: 'flex', alignItems: 'center', gap: 1,
                        paddingLeft: articulation ? 2 : 0,
                        border: isBarStart
                          ? '1px solid ' + alpha('bar', 0.45)
                          : '1px solid ' + (on ? 'transparent' : BT.rule),
                        background: on
                          ? BT.accent
                          : isBeatStart ? BT.sunken
                          : BT.card,
                        touchAction: 'none',
                      }}
                    >
                      {/* Grace notes, drawn as the sticks that play them: one
                          dot before the stroke for a flam, two for a drag. */}
                      {articulation && Array.from(
                        { length: articulation === 'drag' ? 2 : 1 },
                        (_, g) => (
                          <span
                            key={g}
                            style={{
                              width: 2, height: 2, borderRadius: '50%',
                              background: 'rgba(255,255,255,0.85)', flex: 'none',
                            }}
                          />
                        ),
                      )}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
    </div>
  )
}

/**
 * Memoised because the player above re-renders on every sixteenth to move the
 * position readout, and rebuilding several hundred cells for that is the one
 * thing this component must not do.
 */
export const DrumTabGrid = React.memo(DrumTabGridImpl)
