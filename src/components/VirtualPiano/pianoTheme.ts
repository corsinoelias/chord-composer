// Shared color tokens + small style helpers for the Virtual Piano's dark
// "stage" chrome (toolbar, player bar, panels, drawer). The page's own light
// theme (site Navbar/Footer, and the light "About" section below the fold)
// is untouched — this palette is scoped to the stage only.

export const INK = '#141020'
export const INK_2 = '#1d1830'
export const INK_3 = '#251f3d'
export const VIOLET = '#7c5cff'
export const VIOLET_2 = '#a596ff'
export const TEAL = '#5fe3c9'
export const DANGER = '#ff5d7a'
export const TEXT_HI = '#f4f1fb'
export const TEXT_MED = '#d9d2f0'
export const TEXT_DIM = '#a99fce'

export const FONT_DISPLAY = "'Fraunces', 'Iowan Old Style', Georgia, serif"

import type React from 'react'

export function pillBtn(active: boolean): React.CSSProperties {
  return {
    fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 6,
    background: active ? VIOLET : 'rgba(255,255,255,.08)',
    color: active ? '#fff' : TEXT_MED,
    border: '1px solid ' + (active ? VIOLET : 'rgba(255,255,255,.16)'),
    borderRadius: 10, padding: '8px 13px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
    whiteSpace: 'nowrap',
  }
}

export function ghostBtn(): React.CSSProperties {
  return {
    fontFamily: 'inherit', background: 'rgba(255,255,255,.08)', color: TEXT_MED,
    border: '1px solid rgba(255,255,255,.16)', borderRadius: 10, padding: '8px 13px',
    fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
  }
}

export function iconBtn(): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.16)', color: TEXT_HI,
    width: 38, height: 38, borderRadius: 10, cursor: 'pointer',
  }
}
