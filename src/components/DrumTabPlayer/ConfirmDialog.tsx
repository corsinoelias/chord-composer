import React, { useEffect, useRef } from 'react'
import { BT, f } from '../../lib/bassTab/theme'

/**
 * A yes/no in front of something you cannot take back by accident.
 *
 * Built as a plain fixed overlay rather than with `ui/alert-dialog.tsx`, the
 * same way `DrumTabLibrary` and `DrumTabMobileSheet` are: this tree does not
 * pull a dialog library in for one panel, and those two set the pattern.
 */

interface Props {
  open: boolean
  title: string
  body?: string
  confirmLabel: string
  cancelLabel?: string
  /** Red confirm button, for anything that destroys work. */
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open, title, body, confirmLabel, cancelLabel = 'Cancel',
  destructive, onConfirm, onCancel,
}: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    // Focus the confirm button so the keyboard can answer without reaching for
    // the mouse — and Escape always answers "no".
    confirmRef.current?.focus()
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 80,
        background: 'rgba(20, 18, 15, 0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 380, background: BT.card,
          border: '1px solid ' + BT.rule, borderRadius: 14,
          boxShadow: BT.shadowLg, padding: 18,
          display: 'flex', flexDirection: 'column', gap: 10,
        }}
      >
        <h2 style={{
          margin: 0, fontFamily: f('ui'), fontSize: 15, fontWeight: 700, color: BT.ink,
        }}>
          {title}
        </h2>
        {body && (
          <p style={{ margin: 0, fontFamily: f('ui'), fontSize: 13, color: BT.muted, lineHeight: 1.5 }}>
            {body}
          </p>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '7px 14px', borderRadius: 8, cursor: 'pointer',
              border: '1px solid ' + BT.rule, background: BT.card, color: BT.ink,
              fontFamily: f('ui'), fontSize: 13, fontWeight: 600,
            }}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            style={{
              padding: '7px 14px', borderRadius: 8, cursor: 'pointer',
              border: '1px solid ' + (destructive ? BT.danger : BT.accent),
              background: destructive ? BT.danger : BT.accent,
              color: '#fff', fontFamily: f('ui'), fontSize: 13, fontWeight: 700,
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
