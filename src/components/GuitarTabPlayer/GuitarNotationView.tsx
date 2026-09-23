import React, { useRef, useEffect, useState } from 'react'
import type { GuitarTrack } from '../../lib/guitarTab/types'
import { T } from './theme'

const STRING_MIDI_BASE = [64, 59, 55, 50, 45, 40]

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
  const octave = Math.floor(midi / 12) - 1
  return { key: `${name}/${octave}`, acc }
}

// Returns VexFlow duration string (e.g. 'q', 'hd', '8r', 'w')
function beatsToVexDur(beats: number, isRest = false): string {
  let base: string
  if (beats >= 3.5)       base = 'w'
  else if (beats >= 2.5)  base = isRest ? 'h' : 'hd'
  else if (beats >= 1.75) base = 'h'
  else if (beats >= 1.25) base = isRest ? 'q' : 'qd'
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

interface BarNote {
  startBeat: number
  durationBeats: number
  stringIndex: number
  fret: number
  voice?: 0 | 1
}

interface SeqItem {
  noteDur: string    // e.g. 'q', 'hd'
  restDur: string    // e.g. 'qr', 'hr'
  isRest: boolean
  beatInBar: number
  notes: Array<{ key: string; acc: string | null; str: number; fret: number }>
}

function buildSeq(barNotes: BarNote[], barStart: number, beatsPerBar: number, capo: number): SeqItem[] {
  const SNAP = 0.25
  const totalSlots = Math.round(beatsPerBar / SNAP)
  const slotMap = new Map<number, BarNote[]>()
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
    const group = slotMap.get(cursor)
    const beatInBar = cursor * SNAP
    if (!group) {
      let next = totalSlots
      for (let s = cursor + 1; s < totalSlots; s++) {
        if (slotMap.has(s)) { next = s; break }
      }
      const beats = (next - cursor) * SNAP
      const restDur = beatsToVexDur(beats, true)
      seq.push({ noteDur: restDur.replace('r', ''), restDur, isRest: true, beatInBar, notes: [] })
      cursor = next
    } else {
      let next = totalSlots
      for (let s = cursor + 1; s < totalSlots; s++) {
        if (slotMap.has(s)) { next = s; break }
      }
      const gapBeats = (next - cursor) * SNAP
      const rawBeats = Math.min(
        ...group.map(n => Math.max(SNAP, Math.round(n.durationBeats / SNAP) * SNAP)),
        gapBeats
      )
      const noteDur = beatsToVexDur(rawBeats, false)
      const notes = group.map(n => {
        // Guitar standard notation is conventionally written one octave above the
        // actual sounding pitch (treble clef with an implied "8" below) — without this,
        // every note is drawn an octave too low (e.g. open high e, which should sit in
        // the top space, instead lands on the bottom line).
        const midi = STRING_MIDI_BASE[n.stringIndex] + n.fret + capo + 12
        return { ...midiToVex(midi), str: n.stringIndex + 1, fret: n.fret }
      })
      seq.push({ noteDur, restDur: beatsToVexDur(rawBeats, true), isRest: false, beatInBar, notes })
      cursor += Math.max(1, Math.round(vexDurToBeats(noteDur) / SNAP))
    }
  }
  return seq
}

/**
 * Where VexFlow put each bar, and each figure in it — what the playhead reads.
 * `ticks` are the x of every figure (rests included) so the marker can glide
 * between them; `sounding` are the figures with notes, and the SVG groups that
 * get lit while they ring.
 */
interface BarGeom {
  startBeat: number
  endBeat: number
  left: number
  noteStartX: number
  right: number
  top: number
  bottom: number
  row: number
  ticks: Array<{ beat: number; x: number }>
  sounding: Array<{ beat: number; end: number; els: Element[] }>
}

interface Props {
  track: GuitarTrack
  zoom: number
  isPlaying: boolean
  /** Where the transport is when stopped (the seek bar); 0 hides the marker. */
  currentBeat: number
  /** Live playhead, read on an animation frame rather than through props. */
  getBeat: () => number
}

const ML = 12          // left margin
const CLEF_EXTRA = 44  // clef on each system
const TIME_EXTRA = 26  // time signature, first bar only
const STAFF_GAP = 34   // standard staff bottom → tab staff top
const ROW_GAP = 64     // tab staff bottom → next system's staff top (room for ledger lines)
const TOP_PAD = 36

export function GuitarNotationView({ track, zoom, isPlaying, currentBeat, getBeat }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const hostRef   = useRef<HTMLDivElement>(null)
  const washRef   = useRef<HTMLDivElement>(null)
  const lineRef   = useRef<HTMLDivElement>(null)
  const geomRef   = useRef<BarGeom[]>([])
  const [geomVersion, setGeomVersion] = useState(0)
  const [width, setWidth] = useState(0)

  // Re-lay out when the column changes width: systems are fitted to it.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const measure = () => setWidth(w => {
      const nw = Math.round(el.clientWidth)
      return Math.abs(nw - w) > 4 ? nw : w
    })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const el = hostRef.current
    if (!el || width <= 0) return
    let cancelled = false

    import('vexflow').then(VF => {
      if (cancelled || !el) return
      const { Renderer, Stave, StaveNote, TabStave, TabNote, GhostNote, Voice, Formatter, Accidental, Stem, Beam } = VF

      el.innerHTML = ''

      const bpb = track.beatsPerBar
      // As many bars per system as fit at a readable width; the system then fills the column.
      const usable = Math.max(200, width - ML * 2 - CLEF_EXTRA)
      const minBarW = Math.max(150, 58 * bpb * zoom)
      const barsPerRow = Math.max(1, Math.min(8, Math.floor((usable - TIME_EXTRA) / minBarW)))

      // VexFlow puts a stave's first line below its y; measure the offsets once.
      const staveTopOff  = new Stave(0, 0, 100).getYForLine(0)
      const staveBotOff  = new Stave(0, 0, 100).getYForLine(4)
      const tabTopOff    = new TabStave(0, 0, 100).getYForLine(0)
      const tabBotOff    = new TabStave(0, 0, 100).getYForLine(5)
      const tabY         = staveBotOff + STAFF_GAP - tabTopOff
      const rowH         = (tabY + tabBotOff) - staveTopOff + ROW_GAP

      const totalRows = Math.ceil(track.totalBars / barsPerRow)
      const svgW = width
      const svgH = TOP_PAD + totalRows * rowH

      const renderer = new Renderer(el, Renderer.Backends.SVG)
      renderer.resize(svgW, svgH)
      const ctx = renderer.getContext()
      const geom: BarGeom[] = []

      for (let row = 0; row < totalRows; row++) {
        const rowY = TOP_PAD + row * rowH - staveTopOff
        let x = ML

        const rowStart = row * barsPerRow
        const rowEnd = Math.min(rowStart + barsPerRow, track.totalBars)
        // Every system is the column's width; the last one keeps the same bar width.
        const barW = (usable - (row === 0 ? TIME_EXTRA : 0)) / barsPerRow

        for (let bi = rowStart; bi < rowEnd; bi++) {
          const isRowStart = bi === rowStart
          const isFirst = bi === 0
          const w = barW + (isRowStart ? CLEF_EXTRA : 0) + (isFirst ? TIME_EXTRA : 0)

          const stave = new Stave(x, rowY, w)
          if (isRowStart) stave.addClef('treble').setMeasure(bi + 1)
          if (isFirst) stave.addTimeSignature(`${bpb}/4`)
          if (bi === track.totalBars - 1) stave.setEndBarType(VF.BarlineType.END)
          stave.setContext(ctx).draw()

          const tabStave = new TabStave(x, rowY + tabY, w)
          if (isRowStart) tabStave.addClef('tab')
          if (bi === track.totalBars - 1) tabStave.setEndBarType(VF.BarlineType.END)
          tabStave.setContext(ctx).draw()

          const barStart = bi * bpb
          const barNotesAll = track.notes.filter(n =>
            n.startBeat >= barStart && n.startBeat < barStart + bpb
          )
          // Split into up to 2 musical voices (e.g. a sustained melody note held through
          // the bar vs. a faster-moving bass line underneath it). Each voice is laid out
          // and rest-filled independently, then rendered as its own VexFlow Voice with a
          // fixed stem direction (voice 0 up, voice 1 down) — same convention TuxGuitar
          // uses. When there's no second voice (the common case — presets and hand-drawn
          // notes are single-voice), this collapses back to exactly the old single-voice
          // behavior with autoStem, so monophonic tabs render unchanged.
          const voice0Notes = barNotesAll.filter(n => (n.voice ?? 0) === 0)
          const voice1Notes = barNotesAll.filter(n => n.voice === 1)
          const voiceGroups = voice1Notes.length > 0
            ? [{ voiceIdx: 0 as const, notes: voice0Notes }, { voiceIdx: 1 as const, notes: voice1Notes }]
            : [{ voiceIdx: 0 as const, notes: voice0Notes }]

          const staveVoices: InstanceType<typeof Voice>[] = []
          const tabVoices: InstanceType<typeof Voice>[] = []
          const beams: InstanceType<typeof Beam>[] = []
          const placed: Array<{ item: SeqItem; sn: InstanceType<typeof StaveNote>; tn: InstanceType<typeof TabNote | typeof GhostNote> }> = []

          for (const { voiceIdx, notes: groupNotes } of voiceGroups) {
            const seq = buildSeq(groupNotes, barStart, bpb, track.capo ?? 0)

            const staveTickables: InstanceType<typeof StaveNote>[] = []
            const tabTickables: InstanceType<typeof TabNote | typeof GhostNote>[] = []

            for (const item of seq) {
              let sn: InstanceType<typeof StaveNote>
              let tn: InstanceType<typeof TabNote | typeof GhostNote>
              if (item.isRest) {
                sn = new StaveNote({ keys: ['b/4'], duration: item.noteDur, type: 'r' })
                tn = new GhostNote({ duration: item.noteDur })
              } else {
                const keys = item.notes.map(n => n.key)
                sn = new StaveNote(
                  voiceGroups.length > 1
                    ? { keys, duration: item.noteDur, stemDirection: voiceIdx === 0 ? Stem.UP : Stem.DOWN }
                    : { keys, duration: item.noteDur, autoStem: true }
                )
                item.notes.forEach((n, i) => {
                  if (n.acc) sn.addModifier(new Accidental(n.acc), i)
                })
                const positions = item.notes.map(n => ({ str: n.str, fret: String(n.fret) }))
                tn = new TabNote({ positions, duration: item.noteDur })
              }
              staveTickables.push(sn)
              tabTickables.push(tn)
              placed.push({ item, sn, tn })
            }

            if (staveTickables.length === 0) {
              staveTickables.push(new StaveNote({ keys: ['b/4'], duration: 'w', type: 'r' }))
              tabTickables.push(new GhostNote({ duration: 'w' }))
            }

            const beamable = staveTickables.filter((sn, i) => !seq[i]?.isRest && vexDurToBeats(seq[i]?.noteDur ?? 'q') <= 0.5 && sn)
            if (beamable.length > 1) {
              try { beams.push(...Beam.generateBeams(beamable)) } catch { /* odd grouping — draw flags */ }
            }

            const v = new Voice({ numBeats: bpb, beatValue: 4 }).setStrict(false)
            v.addTickables(staveTickables)
            staveVoices.push(v)
            const tv = new Voice({ numBeats: bpb, beatValue: 4 }).setStrict(false)
            tv.addTickables(tabTickables)
            tabVoices.push(tv)
          }

          const fmtW = Math.max(40, w - (stave.getNoteStartX() - x) - 18)
          try {
            new Formatter().joinVoices(staveVoices).joinVoices(tabVoices).format([...staveVoices, ...tabVoices], fmtW)
          } catch {
            try { new Formatter().joinVoices(staveVoices).format(staveVoices, fmtW) } catch { /* overfull bar */ }
          }

          for (const v of staveVoices) { try { v.draw(ctx, stave) } catch { /* overfull bar */ } }
          for (const tv of tabVoices) { try { tv.draw(ctx, tabStave) } catch { /* overfull bar */ } }
          beams.forEach(b => { try { b.setContext(ctx).draw() } catch { /* skip beam */ } })

          const ticks: BarGeom['ticks'] = []
          const sounding: BarGeom['sounding'] = []
          for (const { item, sn, tn } of placed) {
            const beat = barStart + item.beatInBar
            let tx: number | undefined
            try { tx = tn.getAbsoluteX() } catch { tx = undefined }
            if (typeof tx === 'number' && Number.isFinite(tx)) ticks.push({ beat, x: tx + 4 })
            if (item.isRest) continue
            const els = [sn.getSVGElement(), tn.getSVGElement()].filter((e): e is SVGElement => !!e)
            sounding.push({ beat, end: beat + vexDurToBeats(item.noteDur), els })
          }
          ticks.sort((a, b) => a.beat - b.beat)

          geom.push({
            startBeat: barStart, endBeat: barStart + bpb,
            left: x, noteStartX: stave.getNoteStartX(), right: x + w,
            top: stave.getYForLine(0) - 14, bottom: tabStave.getYForLine(5) + 14,
            row, ticks, sounding,
          })
          x += w
        }
      }

      geomRef.current = geom
      setGeomVersion(v => v + 1)
    })

    return () => { cancelled = true }
  }, [track, zoom, width])

  // ── Playhead: a wash on the bar, a line that glides between figures, and the
  // figures that are ringing tinted in the accent. Imperative, on a frame loop —
  // the same rule as the tab's text view — so the score is never re-rendered
  // for it.
  useEffect(() => {
    const wash = washRef.current
    const line = lineRef.current
    const scroller = scrollRef.current
    if (!wash || !line || !scroller) return

    let lit = new Set<Element>()
    let lastRow = -1
    const setLit = (next: Set<Element>) => {
      for (const e of lit) if (!next.has(e)) e.classList.remove('gtn-on')
      for (const e of next) if (!lit.has(e)) e.classList.add('gtn-on')
      lit = next
    }

    const place = (beat: number, playing: boolean) => {
      const geom = geomRef.current
      const bar = geom.find(g => beat >= g.startBeat && beat < g.endBeat)
      if (!bar || (!playing && beat <= 0)) {
        wash.style.opacity = '0'; line.style.opacity = '0'; setLit(new Set())
        return
      }
      // Beat → x through the figures VexFlow actually placed, anchored at the bar's edges.
      const nodes = [{ beat: bar.startBeat, x: bar.noteStartX }, ...bar.ticks, { beat: bar.endBeat, x: bar.right - 10 }]
      let x = nodes[nodes.length - 1].x
      for (let i = 0; i < nodes.length - 1; i++) {
        const a = nodes[i], b = nodes[i + 1]
        if (beat >= a.beat && beat < b.beat) {
          x = a.x + ((beat - a.beat) / (b.beat - a.beat || 1)) * (b.x - a.x)
          break
        }
      }
      wash.style.opacity = '1'
      wash.style.transform = `translate(${bar.left}px, ${bar.top}px)`
      wash.style.width = `${bar.right - bar.left}px`
      wash.style.height = `${bar.bottom - bar.top}px`
      line.style.opacity = '1'
      line.style.transform = `translate(${x - 1}px, ${bar.top}px)`
      line.style.height = `${bar.bottom - bar.top}px`

      const next = new Set<Element>()
      if (playing) for (const s of bar.sounding) if (beat >= s.beat && beat < s.end) s.els.forEach(e => next.add(e))
      setLit(next)

      // Keep the sounding system in view — once per system, so it never fights the user's scroll.
      if (bar.row !== lastRow) {
        lastRow = bar.row
        const top = bar.top - 30, bottom = bar.bottom + 20
        if (top < scroller.scrollTop || bottom > scroller.scrollTop + scroller.clientHeight) {
          scroller.scrollTo({ top: Math.max(0, top), behavior: playing ? 'smooth' : 'auto' })
        }
      }
    }

    if (!isPlaying) {
      place(currentBeat, false)
      return () => setLit(new Set())
    }
    let raf = 0
    const frame = () => { place(getBeat(), true); raf = requestAnimationFrame(frame) }
    raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf); setLit(new Set()) }
  }, [isPlaying, currentBeat, getBeat, geomVersion])

  return (
    <div
      ref={scrollRef}
      style={{ flex: 1, overflowX: 'hidden', overflowY: 'auto', background: '#ffffff', minHeight: 0, position: 'relative' }}
    >
      <style>{`
        .gtn-on path { fill: ${T.accent}; stroke: ${T.accent}; }
        .gtn-on text { fill: ${T.accent}; font-weight: 700; }
      `}</style>
      <div style={{ position: 'relative' }}>
        <div ref={washRef} aria-hidden style={{ position: 'absolute', top: 0, left: 0, opacity: 0, borderRadius: 6, background: T.accentSoft, pointerEvents: 'none', transition: 'opacity 0.15s' }} />
        <div ref={hostRef} data-export-svg="notation" style={{ position: 'relative' }} />
        <div ref={lineRef} aria-hidden style={{ position: 'absolute', top: 0, left: 0, width: 2, opacity: 0, borderRadius: 1, background: T.accent, pointerEvents: 'none', boxShadow: `0 0 0 3px ${T.accentRing}` }} />
      </div>
    </div>
  )
}
