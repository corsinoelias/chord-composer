import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { useIsMobile } from '../../hooks/use-mobile.tsx'
import {
  type BassNote, type BassTrack, type StringIndex, type BassSound, type TrackSection,
} from '../../lib/bassTab/types'
import {
  STRING_Y, STAFF_H, ABOVE_H, BELOW_H, LABEL_W, PPB, TICK_OFFSET, TICK_H, NOTE_GAP,
  beatToX, barLineX, xToBeat, yToStringIndex, svgTotalWidth, buildStringPath,
  computeBeamGroups,
} from '../../lib/bassTab/tabNotation'
import { snapToGrid, findNoteAtBeat, clampDuration } from '../../lib/bassTab/bassTheory'
import { previewNote } from '../../lib/bassTab/bassAudio'
import { TabNotationCursor } from './TabNotationCursor'

const STRING_LABELS = ['G', 'D', 'A', 'E']

interface EditCursor {
  beat: number
  stringIndex: StringIndex
}

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
  onSectionChange?: (sections: TrackSection[]) => void
  // Fit-to-width
  fitWidth?: boolean
  onFitZoomChange?: (z: number) => void
}

const SNAP = 0.25

export function TabScore({
  track, zoom, currentBeat, cursorBeat, isPlaying, selectedNoteId, sound, noteDuration,
  onAddNote, onUpdateNote, onDeleteNote, onSelectNote, onCursorBeatChange, onBeginEdit, onSectionChange,
  fitWidth = false, onFitZoomChange,
}: Props) {
  const isMobile        = useIsMobile()
  const containerRef    = useRef<HTMLDivElement>(null)
  const scrollRef       = useRef<HTMLDivElement>(null)
  const svgRef          = useRef<SVGSVGElement>(null)
  const sectionInputRef = useRef<HTMLInputElement>(null)
  const fretTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Edit cursor — kept in both state (for render) and ref (for stable callbacks / timers)
  const [editCursor, setEditCursorState] = useState<EditCursor | null>(null)
  const [fretBuffer, setFretBufferState] = useState('')
  const editCursorRef = useRef<EditCursor | null>(null)
  const fretBufferRef = useRef('')

  const setEditCursor = useCallback((v: EditCursor | null) => {
    editCursorRef.current = v
    setEditCursorState(v)
  }, [])

  const setFretBuffer = useCallback((v: string) => {
    fretBufferRef.current = v
    setFretBufferState(v)
  }, [])

  // Section rename
  const [pendingSection, setPendingSection] = useState<{ startBar: number; screenX: number; screenY: number } | null>(null)
  const [sectionNameVal, setSectionNameVal] = useState('')

  // Stable refs for values used inside the timer-fired commitFret
  const trackRef        = useRef(track)
  const noteDurationRef = useRef(noteDuration)
  const snapRef         = useRef(SNAP)
  const soundRef        = useRef(sound)
  const totalBeatsRef   = useRef(track.totalBars * track.beatsPerBar)
  useEffect(() => { trackRef.current = track }, [track])
  useEffect(() => { noteDurationRef.current = noteDuration }, [noteDuration])
  useEffect(() => { soundRef.current = sound }, [sound])
  useEffect(() => { totalBeatsRef.current = track.totalBars * track.beatsPerBar }, [track.totalBars, track.beatsPerBar])

  // ── Fit-to-width ───────────────────────────────────────────────────────────
  const [containerW, setContainerW] = useState(0)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(es => setContainerW(es[0].contentRect.width))
    ro.observe(el)
    setContainerW(el.getBoundingClientRect().width)
    return () => ro.disconnect()
  }, [])

  const totalBeats   = track.totalBars * track.beatsPerBar
  const fitZoom      = fitWidth && containerW > 0 && totalBeats > 0
    ? Math.max(0.2, (containerW - LABEL_W) / (totalBeats * PPB))
    : null
  const effectiveZoom = fitZoom ?? zoom
  const pxPerBeat     = PPB * effectiveZoom

  useEffect(() => {
    if (fitZoom !== null) onFitZoomChange?.(fitZoom)
  }, [fitZoom, onFitZoomChange])

  const svgW = svgTotalWidth(track.totalBars, track.beatsPerBar, pxPerBeat)
  const svgH = ABOVE_H + STAFF_H + BELOW_H

  // ── Auto-scroll ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isPlaying || !scrollRef.current) return
    const el = scrollRef.current
    const px = beatToX(currentBeat, pxPerBeat)
    const w  = el.clientWidth
    if (px > el.scrollLeft + w * 0.7) el.scrollLeft = px - w * 0.25
    else if (px < el.scrollLeft)       el.scrollLeft = Math.max(0, px - 20)
  }, [currentBeat, isPlaying, pxPerBeat])

  useEffect(() => {
    if (!editCursor || !scrollRef.current) return
    const el = scrollRef.current
    const px = beatToX(editCursor.beat, pxPerBeat)
    const w  = el.clientWidth
    if (px > el.scrollLeft + w * 0.8) el.scrollLeft = px - w * 0.4
    else if (px < el.scrollLeft + 40)  el.scrollLeft = Math.max(0, px - 60)
  }, [editCursor, pxPerBeat])

  // ── Commit fret ────────────────────────────────────────────────────────────
  // Stable callback — reads live values from refs so timers always get fresh data
  const commitFret = useCallback((buf: string) => {
    clearTimeout(fretTimerRef.current!)
    setFretBuffer('')
    const cursor = editCursorRef.current
    if (!cursor) return
    const fret = parseInt(buf, 10)
    if (isNaN(fret) || fret < 0 || fret > 24) return

    const { notes } = trackRef.current
    const nd  = noteDurationRef.current
    const tb  = totalBeatsRef.current
    const sn  = snapRef.current
    const snd = soundRef.current

    const existing = findNoteAtBeat(notes, cursor.stringIndex, cursor.beat)
    if (existing) {
      onBeginEdit?.()
      onUpdateNote(existing.id, { fret })
      onSelectNote(existing.id)
      previewNote(cursor.stringIndex, fret, snd)
    } else {
      const safeDur = clampDuration(notes, cursor.stringIndex, cursor.beat, nd, tb)
      if (safeDur <= 0) return
      onBeginEdit?.()
      const note: BassNote = {
        id:            crypto.randomUUID(),
        stringIndex:   cursor.stringIndex,
        fret,
        startBeat:     cursor.beat,
        durationBeats: safeDur,
        velocity:      0.8,
      }
      onAddNote(note)
      onSelectNote(note.id)
      previewNote(cursor.stringIndex, fret, snd)
    }

    // Advance cursor by note duration (no grid snap — musical step)
    const next = Math.min(cursor.beat + nd, tb - sn)
    setEditCursor({ ...cursor, beat: next })
    onCursorBeatChange(next)
  }, [onBeginEdit, onUpdateNote, onAddNote, onSelectNote, onCursorBeatChange, setFretBuffer, setEditCursor])

  // Keep ref current so timer callbacks always call the latest version
  const commitFretRef = useRef(commitFret)
  useEffect(() => { commitFretRef.current = commitFret }, [commitFret])

  // ── Shared editing actions (called by keyboard AND mobile numpad) ──────────

  const doAppendDigit = useCallback((digit: string) => {
    if (isPlaying || !editCursorRef.current) return
    clearTimeout(fretTimerRef.current!)
    const newBuf = fretBufferRef.current + digit
    const num    = parseInt(newBuf)
    if (newBuf.length >= 2 || num > 2) {
      commitFretRef.current(newBuf)
    } else {
      setFretBuffer(newBuf)
      fretTimerRef.current = setTimeout(() => commitFretRef.current(fretBufferRef.current), 600)
    }
  }, [isPlaying, setFretBuffer])

  const doBackspace = useCallback(() => {
    if (isPlaying || !editCursorRef.current) return
    clearTimeout(fretTimerRef.current!)
    const buf = fretBufferRef.current
    if (buf) {
      setFretBuffer(buf.slice(0, -1))
    } else {
      const cur = editCursorRef.current
      const ex  = findNoteAtBeat(trackRef.current.notes, cur.stringIndex, cur.beat)
      if (ex) { onBeginEdit?.(); onDeleteNote(ex.id); onSelectNote(null) }
    }
  }, [isPlaying, setFretBuffer, onBeginEdit, onDeleteNote, onSelectNote])

  const doDelete = useCallback(() => {
    if (isPlaying || !editCursorRef.current) return
    clearTimeout(fretTimerRef.current!)
    setFretBuffer('')
    const cur = editCursorRef.current
    const ex  = findNoteAtBeat(trackRef.current.notes, cur.stringIndex, cur.beat)
    if (ex) { onBeginEdit?.(); onDeleteNote(ex.id); onSelectNote(null) }
  }, [isPlaying, setFretBuffer, onBeginEdit, onDeleteNote, onSelectNote])

  const doConfirm = useCallback(() => {
    if (isPlaying || !editCursorRef.current) return
    const buf = fretBufferRef.current
    if (buf) {
      commitFretRef.current(buf)
    } else {
      const cur = editCursorRef.current
      const sn  = snapRef.current
      const tb  = totalBeatsRef.current
      const next = Math.min(cur.beat + noteDurationRef.current, tb - sn)
      setEditCursor({ ...cur, beat: next })
      onCursorBeatChange(next)
    }
  }, [isPlaying, setEditCursor, onCursorBeatChange])

  const doMoveBeat = useCallback((dir: 1 | -1) => {
    if (isPlaying || !editCursorRef.current) return
    clearTimeout(fretTimerRef.current!)
    if (fretBufferRef.current) { commitFretRef.current(fretBufferRef.current); return }
    const cur  = editCursorRef.current
    const sn   = snapRef.current
    const tb   = totalBeatsRef.current
    const next = dir > 0
      ? Math.min(snapToGrid(cur.beat + sn, sn), tb - sn)
      : Math.max(0, snapToGrid(cur.beat - sn, sn))
    setEditCursor({ ...cur, beat: next })
    onCursorBeatChange(next)
  }, [isPlaying, setEditCursor, onCursorBeatChange])

  const doMoveString = useCallback((delta: number) => {
    if (isPlaying || !editCursorRef.current) return
    const cur  = editCursorRef.current
    const next = cur.stringIndex + delta
    if (next < 0 || next > 3) return
    setEditCursor({ ...cur, stringIndex: next as StringIndex })
  }, [isPlaying, setEditCursor])

  const doDismiss = useCallback(() => {
    clearTimeout(fretTimerRef.current!)
    setFretBuffer('')
    setEditCursor(null)
    onSelectNote(null)
  }, [setFretBuffer, setEditCursor, onSelectNote])

  // ── Keyboard handler ───────────────────────────────────────────────────────
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const tag = (e.target as HTMLElement).tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
    if (isPlaying) return
    const cursor = editCursorRef.current
    if (!cursor) return

    // ── Digit → accumulate fret ──
    if (/^\d$/.test(e.key)) {
      e.preventDefault()
      e.stopPropagation()
      clearTimeout(fretTimerRef.current!)

      const newBuf = fretBufferRef.current + e.key
      const num    = parseInt(newBuf)

      if (newBuf.length >= 2) {
        // Two digits — commit immediately
        commitFretRef.current(newBuf)
      } else if (num > 2) {
        // First digit > 2 (3-9): can't form a valid 2-digit fret ≤ 24,
        // so commit immediately (fret 3..9)
        commitFretRef.current(newBuf)
      } else {
        // First digit is 0,1, or 2 — wait briefly for possible second digit
        setFretBuffer(newBuf)
        fretTimerRef.current = setTimeout(() => {
          commitFretRef.current(fretBufferRef.current)
        }, 600)
      }
      return
    }

    // ── Enter / Tab → confirm ──
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      e.stopPropagation()
      const buf = fretBufferRef.current
      if (buf) {
        commitFretRef.current(buf)
      } else {
        // Advance cursor without placing a note (rest step)
        const sn = snapRef.current
        const tb = totalBeatsRef.current
        const next = Math.min(cursor.beat + noteDurationRef.current, tb - sn)
        setEditCursor({ ...cursor, beat: next })
        onCursorBeatChange(next)
      }
      return
    }

    // ── Backspace: clear buffer or delete note ──
    if (e.key === 'Backspace') {
      e.preventDefault()
      e.stopPropagation()
      const buf = fretBufferRef.current
      if (buf) {
        clearTimeout(fretTimerRef.current!)
        setFretBuffer(buf.slice(0, -1))
      } else {
        const ex = findNoteAtBeat(trackRef.current.notes, cursor.stringIndex, cursor.beat)
        if (ex) { onBeginEdit?.(); onDeleteNote(ex.id); onSelectNote(null) }
      }
      return
    }

    // ── Delete: delete note at cursor ──
    if (e.key === 'Delete') {
      e.preventDefault()
      e.stopPropagation()
      clearTimeout(fretTimerRef.current!)
      setFretBuffer('')
      const ex = findNoteAtBeat(trackRef.current.notes, cursor.stringIndex, cursor.beat)
      if (ex) { onBeginEdit?.(); onDeleteNote(ex.id); onSelectNote(null) }
      return
    }

    // ── Escape: dismiss cursor ──
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      clearTimeout(fretTimerRef.current!)
      setFretBuffer('')
      setEditCursor(null)
      onSelectNote(null)
      return
    }

    // ── Arrow Right: confirm buffer then advance ──
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      e.stopPropagation()
      clearTimeout(fretTimerRef.current!)
      if (fretBufferRef.current) {
        commitFretRef.current(fretBufferRef.current)
      } else {
        const sn   = snapRef.current
        const tb   = totalBeatsRef.current
        const next = Math.min(snapToGrid(cursor.beat + sn, sn), tb - sn)
        setEditCursor({ ...cursor, beat: next })
        onCursorBeatChange(next)
      }
      return
    }

    // ── Arrow Left: clear buffer or retreat ──
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      e.stopPropagation()
      clearTimeout(fretTimerRef.current!)
      if (fretBufferRef.current) {
        setFretBuffer('')
        return
      }
      const sn   = snapRef.current
      const prev = Math.max(0, snapToGrid(cursor.beat - sn, sn))
      setEditCursor({ ...cursor, beat: prev })
      onCursorBeatChange(prev)
      return
    }

    // ── Arrow Up / Down: change string ──
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      e.stopPropagation()
      if (cursor.stringIndex > 0)
        setEditCursor({ ...cursor, stringIndex: (cursor.stringIndex - 1) as StringIndex })
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      e.stopPropagation()
      if (cursor.stringIndex < 3)
        setEditCursor({ ...cursor, stringIndex: (cursor.stringIndex + 1) as StringIndex })
      return
    }
  }, [isPlaying, onBeginEdit, onDeleteNote, onSelectNote, onCursorBeatChange, setFretBuffer, setEditCursor])

  // ── Click on staff → set edit cursor ──────────────────────────────────────
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

    const beat = snapToGrid(Math.max(0, xToBeat(rawX, pxPerBeat)), SNAP)
    if (beat >= totalBeats) return

    const si = yToStringIndex(Math.max(0, Math.min(STAFF_H, staffY)))

    clearTimeout(fretTimerRef.current!)
    setFretBuffer('')
    setEditCursor({ beat, stringIndex: si })
    onCursorBeatChange(beat)
    containerRef.current?.focus()
  }, [isPlaying, svgW, svgH, pxPerBeat, totalBeats, onCursorBeatChange, setFretBuffer, setEditCursor])

  // ── Section name commit ────────────────────────────────────────────────────
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

  // ── SVG data ───────────────────────────────────────────────────────────────
  const stringPaths = useMemo(
    () => [0, 1, 2, 3].map(si => buildStringPath(si, track.notes, svgW, pxPerBeat)),
    [track.notes, svgW, pxPerBeat],
  )

  // Duration bars: horizontal bar from note right-edge to end of its duration
  const durationBars = useMemo(() => track.notes.map(note => {
    const cx    = beatToX(note.startBeat, pxPerBeat)
    const rw    = note.fret >= 10 ? 22 : 16
    const barX1 = cx + Math.max(NOTE_GAP / 2, rw / 2)
    const barX2 = beatToX(note.startBeat + note.durationBeats, pxPerBeat)
    const w     = barX2 - barX1
    if (w <= 1) return null
    const cy         = ABOVE_H + STRING_Y[note.stringIndex]
    const isSelected = note.id === selectedNoteId
    return (
      <rect
        key={`dur-${note.id}`}
        x={barX1} y={cy - 1}
        width={w} height={2}
        rx={1}
        fill={isSelected ? 'hsl(262 60% 62%)' : 'hsl(262 35% 38%)'}
        style={{ pointerEvents: 'none' }}
      />
    )
  }), [track.notes, pxPerBeat, selectedNoteId])

  const beatElements = useMemo(() => {
    const els: React.ReactNode[] = []
    const subDiv = 0.5
    for (let bar = 0; bar < track.totalBars; bar++) {
      for (let s = 0; s < track.beatsPerBar; s += subDiv) {
        const beat = bar * track.beatsPerBar + s
        const x    = beatToX(beat, pxPerBeat)
        els.push(
          <line key={`t-${bar}-${s}`}
            x1={x} x2={x}
            y1={ABOVE_H + STAFF_H + TICK_OFFSET}
            y2={ABOVE_H + STAFF_H + TICK_OFFSET + TICK_H}
            stroke="#383858" strokeWidth={1}
          />,
        )
      }
      const groups = computeBeamGroups(track.notes, bar, track.beatsPerBar, pxPerBeat)
      for (let gi = 0; gi < groups.length; gi++) {
        const { beamX1, beamX2, level } = groups[gi]
        els.push(
          <rect key={`b1-${bar}-${gi}`}
            x={beamX1} y={ABOVE_H + STAFF_H + TICK_OFFSET + TICK_H - 2}
            width={beamX2 - beamX1} height={2} fill="#383858"
          />,
        )
        if (level === 2) {
          els.push(
            <rect key={`b2-${bar}-${gi}`}
              x={beamX1} y={ABOVE_H + STAFF_H + TICK_OFFSET + TICK_H - 6}
              width={beamX2 - beamX1} height={2} fill="#383858"
            />,
          )
        }
      }
    }
    return els
  }, [track.notes, track.totalBars, track.beatsPerBar, pxPerBeat])

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
          const el = e.currentTarget as SVGTextElement
          const er = el.getBoundingClientRect()
          const cr = scrollRef.current!.getBoundingClientRect()
          setPendingSection({ startBar: sec.startBar, screenX: er.left - cr.left, screenY: er.top - cr.top })
          setSectionNameVal(sec.name)
          setTimeout(() => sectionInputRef.current?.focus(), 20)
        }}
      >
        {sec.name}
      </text>
    )
  }), [track.sections, track.beatsPerBar, pxPerBeat])

  // ── Edit cursor SVG element ────────────────────────────────────────────────
  const editCursorEl = useMemo(() => {
    if (!editCursor) return null
    const cx = beatToX(editCursor.beat, pxPerBeat)
    const cy = ABOVE_H + STRING_Y[editCursor.stringIndex]
    const rw = fretBuffer.length > 1 ? 24 : 16
    return (
      <g data-edit-cursor>
        {/* Highlight the entire column across all strings */}
        <rect
          x={cx - rw / 2} y={ABOVE_H - 4}
          width={rw} height={STAFF_H + 8}
          rx={2}
          fill="hsl(262 83% 58% / 0.06)"
        />
        {/* Active string cell */}
        <rect
          x={cx - rw / 2} y={cy - 8}
          width={rw} height={16}
          rx={2}
          fill="hsl(262 83% 58% / 0.18)"
          stroke="hsl(262 83% 58%)"
          strokeWidth={1.5}
          strokeDasharray={fretBuffer ? undefined : '4,3'}
        />
        {fretBuffer && (
          <text
            x={cx} y={cy + 4.5}
            textAnchor="middle" fontSize={9} fontWeight="bold"
            fill="hsl(262 80% 90%)"
            fontFamily="ui-monospace,'SF Mono',monospace"
            style={{ pointerEvents: 'none' }}
          >
            {fretBuffer}
          </text>
        )}
      </g>
    )
  }, [editCursor, fretBuffer, pxPerBeat])

  const activeBeat = isPlaying ? currentBeat : cursorBeat
  const cursorX    = beatToX(activeBeat, pxPerBeat)

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      style={{ flex: 1, outline: 'none', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
    >
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowX: fitWidth ? 'hidden' : 'auto',
          overflowY: 'hidden',
          position: 'relative',
          background: 'hsl(224 24% 8%)',
          minHeight: svgH,
        }}
      >
        <svg
          ref={svgRef}
          data-testid="tab-notation-svg"
          width={svgW} height={svgH}
          viewBox={`0 0 ${svgW} ${svgH}`}
          onPointerDown={handlePointerDown}
          style={{ display: 'block', cursor: isPlaying ? 'default' : 'crosshair', userSelect: 'none' }}
        >
          {header}
          {sectionEls}

          {/* ── Measure numbers ── */}
          {Array.from({ length: track.totalBars }, (_, bar) => (
            <text
              key={bar}
              x={barLineX(bar, track.beatsPerBar, pxPerBeat) + 4}
              y={ABOVE_H - 10}
              fontSize={9} fill="#404068" fontFamily="monospace"
              data-bar={bar}
              style={{ cursor: 'context-menu' }}
            >
              {bar + 1}
            </text>
          ))}

          {/* ── String labels ── */}
          {STRING_LABELS.map((label, i) => (
            <text key={label} x={6} y={ABOVE_H + STRING_Y[i] + 4}
              fontSize={10} fill="#505070" fontFamily="monospace">
              {label}
            </text>
          ))}

          {/* ── Bar lines ── */}
          {Array.from({ length: track.totalBars + 1 }, (_, bar) => {
            const x      = barLineX(bar, track.beatsPerBar, pxPerBeat)
            const isEdge = bar === 0 || bar === track.totalBars
            return (
              <line key={bar}
                x1={x} x2={x} y1={ABOVE_H} y2={ABOVE_H + STAFF_H}
                stroke={isEdge ? '#505078' : '#383858'}
                strokeWidth={isEdge ? 2 : 1}
              />
            )
          })}

          {/* ── String lines with gaps ── */}
          {stringPaths.map((d, si) => (
            <path key={si} d={d}
              transform={`translate(0,${ABOVE_H})`}
              stroke="#383858" strokeWidth={1} fill="none"
            />
          ))}

          {/* ── Duration bars (over string, behind notes) ── */}
          {durationBars}

          {/* ── Beat ticks + beams ── */}
          {beatElements}

          {/* ── Edit cursor (behind notes) ── */}
          {editCursorEl}

          {/* ── Fret numbers ── */}
          {track.notes.map(note => {
            const nx         = beatToX(note.startBeat, pxPerBeat)
            const ny         = ABOVE_H + STRING_Y[note.stringIndex]
            const isSelected = note.id === selectedNoteId
            const rw         = note.fret >= 10 ? 22 : 16
            const isCursorOn = editCursor?.beat === note.startBeat && editCursor?.stringIndex === note.stringIndex

            return (
              <g
                key={note.id}
                data-note-id={note.id}
                style={{ cursor: 'pointer' }}
                onPointerDown={e => {
                  e.stopPropagation()
                  clearTimeout(fretTimerRef.current!)
                  setFretBuffer('')
                  setEditCursor({ beat: note.startBeat, stringIndex: note.stringIndex })
                  onSelectNote(note.id)
                  previewNote(note.stringIndex, note.fret, sound)
                  onCursorBeatChange(note.startBeat)
                  containerRef.current?.focus()
                }}
              >
                <rect
                  x={nx - rw / 2} y={ny - 7}
                  width={rw} height={14} rx={2}
                  fill={isSelected ? 'hsl(262 83% 40%)' : isCursorOn ? 'hsl(262 60% 25%)' : 'hsl(224 24% 11%)'}
                  stroke={isSelected ? 'hsl(262 60% 68%)' : isCursorOn ? 'hsl(262 83% 58%)' : '#383858'}
                  strokeWidth={1}
                />
                <text
                  x={nx} y={ny + 4.5}
                  textAnchor="middle" fontSize={9} fontWeight="bold"
                  fill={isSelected ? '#e8deff' : '#b8b0d0'}
                  fontFamily="ui-monospace,'SF Mono',monospace"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {note.fret}
                </text>
              </g>
            )
          })}

          {/* ── Playback cursor ── */}
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
                width: 120, height: 22, padding: '0 6px', borderRadius: 4,
                border: '2px solid hsl(262 83% 58%)',
                background: 'hsl(224 20% 13%)',
                color: '#a0a0c8', fontFamily: 'monospace',
                fontSize: 10, fontWeight: 600, outline: 'none',
                boxShadow: '0 0 10px hsl(262 83% 58% / 0.35)',
              }}
            />
          </div>
        )}
      </div>

      {/* ── Edit cursor status bar ─────────────────────────────────────────── */}
      {editCursor && !isPlaying && (
        <div
          style={{
            flexShrink: 0, height: 28,
            background: 'hsl(224 20% 10%)',
            borderTop: '1px solid hsl(262 40% 20%)',
            display: 'flex', alignItems: 'center', gap: 20,
            paddingLeft: 16, paddingRight: 16,
            fontFamily: "ui-monospace,'SF Mono',monospace",
            fontSize: 11,
          }}
        >
          <span style={{ color: 'hsl(262 60% 75%)', fontWeight: 600 }}>
            {STRING_LABELS[editCursor.stringIndex]}
          </span>
          <span style={{ color: 'hsl(220 10% 50%)' }}>
            bar {Math.floor(editCursor.beat / track.beatsPerBar) + 1}
            {' · '}
            beat {(editCursor.beat % track.beatsPerBar + 1).toFixed(editCursor.beat % 1 === 0 ? 0 : 2)}
          </span>
          {fretBuffer
            ? <span style={{ color: 'hsl(220 14% 80%)' }}>fret: <strong style={{ color: 'white', fontSize: 13 }}>{fretBuffer}</strong>_</span>
            : <span style={{ color: 'hsl(224 15% 32%)' }}>{isMobile ? 'toca un traste ↓' : 'type fret · ←→ move · ↑↓ string · Del delete'}</span>
          }
        </div>
      )}

      {/* ── Mobile numpad ──────────────────────────────────────────────────── */}
      {isMobile && editCursor && !isPlaying && (
        <div style={{ flexShrink: 0, background: 'hsl(224 20% 9%)', borderTop: '1px solid hsl(224 15% 16%)' }}>

          {/* Row 1: string selector · beat nav · backspace · dismiss */}
          <div style={{ display: 'flex', gap: 3, padding: '4px 4px 2px' }}>
            {STRING_LABELS.map((label, si) => (
              <NpadBtn
                key={label}
                active={editCursor.stringIndex === si}
                onPress={() => doMoveString(si - editCursor.stringIndex)}
              >
                {label}
              </NpadBtn>
            ))}
            <div style={{ flex: 1 }} />
            <NpadBtn onPress={() => doMoveBeat(-1)}>←</NpadBtn>
            <NpadBtn onPress={() => doMoveBeat(1)}>→</NpadBtn>
            <div style={{ flex: 1 }} />
            <NpadBtn onPress={doBackspace}>⌫</NpadBtn>
            <NpadBtn onPress={doDismiss} danger>✕</NpadBtn>
          </div>

          {/* Row 2: digits · delete · confirm */}
          <div style={{ display: 'flex', gap: 3, padding: '2px 4px 6px' }}>
            {['1','2','3','4','5','6','7','8','9','0'].map(d => (
              <NpadBtn key={d} onPress={() => doAppendDigit(d)}>{d}</NpadBtn>
            ))}
            <NpadBtn onPress={doDelete} danger>Del</NpadBtn>
            <NpadBtn onPress={doConfirm} confirm>✓</NpadBtn>
          </div>
        </div>
      )}
    </div>
  )
}

// ── NpadBtn — touch-optimised numpad button ────────────────────────────────
function NpadBtn({
  children, onPress, active, danger, confirm,
}: {
  children: React.ReactNode
  onPress: () => void
  active?: boolean
  danger?: boolean
  confirm?: boolean
}) {
  return (
    <button
      onPointerDown={e => { e.preventDefault(); onPress() }}
      style={{
        flex: 1, minWidth: 0, height: 42,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: confirm ? 'hsl(262 50% 28%)'
          : active  ? 'hsl(262 40% 22%)'
          : 'hsl(224 18% 15%)',
        border: `1px solid ${
          confirm ? 'hsl(262 60% 45%)'
          : active  ? 'hsl(262 40% 35%)'
          : 'hsl(224 15% 22%)'}`,
        borderRadius: 7,
        color: confirm ? 'hsl(262 80% 88%)'
          : danger  ? 'hsl(0 72% 65%)'
          : active  ? 'hsl(262 80% 85%)'
          : 'hsl(220 10% 68%)',
        fontSize: 15,
        fontFamily: "'Inter', ui-sans-serif, sans-serif",
        fontWeight: active || confirm ? 600 : 400,
        cursor: 'pointer',
        touchAction: 'manipulation',
        userSelect: 'none',
        WebkitTapHighlightColor: 'transparent',
        transition: 'background 0.06s',
      }}
    >
      {children}
    </button>
  )
}
