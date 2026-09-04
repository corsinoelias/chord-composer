import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { GRID_LABEL_W, type DrumSection } from '../../lib/drumTab/types'
import { BT, alpha, f } from '../../lib/bassTab/theme'

/**
 * Arrangement lane: the track's bars grouped into named sections.
 *
 * `DrumSection { name, startBar }` has been in the model since the drum tab
 * shipped and nothing read it. This is what reads it — the difference between a
 * bar on loop and a drum part you can hand to someone: intro, verse, the fill
 * before the chorus.
 *
 * Sections are boundaries, not spans. A section owns every bar from its
 * `startBar` up to the next one's, so bars can never overlap or leave a gap, and
 * adding or removing a bar only has to shift the boundaries — which is what
 * `useDrumTrackEditor.insertBar` / `deleteBar` already do.
 *
 * It shares the grid's label gutter (`GRID_LABEL_W`) and sizes each block by how
 * many bars it covers, so under the grid a section sits over its own bars. It
 * stays put in the notation and text views too — structure belongs to the track,
 * not to the view you happen to be reading it in.
 */

/**
 * Structural colours, cycled by position. Deliberately not the accent: the
 * accent means "this is actionable", and a section is a label for a stretch of
 * music, not a button. Blue/green/amber here read as categories, not as states.
 */
const BLOCK_COLORS = [BT.bar, BT.accent, BT.ok, BT.warn, BT.muted] as const

const LANE_H = 62

interface ArrangementBlock {
  name: string
  startBar: number
  /** Exclusive. */
  endBar: number
  color: string
  /** Index into the normalised section list, for edits. */
  index: number
}

/**
 * Sections → blocks covering every bar exactly once.
 *
 * Anything out of range is dropped and the first section is pinned to bar 0:
 * a track whose first section started at bar 3 would leave bars 0-2 belonging
 * to nothing, and there is no sensible name to give that.
 */
function resolveBlocks(
  sections: DrumSection[] | undefined,
  totalBars: number,
): ArrangementBlock[] {
  const seen = new Set<number>()
  const sorted = (sections ?? [])
    .filter(s => Number.isInteger(s.startBar) && s.startBar >= 0 && s.startBar < totalBars)
    .sort((a, b) => a.startBar - b.startBar)
    .filter(s => (seen.has(s.startBar) ? false : (seen.add(s.startBar), true)))

  if (!sorted.length) return []
  if (sorted[0].startBar !== 0) sorted[0] = { ...sorted[0], startBar: 0 }

  return sorted.map((s, i) => ({
    name: s.name,
    startBar: s.startBar,
    endBar: i + 1 < sorted.length ? sorted[i + 1].startBar : totalBars,
    color: BLOCK_COLORS[i % BLOCK_COLORS.length],
    index: i,
  }))
}

interface Props {
  totalBars: number
  beatsPerBar: number
  sections: DrumSection[] | undefined
  currentBeat: number
  isPlaying: boolean
  onChange: (sections: DrumSection[]) => void
}

export function DrumTabArrangement({
  totalBars, beatsPerBar, sections, currentBeat, isPlaying, onChange,
}: Props) {
  const [editing, setEditing] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const blocks = useMemo(() => resolveBlocks(sections, totalBars), [sections, totalBars])

  useEffect(() => { if (editing !== null) inputRef.current?.select() }, [editing])

  const playingBar = isPlaying
    ? Math.floor(currentBeat / beatsPerBar)
    : -1

  /** Blocks are for drawing; edits go back out as plain sections. */
  const asSections = useCallback(
    (): DrumSection[] => blocks.map(b => ({ name: b.name, startBar: b.startBar })),
    [blocks],
  )

  /** The track has no structure yet: give it one section covering everything. */
  const addFirst = useCallback(() => {
    onChange([{ name: 'Intro', startBar: 0 }])
    setEditing(0)
    setDraft('Intro')
  }, [onChange])

  /** Split at `bar` (always ≥ 1 — bar 0 belongs to the first section by rule). */
  const splitAt = useCallback((bar: number) => {
    const base = asSections()
    if (base.some(s => s.startBar === bar)) return
    const suggestion = base.length === 1 ? 'Verse'
      : base.length === 2 ? 'Chorus'
      : 'Section ' + (base.length + 1)
    const next = [...base, { name: suggestion, startBar: bar }]
      .sort((a, b) => a.startBar - b.startBar)
    onChange(next)
    setEditing(next.findIndex(s => s.startBar === bar))
    setDraft(suggestion)
  }, [asSections, onChange])

  const removeAt = useCallback((index: number) => {
    if (index === 0) return   // bar 0 has to belong to something
    onChange(asSections().filter((_, i) => i !== index))
    setEditing(null)
  }, [asSections, onChange])

  const commitName = useCallback(() => {
    if (editing === null) return
    const name = draft.trim() || 'Section'
    onChange(asSections().map((s, i) => (i === editing ? { ...s, name } : s)))
    setEditing(null)
  }, [editing, draft, asSections, onChange])

  const label: React.CSSProperties = {
    fontFamily: f('ui'), fontSize: 11, fontWeight: 600,
    color: BT.dim, textTransform: 'uppercase', letterSpacing: '.06em',
  }

  return (
    <section
      aria-label="Arrangement"
      style={{
        flexShrink: 0, height: LANE_H, display: 'flex', alignItems: 'stretch',
        background: BT.card, border: '1px solid ' + BT.rule, borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      <div style={{
        width: GRID_LABEL_W, flexShrink: 0, padding: '0 10px',
        borderRight: '1px solid ' + BT.rule,
        display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3,
      }}>
        <span style={label}>Arrangement</span>
        <span style={{ fontFamily: f('ui'), fontSize: 11, color: BT.soft }}>
          {blocks.length
            ? blocks.length + (blocks.length === 1 ? ' section' : ' sections')
            : 'Name a stretch of bars'}
        </span>
      </div>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 3, padding: 7 }}>
        {blocks.length === 0 ? (
          <button
            type="button"
            onClick={addFirst}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '8px 13px', borderRadius: 9, cursor: 'pointer',
              border: '1px dashed ' + BT.rule, background: 'transparent', color: BT.muted,
              fontFamily: f('ui'), fontSize: 12, fontWeight: 600,
            }}
          >
            <Plus size={14} /> Add a section
          </button>
        ) : blocks.map(block => {
          const bars = block.endBar - block.startBar
          const playingHere = playingBar >= block.startBar && playingBar < block.endBar
          const isEditing = editing === block.index
          return (
            <React.Fragment key={block.startBar}>
              <div
                style={{
                  flex: bars, minWidth: 0, height: '100%', borderRadius: 8,
                  padding: '5px 8px', display: 'flex', flexDirection: 'column',
                  justifyContent: 'space-between',
                  background: block.color + '1f',
                  border: '1px solid ' + block.color + (playingHere ? 'cc' : '55'),
                  boxShadow: playingHere ? 'inset 0 -2px 0 ' + block.color : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                  {isEditing ? (
                    <input
                      ref={inputRef}
                      value={draft}
                      onChange={e => setDraft(e.target.value)}
                      onBlur={commitName}
                      onKeyDown={e => {
                        if (e.key === 'Enter') commitName()
                        if (e.key === 'Escape') setEditing(null)
                      }}
                      aria-label="Section name"
                      style={{
                        flex: 1, minWidth: 0, padding: '1px 4px', borderRadius: 5,
                        border: '1px solid ' + block.color, background: BT.card, color: BT.ink,
                        fontFamily: f('ui'), fontSize: 11, fontWeight: 700, outline: 'none',
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => { setEditing(block.index); setDraft(block.name) }}
                      title="Rename this section"
                      style={{
                        flex: 1, minWidth: 0, textAlign: 'left', padding: 0, cursor: 'pointer',
                        background: 'none', border: 'none', color: block.color,
                        fontFamily: f('ui'), fontSize: 11.5, fontWeight: 700,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}
                    >
                      {block.name}
                    </button>
                  )}
                  {block.index > 0 && !isEditing && (
                    <button
                      type="button"
                      onClick={() => removeAt(block.index)}
                      title={'Merge “' + block.name + '” into the section before it'}
                      aria-label={'Remove section ' + block.name}
                      style={{
                        display: 'inline-flex', flexShrink: 0, padding: 1, borderRadius: 4,
                        border: 'none', background: 'none', cursor: 'pointer', color: BT.dim,
                      }}
                    >
                      <X size={11} />
                    </button>
                  )}
                </div>
                {/* The block's own bars, so every bar that is not already a
                    boundary offers one. Without these the only split points
                    were the boundaries themselves, which meant a single section
                    covering the track could never be divided at all. */}
                <div style={{ display: 'flex', alignItems: 'stretch', gap: 1, minWidth: 0 }}>
                  {Array.from({ length: bars }, (_, i) => {
                    const bar = block.startBar + i
                    return (
                      <React.Fragment key={bar}>
                        {i > 0 && (
                          <button
                            type="button"
                            onClick={() => splitAt(bar)}
                            title={'Start a new section at bar ' + (bar + 1)}
                            aria-label={'Split at bar ' + (bar + 1)}
                            style={{
                              flexShrink: 0, width: 11, padding: 0, cursor: 'pointer',
                              borderRadius: 3, border: 'none', background: 'transparent',
                              color: BT.dim, display: 'inline-flex',
                              alignItems: 'center', justifyContent: 'center',
                            }}
                            onMouseEnter={e => {
                              e.currentTarget.style.background = alpha('accent', 0.14)
                              e.currentTarget.style.color = BT.accent
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.background = 'transparent'
                              e.currentTarget.style.color = BT.dim
                            }}
                          >
                            <Plus size={9} />
                          </button>
                        )}
                        <span
                          style={{
                            flex: 1, minWidth: 0, textAlign: 'center',
                            fontFamily: f('mono'), fontSize: 9.5, color: BT.soft,
                            fontVariantNumeric: 'tabular-nums',
                            borderTop: '1px solid ' + alpha('rule', 0.9),
                            paddingTop: 1,
                          }}
                        >
                          {bar + 1}
                        </span>
                      </React.Fragment>
                    )
                  })}
                </div>
              </div>
            </React.Fragment>
          )
        })}
      </div>
    </section>
  )
}

