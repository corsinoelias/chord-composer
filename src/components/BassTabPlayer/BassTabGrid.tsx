import React, { useRef, useCallback, useState, useLayoutEffect, useEffect } from 'react'
import { type BassNote, type BassTrack, type SnapValue, type StringIndex } from '../../lib/bassTab/types'
import { STRINGS, snapToGrid, beatToPixel, pixelToBeat } from '../../lib/bassTab/bassTheory'

export const PPB    = 80   // base pixels-per-beat at zoom=1
const ROW_H_MIN     = 64
const RULER_H       = 32
const LABEL_W       = 58

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
  snap: SnapValue
  currentBeat: number
  cursorBeat: number
  isPlaying: boolean
  selectedNoteId: string | null
  onAddNote: (note: BassNote) => void
  onUpdateNote: (id: string, patch: Partial<BassNote>) => void
  onDeleteNote: (id: string) => void
  onSelectNote: (id: string | null) => void
  onCursorBeatChange: (beat: number) => void
  onZoomChange: (zoom: number) => void
  onBeginEdit?: () => void
}

export function BassTabGrid({
  track, zoom, snap, currentBeat, cursorBeat, isPlaying, selectedNoteId,
  onAddNote, onUpdateNote, onDeleteNote, onSelectNote,
  onCursorBeatChange, onZoomChange, onBeginEdit,
}: GridProps) {
  const outerRef  = useRef<HTMLDivElement>(null)
  const gridRef   = useRef<HTMLDivElement>(null)
  const rulerRef  = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const dragRef   = useRef<DragOp | null>(null)
  const dblRef    = useRef<{ id: string; time: number } | null>(null)

  // ── Dynamic row height ────────────────────────────────────────────────────
  const [rowH, setRowH] = useState(ROW_H_MIN)
  useLayoutEffect(() => {
    const el = outerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const h = entries[0]?.contentRect.height ?? (ROW_H_MIN * 4 + RULER_H)
      setRowH(Math.max(ROW_H_MIN, Math.floor((h - RULER_H) / 4)))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const pxPerBeat  = PPB * zoom
  const totalBeats = track.totalBars * track.beatsPerBar
  const totalWidth = totalBeats * pxPerBeat

  // ── Auto-scroll to follow playhead ────────────────────────────────────────
  useEffect(() => {
    if (!isPlaying || !scrollRef.current) return
    const el   = scrollRef.current
    const px   = beatToPixel(currentBeat, pxPerBeat)
    const w    = el.clientWidth
    const left = el.scrollLeft
    if (px > left + w * 0.75) {
      el.scrollLeft = px - w * 0.25
    } else if (px < left) {
      el.scrollLeft = Math.max(0, px - w * 0.1)
    }
  }, [currentBeat, isPlaying, pxPerBeat])

  const contentX = (clientX: number) => {
    const rect = gridRef.current!.getBoundingClientRect()
    return clientX - rect.left
  }
  const contentY = (clientY: number) => {
    const rect = gridRef.current!.getBoundingClientRect()
    return clientY - rect.top
  }

  // ── Ruler click ────────────────────────────────────────────────────────────
  const handleRulerPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const rect = rulerRef.current!.getBoundingClientRect()
    const x = e.clientX - rect.left
    const beat = Math.max(0, Math.min(totalBeats, snapToGrid(pixelToBeat(x, pxPerBeat), snap)))
    onCursorBeatChange(beat)
  }, [pxPerBeat, snap, totalBeats, onCursorBeatChange])

  // ── Main grid pointer events ───────────────────────────────────────────────
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    const target   = e.target as HTMLElement
    const noteEl   = target.closest('[data-note-id]')  as HTMLElement | null
    const resizeEl = target.closest('[data-resize]')   as HTMLElement | null

    gridRef.current?.setPointerCapture(e.pointerId)

    if (noteEl) {
      const noteId = noteEl.dataset.noteId!
      const note   = track.notes.find(n => n.id === noteId)
      if (!note) return

      const now = Date.now()
      if (dblRef.current?.id === noteId && now - dblRef.current.time < 380) {
        onBeginEdit?.()
        onDeleteNote(noteId)
        dblRef.current = null
        dragRef.current = null
        return
      }
      dblRef.current = { id: noteId, time: now }
      onSelectNote(noteId)

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
      const x = contentX(e.clientX)
      const y = contentY(e.clientY)
      if (y < 0 || y > rowH * 4) return

      const beat        = Math.max(0, snapToGrid(pixelToBeat(x, pxPerBeat), snap))
      const stringIndex = Math.max(0, Math.min(3, Math.floor(y / rowH))) as StringIndex

      onBeginEdit?.()
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
      onCursorBeatChange(beat + newNote.durationBeats)
      dragRef.current = { type: 'create', noteId: newNote.id, startX: e.clientX, origDuration: newNote.durationBeats }
      dblRef.current = null
    }
  }, [track.notes, pxPerBeat, snap, rowH, onAddNote, onDeleteNote, onSelectNote, onCursorBeatChange, onBeginEdit])

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const op = dragRef.current
    if (!op) return
    const dx        = e.clientX - op.startX
    const deltaBeat = pixelToBeat(dx, pxPerBeat)

    if (op.type === 'create' || op.type === 'resize') {
      const newDuration = Math.max(snap, snapToGrid(op.origDuration + deltaBeat, snap))
      onUpdateNote(op.noteId, { durationBeats: newDuration })
    } else if (op.type === 'move') {
      const dy        = e.clientY - op.startY
      const newBeat   = Math.max(0, snapToGrid(op.origBeat + deltaBeat, snap))
      const strDelta  = Math.round(dy / rowH)
      const newString = Math.max(0, Math.min(3, op.origString + strDelta)) as StringIndex
      onUpdateNote(op.noteId, { startBeat: newBeat, stringIndex: newString })
    }
  }, [pxPerBeat, snap, rowH, onUpdateNote])

  const handlePointerUp = useCallback(() => { dragRef.current = null }, [])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      onZoomChange(Math.max(0.4, Math.min(4, zoom + (e.deltaY < 0 ? 0.15 : -0.15))))
    }
  }, [zoom, onZoomChange])

  // ── Ruler ticks ──────────────────────────────────────────────────────────
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

  return (
    <div ref={outerRef} className="flex flex-1 min-h-0" style={{ overflow: 'hidden' }}>

      {/* String-label column */}
      <div
        className="flex-shrink-0 flex flex-col border-r border-gray-700 z-10"
        style={{ width: LABEL_W, background: '#0a0a12' }}
      >
        <div style={{ height: RULER_H, flexShrink: 0, borderBottom: '1px solid #1e293b' }} />
        {STRINGS.map((s) => (
          <div
            key={s.index}
            className="flex items-center justify-center flex-1"
            style={{ borderBottom: '1px solid #1e293b', minHeight: ROW_H_MIN }}
          >
            <span className="text-xs font-bold font-mono" style={{ color: s.color }}>{s.displayName}</span>
          </div>
        ))}
      </div>

      {/* Scrollable content */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-x-auto overflow-y-hidden"
        onWheel={handleWheel}
        style={{ cursor: 'crosshair' }}
      >
        <div style={{ width: totalWidth, minWidth: totalWidth }}>

          {/* Ruler */}
          <div
            ref={rulerRef}
            style={{
              height: RULER_H, width: totalWidth,
              position: 'relative', background: '#090912',
              borderBottom: '1px solid #1e293b',
              cursor: 'col-resize', userSelect: 'none',
            }}
            onPointerDown={handleRulerPointerDown}
          >
            {barTicks.map(tick => (
              <div key={tick.x} style={{ position:'absolute', left:tick.x, top:0, bottom:0, display:'flex', alignItems:'flex-end', paddingBottom:5, paddingLeft:4 }}>
                <div style={{ position:'absolute', left:0, top:0, bottom:0, width:1.5, background:'#374151' }} />
                <span style={{ color:'#6b7280', fontSize:11, fontFamily:'monospace', userSelect:'none', paddingLeft:3 }}>{tick.bar}</span>
              </div>
            ))}
            {beatTicks.map((tick, i) => (
              <div key={i} style={{ position:'absolute', left:tick.x, top:0, bottom:0, width:1, background:'#1a1a2e' }} />
            ))}
            {/* Insertion cursor ▼ */}
            <div style={{ position:'absolute', left:insertionLeft, top:0, height:'100%', width:2, background:'#e2e8f0', opacity:0.85, pointerEvents:'none', zIndex:10 }}>
              <div style={{ position:'absolute', bottom:-1, left:'50%', transform:'translateX(-50%)', width:0, height:0, borderLeft:'5px solid transparent', borderRight:'5px solid transparent', borderTop:'6px solid #e2e8f0' }} />
            </div>
            {/* Playhead on ruler */}
            {showPlayhead && (
              <div style={{ position:'absolute', left:playheadLeft, top:0, height:'100%', width:2, background:'#60a5fa', pointerEvents:'none', zIndex:11 }} />
            )}
          </div>

          {/* Notes area */}
          <div
            ref={gridRef}
            style={{ width:totalWidth, height:rowH*4, position:'relative', background:'#0d0d1a', userSelect:'none', touchAction:'none' }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            {/* Row backgrounds */}
            {STRINGS.map((_, i) => (
              <div key={i} style={{ position:'absolute', left:0, right:0, top:i*rowH, height:rowH, background:i%2===0?'rgba(255,255,255,0.018)':'transparent', borderBottom:'1px solid #141428', pointerEvents:'none' }} />
            ))}
            {/* Bar lines */}
            {barTicks.map(tick => (
              <div key={tick.x} style={{ position:'absolute', left:tick.x, top:0, width:1, height:'100%', background:'#1e2035', pointerEvents:'none' }} />
            ))}
            {/* Beat lines */}
            {beatTicks.map((tick, i) => (
              <div key={i} style={{ position:'absolute', left:tick.x, top:0, width:1, height:'100%', background:'#11111e', pointerEvents:'none' }} />
            ))}

            {/* Empty hint */}
            {track.notes.length === 0 && (
              <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', textAlign:'center', pointerEvents:'none' }}>
                <p style={{ color:'#2d3748', fontSize:12, fontFamily:'monospace', margin:0 }}>Tap a fret above ↑ — or click here to add a note</p>
              </div>
            )}

            {/* Notes */}
            {track.notes.map((note) => {
              const left  = beatToPixel(note.startBeat, pxPerBeat)
              const width = Math.max(20, beatToPixel(note.durationBeats, pxPerBeat) - 2)
              const top   = note.stringIndex * rowH + 6
              const c     = NOTE_COLORS[note.stringIndex]
              const sel   = note.id === selectedNoteId
              const noteH = rowH - 12
              return (
                <div
                  key={note.id}
                  data-note-id={note.id}
                  style={{
                    position:'absolute', left, top, width, height:noteH,
                    background:c.bg, border:`1.5px solid ${c.border}`,
                    borderRadius:5, cursor:'grab',
                    boxShadow: sel ? `0 0 0 2px #fff, 0 0 12px rgba(255,255,255,0.2)` : '0 2px 6px rgba(0,0,0,0.6)',
                    display:'flex', alignItems:'center', overflow:'hidden', paddingLeft:6,
                    zIndex: sel ? 5 : 2, touchAction:'none',
                  }}
                >
                  <span style={{ color:'#fff', fontSize:noteH>32?14:11, fontWeight:700, fontFamily:'ui-monospace,monospace', lineHeight:1, pointerEvents:'none', flexShrink:0 }}>
                    {note.fret}
                  </span>
                  <div
                    data-resize="true"
                    style={{
                      position:'absolute', right:0, top:0, width:14, height:'100%',
                      cursor:'ew-resize', background:'rgba(255,255,255,0.08)',
                      borderLeft:'1px solid rgba(255,255,255,0.08)', touchAction:'none',
                    }}
                  />
                </div>
              )
            })}

            {/* Insertion cursor */}
            <div style={{ position:'absolute', left:insertionLeft, top:0, height:'100%', width:1.5, background:'#e2e8f0', opacity:0.5, pointerEvents:'none', zIndex:15 }} />
            {/* Playback cursor */}
            {showPlayhead && (
              <div style={{ position:'absolute', left:playheadLeft, top:0, height:'100%', width:2, background:'#60a5fa', boxShadow:'0 0 8px 2px rgba(96,165,250,0.45)', pointerEvents:'none', zIndex:20 }} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
