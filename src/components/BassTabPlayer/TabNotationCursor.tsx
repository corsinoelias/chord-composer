import React from 'react'
import { ABOVE_H, STAFF_H, CURSOR_HEAD } from '../../lib/bassTab/tabNotation'

interface Props {
  x: number       // center x of cursor in SVG user coordinates
  isPlaying: boolean
}

const BODY_V  = CURSOR_HEAD + STAFF_H - 6.6   // v value: main rect height minus rounded top

const BODY_PATH = [
  'M 0,6.6',
  'Q 0,0 6,0 q 6,0 6,6.6',
  `v ${BODY_V.toFixed(2)}`,
  'c0,1.82,-0.49,3.59,-1.42,5.15',
  'l-2.86,4.76',
  'c-0.78,1.3,-2.65,1.3,-3.43,0',
  'l-2.86,-4.76',
  'c-0.93,-1.56,-1.43,-3.33,-1.43,-5.15',
  `v -${BODY_V.toFixed(2)}`,
].join(' ')

const DIAMOND = 'M 0 2.97 C 0 0.27 3 0 3.98 0 C 4.97 0 8 0.27 8 2.97 C 8 5.97 5.12 9.67 4 9.67 C 2.88 9.67 0 5.97 0 2.97 Z'

export function TabNotationCursor({ x, isPlaying }: Props) {
  const gx = x - 6
  const gy = ABOVE_H - CURSOR_HEAD

  return (
    <g
      transform={`translate(${gx.toFixed(1)}, ${gy})`}
      style={{ pointerEvents: 'none' }}
    >
      <defs>
        <filter id="CursorShadow" x="-40%" width="180%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2" />
          <feOffset dx="0" dy="2" />
        </filter>
      </defs>
      {/* shadow */}
      <path filter="url(#CursorShadow)" d={BODY_PATH} fill="rgba(0,0,0,0.35)" />
      {/* body */}
      <path d={BODY_PATH} fill="var(--bt-accent)" />
      {/* diamond icon at top */}
      <path d={DIAMOND} fill="white" opacity={0.92} />
    </g>
  )
}
