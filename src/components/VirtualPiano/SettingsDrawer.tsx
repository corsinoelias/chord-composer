import React from 'react'
import type { InstrumentId } from '../../lib/virtualPiano/pianoAudio'
import { TEXT_DIM, TEXT_HI, TEXT_MED, pillBtn } from './pianoTheme'

type LabelMode = 'none' | 'notes' | 'keys'
type Notation = 'latina' | 'anglo'

interface Props {
  open: boolean
  onClose: () => void
  volume: number
  onVolumeChange: (v: number) => void
  octOverride: number | null
  onSetDensity: (n: number | null) => void
  labelMode: LabelMode
  onSetLabelMode: (m: LabelMode) => void
  notation: Notation
  onSetNotation: (n: Notation) => void
  octLabel: string
  onOctDown: () => void
  onOctUp: () => void
  instrument: InstrumentId
  onSetInstrument: (i: InstrumentId) => void
}

const row: React.CSSProperties = { padding: '11px 0', borderBottom: '1px solid rgba(255,255,255,.08)' }
const label: React.CSSProperties = { fontSize: 13, color: TEXT_MED, display: 'block', marginBottom: 8, fontWeight: 600 }

export function SettingsDrawer(props: Props) {
  const { open, onClose } = props
  if (!open) return null
  const volumePct = Math.round(props.volume * 100)

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(10,8,16,.5)', zIndex: 1000 }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ position: 'absolute', right: 16, top: 16, width: 300, maxWidth: '88vw', maxHeight: '80vh', overflow: 'auto', background: '#1d1830', border: '1px solid rgba(255,255,255,.1)', borderRadius: 16, boxShadow: '0 20px 60px rgba(20,16,32,.35)', padding: 18, color: TEXT_HI }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <h3 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 17, margin: 0, fontWeight: 600 }}>Settings</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: TEXT_MED, cursor: 'pointer', fontSize: 16, padding: 4 }}>✕</button>
        </div>

        <div style={row}>
          <label style={label}>Instrument</label>
          <select
            value={props.instrument}
            onChange={(e) => props.onSetInstrument(e.target.value as InstrumentId)}
            style={{ fontFamily: 'inherit', width: '100%', background: 'rgba(255,255,255,.08)', color: '#fff', border: '1px solid rgba(255,255,255,.14)', borderRadius: 8, padding: '7px 8px', fontSize: 12.5 }}
          >
            <option value="acoustic">Acoustic Piano</option>
            <option value="piano">Classic Piano</option>
            <option value="epiano">Electric Piano</option>
            <option value="organ">Organ</option>
            <option value="synth">Synthesizer</option>
            <option value="strings">Strings</option>
            <option value="musicbox">Music Box</option>
          </select>
        </div>

        <div style={row}>
          <label style={label}>Volume — {volumePct}%</label>
          <input
            type="range" min={0} max={100} value={volumePct}
            onChange={(e) => props.onVolumeChange(Number(e.target.value) / 100)}
            style={{ width: '100%' }}
          />
        </div>

        <div style={row}>
          <label style={label}>Key density — octaves shown</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[2, 3, 4, 5].map(n => (
              <button key={n} onClick={() => props.onSetDensity(n)} style={{ ...pillBtn(props.octOverride === n), padding: '7px 12px' }}>{n}</button>
            ))}
            <button onClick={() => props.onSetDensity(null)} style={{ ...pillBtn(props.octOverride === null), padding: '7px 12px' }}>Auto</button>
          </div>
          <p style={{ fontSize: 11.5, color: TEXT_DIM, margin: '8px 0 0' }}>Auto never goes below 2 octaves, even on a phone.</p>
        </div>

        <div style={row}>
          <label style={label}>Key labels</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => props.onSetLabelMode('notes')} style={{ ...pillBtn(props.labelMode === 'notes'), padding: '7px 12px' }}>Notes</button>
            <button onClick={() => props.onSetLabelMode('keys')} style={{ ...pillBtn(props.labelMode === 'keys'), padding: '7px 12px' }}>Shortcuts</button>
            <button onClick={() => props.onSetLabelMode('none')} style={{ ...pillBtn(props.labelMode === 'none'), padding: '7px 12px' }}>None</button>
          </div>
        </div>

        <div style={row}>
          <label style={label}>Note names</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => props.onSetNotation('latina')} style={{ ...pillBtn(props.notation === 'latina'), padding: '7px 12px' }}>Do Re Mi</button>
            <button onClick={() => props.onSetNotation('anglo')} style={{ ...pillBtn(props.notation === 'anglo'), padding: '7px 12px' }}>C D E</button>
          </div>
        </div>

        <div style={{ ...row, borderBottom: 'none' }}>
          <label style={label}>Base octave</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={props.onOctDown} style={{ ...pillBtn(false), padding: '7px 14px', fontSize: 15 }}>−</button>
            <span style={{ fontSize: 14 }}>{props.octLabel}</span>
            <button onClick={props.onOctUp} style={{ ...pillBtn(false), padding: '7px 14px', fontSize: 15 }}>+</button>
          </div>
        </div>
      </div>
    </div>
  )
}
