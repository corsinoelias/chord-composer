import React, { useState } from 'react'
import { v } from '../../lib/bassTab/theme'

// Shared zoom-cluster button — used in the desktop view-bar and, with `mobile`,
// in BassTabGrid's mobile toolbar (which has no separate view-bar to live in).
export function ZoomBtn({ children, title, onClick, disabled, active, wide, mobile }: {
  children: React.ReactNode
  title: string
  onClick: () => void
  disabled?: boolean
  active?: boolean
  wide?: boolean
  mobile?: boolean
}) {
  const [hov, setHov] = useState(false)
  const size = mobile ? 36 : 28
  return (
    <button
      onClick={onClick} disabled={disabled} title={title} aria-pressed={active}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        width: wide ? undefined : size, height: size,
        padding: wide ? (mobile ? '0 12px' : '0 9px') : 0,
        border: 'none',
        borderLeft: wide ? `1px solid ${v('rule')}` : 'none',
        background: active ? v('accentWash') : hov && !disabled ? v('sunken') : 'transparent',
        color: active ? v('accent') : hov && !disabled ? v('ink') : v('muted'),
        fontSize: wide ? (mobile ? 12 : 11) : (mobile ? 15 : 13),
        fontWeight: wide ? 600 : 400,
        fontVariantNumeric: 'tabular-nums',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        fontFamily: 'var(--bt-ui)',
        transition: 'background .12s, color .12s',
        WebkitTapHighlightColor: 'transparent',
        touchAction: 'manipulation',
      }}
    >
      {children}
    </button>
  )
}
