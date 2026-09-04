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
 *
 * **Bars are fitted to the line, not the line to the bars.** The first version
 * asked for a fixed 78px per beat and then only ever stretched a line that had
 * room to spare, over a canvas with a 340px floor under it. On a 360px phone
 * that came out as a 370px bar drawn into a 340px canvas inside a 326px box:
 * the closing barline and the last eighth were outside the card entirely. Now a
 * line gets a music budget — what is left after the clef, time signature and
 * repeat signs, none of which can be squeezed — and its bars are scaled into
 * that budget in whichever direction they need to go.
 *
 * **What is drawn in the SVG and what is drawn over it.** VexFlow owns the
 * music: staves, noteheads, beams, barlines, the time signature. Bar numbers,
 * rehearsal marks and the tempo are HTML laid over it from the geometry the
 * draw pass records, so they carry the app's own type and colour rather than
 * Bravura's, and so a VexFlow API change can never take the score down for the
 * sake of a label.
 */

// ── Vertical rhythm ────────────────────────────────────────────────────────
/**
 * Padding added *on top of* the ~40px VexFlow already reserves above the first
 * staff line for things written over the staff. That reserve is where the
 * cymbal crosses and the bar number live, so this only has to buy a little air
 * — the previous 34 sat on top of the 40 and produced 74px of white above every
 * system, which is most of what made the score look padded out on a phone.
 */
const STAFF_Y = 4
/**
 * One system, top edge to top edge. Asymmetric on purpose: the feet voice hangs
 * much further below the staff than the hands voice reaches above it.
 */
const SYSTEM_H = 132
/**
 * Space above the first system for the tempo mark. Sized so it still clears the
 * tempo once the whole engraving is scaled down: even at `SCALE_FLOOR` this is
 * ~22 device pixels, which is what the mark occupies.
 */
const TOP_MATTER = 36

// ── Horizontal rhythm ──────────────────────────────────────────────────────
const LEFT = 10
/** So the final barline lands inside the card rather than on its edge. */
const RIGHT = 8

/**
 * Fallbacks for the preamble widths, used only if VexFlow refuses to measure
 * itself. The real numbers come from `preamble()` in the draw pass.
 */
const CLEF_W   = 40
const TIME_W   = 32
const REPEAT_W = 18
/** The closing barline, plus air so it is not welded to the last notehead. */
const END_W    = 14

/**
 * How far the engraving may be shrunk to make a system fit before we give up
 * and let it scroll sideways instead. Below about this the noteheads stop being
 * distinguishable from each other on a phone.
 */
const SCALE_FLOOR = 0.62

interface BarGeom {
  bar: number
  leftX: number
  noteStartX: number
  endX: number
  /** Top of the system's bar-number strip, in card pixels. */
  markY: number
  topY: number
  bottomY: number
  /** x of each drawn figure in the up voice, for cursor interpolation. */
  ticks: { beat: number; x: number }[]
}

interface Props {
  track: DrumTrack
  zoom: number
  /** Reads the live playhead, so the cursor moving never re-renders the score. */
  getBeat: () => number
  /** Where the cursor rests when nothing is playing — a click, or the top. */
  currentBeat: number
  isPlaying: boolean
  /** Drawn as repeat barlines, because it is what the transport is doing. */
  loop?: boolean
  onSeekBeat?: (beat: number) => void
}

function DrumTabScoreImpl({
  track, zoom, getBeat, currentBeat, isPlaying, loop = false, onSeekBeat,
}: Props) {
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
    // Whole pixels only: a fractional width would re-engrave the entire score on
    // sub-pixel jitter.
    const ro = new ResizeObserver(entries => {
      const w = Math.round(entries[0].contentRect.width)
      setContainerW(prev => (prev === w ? prev : w))
    })
    ro.observe(el)
    setContainerW(Math.round(el.getBoundingClientRect().width))
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

  /** Section name by the bar it starts on, for the rehearsal marks. */
  const sectionAtBar = useMemo(() => {
    const map = new Map<number, string>()
    for (const s of track.sections ?? []) {
      if (s.startBar >= 0 && s.startBar < track.totalBars) map.set(s.startBar, s.name)
    }
    return map
  }, [track.sections, track.totalBars])

  useEffect(() => {
    const host = hostRef.current
    if (!host || containerW <= 0) return
    let cancelled = false

    import('vexflow').then(VF => {
      if (cancelled || !host) return
      const { Renderer, Stave, StaveNote, Voice, Formatter, Beam, Annotation, Barline } = VF
      setError(null)

      const bpb       = track.beatsPerBar
      const lastBar   = track.totalBars - 1
      const availW    = Math.max(160, containerW - 8)
      const lineSpace = availW - LEFT - RIGHT

      /**
       * What VexFlow draws before the first notehead — the part of a bar's width
       * that fitting must not touch.
       *
       * Measured, not guessed. The guess (32 + 26 + 14) was well under what a
       * percussion clef, a 4/4 and a repeat sign actually take, and a budget
       * wrong by that much is what pushed bar 1 off the edge of a 360px phone.
       * An unused `Stave` answers the question exactly, and three cost nothing.
       */
      const preamble = (clef: boolean, time: boolean, repeat: boolean) => {
        try {
          const s = new Stave(0, 0, 400)
          if (clef) s.addClef('percussion')
          if (time) s.addTimeSignature(bpb + '/4')
          if (repeat) s.setBegBarType(Barline.type.REPEAT_BEGIN)
          return s.getNoteStartX()
        } catch {
          return (clef ? CLEF_W : 0) + (time ? TIME_W : 0) + (repeat ? REPEAT_W : 0)
        }
      }
      const PRE_MID   = preamble(false, false, false)   // a bar in the middle of a line
      const PRE_CLEF  = preamble(true, false, false)    // first bar of a continuation line
      const PRE_FIRST = preamble(true, true, loop)      // bar 1 of the chart

      const extraFor = (bar: number, firstOnLine: boolean) =>
        (bar === 0 ? PRE_FIRST : firstOnLine ? PRE_CLEF : PRE_MID)
        + (bar === lastBar ? END_W : 0)

      const density = (bar: number) => {
        const seq = barSequences[bar]
        return Math.max(2, seq.up.length, seq.down.length)
      }

      /**
       * Two widths, because they answer two different questions.
       *
       * `wantFor` decides how many bars go on a line, and is deliberately the
       * same for every bar: a system of two bars and a system of three, chosen
       * by which bars happen to be busy, reads as a mistake.
       *
       * `weightFor` then shares that line out, and is deliberately *not* the
       * same for every bar: a bar of sixteenths needs more room than a bar of
       * quarters, and giving them equal width is what made the fill in bar 4
       * collide with itself.
       */
      const wantFor   = (bar: number) => Math.max(bpb * 78 * zoom, 40 + density(bar) * 30)
      const weightFor = (bar: number) => 40 + density(bar) * 26

      // ── Which bars share a system ───────────────────────────────────────
      // Decided once, at natural widths, so the two draw passes below can never
      // reshuffle the layout between them.
      type LineItem = { bar: number; music: number; extra: number }
      const widthOf = (it: LineItem) => it.music + it.extra

      const lines: LineItem[][] = []
      {
        let cur: LineItem[] = []
        let curW = 0
        for (let bar = 0; bar <= lastBar; bar++) {
          const item = { bar, music: wantFor(bar), extra: extraFor(bar, cur.length === 0) }
          if (cur.length && curW + widthOf(item) > lineSpace) {
            lines.push(cur)
            // Opening a line means paying for a clef this bar was not charged for.
            cur = [{ ...item, extra: extraFor(bar, true) }]
            curW = widthOf(cur[0])
          } else {
            cur.push(item)
            curW += widthOf(item)
          }
        }
        if (cur.length) lines.push(cur)
      }

      /**
       * Share each line's music out by weight, into whatever space it has —
       * which both stretches a line that had room to spare and contracts one
       * that did not, in a single pass. The one exception is a last line holding
       * fewer bars than the one above it: engraving leaves that short rather
       * than blowing two bars up to the width of four.
       */
      const distribute = (space: number) => {
        lines.forEach((ln, li) => {
          ln.forEach(it => { it.music = wantFor(it.bar) })
          const fixed   = ln.reduce((a, it) => a + it.extra, 0)
          const natural = ln.reduce((a, it) => a + it.music, 0)
          const budget  = space - fixed
          if (budget <= 0) return
          const shortLast = li === lines.length - 1 && li > 0 && ln.length < lines[li - 1].length
          if (budget >= natural && shortLast) return

          const weights = ln.map(it => weightFor(it.bar))
          const total   = weights.reduce((a, b) => a + b, 0)
          if (total <= 0) return
          ln.forEach((it, i) => { it.music = budget * (weights[i] / total) })
        })
      }

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

      /**
       * Engrave the whole score at `scale`, and report how far right the ink
       * actually reached.
       *
       * That last part is the point. `Formatter.format` treats its width as a
       * *target*, not a limit: a bar told to fit in 167px whose voices need 231
       * simply draws 231, past the end of the canvas, where the SVG clips it —
       * which is how two of bar 1's eighths were vanishing on a 360px phone
       * while the note count stayed right. VexFlow's own `preCalculateMin-
       * TotalWidth` is no help either; it reports far more than it goes on to
       * use, and budgeting from it drove every phone to one bar per system and
       * a sideways scroll. So the honest measurement is the drawing itself.
       */
      const engrave = (scale: number, canvasW: number) => {
        host.innerHTML = ''
        // `ctx.scale` in VexFlow 5 is a `viewBox`, not a transform: the canvas
        // stays `canvasW` CSS pixels wide and the space inside it becomes
        // `canvasW / scale` logical units. So that, not `lineSpace`, is what
        // there is to lay out in.
        distribute(canvasW / scale - LEFT - RIGHT)

        const logicalH = TOP_MATTER + lines.length * SYSTEM_H + 12
        const canvasH  = Math.ceil(logicalH * scale)
        const renderer = new Renderer(host, Renderer.Backends.SVG)
        renderer.resize(canvasW, canvasH)
        const ctx = renderer.getContext()
        // Everything below is laid out in logical units; this maps them onto the
        // card. Geometry handed to the overlays is multiplied back out to match.
        if (scale !== 1) ctx.scale(scale, scale)

        const geom: BarGeom[] = []

        lines.forEach((ln, li) => {
          let x = LEFT
          const sysTop = TOP_MATTER + li * SYSTEM_H
          const sysY   = sysTop + STAFF_Y

          ln.forEach((item, pos) => {
            const { bar } = item
            const w = widthOf(item)
            const stave = new Stave(x, sysY, w)
            if (pos === 0) stave.addClef('percussion')
            if (bar === 0) stave.addTimeSignature(bpb + '/4')
            // The transport loops by default, so the chart says so.
            try {
              if (bar === 0 && loop) stave.setBegBarType(Barline.type.REPEAT_BEGIN)
              if (bar === lastBar) {
                stave.setEndBarType(loop ? Barline.type.REPEAT_END : Barline.type.END)
              }
            } catch { /* barline API drift — the plain single line still draws */ }
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

            const fmtW = w - (stave.getNoteStartX() - x) - 16
            try {
              new Formatter()
                .joinVoices([upVoice])
                .joinVoices([downVoice])
                .format([upVoice, downVoice], Math.max(40, fmtW))
            } catch { /* overfull bar — VexFlow still draws what it can */ }

            upVoice.draw(ctx, stave)
            downVoice.draw(ctx, stave)
            beams.forEach(b => b.setContext(ctx).draw())

            // Geometry leaves logical space here: the overlays and the cursor
            // are HTML over the card, so they want the coordinates it sees.
            const ticks: { beat: number; x: number }[] = []
            seq.up.forEach((sItem, i) => {
              const gx = (upNotes[i] as { getAbsoluteX?: () => number }).getAbsoluteX?.()
              if (typeof gx === 'number') ticks.push({ beat: bar * bpb + sItem.beatInBar, x: gx * scale })
            })

            geom.push({
              bar,
              leftX: x * scale,
              noteStartX: stave.getNoteStartX() * scale,
              endX: (x + w) * scale,
              markY: (sysTop + 2) * scale,
              topY: (stave.getYForLine(0) - 22) * scale,
              bottomY: (stave.getYForLine(4) + 22) * scale,
              ticks,
            })
            x += w
          })
        })

        const svg = host.querySelector('svg')
        let inkRight = 0
        if (svg) {
          svg.style.display = 'block'
          // The union of everything drawn — in logical units, like everything
          // else inside the viewBox.
          try {
            const b = svg.getBBox()
            inkRight = b.x + b.width
          } catch { inkRight = 0 }
        }
        return { geom, svg, canvasH, inkRight }
      }

      /**
       * Engrave, look at where the ink actually landed, and shrink until it is
       * inside the card. Two passes settle it in practice; the third is there
       * because each pass changes the layout it is measuring, so convergence is
       * asymptotic rather than exact.
       */
      let scale = 1
      let out = engrave(scale, availW)
      for (let pass = 0; pass < 3; pass++) {
        const device = (out.inkRight + RIGHT) * scale
        if (device <= availW + 0.5) break
        // Draw it smaller rather than draw it wrong. This is what a human
        // engraver does with a narrow page; the alternatives are noteheads that
        // touch, or notes that are not there at all.
        const next = Math.max(SCALE_FLOOR, scale * (availW / device))
        if (next >= scale - 0.002) break   // already as small as we will go
        scale = next
        out = engrave(scale, availW)
      }

      // Still over at the floor — a bar too dense for this screen at any size we
      // are willing to draw. Widen the canvas so the score scrolls sideways
      // rather than losing the notes off the end of it.
      const device = (out.inkRight + RIGHT) * scale
      if (device > availW + 0.5) out = engrave(scale, Math.ceil(device))

      geomRef.current = out.geom
      setHeight(out.canvasH)
      setGeomVersion(v => v + 1)

      // VexFlow paints in pure black; retint to the staff ink of the theme.
      if (out.svg) {
        const isBlack = (c: string | null) => !!c && /^(#000(000)?|black|rgb\(0, ?0, ?0\))$/i.test(c.trim())
        out.svg.querySelectorAll<SVGElement>('*').forEach(node => {
          if (isBlack(node.getAttribute('fill')))   node.setAttribute('fill', BT.staff)
          if (isBlack(node.getAttribute('stroke'))) node.setAttribute('stroke', BT.staff)
        })
      }
    }).catch(() => {
      if (!cancelled) setError('The score engine could not be loaded. The Grid and Text views still work.')
    })

    return () => { cancelled = true }
  }, [barSequences, track.beatsPerBar, track.totalBars, zoom, containerW, loop])

  // ── Marks ─────────────────────────────────────────────────────────────────
  /**
   * Bar numbers and rehearsal marks, positioned from the geometry the draw pass
   * recorded. They sit high in the space VexFlow reserves above the staff, above
   * the ledger line a crash is written on, so the two cannot collide.
   *
   * `+ 4` on both axes is the card's own padding: geometry is in SVG
   * coordinates and these are positioned against the card.
   */
  const marks = useMemo(() => {
    void geomVersion
    return geomRef.current.map(g => ({
      bar: g.bar,
      x: g.leftX + 4 + 2,
      y: g.markY + 4,
      section: sectionAtBar.get(g.bar),
    }))
  }, [geomVersion, sectionAtBar])

  // ── Cursor ────────────────────────────────────────────────────────────────
  /**
   * Written straight to the DOM, never rendered.
   *
   * The cursor is the one thing here that moves sixty times a second, and the
   * thing around it is a VexFlow engraving of the whole pattern — putting the
   * beat in state meant React reconciled the entire score on every frame to
   * shift a 2px line. `place()` is the only thing that touches it: the frame
   * loop calls it while the transport runs, and an effect calls it once when
   * the music is re-engraved or the beat is moved by hand.
   */
  const cursorRef = useRef<HTMLDivElement>(null)

  const place = useCallback((beat: number) => {
    const el = cursorRef.current
    if (!el) return
    const bpb = track.beatsPerBar
    const bar = Math.floor(beat / bpb)
    const bg  = geomRef.current.find(g => g.bar === bar)
    if (!bg) { el.style.opacity = '0'; return }

    // The figures in the bar, book-ended by its start and its bar line, so the
    // cursor travels smoothly across a rest as well as across a note.
    const nodes = [
      { beat: bar * bpb, x: bg.noteStartX },
      ...bg.ticks,
      { beat: (bar + 1) * bpb, x: bg.endX - 6 },
    ]
    let x = nodes[nodes.length - 1].x
    for (let i = 0; i < nodes.length - 1; i++) {
      const a = nodes[i], b = nodes[i + 1]
      if (beat >= a.beat && beat <= b.beat) {
        const t = b.beat === a.beat ? 0 : (beat - a.beat) / (b.beat - a.beat)
        x = a.x + t * (b.x - a.x)
        break
      }
    }

    el.style.opacity = '1'
    el.style.height = (bg.bottomY - bg.topY) + 'px'
    el.style.transform = `translate(${x + 4}px, ${bg.topY + 4}px)`
    return bg.topY
  }, [track.beatsPerBar])

  // Stopped: follow the beat the player hands us (the top of the track, or
  // wherever the last click landed).
  useEffect(() => {
    if (isPlaying) return
    place(currentBeat)
  }, [currentBeat, isPlaying, geomVersion, place])

  // Playing: our own loop, and the system the cursor is on is kept on screen —
  // a four-bar groove wraps onto three systems on a phone, and following it by
  // hand is not reading music.
  useEffect(() => {
    if (!isPlaying) return
    let raf = 0
    let lastTop: number | undefined
    const follow = () => {
      const top = place(getBeat())
      if (top !== undefined && top !== lastTop) {
        lastTop = top
        cursorRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      }
      raf = requestAnimationFrame(follow)
    }
    raf = requestAnimationFrame(follow)
    return () => cancelAnimationFrame(raf)
  }, [isPlaying, getBeat, place])

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
        // The fitting pass above means this practically never engages. It is
        // here so a bar that genuinely cannot be squeezed scrolls, rather than
        // bleeding out over the card's own border.
        overflowX: 'auto',
      }}
    >
      {error && (
        <p style={{ padding: 16, margin: 0, color: BT.muted, fontFamily: f('ui'), fontSize: 13 }}>
          {error}
        </p>
      )}

      {/* Tempo, where a chart puts it: above the first bar, left of everything. */}
      {!error && (
        <div style={{
          position: 'absolute', left: LEFT + 6, top: 7,
          fontFamily: f('mono'), fontSize: 11, fontWeight: 600, letterSpacing: '.02em',
          color: BT.muted, fontVariantNumeric: 'tabular-nums', pointerEvents: 'none',
        }}>
          {'♩'} = {track.bpm}
        </div>
      )}

      <div
        ref={hostRef}
        onClick={handleClick}
        style={{ position: 'relative', cursor: onSeekBeat ? 'pointer' : 'default', minHeight: height }}
      />

      {marks.map(m => (
        <div
          key={m.bar}
          aria-hidden="true"
          style={{
            position: 'absolute', left: m.x, top: m.y,
            display: 'flex', alignItems: 'center', gap: 5,
            pointerEvents: 'none', whiteSpace: 'nowrap',
          }}
        >
          <span style={{
            fontFamily: f('mono'), fontSize: 9.5, fontWeight: 700,
            fontVariantNumeric: 'tabular-nums', color: BT.dim, lineHeight: 1,
          }}>
            {m.bar + 1}
          </span>
          {m.section && (
            <span style={{
              fontFamily: f('ui'), fontSize: 9, fontWeight: 700,
              letterSpacing: '.08em', textTransform: 'uppercase', lineHeight: 1,
              color: BT.accent, background: BT.accentWash,
              border: '1px solid ' + alpha('accent', 0.35),
              borderRadius: 4, padding: '2px 5px',
            }}>
              {m.section}
            </span>
          )}
        </div>
      ))}

      <div
        ref={cursorRef}
        aria-hidden="true"
        style={{
          position: 'absolute', left: 0, top: 0, width: 2, height: 0, opacity: 0,
          background: isPlaying ? BT.accent : alpha('accent', 0.45),
          borderRadius: 1,
          pointerEvents: 'none',
          willChange: 'transform',
        }}
      />
    </div>
  )
}

/**
 * Memoised: the player above re-renders on every sixteenth, and re-running a
 * VexFlow engraving pass for that would be the most expensive thing on the page.
 */
export const DrumTabScore = React.memo(DrumTabScoreImpl)
