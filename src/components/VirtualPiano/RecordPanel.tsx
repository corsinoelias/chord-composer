import React, { useState } from 'react'
import { TEXT_DIM, TEXT_HI, TEXT_MED, VIOLET, ghostBtn, pillBtn } from './pianoTheme'

interface Props {
  open: boolean
  onClose: () => void
  duration: string
  onPlay: () => void
  onDownloadWav: () => void
  onDownloadMidi: () => void
  onSave: (name: string) => void
  onNewRecording: () => void
  saved: boolean
}

// Replaces the old hover-triggered dropdown on the Record button — a menu
// that only opens on :hover never worked on touch devices in the first
// place, so this is a fix as much as a redesign.
export function RecordPanel(props: Props) {
  const { open, onClose } = props
  const [name, setName] = useState('My recording')
  if (!open) return null

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(10,8,16,.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(380px, 100%)', background: '#1d1830', border: '1px solid rgba(255,255,255,.1)', borderRadius: 18, boxShadow: '0 20px 60px rgba(20,16,32,.35)', padding: 20, color: TEXT_HI }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <h3 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 18, margin: 0, fontWeight: 600 }}>Recording ready</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: TEXT_MED, cursor: 'pointer', fontSize: 16, padding: 4 }}>✕</button>
        </div>
        <p style={{ fontSize: 12.5, color: TEXT_DIM, margin: '2px 0 16px' }}>{props.duration} recorded.</p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Song name"
            style={{ fontFamily: 'inherit', flex: 1, background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.16)', color: TEXT_HI, borderRadius: 8, padding: '9px 10px', fontSize: 13 }}
          />
          <button
            onClick={() => props.onSave(name.trim() || 'My recording')}
            disabled={props.saved}
            style={{ ...pillBtn(true), background: props.saved ? '#2fae95' : VIOLET, borderColor: props.saved ? '#2fae95' : VIOLET, opacity: props.saved ? 0.85 : 1 }}
          >
            {props.saved ? 'Saved ✓' : 'Save to My Songs'}
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={props.onPlay} style={ghostBtn()}>▶ Play</button>
          <button onClick={props.onDownloadWav} style={ghostBtn()}>Download WAV</button>
          <button onClick={props.onDownloadMidi} style={ghostBtn()}>Download MIDI</button>
        </div>
        <button
          onClick={props.onNewRecording}
          style={{ fontFamily: 'inherit', background: 'transparent', color: TEXT_DIM, border: 'none', borderTop: '1px solid rgba(255,255,255,.08)', marginTop: 14, paddingTop: 12, width: '100%', textAlign: 'left', fontSize: 12.5, cursor: 'pointer' }}
        >
          New recording
        </button>
      </div>
    </div>
  )
}
