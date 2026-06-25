import React, { useState } from 'react'
import type { GuitarNote, GuitarStringIndex } from '../../lib/guitarTab/types'
import { CHORD_SHAPES, type ChordShape } from '../../lib/guitarTab/guitarTheory'

interface Props {
  cursorBeat: number
  onInsertChord: (notes: GuitarNote[]) => void
}

export function GuitarChordHelper({ cursorBeat, onInsertChord }: Props) {
  const [hovered, setHovered] = useState<string | null>(null)
  const [flashed, setFlashed] = useState<string | null>(null)

  const handleClick = (chord: ChordShape) => {
    const notes: GuitarNote[] = chord.notes
      .filter((n): n is NonNullable<typeof n> => n !== null)
      .map(n => ({
        id: crypto.randomUUID(),
        stringIndex: n.stringIndex as GuitarStringIndex,
        fret: n.fret,
        startBeat: cursorBeat,
        durationBeats: 1,
        velocity: 0.8,
      }))
    onInsertChord(notes)
    setFlashed(chord.name)
    setTimeout(() => setFlashed(null), 300)
  }

  return (
    <div style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0', padding: '8px 12px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        Chord Helper — click to insert at cursor
      </div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {CHORD_SHAPES.map(chord => (
          <ChordButton
            key={chord.name}
            chord={chord}
            isHovered={hovered === chord.name}
            isFlashed={flashed === chord.name}
            onHover={setHovered}
            onClick={() => handleClick(chord)}
          />
        ))}
      </div>
    </div>
  )
}

// ── Diagram layout ────────────────────────────────────────────────────────────
const DW = 40; const DH = 36
const PAD_L = 5; const PAD_R = 5; const PAD_T = 6; const PAD_B = 4
const FRET_ROWS = 4
const CELL_W = (DW - PAD_L - PAD_R) / 5  // 5 gaps for 6 strings
const CELL_H = (DH - PAD_T - PAD_B) / FRET_ROWS

const SCOLORS = ['#dc2626','#ea580c','#d97706','#059669','#7c3aed','#0284c7']
// low E → high e, mapped to columns 0→5

function ChordButton({ chord, isHovered, isFlashed, onHover, onClick }: {
  chord: ChordShape; isHovered: boolean; isFlashed: boolean
  onHover: (n: string | null) => void; onClick: () => void
}) {
  const frets = chord.notes.filter(Boolean).map(n => n!.fret).filter(f => f > 0)
  const minFret = frets.length ? Math.min(...frets) : 0
  const maxFret = frets.length ? Math.max(...frets) : 0
  const offset  = maxFret > FRET_ROWS && minFret > 1 ? minFret - 1 : 0

  return (
    <button
      onMouseEnter={() => onHover(chord.name)}
      onMouseLeave={() => onHover(null)}
      onClick={onClick}
      title={`Insert ${chord.name}`}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '5px 4px 4px', borderRadius: 8, border: `1px solid ${isFlashed ? '#7c3aed' : isHovered ? '#c4b5fd' : '#e2e8f0'}`, background: isFlashed ? '#ede9fe' : isHovered ? '#faf5ff' : '#ffffff', cursor: 'pointer', transition: 'all 0.1s', boxShadow: isHovered ? '0 2px 8px rgba(124,58,237,0.12)' : 'none' }}
    >
      <ChordDiagram chord={chord} offset={offset} />
      <span style={{ fontSize: 10, fontWeight: 700, color: isFlashed ? '#7c3aed' : '#374151', fontFamily: "'Inter', ui-sans-serif, sans-serif", lineHeight: 1 }}>
        {chord.name}
      </span>
    </button>
  )
}

function ChordDiagram({ chord, offset }: { chord: ChordShape; offset: number }) {
  const nutVisible = offset === 0

  return (
    <svg width={DW} height={DH} viewBox={`0 0 ${DW} ${DH}`}>
      {/* Nut or position indicator */}
      {nutVisible
        ? <line x1={PAD_L} y1={PAD_T} x2={DW - PAD_R} y2={PAD_T} stroke="#1e293b" strokeWidth={2} strokeLinecap="round" />
        : <text x={PAD_L - 2} y={PAD_T + CELL_H * 0.8} fontSize={5.5} fill="#94a3b8" textAnchor="end" fontFamily="ui-monospace, monospace">{offset + 1}</text>
      }

      {/* Fret lines */}
      {Array.from({ length: FRET_ROWS + 1 }, (_, f) => {
        if (f === 0 && nutVisible) return null
        return <line key={f} x1={PAD_L} y1={PAD_T + f * CELL_H} x2={DW - PAD_R} y2={PAD_T + f * CELL_H} stroke="#d1d5db" strokeWidth={0.7} />
      })}

      {/* String lines — low E (col 0) to high e (col 5) */}
      {Array.from({ length: 6 }, (_, col) => {
        const x = PAD_L + col * CELL_W
        const thick = col >= 4 ? 0.7 : col >= 2 ? 1.0 : col === 1 ? 1.3 : 1.6
        return <line key={col} x1={x} y1={PAD_T} x2={x} y2={PAD_T + FRET_ROWS * CELL_H}
          stroke="#94a3b8" strokeWidth={thick} opacity={0.6} />
      })}

      {/* Notes */}
      {chord.notes.map((note) => {
        if (!note) return null
        const displayFret = note.fret - offset
        if (displayFret === 0) {
          // Open string — small circle above nut
          const col = note.stringIndex  // 0=e (right), 5=E (left) → invert: col = 5-stringIndex
          const x = PAD_L + (5 - note.stringIndex) * CELL_W
          return <circle key={`o${note.stringIndex}`} cx={x} cy={PAD_T - 4} r={2}
            fill="none" stroke={SCOLORS[5 - note.stringIndex]} strokeWidth={0.9} />
        }
        if (displayFret < 1 || displayFret > FRET_ROWS) return null
        const col = 5 - note.stringIndex  // low E→col0, high e→col5
        const x = PAD_L + col * CELL_W
        const y = PAD_T + (displayFret - 0.5) * CELL_H
        return <circle key={note.stringIndex} cx={x} cy={y} r={CELL_H * 0.4}
          fill={SCOLORS[col]} />
      })}

      {/* Muted strings — x above nut */}
      {chord.notes.map((note, idx) => {
        if (note !== null) return null
        // Estimate which strings are muted from nulls in order
        // chord.notes order: notes appear by stringIndex, nulls represent muted
        // We don't have the stringIndex for null slots, so skip rendering x markers
        return null
      })}
    </svg>
  )
}
