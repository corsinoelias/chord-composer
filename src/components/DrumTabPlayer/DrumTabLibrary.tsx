import React, { useEffect, useMemo, useRef, useState } from 'react'
import { X, Search } from 'lucide-react'
import { DRUM_PRESETS, type DrumPreset } from '../../data/drumPresets'
import { BT, alpha, f } from '../../lib/bassTab/theme'

/**
 * Rhythm library.
 *
 * Every entry is derived at open time from what ChordSequence already owns —
 * the chord player's `MUSICAL_STYLES` and the drum machine's step presets (see
 * `src/data/drumPresets.ts`). Nothing here is a second copy of a groove, so a
 * rhythm edited in the chord editor shows up changed here too.
 */

interface Props {
  open: boolean
  currentId: string
  onClose: () => void
  onLoad: (preset: DrumPreset) => void
}

export function DrumTabLibrary({ open, currentId, onClose, onLoad }: Props) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matched = q
      ? DRUM_PRESETS.filter(p => (p.name + ' ' + p.category).toLowerCase().includes(q))
      : DRUM_PRESETS
    const byCategory = new Map<string, DrumPreset[]>()
    for (const p of matched) {
      const list = byCategory.get(p.category) ?? []
      list.push(p)
      byCategory.set(p.category, list)
    }
    return [...byCategory.entries()]
  }, [query])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Rhythm library"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        background: 'rgba(20, 18, 15, 0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(680px, 100%)', maxHeight: '82vh', display: 'flex', flexDirection: 'column',
          background: BT.card, border: '1px solid ' + BT.rule, borderRadius: 14,
          boxShadow: BT.shadowLg, overflow: 'hidden',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
          borderBottom: '1px solid ' + BT.rule,
        }}>
          <Search size={16} style={{ color: BT.dim }} aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search rhythms — rock, reggaeton, trap…"
            aria-label="Search rhythms"
            style={{
              flex: 1, border: 'none', outline: 'none', background: 'transparent',
              color: BT.ink, fontFamily: f('ui'), fontSize: 14,
            }}
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 30, height: 30, borderRadius: 8, cursor: 'pointer',
              border: '1px solid ' + BT.rule, background: BT.card, color: BT.muted,
            }}
          >
            <X size={15} />
          </button>
        </div>

        <div style={{ overflowY: 'auto', padding: 14 }}>
          {groups.length === 0 && (
            <p style={{ margin: 0, color: BT.muted, fontFamily: f('ui'), fontSize: 13 }}>
              No rhythm matches “{query}”.
            </p>
          )}
          {groups.map(([category, presets]) => (
            <section key={category} style={{ marginBottom: 18 }}>
              <h3 style={{
                margin: '0 0 8px', fontFamily: f('ui'), fontSize: 11, fontWeight: 700,
                color: BT.dim, textTransform: 'uppercase', letterSpacing: '.07em',
              }}>
                {category}
              </h3>
              <div style={{
                display: 'grid', gap: 8,
                gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              }}>
                {presets.map(preset => {
                  const active = preset.id === currentId
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => { onLoad(preset); onClose() }}
                      style={{
                        textAlign: 'left', padding: '9px 11px', borderRadius: 9, cursor: 'pointer',
                        border: '1px solid ' + (active ? BT.accent : BT.rule),
                        background: active ? BT.accentWash : BT.card,
                      }}
                    >
                      <span style={{
                        display: 'block', fontFamily: f('ui'), fontSize: 13, fontWeight: 600,
                        color: BT.ink,
                      }}>
                        {preset.name}
                      </span>
                      <span style={{
                        display: 'block', marginTop: 2, fontFamily: f('mono'), fontSize: 11,
                        color: BT.soft, fontVariantNumeric: 'tabular-nums',
                      }}>
                        {preset.bpm} BPM
                        {preset.source === 'style' ? ' · chord player' : ' · step preset'}
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>
          ))}
        </div>

        <p style={{
          margin: 0, padding: '10px 14px', borderTop: '1px solid ' + BT.rule,
          background: alpha('rule', 0.35), color: BT.soft,
          fontFamily: f('ui'), fontSize: 11.5,
        }}>
          Loading a rhythm replaces what is in the editor. Your own pattern is kept in this
          browser until you load another one.
        </p>
      </div>
    </div>
  )
}
