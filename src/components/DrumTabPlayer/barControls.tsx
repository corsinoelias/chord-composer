import React from 'react'
import { BT, alpha, f } from '../../lib/bassTab/theme'

/**
 * The buttons the two bars share.
 *
 * The player has a light bar on top (paper, sits against the score) and a dark
 * one at the bottom (chassis, sits against the transport), so every control
 * here takes a `tone`. The alternative — two near-identical copies, one per bar
 * — is how the colours drift apart.
 */

export type Tone = 'light' | 'dark'

interface Palette { ink: string; rule: string; sunken: string; dim: string }

function palette(tone: Tone): Palette {
  return tone === 'dark'
    ? { ink: BT.panelInk, rule: BT.panelRule, sunken: BT.panel2, dim: '#9d978c' }
    : { ink: BT.ink, rule: BT.rule, sunken: BT.sunken, dim: BT.dim }
}

export function BarLabel({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span style={{
      fontFamily: f('ui'), fontSize: 11, fontWeight: 600,
      color: palette(tone).dim, textTransform: 'uppercase', letterSpacing: '.06em',
    }}>
      {children}
    </span>
  )
}

export function IconButton({
  onClick, disabled, active, title, tone = 'dark', children,
}: {
  onClick: () => void
  disabled?: boolean
  active?: boolean
  title: string
  tone?: Tone
  children: React.ReactNode
}) {
  const p = palette(tone)
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={active}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 34, height: 34, borderRadius: 8,
        border: '1px solid ' + (active ? BT.accent : p.rule),
        background: active ? alpha('accent', tone === 'dark' ? 0.32 : 0.14) : 'transparent',
        color: disabled ? p.dim : active && tone === 'dark' ? '#fff' : p.ink,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {children}
    </button>
  )
}

export function Segmented<T extends string>({
  options, value, onChange, ariaLabel, tone = 'dark',
}: {
  options: { id: T; label: string }[]
  value: T
  onChange: (v: T) => void
  ariaLabel: string
  tone?: Tone
}) {
  const p = palette(tone)
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      style={{
        display: 'inline-flex', padding: 2, gap: 2, borderRadius: 9,
        background: p.sunken, border: '1px solid ' + p.rule,
      }}
    >
      {options.map(opt => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          aria-pressed={value === opt.id}
          style={{
            padding: '5px 12px', borderRadius: 7, border: 'none', cursor: 'pointer',
            background: value === opt.id ? BT.accent : 'transparent',
            color: value === opt.id ? '#fff' : p.ink,
            fontFamily: f('ui'), fontSize: 12, fontWeight: 600,
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

export function TextButton({
  onClick, title, tone = 'light', active, children,
}: {
  onClick: () => void
  title: string
  tone?: Tone
  active?: boolean
  children: React.ReactNode
}) {
  const p = palette(tone)
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        padding: '7px 12px', borderRadius: 9, cursor: 'pointer',
        border: '1px solid ' + (active ? BT.accent : p.rule),
        background: active ? alpha('accent', tone === 'dark' ? 0.3 : 0.1) : 'transparent',
        color: active ? (tone === 'dark' ? '#fff' : BT.accent) : p.ink,
        fontFamily: f('ui'), fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  )
}
