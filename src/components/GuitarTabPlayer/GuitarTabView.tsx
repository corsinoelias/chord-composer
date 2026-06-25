import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import type { GuitarNote, GuitarTrack, GuitarStringIndex, GuitarTechnique } from '../../lib/guitarTab/types'
import { GUITAR_STRINGS, snapToGrid, findNoteAtBeat, clampDuration } from '../../lib/guitarTab/guitarTheory'
import { previewNote } from '../../lib/guitarTab/guitarAudio'
import type { GuitarSound } from '../../lib/guitarTab/types'

// ── Layout ────────────────────────────────────────────────────────────────────
const PPB      = 80    // px per beat at zoom 1
const ROW_H    = 26    // height per string row
const RULER_H  = 22    // bar ruler height
const LABEL_W  = 34    // string name label area
const BOTTOM   = 10    // padding below last string
const SNAP     = 0.25
const NUM_STRINGS = 6

const STRING_Y = Array.from({ length: NUM_STRINGS }, (_, i) => RULER_H + i * ROW_H + ROW_H / 2)
const TOTAL_H  = RULER_H + NUM_STRINGS * ROW_H + BOTTOM

const STRING_COLORS = ['#0284c7','#7c3aed','#059669','#d97706','#ea580c','#dc2626']
const STRING_NAMES  = ['e','B','G','D','A','E']

const TECHNIQUE_LABELS: Record<GuitarTechnique, string> = {
  h: 'h', p: 'p', '/': '/', '\\': '\\', b: 'b', x: 'x',
}

interface TabViewProps {
  track: GuitarTrack
  zoom: number
  currentBeat: number
  cursorBeat: number
  isPlaying: boolean
  selectedNoteId: string | null
  sound: GuitarSound
  onAddNote: (note: GuitarNote) => void
  onUpdateNote: (id: string, patch: Partial<GuitarNote>) => void
  onDeleteNote: (id: string) => void
  onSelectNote: (id: string | null) => void
  onCursorBeatChange: (beat: number) => void
  onBeginEdit?: () => void
  onNotePreview?: (si: GuitarStringIndex, fret: number) => void
}

interface EditCursor { beat: number; stringIndex: GuitarStringIndex }

export function GuitarTabView({
  track, zoom, currentBeat, cursorBeat, isPlaying,
  selectedNoteId, sound,
  onAddNote, onUpdateNote, onDeleteNote, onSelectNote,
  onCursorBeatChange, onBeginEdit, onNotePreview,
}: TabViewProps) {
  const scrollRef    = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const fretTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [editCursor, setEditCursorState]   = useState<EditCursor | null>(null)
  const [fretBuffer,  setFretBufferState]  = useState('')
  const [hoveredNote, setHoveredNote]      = useState<string | null>(null)
  const [techPickNote, setTechPickNote]    = useState<string | null>(null)

  const editCursorRef = useRef<EditCursor | null>(null)
  const fretBufferRef = useRef('')
  const trackRef      = useRef(track)
  const soundRef      = useRef(sound)

  useEffect(() => { trackRef.current = track }, [track])
  useEffect(() => { soundRef.current = sound },  [sound])

  const setEditCursor = useCallback((v: EditCursor | null) => {
    editCursorRef.current = v; setEditCursorState(v)
  }, [])
  const setFretBuffer = useCallback((v: string) => {
    fretBufferRef.current = v; setFretBufferState(v)
  }, [])

  const totalBeats = track.totalBars * track.beatsPerBar
  const pxPerBeat  = PPB * zoom
  const svgW       = LABEL_W + totalBeats * pxPerBeat

  const beatToX = (b: number) => LABEL_W + b * pxPerBeat

  // ── Auto-scroll ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!scrollRef.current || !isPlaying) return
    const el  = scrollRef.current
    const px  = beatToX(currentBeat)
    const w   = el.clientWidth
    if (px > el.scrollLeft + w * 0.7) el.scrollLeft = px - w * 0.3
    else if (px < el.scrollLeft)       el.scrollLeft = Math.max(0, px - 20)
  }, [currentBeat, isPlaying, pxPerBeat])

  useEffect(() => {
    if (!editCursor || !scrollRef.current) return
    const el = scrollRef.current
    const px = beatToX(editCursor.beat)
    const w  = el.clientWidth
    if (px > el.scrollLeft + w * 0.8) el.scrollLeft = px - w * 0.4
    else if (px < el.scrollLeft + 40)  el.scrollLeft = Math.max(0, px - 60)
  }, [editCursor, pxPerBeat])

  // ── Commit fret ────────────────────────────────────────────────────────────
  const commitFret = useCallback((buf: string) => {
    clearTimeout(fretTimerRef.current!)
    setFretBuffer('')
    const cursor = editCursorRef.current
    if (!cursor) return
    const fret = parseInt(buf, 10)
    if (isNaN(fret) || fret < 0 || fret > 24) return
    const { notes } = trackRef.current
    const nd  = 1
    const tb  = trackRef.current.totalBars * trackRef.current.beatsPerBar
    const snd = soundRef.current
    const existing = findNoteAtBeat(notes, cursor.stringIndex, cursor.beat)
    if (existing) {
      onBeginEdit?.(); onUpdateNote(existing.id, { fret, muted: false })
      onNotePreview?.(cursor.stringIndex, fret); onSelectNote(existing.id)
    } else {
      const safeDur = clampDuration(notes, cursor.stringIndex, cursor.beat, nd, tb)
      if (safeDur <= 0) return
      onBeginEdit?.()
      const note: GuitarNote = {
        id: crypto.randomUUID(), stringIndex: cursor.stringIndex, fret,
        startBeat: cursor.beat, durationBeats: safeDur, velocity: 0.8,
      }
      onAddNote(note); onSelectNote(note.id)
      previewNote(cursor.stringIndex, fret, snd, trackRef.current.capo)
    }
    const next = Math.min(cursor.beat + 1, tb - SNAP)
    setEditCursor({ ...cursor, beat: next })
    onCursorBeatChange(next)
  }, [onBeginEdit, onUpdateNote, onAddNote, onSelectNote, onNotePreview, onCursorBeatChange, setFretBuffer, setEditCursor])

  const commitFretRef = useRef(commitFret)
  useEffect(() => { commitFretRef.current = commitFret }, [commitFret])

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

  const doMuteCurrent = useCallback(() => {
    if (isPlaying || !editCursorRef.current) return
    const cursor = editCursorRef.current
    const { notes } = trackRef.current
    const tb  = trackRef.current.totalBars * trackRef.current.beatsPerBar
    const existing = findNoteAtBeat(notes, cursor.stringIndex, cursor.beat)
    if (existing) {
      onBeginEdit?.(); onUpdateNote(existing.id, { muted: !existing.muted })
    } else {
      const safeDur = clampDuration(notes, cursor.stringIndex, cursor.beat, 1, tb)
      if (safeDur <= 0) return
      onBeginEdit?.()
      onAddNote({ id: crypto.randomUUID(), stringIndex: cursor.stringIndex, fret: 0, startBeat: cursor.beat, durationBeats: safeDur, velocity: 0.8, muted: true })
    }
    const next = Math.min(cursor.beat + 1, tb - SNAP)
    setEditCursor({ ...cursor, beat: next }); onCursorBeatChange(next)
  }, [isPlaying, onBeginEdit, onUpdateNote, onAddNote, setEditCursor, onCursorBeatChange])

  const doDelete = useCallback(() => {
    if (isPlaying || !editCursorRef.current) return
    clearTimeout(fretTimerRef.current!); setFretBuffer('')
    const cur = editCursorRef.current
    const ex  = findNoteAtBeat(trackRef.current.notes, cur.stringIndex, cur.beat)
    if (ex) { onBeginEdit?.(); onDeleteNote(ex.id); onSelectNote(null) }
  }, [isPlaying, setFretBuffer, onBeginEdit, onDeleteNote, onSelectNote])

  const doMoveBeat = useCallback((dir: 1 | -1) => {
    if (isPlaying || !editCursorRef.current) return
    clearTimeout(fretTimerRef.current!)
    if (fretBufferRef.current) { commitFretRef.current(fretBufferRef.current); return }
    const cur  = editCursorRef.current
    const tb   = trackRef.current.totalBars * trackRef.current.beatsPerBar
    const next = dir > 0
      ? Math.min(snapToGrid(cur.beat + SNAP, SNAP), tb - SNAP)
      : Math.max(0, snapToGrid(cur.beat - SNAP, SNAP))
    setEditCursor({ ...cur, beat: next }); onCursorBeatChange(next)
  }, [isPlaying, setEditCursor, onCursorBeatChange])

  const doMoveString = useCallback((delta: number) => {
    if (isPlaying || !editCursorRef.current) return
    const cur  = editCursorRef.current
    const next = Math.max(0, Math.min(5, cur.stringIndex + delta))
    setEditCursor({ ...cur, stringIndex: next as GuitarStringIndex })
  }, [isPlaying, setEditCursor])

  const doDismiss = useCallback(() => {
    clearTimeout(fretTimerRef.current!); setFretBuffer(''); setEditCursor(null); onSelectNote(null)
  }, [setFretBuffer, setEditCursor, onSelectNote])

  const doConfirm = useCallback(() => {
    if (isPlaying || !editCursorRef.current) return
    if (fretBufferRef.current) { commitFretRef.current(fretBufferRef.current); return }
    const cur  = editCursorRef.current
    const tb   = trackRef.current.totalBars * trackRef.current.beatsPerBar
    const next = Math.min(cur.beat + 1, tb - SNAP)
    setEditCursor({ ...cur, beat: next }); onCursorBeatChange(next)
  }, [isPlaying, setEditCursor, onCursorBeatChange])

  // ── Keyboard ──────────────────────────────────────────────────────────────
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
    if (e.key === 'x' || e.key === 'X') { e.preventDefault(); doMuteCurrent(); return }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); doConfirm(); return }
    if (e.key === 'Backspace')  { e.preventDefault(); doDelete(); return }
    if (e.key === 'Delete')     { e.preventDefault(); doDelete(); return }
    if (e.key === 'Escape')     { e.preventDefault(); doDismiss(); return }
    if (e.key === 'ArrowRight') { e.preventDefault(); doMoveBeat(1); return }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); doMoveBeat(-1); return }
    if (e.key === 'ArrowUp')    { e.preventDefault(); doMoveString(-1); return }
    if (e.key === 'ArrowDown')  { e.preventDefault(); doMoveString(1); return }
  }, [isPlaying, doConfirm, doDelete, doDismiss, doMoveBeat, doMoveString, doMuteCurrent, setFretBuffer])

  // ── Click on SVG → set edit cursor ───────────────────────────────────────
  const handleSvgClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (isPlaying) return
    const target = e.target as SVGElement
    if (target.dataset.noteTarget) return
    const rect  = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
    const rawX  = e.clientX - rect.left + (scrollRef.current?.scrollLeft ?? 0)
    const rawY  = e.clientY - rect.top
    const beat  = snapToGrid(Math.max(0, (rawX - LABEL_W) / pxPerBeat), SNAP)
    if (beat >= totalBeats) return
    const si = Math.max(0, Math.min(5, Math.floor((rawY - RULER_H) / ROW_H))) as GuitarStringIndex
    clearTimeout(fretTimerRef.current!); setFretBuffer('')
    setEditCursor({ beat, stringIndex: si }); onCursorBeatChange(beat)
    containerRef.current?.focus()
  }, [isPlaying, pxPerBeat, totalBeats, setFretBuffer, setEditCursor, onCursorBeatChange])

  // ── Note click ───────────────────────────────────────────────────────────
  const handleNoteClick = useCallback((note: GuitarNote) => (e: React.MouseEvent) => {
    e.stopPropagation()
    clearTimeout(fretTimerRef.current!); setFretBuffer('')
    setEditCursor({ beat: note.startBeat, stringIndex: note.stringIndex })
    onSelectNote(note.id)
    if (!note.muted) onNotePreview?.(note.stringIndex, note.fret)
    onCursorBeatChange(note.startBeat)
    containerRef.current?.focus()
  }, [setFretBuffer, setEditCursor, onSelectNote, onNotePreview, onCursorBeatChange])

  // ── Pre-compute: next note per string ────────────────────────────────────
  const nextNoteMap = useMemo(() => {
    const map = new Map<string, GuitarNote | undefined>()
    const byString: GuitarNote[][] = Array.from({ length: 6 }, () => [])
    for (const n of track.notes) byString[n.stringIndex].push(n)
    for (const row of byString) {
      row.sort((a, b) => a.startBeat - b.startBeat)
      for (let i = 0; i < row.length - 1; i++) map.set(row[i].id, row[i + 1])
    }
    return map
  }, [track.notes])

  // ── Render ────────────────────────────────────────────────────────────────
  const totalBars   = track.totalBars
  const bpb         = track.beatsPerBar
  const activeBeat  = isPlaying ? currentBeat : cursorBeat
  const cursorX     = beatToX(activeBeat)

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      style={{ flex: 1, display: 'flex', flexDirection: 'column', outline: 'none', overflow: 'hidden' }}
    >
      {/* Scrollable tab area */}
      <div
        ref={scrollRef}
        style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden', position: 'relative', background: '#ffffff', minHeight: TOTAL_H }}
      >
        <svg
          width={svgW}
          height={TOTAL_H}
          style={{ display: 'block', cursor: isPlaying ? 'default' : 'crosshair', userSelect: 'none' }}
          onClick={handleSvgClick}
        >
          {/* ── Background rows (alternating) */}
          {Array.from({ length: NUM_STRINGS }, (_, si) => (
            <rect key={`bg${si}`}
              x={0} y={RULER_H + si * ROW_H} width={svgW} height={ROW_H}
              fill={si % 2 === 0 ? '#fafafa' : '#ffffff'}
            />
          ))}

          {/* ── Ruler: bar numbers */}
          <rect x={0} y={0} width={svgW} height={RULER_H} fill="#f8fafc" />
          {Array.from({ length: totalBars }, (_, b) => {
            const x = LABEL_W + b * bpb * pxPerBeat
            return (
              <text key={`br${b}`} x={x + 4} y={14}
                fontSize={9} fill="#94a3b8" fontFamily="ui-monospace, monospace">
                {b + 1}
              </text>
            )
          })}

          {/* ── String lines */}
          {Array.from({ length: NUM_STRINGS }, (_, si) => {
            const y = STRING_Y[si]
            return (
              <g key={`sl${si}`}>
                {/* Label */}
                <text x={LABEL_W - 6} y={y + 4} textAnchor="end"
                  fontSize={11} fontWeight="bold" fontFamily="ui-monospace, monospace"
                  fill={STRING_COLORS[si]} style={{ pointerEvents: 'none' }}>
                  {STRING_NAMES[si]}
                </text>
                {/* String line */}
                <line x1={LABEL_W} y1={y} x2={svgW} y2={y}
                  stroke="#d1d5db" strokeWidth={si === 0 ? 1 : si <= 1 ? 1.2 : si <= 3 ? 1.5 : si <= 4 ? 2 : 2.5}
                  style={{ pointerEvents: 'none' }} />
              </g>
            )
          })}

          {/* ── Beat sub-dividers */}
          {Array.from({ length: totalBars * bpb - 1 }, (_, i) => {
            const isBar = (i + 1) % bpb === 0
            if (isBar) return null
            const x = LABEL_W + (i + 1) * pxPerBeat
            return <line key={`beat${i}`} x1={x} y1={RULER_H + 2} x2={x} y2={TOTAL_H - 2}
              stroke="#f1f5f9" strokeWidth={1} style={{ pointerEvents: 'none' }} />
          })}

          {/* ── Bar lines */}
          {Array.from({ length: totalBars + 1 }, (_, b) => {
            const x = LABEL_W + b * bpb * pxPerBeat
            const thick = b === 0 || b === totalBars
            return <line key={`bar${b}`} x1={x} y1={RULER_H} x2={x} y2={TOTAL_H - BOTTOM}
              stroke="#94a3b8" strokeWidth={thick ? 1.5 : 0.8} style={{ pointerEvents: 'none' }} />
          })}

          {/* ── Edit cursor column highlight */}
          {editCursor && !isPlaying && (
            <>
              <rect
                x={beatToX(editCursor.beat) - 12} y={RULER_H}
                width={24} height={NUM_STRINGS * ROW_H}
                fill="rgba(124,58,237,0.05)" style={{ pointerEvents: 'none' }} />
              <rect
                x={beatToX(editCursor.beat) - 14}
                y={RULER_H + editCursor.stringIndex * ROW_H + 2}
                width={28} height={ROW_H - 4} rx={4}
                fill="rgba(124,58,237,0.10)" style={{ pointerEvents: 'none' }} />
              {/* Fret buffer preview */}
              {fretBuffer && (
                <text
                  x={beatToX(editCursor.beat)}
                  y={STRING_Y[editCursor.stringIndex] + 4}
                  textAnchor="middle" fontSize={13} fontWeight={700}
                  fill="#7c3aed" fontFamily="ui-monospace, monospace"
                  style={{ pointerEvents: 'none' }}>
                  {fretBuffer}_
                </text>
              )}
            </>
          )}

          {/* ── Notes */}
          {track.notes.map(note => {
            const x   = beatToX(note.startBeat)
            const y   = STRING_Y[note.stringIndex]
            const isActive   = currentBeat >= note.startBeat && currentBeat < note.startBeat + note.durationBeats
            const isSelected = note.id === selectedNoteId
            const isHovered  = note.id === hoveredNote

            const strColor = STRING_COLORS[note.stringIndex]
            const textColor = isActive ? strColor : isSelected ? '#7c3aed' : '#1e293b'
            const label = note.muted ? 'x' : String(note.fret)
            const numW  = label.length > 1 ? 18 : 14

            // Technique marker between this note and the next
            const nextNote = nextNoteMap.get(note.id)
            const techChar = note.technique ? TECHNIQUE_LABELS[note.technique] : null

            return (
              <g key={note.id}>
                {/* White gap on string line behind the number */}
                <rect
                  x={x - numW / 2 - 1} y={y - 10} width={numW + 2} height={20}
                  fill={isActive ? '#fffbf0' : isSelected ? '#f5f3ff' : isHovered ? '#f8fafc' : '#ffffff'}
                  rx={2} style={{ pointerEvents: 'none' }} />

                {/* Active glow */}
                {isActive && (
                  <rect x={x - numW / 2 - 3} y={y - 11} width={numW + 6} height={22}
                    rx={4} fill="none" stroke={strColor} strokeWidth={1.5}
                    style={{ pointerEvents: 'none' }} />
                )}
                {isSelected && !isActive && (
                  <rect x={x - numW / 2 - 2} y={y - 11} width={numW + 4} height={22}
                    rx={4} fill="none" stroke="#7c3aed" strokeWidth={1.5} strokeDasharray="3,2"
                    style={{ pointerEvents: 'none' }} />
                )}

                {/* Fret number / mute */}
                <text
                  x={x} y={y + 4}
                  textAnchor="middle" fontSize={note.muted ? 12 : 13} fontWeight={isActive || isSelected ? 700 : 600}
                  fontFamily="ui-monospace, monospace"
                  fill={note.muted ? '#94a3b8' : textColor}
                  fontStyle={note.muted ? 'italic' : 'normal'}
                  style={{ pointerEvents: 'none' }} >
                  {label}
                </text>

                {/* Invisible hit area */}
                <rect
                  x={x - numW / 2 - 4} y={y - 12} width={numW + 8} height={24}
                  fill="transparent"
                  data-note-target="1"
                  style={{ cursor: 'pointer' }}
                  onClick={handleNoteClick(note)}
                  onMouseEnter={() => setHoveredNote(note.id)}
                  onMouseLeave={() => setHoveredNote(null)}
                />

                {/* Technique marker between this note and next */}
                {techChar && nextNote && (
                  <text
                    x={(x + beatToX(nextNote.startBeat)) / 2}
                    y={y + 4}
                    textAnchor="middle" fontSize={10} fontWeight={400}
                    fontFamily="ui-monospace, monospace" fill="#94a3b8"
                    style={{ pointerEvents: 'none' }}>
                    {techChar}
                  </text>
                )}

                {/* Duration line extension (when duration > 1 beat, draw a tie line) */}
                {note.durationBeats > 1.5 && (
                  <line
                    x1={x + numW / 2 + 2} y1={y} x2={beatToX(note.startBeat + note.durationBeats) - 4} y2={y}
                    stroke={strColor} strokeWidth={1.5} strokeDasharray="3,3" opacity={0.4}
                    style={{ pointerEvents: 'none' }} />
                )}
              </g>
            )
          })}

          {/* ── Section labels */}
          {(track.sections ?? []).map(sec => {
            const x = LABEL_W + sec.startBar * bpb * pxPerBeat + 3
            return (
              <text key={sec.startBar} x={x} y={12}
                fontSize={9} fontWeight={600} fill="#7c3aed" fontFamily="ui-monospace, monospace"
                style={{ pointerEvents: 'none' }}>
                {sec.name}
              </text>
            )
          })}

          {/* ── Playback / edit cursor line */}
          <line
            x1={cursorX} x2={cursorX} y1={RULER_H} y2={TOTAL_H - BOTTOM}
            stroke={isPlaying ? '#ef4444' : 'rgba(124,58,237,0.7)'}
            strokeWidth={isPlaying ? 1.5 : 1}
            style={{ pointerEvents: 'none' }} />
          <polygon
            points={`${cursorX - 5},${RULER_H} ${cursorX + 5},${RULER_H} ${cursorX},${RULER_H + 9}`}
            fill={isPlaying ? '#ef4444' : 'rgba(124,58,237,0.7)'}
            style={{ pointerEvents: 'none' }} />
        </svg>
      </div>

      {/* ── Status bar */}
      {editCursor && !isPlaying && (
        <div style={{ flexShrink: 0, height: 28, background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 16, paddingLeft: 14, paddingRight: 14, fontFamily: "ui-monospace, 'SF Mono', monospace", fontSize: 11 }}>
          <span style={{ color: STRING_COLORS[editCursor.stringIndex], fontWeight: 700 }}>
            {STRING_NAMES[editCursor.stringIndex]}
          </span>
          <span style={{ color: '#64748b' }}>
            bar {Math.floor(editCursor.beat / track.beatsPerBar) + 1} · beat {(editCursor.beat % track.beatsPerBar + 1).toFixed(editCursor.beat % 1 === 0 ? 0 : 2)}
          </span>
          {fretBuffer
            ? <span style={{ color: '#1e293b' }}>fret: <strong style={{ color: '#7c3aed', fontSize: 13 }}>{fretBuffer}</strong>_</span>
            : <span style={{ color: '#94a3b8' }}>type fret · x=mute · ←→ move · ↑↓ string · Del delete</span>
          }
          {/* Technique picker for selected note */}
          {selectedNoteId && track.notes.find(n => n.id === selectedNoteId) && !fretBuffer && (
            <TechniquePicker
              current={track.notes.find(n => n.id === selectedNoteId)?.technique}
              onChange={t => { onBeginEdit?.(); onUpdateNote(selectedNoteId, { technique: t }) }}
            />
          )}
        </div>
      )}

      {/* ── Mobile numpad */}
      {editCursor && !isPlaying && (
        <MobileNumpad
          editCursor={editCursor}
          onDigit={doAppendDigit}
          onDelete={doDelete}
          onDismiss={doDismiss}
          onMoveString={doMoveString}
          onMoveBeat={doMoveBeat}
          onMute={doMuteCurrent}
        />
      )}
    </div>
  )
}

// ── Technique picker ──────────────────────────────────────────────────────────
const TECH_OPTIONS: Array<{ value: GuitarTechnique | undefined; label: string; title: string }> = [
  { value: undefined, label: '—',  title: 'No technique' },
  { value: 'h',       label: 'h',  title: 'Hammer-on' },
  { value: 'p',       label: 'p',  title: 'Pull-off' },
  { value: '/',       label: '/',  title: 'Slide up' },
  { value: '\\',      label: '\\', title: 'Slide down' },
  { value: 'b',       label: 'b',  title: 'Bend' },
]

function TechniquePicker({ current, onChange }: { current?: GuitarTechnique; onChange: (t: GuitarTechnique | undefined) => void }) {
  return (
    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 3 }}>
      <span style={{ color: '#94a3b8', fontSize: 10, marginRight: 4 }}>technique:</span>
      {TECH_OPTIONS.map(o => (
        <button key={String(o.value)} title={o.title}
          onClick={() => onChange(o.value)}
          style={{ width: 24, height: 20, borderRadius: 4, border: `1px solid ${current === o.value ? '#7c3aed' : '#e2e8f0'}`, background: current === o.value ? '#ede9fe' : '#ffffff', color: current === o.value ? '#7c3aed' : '#64748b', fontSize: 11, fontFamily: 'ui-monospace, monospace', cursor: 'pointer', fontWeight: 600, lineHeight: 1 }}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ── Mobile numpad ─────────────────────────────────────────────────────────────
function MobileNumpad({ editCursor, onDigit, onDelete, onDismiss, onMoveString, onMoveBeat, onMute }: {
  editCursor: EditCursor
  onDigit: (d: string) => void
  onDelete: () => void
  onDismiss: () => void
  onMoveString: (d: number) => void
  onMoveBeat: (d: 1 | -1) => void
  onMute: () => void
}) {
  const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches
  if (!isMobile) return null

  return (
    <div style={{ flexShrink: 0, background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
      {/* Navigation row */}
      <div style={{ display: 'flex', gap: 3, padding: '4px 4px 2px' }}>
        {STRING_NAMES.map((name, si) => (
          <NBtn key={name} active={editCursor.stringIndex === si} color={STRING_COLORS[si]}
            onPress={() => onMoveString(si - editCursor.stringIndex)}>{name}</NBtn>
        ))}
        <div style={{ flex: 1 }} />
        <NBtn onPress={() => onMoveBeat(-1)}>←</NBtn>
        <NBtn onPress={() => onMoveBeat(1)}>→</NBtn>
        <div style={{ flex: 1 }} />
        <NBtn onPress={onMute}>x</NBtn>
        <NBtn onPress={onDelete}>⌫</NBtn>
        <NBtn onPress={onDismiss} danger>✕</NBtn>
      </div>
      {/* Digit row */}
      <div style={{ display: 'flex', gap: 3, padding: '2px 4px 6px' }}>
        {['1','2','3','4','5','6','7','8','9','0'].map(d => (
          <NBtn key={d} onPress={() => onDigit(d)}>{d}</NBtn>
        ))}
        <NBtn onPress={() => onDigit('10')}>10</NBtn>
        <NBtn onPress={() => onDigit('12')}>12</NBtn>
      </div>
    </div>
  )
}

function NBtn({ children, onPress, active, danger, color }: {
  children: React.ReactNode; onPress: () => void; active?: boolean; danger?: boolean; color?: string
}) {
  return (
    <button
      onPointerDown={e => { e.preventDefault(); onPress() }}
      style={{ flex: 1, minWidth: 0, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', background: active ? (color ? `${color}22` : '#ede9fe') : '#ffffff', border: `1px solid ${active ? (color ?? '#7c3aed') : '#e2e8f0'}`, borderRadius: 6, color: danger ? '#dc2626' : active ? (color ?? '#7c3aed') : '#374151', fontSize: 14, fontFamily: "'Inter', ui-sans-serif, sans-serif", fontWeight: active ? 700 : 400, cursor: 'pointer', touchAction: 'manipulation', userSelect: 'none', WebkitTapHighlightColor: 'transparent' }}>
      {children}
    </button>
  )
}
