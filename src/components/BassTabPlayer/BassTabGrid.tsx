import React, { useRef, useCallback, useState, useLayoutEffect, useEffect } from 'react'
import { type BassNote, type BassTrack, type StringIndex } from '../../lib/bassTab/types'
import { STRINGS, snapToGrid, beatToPixel, pixelToBeat } from '../../lib/bassTab/bassTheory'

export const PPB = 80
const ROW_H_MIN  = 48
const RULER_H    = 32
const LABEL_W    = 58
const LONG_PRESS_MS  = 500
const DRAG_THRESHOLD = 8

const NOTE_COLORS: Record<number, { bg: string; border: string }> = {
  0: { bg: '#1d4ed8', border: '#60a5fa' },
  1: { bg: '#15803d', border: '#4ade80' },
  2: { bg: '#b45309', border: '#fbbf24' },
  3: { bg: '#9b1c1c', border: '#f87171' },
}

type DragOp =
  | { type: 'move';   noteId: string; startX: number; startY: number; origBeat: number; origString: StringIndex; origDuration: number }
  | { type: 'resize'; noteId: string; startX: number; origDuration: number }
  | { type: 'create'; noteId: string; startX: number; origDuration: number }

interface GridProps {
  track: BassTrack
  zoom: number
  currentBeat: number
  cursorBeat: number
  isPlaying: boolean
  selectedNoteId: string | null
  fitWidth?: boolean
  isMobile?: boolean
  onAddNote: (note: BassNote) => void
  onUpdateNote: (id: string, patch: Partial<BassNote>) => void
  onDeleteNote: (id: string) => void
  onSelectNote: (id: string | null) => void
  onCursorBeatChange: (beat: number) => void
  onZoomChange: (zoom: number) => void
  onBeginEdit?: () => void
  onNotePreview?: (stringIndex: StringIndex, fret: number) => void
  onLongPressNote?: (noteId: string, x: number, y: number) => void
}

const SNAP = 0.125

export function BassTabGrid({
  track, zoom, currentBeat, cursorBeat, isPlaying, selectedNoteId,
  fitWidth = false, isMobile = false,
  onAddNote, onUpdateNote, onDeleteNote, onSelectNote,
  onCursorBeatChange, onZoomChange, onBeginEdit,
  onNotePreview, onLongPressNote,
}: GridProps) {
  const outerRef     = useRef<HTMLDivElement>(null)
  const gridRef      = useRef<HTMLDivElement>(null)
  const rulerRef     = useRef<HTMLDivElement>(null)
  const scrollRef    = useRef<HTMLDivElement>(null)
  const dragRef      = useRef<DragOp | null>(null)
  const dblRef       = useRef<{ id: string; time: number } | null>(null)
  const lpTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lpOriginRef  = useRef<{ x: number; y: number } | null>(null)

  // ── Dynamic row height + container width ─────────────────────────────────
  const [rowH, setRowH]         = useState(ROW_H_MIN)
  const [containerW, setContainerW] = useState(0)
  useLayoutEffect(() => {
    const el = outerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect
      const h = rect?.height ?? (ROW_H_MIN * 4 + RULER_H)
      const w = rect?.width ?? 0
      setRowH(Math.max(ROW_H_MIN, Math.floor((h - RULER_H) / 4)))
      setContainerW(w)
    })
    ro.observe(el)
    setContainerW(el.getBoundingClientRect().width)
    return () => ro.disconnect()
  }, [])

  const totalBeats  = track.totalBars * track.beatsPerBar
  const fitZoom     = fitWidth && containerW > 0 && totalBeats > 0
    ? Math.max(0.2, (containerW - LABEL_W) / (totalBeats * PPB))
    : null
  const effectiveZoom = fitZoom ?? zoom
  const pxPerBeat  = PPB * effectiveZoom
  const totalWidth = totalBeats * pxPerBeat

  // ── Auto-scroll follows playhead ─────────────────────────────────────────
  useEffect(() => {
    if (!isPlaying || !scrollRef.current) return
    const el = scrollRef.current
    const px = beatToPixel(currentBeat, pxPerBeat)
    const w  = el.clientWidth
    if (px > el.scrollLeft + w * 0.75) el.scrollLeft = px - w * 0.25
    else if (px < el.scrollLeft)        el.scrollLeft = Math.max(0, px - w * 0.1)
  }, [currentBeat, isPlaying, pxPerBeat])

  const cancelLongPress = useCallback(() => {
    if (lpTimerRef.current) { clearTimeout(lpTimerRef.current); lpTimerRef.current = null }
    lpOriginRef.current = null
  }, [])

  const contentX = (clientX: number) => gridRef.current!.getBoundingClientRect().left
    ? clientX - gridRef.current!.getBoundingClientRect().left : clientX
  const contentY = (clientY: number) => gridRef.current!.getBoundingClientRect().top
    ? clientY - gridRef.current!.getBoundingClientRect().top : clientY

  // ── Ruler click ───────────────────────────────────────────────────────────
  const handleRulerPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const rect = rulerRef.current!.getBoundingClientRect()
    const beat = Math.max(0, Math.min(totalBeats, snapToGrid(pixelToBeat(e.clientX - rect.left, pxPerBeat), SNAP)))
    onCursorBeatChange(beat)
  }, [pxPerBeat, SNAP, totalBeats, onCursorBeatChange])

  // ── Main grid pointer events ──────────────────────────────────────────────
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    const target   = e.target as HTMLElement
    const noteEl   = target.closest('[data-note-id]') as HTMLElement | null
    const resizeEl = target.closest('[data-resize]') as HTMLElement | null

    gridRef.current?.setPointerCapture(e.pointerId)

    if (noteEl) {
      const noteId = noteEl.dataset.noteId!
      const note   = track.notes.find(n => n.id === noteId)
      if (!note) return

      // Double-tap → delete
      const now = Date.now()
      if (dblRef.current?.id === noteId && now - dblRef.current.time < 380) {
        cancelLongPress()
        onBeginEdit?.()
        onDeleteNote(noteId)
        dblRef.current = null
        dragRef.current = null
        return
      }
      dblRef.current = { id: noteId, time: now }
      onSelectNote(noteId)
      onNotePreview?.(note.stringIndex, note.fret)

      // Long-press timer
      lpOriginRef.current = { x: e.clientX, y: e.clientY }
      lpTimerRef.current = setTimeout(() => {
        dragRef.current = null  // abort drag
        onLongPressNote?.(noteId, lpOriginRef.current?.x ?? e.clientX, lpOriginRef.current?.y ?? e.clientY)
        lpOriginRef.current = null
      }, LONG_PRESS_MS)

      if (resizeEl) {
        onBeginEdit?.()
        dragRef.current = { type: 'resize', noteId, startX: e.clientX, origDuration: note.durationBeats }
      } else {
        onBeginEdit?.()
        dragRef.current = {
          type: 'move', noteId,
          startX: e.clientX, startY: e.clientY,
          origBeat: note.startBeat, origString: note.stringIndex,
          origDuration: note.durationBeats,
        }
      }
    } else {
      const rect = gridRef.current!.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      if (y < 0 || y > rowH * 4) return

      const beat        = Math.max(0, snapToGrid(pixelToBeat(x, pxPerBeat), SNAP))
      const stringIndex = Math.max(0, Math.min(3, Math.floor(y / rowH))) as StringIndex

      onBeginEdit?.()
      const newNote: BassNote = {
        id: crypto.randomUUID(), stringIndex,
        fret: 0, startBeat: beat,
        durationBeats: Math.max(SNAP, 1.0), velocity: 0.8,
      }
      onAddNote(newNote)
      onSelectNote(newNote.id)
      onCursorBeatChange(beat + newNote.durationBeats)
      dblRef.current = null
      if (isMobile) {
        // On mobile: open fret numpad immediately instead of waiting for long press
        onLongPressNote?.(newNote.id, e.clientX, e.clientY)
        dragRef.current = null
      } else {
        onNotePreview?.(stringIndex, 0)
        dragRef.current = { type: 'create', noteId: newNote.id, startX: e.clientX, origDuration: newNote.durationBeats }
      }
    }
  }, [track.notes, pxPerBeat, SNAP, rowH, onAddNote, onDeleteNote, onSelectNote,
      onCursorBeatChange, onBeginEdit, onNotePreview, onLongPressNote, cancelLongPress])

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Cancel long-press if finger/pointer moved
    if (lpOriginRef.current) {
      const dx = Math.abs(e.clientX - lpOriginRef.current.x)
      const dy = Math.abs(e.clientY - lpOriginRef.current.y)
      if (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD) cancelLongPress()
    }

    const op = dragRef.current
    if (!op) return
    const dx        = e.clientX - op.startX
    const deltaBeat = pixelToBeat(dx, pxPerBeat)

    if (op.type === 'create' || op.type === 'resize') {
      const newDuration = Math.max(SNAP, snapToGrid(op.origDuration + deltaBeat, SNAP))
      onUpdateNote(op.noteId, { durationBeats: newDuration })
    } else if (op.type === 'move') {
      const dy        = e.clientY - op.startY
      const newBeat   = Math.max(0, snapToGrid(op.origBeat + deltaBeat, SNAP))
      const strDelta  = Math.round(dy / rowH)
      const newString = Math.max(0, Math.min(3, op.origString + strDelta)) as StringIndex
      onUpdateNote(op.noteId, { startBeat: newBeat, stringIndex: newString })
    }
  }, [pxPerBeat, SNAP, rowH, onUpdateNote, cancelLongPress])

  const handlePointerUp = useCallback(() => {
    cancelLongPress()
    dragRef.current = null
  }, [cancelLongPress])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      onZoomChange(Math.max(0.4, Math.min(4, zoom + (e.deltaY < 0 ? 0.15 : -0.15))))
    }
  }, [zoom, onZoomChange])

  // ── Ruler ticks ───────────────────────────────────────────────────────────
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

  // Compute which notes and strings are currently sounding
  const activeNoteIds = new Set<string>()
  const activeStrings = new Set<number>()
  for (const n of track.notes) {
    if (currentBeat >= n.startBeat && currentBeat < n.startBeat + n.durationBeats) {
      activeNoteIds.add(n.id)
      activeStrings.add(n.stringIndex)
    }
  }

  return (
    <div ref={outerRef} className="flex flex-1 min-h-0" style={{ overflow: 'hidden' }}>

      {/* String-label column */}
      <div className="flex-shrink-0 flex flex-col z-10" style={{ width: LABEL_W, background: 'hsl(224 20% 9%)', borderRight: '1px solid hsl(224 15% 18%)' }}>
        <div style={{ height: RULER_H, flexShrink: 0, borderBottom: '1px solid hsl(224 15% 16%)' }} />
        {STRINGS.map((s) => (
          <div key={s.index} className="flex items-center justify-center flex-1" style={{ borderBottom: '1px solid hsl(224 15% 14%)', minHeight: ROW_H_MIN }}>
            <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'ui-monospace, monospace', color: s.color }}>{s.displayName}</span>
          </div>
        ))}
      </div>

      {/* Scrollable content */}
      <div ref={scrollRef} className="flex-1 overflow-y-hidden" style={{ overflowX: fitWidth ? 'hidden' : 'auto', cursor: 'crosshair' }} onWheel={handleWheel}>
        <div style={{ width: totalWidth, minWidth: totalWidth }}>

          {/* Ruler */}
          <div
            ref={rulerRef}
            style={{ height: RULER_H, width: totalWidth, position: 'relative', background: 'hsl(224 20% 9%)', borderBottom: '1px solid hsl(224 15% 16%)', cursor: 'col-resize', userSelect: 'none' }}
            onPointerDown={handleRulerPointerDown}
          >
            {barTicks.map(tick => (
              <div key={tick.x} style={{ position:'absolute', left:tick.x, top:0, bottom:0, display:'flex', alignItems:'flex-end', paddingBottom:5, paddingLeft:4 }}>
                <div style={{ position:'absolute', left:0, top:0, bottom:0, width:1.5, background:'hsl(224 15% 26%)' }} />
                <span style={{ color:'hsl(220 10% 50%)', fontSize:11, fontFamily:'ui-monospace, monospace', userSelect:'none', paddingLeft:3 }}>{tick.bar}</span>
              </div>
            ))}
            {beatTicks.map((tick, i) => (
              <div key={i} style={{ position:'absolute', left:tick.x, top:0, bottom:0, width:1, background:'hsl(224 15% 14%)' }} />
            ))}
            {/* Insertion cursor ▼ */}
            <div style={{ position:'absolute', left:insertionLeft, top:0, height:'100%', width:2, background:'#e2e8f0', opacity:0.85, pointerEvents:'none', zIndex:10 }}>
              <div style={{ position:'absolute', bottom:-1, left:'50%', transform:'translateX(-50%)', width:0, height:0, borderLeft:'5px solid transparent', borderRight:'5px solid transparent', borderTop:'6px solid #e2e8f0' }} />
            </div>
            {showPlayhead && (
              <div style={{ position:'absolute', left:playheadLeft, top:0, height:'100%', width:2, background:'#60a5fa', pointerEvents:'none', zIndex:11 }} />
            )}
          </div>

          {/* Notes area */}
          <div
            ref={gridRef}
            style={{ width:totalWidth, height:rowH*4, position:'relative', background:'hsl(224 22% 10%)', userSelect:'none', touchAction:'none' }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            {STRINGS.map((s, i) => {
              const rowActive = activeStrings.has(i)
              return (
                <div key={i} style={{
                  position:'absolute', left:0, right:0, top:i*rowH, height:rowH,
                  background: rowActive
                    ? `${s.color}12`
                    : i%2===0 ? 'rgba(255,255,255,0.015)' : 'transparent',
                  borderBottom:'1px solid hsl(224 15% 14%)',
                  pointerEvents:'none',
                  transition:'background 0.12s',
                }} />
              )
            })}
            {barTicks.map(tick => (
              <div key={tick.x} style={{ position:'absolute', left:tick.x, top:0, width:1, height:'100%', background:'hsl(224 15% 18%)', pointerEvents:'none' }} />
            ))}
            {beatTicks.map((tick, i) => (
              <div key={i} style={{ position:'absolute', left:tick.x, top:0, width:1, height:'100%', background:'hsl(224 15% 13%)', pointerEvents:'none' }} />
            ))}

            {track.notes.length === 0 && (
              <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', textAlign:'center', pointerEvents:'none' }}>
                <p style={{ color:'#2d3748', fontSize:12, fontFamily:'monospace', margin:0 }}>Tap a fret above ↑ — or click here to add a note</p>
              </div>
            )}

            {track.notes.map((note) => {
              const left    = beatToPixel(note.startBeat, pxPerBeat)
              const width   = Math.max(20, beatToPixel(note.durationBeats, pxPerBeat) - 2)
              const top     = note.stringIndex * rowH + 6
              const c       = NOTE_COLORS[note.stringIndex]
              const sel     = note.id === selectedNoteId
              const playing = activeNoteIds.has(note.id)
              const noteH   = rowH - 12
              const strColor = STRINGS[note.stringIndex].color
              return (
                <div
                  key={note.id}
                  data-note-id={note.id}
                  style={{
                    position:'absolute', left, top, width, height:noteH,
                    background: playing
                      ? `linear-gradient(135deg, ${c.bg}, ${strColor}aa)`
                      : c.bg,
                    border: playing
                      ? `1.5px solid ${strColor}`
                      : `1.5px solid ${c.border}`,
                    borderRadius:5, cursor:'grab',
                    boxShadow: sel
                      ? `0 0 0 2px #fff, 0 0 12px rgba(255,255,255,0.2)`
                      : playing
                        ? `0 0 12px ${strColor}80, 0 0 4px ${strColor}40`
                        : '0 2px 6px rgba(0,0,0,0.6)',
                    display:'flex', alignItems:'center', overflow:'hidden', paddingLeft:6,
                    zIndex: sel ? 5 : playing ? 4 : 2, touchAction:'none',
                    transition: 'box-shadow 0.08s, border-color 0.08s, background 0.08s',
                  }}
                >
                  <span style={{ color:'#fff', fontSize:noteH>32?14:11, fontWeight:700, fontFamily:'ui-monospace,monospace', lineHeight:1, pointerEvents:'none', flexShrink:0 }}>
                    {note.fret}
                  </span>
                  <div data-resize="true" style={{ position:'absolute', right:0, top:0, width: isMobile ? 32 : 14, height:'100%', cursor:'ew-resize', background:'rgba(255,255,255,0.08)', borderLeft:'1px solid rgba(255,255,255,0.08)', touchAction:'none' }} />
                </div>
              )
            })}

            {/* Insertion cursor */}
            <div style={{ position:'absolute', left:insertionLeft, top:0, height:'100%', width:1.5, background:'rgba(226,232,240,0.45)', pointerEvents:'none', zIndex:15 }} />

            {/* Playhead — solid line + ambient sweep */}
            {showPlayhead && (
              <>
                <div style={{
                  position:'absolute', left:playheadLeft-16, top:0, height:'100%',
                  width:32, pointerEvents:'none', zIndex:19,
                  background:'linear-gradient(90deg, transparent 0%, rgba(96,165,250,0.06) 50%, transparent 100%)',
                }} />
                <div style={{
                  position:'absolute', left:playheadLeft, top:0, height:'100%',
                  width:2, background:'#60a5fa',
                  boxShadow:'0 0 10px 2px rgba(96,165,250,0.55), 0 0 3px rgba(96,165,250,0.9)',
                  pointerEvents:'none', zIndex:20,
                }} />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
