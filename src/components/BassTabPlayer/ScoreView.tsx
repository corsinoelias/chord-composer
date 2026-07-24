import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import type { BassNote, BassTrack, StringIndex, BassSound, TrackSection } from '../../lib/bassTab/types'
import { OPEN_MIDI } from '../../lib/bassTab/notationTheory'
import { findNoteAtBeat, clampDuration } from '../../lib/bassTab/bassTheory'
import { previewNote } from '../../lib/bassTab/bassAudio'
import { BT } from '../../lib/bassTab/theme'

/**
 * Vista Score con VexFlow — el motor del diseño (Editor.dc.html), en vez del
 * pipeline SVG a mano. Graba pentagrama + tablatura con calidad profesional:
 * cabezas, plicas, barrado, corchetes, silencios y armadura vía
 * `applyAccidentals`.
 *
 * Lo que NO cambia respecto al Score anterior es la máquina de edición: opera
 * sobre beats/cuerdas/trastes, no sobre píxeles, así que se conserva entera. Lo
 * único reescrito es el dibujo y la geometría: VexFlow coloca las notas con su
 * propio formatter, así que para el cursor y los clics se interpola beat↔x
 * dentro de cada compás usando las posiciones reales que VexFlow asigna a cada
 * figura (`getAbsoluteX`), ancladas a los bordes del compás.
 *
 * Tonalidad fija en Do mayor de momento: la armadura queda montada (VexFlow la
 * dibuja sola con el nombre de tonalidad) pero sin etiquetar nada, lista para
 * un selector futuro.
 */

const KEY_NAME = 'C'  // TODO: selector de tonalidad → campo `key` en el track
const OCTAVE_UP = 12  // el bajo se escribe una octava por encima del sonido real
const SNAP = 0.25

/** Alfa sobre un color hex de 6 dígitos (para relleno/contorno del cursor). */
function withAlpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

// ── beats ↔ duración VexFlow ────────────────────────────────────────────────
function beatsToVexDur(beats: number, isRest = false): string {
  let base: string
  if (beats >= 3.5)        base = 'w'
  else if (beats >= 2.5)   base = isRest ? 'h' : 'hd'
  else if (beats >= 1.75)  base = 'h'
  else if (beats >= 1.25)  base = isRest ? 'q' : 'qd'
  else if (beats >= 0.875) base = 'q'
  else if (beats >= 0.625) base = isRest ? '8' : '8d'
  else if (beats >= 0.375) base = '8'
  else                     base = '16'
  return isRest ? base + 'r' : base
}
function vexDurToBeats(dur: string): number {
  const clean = dur.replace('r', '')
  const dotted = clean.endsWith('d')
  const key = dotted ? clean.slice(0, -1) : clean
  const base: Record<string, number> = { w: 4, h: 2, q: 1, '8': 0.5, '16': 0.25 }
  return (base[key] ?? 0.25) * (dotted ? 1.5 : 1)
}

const MIDI_MAP: Array<{ name: string; acc: string | null }> = [
  { name: 'c', acc: null }, { name: 'c', acc: '#' },
  { name: 'd', acc: null }, { name: 'd', acc: '#' },
  { name: 'e', acc: null }, { name: 'f', acc: null },
  { name: 'f', acc: '#' }, { name: 'g', acc: null },
  { name: 'g', acc: '#' }, { name: 'a', acc: null },
  { name: 'a', acc: '#' }, { name: 'b', acc: null },
]
function midiToVex(midi: number): { key: string; acc: string | null } {
  const { name, acc } = MIDI_MAP[((midi % 12) + 12) % 12]
  return { key: `${name}/${Math.floor(midi / 12) - 1}`, acc }
}

// ── Agrupar las notas de un compás en secuencia con silencios ───────────────
interface SeqItem {
  noteDur: string
  isRest: boolean
  beatInBar: number
  notes: Array<{ key: string; acc: string | null; str: number; fret: number }>
}
function buildBarSeq(barNotes: BassNote[], barStart: number, beatsPerBar: number): SeqItem[] {
  const totalSlots = Math.round(beatsPerBar / SNAP)
  const slotMap = new Map<number, BassNote[]>()
  for (const n of barNotes) {
    const slot = Math.round((n.startBeat - barStart) / SNAP)
    if (slot < 0 || slot >= totalSlots) continue
    const arr = slotMap.get(slot) ?? []
    arr.push(n)
    slotMap.set(slot, arr)
  }
  const seq: SeqItem[] = []
  let cursor = 0
  while (cursor < totalSlots) {
    let next = totalSlots
    for (let s = cursor + 1; s < totalSlots; s++) { if (slotMap.has(s)) { next = s; break } }
    const group = slotMap.get(cursor)
    const beatInBar = cursor * SNAP
    if (!group) {
      seq.push({ noteDur: beatsToVexDur((next - cursor) * SNAP, true), isRest: true, beatInBar, notes: [] })
      cursor = next
    } else {
      const gapBeats = (next - cursor) * SNAP
      const rawBeats = Math.min(
        ...group.map(n => Math.max(SNAP, Math.round(n.durationBeats / SNAP) * SNAP)),
        gapBeats,
      )
      const noteDur = beatsToVexDur(rawBeats, false)
      const notes = group
        .sort((a, b) => (OPEN_MIDI[a.stringIndex] + a.fret) - (OPEN_MIDI[b.stringIndex] + b.fret))
        .map(n => ({ ...midiToVex(OPEN_MIDI[n.stringIndex] + n.fret + OCTAVE_UP), str: n.stringIndex + 1, fret: n.fret }))
      seq.push({ noteDur, isRest: false, beatInBar, notes })
      cursor += Math.max(1, Math.round(vexDurToBeats(noteDur) / SNAP))
    }
  }
  return seq
}

// ── Geometría que devuelve el render ────────────────────────────────────────
interface BarGeom {
  bar: number
  barStartBeat: number
  leftX: number
  noteStartX: number
  endX: number
  staffTopY: number
  tabTopY: number
  tabStringY: number[]
  tabBottomY: number
  ticks: Array<{ beat: number; x: number; dur: number }>  // figura: beat, x real, duración
}

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
  onSectionChange?: (sections: TrackSection[]) => void
}

interface EditCursor { beat: number; stringIndex: StringIndex }

export function ScoreView({
  track, zoom, currentBeat, isPlaying, selectedNoteId, sound, noteDuration,
  onAddNote, onUpdateNote, onDeleteNote, onSelectNote, onCursorBeatChange, onBeginEdit, onSectionChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollRef    = useRef<HTMLDivElement>(null)
  const hostRef      = useRef<HTMLDivElement>(null)
  const fretTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const barGeomRef = useRef<BarGeom[]>([])
  const [geomVersion, setGeomVersion] = useState(0)
  const [svgH, setSvgH] = useState(0)
  const [containerW, setContainerW] = useState(0)

  const [editCursor, setEditCursorState] = useState<EditCursor | null>(null)
  const [fretBuffer, setFretBufferState] = useState('')
  const editCursorRef = useRef<EditCursor | null>(null)
  const fretBufferRef = useRef('')
  const setEditCursor = useCallback((v: EditCursor | null) => { editCursorRef.current = v; setEditCursorState(v) }, [])
  const setFretBuffer = useCallback((v: string) => { fretBufferRef.current = v; setFretBufferState(v) }, [])

  // Refs para los callbacks/timers
  const trackRef        = useRef(track)
  const noteDurationRef = useRef(noteDuration)
  const soundRef        = useRef(sound)
  const totalBeatsRef   = useRef(track.totalBars * track.beatsPerBar)
  useEffect(() => { trackRef.current = track }, [track])
  useEffect(() => { noteDurationRef.current = noteDuration }, [noteDuration])
  useEffect(() => { soundRef.current = sound }, [sound])
  useEffect(() => { totalBeatsRef.current = track.totalBars * track.beatsPerBar }, [track.totalBars, track.beatsPerBar])

  // Sección en edición
  const [pendingSection, setPendingSection] = useState<{ startBar: number; screenX: number; screenY: number } | null>(null)
  const [sectionNameVal, setSectionNameVal] = useState('')
  const sectionInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(es => setContainerW(es[0].contentRect.width))
    ro.observe(el)
    setContainerW(el.getBoundingClientRect().width)
    return () => ro.disconnect()
  }, [])

  // ── Render VexFlow ────────────────────────────────────────────────────────
  useEffect(() => {
    const host = hostRef.current
    if (!host || containerW <= 0) return
    let cancelled = false

    import('vexflow').then(VF => {
      if (cancelled || !host) return
      const { Renderer, Stave, TabStave, StaveNote, TabNote, GhostNote, Voice, Formatter, Accidental, Beam, StaveConnector } = VF
      host.innerHTML = ''

      const bpb      = track.beatsPerBar
      const PPB      = 80
      const wantBarW = bpb * PPB * zoom
      const LEFT     = 10
      const availW   = Math.max(360, containerW - 24)
      const firstExtra = 62

      const baseW = (bar: number) => {
        const beats = track.notes.filter(n => Math.floor(n.startBeat / bpb) === bar).length
        return Math.max(wantBarW, 36 + Math.max(2, beats) * 44)
      }
      // Repartir compases en líneas que quepan (sin scroll horizontal).
      type LineItem = { bar: number; w: number }
      const lines: LineItem[][] = []
      let cur: LineItem[] = [], curW = LEFT
      for (let bar = 0; bar < track.totalBars; bar++) {
        const extra = (cur.length === 0 ? firstExtra : 0) + (bar === 0 ? 26 : 0)
        const w = baseW(bar) + extra
        if (cur.length && curW + w > availW - LEFT) {
          lines.push(cur)
          cur = [{ bar, w: baseW(bar) + firstExtra + (bar === 0 ? 26 : 0) }]
          curW = LEFT + cur[0].w
        } else {
          cur.push({ bar, w }); curW += w
        }
      }
      if (cur.length) lines.push(cur)

      lines.forEach((ln, li) => {
        if (li === lines.length - 1) return
        const sum = ln.reduce((a, b) => a + b.w, LEFT)
        const extra = (availW - LEFT - sum) / ln.length
        if (extra > 0) ln.forEach(it => it.w += extra)
      })

      const STAFF_Y = 30
      const TAB_OFF = 96
      const nS      = 4
      const systemH = TAB_OFF + nS * 13 + 70
      const totalH  = lines.length * systemH + 16

      const renderer = new Renderer(host, Renderer.Backends.SVG)
      renderer.resize(availW, totalH)
      const ctx = renderer.getContext()
      const geom: BarGeom[] = []

      lines.forEach((ln, li) => {
        let x = LEFT
        const sysY = 12 + li * systemH + STAFF_Y

        ln.forEach(({ bar, w }, pos) => {
          const stave    = new Stave(x, sysY, w)
          const tabStave = new TabStave(x, sysY + TAB_OFF, w, { numLines: nS })
          if (pos === 0) { stave.addClef('bass').addKeySignature(KEY_NAME); tabStave.addTabGlyph() }
          if (bar === 0) stave.addTimeSignature(`${bpb}/4`)

          stave.setContext(ctx).draw()
          tabStave.setNoteStartX(Math.max(tabStave.getNoteStartX(), stave.getNoteStartX()))
          tabStave.setContext(ctx).draw()
          new StaveConnector(stave, tabStave).setType(StaveConnector.type.SINGLE_LEFT).setContext(ctx).draw()
          new StaveConnector(stave, tabStave).setType(StaveConnector.type.SINGLE_RIGHT).setContext(ctx).draw()

          const barNotes = track.notes.filter(n => Math.floor(n.startBeat / bpb) === bar)
          const seq = buildBarSeq(barNotes, bar * bpb, bpb)

          const sNotes: InstanceType<typeof StaveNote>[] = []
          const tNotes: Array<InstanceType<typeof TabNote> | InstanceType<typeof GhostNote>> = []
          const restFlags: boolean[] = []
          for (const item of seq) {
            if (item.isRest) {
              sNotes.push(new StaveNote({ clef: 'bass', keys: ['d/3'], duration: item.noteDur + 'r' }))
              tNotes.push(new GhostNote({ duration: item.noteDur }))
              restFlags.push(true)
            } else {
              const sn = new StaveNote({ clef: 'bass', keys: item.notes.map(n => n.key), duration: item.noteDur })
              item.notes.forEach((n, i) => { if (n.acc) sn.addModifier(new Accidental(n.acc), i) })
              sNotes.push(sn)
              tNotes.push(new TabNote({ positions: item.notes.map(n => ({ str: n.str, fret: n.fret })), duration: item.noteDur }))
              restFlags.push(false)
            }
          }
          if (!sNotes.length) {
            sNotes.push(new StaveNote({ clef: 'bass', keys: ['d/3'], duration: 'wr' }))
            tNotes.push(new GhostNote({ duration: 'w' }))
            restFlags.push(true)
          }

          const voice  = new Voice({ numBeats: bpb, beatValue: 4 }).setStrict(false).addTickables(sNotes)
          const tvoice = new Voice({ numBeats: bpb, beatValue: 4 }).setStrict(false).addTickables(tNotes)
          Accidental.applyAccidentals([voice], KEY_NAME)
          const beamable = sNotes.filter((_, i) => !restFlags[i] && vexDurToBeats(seq[i]?.noteDur ?? 'q') <= 0.5)
          const beams = beamable.length > 1 ? Beam.generateBeams(beamable) : []
          const fmtW = w - (stave.getNoteStartX() - x) - 24
          try { new Formatter().joinVoices([voice]).joinVoices([tvoice]).format([voice, tvoice], Math.max(40, fmtW)) } catch { /* compás sobrecargado */ }
          voice.draw(ctx, stave)
          tvoice.draw(ctx, tabStave)
          beams.forEach(b => b.setContext(ctx).draw())

          const ticks: Array<{ beat: number; x: number; dur: number }> = []
          seq.forEach((item, i) => {
            const t = tNotes[i]
            const gx = (t as { getAbsoluteX?: () => number }).getAbsoluteX?.()
            if (typeof gx === 'number') ticks.push({ beat: bar * bpb + item.beatInBar, x: gx, dur: vexDurToBeats(item.noteDur) })
          })

          geom.push({
            bar, barStartBeat: bar * bpb,
            leftX: x, noteStartX: stave.getNoteStartX(), endX: x + w,
            staffTopY: stave.getYForLine(0),
            tabTopY: tabStave.getYForLine(0),
            tabStringY: [0, 1, 2, 3].map(i => tabStave.getYForLine(i)),
            tabBottomY: tabStave.getYForLine(nS - 1),
            ticks,
          })
          x += w
        })
      })

      barGeomRef.current = geom
      setSvgH(totalH)
      setGeomVersion(v => v + 1)

      const svg = host.querySelector('svg')
      if (svg) {
        svg.style.display = 'block'
        const isBlack = (c: string | null) => !!c && /^(#000(000)?|black|rgb\(0, ?0, ?0\))$/i.test(c.trim())
        svg.querySelectorAll<SVGElement>('*').forEach(node => {
          if (isBlack(node.getAttribute('fill')))   node.setAttribute('fill', BT.staff)
          if (isBlack(node.getAttribute('stroke'))) node.setAttribute('stroke', BT.staff)
        })
      }
    })

    return () => { cancelled = true }
  }, [track, zoom, containerW])

  // ── Geometría: beat ↔ x, y por cuerda, y hit-testing ──────────────────────
  const barForBeat = useCallback((beat: number): BarGeom | null => {
    const g = barGeomRef.current
    const bpb = track.beatsPerBar
    const bar = Math.floor(beat / bpb)
    return g.find(bg => bg.bar === bar) ?? null
  }, [track.beatsPerBar])

  /** Nodos de interpolación de un compás: bordes anclados + figuras. Sólo para
   *  el marcador de reproducción, que sí desliza suave entre notas. */
  const barNodes = useCallback((bg: BarGeom): Array<{ beat: number; x: number }> => {
    const bpb = track.beatsPerBar
    const nodes = [{ beat: bg.barStartBeat, x: bg.noteStartX }, ...bg.ticks.map(t => ({ beat: t.beat, x: t.x })), { beat: bg.barStartBeat + bpb, x: bg.endX - 8 }]
    return nodes.sort((a, b) => a.beat - b.beat)
  }, [track.beatsPerBar])

  const beatToX = useCallback((beat: number): number | null => {
    const bg = barForBeat(beat)
    if (!bg) return null
    const nodes = barNodes(bg)
    for (let i = 0; i < nodes.length - 1; i++) {
      const a = nodes[i], b = nodes[i + 1]
      if (beat >= a.beat && beat <= b.beat) {
        const t = b.beat === a.beat ? 0 : (beat - a.beat) / (b.beat - a.beat)
        return a.x + t * (b.x - a.x)
      }
    }
    return nodes[nodes.length - 1].x
  }, [barForBeat, barNodes])

  // ── Figuras reales (modelo del diseño): el cursor engancha a la figura que
  // VexFlow dibuja, no a un beat libre. Así nunca flota en un hueco. ──────────
  type Tick = { beat: number; x: number; dur: number; bg: BarGeom }
  const allTicks = useCallback((): Tick[] => {
    const out: Tick[] = []
    for (const bg of barGeomRef.current) for (const t of bg.ticks) out.push({ ...t, bg })
    return out.sort((a, b) => a.beat - b.beat)
  }, [])

  /** La figura que contiene un beat (la de mayor beat ≤ dado dentro del compás). */
  const tickAt = useCallback((beat: number): Tick | null => {
    const bg = barForBeat(beat)
    if (!bg || !bg.ticks.length) return null
    let found = bg.ticks[0]
    for (const t of bg.ticks) { if (t.beat <= beat + 1e-6) found = t; else break }
    return { ...found, bg }
  }, [barForBeat])

  /** x real donde pintar el cursor/anillo en un beat: la de su figura. */
  const snapX = useCallback((beat: number): number | null => tickAt(beat)?.x ?? beatToX(beat), [tickAt, beatToX])

  // ── Fret commit + acciones de edición (idénticas al Score anterior) ───────
  const commitFret = useCallback((buf: string) => {
    clearTimeout(fretTimerRef.current!); setFretBuffer('')
    const cursor = editCursorRef.current
    if (!cursor) return
    const fret = parseInt(buf, 10)
    if (isNaN(fret) || fret < 0 || fret > 24) return
    const { notes } = trackRef.current
    const nd = noteDurationRef.current, tb = totalBeatsRef.current, snd = soundRef.current
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
    const next = Math.min(cursor.beat + nd, tb - SNAP)
    setEditCursor({ ...cursor, beat: next }); onCursorBeatChange(next)
  }, [onBeginEdit, onUpdateNote, onAddNote, onSelectNote, onCursorBeatChange, setFretBuffer, setEditCursor])
  const commitFretRef = useRef(commitFret)
  useEffect(() => { commitFretRef.current = commitFret }, [commitFret])

  const doBackspace = useCallback(() => {
    if (isPlaying || !editCursorRef.current) return
    clearTimeout(fretTimerRef.current!)
    const buf = fretBufferRef.current
    if (buf) { setFretBuffer(buf.slice(0, -1)) }
    else {
      const cur = editCursorRef.current
      const ex = findNoteAtBeat(trackRef.current.notes, cur.stringIndex, cur.beat)
      if (ex) { onBeginEdit?.(); onDeleteNote(ex.id); onSelectNote(null) }
    }
  }, [isPlaying, setFretBuffer, onBeginEdit, onDeleteNote, onSelectNote])

  const doDelete = useCallback(() => {
    if (isPlaying || !editCursorRef.current) return
    clearTimeout(fretTimerRef.current!); setFretBuffer('')
    const cur = editCursorRef.current
    const ex = findNoteAtBeat(trackRef.current.notes, cur.stringIndex, cur.beat)
    if (ex) { onBeginEdit?.(); onDeleteNote(ex.id); onSelectNote(null) }
  }, [isPlaying, setFretBuffer, onBeginEdit, onDeleteNote, onSelectNote])

  const doConfirm = useCallback(() => {
    if (isPlaying || !editCursorRef.current) return
    if (fretBufferRef.current) { commitFretRef.current(fretBufferRef.current) }
    else {
      const cur = editCursorRef.current
      const next = Math.min(cur.beat + noteDurationRef.current, totalBeatsRef.current - SNAP)
      setEditCursor({ ...cur, beat: next }); onCursorBeatChange(next)
    }
  }, [isPlaying, setEditCursor, onCursorBeatChange])

  const doMoveBeat = useCallback((dir: 1 | -1) => {
    if (isPlaying || !editCursorRef.current) return
    clearTimeout(fretTimerRef.current!)
    if (fretBufferRef.current) { commitFretRef.current(fretBufferRef.current); return }
    const cur = editCursorRef.current
    // Entre figuras reales, como el diseño (←→ entre notas), no a saltos de 0.25.
    const ticks = allTicks()
    if (!ticks.length) return
    // Índice de la figura actual (la que contiene el cursor)
    let idx = 0
    for (let i = 0; i < ticks.length; i++) { if (ticks[i].beat <= cur.beat + 1e-6) idx = i; else break }
    const nextIdx = Math.max(0, Math.min(ticks.length - 1, idx + dir))
    const next = ticks[nextIdx].beat
    setEditCursor({ ...cur, beat: next }); onCursorBeatChange(next)
  }, [isPlaying, allTicks, setEditCursor, onCursorBeatChange])

  const doMoveString = useCallback((delta: number) => {
    if (isPlaying || !editCursorRef.current) return
    const cur = editCursorRef.current
    const next = cur.stringIndex + delta
    if (next < 0 || next > 3) return
    setEditCursor({ ...cur, stringIndex: next as StringIndex })
  }, [isPlaying, setEditCursor])

  const doDismiss = useCallback(() => {
    clearTimeout(fretTimerRef.current!); setFretBuffer(''); setEditCursor(null); onSelectNote(null)
  }, [setFretBuffer, setEditCursor, onSelectNote])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const tag = (e.target as HTMLElement).tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
    if (isPlaying || !editCursorRef.current) return
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

  // ── Clic sobre la tab → fijar cursor ──────────────────────────────────────
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (isPlaying) return
    const host = hostRef.current
    if (!host) return
    const rect = host.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top

    const bg = barGeomRef.current.find(b =>
      px >= b.leftX - 2 && px <= b.endX + 2 && py >= b.staffTopY - 20 && py <= b.tabBottomY + 12)
    if (!bg || !bg.ticks.length) return
    // ¿está en la zona de la tab?
    if (py < bg.tabTopY - 12 || py > bg.tabBottomY + 12) return

    // Modelo del diseño: engancha a la figura más cercana por su x real, no a
    // un beat interpolado. Así el cursor cae siempre sobre una figura.
    let beat = bg.ticks[0].beat, best = Infinity
    for (const t of bg.ticks) { const d = Math.abs(px - t.x); if (d < best) { best = d; beat = t.beat } }

    // cuerda más cercana
    let si: StringIndex = 0, bestS = Infinity
    bg.tabStringY.forEach((y, i) => { const d = Math.abs(py - y); if (d < bestS) { bestS = d; si = i as StringIndex } })

    clearTimeout(fretTimerRef.current!); setFretBuffer('')
    setEditCursor({ beat, stringIndex: si })
    onCursorBeatChange(beat)
    const ex = findNoteAtBeat(track.notes, si, beat)
    onSelectNote(ex ? ex.id : null)
    containerRef.current?.focus()
  }, [isPlaying, track.notes, setFretBuffer, setEditCursor, onCursorBeatChange, onSelectNote])

  // ── Auto-scroll vertical por sistema ──────────────────────────────────────
  const followBeat = useCallback((beat: number) => {
    const el = scrollRef.current
    const bg = barForBeat(beat)
    if (!el || !bg) return
    const top = bg.staffTopY - 24
    const bot = bg.tabBottomY + 16
    if (bot > el.scrollTop + el.clientHeight) el.scrollTop = bot - el.clientHeight
    else if (top < el.scrollTop)              el.scrollTop = top
  }, [barForBeat])
  useEffect(() => { if (isPlaying) followBeat(currentBeat) }, [currentBeat, isPlaying, followBeat])
  useEffect(() => { if (editCursor) followBeat(editCursor.beat) }, [editCursor, followBeat])

  // ── Overlays (cursor de edición, selección, insignias, secciones) ─────────
  // El marcador de reproducción NO va aquí: se anima aparte, imperativo, para
  // que sea un glide suave del compositor y no un salto por estado de React.
  void geomVersion  // fuerza recálculo de overlays cuando cambia la geometría

  const overlays = useMemo(() => {
    const g = barGeomRef.current
    if (!g.length) return null
    const els: React.ReactNode[] = []

    // Cursor de edición / selección — columna de acento + anillo sobre la
    // cuerda, como el diseño. La posición es el editCursor si lo hay; si no,
    // la nota seleccionada.
    const ringAt = !isPlaying
      ? (editCursor ?? (() => {
          const sel = track.notes.find(n => n.id === selectedNoteId)
          return sel ? { beat: sel.startBeat, stringIndex: sel.stringIndex } : null
        })())
      : null
    if (ringAt) {
      const tk = tickAt(ringAt.beat)
      const bg = tk?.bg ?? barForBeat(ringAt.beat)
      const x  = tk?.x ?? snapX(ringAt.beat)
      if (bg && x !== null) {
        const atBeat  = tk?.beat ?? ringAt.beat
        const sy = bg.tabStringY[ringAt.stringIndex]
        const hasFret = !!findNoteAtBeat(track.notes, ringAt.stringIndex, atBeat)
        // Columna
        els.push(
          <div key="col" style={{
            position: 'absolute', left: x - 16, top: bg.staffTopY - 16,
            width: 32, height: (bg.tabBottomY - bg.staffTopY) + 34, borderRadius: 3,
            background: BT.accentWash, border: `1.4px solid ${withAlpha(BT.accent, 0.55)}`,
            boxSizing: 'border-box', pointerEvents: 'none',
          }} />,
        )
        // Anillo sobre la cuerda
        const r = hasFret ? 9.5 : 7.5
        if (!hasFret) els.push(
          <div key="ring-bg" style={{
            position: 'absolute', left: x - r, top: sy - r, width: r * 2, height: r * 2,
            borderRadius: '50%', background: BT.card, pointerEvents: 'none',
          }} />,
        )
        els.push(
          <div key="ring" style={{
            position: 'absolute', left: x - r, top: sy - r, width: r * 2, height: r * 2,
            borderRadius: '50%', border: `2px solid ${BT.accent}`, boxSizing: 'border-box', pointerEvents: 'none',
          }} />,
        )
        if (!hasFret && !fretBuffer) els.push(
          <div key="ring-dot" style={{
            position: 'absolute', left: x - 2, top: sy - 2, width: 4, height: 4,
            borderRadius: '50%', background: withAlpha(BT.accent, 0.45), pointerEvents: 'none',
          }} />,
        )
        if (fretBuffer) els.push(
          <div key="buf" style={{
            position: 'absolute', left: x - r, top: sy - r, width: r * 2, height: r * 2,
            display: 'grid', placeItems: 'center', color: BT.accent,
            fontFamily: 'ui-monospace, monospace', fontSize: 10, fontWeight: 700, pointerEvents: 'none',
          }}>{fretBuffer}</div>,
        )
      }
    }

    // Etiquetas de cuerda por sistema + insignia azul de número de compás
    const seenSys = new Set<number>()
    g.forEach(bg => {
      const sysKey = Math.round(bg.staffTopY)
      // Número de compás: insignia azul (referencia, no accionable), como el diseño
      els.push(
        <div key={`bn-${bg.bar}`} style={{
          position: 'absolute', left: bg.leftX + 2, top: bg.staffTopY - 30,
          minWidth: 18, height: 16, padding: '0 4px', borderRadius: 5,
          background: BT.barWash, color: BT.bar,
          fontSize: 10, fontWeight: 700, fontFamily: 'ui-monospace, monospace',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }} data-bar={bg.bar}>{bg.bar + 1}</div>,
      )
      if (!seenSys.has(sysKey)) {
        seenSys.add(sysKey)
        STRING_LABELS.forEach((label, i) => els.push(
          <div key={`sl-${sysKey}-${i}`} style={{
            position: 'absolute', left: 2, top: bg.tabStringY[i] - 6,
            fontSize: 9, color: BT.dim, fontFamily: 'ui-monospace, monospace', pointerEvents: 'none',
          }}>{label}</div>,
        ))
      }
    })

    // Secciones
    ;(track.sections ?? []).forEach(sec => {
      const bg = barGeomRef.current.find(b => b.bar === sec.startBar)
      if (!bg) return
      els.push(
        <div key={`sec-${sec.startBar}`} style={{
          position: 'absolute', left: bg.leftX + 2, top: bg.staffTopY - 44,
          fontSize: 10, fontWeight: 600, color: BT.soft, fontFamily: 'ui-monospace, monospace',
          cursor: 'pointer', userSelect: 'none',
        }}
          onDoubleClick={(e) => {
            e.stopPropagation()
            const er = (e.currentTarget as HTMLElement).getBoundingClientRect()
            const cr = scrollRef.current!.getBoundingClientRect()
            setPendingSection({ startBar: sec.startBar, screenX: er.left - cr.left, screenY: er.top - cr.top })
            setSectionNameVal(sec.name)
            setTimeout(() => sectionInputRef.current?.focus(), 20)
          }}
        >{sec.name}</div>,
      )
    })

    return els
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editCursor, fretBuffer, isPlaying, selectedNoteId, track.notes, track.sections, geomVersion, barForBeat, tickAt, snapX])

  // ── Marcador de reproducción (WAAPI, glide del compositor) ────────────────
  // Como el diseño: un div dedicado que se anima con keyframes precomputados a
  // partir del BPM y de la geometría real de cada figura, en vez de saltar por
  // estado de React. Al llegar a un salto de sistema, la x salta limpia porque
  // el final de un compás y el inicio del siguiente comparten el mismo beat
  // (mismo offset → paso duro en WAAPI).
  const markerRef = useRef<HTMLDivElement>(null)
  const animRef   = useRef<Animation | null>(null)
  const lastBeatRef = useRef(0)

  const stopMarker = useCallback(() => {
    if (animRef.current) { try { animRef.current.cancel() } catch { /* ya cancelada */ } animRef.current = null }
    if (markerRef.current) markerRef.current.style.display = 'none'
  }, [])

  const startMarker = useCallback((fromBeat: number) => {
    const el = markerRef.current
    const g  = barGeomRef.current
    if (!el || !g.length) return
    const bpb      = track.beatsPerBar
    const endBeat  = track.totalBars * bpb
    const secBeat  = 60 / track.bpm
    const span     = endBeat - fromBeat
    if (span <= 0) { stopMarker(); return }

    const frames: Keyframe[] = []
    let lastOff = 0
    const push = (beat: number, x: number, top: number, h: number) => {
      let off = (beat - fromBeat) / span
      off = Math.max(lastOff, Math.min(1, off)); lastOff = off
      frames.push({ offset: off, transform: `translate(${x - 1}px, ${top}px)`, height: `${h}px` })
    }

    // Frame inicial exacto en fromBeat
    const bg0 = barForBeat(fromBeat)
    const x0  = beatToX(fromBeat)
    if (bg0 && x0 !== null) push(fromBeat, x0, bg0.staffTopY - 8, (bg0.tabBottomY - bg0.staffTopY) + 20)

    for (const bg of g) {
      const top = bg.staffTopY - 8
      const h   = (bg.tabBottomY - bg.staffTopY) + 20
      for (const node of barNodes(bg)) {
        if (node.beat <= fromBeat) continue
        push(node.beat, node.x, top, h)
      }
    }
    if (frames.length < 2) { stopMarker(); return }

    if (animRef.current) { try { animRef.current.cancel() } catch { /* noop */ } }
    el.style.display = 'block'
    if (bg0 && x0 !== null) {
      el.style.transform = `translate(${x0 - 1}px, ${bg0.staffTopY - 8}px)`
      el.style.height = `${(bg0.tabBottomY - bg0.staffTopY) + 20}px`
    }
    const anim = el.animate(frames, { duration: span * secBeat * 1000, easing: 'linear', fill: 'both' })
    anim.onfinish = () => { if (markerRef.current) markerRef.current.style.display = 'none' }
    animRef.current = anim
  }, [track.beatsPerBar, track.totalBars, track.bpm, barForBeat, beatToX, barNodes, stopMarker])

  // Arrancar al reproducir; reiniciar en saltos (loop/seek); parar al detener.
  useEffect(() => {
    if (!isPlaying) { stopMarker(); lastBeatRef.current = currentBeat; return }
    // Sólo (re)arrancar en el arranque o ante un salto (|Δ| grande); durante la
    // reproducción normal la animación ya corre sola y currentBeat sólo avanza.
    const jumped = Math.abs(currentBeat - lastBeatRef.current) > 0.75 || !animRef.current
    lastBeatRef.current = currentBeat
    if (jumped) startMarker(currentBeat)
  }, [isPlaying, currentBeat, geomVersion, startMarker, stopMarker])

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

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      style={{ flex: 1, outline: 'none', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
    >
      <div ref={scrollRef} style={{ flex: 1, overflowX: 'hidden', overflowY: 'auto', position: 'relative', background: 'transparent' }}>
        <div style={{ position: 'relative', minHeight: svgH }} onPointerDown={handlePointerDown}>
          <div ref={hostRef} />
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            {overlays}
          </div>
          {/* Marcador de reproducción — animado imperativamente (WAAPI) */}
          <div
            ref={markerRef}
            style={{
              position: 'absolute', left: 0, top: 0, width: 2.5, height: 0,
              background: BT.accent, borderRadius: 2,
              boxShadow: `0 0 6px ${withAlpha(BT.accent, 0.5)}`,
              display: 'none', pointerEvents: 'none', zIndex: 5, willChange: 'transform',
            }}
          />

          {pendingSection && (
            <div style={{ position: 'absolute', left: pendingSection.screenX, top: pendingSection.screenY - 4, zIndex: 200 }}>
              <input
                ref={sectionInputRef} type="text" maxLength={32} value={sectionNameVal}
                placeholder="Section name"
                onChange={e => setSectionNameVal(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitSection() } if (e.key === 'Escape') { e.preventDefault(); setPendingSection(null) } }}
                onBlur={commitSection}
                style={{
                  width: 120, height: 22, padding: '0 6px', borderRadius: 4,
                  border: `2px solid ${BT.accent}`, background: BT.sunken, color: BT.soft,
                  fontFamily: 'ui-monospace, monospace', fontSize: 10, fontWeight: 600, outline: 'none',
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
