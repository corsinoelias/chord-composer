import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { X, Search } from 'lucide-react'
import { DRUM_PRESETS, type DrumPreset } from '../../data/drumPresets'
import type { DrumTrack } from '../../lib/drumTab/types'
import {
  deleteUserTab, duplicateUserTab, listUserTabs, renameUserTab, saveUserTab,
  type UserTab,
} from '../../lib/drumTab/userTabs'
import { DrumPatternThumb } from './DrumPatternThumb'
import { analytics } from '../../lib/analytics'
import { BT, alpha, f } from '../../lib/bassTab/theme'

/**
 * Rhythm library.
 *
 * Two sections that hold different kinds of thing. "My tabs" is the user's own
 * work, saved in this browser (`src/lib/drumTab/userTabs.ts`). "Included
 * rhythms" is derived at open time from what ChordSequence already owns — the
 * chord player's `MUSICAL_STYLES` and the drum machine's step presets (see
 * `src/data/drumPresets.ts`). Nothing there is a second copy of a groove, so a
 * rhythm edited in the chord editor shows up changed here too.
 *
 * Search filters the included rhythms only. Your own tabs are few and you named
 * them yourself, so hiding them behind a query would cost more than it saves.
 */

interface Props {
  open: boolean
  currentId: string
  /** What is in the editor right now — saved by "Save current tab". */
  currentTrack: DrumTrack
  onClose: () => void
  onLoad: (preset: DrumPreset) => void
  onLoadUserTab: (tab: UserTab) => void
}

export function DrumTabLibrary({
  open, currentId, currentTrack, onClose, onLoad, onLoadUserTab,
}: Props) {
  const [query, setQuery] = useState('')
  const [tabs, setTabs] = useState<UserTab[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const renameRef = useRef<HTMLInputElement>(null)

  // Read from storage on open rather than on mount: another tab of the site may
  // have saved something since, and this is the moment the list is looked at.
  useEffect(() => {
    if (!open) return
    setTabs(listUserTabs())
    setEditingId(null)
    setConfirmId(null)
    inputRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => { if (editingId) renameRef.current?.select() }, [editingId])

  /**
   * Every preset's track, built once. `DrumPreset.build` walks the style arrays
   * on each call, and a thumbnail needs one per preset — rebuilding them on
   * each keystroke of the search box would do that work 32 times for nothing.
   */
  const presetTracks = useMemo(
    () => new Map(DRUM_PRESETS.map(p => [p.id, p.build()])),
    [],
  )

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

  const handleSaveCurrent = useCallback(() => {
    setTabs(saveUserTab(currentTrack, currentTrack.name || 'My rhythm'))
    setConfirmId(null)
    analytics.drumTabUserTabSaved()
  }, [currentTrack])

  const commitRename = useCallback(() => {
    if (!editingId) return
    setTabs(renameUserTab(editingId, draftName))
    setEditingId(null)
  }, [editingId, draftName])

  if (!open) return null

  const pill: React.CSSProperties = {
    borderRadius: 999, padding: '6px 12px', cursor: 'pointer', minHeight: 32,
    border: '1px solid ' + BT.rule, background: BT.card, color: BT.muted,
    fontFamily: f('ui'), fontSize: 12, fontWeight: 600,
  }

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
              flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
              color: BT.ink, fontFamily: f('ui'), fontSize: 14,
            }}
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 30, height: 30, borderRadius: 8, cursor: 'pointer', flex: 'none',
              border: '1px solid ' + BT.rule, background: BT.card, color: BT.muted,
            }}
          >
            <X size={15} />
          </button>
        </div>

        <div style={{ overflowY: 'auto', padding: 14 }}>

          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 9,
          }}>
            <h3 style={{
              margin: 0, fontFamily: f('ui'), fontSize: 11, fontWeight: 700,
              color: BT.dim, textTransform: 'uppercase', letterSpacing: '.07em',
            }}>
              My tabs
            </h3>
            <p style={{ margin: 0, fontFamily: f('ui'), fontSize: 11.5, color: BT.soft }}>
              Kept in this browser.
            </p>
            <button
              type="button"
              onClick={handleSaveCurrent}
              style={{
                marginLeft: 'auto', border: 'none', borderRadius: 999, cursor: 'pointer',
                background: BT.accent, color: '#fff', padding: '8px 14px', minHeight: 34,
                fontFamily: f('ui'), fontSize: 12, fontWeight: 600,
              }}
            >
              + Save current tab
            </button>
          </div>

          {tabs.length === 0 && (
            <p style={{
              margin: 0, padding: '12px 14px', borderRadius: 11,
              border: '1px dashed ' + BT.rule, color: BT.soft,
              fontFamily: f('ui'), fontSize: 12, lineHeight: 1.5,
            }}>
              Nothing saved yet. Build a groove and press “Save current tab”.
            </p>
          )}

          {tabs.map(tab => {
            const editing = tab.id === editingId
            const armed = tab.id === confirmId
            return (
              <div
                key={tab.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                  border: '1px solid ' + BT.rule, borderRadius: 11, padding: '11px 12px',
                  marginBottom: 8, background: BT.card,
                }}
              >
                <DrumPatternThumb track={tab.track} />

                <div style={{
                  display: 'flex', flexDirection: 'column', gap: 2, minWidth: 110, flex: 1,
                }}>
                  <span style={{
                    fontFamily: f('ui'), fontSize: 13.5, fontWeight: 600, color: BT.ink,
                  }}>
                    {tab.name}
                  </span>
                  <span style={{
                    fontFamily: f('mono'), fontSize: 11, color: BT.soft,
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {tab.track.bpm} BPM · {tab.track.totalBars} bars
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => { onLoadUserTab(tab); onClose() }}
                    style={{
                      ...pill,
                      borderColor: BT.accent, background: BT.accentWash, color: BT.accent,
                    }}
                  >
                    ▶ Play
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(editing ? null : tab.id)
                      setDraftName(tab.name)
                      setConfirmId(null)
                    }}
                    style={pill}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={() => { setTabs(duplicateUserTab(tab.id)); setConfirmId(null) }}
                    style={pill}
                  >
                    Duplicate
                  </button>
                  {/*
                    Two taps on the same button, no dialog. The prototype deleted
                    on the first click with no undo, and these are patterns the
                    user typed in by hand.
                  */}
                  <button
                    type="button"
                    onClick={() => {
                      if (armed) { setTabs(deleteUserTab(tab.id)); setConfirmId(null) }
                      else setConfirmId(tab.id)
                    }}
                    onBlur={() => { if (armed) setConfirmId(null) }}
                    style={armed
                      ? { ...pill, border: '1px solid ' + BT.danger, background: BT.danger, color: '#fff' }
                      : { ...pill, border: '1px solid ' + alpha('danger', 0.35), background: BT.dangerWash, color: BT.danger }}
                  >
                    {armed ? 'Really delete?' : 'Delete'}
                  </button>
                </div>

                {editing && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', width: '100%',
                    paddingTop: 10, borderTop: '1px solid ' + BT.rule,
                  }}>
                    <input
                      ref={renameRef}
                      value={draftName}
                      onChange={e => setDraftName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') commitRename()
                        if (e.key === 'Escape') { e.stopPropagation(); setEditingId(null) }
                      }}
                      aria-label={`New name for ${tab.name}`}
                      style={{
                        flex: 1, minWidth: 130, borderRadius: 8, padding: '7px 9px', minHeight: 34,
                        border: '1px solid ' + BT.accent, background: BT.card, color: BT.ink,
                        fontFamily: f('ui'), fontSize: 13, outline: 'none',
                      }}
                    />
                    <button
                      type="button"
                      onClick={commitRename}
                      style={{ ...pill, borderColor: BT.accent, background: BT.accentWash, color: BT.accent }}
                    >
                      Save
                    </button>
                    <button type="button" onClick={() => setEditingId(null)} style={pill}>
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            )
          })}

          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            marginTop: 22, marginBottom: 9,
          }}>
            <h3 style={{
              margin: 0, fontFamily: f('ui'), fontSize: 11, fontWeight: 700,
              color: BT.dim, textTransform: 'uppercase', letterSpacing: '.07em',
            }}>
              Included rhythms
            </h3>
            <p style={{ margin: 0, fontFamily: f('ui'), fontSize: 11.5, color: BT.soft }}>
              From the chord editor and the drum machine.
            </p>
          </div>

          {groups.length === 0 && (
            <p style={{ margin: 0, color: BT.muted, fontFamily: f('ui'), fontSize: 13 }}>
              No rhythm matches “{query}”.
            </p>
          )}

          {groups.map(([category, presets]) => (
            <section key={category} style={{ marginBottom: 18 }}>
              <h4 style={{
                margin: '0 0 8px', fontFamily: f('ui'), fontSize: 11, fontWeight: 700,
                color: BT.dim, textTransform: 'uppercase', letterSpacing: '.07em',
              }}>
                {category}
              </h4>
              <div style={{
                display: 'grid', gap: 8,
                gridTemplateColumns: 'repeat(auto-fill, minmax(212px, 1fr))',
              }}>
                {presets.map(preset => {
                  const active = preset.id === currentId
                  const track = presetTracks.get(preset.id)
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => { onLoad(preset); onClose() }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                        padding: '8px 9px', borderRadius: 9, cursor: 'pointer',
                        border: '1px solid ' + (active ? BT.accent : BT.rule),
                        background: active ? BT.accentWash : BT.card,
                      }}
                    >
                      {track && <DrumPatternThumb track={track} background={BT.paper} />}
                      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                        <span style={{
                          fontFamily: f('ui'), fontSize: 13, fontWeight: 600, color: BT.ink,
                        }}>
                          {preset.name}
                        </span>
                        <span style={{
                          fontFamily: f('mono'), fontSize: 10.5, color: BT.soft,
                          fontVariantNumeric: 'tabular-nums',
                        }}>
                          {preset.bpm} BPM
                          {preset.source === 'style' ? ' · chord player' : ' · step preset'}
                        </span>
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
