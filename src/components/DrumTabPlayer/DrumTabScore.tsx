import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DrumTrack } from '../../lib/drumTab/types'
import {
  buildVoiceSequence, vexDurationToBeats, REST_KEY,
  type DrumVoice, type NotatedItem,
} from '../../lib/drumTab/drumNotation'
import { BT, alpha, f } from '../../lib/bassTab/theme'

/**
 * Percussion score, drawn with VexFlow — the same engine (and the same
 * self-hosted Bravura font) the bass and guitar score views already use, rather
 * than a second hand-rolled SVG staff.
 *
 * A drum chart is two rhythms on one staff: hands stems-up, feet stems-down.
 * That split lives in `PIECE_NOTATION` (`lib/drumTab/drumNotation.ts`); here it
 * becomes two VexFlow voices sharing a stave.
 *
 * Read-only. Editing happens in the Grid and Text views — a click here just
 * moves the play cursor.
 */

const STAFF_Y   = 34
const SYSTEM_H  = 128
const LEFT      = 10
const FIRST_EXTRA = 58   // room for the clef and time signature on a line's first bar

interface BarGeom {
  bar: number
  leftX: number
  noteStartX: number
  endX: number
  topY: number
  bottomY: number
  /** x of each drawn figure in the up voice, for cursor interpolation. */
  ticks: { beat: number; x: number }[]
}

interface Props {
  track: DrumTrack
  zoom: number
  currentBeat: number
  isPlaying: boolean
  onSeekBeat?: (beat: number) => void
}

export function DrumTabScore({ track, zoom, currentBeat, isPlaying, onSeekBeat }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const hostRef   = useRef<HTMLDivElement>(null)
  const geomRef   = useRef<BarGeom[]>([])

  const [containerW, setContainerW] = useState(0)
  const [height, setHeight] = useState(0)
  const [geomVersion, setGeomVersion] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => setContainerW(entries[0].contentRect.width))
    ro.observe(el)
    setContainerW(el.getBoundingClientRect().width)
    return () => ro.disconnect()
  }, [])

  // Sequences are pure and cheap to memo; the VexFlow pass below consumes them.
  const barSequences = useMemo(() => {
    const bpb = track.beatsPerBar
    return Array.from({ length: track.totalBars }, (_, bar) => ({
      bar,
      up:   buildVoiceSequence(track.hits, bar * bpb, bpb, 'up'),
      down: buildVoiceSequence(track.hits, bar * bpb, bpb, 'down'),
    }))
  }, [track.hits, track.beatsPerBar, track.totalBars])

  useEffect(() => {
    const host = hostRef.current
    if (!host || containerW <= 0) return
    let cancelled = false

    import('vexflow').then(VF => {
      if (cancelled || !host) return
      const { Renderer, Stave, StaveNote, Voice, Formatter, Beam, Annotation } = VF
      host.innerHTML = ''
      setError(null)

      const bpb    = track.beatsPerBar
      const availW = Math.max(340, containerW - 8)
      const wantW  = bpb * 78 * zoom

      // Pack bars into lines that fit the container — no horizontal scrolling.
      type LineItem = { bar: number; w: number }
      const lines: LineItem[][] = []
      let cur: LineItem[] = []
      let curW = LEFT
      for (let bar = 0; bar < track.totalBars; bar++) {
        const seq = barSequences[bar]
        const dense = Math.max(seq.up.length, seq.down.length)
        const base = Math.max(wantW, 40 + Math.max(2, dense) * 30)
        const extra = cur.length === 0 ? FIRST_EXTRA : 0
        const w = base + extra
        if (cur.length && curW + w > availW - LEFT) {
          lines.push(cur)
          cur = [{ bar, w: base + FIRST_EXTRA }]
          curW = LEFT + cur[0].w
        } else {
          cur.push({ bar, w })
          curW += w
        }
      }
      if (cur.length) lines.push(cur)

      // Stretch every line but the last to the full width.
      lines.forEach((ln, li) => {
        if (li === lines.length - 1) return
        const sum = ln.reduce((a, b) => a + b.w, LEFT)
        const slack = (availW - LEFT - sum) / ln.length
        if (slack > 0) ln.forEach(it => { it.w += slack })
      })

      const totalH = lines.length * SYSTEM_H + 20
      const renderer = new Renderer(host, Renderer.Backends.SVG)
      renderer.resize(availW, totalH)
      const ctx = renderer.getContext()
      const geom: BarGeom[] = []

      const makeVoiceNotes = (seq: NotatedItem[], voice: DrumVoice) => {
        const stemDir = voice === 'up' ? 1 : -1
        return seq.map(item => {
          if (item.isRest) {
            return new StaveNote({
              clef: 'percussion', keys: [REST_KEY[voice]], duration: item.duration + 'r',
            })
          }
          const note = new StaveNote({
            clef: 'percussion',
            keys: item.pieces.map(p => p.key),
            duration: item.duration,
          })
          note.setStemDirection(stemDir)
          item.pieces.forEach((p, i) => {
            // Open hi-hat gets the conventional small circle above the head.
            if (p.open) {
              try {
                note.addModifier(
                  new Annotation('o').setVerticalJustification(Annotation.VerticalJustify.TOP),
                  i,
                )
              } catch { /* annotation API drift — the note still draws */ }
            }
            // Ghost strokes are dimmed rather than parenthesised: `Parenthesis`
            // moved between VexFlow majors, and a wrong call here would take the
            // whole score down for a cosmetic detail.
            if (p.ghost) {
              try { note.setKeyStyle(i, { fillStyle: BT.dim, strokeStyle: BT.dim }) } catch { /* ditto */ }
            }
          })
          return note
        })
      }

      lines.forEach((ln, li) => {
        let x = LEFT
        const sysY = 10 + li * SYSTEM_H + STAFF_Y

        ln.forEach(({ bar, w }, pos) => {
          const stave = new Stave(x, sysY, w)
          if (pos === 0) stave.addClef('percussion')
          if (bar === 0) stave.addTimeSignature(bpb + '/4')
          stave.setContext(ctx).draw()

          const seq = barSequences[bar]
          const upNotes   = makeVoiceNotes(seq.up, 'up')
          const downNotes = makeVoiceNotes(seq.down, 'down')

          const upVoice   = new Voice({ numBeats: bpb, beatValue: 4 }).setStrict(false).addTickables(upNotes)
          const downVoice = new Voice({ numBeats: bpb, beatValue: 4 }).setStrict(false).addTickables(downNotes)

          const beamsOf = (notes: typeof upNotes, seqItems: NotatedItem[]) => {
            const beamable = notes.filter((_, i) =>
              !seqItems[i].isRest && vexDurationToBeats(seqItems[i].duration) <= 0.5)
            return beamable.length > 1 ? Beam.generateBeams(beamable) : []
          }
          const beams = [...beamsOf(upNotes, seq.up), ...beamsOf(downNotes, seq.down)]

          const fmtW = w - (stave.getNoteStartX() - x) - 20
          try {
            new Formatter()
              .joinVoices([upVoice])
              .joinVoices([downVoice])
              .format([upVoice, downVoice], Math.max(40, fmtW))
          } catch { /* overfull bar — VexFlow still draws what it can */ }

          upVoice.draw(ctx, stave)
          downVoice.draw(ctx, stave)
          beams.forEach(b => b.setContext(ctx).draw())

          const ticks: { beat: number; x: number }[] = []
          seq.up.forEach((item, i) => {
            const gx = (upNotes[i] as { getAbsoluteX?: () => number }).getAbsoluteX?.()
            if (typeof gx === 'number') ticks.push({ beat: bar * bpb + item.beatInBar, x: gx })
          })

          geom.push({
            bar,
            leftX: x,
            noteStartX: stave.getNoteStartX(),
            endX: x + w,
            topY: stave.getYForLine(0) - 22,
            bottomY: stave.getYForLine(4) + 22,
            ticks,
          })
          x += w
        })
      })

      geomRef.current = geom
      setHeight(totalH)
      setGeomVersion(v => v + 1)

      // VexFlow paints in pure black; retint to the staff ink of the theme.
      const svg = host.querySelector('svg')
      if (svg) {
        svg.style.display = 'block'
        const isBlack = (c: string | null) => !!c && /^(#000(000)?|black|rgb\(0, ?0, ?0\))$/i.test(c.trim())
        svg.querySelectorAll<SVGElement>('*').forEach(node => {
          if (isBlack(node.getAttribute('fill')))   node.setAttribute('fill', BT.staff)
          if (isBlack(node.getAttribute('stroke'))) node.setAttribute('stroke', BT.staff)
        })
      }
    }).catch(() => {
      if (!cancelled) setError('The score engine could not be loaded. The Grid and Text views still work.')
    })

    return () => { cancelled = true }
  }, [barSequences, track.beatsPerBar, track.totalBars, zoom, containerW])

  // ── Cursor ────────────────────────────────────────────────────────────────
  const cursor = useMemo(() => {
    void geomVersion
    const bpb = track.beatsPerBar
    const bar = Math.floor(currentBeat / bpb)
    const bg  = geomRef.current.find(g => g.bar === bar)
    if (!bg) return null
    const nodes = [
      { beat: bar * bpb, x: bg.noteStartX },
      ...bg.ticks,
      { beat: (bar + 1) * bpb, x: bg.endX - 6 },
    ].sort((a, b) => a.beat - b.beat)
    let x = nodes[nodes.length - 1].x
    for (let i = 0; i < nodes.length - 1; i++) {
      const a = nodes[i], b = nodes[i + 1]
      if (currentBeat >= a.beat && currentBeat <= b.beat) {
        const t = b.beat === a.beat ? 0 : (currentBeat - a.beat) / (b.beat - a.beat)
        x = a.x + t * (b.x - a.x)
        break
      }
    }
    return { x, top: bg.topY, height: bg.bottomY - bg.topY }
  }, [currentBeat, track.beatsPerBar, geomVersion])

  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!onSeekBeat) return
    const host = hostRef.current
    if (!host) return
    const rect = host.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
    const bpb = track.beatsPerBar
    const bg = geomRef.current.find(g =>
      px >= g.leftX && px <= g.endX && py >= g.topY - 12 && py <= g.bottomY + 12)
    if (!bg) return
    const span = Math.max(1, bg.endX - bg.noteStartX)
    const t = Math.max(0, Math.min(1, (px - bg.noteStartX) / span))
    onSeekBeat(bg.bar * bpb + t * bpb)
  }, [onSeekBeat, track.beatsPerBar])

  return (
    <div
      ref={scrollRef}
      style={{
        background: BT.card, border: '1px solid ' + BT.rule, borderRadius: 12,
        padding: 4, position: 'relative', minHeight: 160,
      }}
    >
      {error && (
        <p style={{ padding: 16, margin: 0, color: BT.muted, fontFamily: f('ui'), fontSize: 13 }}>
          {error}
        </p>
      )}
      <div
        ref={hostRef}
        onClick={handleClick}
        style={{ position: 'relative', cursor: onSeekBeat ? 'pointer' : 'default', minHeight: height }}
      />
      {cursor && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: cursor.x + 4,
            top: cursor.top + 4,
            width: 2,
            height: cursor.height,
            background: isPlaying ? BT.accent : alpha('accent', 0.45),
            borderRadius: 1,
            pointerEvents: 'none',
            transition: isPlaying ? 'none' : 'left 120ms ease-out',
          }}
        />
      )}
    </div>
  )
}
