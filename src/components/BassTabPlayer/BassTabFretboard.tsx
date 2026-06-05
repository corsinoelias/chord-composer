import React from 'react'
import { STRINGS } from '../../lib/bassTab/bassTheory'

interface FretboardProps {
  activeFrets: (number | null)[]  // index = string index, value = fret being played or null
}

const SVG_W = 800
const SVG_H = 96
const LEFT_PAD = 52   // space for string labels
const RIGHT_PAD = 16
const NUT_W = 6
const FRET_COUNT = 12  // show frets 0–12
const STRING_TOP = 16
const STRING_BOT = SVG_H - 22
const STRING_SPACING = (STRING_BOT - STRING_TOP) / 3
const DOT_FRETS = [3, 5, 7, 9]

// Fret wire positions: nut at LEFT_PAD, wires at LEFT_PAD + n*slotW (n=1..12)
const boardW = SVG_W - LEFT_PAD - RIGHT_PAD
const slotW = boardW / FRET_COUNT

// Circle center for fret N: in the space before fret wire N
// Fret 0 (open): just before the nut, at x = LEFT_PAD - 10
// Fret N (1-12): x = LEFT_PAD + NUT_W + (N - 0.5) * slotW
function fretCenterX(fret: number): number {
  if (fret === 0) return LEFT_PAD - 10
  return LEFT_PAD + NUT_W + (fret - 0.5) * slotW
}

// String thicknesses (G=thinnest, E=thickest)
const STRING_STROKE = [1.2, 1.8, 2.4, 3.0]

export function BassTabFretboard({ activeFrets }: FretboardProps) {
  return (
    <div
      className="border-b border-gray-700 flex-shrink-0"
      style={{ background: '#0d0d0d' }}
    >
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: '100%', height: SVG_H, display: 'block' }}
      >
        {/* Fretboard body */}
        <rect
          x={LEFT_PAD} y={STRING_TOP - 6}
          width={boardW} height={STRING_BOT - STRING_TOP + 14}
          fill="#1a0f00" rx={2}
        />

        {/* Fret wires */}
        {Array.from({ length: FRET_COUNT }, (_, i) => {
          const x = LEFT_PAD + NUT_W + (i + 1) * slotW
          return (
            <line key={i}
              x1={x} y1={STRING_TOP - 5} x2={x} y2={STRING_BOT + 5}
              stroke="#5a4a38" strokeWidth={1.5}
            />
          )
        })}

        {/* Nut */}
        <rect
          x={LEFT_PAD} y={STRING_TOP - 6}
          width={NUT_W} height={STRING_BOT - STRING_TOP + 14}
          fill="#d4b896" rx={1}
        />

        {/* Position dots */}
        {DOT_FRETS.map(f => (
          <circle
            key={f}
            cx={LEFT_PAD + NUT_W + (f - 0.5) * slotW}
            cy={STRING_TOP + STRING_SPACING * 1.5}
            r={4.5} fill="#3a2810"
          />
        ))}
        {/* Double dot at 12 */}
        <circle cx={LEFT_PAD + NUT_W + 11.5 * slotW} cy={STRING_TOP + STRING_SPACING * 0.85} r={4.5} fill="#3a2810" />
        <circle cx={LEFT_PAD + NUT_W + 11.5 * slotW} cy={STRING_TOP + STRING_SPACING * 2.15} r={4.5} fill="#3a2810" />

        {/* Fret number labels */}
        {[3, 5, 7, 9, 12].map(f => (
          <text
            key={f}
            x={LEFT_PAD + NUT_W + (f - 0.5) * slotW}
            y={SVG_H - 5}
            textAnchor="middle"
            fill="#4b5563"
            fontSize={9}
            fontFamily="monospace"
          >{f}</text>
        ))}

        {/* Strings */}
        {STRINGS.map((s, i) => {
          const y = STRING_TOP + i * STRING_SPACING
          return (
            <line key={i}
              x1={0} y1={y} x2={SVG_W - RIGHT_PAD} y2={y}
              stroke="#b8946a" strokeWidth={STRING_STROKE[i]}
              strokeLinecap="round"
            />
          )
        })}

        {/* String name labels */}
        {STRINGS.map((s, i) => {
          const y = STRING_TOP + i * STRING_SPACING
          return (
            <text
              key={i}
              x={LEFT_PAD - 8} y={y + 4}
              textAnchor="end"
              fill={s.color}
              fontSize={11}
              fontFamily="monospace"
              fontWeight="bold"
            >
              {s.displayName}
            </text>
          )
        })}

        {/* Active fret indicators */}
        {STRINGS.map((s, i) => {
          const fret = activeFrets[i]
          if (fret === null || fret === undefined) return null
          const clampedFret = Math.min(fret, FRET_COUNT)
          const cx = fretCenterX(clampedFret)
          const cy = STRING_TOP + i * STRING_SPACING
          const isOpen = fret === 0

          return (
            <g key={i}>
              {/* Glow */}
              <circle cx={cx} cy={cy} r={13} fill={s.color} opacity={0.2} />
              {/* Main circle */}
              <circle
                cx={cx} cy={cy} r={9}
                fill={isOpen ? 'none' : s.darkColor}
                stroke={s.color}
                strokeWidth={2}
              />
              {/* Fret number */}
              <text
                x={cx} y={cy + 4}
                textAnchor="middle"
                fill="white"
                fontSize={9}
                fontWeight="bold"
                fontFamily="monospace"
              >
                {fret > FRET_COUNT ? `${fret}` : fret}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
