import type React from 'react'

/**
 * The guitar tab editor's palette: design 1b ("Enfoque" — inspector on the right,
 * transport at the bottom) in its light version. One purple accent; everything else
 * is slate so the tab stays the loudest thing on the screen.
 */
export const T = {
  bg:          '#ffffff',
  panel:       '#f8fafc',
  well:        '#f1f5f9',
  border:      '#e2e8f0',
  borderStrong:'#cbd5e1',
  text:        '#0f172a',
  text2:       '#334155',
  muted:       '#64748b',
  faint:       '#94a3b8',
  accent:      'hsl(262 83% 58%)',
  accentText:  'hsl(262 70% 48%)',
  accentSoft:  'hsl(262 83% 58% / 0.10)',
  accentRing:  'hsl(262 83% 58% / 0.30)',
  danger:      '#dc2626',
  mono:        "ui-monospace, 'SF Mono', Consolas, monospace",
  sans:        "'Inter', ui-sans-serif, system-ui, sans-serif",
}

export const STRING_COLORS = ['#0284c7', '#7c3aed', '#059669', '#d97706', '#ea580c', '#dc2626']
export const STRING_NAMES  = ['e', 'B', 'G', 'D', 'A', 'E']

/** The small caps section label ("NOTE", "TRACK", "CHORDS"…). */
export const sectionLabel: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.muted,
}

/** A square, borderless icon button; `active` tints it with the accent. */
export function iconBtn(active = false, disabled = false, size = 32): React.CSSProperties {
  return {
    width: size, height: size, borderRadius: 8, border: 'none', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: active ? T.accentSoft : 'transparent',
    color: active ? T.accentText : disabled ? T.borderStrong : T.muted,
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'background 0.1s, color 0.1s',
  }
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
