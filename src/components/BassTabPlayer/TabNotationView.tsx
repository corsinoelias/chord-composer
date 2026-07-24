import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import {
  type BassNote, type BassTrack, type StringIndex,
  type BassSound, type TrackSection,
} from '../../lib/bassTab/types'
import {
  STRING_Y, LABEL_W, PPB,
  beatToX, barLineX, xToBeat, yToStringIndex, svgTotalWidth,
} from '../../lib/bassTab/tabNotation'
import { snapToGrid, findNoteAtBeat, clampDuration } from '../../lib/bassTab/bassTheory'
import { previewNote } from '../../lib/bassTab/bassAudio'
import { useIsMobile } from '../../hooks/use-mobile'
import { computeNotatedNotes } from '../../lib/bassTab/notationPipeline'
import { NOTATION } from '../../lib/bassTab/notationTheory'
// Self-hosted via the @vexflow-fonts/bravura package (SIL OFL license) so this
// loads from 'self' — the site's CSP font-src doesn't allow third-party CDNs,
// and this used to be fetched from cdn.jsdelivr.net, which the CSP silently
// blocked (the clef/time-signature glyphs just never rendered).
import bravuraFontUrl from '@vexflow-fonts/bravura/bravura.woff2?url'

// ── Layout constants ──────────────────────────────────────────────────────
const NOTA_ORIGIN_Y   = 6                              // top of notation band
const TAB_SEP         = 4                              // gap between notation bottom and tab strings
const TAB_SPACING     = 12                             // matches STRING_Y in tabNotation.ts
const TAB_AREA_Y      = NOTA_ORIGIN_Y + NOTATION.totalH + TAB_SEP
const TAB_AREA_H      = TAB_SPACING * 3 + 20
const TOTAL_H         = TAB_AREA_Y + TAB_AREA_H

const TAB_OVERLAY_Y       = TAB_AREA_Y
const TAB_OVERLAY_STAFF_H = TAB_SPACING * 3   // 36px

const NW = NOTATION.lineSpacing * 0.72   // notehead half-width  ≈ 5.8
const NH = NOTATION.lineSpacing * 0.52   // notehead half-height ≈ 4.2
const BEAM_THICK = NOTATION.lineSpacing * 0.5

const STRING_LABELS = ['G', 'D', 'A', 'E']

// ── Types ─────────────────────────────────────────────────────────────────
interface EditCursor { beat: number; stringIndex: StringIndex }

export interface TabNotationViewProps {
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
  fitWidth?: boolean
  barView?: boolean
  visibleBars?: number
  onFitZoomChange?: (z: number) => void
}

// ── Component ─────────────────────────────────────────────────────────────
const SNAP = 0.25

export function TabNotationView({
  track, zoom, currentBeat, cursorBeat, isPlaying,
  selectedNoteId, sound, noteDuration,
  onAddNote, onUpdateNote, onDeleteNote, onSelectNote,
  onCursorBeatChange, onBeginEdit, onSectionChange,
  fitWidth = false, barView = false, visibleBars, onFitZoomChange,
}: TabNotationViewProps) {
  const isMobile         = useIsMobile()
  const containerRef     = useRef<HTMLDivElement>(null)
  const scrollRef        = useRef<HTMLDivElement>(null)
  const overlaySvgRef    = useRef<SVGSVGElement>(null)
  const sectionInputRef  = useRef<HTMLInputElement>(null)
  const fretTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [editCursor, setEditCursorState]   = useState<EditCursor | null>(null)
  const [fretBuffer, setFretBufferState]   = useState('')
  const editCursorRef  = useRef<EditCursor | null>(null)
  const fretBufferRef  = useRef('')
  const [pendingSection, setPendingSection] = useState<{ startBar: number; screenX: number; screenY: number } | null>(null)
  const [sectionNameVal, setSectionNameVal] = useState('')

  const setEditCursor = useCallback((v: EditCursor | null) => {
    editCursorRef.current = v; setEditCursorState(v)
  }, [])
  const setFretBuffer = useCallback((v: string) => {
    fretBufferRef.current = v; setFretBufferState(v)
  }, [])

  const trackRef        = useRef(track)
  const noteDurationRef = useRef(noteDuration)
  const snapRef         = useRef(SNAP)
  const soundRef        = useRef(sound)
  const totalBeatsRef   = useRef(track.totalBars * track.beatsPerBar)
  useEffect(() => { trackRef.current = track }, [track])
  useEffect(() => { noteDurationRef.current = noteDuration }, [noteDuration])
  useEffect(() => { soundRef.current = sound }, [sound])
  useEffect(() => { totalBeatsRef.current = track.totalBars * track.beatsPerBar }, [track.totalBars, track.beatsPerBar])

  // ── Fit-to-width ──────────────────────────────────────────────────────
  const [containerW, setContainerW] = useState(0)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(es => setContainerW(es[0].contentRect.width))
    ro.observe(el)
    setContainerW(el.getBoundingClientRect().width)
    return () => ro.disconnect()
  }, [])

  const totalBeats    = track.totalBars * track.beatsPerBar
  const fitZoom       = fitWidth && containerW > 0 && totalBeats > 0
    ? Math.max(0.2, (containerW - LABEL_W) / (totalBeats * PPB))
    : null
  const barViewZoom    = barView && containerW > 0 && track.beatsPerBar > 0
    ? Math.max(0.2, (containerW - LABEL_W) / (track.beatsPerBar * PPB))
    : null
  const visibleBarsZoom = visibleBars && containerW > 0 && track.beatsPerBar > 0
    ? Math.max(0.2, (containerW - LABEL_W) / (visibleBars * track.beatsPerBar * PPB))
    : null
  const effectiveZoom = barViewZoom ?? visibleBarsZoom ?? fitZoom ?? zoom
  const pxPerBeat     = PPB * effectiveZoom
  const svgW          = svgTotalWidth(track.totalBars, track.beatsPerBar, pxPerBeat)

  useEffect(() => { if (fitZoom !== null) onFitZoomChange?.(fitZoom) }, [fitZoom, onFitZoomChange])

  // ── Custom notation pipeline ──────────────────────────────────────────
  const notated = useMemo(
    () => computeNotatedNotes(track, pxPerBeat, NOTA_ORIGIN_Y),
    [track, pxPerBeat],
  )

  // ── Auto-scroll ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!scrollRef.current) return
    if (barView) {
      const bar = Math.floor(currentBeat / track.beatsPerBar)
      scrollRef.current.scrollLeft = bar * track.beatsPerBar * pxPerBeat
      return
    }
    if (!isPlaying) return
    const el = scrollRef.current
    const px = beatToX(currentBeat, pxPerBeat)
    const w  = el.clientWidth
    if (px > el.scrollLeft + w * 0.7) el.scrollLeft = px - w * 0.3
    else if (px < el.scrollLeft)       el.scrollLeft = Math.max(0, px - 20)
  }, [currentBeat, isPlaying, pxPerBeat, barView, track.beatsPerBar])

  useEffect(() => {
    if (!editCursor || !scrollRef.current) return
    const el = scrollRef.current
    const px = beatToX(editCursor.beat, pxPerBeat)
    const w  = el.clientWidth
    if (px > el.scrollLeft + w * 0.8) el.scrollLeft = px - w * 0.4
    else if (px < el.scrollLeft + 40)  el.scrollLeft = Math.max(0, px - 60)
  }, [editCursor, pxPerBeat])

  // ── Fret commit ────────────────────────────────────────────────────────
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
      onBeginEdit?.(); onUpdateNote(existing.id, { fret }); onSelectNote(existing.id)
      previewNote(cursor.stringIndex, fret, snd)
    } else {
      const safeDur = clampDuration(notes, cursor.stringIndex, cursor.beat, nd, tb)
      if (safeDur <= 0) return
      onBeginEdit?.()
      const note: BassNote = { id: crypto.randomUUID(), stringIndex: cursor.stringIndex, fret, startBeat: cursor.beat, durationBeats: safeDur, velocity: 0.8 }
      onAddNote(note); onSelectNote(note.id)
      previewNote(cursor.stringIndex, fret, snd)
    }
    const next = Math.min(cursor.beat + nd, tb - sn)
    setEditCursor({ ...cursor, beat: next }); onCursorBeatChange(next)
  }, [onBeginEdit, onUpdateNote, onAddNote, onSelectNote, onCursorBeatChange, setFretBuffer, setEditCursor])

  const commitFretRef = useRef(commitFret)
  useEffect(() => { commitFretRef.current = commitFret }, [commitFret])

  // ── Edit actions ──────────────────────────────────────────────────────
  const doAppendDigit = useCallback((digit: string) => {
    if (isPlaying || !editCursorRef.current) return
    clearTimeout(fretTimerRef.current!)
    const newBuf = fretBufferRef.current + digit
    const num    = parseInt(newBuf)
    if (newBuf.length >= 2 || num > 2) { commitFretRef.current(newBuf) }
    else {
      setFretBuffer(newBuf)
      fretTimerRef.current = setTimeout(() => commitFretRef.current(fretBufferRef.current), 600)
    }
  }, [isPlaying, setFretBuffer])

  const doBackspace = useCallback(() => {
    if (isPlaying || !editCursorRef.current) return
    clearTimeout(fretTimerRef.current!)
    const buf = fretBufferRef.current
    if (buf) { setFretBuffer(buf.slice(0, -1)) }
    else {
      const cur = editCursorRef.current
      const ex  = findNoteAtBeat(trackRef.current.notes, cur.stringIndex, cur.beat)
      if (ex) { onBeginEdit?.(); onDeleteNote(ex.id); onSelectNote(null) }
    }
  }, [isPlaying, setFretBuffer, onBeginEdit, onDeleteNote, onSelectNote])

  const doDelete = useCallback(() => {
    if (isPlaying || !editCursorRef.current) return
    clearTimeout(fretTimerRef.current!); setFretBuffer('')
    const cur = editCursorRef.current
    const ex  = findNoteAtBeat(trackRef.current.notes, cur.stringIndex, cur.beat)
    if (ex) { onBeginEdit?.(); onDeleteNote(ex.id); onSelectNote(null) }
  }, [isPlaying, setFretBuffer, onBeginEdit, onDeleteNote, onSelectNote])

  const doConfirm = useCallback(() => {
    if (isPlaying || !editCursorRef.current) return
    if (fretBufferRef.current) { commitFretRef.current(fretBufferRef.current) }
    else {
      const cur  = editCursorRef.current
      const next = Math.min(cur.beat + noteDurationRef.current, totalBeatsRef.current - snapRef.current)
      setEditCursor({ ...cur, beat: next }); onCursorBeatChange(next)
    }
  }, [isPlaying, setEditCursor, onCursorBeatChange])

  const doMoveBeat = useCallback((dir: 1 | -1) => {
    if (isPlaying || !editCursorRef.current) return
    clearTimeout(fretTimerRef.current!)
    if (fretBufferRef.current) { commitFretRef.current(fretBufferRef.current); return }
    const cur  = editCursorRef.current
    const next = dir > 0
      ? Math.min(snapToGrid(cur.beat + snapRef.current, snapRef.current), totalBeatsRef.current - snapRef.current)
      : Math.max(0, snapToGrid(cur.beat - snapRef.current, snapRef.current))
    setEditCursor({ ...cur, beat: next }); onCursorBeatChange(next)
  }, [isPlaying, setEditCursor, onCursorBeatChange])

  const doMoveString = useCallback((delta: number) => {
    if (isPlaying || !editCursorRef.current) return
    const cur  = editCursorRef.current
    const next = cur.stringIndex + delta
    if (next < 0 || next > 3) return
    setEditCursor({ ...cur, stringIndex: next as StringIndex })
  }, [isPlaying, setEditCursor])

  const doDismiss = useCallback(() => {
    clearTimeout(fretTimerRef.current!); setFretBuffer(''); setEditCursor(null); onSelectNote(null)
  }, [setFretBuffer, setEditCursor, onSelectNote])

  // ── Keyboard ──────────────────────────────────────────────────────────
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const tag = (e.target as HTMLElement).tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
    if (isPlaying) return
    if (!editCursorRef.current) return
    if (/^\d$/.test(e.key)) {
      e.preventDefault(); e.stopPropagation()
      clearTimeout(fretTimerRef.current!)
      const newBuf = fretBufferRef.current + e.key
      if (newBuf.length >= 2 || parseInt(newBuf) > 2) { commitFretRef.current(newBuf) }
      else {
        setFretBuffer(newBuf)
        fretTimerRef.current = setTimeout(() => commitFretRef.current(fretBufferRef.current), 600)
      }
      return
    }
    if (e.key === 'Enter' || e.key === 'Tab')   { e.preventDefault(); e.stopPropagation(); doConfirm(); return }
    if (e.key === 'Backspace')  { e.preventDefault(); e.stopPropagation(); doBackspace(); return }
    if (e.key === 'Delete')     { e.preventDefault(); e.stopPropagation(); doDelete(); return }
    if (e.key === 'Escape')     { e.preventDefault(); e.stopPropagation(); doDismiss(); return }
    if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); doMoveBeat(1); return }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); e.stopPropagation(); doMoveBeat(-1); return }
    if (e.key === 'ArrowUp')    { e.preventDefault(); e.stopPropagation(); doMoveString(-1); return }
    if (e.key === 'ArrowDown')  { e.preventDefault(); e.stopPropagation(); doMoveString(1); return }
  }, [isPlaying, doConfirm, doBackspace, doDelete, doDismiss, doMoveBeat, doMoveString, setFretBuffer])

  // ── Click on overlay SVG → set edit cursor ───────────────────────────
  const handleOverlayPointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (isPlaying) return
    const target = e.target as SVGElement
    if (target.closest('[data-note-target]')) return

    const rect   = overlaySvgRef.current!.getBoundingClientRect()
    const scaleX = svgW / rect.width
    const scaleY = TOTAL_H / rect.height
    const rawX   = (e.clientX - rect.left) * scaleX
    const rawY   = (e.clientY - rect.top)  * scaleY

    // Only handle clicks in TAB string zone
    const tabRawY = rawY - TAB_OVERLAY_Y
    if (tabRawY < -10 || tabRawY > TAB_OVERLAY_STAFF_H + 10) return

    const beat = snapToGrid(Math.max(0, xToBeat(rawX, pxPerBeat)), SNAP)
    if (beat >= totalBeats) return
    const si = yToStringIndex(Math.max(0, Math.min(TAB_OVERLAY_STAFF_H, tabRawY)))

    clearTimeout(fretTimerRef.current!); setFretBuffer('')
    setEditCursor({ beat, stringIndex: si }); onCursorBeatChange(beat)
    containerRef.current?.focus()
  }, [isPlaying, svgW, pxPerBeat, totalBeats, onCursorBeatChange, setFretBuffer, setEditCursor])

  // ── Note click on overlay ─────────────────────────────────────────────
  const handleNoteClick = useCallback((note: BassNote) => (e: React.PointerEvent) => {
    e.stopPropagation()
    clearTimeout(fretTimerRef.current!); setFretBuffer('')
    setEditCursor({ beat: note.startBeat, stringIndex: note.stringIndex })
    onSelectNote(note.id); previewNote(note.stringIndex, note.fret, sound)
    onCursorBeatChange(note.startBeat); containerRef.current?.focus()
  }, [setFretBuffer, setEditCursor, onSelectNote, sound, onCursorBeatChange])

  // ── Section commit ────────────────────────────────────────────────────
  const commitSection = useCallback(() => {
    if (!pendingSection) return
    const name = sectionNameVal.trim(); setPendingSection(null)
    if (!name || !onSectionChange) return
    const sections = [...(track.sections ?? [])]
    const idx = sections.findIndex(s => s.startBar === pendingSection.startBar)
    if (idx >= 0) sections[idx] = { ...sections[idx], name }
    else { sections.push({ name, startBar: pendingSection.startBar }); sections.sort((a, b) => a.startBar - b.startBar) }
    onSectionChange(sections)
  }, [pendingSection, sectionNameVal, track.sections, onSectionChange])

  const activeBeat = isPlaying ? currentBeat : cursorBeat
  const cursorX    = beatToX(activeBeat, pxPerBeat)
  const cursorY1   = 3
  const cursorY2   = TOTAL_H - 3

  // Pre-build active/selected note color map
  const noteColorMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const n of track.notes) {
      const isActive   = currentBeat >= n.startBeat && currentBeat < n.startBeat + n.durationBeats
      const isSelected = n.id === selectedNoteId
      m.set(n.id, isActive ? '#4ade80' : isSelected ? 'var(--bt-accent)' : 'var(--bt-ink)')
    }
    return m
  }, [track.notes, currentBeat, selectedNoteId])

  const noteLineColor = 'var(--bt-soft)'
  const staffLineColor = 'var(--bt-dim)'
  const beamColor     = 'var(--bt-muted)'

  // ── Render ────────────────────────────────────────────────────────────
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
          flex: 1, overflowX: fitWidth || barView || visibleBars ? 'hidden' : 'auto', overflowY: 'hidden',
          // Sin fondo propio: la tarjeta que envuelve el lienzo pone el papel.
          position: 'relative', background: 'transparent',
          minHeight: TOTAL_H,
        }}
      >

        {/* ── Single SVG: notation + TAB ── */}
        <svg
          ref={overlaySvgRef}
          width={svgW}
          height={TOTAL_H}
          viewBox={`0 0 ${svgW} ${TOTAL_H}`}
          onPointerDown={handleOverlayPointerDown}
          style={{
            position: 'relative', display: 'block',
            cursor: isPlaying ? 'default' : 'crosshair',
            userSelect: 'none',
          }}
        >
          {/* ── Notation staff lines ── */}
          {[0,1,2,3,4].map(line => {
            const ly = NOTA_ORIGIN_Y + NOTATION.lineToY(line)
            return <line key={`sl${line}`} x1={LABEL_W} x2={svgW} y1={ly} y2={ly}
              stroke={staffLineColor} strokeWidth={0.8} style={{ pointerEvents: 'none' }} />
          })}

          {/* ── System bar lines: span notation top → TAB bottom ── */}
          {Array.from({ length: track.totalBars + 1 }, (_, bar) => {
            const bx = barLineX(bar, track.beatsPerBar, pxPerBeat)
            const y1 = NOTA_ORIGIN_Y + NOTATION.lineToY(4)
            const y2 = TAB_OVERLAY_Y + TAB_OVERLAY_STAFF_H
            const thick = bar === 0 || bar === track.totalBars
            return <line key={`sbl${bar}`} x1={bx} x2={bx} y1={y1} y2={y2}
              stroke={staffLineColor} strokeWidth={thick ? 1.4 : 0.7}
              style={{ pointerEvents: 'none' }} />
          })}

          {/* ── Left system bracket ── */}
          {(() => {
            const bracketX = LABEL_W - 1
            const y1 = NOTA_ORIGIN_Y + NOTATION.lineToY(4)
            const y2 = TAB_OVERLAY_Y + TAB_OVERLAY_STAFF_H
            return (
              <>
                <line x1={bracketX} y1={y1} x2={bracketX} y2={y2}
                  stroke={staffLineColor} strokeWidth={1.8} style={{ pointerEvents: 'none' }} />
                <line x1={bracketX - 4} y1={y1} x2={bracketX + 1} y2={y1}
                  stroke={staffLineColor} strokeWidth={1.8} style={{ pointerEvents: 'none' }} />
                <line x1={bracketX - 4} y1={y2} x2={bracketX + 1} y2={y2}
                  stroke={staffLineColor} strokeWidth={1.8} style={{ pointerEvents: 'none' }} />
              </>
            )
          })()}


          {/* ── Bass clef + time signature (label area x=0..LABEL_W) ── */}
          {/* Bravura = same music font VexFlow loads. U+E062=fClef, U+E080-E089=timeSig digits */}
          {(() => {
            const ls  = NOTATION.lineSpacing   // 8
            const yLn = (line: number) => NOTA_ORIGIN_Y + NOTATION.lineToY(line)
            const yF  = yLn(3)   // F2 line — SMuFL F-clef reference point

            return (
              <>
                <defs>
                  <style>{`@font-face{font-family:'Bravura';src:url('${bravuraFontUrl}') format('woff2');font-display:block}`}</style>
                </defs>
                <g style={{ pointerEvents: 'none' }}>
                  {/* F-clef — SMuFL U+E062, origin = F2 line */}
                  <text x={2} y={yF}
                    fontFamily="Bravura, serif" fontSize={ls * 4}
                    fill={staffLineColor}>
                    {String.fromCodePoint(0xE062)}
                  </text>
                  {/* Time signature: SMuFL digits U+E080-E089 */}
                  <text x={40} y={yF}
                    fontFamily="Bravura, serif" fontSize={ls * 2.5}
                    textAnchor="middle" dominantBaseline="middle"
                    fill={staffLineColor}>
                    {String.fromCodePoint(0xE080 + track.beatsPerBar)}
                  </text>
                  <text x={40} y={yLn(1)}
                    fontFamily="Bravura, serif" fontSize={ls * 2.5}
                    textAnchor="middle" dominantBaseline="middle"
                    fill={staffLineColor}>
                    {String.fromCodePoint(0xE084)}
                  </text>
                </g>
              </>
            )
          })()}

          {/* ── Notation notes ── */}
          {notated.notes.map(nn => {
            const color = noteColorMap.get(nn.noteId) ?? 'var(--bt-ink)'
            const stemColor = nn.beamGroupId !== null ? beamColor : color
            return (
              <g key={`nn-${nn.noteId}`} style={{ pointerEvents: 'none' }}>
                {/* Ledger lines */}
                {nn.ledgerLines.map(ll => {
                  const lly = NOTA_ORIGIN_Y + NOTATION.lineToY(ll)
                  return <line key={ll} x1={nn.x - NW * 2} x2={nn.x + NW * 2}
                    y1={lly} y2={lly} stroke={color} strokeWidth={0.9} />
                })}

                {/* Accidental */}
                {nn.accidental === '#' && (
                  <text x={nn.x - NW * 2.4} y={nn.noteY + NH + 1}
                    fontSize={NOTATION.lineSpacing * 1.5} fontFamily="var(--bt-mono)"
                    fill={color} textAnchor="middle"
                    style={{ pointerEvents: 'none' }}>
                    ♯
                  </text>
                )}

                {/* Note head */}
                <ellipse cx={nn.x} cy={nn.noteY} rx={NW} ry={NH}
                  fill={nn.head.filled ? color : 'none'}
                  stroke={color} strokeWidth={nn.head.filled ? 0 : 1.3}
                />

                {/* Stem */}
                {nn.head.hasStem && (
                  <line x1={nn.stemX} y1={nn.noteY} x2={nn.stemX} y2={nn.stemTipY}
                    stroke={stemColor} strokeWidth={1.2} />
                )}

                {/* Flag for un-beamed 8th/16th */}
                {nn.head.beamLevel >= 1 && nn.beamGroupId === null && (
                  <path
                    d={nn.stemDir === 'up'
                      ? `M ${nn.stemX} ${nn.stemTipY} C ${nn.stemX+9} ${nn.stemTipY+5} ${nn.stemX+7} ${nn.stemTipY+14} ${nn.stemX+3} ${nn.stemTipY+18}`
                      : `M ${nn.stemX} ${nn.stemTipY} C ${nn.stemX-9} ${nn.stemTipY-5} ${nn.stemX-7} ${nn.stemTipY-14} ${nn.stemX-3} ${nn.stemTipY-18}`
                    }
                    fill="none" stroke={color} strokeWidth={1.3}
                  />
                )}
                {nn.head.beamLevel === 2 && nn.beamGroupId === null && (
                  <path
                    d={nn.stemDir === 'up'
                      ? `M ${nn.stemX} ${nn.stemTipY+8} C ${nn.stemX+9} ${nn.stemTipY+13} ${nn.stemX+7} ${nn.stemTipY+22} ${nn.stemX+3} ${nn.stemTipY+26}`
                      : `M ${nn.stemX} ${nn.stemTipY-8} C ${nn.stemX-9} ${nn.stemTipY-13} ${nn.stemX-7} ${nn.stemTipY-22} ${nn.stemX-3} ${nn.stemTipY-26}`
                    }
                    fill="none" stroke={color} strokeWidth={1.3}
                  />
                )}

                {/* Dot */}
                {nn.head.dotted && (
                  <circle cx={nn.x + NW * 1.9} cy={nn.noteY - NH * 0.4} r={1.6} fill={color} />
                )}
              </g>
            )
          })}

          {/* ── Beams ── */}
          {notated.beams.map(beam => {
            const dir = beam.dir === 'up' ? -1 : 1
            return (
              <g key={`beam-${beam.id}`} style={{ pointerEvents: 'none' }}>
                <line x1={beam.x1} y1={beam.y1} x2={beam.x2} y2={beam.y2}
                  stroke={beamColor} strokeWidth={BEAM_THICK} strokeLinecap="round" />
                {beam.level === 2 && (
                  <line x1={beam.x1} y1={beam.y1 + dir * (BEAM_THICK + 2)} x2={beam.x2} y2={beam.y2 + dir * (BEAM_THICK + 2)}
                    stroke={beamColor} strokeWidth={BEAM_THICK} strokeLinecap="round" />
                )}
              </g>
            )
          })}

          {/* ── TAB stave ── */}
          {/* String lines */}
          {[0,1,2,3].map(si => {
            const ly = TAB_OVERLAY_Y + STRING_Y[si]
            return <line key={si} x1={LABEL_W} x2={svgW} y1={ly} y2={ly}
              stroke="var(--bt-muted)" strokeWidth={0.9} style={{ pointerEvents: 'none' }} />
          })}
          {/* Bar lines handled by system bar lines above */}
          {/* T·A·B label */}
          {['T','A','B'].map((c, i) => (
            <text key={c} x={LABEL_W / 2} y={TAB_OVERLAY_Y + i * TAB_SPACING * (3/2) + TAB_SPACING / 2}
              textAnchor="middle" dominantBaseline="middle"
              fontSize={8} fontWeight="bold" fontFamily="var(--bt-mono)"
              fill="var(--bt-muted)" style={{ pointerEvents: 'none' }}>
              {c}
            </text>
          ))}
          {/* Fret numbers */}
          {track.notes.map(note => {
            const x   = beatToX(note.startBeat, pxPerBeat)
            const y   = TAB_OVERLAY_Y + STRING_Y[note.stringIndex]
            const isActive   = currentBeat >= note.startBeat && currentBeat < note.startBeat + note.durationBeats
            const isSelected = note.id === selectedNoteId
            const numColor = isActive
              ? ['#4ade80','#fbbf24','#f87171','#60a5fa'][note.stringIndex]
              : isSelected ? 'var(--bt-accent)' : 'var(--bt-ink)'
            const gapW = note.fret >= 10 ? 16 : 12
            return (
              <g key={`tab-${note.id}`} style={{ pointerEvents: 'none' }}>
                <line x1={x - gapW} x2={x + gapW} y1={y} y2={y}
                  stroke="var(--bt-paper)" strokeWidth={2.5} />
                <text x={x} y={y} textAnchor="middle" dominantBaseline="middle"
                  fontSize={11} fontWeight="bold" fontFamily="var(--bt-mono)"
                  fill={numColor}>
                  {note.fret}
                </text>
              </g>
            )
          })}

          {/* Invisible hit targets for each note (TAB area) */}
          {track.notes.map(note => {
            const nx  = beatToX(note.startBeat, pxPerBeat)
            const ny  = TAB_OVERLAY_Y + STRING_Y[note.stringIndex]
            const rw  = note.fret >= 10 ? 24 : 18
            return (
              <rect key={note.id}
                data-note-target="1"
                x={nx - rw / 2} y={ny - 9} width={rw} height={18}
                fill="transparent"
                style={{ cursor: 'pointer' }}
                onPointerDown={handleNoteClick(note)}
              />
            )
          })}

          {/* Edit cursor (TAB zone) */}
          {editCursor && (() => {
            const cx = beatToX(editCursor.beat, pxPerBeat)
            const cy = TAB_OVERLAY_Y + STRING_Y[editCursor.stringIndex]
            const rw = fretBuffer.length > 1 ? 26 : 18
            return (
              <g>
                <rect x={cx - rw / 2} y={TAB_OVERLAY_Y - 3} width={rw}
                  height={TAB_OVERLAY_STAFF_H + 6} rx={2}
                  fill="var(--bt-accent-wash)" style={{ pointerEvents: 'none' }} />
                <rect x={cx - rw / 2} y={cy - 9} width={rw} height={18} rx={3}
                  fill="var(--bt-accent-wash)"
                  stroke="var(--bt-accent)" strokeWidth={1.5}
                  strokeDasharray={fretBuffer ? undefined : '4,3'}
                  style={{ pointerEvents: 'none' }} />
                {fretBuffer && (
                  <text x={cx} y={cy + 5} textAnchor="middle" fontSize={10} fontWeight="bold"
                    fill="var(--bt-accent)" fontFamily="var(--bt-mono)"
                    style={{ pointerEvents: 'none' }}>
                    {fretBuffer}
                  </text>
                )}
              </g>
            )
          })()}

          {/* Playback / edit cursor line */}
          <line
            x1={cursorX} x2={cursorX} y1={cursorY1} y2={cursorY2}
            stroke={isPlaying ? 'var(--bt-accent)' : 'var(--bt-accent)'}
            strokeWidth={isPlaying ? 1.5 : 1}
            style={{ pointerEvents: 'none' }}
          />
          <polygon
            points={`${cursorX - 5},${cursorY1} ${cursorX + 5},${cursorY1} ${cursorX},${cursorY1 + 9}`}
            fill={isPlaying ? 'var(--bt-accent)' : 'var(--bt-accent)'}
            style={{ pointerEvents: 'none' }}
          />

          {/* Section labels */}
          {(track.sections ?? []).map(sec => {
            const x = barLineX(sec.startBar, track.beatsPerBar, pxPerBeat) + 2
            return (
              <text key={sec.startBar} x={x} y={8}
                fontSize={10} fontWeight={600} fill="var(--bt-muted)" fontFamily="var(--bt-mono)"
                style={{ cursor: 'pointer', userSelect: 'none' }}
                onDoubleClick={e => {
                  e.stopPropagation()
                  const er = (e.currentTarget as SVGTextElement).getBoundingClientRect()
                  const cr = scrollRef.current!.getBoundingClientRect()
                  setPendingSection({ startBar: sec.startBar, screenX: er.left - cr.left, screenY: er.top - cr.top })
                  setSectionNameVal(sec.name)
                  setTimeout(() => sectionInputRef.current?.focus(), 20)
                }}
              >
                {sec.name}
              </text>
            )
          })}
        </svg>

        {/* Section name input overlay */}
        {pendingSection && (
          <div style={{ position: 'absolute', left: pendingSection.screenX, top: pendingSection.screenY - 4, zIndex: 200 }}>
            <input
              ref={sectionInputRef} type="text" maxLength={32}
              value={sectionNameVal} placeholder="Section name"
              onChange={e => setSectionNameVal(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter')  { e.preventDefault(); commitSection() }
                if (e.key === 'Escape') { e.preventDefault(); setPendingSection(null) }
              }}
              onBlur={commitSection}
              style={{ width: 120, height: 22, padding: '0 6px', borderRadius: 4, border: '2px solid var(--bt-accent)', background: 'var(--bt-rule)', color: 'var(--bt-soft)', fontFamily: 'var(--bt-mono)', fontSize: 10, fontWeight: 600, outline: 'none' }}
            />
          </div>
        )}
      </div>

      {/* Edit cursor status bar */}
      {editCursor && !isPlaying && (
        <div style={{ flexShrink: 0, height: 28, background: 'var(--bt-sunken)', borderTop: '1px solid var(--bt-accent-wash)', display: 'flex', alignItems: 'center', gap: 20, paddingLeft: 16, paddingRight: 16, fontFamily: 'var(--bt-mono)', fontSize: 11 }}>
          <span style={{ color: 'var(--bt-accent)', fontWeight: 600 }}>{STRING_LABELS[editCursor.stringIndex]}</span>
          <span style={{ color: 'var(--bt-soft)' }}>
            bar {Math.floor(editCursor.beat / track.beatsPerBar) + 1} · beat {(editCursor.beat % track.beatsPerBar + 1).toFixed(editCursor.beat % 1 === 0 ? 0 : 2)}
          </span>
          {fretBuffer
            ? <span style={{ color: 'var(--bt-ink)' }}>fret: <strong style={{ color: 'white', fontSize: 13 }}>{fretBuffer}</strong>_</span>
            : <span style={{ color: 'var(--bt-dim)' }}>{isMobile ? 'toca un traste ↓' : 'type fret · ←→ move · ↑↓ string · Del delete'}</span>
          }
        </div>
      )}

      {/* Mobile numpad */}
      {isMobile && editCursor && !isPlaying && (
        <div style={{ flexShrink: 0, background: 'var(--bt-sunken)', borderTop: '1px solid var(--bt-rule)' }}>
          <div style={{ display: 'flex', gap: 3, padding: '4px 4px 2px' }}>
            {STRING_LABELS.map((label, si) => (
              <NpadBtn key={label} active={editCursor.stringIndex === si} onPress={() => doMoveString(si - editCursor.stringIndex)}>{label}</NpadBtn>
            ))}
            <div style={{ flex: 1 }} />
            <NpadBtn onPress={() => doMoveBeat(-1)}>←</NpadBtn>
            <NpadBtn onPress={() => doMoveBeat(1)}>→</NpadBtn>
            <div style={{ flex: 1 }} />
            <NpadBtn onPress={doBackspace}>⌫</NpadBtn>
            <NpadBtn onPress={doDismiss} danger>✕</NpadBtn>
          </div>
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

// ── NpadBtn ────────────────────────────────────────────────────────────────
function NpadBtn({ children, onPress, active, danger, confirm }: {
  children: React.ReactNode; onPress: () => void; active?: boolean; danger?: boolean; confirm?: boolean
}) {
  return (
    <button
      onPointerDown={e => { e.preventDefault(); onPress() }}
      style={{
        flex: 1, minWidth: 0, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: confirm ? 'var(--bt-accent-wash)' : active ? 'var(--bt-accent-wash)' : 'var(--bt-card)',
        border: `1px solid ${confirm ? 'var(--bt-accent)' : active ? 'var(--bt-accent-wash)' : 'var(--bt-rule)'}`,
        borderRadius: 7,
        color: confirm ? 'var(--bt-accent)' : danger ? 'var(--bt-danger)' : active ? 'var(--bt-accent)' : 'var(--bt-ink)',
        fontSize: 15, fontFamily: 'var(--bt-ui)',
        fontWeight: active || confirm ? 600 : 400,
        cursor: 'pointer', touchAction: 'manipulation', userSelect: 'none',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {children}
    </button>
  )
}
