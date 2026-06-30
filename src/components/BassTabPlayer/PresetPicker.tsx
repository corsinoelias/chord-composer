import React from 'react'
import { X } from 'lucide-react'
import { PRESETS, type Preset } from '../../data/presets'
import { analytics } from '../../lib/analytics'

interface Props {
  onSelect: (preset: Preset) => void
  onClose:  () => void
}

// Genre → accent colour
const GENRE_COLOR: Record<string, { bg: string; text: string; border: string }> = {
  'Disco Funk': { bg: 'hsl(45 60% 14%)',  text: 'hsl(45 85% 65%)',  border: 'hsl(45 60% 26%)' },
  'Funk / Pop': { bg: 'hsl(35 55% 13%)',  text: 'hsl(35 80% 62%)',  border: 'hsl(35 55% 25%)' },
  'Funk / Soul':{ bg: 'hsl(50 55% 13%)',  text: 'hsl(50 80% 60%)',  border: 'hsl(50 55% 25%)' },
  'Funk / R&B': { bg: 'hsl(28 52% 13%)',  text: 'hsl(28 78% 60%)',  border: 'hsl(28 52% 25%)' },
  'Pop / R&B':  { bg: 'hsl(290 42% 14%)', text: 'hsl(290 65% 70%)', border: 'hsl(290 42% 26%)' },
  'Pop / Rock': { bg: 'hsl(0 42% 14%)',   text: 'hsl(0 65% 65%)',   border: 'hsl(0 42% 26%)' },
}

const FONT = "'Inter', ui-sans-serif, system-ui, sans-serif"

// Bassist accent colours (Louis = gold, Nathan = blue, Wilton = green)
const BASSIST_COLOR: Record<string, string> = {
  'Nathan Watts':   'hsl(210 70% 60%)',
  'Louis Johnson':  'hsl(45 85% 58%)',
  'Wilton Felder':  'hsl(152 60% 52%)',
  'Steve Lukather': 'hsl(0 60% 60%)',
}

export function PresetPicker({ onSelect, onClose }: Props) {
  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, fontFamily: FONT,
      }}
    >
      <div style={{
        background: 'hsl(224 22% 10%)',
        border: '1px solid hsl(224 15% 20%)',
        borderRadius: 18,
        width: '100%', maxWidth: 680,
        maxHeight: '90vh',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 32px 100px rgba(0,0,0,0.8)',
      }}>

        {/* ── Header ── */}
        <div style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          padding: '18px 20px 14px',
          borderBottom: '1px solid hsl(224 15% 16%)',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'hsl(220 14% 93%)', letterSpacing: '-0.01em' }}>
              Michael Jackson — Bass Lines
            </div>
            <div style={{ fontSize: 11, color: 'hsl(220 10% 46%)', marginTop: 4, lineHeight: 1.4 }}>
              Select a song to load its bass tab. BPM and sound are set automatically.
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 30, height: 30, borderRadius: 8, flexShrink: 0, marginLeft: 12,
              border: '1px solid hsl(224 15% 22%)',
              background: 'hsl(224 20% 16%)',
              color: 'hsl(220 10% 52%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', transition: 'background 0.1s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'hsl(224 20% 21%)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'hsl(224 20% 16%)' }}
          >
            <X size={14} />
          </button>
        </div>

        {/* ── Song grid ── */}
        <div style={{
          padding: '14px 16px 18px',
          overflowY: 'auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: 10,
        }}>
          {PRESETS.map(preset => {
            const gc = GENRE_COLOR[preset.genre] ?? { bg: 'hsl(224 20% 14%)', text: 'hsl(220 10% 55%)', border: 'hsl(224 15% 22%)' }
            const bassistColor = BASSIST_COLOR[preset.bassist] ?? 'hsl(220 10% 40%)'
            return (
              <button
                key={preset.id}
                onClick={() => { analytics.bassTabPresetLoaded(preset.name); onSelect(preset); onClose() }}
                style={{
                  background: 'hsl(224 22% 13%)',
                  border: '1px solid hsl(224 15% 19%)',
                  borderRadius: 12,
                  padding: '13px 14px 11px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', gap: 4,
                  fontFamily: FONT,
                  transition: 'border-color 0.12s, background 0.12s, box-shadow 0.12s',
                  boxShadow: 'none',
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLElement
                  el.style.borderColor = 'hsl(262 55% 52%)'
                  el.style.background = 'hsl(224 22% 16%)'
                  el.style.boxShadow = '0 4px 24px rgba(0,0,0,0.5)'
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLElement
                  el.style.borderColor = 'hsl(224 15% 19%)'
                  el.style.background = 'hsl(224 22% 13%)'
                  el.style.boxShadow = 'none'
                }}
              >
                {/* Song title */}
                <div style={{ fontSize: 13, fontWeight: 700, color: 'hsl(220 14% 92%)', lineHeight: 1.25, marginBottom: 1 }}>
                  {preset.name}
                </div>

                {/* Artist */}
                <div style={{ fontSize: 11, color: 'hsl(220 10% 50%)', lineHeight: 1.2 }}>
                  {preset.artist}
                </div>

                {/* Bassist credit */}
                <div style={{ fontSize: 10, color: bassistColor, lineHeight: 1.2, opacity: 0.9 }}>
                  bass: {preset.bassist}
                </div>

                {/* Tags */}
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 5, marginTop: 5 }}>
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
                    background: gc.bg, color: gc.text, border: `1px solid ${gc.border}`,
                    letterSpacing: '0.04em', textTransform: 'uppercase',
                  }}>
                    {preset.genre}
                  </span>
                  <span style={{ fontSize: 10, color: 'hsl(220 10% 40%)', fontFamily: 'ui-monospace, monospace' }}>
                    {preset.bpm} BPM
                  </span>
                  <span style={{
                    fontSize: 9, color: 'hsl(220 10% 38%)', fontFamily: 'ui-monospace, monospace',
                    textTransform: 'uppercase', letterSpacing: '0.04em',
                  }}>
                    {preset.defaultSound}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
