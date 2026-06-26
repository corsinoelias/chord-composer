import React, { useRef, useEffect } from 'react'
import type { GuitarTrack } from '../../lib/guitarTab/types'

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
}

interface SeqItem {
  noteDur: string    // e.g. 'q', 'hd'
  restDur: string    // e.g. 'qr', 'hr'
  isRest: boolean
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
    if (!group) {
      let next = totalSlots
      for (let s = cursor + 1; s < totalSlots; s++) {
        if (slotMap.has(s)) { next = s; break }
      }
      const beats = (next - cursor) * SNAP
      const restDur = beatsToVexDur(beats, true)
      seq.push({ noteDur: restDur.replace('r', ''), restDur, isRest: true, notes: [] })
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
        const midi = STRING_MIDI_BASE[n.stringIndex] + n.fret + capo
        return { ...midiToVex(midi), str: n.stringIndex + 1, fret: n.fret }
      })
      seq.push({ noteDur, restDur: beatsToVexDur(rawBeats, true), isRest: false, notes })
      cursor += Math.max(1, Math.round(vexDurToBeats(noteDur) / SNAP))
    }
  }
  return seq
}

interface Props {
  track: GuitarTrack
  zoom: number
}

export function GuitarNotationView({ track, zoom }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let cancelled = false

    import('vexflow').then(VF => {
      if (cancelled || !el) return
      const { Renderer, Stave, StaveNote, TabStave, TabNote, GhostNote, Voice, Formatter, Accidental } = VF

      el.innerHTML = ''

      const BARS_PER_ROW = 4
      const BAR_W = Math.max(120, 80 * track.beatsPerBar * zoom)
      const FIRST_EXTRA = 60    // clef + time sig
      const ROW_H = 155
      const STAVE_Y = 40
      const TAB_Y = 105
      const ML = 15

      const totalRows = Math.ceil(track.totalBars / BARS_PER_ROW)
      const containerW = el.clientWidth || 900
      const rowW = ML + FIRST_EXTRA + (Math.min(track.totalBars, BARS_PER_ROW) - 1) * BAR_W + 20
      const svgW = Math.max(containerW, rowW)
      const svgH = totalRows * ROW_H + 20

      const renderer = new Renderer(el, Renderer.Backends.SVG)
      renderer.resize(svgW, svgH)
      const ctx = renderer.getContext()

      for (let row = 0; row < totalRows; row++) {
        const rowY = row * ROW_H + 5
        let x = ML

        const rowStart = row * BARS_PER_ROW
        const rowEnd = Math.min(rowStart + BARS_PER_ROW, track.totalBars)

        for (let bi = rowStart; bi < rowEnd; bi++) {
          const isFirst = bi === 0
          const barW = BAR_W + (isFirst ? FIRST_EXTRA : 0)

          const stave = new Stave(x, rowY + STAVE_Y, barW)
          if (isFirst) stave.addClef('treble').addTimeSignature(`${track.beatsPerBar}/4`)
          stave.setContext(ctx).draw()

          const tabStave = new TabStave(x, rowY + TAB_Y, barW)
          if (isFirst) tabStave.addClef('tab')
          tabStave.setContext(ctx).draw()

          const barStart = bi * track.beatsPerBar
          const barNotes = track.notes.filter(n =>
            n.startBeat >= barStart && n.startBeat < barStart + track.beatsPerBar
          )
          const seq = buildSeq(barNotes, barStart, track.beatsPerBar, track.capo ?? 0)

          const staveTickables: InstanceType<typeof StaveNote>[] = []
          const tabTickables: InstanceType<typeof TabNote | typeof GhostNote>[] = []

          for (const item of seq) {
            if (item.isRest) {
              staveTickables.push(
                new StaveNote({ keys: ['b/4'], duration: item.noteDur, type: 'r' })
              )
              tabTickables.push(new GhostNote({ duration: item.noteDur }))
            } else {
              const keys = item.notes.map(n => n.key)
              const sn = new StaveNote({ keys, duration: item.noteDur, autoStem: true })
              item.notes.forEach((n, i) => {
                if (n.acc) sn.addModifier(new Accidental(n.acc), i)
              })
              staveTickables.push(sn)
              const positions = item.notes.map(n => ({ str: n.str, fret: String(n.fret) }))
              tabTickables.push(new TabNote({ positions, duration: item.noteDur }))
            }
          }

          if (staveTickables.length === 0) {
            staveTickables.push(new StaveNote({ keys: ['b/4'], duration: 'w', type: 'r' }))
            tabTickables.push(new GhostNote({ duration: 'w' }))
          }

          const voice = new Voice({ numBeats: track.beatsPerBar, beatValue: 4 }).setStrict(false)
          voice.addTickables(staveTickables)
          const tabVoice = new Voice({ numBeats: track.beatsPerBar, beatValue: 4 }).setStrict(false)
          tabVoice.addTickables(tabTickables)

          const fmtW = barW - (isFirst ? 80 : 20)
          try {
            new Formatter().joinVoices([voice]).joinVoices([tabVoice]).format([voice, tabVoice], fmtW)
          } catch {
            try { new Formatter().joinVoices([voice]).format([voice], fmtW) } catch {}
          }

          try { voice.draw(ctx, stave) } catch {}
          try { tabVoice.draw(ctx, tabStave) } catch {}

          x += barW
        }
      }
    })

    return () => { cancelled = true }
  }, [track, zoom])

  return (
    <div
      ref={containerRef}
      data-export-svg="notation"
      style={{ flex: 1, overflowX: 'auto', overflowY: 'auto', background: '#ffffff', minHeight: 0 }}
    />
  )
}
