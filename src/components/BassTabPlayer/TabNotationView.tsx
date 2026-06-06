import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import {
  type BassNote, type BassTrack, type SnapValue, type StringIndex, type BassSound, type TrackSection,
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
  snap: SnapValue
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
  onSectionChange?: (sections: TrackSection[]) => void
}

interface PendingInput {
  svgX: number
  si: StringIndex
  beat: number
  screenX: number
  screenY: number
}

interface PendingSection {
  startBar: number
  name: string
  screenX: number
  screenY: number
}

export function TabNotationView({
  track, zoom, snap, currentBeat, cursorBeat, isPlaying, selectedNoteId, sound, noteDuration,
  onAddNote, onUpdateNote, onDeleteNote, onSelectNote, onCursorBeatChange, onBeginEdit, onSectionChange,
}: Props) {
  const scrollRef       = useRef<HTMLDivElement>(null)
  const svgRef          = useRef<SVGSVGElement>(null)
  const inputRef        = useRef<HTMLInputElement>(null)
  const sectionInputRef = useRef<HTMLInputElement>(null)

  const [pending, setPending]               = useState<PendingInput | null>(null)
  const [fretVal, setFretVal]               = useState('')
  const [pendingSection, setPendingSection] = useState<PendingSection | null>(null)
  const [sectionNameVal, setSectionNameVal] = useState('')

  const pxPerBeat  = PPB * zoom
  const totalBeats = track.totalBars * track.beatsPerBar
  const svgW       = svgTotalWidth(track.totalBars, track.beatsPerBar, pxPerBeat)
  const svgH       = ABOVE_H + STAFF_H + BELOW_H

  // Auto-scroll follows playhead
  useEffect(() => {
    if (!isPlaying || !scrollRef.current) return
    const el = scrollRef.current
    const px = beatToX(currentBeat, pxPerBeat)
    const w  = el.clientWidth
    if (px > el.scrollLeft + w * 0.7) el.scrollLeft = px - w * 0.25
    else if (px < el.scrollLeft)       el.scrollLeft = Math.max(0, px - 20)
  }, [currentBeat, isPlaying, pxPerBeat])

  // String paths with gaps
  const stringPaths = useMemo(
    () => [0, 1, 2, 3].map(si => buildStringPath(si, track.notes, svgW, pxPerBeat)),
    [track.notes, svgW, pxPerBeat],
  )

  // Beat tick marks and beam groups
  const beatElements = useMemo(() => {
    const els: React.ReactNode[] = []
    const subDiv = 0.5

    for (let bar = 0; bar < track.totalBars; bar++) {
      // Ticks at every 0.5-beat grid position (visual reference)
      for (let s = 0; s < track.beatsPerBar; s += subDiv) {
        const beat = bar * track.beatsPerBar + s
        const x    = beatToX(beat, pxPerBeat)
        els.push(
          <line
            key={`t-${bar}-${s}`}
            x1={x} x2={x}
            y1={ABOVE_H + STAFF_H + TICK_OFFSET}
            y2={ABOVE_H + STAFF_H + TICK_OFFSET + TICK_H}
            stroke="#383858" strokeWidth={1}
          />,
        )
      }
      // Beams: only connect notes that are actually there
      const groups = computeBeamGroups(track.notes, bar, track.beatsPerBar, pxPerBeat)
      for (let gi = 0; gi < groups.length; gi++) {
        const { beamX1, beamX2, level } = groups[gi]
        els.push(
          <rect
            key={`b1-${bar}-${gi}`}
            x={beamX1} y={ABOVE_H + STAFF_H + TICK_OFFSET + TICK_H - 2}
            width={beamX2 - beamX1} height={2} fill="#383858"
          />,
        )
        if (level === 2) {
          els.push(
            <rect
              key={`b2-${bar}-${gi}`}
              x={beamX1} y={ABOVE_H + STAFF_H + TICK_OFFSET + TICK_H - 6}
              width={beamX2 - beamX1} height={2} fill="#383858"
            />,
          )
        }
      }
    }
    return els
  }, [track.notes, track.totalBars, track.beatsPerBar, pxPerBeat])

  // Header: tempo + time signature (sections rendered separately)
  const header = useMemo(() => {
    const x0 = barLineX(0, track.beatsPerBar, pxPerBeat)
    return (
      <>
        <text x={x0 + 2} y={ABOVE_H - 28} fontSize={9} fill="#60607a" fontFamily="monospace">
          ♩= {track.bpm}
        </text>
        <text x={x0 + 3} y={ABOVE_H - 15} fontSize={12} fill="#60607a" fontFamily="serif">
          {track.beatsPerBar}
        </text>
        <text x={x0 + 3} y={ABOVE_H - 3} fontSize={12} fill="#60607a" fontFamily="serif">
          {track.beatsPerBar}
        </text>
      </>
    )
  }, [track.beatsPerBar, track.bpm, pxPerBeat])

  // Section labels (dynamic, editable on double-click)
  const sectionEls = useMemo(() => (track.sections ?? []).map(sec => {
    const x = barLineX(sec.startBar, track.beatsPerBar, pxPerBeat) + 2
    return (
      <text
        key={sec.startBar}
        x={x} y={ABOVE_H - 40}
        fontSize={10} fontWeight="600"
        fill="#a0a0c8" fontFamily="monospace"
        style={{ cursor: 'pointer', userSelect: 'none' }}
        onDoubleClick={(e) => {
          e.stopPropagation()
          const el  = e.currentTarget as SVGTextElement
          const er  = el.getBoundingClientRect()
          const cr  = scrollRef.current!.getBoundingClientRect()
          setPendingSection({ startBar: sec.startBar, name: sec.name, screenX: er.left - cr.left, screenY: er.top - cr.top })
          setSectionNameVal(sec.name)
          setTimeout(() => sectionInputRef.current?.focus(), 20)
        }}
      >
        {sec.name}
      </text>
    )
  }), [track.sections, track.beatsPerBar, pxPerBeat])

  const commitSection = useCallback(() => {
    if (!pendingSection) return
    const name = sectionNameVal.trim()
    setPendingSection(null)
    if (!name || !onSectionChange) return
    const sections = [...(track.sections ?? [])]
    const idx = sections.findIndex(s => s.startBar === pendingSection.startBar)
    if (idx >= 0) sections[idx] = { ...sections[idx], name }
    else { sections.push({ name, startBar: pendingSection.startBar }); sections.sort((a, b) => a.startBar - b.startBar) }
    onSectionChange(sections)
  }, [pendingSection, sectionNameVal, track.sections, onSectionChange])

  // Click → open fret input
  const handlePointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (isPlaying) return
    const target = e.target as SVGElement
    if (target.closest('[data-note-id]')) return

    const rect   = svgRef.current!.getBoundingClientRect()
    const scaleX = svgW / rect.width
    const scaleY = svgH / rect.height

    const rawX   = (e.clientX - rect.left) * scaleX
    const rawY   = (e.clientY - rect.top)  * scaleY
    const staffY = rawY - ABOVE_H

    if (staffY < -8 || staffY > STAFF_H + 8) return

    const beat = snapToGrid(Math.max(0, xToBeat(rawX, pxPerBeat)), snap)
    if (beat >= totalBeats) return

    const si = yToStringIndex(Math.max(0, Math.min(STAFF_H, staffY)))

    setPending({
      svgX:    rawX,
      si,
      beat,
      screenX: e.clientX - rect.left,
      screenY: e.clientY - rect.top,
    })
    setFretVal('')
    setTimeout(() => inputRef.current?.focus(), 20)
  }, [isPlaying, svgW, svgH, pxPerBeat, snap, totalBeats])

  const commitFret = useCallback((val: string) => {
    if (!pending) return
    const fret = parseInt(val, 10)
    setPending(null)
    if (isNaN(fret) || fret < 0 || fret > 24) return

    // If a note already occupies this position, update its fret instead of adding
    const existing = findNoteAtBeat(track.notes, pending.si, pending.beat)
    if (existing) {
      onBeginEdit?.()
      onUpdateNote(existing.id, { fret })
      onSelectNote(existing.id)
      previewNote(pending.si, fret, sound)
      return
    }

    // Clamp duration so the note doesn't overlap the next one on this string
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
    onCursorBeatChange(snapToGrid(pending.beat + safeDur, snap))
  }, [pending, snap, noteDuration, track, onAddNote, onUpdateNote, onSelectNote, onBeginEdit, onCursorBeatChange, sound])

  const activeBeat = isPlaying ? currentBeat : cursorBeat
  const cursorX    = beatToX(activeBeat, pxPerBeat)

  return (
    <div
      ref={scrollRef}
      style={{
        flex: 1,
        overflowX: 'auto',
        overflowY: 'hidden',
        position: 'relative',
        background: 'hsl(224 24% 8%)',
        minHeight: svgH,
      }}
    >
      <svg
        ref={svgRef}
        data-testid="tab-notation-svg"
        width={svgW}
        height={svgH}
        viewBox={`0 0 ${svgW} ${svgH}`}
        onPointerDown={handlePointerDown}
        style={{ display: 'block', cursor: isPlaying ? 'default' : 'crosshair', userSelect: 'none' }}
      >
        {/* ── Header ── */}
        {header}

        {/* ── Section labels ── */}
        {sectionEls}

        {/* ── Measure numbers ── */}
        {Array.from({ length: track.totalBars }, (_, bar) => (
          <text
            key={bar}
            x={barLineX(bar, track.beatsPerBar, pxPerBeat) + 4}
            y={ABOVE_H - 10}
            fontSize={9}
            fill="#404068"
            fontFamily="monospace"
            data-bar={bar}
            style={{ cursor: 'context-menu' }}
          >
            {bar + 1}
          </text>
        ))}

        {/* ── String labels G D A E ── */}
        {STRING_LABELS.map((label, i) => (
          <text
            key={label}
            x={6}
            y={ABOVE_H + STRING_Y[i] + 4}
            fontSize={10}
            fill="#505070"
            fontFamily="monospace"
          >
            {label}
          </text>
        ))}

        {/* ── Bar lines ── */}
        {Array.from({ length: track.totalBars + 1 }, (_, bar) => {
          const x      = barLineX(bar, track.beatsPerBar, pxPerBeat)
          const isEdge = bar === 0 || bar === track.totalBars
          return (
            <line
              key={bar}
              x1={x} x2={x}
              y1={ABOVE_H}
              y2={ABOVE_H + STAFF_H}
              stroke={isEdge ? '#505078' : '#383858'}
              strokeWidth={isEdge ? 2 : 1}
            />
          )
        })}

        {/* ── String lines with gaps ── */}
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

        {/* ── Beat tick marks + beams ── */}
        {beatElements}

        {/* ── Fret numbers ── */}
        {track.notes.map(note => {
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
                fontSize={9}
                fontWeight="bold"
                fill={isSelected ? '#e8deff' : '#b8b0d0'}
                fontFamily="ui-monospace,'SF Mono',monospace"
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {note.fret}
              </text>
            </g>
          )
        })}

        {/* ── Cursor / playhead ── */}
        <TabNotationCursor x={cursorX} isPlaying={isPlaying} />
      </svg>

      {/* ── Section name input overlay ── */}
      {pendingSection && (
        <div
          style={{
            position: 'absolute',
            left: pendingSection.screenX,
            top:  pendingSection.screenY - 4,
            zIndex: 200,
          }}
        >
          <input
            ref={sectionInputRef}
            type="text"
            maxLength={32}
            value={sectionNameVal}
            placeholder="Section name"
            onChange={e => setSectionNameVal(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter')  { e.preventDefault(); commitSection() }
              if (e.key === 'Escape') { e.preventDefault(); setPendingSection(null) }
            }}
            onBlur={commitSection}
            style={{
              width: 120, height: 22,
              padding: '0 6px',
              borderRadius: 4,
              border: '2px solid hsl(262 83% 58%)',
              background: 'hsl(224 20% 13%)',
              color: '#a0a0c8',
              fontFamily: "monospace",
              fontSize: 10, fontWeight: 600,
              outline: 'none',
              boxShadow: '0 0 10px hsl(262 83% 58% / 0.35)',
            }}
          />
        </div>
      )}

      {/* ── Fret number input overlay ── */}
      {pending && (() => {
        const scaleX = svgRef.current ? svgRef.current.clientWidth  / svgW : 1
        const scaleY = svgRef.current ? svgRef.current.clientHeight / svgH : 1
        return (
          <div
            style={{
              position: 'absolute',
              left: pending.screenX * scaleX - 18,
              top:  pending.screenY * scaleY - 14,
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
                width: 36, height: 26,
                textAlign: 'center',
                borderRadius: 4,
                border: '2px solid hsl(262 83% 58%)',
                background: 'hsl(224 20% 13%)',
                color: 'white',
                fontFamily: "ui-monospace,'SF Mono',monospace",
                fontSize: 12,
                fontWeight: 'bold',
                outline: 'none',
                boxShadow: '0 0 12px hsl(262 83% 58% / 0.4)',
              }}
            />
          </div>
        )
      })()}
    </div>
  )
}
