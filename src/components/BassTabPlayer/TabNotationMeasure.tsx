import React, { useRef, useState, useCallback, useMemo, useEffect } from 'react'
import {
  type BassNote, type BassTrack, type StringIndex, type BassSound,
} from '../../lib/bassTab/types'
import {
  STRING_Y, STAFF_H, ABOVE_H, BELOW_H, LABEL_W, PPB, TICK_OFFSET, TICK_H,
  beatToX, barLineX, xToBeat, yToStringIndex, svgTotalWidth, buildStringPath,
  computeBeamGroups,
} from '../../lib/bassTab/tabNotation'
import { snapToGrid, findNoteAtBeat, clampDuration } from '../../lib/bassTab/bassTheory'
import { previewNote } from '../../lib/bassTab/bassAudio'
import { TabNotationCursor } from './TabNotationCursor'

const STRING_LABELS = ['G', 'D', 'A', 'E']

interface Props {
  track: BassTrack
  zoom: number
  currentBeat: number
  cursorBeat: number
  isPlaying: boolean
  selectedNoteId: string | null
  sound: BassSound
  noteDuration: number
  onAddNote: (note: BassNote) => void
  onUpdateNote: (id: string, patch: Partial<BassNote>) => void
  onDeleteNote: (id: string) => void
  onSelectNote: (id: string | null) => void
  onCursorBeatChange: (beat: number) => void
  onBeginEdit?: () => void
}

interface PendingInput {
  si: StringIndex
  beat: number
  screenX: number
  screenY: number
}

const SNAP = 0.25

export function TabNotationMeasure({
  track, zoom, currentBeat, cursorBeat, isPlaying, selectedNoteId, sound, noteDuration,
  onAddNote, onUpdateNote, onSelectNote, onCursorBeatChange, onBeginEdit,
}: Props) {
  const svgRef   = useRef<SVGSVGElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const [currentBar, setCurrentBar] = useState(0)
  const [pending, setPending]       = useState<PendingInput | null>(null)
  const [fretVal, setFretVal]       = useState('')

  const pxPerBeat  = PPB * zoom
  const bpb        = track.beatsPerBar
  const totalBars  = track.totalBars
  const svgW       = svgTotalWidth(totalBars, bpb, pxPerBeat)
  const svgH       = ABOVE_H + STAFF_H + BELOW_H

  // Auto-advance measure during playback
  useEffect(() => {
    if (!isPlaying) return
    const bar = Math.floor(currentBeat / bpb)
    if (bar !== currentBar && bar < totalBars) setCurrentBar(bar)
  }, [currentBeat, isPlaying, bpb, totalBars, currentBar])

  // ViewBox shows only the current measure
  const barX       = barLineX(currentBar, bpb, pxPerBeat)
  const barW       = bpb * pxPerBeat
  const vbX        = barX - LABEL_W - 4
  const vbW        = LABEL_W + barW + 8
  const viewBoxStr = `${vbX} 0 ${vbW} ${svgH}`

  // Cursor x (absolute SVG coord)
  const cursorX = beatToX(isPlaying ? currentBeat : cursorBeat, pxPerBeat)

  // String paths (full track, viewBox clips the rest)
  const stringPaths = useMemo(
    () => [0, 1, 2, 3].map(si => buildStringPath(si, track.notes, svgW, pxPerBeat)),
    [track.notes, svgW, pxPerBeat],
  )

  // Beat ticks for current bar only
  const tickEls = useMemo(() => {
    const els: React.ReactNode[] = []
    const subDiv  = 0.5

    for (let s = 0; s < bpb; s += subDiv) {
      const beat = currentBar * bpb + s
      const x    = beatToX(beat, pxPerBeat)
      els.push(
        <line
          key={s}
          x1={x} x2={x}
          y1={ABOVE_H + STAFF_H + TICK_OFFSET}
          y2={ABOVE_H + STAFF_H + TICK_OFFSET + TICK_H}
          stroke="#383858" strokeWidth={1}
        />,
      )
    }
    const groups = computeBeamGroups(track.notes, currentBar, bpb, pxPerBeat)
    for (let gi = 0; gi < groups.length; gi++) {
      const { beamX1, beamX2, level } = groups[gi]
      els.push(
        <rect
          key={`b1${gi}`}
          x={beamX1} y={ABOVE_H + STAFF_H + TICK_OFFSET + TICK_H - 2}
          width={beamX2 - beamX1} height={2} fill="#383858"
        />,
      )
      if (level === 2) {
        els.push(
          <rect
            key={`b2${gi}`}
            x={beamX1} y={ABOVE_H + STAFF_H + TICK_OFFSET + TICK_H - 6}
            width={beamX2 - beamX1} height={2} fill="#383858"
          />,
        )
      }
    }
    return els
  }, [track.notes, currentBar, bpb, pxPerBeat])

  // Click → open fret input
  const handlePointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (isPlaying) return
    const target = e.target as SVGElement
    if (target.closest('[data-note-id]')) return

    const rect   = svgRef.current!.getBoundingClientRect()
    const scaleX = vbW / rect.width
    const scaleY = svgH / rect.height

    const rawX   = (e.clientX - rect.left) * scaleX + vbX
    const rawY   = (e.clientY - rect.top)  * scaleY
    const staffY = rawY - ABOVE_H

    if (staffY < -8 || staffY > STAFF_H + 8) return

    const beat = snapToGrid(Math.max(0, xToBeat(rawX, pxPerBeat)), SNAP)
    const si   = yToStringIndex(Math.max(0, Math.min(STAFF_H, staffY)))

    setPending({ si, beat, screenX: e.clientX - rect.left, screenY: e.clientY - rect.top })
    setFretVal('')
    setTimeout(() => inputRef.current?.focus(), 20)
  }, [isPlaying, vbX, vbW, svgH, pxPerBeat])

  const commitFret = useCallback((val: string) => {
    if (!pending) return
    const fret = parseInt(val, 10)
    setPending(null)
    if (isNaN(fret) || fret < 0 || fret > 24) return

    const existing = findNoteAtBeat(track.notes, pending.si, pending.beat)
    if (existing) {
      onBeginEdit?.()
      onUpdateNote(existing.id, { fret })
      onSelectNote(existing.id)
      previewNote(pending.si, fret, sound)
      return
    }

    const totalBeats = track.totalBars * track.beatsPerBar
    const safeDur = clampDuration(track.notes, pending.si, pending.beat, noteDuration, totalBeats)
    if (safeDur <= 0) return

    onBeginEdit?.()
    const note: BassNote = {
      id:            crypto.randomUUID(),
      stringIndex:   pending.si,
      fret,
      startBeat:     pending.beat,
      durationBeats: safeDur,
      velocity:      0.8,
    }
    onAddNote(note)
    onSelectNote(note.id)
    previewNote(pending.si, fret, sound)
    onCursorBeatChange(snapToGrid(pending.beat + safeDur, SNAP))
  }, [pending, noteDuration, track, onAddNote, onUpdateNote, onSelectNote, onBeginEdit, onCursorBeatChange, sound])

  // Notes in current bar only
  const visibleNotes = track.notes.filter(n => Math.floor(n.startBeat / bpb) === currentBar)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'hsl(224 24% 8%)', position: 'relative' }}>
      {/* SVG tab */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <svg
          ref={svgRef}
          viewBox={viewBoxStr}
          width="100%"
          height={svgH}
          onPointerDown={handlePointerDown}
          style={{ display: 'block', cursor: isPlaying ? 'default' : 'crosshair', userSelect: 'none' }}
        >
          {/* ── String labels ── */}
          {STRING_LABELS.map((label, i) => (
            <text
              key={label}
              x={barX - LABEL_W + 4}
              y={ABOVE_H + STRING_Y[i] + 4}
              fontSize={10}
              fill="#505070"
              fontFamily="monospace"
            >
              {label}
            </text>
          ))}

          {/* ── Bar lines (left + right of current bar) ── */}
          {[currentBar, currentBar + 1].map(bar => (
            <line
              key={bar}
              x1={barLineX(bar, bpb, pxPerBeat)}
              x2={barLineX(bar, bpb, pxPerBeat)}
              y1={ABOVE_H} y2={ABOVE_H + STAFF_H}
              stroke="#505078" strokeWidth={2}
            />
          ))}

          {/* ── String lines ── */}
          {stringPaths.map((d, si) => (
            <path
              key={si}
              d={d}
              transform={`translate(0,${ABOVE_H})`}
              stroke="#383858"
              strokeWidth={1}
              fill="none"
            />
          ))}

          {/* ── Beat ticks ── */}
          {tickEls}

          {/* ── Measure number ── */}
          <text
            x={barX + 4}
            y={ABOVE_H - 10}
            fontSize={9}
            fill="#404068"
            fontFamily="monospace"
          >
            {currentBar + 1}
          </text>

          {/* ── Fret numbers (current bar only) ── */}
          {visibleNotes.map(note => {
            const nx         = beatToX(note.startBeat, pxPerBeat)
            const ny         = ABOVE_H + STRING_Y[note.stringIndex]
            const isSelected = note.id === selectedNoteId
            const rw         = note.fret >= 10 ? 22 : 16

            return (
              <g
                key={note.id}
                data-note-id={note.id}
                style={{ cursor: 'pointer' }}
                onPointerDown={e => {
                  e.stopPropagation()
                  onSelectNote(note.id)
                  previewNote(note.stringIndex, note.fret, sound)
                }}
              >
                <rect
                  x={nx - rw / 2} y={ny - 7}
                  width={rw} height={14}
                  rx={2}
                  fill={isSelected ? 'hsl(262 83% 40%)' : 'hsl(224 24% 11%)'}
                  stroke={isSelected ? 'hsl(262 60% 68%)' : '#383858'}
                  strokeWidth={1}
                />
                <text
                  x={nx} y={ny + 4.5}
                  textAnchor="middle"
                  fontSize={9} fontWeight="bold"
                  fill={isSelected ? '#e8deff' : '#b8b0d0'}
                  fontFamily="ui-monospace,'SF Mono',monospace"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {note.fret}
                </text>
              </g>
            )
          })}

          {/* ── Cursor ── */}
          <TabNotationCursor x={cursorX} isPlaying={isPlaying} />
        </svg>

        {/* ── Fret input overlay ── */}
        {pending && (
          <div
            style={{
              position: 'absolute',
              left: pending.screenX - 18,
              top:  pending.screenY - 14,
              zIndex: 200,
            }}
          >
            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              maxLength={2}
              value={fretVal}
              placeholder="0"
              onChange={e => setFretVal(e.target.value.replace(/\D/g, ''))}
              onKeyDown={e => {
                if (e.key === 'Enter')  { e.preventDefault(); commitFret(fretVal) }
                if (e.key === 'Escape') { e.preventDefault(); setPending(null) }
              }}
              onBlur={() => commitFret(fretVal)}
              style={{
                width: 36, height: 26, textAlign: 'center',
                borderRadius: 4,
                border: '2px solid hsl(262 83% 58%)',
                background: 'hsl(224 20% 13%)',
                color: 'white',
                fontFamily: "ui-monospace,'SF Mono',monospace",
                fontSize: 12, fontWeight: 'bold',
                outline: 'none',
                boxShadow: '0 0 12px hsl(262 83% 58% / 0.4)',
              }}
            />
          </div>
        )}
      </div>

      {/* ── Bar navigation ── */}
      <div
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '5px 16px', flexShrink: 0,
          borderTop: '1px solid hsl(224 15% 16%)',
        }}
      >
        <button
          onClick={() => setCurrentBar(b => Math.max(0, b - 1))}
          disabled={currentBar === 0}
          style={{
            padding: '3px 12px', borderRadius: 6,
            border: '1px solid hsl(224 15% 22%)',
            background: 'transparent',
            color: currentBar === 0 ? '#303048' : '#7070a0',
            cursor: currentBar === 0 ? 'default' : 'pointer',
            fontSize: 11, fontFamily: 'inherit',
          }}
        >
          ← Bar {currentBar}
        </button>

        <span style={{ fontSize: 11, color: '#404068' }}>
          {currentBar + 1} / {totalBars}
        </span>

        <button
          onClick={() => setCurrentBar(b => Math.min(totalBars - 1, b + 1))}
          disabled={currentBar === totalBars - 1}
          style={{
            padding: '3px 12px', borderRadius: 6,
            border: '1px solid hsl(224 15% 22%)',
            background: 'transparent',
            color: currentBar === totalBars - 1 ? '#303048' : '#7070a0',
            cursor: currentBar === totalBars - 1 ? 'default' : 'pointer',
            fontSize: 11, fontFamily: 'inherit',
          }}
        >
          Bar {currentBar + 2} →
        </button>
      </div>
    </div>
  )
}
