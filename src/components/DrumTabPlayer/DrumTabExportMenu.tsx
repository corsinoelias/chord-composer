import React, { useEffect, useRef, useState } from 'react'
import { Download, FileAudio, FileMusic, Layers } from 'lucide-react'
import { BT, f } from '../../lib/bassTab/theme'
import { IconButton, TextButton } from './barControls'

/**
 * One place to take the pattern out of the app.
 *
 * A menu rather than three more buttons: the top bar already wraps onto a
 * second row at laptop width, and export is something you do once at the end,
 * not while writing. The callbacks are the player's, kept stable there, so this
 * opening and closing never re-renders the bar around it.
 */

interface Props {
  onMidi: () => void
  onMidiSplit: () => void
  onWav: () => void
  /** True while the WAV is rendering — a few hundred ms, but not zero. */
  busy?: boolean
  /** Phone: rendered as plain rows inside the sheet instead of a popover. */
  inline?: boolean
}

const ITEM: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 9, width: '100%',
  padding: '9px 12px', border: 'none', background: 'transparent',
  color: BT.ink, fontFamily: f('ui'), fontSize: 13, fontWeight: 600,
  cursor: 'pointer', textAlign: 'left',
}

export function DrumTabExportMenu({ onMidi, onMidiSplit, onWav, busy, inline }: Props) {
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  const items = (
    <>
      <button type="button" style={ITEM} onClick={() => { setOpen(false); onMidi() }}>
        <FileMusic size={15} /> MIDI file
      </button>
      <button type="button" style={ITEM} onClick={() => { setOpen(false); onMidiSplit() }}>
        <Layers size={15} /> MIDI — one track per piece
      </button>
      <button type="button" style={ITEM} onClick={() => { setOpen(false); onWav() }} disabled={busy}>
        <FileAudio size={15} /> {busy ? 'Rendering WAV…' : 'WAV audio'}
      </button>
    </>
  )

  if (inline) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid ' + BT.rule, borderRadius: 9, overflow: 'hidden' }}>
        {items}
      </div>
    )
  }

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <TextButton
        tone="light"
        active={open}
        onClick={() => setOpen(o => !o)}
        title="Export this pattern"
      >
        <Download size={15} /> {busy ? 'Exporting…' : 'Export'}
      </TextButton>
      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 40,
            minWidth: 226, padding: '4px 0',
            background: BT.card, border: '1px solid ' + BT.rule, borderRadius: 10,
            boxShadow: BT.shadowLg,
          }}
        >
          {items}
        </div>
      )}
    </div>
  )
}

/** The icon-only trigger, for bars with no room for a word. */
export function DrumTabExportIcon({ onClick, busy }: { onClick: () => void; busy?: boolean }) {
  return (
    <IconButton tone="light" onClick={onClick} title="Export">
      <Download size={16} style={{ opacity: busy ? 0.5 : 1 }} />
    </IconButton>
  )
}
