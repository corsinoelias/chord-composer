import React, { useEffect, useRef } from 'react'
import { keyXFrac } from '../../lib/virtualPiano/pianoKeyLayout'
import { STAGE_H_PAD } from './pianoTheme'
import type { PianoTransport } from './usePianoTransport'

const LEAD_SEC = 2.2 // fixed time window a falling note is visible before it's due — independent of canvas height, see PianoVisualizer comment below
const HOLD_FULL_MS = 4000 // a held key keeps growing the whole time it's down — this is how long it takes to reach the full canvas height, it never plateaus early
const RELEASE_MS = 550 // how long the bar takes to rise off and fade after key-up
const VIOLET = '#a596ff'
const TEAL = '#5fe3c9'

// A live key press: rooted at the keyboard line while held (offAt === null),
// then detaches and rises off the top fading out after release — the same
// visual language as a falling song note, played backwards. Only spawned for
// actual user input (mouse/touch/computer-keyboard/MIDI), not for notes a
// song plays automatically — see spawnLiveBurst/endLiveBurst in VirtualPiano.tsx.
export interface Burst { midi: number; xFrac: number; wFrac: number; black: boolean; onAt: number; offAt: number | null }

interface Props {
  transport: PianoTransport
  baseOctave: number
  nOct: number
  burstsRef: React.MutableRefObject<Burst[]>
  /** Must match the blackWidthFactor VirtualPiano.tsx used to render the actual keys, or falling notes drift off the black keys. */
  blackWidthFactor: number
}

/**
 * Full-height falling-notes canvas. Notes are placed by real time-to-target
 * (`note.time - posSec`), not by pixel speed, so a note takes the same
 * LEAD_SEC to fall on a phone as on a monitor — only the px/sec changes with
 * screen height, which is what you want (see piano/plan notes on Phase 5).
 *
 * x position is a 0..1 fraction of the canvas width computed the same way
 * VirtualPiano lays out keys (see keyXFrac below) — this canvas and the
 * keyboard frame must share identical horizontal padding for notes to land
 * on the correct key; both are set to `10px` in VirtualPiano.tsx.
 */
export function PianoVisualizer({ transport, baseOctave, nOct, burstsRef, blackWidthFactor }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number | null>(null)
  const baseOctaveRef = useRef(baseOctave); baseOctaveRef.current = baseOctave
  const nOctRef = useRef(nOct); nOctRef.current = nOct
  const blackWidthFactorRef = useRef(blackWidthFactor); blackWidthFactorRef.current = blackWidthFactor

  useEffect(() => {
    const draw = () => {
      rafRef.current = requestAnimationFrame(draw)
      const cv = canvasRef.current
      if (!cv) return
      const W = cv.clientWidth, H = cv.clientHeight
      if (!W || !H) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      if (cv.width !== W * dpr || cv.height !== H * dpr) { cv.width = W * dpr; cv.height = H * dpr }
      const g = cv.getContext('2d')
      if (!g) return
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      g.clearRect(0, 0, W, H)

      const now = performance.now()
      burstsRef.current = burstsRef.current.filter(b => b.offAt === null || now - b.offAt < RELEASE_MS)
      burstsRef.current.forEach(b => {
        const barW = Math.max(6, b.wFrac * W - 2)
        const x = b.xFrac * W + 1
        g.fillStyle = b.black ? TEAL : VIOLET
        if (b.offAt === null) {
          // Held: a bar rooted at the keyline that keeps growing the whole time it's held.
          const h = Math.min(H, ((now - b.onAt) / HOLD_FULL_MS) * H)
          g.globalAlpha = 0.85
          g.beginPath()
          g.roundRect(x, H - h, barW, h, 5)
          g.fill()
        } else {
          // Released: the bar it had grown to detaches and rises off, fading out.
          const heldH = Math.min(H, ((b.offAt - b.onAt) / HOLD_FULL_MS) * H)
          const t = (now - b.offAt) / RELEASE_MS
          const yBottom = H - H * 0.42 * t
          const yTop = Math.max(0, yBottom - heldH)
          g.globalAlpha = Math.max(0, 1 - t) * 0.85
          g.beginPath()
          g.roundRect(x, yTop, barW, Math.min(heldH, H - yTop), 5)
          g.fill()
        }
      })
      g.globalAlpha = 1

      const posSec = transport.posSecRef.current
      const notes = transport.notesRef.current
      const practice = transport.practice
      notes.forEach(n => {
        const remain = n.time - posSec
        if (remain > LEAD_SEC || remain < -0.4) return
        const pos = keyXFrac(n.midi, baseOctaveRef.current, nOctRef.current, blackWidthFactorRef.current)
        if (!pos) return
        const [xFrac, wFrac] = pos
        const barW = Math.max(6, wFrac * W - 2) // same width formula as the live-press bar (b.wFrac*W-2 above) — they're the same key
        const barH = Math.max(14, (n.dur / LEAD_SEC) * H * 0.9)
        const yBottom = H - (remain / LEAD_SEC) * H
        const yTop = Math.min(yBottom - barH, H)
        if (practice && n.judged === 'hit') return
        let color: string
        if (practice) {
          color = n.judged === 'miss' ? 'rgba(255,93,122,.35)' : VIOLET
        } else {
          const hue = (n.midi % 12) * 30
          color = `hsl(${hue} 70% 68%)`
        }
        g.globalAlpha = practice && n.judged === 'miss' ? 0.55 : 0.92
        g.fillStyle = color
        g.beginPath()
        g.roundRect(xFrac * W + 1, Math.max(0, yTop), barW, Math.min(barH, H - Math.max(0, yTop)), 5)
        g.fill()
      })
      g.globalAlpha = 1
    }
    rafRef.current = requestAnimationFrame(draw)
    return () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // NOT `inset: 0` — see STAGE_H_PAD's comment in pianoTheme.ts. This has to
  // land on exactly the same pixels as the keyboard frame below it.
  return <canvas ref={canvasRef} style={{ position: 'absolute', top: 0, bottom: 0, left: STAGE_H_PAD, right: STAGE_H_PAD, width: `calc(100% - ${STAGE_H_PAD * 2}px)`, height: '100%', display: 'block' }} />
}
