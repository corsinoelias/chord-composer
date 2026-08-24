import React from 'react'
import { GUITAR_PRESETS, type GuitarPreset } from '../../data/guitarPresets'

interface GuitarSongLibraryProps {
  onSelect: (preset: GuitarPreset) => void
  onClose: () => void
}

// Same modal pattern as VirtualPiano's Song Library (VirtualPiano.tsx) — a grid of
// cards over a dim backdrop, purple accent (#7c3aed matches ACCENT there too) — just
// with a single "Load" action per card instead of Play/Waterfall, since loading a
// preset here drops it straight into the editor for the user to play themselves.
export function GuitarSongLibrary({ onSelect, onClose }: GuitarSongLibraryProps) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,17,23,0.55)', zIndex: 300,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '4vh 16px',
        fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 22,
          width: 880, maxWidth: '100%', maxHeight: '88vh', overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(15,17,23,0.35)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1e293b' }}>Song Library</h2>
          <span style={{ color: '#64748b', fontSize: 13 }}>Load a preset, then hit Play to hear it</span>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ marginLeft: 'auto', background: 'transparent', color: '#64748b', border: 'none', fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: 4 }}
          >✕</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 10 }}>
          {GUITAR_PRESETS.map(preset => (
            <div
              key={preset.id}
              style={{
                background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14,
                display: 'flex', flexDirection: 'column', gap: 8,
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{preset.name}</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>{preset.artist} · {preset.genre}</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: '#7c3aed', background: '#ede9fe', borderRadius: 999, padding: '2px 8px', fontWeight: 600 }}>
                  {preset.bpm} BPM
                </span>
                <span style={{ fontSize: 11, color: '#64748b', background: '#eef2f7', borderRadius: 999, padding: '2px 8px' }}>
                  {preset.notes.length} notes
                </span>
              </div>
              <button
                onClick={() => onSelect(preset)}
                style={{
                  marginTop: 'auto', fontFamily: 'inherit', background: '#7c3aed', color: '#fff',
                  border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                ▶ Load
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
