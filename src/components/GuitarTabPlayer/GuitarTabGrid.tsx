import React, { useRef, useCallback, useState, useLayoutEffect, useEffect } from 'react'
import { type GuitarNote, type GuitarTrack, type GuitarStringIndex } from '../../lib/guitarTab/types'
import { GUITAR_STRINGS, snapToGrid, beatToPixel, pixelToBeat } from '../../lib/guitarTab/guitarTheory'

export const PPB = 80
const ROW_H_MIN  = 44
const RULER_H    = 32
const LABEL_W    = 52
const LONG_PRESS_MS  = 500
const DRAG_THRESHOLD = 8
const SNAP = 0.125

// Light mode colors per string
const NOTE_COLORS: Record<number, { bg: string; border: string; text: string }> = {
  0: { bg: '#0ea5e9', border: '#7dd3fc', text: '#fff' },
  1: { bg: '#8b5cf6', border: '#c4b5fd', text: '#fff' },
  2: { bg: '#10b981', border: '#6ee7b7', text: '#fff' },
  3: { bg: '#f59e0b', border: '#fde68a', text: '#1f2937' },
  4: { bg: '#f97316', border: '#fed7aa', text: '#fff' },
  5: { bg: '#ef4444', border: '#fca5a5', text: '#fff' },
}

type DragOp =
  | { type: 'move';   noteId: string; startX: number; startY: number; origBeat: number; origString: GuitarStringIndex; origDuration: number }
  | { type: 'resize'; noteId: string; startX: number; origDuration: number }
  | { type: 'create'; noteId: string; startX: number; origDuration: number }

interface GridProps {
  track: GuitarTrack
  zoom: number
  currentBeat: number
  cursorBeat: number
  isPlaying: boolean
  selectedNoteId: string | null
  fitWidth?: boolean
  isMobile?: boolean
  onAddNote: (note: GuitarNote) => void
  onUpdateNote: (id: string, patch: Partial<GuitarNote>) => void
  onDeleteNote: (id: string) => void
  onSelectNote: (id: string | null) => void
  onCursorBeatChange: (beat: number) => void
  onZoomChange: (zoom: number) => void
  onBeginEdit?: () => void
  onNotePreview?: (stringIndex: GuitarStringIndex, fret: number) => void
  onLongPressNote?: (noteId: string, x: number, y: number) => void
}

export function GuitarTabGrid({
  track, zoom, currentBeat, cursorBeat, isPlaying, selectedNoteId,
  fitWidth = false, isMobile = false,
  onAddNote, onUpdateNote, onDeleteNote, onSelectNote,
  onCursorBeatChange, onZoomChange, onBeginEdit,
  onNotePreview, onLongPressNote,
}: GridProps) {
  const outerRef    = useRef<HTMLDivElement>(null)
  const gridRef     = useRef<HTMLDivElement>(null)
  const rulerRef    = useRef<HTMLDivElement>(null)
  const scrollRef   = useRef<HTMLDivElement>(null)
  const dragRef     = useRef<DragOp | null>(null)
  const dblRef      = useRef<{ id: string; time: number } | null>(null)
  const lpTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lpOriginRef = useRef<{ x: number; y: number } | null>(null)

  const [selIds, setSelIds]       = useState<Set<string>>(new Set())
  const [clipboard, setClipboard] = useState<GuitarNote[]>([])
  const [rbBand, setRbBand]       = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const [multiMode, setMultiMode] = useState(false)
  const isRbRef                   = useRef(false)
  const selIdsRef                 = useRef(selIds)
  selIdsRef.current               = selIds

  useEffect(() => {
    if (!multiMode) setSelIds(selectedNoteId ? new Set([selectedNoteId]) : new Set())
  }, [selectedNoteId, multiMode])

  const doCopy = useCallback(() => {
    const ids   = selIdsRef.current
    const notes = track.notes.filter(n => ids.has(n.id))
    if (!notes.length) return
    const minBeat = Math.min(...notes.map(n => n.startBeat))
    setClipboard(notes.map(n => ({ ...n, startBeat: n.startBeat - minBeat })))
  }, [track.notes])

  const doPaste = useCallback(() => {
    if (!clipboard.length) return
    const newIds: string[] = []
    clipboard.forEach(n => {
      const newNote: GuitarNote = { ...n, id: crypto.randomUUID(), startBeat: cursorBeat + n.startBeat }
      onAddNote(newNote); newIds.push(newNote.id)
    })
    setSelIds(new Set(newIds))
    onSelectNote(newIds[0] ?? null)
  }, [clipboard, cursorBeat, onAddNote, onSelectNote])

  const doDeleteSel = useCallback(() => {
    selIdsRef.current.forEach(id => onDeleteNote(id))
    setSelIds(new Set()); onSelectNote(null)
  }, [onDeleteNote, onSelectNote])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') { e.preventDefault(); doCopy() }
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') { e.preventDefault(); doPaste() }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selIdsRef.current.size > 1) {
        e.preventDefault(); doDeleteSel()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [doCopy, doPaste, doDeleteSel])

  const [rowH, setRowH]             = useState(ROW_H_MIN)
  const [containerW, setContainerW] = useState(0)

  useLayoutEffect(() => {
    const el = outerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect
      const h = rect?.height ?? (ROW_H_MIN * 6 + RULER_H)
      const w = rect?.width ?? 0
      setRowH(Math.max(ROW_H_MIN, Math.floor((h - RULER_H) / 6)))
      setContainerW(w)
    })
    ro.observe(el)
    setContainerW(el.getBoundingClientRect().width)
    return () => ro.disconnect()
  }, [])

  const totalBeats     = track.totalBars * track.beatsPerBar
  const fitZoom        = fitWidth && containerW > 0 && totalBeats > 0
    ? Math.max(0.2, (containerW - LABEL_W) / (totalBeats * PPB))
    : null
  const effectiveZoom  = fitZoom ?? zoom
  const pxPerBeat      = PPB * effectiveZoom
  const totalWidth     = totalBeats * pxPerBeat

  useEffect(() => {
    if (!isPlaying || !scrollRef.current) return
    const el = scrollRef.current
    const px = beatToPixel(currentBeat, pxPerBeat)
    const w  = el.clientWidth
    if (px > el.scrollLeft + w * 0.75) el.scrollLeft = px - w * 0.25
    else if (px < el.scrollLeft)       el.scrollLeft = Math.max(0, px - w * 0.1)
  }, [currentBeat, isPlaying, pxPerBeat])

  const cancelLongPress = useCallback(() => {
    if (lpTimerRef.current) { clearTimeout(lpTimerRef.current); lpTimerRef.current = null }
    lpOriginRef.current = null
  }, [])

  const handleRulerPointerDown = useCallback((e: React.PointerEvent) => {
    const rect = rulerRef.current!.getBoundingClientRect()
    const beat = Math.max(0, Math.min(totalBeats, snapToGrid(pixelToBeat(e.clientX - rect.left, pxPerBeat), SNAP)))
    onCursorBeatChange(beat)
  }, [pxPerBeat, totalBeats, onCursorBeatChange])

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    const noteEl   = (e.target as HTMLElement).closest('[data-note-id]') as HTMLElement | null
    const resizeEl = (e.target as HTMLElement).closest('[data-resize]') as HTMLElement | null
    gridRef.current?.setPointerCapture(e.pointerId)

    if (noteEl) {
      const noteId = noteEl.dataset.noteId!
      const note   = track.notes.find(n => n.id === noteId)
      if (!note) return

      if (e.shiftKey || multiMode) {
        setSelIds(prev => { const next = new Set(prev); next.has(noteId) ? next.delete(noteId) : next.add(noteId); return next })
        dragRef.current = null; return
      }

      const now = Date.now()
      if (dblRef.current?.id === noteId && now - dblRef.current.time < 380) {
        cancelLongPress(); onBeginEdit?.(); onDeleteNote(noteId)
        dblRef.current = null; dragRef.current = null; return
      }
      dblRef.current = { id: noteId, time: now }
      setSelIds(new Set([noteId])); onSelectNote(noteId)
      onNotePreview?.(note.stringIndex, note.fret)

      lpOriginRef.current = { x: e.clientX, y: e.clientY }
      lpTimerRef.current = setTimeout(() => {
        dragRef.current = null
        onLongPressNote?.(noteId, lpOriginRef.current?.x ?? e.clientX, lpOriginRef.current?.y ?? e.clientY)
        lpOriginRef.current = null
      }, LONG_PRESS_MS)

      if (resizeEl) {
        onBeginEdit?.()
        dragRef.current = { type: 'resize', noteId, startX: e.clientX, origDuration: note.durationBeats }
      } else {
        onBeginEdit?.()
        dragRef.current = { type: 'move', noteId, startX: e.clientX, startY: e.clientY, origBeat: note.startBeat, origString: note.stringIndex, origDuration: note.durationBeats }
      }
    } else {
      const rect = gridRef.current!.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      if (y < 0 || y > rowH * 6) return

      if (e.shiftKey) {
        isRbRef.current = true; setRbBand({ x0: x, y0: y, x1: x, y1: y })
        dragRef.current = null; return
      }
      if (!multiMode) { setSelIds(new Set()); onSelectNote(null) }

      const beat        = Math.max(0, snapToGrid(pixelToBeat(x, pxPerBeat), SNAP))
      const stringIndex = Math.max(0, Math.min(5, Math.floor(y / rowH))) as GuitarStringIndex

      onBeginEdit?.()
      const newNote: GuitarNote = {
        id: crypto.randomUUID(), stringIndex,
        fret: 0, startBeat: beat, durationBeats: Math.max(SNAP, 1.0), velocity: 0.8,
      }
      onAddNote(newNote); onSelectNote(newNote.id)
      setSelIds(new Set([newNote.id]))
      onCursorBeatChange(beat + newNote.durationBeats)
      dblRef.current = null
      if (isMobile) {
        onLongPressNote?.(newNote.id, e.clientX, e.clientY)
        dragRef.current = null
      } else {
        onNotePreview?.(stringIndex, 0)
        dragRef.current = { type: 'create', noteId: newNote.id, startX: e.clientX, origDuration: newNote.durationBeats }
      }
    }
  }, [track.notes, pxPerBeat, rowH, multiMode, onAddNote, onDeleteNote, onSelectNote, onCursorBeatChange, onBeginEdit, onNotePreview, onLongPressNote, cancelLongPress])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (lpOriginRef.current) {
      const dx = Math.abs(e.clientX - lpOriginRef.current.x)
      const dy = Math.abs(e.clientY - lpOriginRef.current.y)
      if (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD) cancelLongPress()
    }
    if (isRbRef.current) {
      const rect = gridRef.current!.getBoundingClientRect()
      setRbBand(prev => prev ? { ...prev, x1: e.clientX - rect.left, y1: e.clientY - rect.top } : null)
      return
    }
    const op = dragRef.current
    if (!op) return
    const dx = e.clientX - op.startX
    const deltaBeat = pixelToBeat(dx, pxPerBeat)
    if (op.type === 'create' || op.type === 'resize') {
      onUpdateNote(op.noteId, { durationBeats: Math.max(SNAP, snapToGrid(op.origDuration + deltaBeat, SNAP)) })
    } else if (op.type === 'move') {
      const dy = e.clientY - op.startY
      const newBeat   = Math.max(0, snapToGrid(op.origBeat + deltaBeat, SNAP))
      const strDelta  = Math.round(dy / rowH)
      const newString = Math.max(0, Math.min(5, op.origString + strDelta)) as GuitarStringIndex
      onUpdateNote(op.noteId, { startBeat: newBeat, stringIndex: newString })
    }
  }, [pxPerBeat, rowH, onUpdateNote, cancelLongPress])

  const handlePointerUp = useCallback(() => {
    cancelLongPress()
    if (isRbRef.current && rbBand) {
      isRbRef.current = false
      const minX = Math.min(rbBand.x0, rbBand.x1), maxX = Math.max(rbBand.x0, rbBand.x1)
      const minY = Math.min(rbBand.y0, rbBand.y1), maxY = Math.max(rbBand.y0, rbBand.y1)
      if (maxX - minX > 4 || maxY - minY > 4) {
        const selected = track.notes.filter(n => {
          const nl = beatToPixel(n.startBeat, pxPerBeat)
          const nr = nl + Math.max(20, beatToPixel(n.durationBeats, pxPerBeat) - 2)
          const nt = n.stringIndex * rowH + 6
          const nb = nt + (rowH - 12)
          return nl < maxX && nr > minX && nt < maxY && nb > minY
        })
        if (selected.length) { setSelIds(new Set(selected.map(n => n.id))); onSelectNote(selected[0].id) }
      }
      setRbBand(null); dragRef.current = null; return
    }
    dragRef.current = null
  }, [cancelLongPress, rbBand, track.notes, pxPerBeat, rowH, onSelectNote])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      onZoomChange(Math.max(0.4, Math.min(4, zoom + (e.deltaY < 0 ? 0.15 : -0.15))))
    }
  }, [zoom, onZoomChange])

  const barTicks:  { x: number; bar: number }[] = []
  const beatTicks: { x: number }[] = []
  for (let bar = 0; bar < track.totalBars; bar++) {
    barTicks.push({ x: bar * track.beatsPerBar * pxPerBeat, bar: bar + 1 })
    for (let b = 1; b < track.beatsPerBar; b++) {
      beatTicks.push({ x: (bar * track.beatsPerBar + b) * pxPerBeat })
    }
  }

  const playheadLeft  = beatToPixel(Math.max(0, currentBeat), pxPerBeat)
  const insertionLeft = beatToPixel(Math.max(0, cursorBeat), pxPerBeat)
  const showPlayhead  = isPlaying || currentBeat > 0

  const activeNoteIds = new Set<string>()
  const activeStrings = new Set<number>()
  for (const n of track.notes) {
    if (currentBeat >= n.startBeat && currentBeat < n.startBeat + n.durationBeats) {
      activeNoteIds.add(n.id); activeStrings.add(n.stringIndex)
    }
  }

  const hasMultiSel  = selIds.size > 1
  const hasClipboard = clipboard.length > 0
  const showToolbar  = hasMultiSel || hasClipboard || isMobile

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>

      {/* ── Toolbar ──────────────────────────────────────────────────────────── */}
      {showToolbar && (
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
          {isMobile && (
            <button
              onClick={() => { setMultiMode(m => !m); if (multiMode) setSelIds(new Set()) }}
              style={{ height: 28, padding: '0 10px', borderRadius: 6, background: multiMode ? '#ede9fe' : '#f8fafc', border: `1px solid ${multiMode ? '#7c3aed' : '#e2e8f0'}`, color: multiMode ? '#7c3aed' : '#64748b', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
            >
              {multiMode ? '✓ Select' : 'Select'}
            </button>
          )}
          {hasMultiSel && (
            <span style={{ fontSize: 11, color: '#7c3aed', fontWeight: 600 }}>{selIds.size} notes</span>
          )}
          {hasMultiSel && (
            <button onClick={doCopy} style={tbBtn('#dbeafe', '#3b82f6', '#1d40af')}>Copy</button>
          )}
          {hasMultiSel && (
            <button onClick={doDeleteSel} style={tbBtn('#fee2e2', '#ef4444', '#991b1b')}>Delete</button>
          )}
          {hasClipboard && (
            <button onClick={doPaste} style={tbBtn('#dcfce7', '#22c55e', '#166534')}>
              Paste {clipboard.length > 1 ? `(${clipboard.length})` : ''}
            </button>
          )}
          {!isMobile && hasMultiSel && (
            <span style={{ marginLeft: 'auto', fontSize: 10, color: '#94a3b8' }}>
              Shift+click · Shift+drag · Ctrl+C/V
            </span>
          )}
        </div>
      )}

      {/* ── Grid ─────────────────────────────────────────────────────────────── */}
      <div ref={outerRef} style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>

        {/* String labels */}
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', width: LABEL_W, background: '#f8fafc', borderRight: '1px solid #e2e8f0', zIndex: 10 }}>
          <div style={{ height: RULER_H, flexShrink: 0, borderBottom: '1px solid #e2e8f0' }} />
          {GUITAR_STRINGS.map(s => (
            <div key={s.index} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, minHeight: ROW_H_MIN, borderBottom: '1px solid #f1f5f9' }}>
              <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'ui-monospace, monospace', color: s.color }}>
                {s.displayName}
              </span>
            </div>
          ))}
        </div>

        {/* Scrollable content */}
        <div
          ref={scrollRef}
          style={{ flex: 1, overflowX: fitWidth ? 'hidden' : 'auto', overflowY: 'hidden', cursor: 'crosshair' }}
          onWheel={handleWheel}
        >
          <div style={{ width: totalWidth, minWidth: totalWidth }}>

            {/* Ruler */}
            <div
              ref={rulerRef}
              style={{ height: RULER_H, width: totalWidth, position: 'relative', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', cursor: 'col-resize', userSelect: 'none' }}
              onPointerDown={handleRulerPointerDown}
            >
              {barTicks.map(tick => (
                <div key={tick.x} style={{ position: 'absolute', left: tick.x, top: 0, bottom: 0, display: 'flex', alignItems: 'flex-end', paddingBottom: 5, paddingLeft: 4 }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 1.5, background: '#94a3b8' }} />
                  <span style={{ color: '#64748b', fontSize: 11, fontFamily: 'ui-monospace, monospace', paddingLeft: 3 }}>{tick.bar}</span>
                </div>
              ))}
              {beatTicks.map((tick, i) => (
                <div key={i} style={{ position: 'absolute', left: tick.x, top: 0, bottom: 0, width: 1, background: '#e2e8f0' }} />
              ))}
              {/* Insertion cursor */}
              <div style={{ position: 'absolute', left: insertionLeft, top: 0, height: '100%', width: 2, background: '#475569', opacity: 0.7, pointerEvents: 'none', zIndex: 10 }}>
                <div style={{ position: 'absolute', bottom: -1, left: '50%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '6px solid #475569' }} />
              </div>
              {showPlayhead && (
                <div style={{ position: 'absolute', left: playheadLeft, top: 0, height: '100%', width: 2, background: '#ef4444', pointerEvents: 'none', zIndex: 11 }} />
              )}
            </div>

            {/* Notes area */}
            <div
              ref={gridRef}
              style={{ width: totalWidth, height: rowH * 6, position: 'relative', background: '#ffffff', userSelect: 'none', touchAction: 'none' }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            >
              {/* Row backgrounds */}
              {GUITAR_STRINGS.map((s, i) => (
                <div key={i} style={{
                  position: 'absolute', left: 0, right: 0, top: i * rowH, height: rowH,
                  background: activeStrings.has(i) ? `${s.lightBg}` : i % 2 === 0 ? '#ffffff' : '#f8fafc',
                  borderBottom: '1px solid #f1f5f9',
                  pointerEvents: 'none',
                  transition: 'background 0.12s',
                }} />
              ))}

              {/* Bar lines */}
              {barTicks.map(tick => (
                <div key={tick.x} style={{ position: 'absolute', left: tick.x, top: 0, width: 1, height: '100%', background: '#e2e8f0', pointerEvents: 'none' }} />
              ))}
              {/* Beat lines */}
              {beatTicks.map((tick, i) => (
                <div key={i} style={{ position: 'absolute', left: tick.x, top: 0, width: 1, height: '100%', background: '#f1f5f9', pointerEvents: 'none' }} />
              ))}

              {track.notes.length === 0 && (
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center', pointerEvents: 'none' }}>
                  <p style={{ color: '#94a3b8', fontSize: 12, fontFamily: 'monospace', margin: 0 }}>
                    Click to add a note · Double-click to delete · Drag to move or resize
                  </p>
                </div>
              )}

              {/* Notes */}
              {track.notes.map(note => {
                const left    = beatToPixel(note.startBeat, pxPerBeat)
                const width   = Math.max(20, beatToPixel(note.durationBeats, pxPerBeat) - 2)
                const top     = note.stringIndex * rowH + 5
                const c       = NOTE_COLORS[note.stringIndex]
                const sel     = note.id === selectedNoteId
                const inMulti = selIds.has(note.id) && selIds.size > 1
                const playing = activeNoteIds.has(note.id)
                const noteH   = rowH - 10
                return (
                  <div
                    key={note.id}
                    data-note-id={note.id}
                    style={{
                      position: 'absolute', left, top, width, height: noteH,
                      background: playing ? `linear-gradient(135deg, ${c.bg}, ${c.border})` : c.bg,
                      border: inMulti
                        ? '1.5px solid #7c3aed'
                        : playing ? `1.5px solid ${c.border}` : `1.5px solid ${c.border}`,
                      borderRadius: 5, cursor: 'grab',
                      boxShadow: inMulti
                        ? '0 0 0 2px #7c3aed, 0 0 8px rgba(124,58,237,0.3)'
                        : sel
                          ? '0 0 0 2px #1e293b, 0 0 8px rgba(0,0,0,0.15)'
                          : playing
                            ? `0 0 10px ${c.bg}80`
                            : '0 1px 3px rgba(0,0,0,0.15)',
                      display: 'flex', alignItems: 'center', overflow: 'hidden', paddingLeft: 5,
                      zIndex: inMulti ? 6 : sel ? 5 : playing ? 4 : 2, touchAction: 'none',
                      transition: 'box-shadow 0.08s',
                    }}
                  >
                    <span style={{ color: c.text, fontSize: noteH > 28 ? 13 : 10, fontWeight: 700, fontFamily: 'ui-monospace, monospace', lineHeight: 1, pointerEvents: 'none', flexShrink: 0 }}>
                      {note.fret}
                    </span>
                    <div data-resize="true" style={{ position: 'absolute', right: 0, top: 0, width: isMobile ? 30 : 12, height: '100%', cursor: 'ew-resize', background: 'rgba(0,0,0,0.06)', borderLeft: '1px solid rgba(0,0,0,0.06)', touchAction: 'none' }} />
                  </div>
                )
              })}

              {/* Insertion cursor line */}
              <div style={{ position: 'absolute', left: insertionLeft, top: 0, height: '100%', width: 1.5, background: 'rgba(71,85,105,0.3)', pointerEvents: 'none', zIndex: 15 }} />

              {/* Playhead */}
              {showPlayhead && (
                <>
                  <div style={{ position: 'absolute', left: playheadLeft - 12, top: 0, height: '100%', width: 24, pointerEvents: 'none', zIndex: 19, background: 'linear-gradient(90deg, transparent, rgba(239,68,68,0.05) 50%, transparent)' }} />
                  <div style={{ position: 'absolute', left: playheadLeft, top: 0, height: '100%', width: 2, background: '#ef4444', boxShadow: '0 0 8px rgba(239,68,68,0.5)', pointerEvents: 'none', zIndex: 20 }} />
                </>
              )}

              {/* Rubber band */}
              {rbBand && (
                <div style={{
                  position: 'absolute',
                  left:   Math.min(rbBand.x0, rbBand.x1), top:    Math.min(rbBand.y0, rbBand.y1),
                  width:  Math.abs(rbBand.x1 - rbBand.x0), height: Math.abs(rbBand.y1 - rbBand.y0),
                  border: '1.5px dashed #7c3aed', background: 'rgba(124,58,237,0.06)',
                  borderRadius: 3, pointerEvents: 'none', zIndex: 25,
                }} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function tbBtn(bg: string, border: string, color: string): React.CSSProperties {
  return { height: 28, padding: '0 10px', borderRadius: 6, background: bg, border: `1px solid ${border}`, color, fontSize: 11, fontWeight: 600, cursor: 'pointer' }
}
