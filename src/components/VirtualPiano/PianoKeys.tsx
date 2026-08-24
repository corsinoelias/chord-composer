import React from 'react'
import { WHITE_SEMITONES } from '../../lib/virtualPiano/pianoKeyLayout'
import { TEAL, VIOLET } from './pianoTheme'

type LabelMode = 'none' | 'notes' | 'keys'
type Notation = 'latina' | 'anglo'

const LAT = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si']
const ANG = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const ROW = 'QWERTYUIOP'

interface KeyEvents { down: (e: React.PointerEvent) => void; up: () => void; enter: () => void }

interface Props {
  baseOctave: number
  nOct: number
  active: Record<number, boolean>
  marked: number[]
  labelMode: LabelMode
  notation: Notation
  blackWidthFactor: number
  whiteMidi: (i: number) => number
  keyHandlers: (midi: number) => KeyEvents
}

function labelFor(midi: number, isBlack: boolean, labelMode: LabelMode, notation: Notation, baseOctave: number): string {
  if (labelMode === 'none') return ''
  if (labelMode === 'keys') {
    const pc = midi % 12
    const oct = Math.floor(midi / 12) - 1 - baseOctave
    if (!isBlack) {
      const i = oct * 7 + WHITE_SEMITONES.indexOf(pc)
      return i >= 0 && i < 10 ? ROW[i] : ''
    }
    const wi = oct * 7 + WHITE_SEMITONES.indexOf(pc - 1)
    if (wi < 0 || wi > 8) return ''
    const d = wi + 2
    return d <= 9 ? String(d) : '0'
  }
  const names = notation === 'latina' ? LAT : ANG
  return names[midi % 12] + (Math.floor(midi / 12) - 1)
}

/**
 * The physical keyboard — split out and React.memo'd so it does NOT re-render
 * on the transport clock's ~20/s posSec ticks (VirtualPiano calls
 * usePianoTransport directly, so every tick re-renders VirtualPiano itself;
 * without this split, that meant re-rendering and repainting 25+ key <div>s
 * every ~50ms during song playback, stealing main-thread time from the
 * visualizer canvas's own rAF loop and making the falling notes stutter).
 * All props here are either primitives or references that only change on an
 * actual key press/settings change (see keyHandlers/whiteMidi's stable
 * useCallback deps in VirtualPiano.tsx) — never on a posSec tick — so
 * React.memo's shallow comparison correctly skips this subtree in between.
 */
function PianoKeysImpl({ baseOctave, nOct, active, marked, labelMode, notation, blackWidthFactor, whiteMidi, keyHandlers }: Props) {
  const nW = nOct * 7 + 1
  interface KeyRenderData { midi: number; label: string; style: React.CSSProperties; dotStyle: React.CSSProperties; h: KeyEvents }
  const whites: KeyRenderData[] = []
  const blacks: KeyRenderData[] = []

  for (let i = 0; i < nW; i++) {
    const midi = whiteMidi(i)
    const act = !!active[midi]
    const isMarked = marked.includes(midi)
    whites.push({
      midi,
      h: keyHandlers(midi),
      label: labelFor(midi, false, labelMode, notation, baseOctave),
      style: {
        flex: 1, position: 'relative', minWidth: 0, cursor: 'pointer', userSelect: 'none', touchAction: 'none',
        border: '1px solid #b8ac86', borderTop: 'none', borderRadius: '0 0 6px 6px',
        background: act ? 'linear-gradient(180deg,#e4d9ff,#c9b8ff)' : 'linear-gradient(180deg,#f7f2e4,#ddd2b0)',
        boxShadow: act ? 'inset 0 -5px 10px rgba(124,92,255,.35)' : 'inset 0 -5px 6px rgba(0,0,0,.10)',
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center',
        paddingBottom: 8, gap: 6,
      },
      dotStyle: {
        display: isMarked ? 'block' : 'none', width: 10, height: 10, borderRadius: '50%',
        background: VIOLET, boxShadow: '0 0 6px ' + VIOLET,
      },
    })
    if (i < nW - 1 && [0, 1, 3, 4, 5].includes(i % 7)) {
      const bm = midi + 1
      const bact = !!active[bm]
      const bmarked = marked.includes(bm)
      const bw = (blackWidthFactor * 100) / nW
      blacks.push({
        midi: bm,
        h: keyHandlers(bm),
        label: labelFor(bm, true, labelMode, notation, baseOctave),
        style: {
          position: 'absolute', top: 0, left: ((i + 1) * 100 / nW - bw / 2) + '%', width: bw + '%', height: '62%',
          cursor: 'pointer', userSelect: 'none', touchAction: 'none', zIndex: 2,
          background: bact ? 'linear-gradient(180deg,#a596ff,#7c5cff)' : 'linear-gradient(180deg,#2a2236,#18131f)',
          border: '1px solid #000', borderTop: 'none', borderRadius: '0 0 5px 5px',
          boxShadow: bact ? '0 0 14px rgba(124,92,255,.75)' : '0 3px 5px rgba(0,0,0,.5), inset 0 -4px 5px rgba(0,0,0,.5)',
          display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center',
          paddingBottom: 6, gap: 5,
        },
        dotStyle: {
          display: bmarked ? 'block' : 'none', width: 8, height: 8, borderRadius: '50%',
          background: TEAL, boxShadow: '0 0 6px ' + TEAL,
        },
      })
    }
  }

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
      {whites.map(k => (
        <div key={k.midi} onPointerDown={k.h.down} onPointerUp={k.h.up} onPointerEnter={k.h.enter} onPointerLeave={k.h.up} style={k.style}>
          <div style={k.dotStyle} />
          <span style={{ fontSize: 'clamp(9px, 1.2vw, 13px)', color: '#8a7f5c', fontWeight: 600, pointerEvents: 'none' }}>{k.label}</span>
        </div>
      ))}
      {blacks.map(k => (
        <div key={k.midi} onPointerDown={k.h.down} onPointerUp={k.h.up} onPointerEnter={k.h.enter} onPointerLeave={k.h.up} style={k.style}>
          <div style={k.dotStyle} />
          <span style={{ fontSize: 'clamp(8px, 1vw, 11px)', color: '#cfc6ee', fontWeight: 600, pointerEvents: 'none' }}>{k.label}</span>
        </div>
      ))}
    </div>
  )
}

export const PianoKeys = React.memo(PianoKeysImpl)
