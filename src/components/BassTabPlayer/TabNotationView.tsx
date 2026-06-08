import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import {
  Renderer, Stave, StaveNote,
  Formatter, Voice, Beam, Accidental,
  type RenderContext,
} from 'vexflow'
import {
  type BassNote, type BassTrack, type SnapValue, type StringIndex,
  type BassSound, type TrackSection,
} from '../../lib/bassTab/types'
import {
  STRING_Y, STAFF_H, ABOVE_H, BELOW_H, LABEL_W, PPB,
  TICK_OFFSET, TICK_H,
  beatToX, barLineX, xToBeat, yToStringIndex, svgTotalWidth,
  buildStringPath, computeBeamGroups,
} from '../../lib/bassTab/tabNotation'
import { snapToGrid, findNoteAtBeat, clampDuration } from '../../lib/bassTab/bassTheory'
import { previewNote } from '../../lib/bassTab/bassAudio'
import { useIsMobile } from '../../hooks/use-mobile'

// ── Layout constants ──────────────────────────────────────────────────────
// VexFlow handles only the standard notation stave (top).
// The tab stave is rendered manually in the overlay SVG (no VexFlow TabStave).
const VF_NOTA_Y   = 14   // stave y; VexFlow's spaceAboveStaffLn:4 × 10px → first line at y+40
const VF_NOTA_H   = 92   // notation stave bounding box height

const TAB_SEP     = 18   // gap between notation bottom and first tab string
const TAB_SPACING = 12   // px between strings (matches STRING_Y in tabNotation.ts)
const TAB_AREA_Y  = VF_NOTA_Y + VF_NOTA_H + TAB_SEP   // y of G string (top string)
const TAB_AREA_H  = TAB_SPACING * 3 + 20               // 36px strings + 20px padding below E
const VF_TOTAL_H  = TAB_AREA_Y + TAB_AREA_H

// Overlay constants (used by click detection and cursors)
const TAB_OVERLAY_Y       = TAB_AREA_Y
const TAB_OVERLAY_STAFF_H = TAB_SPACING * 3   // 36px

const STRING_LABELS = ['G', 'D', 'A', 'E']

// ── Duration helpers ──────────────────────────────────────────────────────
interface VfDur { dur: string; dots: number }

function beatsToVfDur(beats: number): VfDur {
  const b = Math.round(beats * 16) / 16
  if (b >= 4)     return { dur: 'w',  dots: 0 }
  if (b >= 3)     return { dur: 'h',  dots: 1 }
  if (b >= 2)     return { dur: 'h',  dots: 0 }
  if (b >= 1.5)   return { dur: 'q',  dots: 1 }
  if (b >= 1)     return { dur: 'q',  dots: 0 }
  if (b >= 0.75)  return { dur: '8',  dots: 1 }
  if (b >= 0.5)   return { dur: '8',  dots: 0 }
  if (b >= 0.375) return { dur: '16', dots: 1 }
  return               { dur: '16', dots: 0 }
}

function vfDurBeats(dur: string, dots: number): number {
  const b: Record<string, number> = { w: 4, h: 2, q: 1, '8': 0.5, '16': 0.25 }
  return (b[dur] ?? 1) * (dots > 0 ? 1.5 : 1)
}

// ── MIDI → VexFlow key string ─────────────────────────────────────────────
const CHROMATIC_KEYS = [
  ['c',''], ['c','#'], ['d',''], ['d','#'], ['e',''],
  ['f',''], ['f','#'], ['g',''], ['g','#'], ['a',''],
  ['a','#'], ['b',''],
] as const

function midiToVfKey(midi: number): { key: string; acc: string | null } {
  const pc  = ((midi % 12) + 12) % 12
  const oct = Math.floor(midi / 12) - 1
  const [note, acc] = CHROMATIC_KEYS[pc]
  return { key: `${note}${acc}/${oct}`, acc: acc || null }
}

const OPEN_MIDI = [55, 50, 45, 40] as const  // G D A E
function fretToMidi(si: 0|1|2|3, fret: number) { return OPEN_MIDI[si] + fret }

// ── Build StaveNote list for one bar (notation only — tab is rendered manually) ──
function buildBarNotes(
  notes: BassNote[],
  barStart: number,
  bpb: number,
): { staveNotes: StaveNote[] } {
  const barNotes = notes
    .filter(n => n.startBeat >= barStart && n.startBeat < barStart + bpb)
    .sort((a, b) => a.startBeat - b.startBeat)

  const staveNotes: StaveNote[] = []
  let cursor = barStart

  for (const note of barNotes) {
    const gap = note.startBeat - cursor
    if (gap > 0.02) {
      let rem = gap
      while (rem > 0.02) {
        const { dur, dots } = beatsToVfDur(rem)
        const actual = vfDurBeats(dur, dots)
        const restDur = dots > 0 ? `${dur}dr` : `${dur}r`
        staveNotes.push(new StaveNote({ clef: 'bass', keys: ['d/3'], duration: restDur }))
        rem -= actual
        cursor += actual
      }
    }

    const midi = fretToMidi(note.stringIndex as 0|1|2|3, note.fret)
    const { key, acc } = midiToVfKey(midi)
    const { dur, dots } = beatsToVfDur(note.durationBeats)
    const noteDur = dots > 0 ? `${dur}d` : dur
    const sn = new StaveNote({ clef: 'bass', keys: [key], duration: noteDur })
    if (acc) sn.addModifier(new Accidental(acc), 0)
    ;(sn as any)._bassNoteId = note.id
    staveNotes.push(sn)
    cursor += note.durationBeats
  }

  const tail = barStart + bpb - cursor
  if (tail > 0.02) {
    let rem = tail
    while (rem > 0.02) {
      const { dur, dots } = beatsToVfDur(rem)
      const actual = vfDurBeats(dur, dots)
      const tailDur = dots > 0 ? `${dur}dr` : `${dur}r`
      staveNotes.push(new StaveNote({ clef: 'bass', keys: ['d/3'], duration: tailDur }))
      rem -= actual
      cursor += actual
    }
  }

  return { staveNotes }
}

// ── Types ─────────────────────────────────────────────────────────────────
interface EditCursor { beat: number; stringIndex: StringIndex }

export interface TabNotationViewProps {
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
  fitWidth?: boolean
  onFitZoomChange?: (z: number) => void
}

// ── Component ─────────────────────────────────────────────────────────────
export function TabNotationView({
  track, zoom, snap, currentBeat, cursorBeat, isPlaying,
  selectedNoteId, sound, noteDuration,
  onAddNote, onUpdateNote, onDeleteNote, onSelectNote,
  onCursorBeatChange, onBeginEdit, onSectionChange,
  fitWidth = false, onFitZoomChange,
}: TabNotationViewProps) {
  const isMobile         = useIsMobile()
  const containerRef     = useRef<HTMLDivElement>(null)
  const scrollRef        = useRef<HTMLDivElement>(null)
  const vexflowRef       = useRef<HTMLDivElement>(null)
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
  const snapRef         = useRef(snap)
  const soundRef        = useRef(sound)
  const totalBeatsRef   = useRef(track.totalBars * track.beatsPerBar)
  useEffect(() => { trackRef.current = track }, [track])
  useEffect(() => { noteDurationRef.current = noteDuration }, [noteDuration])
  useEffect(() => { snapRef.current = snap }, [snap])
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
  const effectiveZoom = fitZoom ?? zoom
  const pxPerBeat     = PPB * effectiveZoom
  const svgW          = svgTotalWidth(track.totalBars, track.beatsPerBar, pxPerBeat)

  useEffect(() => { if (fitZoom !== null) onFitZoomChange?.(fitZoom) }, [fitZoom, onFitZoomChange])

  // ── VexFlow render ────────────────────────────────────────────────────
  useEffect(() => {
    const container = vexflowRef.current
    if (!container) return
    container.innerHTML = ''

    try {
      const renderer = new Renderer(container, Renderer.Backends.SVG)
      renderer.resize(svgW, VF_TOTAL_H)
      const ctx = renderer.getContext()

      // Style for dark theme
      ctx.setFillStyle('hsl(220, 14%, 88%)')
      ctx.setStrokeStyle('hsl(220, 14%, 88%)')
      ctx.setFont('Arial', 11)

      for (let bar = 0; bar < track.totalBars; bar++) {
        const staveX = barLineX(bar, track.beatsPerBar, pxPerBeat)
        const staveW = track.beatsPerBar * pxPerBeat
        // Reserve space for clef+timesig on first bar
        const noteW = staveW - (bar === 0 ? 58 : 12)

        // ── Notation stave ──────────────────────────────────────────
        const stave = new Stave(staveX, VF_NOTA_Y, staveW)
        stave.setStyle({ fillStyle: 'hsl(220, 14%, 78%)', strokeStyle: 'hsl(220, 14%, 70%)' })
        if (bar === 0) {
          stave.addClef('bass')
          stave.addTimeSignature(`${track.beatsPerBar}/4`)
        }
        stave.setContext(ctx).draw()

        // ── Notes ───────────────────────────────────────────────────
        const { staveNotes } = buildBarNotes(track.notes, bar * track.beatsPerBar, track.beatsPerBar)
        if (staveNotes.length === 0) continue

        staveNotes.forEach(sn => {
          const id = (sn as any)._bassNoteId as string | undefined
          if (!id) {
            sn.setStyle({ fillStyle: 'hsl(220, 10%, 52%)', strokeStyle: 'hsl(220, 10%, 52%)' })
            return
          }
          const n = track.notes.find(n => n.id === id)
          const isActive   = !!n && currentBeat >= n.startBeat && currentBeat < n.startBeat + n.durationBeats
          const isSelected = id === selectedNoteId
          const color = isActive ? '#4ade80' : isSelected ? 'hsl(262,80%,88%)' : 'hsl(220, 8%, 88%)'
          sn.setStyle({ fillStyle: color, strokeStyle: color })
        })

        try {
          const voice = new Voice({ numBeats: track.beatsPerBar, beatValue: 4 })
          voice.setMode((Voice as any).Mode?.SOFT ?? 2)
          voice.addTickables(staveNotes)

          new Formatter().joinVoices([voice]).format([voice], Math.max(20, noteW))

          // Generate beams BEFORE drawing so beamed notes suppress their individual flags
          let beams: Beam[] = []
          const beamable = staveNotes.filter(sn => !sn.isRest())
          if (beamable.length > 1) {
            try { beams = Beam.generateBeams(beamable) } catch {}
          }

          voice.draw(ctx, stave)

          const beamColor = 'hsl(220, 14%, 86%)'
          beams.forEach(b => {
            b.setStyle({ fillStyle: beamColor, strokeStyle: beamColor })
            b.setContext(ctx).draw()
          })
        } catch (err) {
          console.warn(`VexFlow error bar ${bar}:`, err)
        }
      }

      const svgEl = container.querySelector('svg')
      if (svgEl) svgEl.style.background = 'transparent'
    } catch (err) {
      console.error('VexFlow render error:', err)
    }
  }, [track, pxPerBeat, svgW, selectedNoteId, currentBeat])

  // ── Auto-scroll ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isPlaying || !scrollRef.current) return
    const el = scrollRef.current
    const px = beatToX(currentBeat, pxPerBeat)
    const w  = el.clientWidth
    if (px > el.scrollLeft + w * 0.7) el.scrollLeft = px - w * 0.3
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
    const scaleY = VF_TOTAL_H / rect.height
    const rawX   = (e.clientX - rect.left) * scaleX
    const rawY   = (e.clientY - rect.top)  * scaleY

    // Only handle clicks in TAB string zone
    const tabRawY = rawY - TAB_OVERLAY_Y
    if (tabRawY < -10 || tabRawY > TAB_OVERLAY_STAFF_H + 10) return

    const beat = snapToGrid(Math.max(0, xToBeat(rawX, pxPerBeat)), snap)
    if (beat >= totalBeats) return
    const si = yToStringIndex(Math.max(0, Math.min(TAB_OVERLAY_STAFF_H, tabRawY)))

    clearTimeout(fretTimerRef.current!); setFretBuffer('')
    setEditCursor({ beat, stringIndex: si }); onCursorBeatChange(beat)
    containerRef.current?.focus()
  }, [isPlaying, svgW, pxPerBeat, snap, totalBeats, onCursorBeatChange, setFretBuffer, setEditCursor])

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
  const cursorY1   = 5
  const cursorY2   = VF_TOTAL_H - 5

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
          flex: 1, overflowX: fitWidth ? 'hidden' : 'auto', overflowY: 'hidden',
          position: 'relative', background: 'hsl(224 24% 8%)',
          minHeight: VF_TOTAL_H,
        }}
      >
        {/* ── VexFlow render layer ── */}
        <div
          ref={vexflowRef}
          style={{
            position: 'absolute', top: 0, left: 0,
            width: svgW, height: VF_TOTAL_H,
            pointerEvents: 'none',
          }}
        />

        {/* ── Interactive overlay SVG ── */}
        <svg
          ref={overlaySvgRef}
          width={svgW}
          height={VF_TOTAL_H}
          viewBox={`0 0 ${svgW} ${VF_TOTAL_H}`}
          onPointerDown={handleOverlayPointerDown}
          style={{
            position: 'relative', display: 'block',
            cursor: isPlaying ? 'default' : 'crosshair',
            userSelect: 'none',
          }}
        >
          {/* ── Manual TAB stave ── */}
          {/* String lines */}
          {[0,1,2,3].map(si => {
            const ly = TAB_OVERLAY_Y + STRING_Y[si]
            return <line key={si} x1={LABEL_W} x2={svgW} y1={ly} y2={ly}
              stroke="hsl(220,14%,62%)" strokeWidth={0.9} style={{ pointerEvents: 'none' }} />
          })}
          {/* Bar lines */}
          {Array.from({ length: track.totalBars + 1 }, (_, bar) => {
            const bx = barLineX(bar, track.beatsPerBar, pxPerBeat)
            return <line key={bar} x1={bx} x2={bx}
              y1={TAB_OVERLAY_Y - 1} y2={TAB_OVERLAY_Y + TAB_OVERLAY_STAFF_H + 1}
              stroke="hsl(220,14%,62%)" strokeWidth={bar === 0 || bar === track.totalBars ? 1.5 : 0.9}
              style={{ pointerEvents: 'none' }} />
          })}
          {/* T·A·B label */}
          {['T','A','B'].map((c, i) => (
            <text key={c} x={LABEL_W / 2} y={TAB_OVERLAY_Y + i * TAB_SPACING * (3/2) + TAB_SPACING / 2}
              textAnchor="middle" dominantBaseline="middle"
              fontSize={8} fontWeight="bold" fontFamily="Arial, sans-serif"
              fill="hsl(220,14%,60%)" style={{ pointerEvents: 'none' }}>
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
              : isSelected ? 'hsl(262,80%,90%)' : 'hsl(220,8%,90%)'
            const gapW = note.fret >= 10 ? 16 : 12
            return (
              <g key={`tab-${note.id}`} style={{ pointerEvents: 'none' }}>
                <line x1={x - gapW} x2={x + gapW} y1={y} y2={y}
                  stroke="hsl(224,24%,8%)" strokeWidth={2.5} />
                <text x={x} y={y} textAnchor="middle" dominantBaseline="middle"
                  fontSize={11} fontWeight="bold" fontFamily="Arial, sans-serif"
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
                  fill="hsl(262 83% 58% / 0.08)" style={{ pointerEvents: 'none' }} />
                <rect x={cx - rw / 2} y={cy - 9} width={rw} height={18} rx={3}
                  fill="hsl(262 83% 58% / 0.20)"
                  stroke="hsl(262 83% 65%)" strokeWidth={1.5}
                  strokeDasharray={fretBuffer ? undefined : '4,3'}
                  style={{ pointerEvents: 'none' }} />
                {fretBuffer && (
                  <text x={cx} y={cy + 5} textAnchor="middle" fontSize={10} fontWeight="bold"
                    fill="hsl(262 80% 92%)" fontFamily="ui-monospace,monospace"
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
            stroke={isPlaying ? 'hsl(262 83% 68%)' : 'hsl(262 83% 55% / 0.65)'}
            strokeWidth={isPlaying ? 1.5 : 1}
            style={{ pointerEvents: 'none' }}
          />
          <polygon
            points={`${cursorX - 5},${cursorY1} ${cursorX + 5},${cursorY1} ${cursorX},${cursorY1 + 9}`}
            fill={isPlaying ? 'hsl(262 83% 68%)' : 'hsl(262 83% 55% / 0.65)'}
            style={{ pointerEvents: 'none' }}
          />

          {/* Section labels */}
          {(track.sections ?? []).map(sec => {
            const x = barLineX(sec.startBar, track.beatsPerBar, pxPerBeat) + 2
            return (
              <text key={sec.startBar} x={x} y={8}
                fontSize={10} fontWeight={600} fill="hsl(220 10% 55%)" fontFamily="monospace"
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
              style={{ width: 120, height: 22, padding: '0 6px', borderRadius: 4, border: '2px solid hsl(262 83% 58%)', background: 'hsl(224 20% 13%)', color: '#a0a0c8', fontFamily: 'monospace', fontSize: 10, fontWeight: 600, outline: 'none' }}
            />
          </div>
        )}
      </div>

      {/* Edit cursor status bar */}
      {editCursor && !isPlaying && (
        <div style={{ flexShrink: 0, height: 28, background: 'hsl(224 20% 10%)', borderTop: '1px solid hsl(262 40% 20%)', display: 'flex', alignItems: 'center', gap: 20, paddingLeft: 16, paddingRight: 16, fontFamily: "ui-monospace,'SF Mono',monospace", fontSize: 11 }}>
          <span style={{ color: 'hsl(262 60% 75%)', fontWeight: 600 }}>{STRING_LABELS[editCursor.stringIndex]}</span>
          <span style={{ color: 'hsl(220 10% 50%)' }}>
            bar {Math.floor(editCursor.beat / track.beatsPerBar) + 1} · beat {(editCursor.beat % track.beatsPerBar + 1).toFixed(editCursor.beat % 1 === 0 ? 0 : 2)}
          </span>
          {fretBuffer
            ? <span style={{ color: 'hsl(220 14% 80%)' }}>fret: <strong style={{ color: 'white', fontSize: 13 }}>{fretBuffer}</strong>_</span>
            : <span style={{ color: 'hsl(224 15% 32%)' }}>{isMobile ? 'toca un traste ↓' : 'type fret · ←→ move · ↑↓ string · Del delete'}</span>
          }
        </div>
      )}

      {/* Mobile numpad */}
      {isMobile && editCursor && !isPlaying && (
        <div style={{ flexShrink: 0, background: 'hsl(224 20% 9%)', borderTop: '1px solid hsl(224 15% 16%)' }}>
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
        background: confirm ? 'hsl(262 50% 28%)' : active ? 'hsl(262 40% 22%)' : 'hsl(224 18% 15%)',
        border: `1px solid ${confirm ? 'hsl(262 60% 45%)' : active ? 'hsl(262 40% 35%)' : 'hsl(224 15% 22%)'}`,
        borderRadius: 7,
        color: confirm ? 'hsl(262 80% 88%)' : danger ? 'hsl(0 72% 65%)' : active ? 'hsl(262 80% 85%)' : 'hsl(220 10% 68%)',
        fontSize: 15, fontFamily: "'Inter', ui-sans-serif, sans-serif",
        fontWeight: active || confirm ? 600 : 400,
        cursor: 'pointer', touchAction: 'manipulation', userSelect: 'none',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {children}
    </button>
  )
}
