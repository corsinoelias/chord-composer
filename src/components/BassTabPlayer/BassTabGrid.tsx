import React, { useRef, useCallback } from 'react'
import { type BassNote, type BassTrack, type SnapValue, type StringIndex } from '../../lib/bassTab/types'
import { STRINGS, snapToGrid, beatToPixel, pixelToBeat } from '../../lib/bassTab/bassTheory'

export const PPB = 80   // base pixels per beat at zoom=1
const ROW_H = 54
const RULER_H = 30
const LABEL_W = 58

const NOTE_COLORS: Record<number, { bg: string; border: string; text: string }> = {
  0: { bg: '#1d4ed8', border: '#60a5fa', text: '#ffffff' },   // G2
  1: { bg: '#15803d', border: '#4ade80', text: '#ffffff' },   // D2
  2: { bg: '#b45309', border: '#fbbf24', text: '#ffffff' },   // A1
  3: { bg: '#9b1c1c', border: '#f87171', text: '#ffffff' },   // E1
}

type DragOp =
  | { type: 'move';   noteId: string; startX: number; startY: number; origBeat: number; origString: StringIndex; origDuration: number }
  | { type: 'resize'; noteId: string; startX: number; origDuration: number }
  | { type: 'create'; noteId: string; startX: number; origDuration: number }

interface GridProps {
  track: BassTrack
  zoom: number
  snap: SnapValue
  currentBeat: number
  isPlaying: boolean
  selectedNoteId: string | null
  onAddNote: (note: BassNote) => void
  onUpdateNote: (id: string, patch: Partial<BassNote>) => void
  onDeleteNote: (id: string) => void
  onSelectNote: (id: string | null) => void
  onZoomChange: (zoom: number) => void
}

export function BassTabGrid({
  track, zoom, snap, currentBeat, isPlaying, selectedNoteId,
  onAddNote, onUpdateNote, onDeleteNote, onSelectNote, onZoomChange,
}: GridProps) {
  const gridRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragOp | null>(null)
  const lastClickRef = useRef<{ id: string; time: number } | null>(null)

  const pxPerBeat = PPB * zoom
  const totalBeats = track.totalBars * track.beatsPerBar
  const totalWidth = totalBeats * pxPerBeat

  const getContentX = (clientX: number) => {
    const rect = gridRef.current!.getBoundingClientRect()
    return clientX - rect.left
  }
  const getContentY = (clientY: number) => {
    const rect = gridRef.current!.getBoundingClientRect()
    return clientY - rect.top
  }

  // ── Pointer events on the main grid div ─────────────────────────────────
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    const target = e.target as HTMLElement
    const noteEl  = target.closest('[data-note-id]')  as HTMLElement | null
    const resizeEl = target.closest('[data-resize]')  as HTMLElement | null

    gridRef.current?.setPointerCapture(e.pointerId)

    if (noteEl) {
      const noteId = noteEl.dataset.noteId!
      const note   = track.notes.find(n => n.id === noteId)
      if (!note) return

      // Double-click detection
      const now = Date.now()
      if (lastClickRef.current?.id === noteId && now - lastClickRef.current.time < 380) {
        onDeleteNote(noteId)
        lastClickRef.current = null
        dragRef.current = null
        return
      }
      lastClickRef.current = { id: noteId, time: now }
      onSelectNote(noteId)

      if (resizeEl) {
        dragRef.current = { type: 'resize', noteId, startX: e.clientX, origDuration: note.durationBeats }
      } else {
        dragRef.current = {
          type: 'move', noteId,
          startX: e.clientX, startY: e.clientY,
          origBeat: note.startBeat, origString: note.stringIndex,
          origDuration: note.durationBeats,
        }
      }
    } else {
      // Click on empty grid → create note
      const x = getContentX(e.clientX)
      const y = getContentY(e.clientY)
      if (y < 0 || y > ROW_H * 4) return

      const beat = Math.max(0, snapToGrid(pixelToBeat(x, pxPerBeat), snap))
      const stringIndex = Math.max(0, Math.min(3, Math.floor(y / ROW_H))) as StringIndex

      const newNote: BassNote = {
        id: crypto.randomUUID(),
        stringIndex,
        fret: 0,
        startBeat: beat,
        durationBeats: Math.max(snap, 1.0),
        velocity: 0.8,
      }
      onAddNote(newNote)
      onSelectNote(newNote.id)
      dragRef.current = { type: 'create', noteId: newNote.id, startX: e.clientX, origDuration: newNote.durationBeats }
      lastClickRef.current = null
    }
  }, [track.notes, pxPerBeat, snap, onAddNote, onDeleteNote, onSelectNote])

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const op = dragRef.current
    if (!op) return

    const dx = e.clientX - op.startX
    const deltaBeat = pixelToBeat(dx, pxPerBeat)

    if (op.type === 'create' || op.type === 'resize') {
      const newDuration = Math.max(snap, snapToGrid(op.origDuration + deltaBeat, snap))
      onUpdateNote(op.noteId, { durationBeats: newDuration })
    } else if (op.type === 'move') {
      const dy = e.clientY - op.startY
      const newBeat    = Math.max(0, snapToGrid(op.origBeat + deltaBeat, snap))
      const strDelta   = Math.round(dy / ROW_H)
      const newString  = Math.max(0, Math.min(3, op.origString + strDelta)) as StringIndex
      onUpdateNote(op.noteId, { startBeat: newBeat, stringIndex: newString })
    }
  }, [pxPerBeat, snap, onUpdateNote])

  const handlePointerUp = useCallback(() => {
    dragRef.current = null
  }, [])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      const delta = e.deltaY < 0 ? 0.15 : -0.15
      onZoomChange(Math.max(0.4, Math.min(4, zoom + delta)))
    }
  }, [zoom, onZoomChange])

  // ── Ruler ticks ──────────────────────────────────────────────────────────
  const barTicks: { x: number; bar: number }[] = []
  const beatTicks: { x: number }[] = []

  for (let bar = 0; bar < track.totalBars; bar++) {
    barTicks.push({ x: bar * track.beatsPerBar * pxPerBeat, bar: bar + 1 })
    for (let b = 1; b < track.beatsPerBar; b++) {
      beatTicks.push({ x: (bar * track.beatsPerBar + b) * pxPerBeat })
    }
  }

  const cursorLeft = beatToPixel(Math.max(0, currentBeat), pxPerBeat)
  const showCursor = isPlaying || currentBeat > 0

  return (
    <div className="flex flex-1 min-h-0" style={{ overflow: 'hidden' }}>

      {/* Fixed string label column */}
      <div
        className="flex-shrink-0 bg-gray-800 border-r border-gray-700 z-10 flex flex-col"
        style={{ width: LABEL_W }}
      >
        {/* Empty corner above labels (aligns with ruler) */}
        <div
          className="border-b border-gray-700 flex-shrink-0"
          style={{ height: RULER_H }}
        />
        {/* String labels */}
        {STRINGS.map((s) => (
          <div
            key={s.index}
            className="flex items-center justify-center flex-shrink-0"
            style={{
              height: ROW_H,
              borderBottom: '1px solid #1f2937',
            }}
          >
            <span
              className="text-xs font-bold font-mono"
              style={{ color: s.color }}
            >
              {s.displayName}
            </span>
          </div>
        ))}
      </div>

      {/* Scrollable content */}
      <div
        className="flex-1 overflow-x-auto overflow-y-hidden"
        onWheel={handleWheel}
        style={{ cursor: 'crosshair' }}
      >
        <div style={{ width: totalWidth, minWidth: totalWidth }}>

          {/* ─ Ruler ─ */}
          <div
            className="relative flex-shrink-0 border-b border-gray-700"
            style={{ height: RULER_H, background: '#0f172a', overflow: 'hidden' }}
          >
            {barTicks.map(tick => (
              <div
                key={tick.x}
                className="absolute top-0 bottom-0 flex items-end pb-1 pl-1"
                style={{ left: tick.x }}
              >
                <div
                  className="absolute top-0 bottom-0"
                  style={{ left: 0, width: 1.5, background: '#4b5563' }}
                />
                <span
                  style={{
                    color: '#9ca3af',
                    fontSize: 11,
                    fontFamily: 'monospace',
                    userSelect: 'none',
                    paddingLeft: 3,
                  }}
                >
                  {tick.bar}
                </span>
              </div>
            ))}
            {beatTicks.map((tick, i) => (
              <div
                key={i}
                className="absolute top-0 bottom-0"
                style={{ left: tick.x, width: 1, background: '#1e293b' }}
              />
            ))}
            {/* Ruler cursor */}
            {showCursor && (
              <div
                className="absolute top-0 bottom-0 pointer-events-none"
                style={{ left: cursorLeft, width: 2, background: '#60a5fa', zIndex: 10 }}
              />
            )}
          </div>

          {/* ─ Grid (notes area) ─ */}
          <div
            ref={gridRef}
            className="relative"
            style={{
              width: totalWidth,
              height: ROW_H * 4,
              background: '#111827',
              userSelect: 'none',
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          >
            {/* Row backgrounds (alternating) */}
            {STRINGS.map((_, i) => (
              <div
                key={i}
                className="absolute left-0 right-0 pointer-events-none"
                style={{
                  top: i * ROW_H,
                  height: ROW_H,
                  background: i % 2 === 0 ? 'rgba(255,255,255,0.018)' : 'transparent',
                  borderBottom: '1px solid #1e293b',
                }}
              />
            ))}

            {/* Bar lines (bright) */}
            {barTicks.map(tick => (
              <div
                key={tick.x}
                className="absolute top-0 bottom-0 pointer-events-none"
                style={{ left: tick.x, width: 1, background: '#374151' }}
              />
            ))}

            {/* Beat lines (dim) */}
            {beatTicks.map((tick, i) => (
              <div
                key={i}
                className="absolute top-0 bottom-0 pointer-events-none"
                style={{ left: tick.x, width: 1, background: '#1e293b' }}
              />
            ))}

            {/* Notes */}
            {track.notes.map((note) => {
              const left  = beatToPixel(note.startBeat, pxPerBeat)
              const width = Math.max(18, beatToPixel(note.durationBeats, pxPerBeat) - 2)
              const top   = note.stringIndex * ROW_H + 5
              const c     = NOTE_COLORS[note.stringIndex]
              const sel   = note.id === selectedNoteId

              return (
                <div
                  key={note.id}
                  data-note-id={note.id}
                  style={{
                    position: 'absolute',
                    left,
                    top,
                    width,
                    height: ROW_H - 10,
                    background: c.bg,
                    border: `1.5px solid ${c.border}`,
                    borderRadius: 5,
                    cursor: 'grab',
                    boxShadow: sel
                      ? `0 0 0 2px white, 0 0 10px rgba(255,255,255,0.25)`
                      : '0 1px 4px rgba(0,0,0,0.6)',
                    display: 'flex',
                    alignItems: 'center',
                    overflow: 'hidden',
                    paddingLeft: 5,
                    zIndex: sel ? 5 : 1,
                  }}
                >
                  <span
                    style={{
                      color: c.text,
                      fontSize: 13,
                      fontWeight: 700,
                      fontFamily: 'ui-monospace, monospace',
                      lineHeight: 1,
                      pointerEvents: 'none',
                      flexShrink: 0,
                    }}
                  >
                    {note.fret}
                  </span>

                  {/* Resize handle */}
                  <div
                    data-resize="true"
                    style={{
                      position: 'absolute',
                      right: 0, top: 0,
                      width: 10,
                      height: '100%',
                      cursor: 'ew-resize',
                      background: 'rgba(255,255,255,0.12)',
                      borderLeft: '1px solid rgba(255,255,255,0.1)',
                    }}
                  />
                </div>
              )
            })}

            {/* Playback cursor */}
            {showCursor && (
              <div
                className="absolute top-0 bottom-0 pointer-events-none"
                style={{
                  left: cursorLeft,
                  width: 2,
                  background: '#60a5fa',
                  boxShadow: '0 0 8px 2px rgba(96,165,250,0.5)',
                  zIndex: 20,
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
