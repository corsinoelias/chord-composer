import React, { useEffect, useMemo, useRef, useState } from 'react'
import { GuitarNeck, type Vib } from './GuitarNeck'
import { computeNeckGeometry, fretsForWidth } from '@/lib/guitar/neckGeometry'

const OPEN_ROWS = [0, 0, 0, 0, 0, 0]
const NO_ROWS: number[][] = [[], [], [], [], [], []]

interface Props {
  /** The fret sounding on each string right now (row 0 = high e), null when silent. */
  activeFrets: (number | null)[]
  /** Bumped per string on every attack, so the string can vibrate. */
  attackSignals: ({ fret: number; v: number } | null)[]
  /** A tap on a fret. The editor places a note at the cursor; the recorder records one. */
  onNoteClick: (stringIndex: number, fret: number) => void
  /** The note being edited, outlined on the neck. */
  selected?: { stringIndex: number; fret: number } | null
  /** Highest fret the track uses, so the window widens rather than hide a note. */
  maxFret?: number
  height: number
}

/**
 * The neck of the /guitar/ instrument (`GuitarNeck`), fitted to the tab editor: taps
 * only, no strumming, frets labelled with numbers, and the window as wide as the
 * song needs — 12 frets by default (fewer on a narrow screen), up to 24.
 */
export function GuitarTabNeck({ activeFrets, attackSignals, onNoteClick, selected = null, maxFret = 0, height }: Props) {
  const fbRef = useRef<HTMLDivElement>(null)
  const vibRef = useRef<Vib[]>(Array.from({ length: 6 }, () => ({ amp: 0, t0: -99, freq: 18 })))
  const [size, setSize] = useState({ w: 900, h: height })

  useEffect(() => {
    const el = fbRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const r = entries[0]?.contentRect
      if (r) setSize({ w: Math.round(r.width), h: Math.round(r.height) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const pluck = (row: number) => {
    vibRef.current[row] = { amp: 6 + row * 1.2, t0: performance.now() / 1000, freq: 13 + (5 - row) * 2.2 }
  }

  // Every attack during playback shakes its string, as a tap does on /guitar/.
  const lastSig = useRef<(number | null)[]>(Array(6).fill(null))
  useEffect(() => {
    attackSignals.forEach((sig, row) => {
      if (!sig || sig.v === lastSig.current[row]) return
      lastSig.current[row] = sig.v
      pluck(row)
    })
  }, [attackSignals])

  const geo = useMemo(() => computeNeckGeometry(size.w, size.h, {
    fretFrom: 0,
    fretTo: Math.min(24, Math.max(fretsForWidth(size.w), maxFret)),
    footerH: 30,
  }), [size.w, size.h, maxFret])

  const highlightRows = useMemo(() => {
    if (!selected) return NO_ROWS
    return NO_ROWS.map((_, row) => (row === selected.stringIndex ? [selected.fret] : []))
  }, [selected])

  return (
    <div style={{ height, display: 'flex' }}>
      <GuitarNeck
        geo={geo}
        fbRef={fbRef}
        shapeRows={OPEN_ROWS}
        hasShape={false}
        activeRows={activeFrets}
        highlightRows={highlightRows}
        markRows={NO_ROWS}
        vibRef={vibRef}
        labelMode="frets"
        lefty={false}
        strum={false}
        onPlay={(row, fret) => { pluck(row); onNoteClick(row, fret) }}
      />
    </div>
  )
}
