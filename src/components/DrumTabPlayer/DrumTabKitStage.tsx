import React, { useCallback, useEffect, useMemo, useRef } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import {
  DRUM_ROWS, STEPS_PER_BEAT,
  type DrumKitId, type DrumPieceId, type DrumTrack,
} from '../../lib/drumTab/types'
import { buildKitSvg, SCENES } from '../../lib/virtualDrums/kitSvg'
import { animateKitHit, pieceFromPointer } from '../../lib/virtualDrums/kitAnim'
import { BT, alpha, f } from '../../lib/bassTab/theme'
import { PART_ICON } from './partIcons'

/**
 * The kit, playing along with the tab.
 *
 * It is the same drawing `/drums/` mounts — `buildKitSvg` — in its `bare`
 * scene: at a few hundred pixels tall the crowd is a row of smudges and the
 * light beams cross the whole strip, so the set dressing comes off and the
 * viewBox widens to fill the band instead of letterboxing the kit in the middle.
 *
 * It renders no audio of its own. Hits are read off `currentBeat`, which the
 * player already receives from the scheduler, so a piece lights up in step with
 * the sound the transport is making rather than in step with a second timer.
 *
 * Collapsed it is not a small kit but a row of part icons: shrinking a drawing
 * of a drum kit to 54px produces a smudge, whereas the icons stay legible and
 * still tell you what is being struck.
 */

/**
 * Two crops, because the band is two very different shapes.
 *
 * On a desktop it is wide and short (4.4:1), so the viewBox widens past the
 * scene and the backdrop fills the extra width. Reusing that on a phone is what
 * left the kit as a ~90px strip floating in an almost empty band: a 2:1 portrait
 * container fitted to a 4.4:1 drawing letterboxes hard. Narrow gets a crop
 * ceilinged to the kit itself and `slice`, which is the same trick
 * `VirtualDrums` uses for its own narrow case.
 */
const STAGE_VIEWBOX_WIDE   = '-620 140 2840 650'
const STAGE_VIEWBOX_NARROW = '170 120 1270 700'
const STAGE_SCENE = SCENES[0]   // Dark Stage — its colours, minus the dressing

const COLLAPSED_H = 54
const EXPANDED_H  = 'clamp(170px, 27vh, 300px)'
const EXPANDED_H_NARROW = 'clamp(150px, 24vh, 300px)'

/**
 * Cymbal zones the kit can voice but the tab has no row for. A click on the
 * crash bell should still select the Crash row rather than select nothing.
 */
const ZONE_TO_ROW: Partial<Record<string, DrumPieceId>> = {
  'crash-body': 'crash-edge',
  'crash-bell': 'crash-edge',
  'ride-edge':  'ride-body',
}

const ROW_IDS = new Set<string>(DRUM_ROWS.map(r => r.id))

function toRowPiece(id: DrumPieceId): DrumPieceId | null {
  const mapped = ZONE_TO_ROW[id] ?? id
  return ROW_IDS.has(mapped) ? mapped : null
}

interface Props {
  kit: DrumKitId
  track: DrumTrack
  currentBeat: number
  isPlaying: boolean
  collapsed: boolean
  onToggleCollapse: () => void
  /** Row the grid and the inspector consider current; drawn with a glow. */
  selectedPiece: DrumPieceId | null
  onSelectPiece: (piece: DrumPieceId) => void
  /** Portrait phone: a tighter crop and a shorter band. */
  narrow?: boolean
}

export function DrumTabKitStage({
  kit, track, currentBeat, isPlaying, collapsed,
  onToggleCollapse, selectedPiece, onSelectPiece, narrow = false,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const stripRef = useRef<HTMLDivElement>(null)

  const svgMarkup = useMemo(
    () => buildKitSvg({
      kit,
      scene: STAGE_SCENE,
      showLabels: false,
      bare: true,
      viewBox: narrow ? STAGE_VIEWBOX_NARROW : STAGE_VIEWBOX_WIDE,
      fit: narrow ? 'slice' : 'meet',
    }),
    [kit, narrow],
  )

  /** Which pieces are struck on each sixteenth, so playback lookup is O(1). */
  const hitsBySlot = useMemo(() => {
    const map = new Map<number, DrumPieceId[]>()
    for (const h of track.hits) {
      const slot = Math.round(h.startBeat * STEPS_PER_BEAT)
      const at = map.get(slot)
      if (at) at.push(h.pieceId)
      else map.set(slot, [h.pieceId])
    }
    return map
  }, [track.hits])

  // Flash on slot change, not on every `currentBeat` tick: the scheduler reports
  // beats as a float many times per sixteenth, and re-animating on each one
  // would keep restarting the cymbal swing from zero.
  const lastSlotRef = useRef(-1)
  useEffect(() => {
    if (!isPlaying) { lastSlotRef.current = -1; return }
    const slot = Math.floor(currentBeat * STEPS_PER_BEAT + 1e-6)
    if (slot === lastSlotRef.current) return
    lastSlotRef.current = slot
    const pieces = hitsBySlot.get(slot)
    if (!pieces) return
    for (const piece of pieces) {
      animateKitHit(hostRef.current, piece)
      const chip = stripRef.current?.querySelector<HTMLElement>(`[data-part="${piece}"]`)
      chip?.animate(
        [{ background: alpha('accent', 0.85), color: '#fff' }, { background: 'transparent', color: BT.muted }],
        { duration: 240, easing: 'ease-out' },
      )
    }
  }, [currentBeat, isPlaying, hitsBySlot])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const voiced = pieceFromPointer(hostRef.current, e.target, e.clientX, e.clientY)
    if (!voiced) return
    animateKitHit(hostRef.current, voiced)
    const row = toRowPiece(voiced)
    if (row) onSelectPiece(row)
  }, [onSelectPiece])

  // The selected piece gets a glow rather than an outline: an SVG outline traces
  // every path in the group, which on a cymbal is a mess of concentric rings.
  useEffect(() => {
    const root = hostRef.current
    if (!root) return
    const lit = root.querySelectorAll<SVGElement>('[data-hit]')
    lit.forEach(el => { el.style.filter = '' })
    if (!selectedPiece) return
    root.querySelectorAll<SVGElement>(`[data-hit^="${selectedPiece.split('-')[0]}"]`)
      .forEach(el => { el.style.filter = `drop-shadow(0 0 7px ${alpha('accentHi', 0.9)})` })
  }, [selectedPiece, svgMarkup, collapsed])

  return (
    <section
      aria-label="Drum kit"
      style={{
        position: 'relative', flexShrink: 0,
        background: collapsed ? BT.panel : STAGE_SCENE.wall,
        borderBottom: '1px solid ' + BT.panelRule,
        height: collapsed ? COLLAPSED_H : narrow ? EXPANDED_H_NARROW : EXPANDED_H,
        transition: 'height 180ms ease-out',
        overflow: 'hidden',
      }}
    >
      {collapsed ? (
        <div
          ref={stripRef}
          style={{
            height: '100%', display: 'flex', alignItems: 'center', gap: 4,
            padding: '0 14px', overflowX: 'auto',
          }}
        >
          {DRUM_ROWS.map(row => {
            const Icon = PART_ICON[row.id]
            const on = selectedPiece === row.id
            return (
              <button
                key={row.id}
                type="button"
                data-part={row.id}
                onClick={() => onSelectPiece(row.id)}
                title={row.label}
                aria-pressed={on}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
                  padding: '6px 10px', borderRadius: 8, cursor: 'pointer',
                  border: '1px solid ' + (on ? BT.accent : BT.panelRule),
                  background: on ? alpha('accent', 0.25) : 'transparent',
                  color: on ? '#fff' : BT.panelInk,
                  fontFamily: f('ui'), fontSize: 11, fontWeight: 600,
                }}
              >
                <Icon style={{ width: 15, height: 15 }} />
                {row.short}
              </button>
            )
          })}
        </div>
      ) : (
        <div
          ref={hostRef}
          onPointerDown={handlePointerDown}
          style={{ height: '100%', touchAction: 'none' }}
          dangerouslySetInnerHTML={{ __html: svgMarkup }}
        />
      )}

      <button
        type="button"
        onClick={onToggleCollapse}
        aria-expanded={!collapsed}
        title={collapsed ? 'Show the kit' : 'Hide the kit'}
        style={{
          position: 'absolute', right: 12, top: 10,
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '5px 10px', borderRadius: 8, cursor: 'pointer',
          border: '1px solid ' + BT.panelRule,
          background: 'rgba(12, 10, 18, 0.55)', backdropFilter: 'blur(4px)',
          color: BT.panelInk, fontFamily: f('ui'), fontSize: 11, fontWeight: 600,
        }}
      >
        {collapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
        Kit
      </button>
    </section>
  )
}
