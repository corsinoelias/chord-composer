import React, { useState } from 'react'
import type { BassTrack } from '../../lib/bassTab/types'
import { exportTabNotationAsPng, exportPianoRollAsPng } from '../../lib/bassTab/tabImageExporter'

type ImageView = 'tab' | 'grid'

interface Props {
  track: BassTrack
  onClose: () => void
}

const S = {
  bg:          'hsl(224 20% 11%)',
  border:      'hsl(224 15% 22%)',
  text:        'hsl(220 14% 82%)',
  muted:       'hsl(220 10% 46%)',
  primary:     'hsl(262 83% 58%)',
  primaryBg:   'hsl(262 60% 25%)',
  primaryText: 'hsl(262 80% 85%)',
  surface:     'hsl(224 18% 15%)',
  danger:      'hsl(0 72% 51%)',
  dangerBg:    'hsl(0 60% 20%)',
}
const FONT = "'Inter', ui-sans-serif, system-ui, sans-serif"

export function ExportImageModal({ track, onClose }: Props) {
  const [imageView, setImageView] = useState<ImageView>('tab')
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)

  const handleExport = async () => {
    setLoading(true); setError(null)
    try {
      if (imageView === 'tab') await exportTabNotationAsPng(track, { barsPerRow: 4 })
      else                     await exportPianoRollAsPng(track)
      onClose()
    } catch {
      setError('Export failed. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        position: 'absolute', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: FONT,
      }}
      onPointerDown={loading ? undefined : onClose}
    >
      <div
        style={{
          background: S.bg, border: `1px solid ${S.border}`,
          borderRadius: 14, padding: '22px 24px',
          width: 340, maxWidth: '96vw',
          boxShadow: '0 20px 60px rgba(0,0,0,0.65)',
        }}
        onPointerDown={e => e.stopPropagation()}
      >
        {/* Title */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: S.primaryBg, border: `1px solid ${S.primary}44`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <ImageIconSvg color={S.primary} />
            </div>
            <div>
              <div style={{ color: S.text, fontWeight: 600, fontSize: 14 }}>Export Image</div>
              <div style={{ color: S.muted, fontSize: 11, marginTop: 1 }}>{track.name}</div>
            </div>
          </div>
          {!loading && (
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: S.muted, cursor: 'pointer', padding: 4 }}>
              <CloseIcon />
            </button>
          )}
        </div>

        {/* View selector */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          {([
            { id: 'tab' as ImageView,  label: 'Tab Notation', desc: '4 strings · bars in rows' },
            { id: 'grid' as ImageView, label: 'Piano Roll',   desc: 'Grid · full timeline'     },
          ]).map(opt => {
            const active = imageView === opt.id
            return (
              <button key={opt.id} onClick={() => setImageView(opt.id)}
                style={{
                  flex: 1, padding: '10px 8px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                  background: active ? S.primaryBg : S.surface,
                  border: `1px solid ${active ? S.primary : S.border}`,
                  color: active ? S.primaryText : S.text,
                  transition: 'all 0.12s',
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 600 }}>{opt.label}</div>
                <div style={{ fontSize: 10, color: active ? S.primaryText + 'aa' : S.muted, marginTop: 2 }}>{opt.desc}</div>
              </button>
            )
          })}
        </div>

        {/* Track info */}
        <div style={{
          background: 'hsl(224 24% 7%)', border: `1px solid ${S.border}`,
          borderRadius: 8, padding: '10px 12px', marginBottom: 16,
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4,
        }}>
          {([
            { label: 'Notes', value: track.notes.length },
            { label: 'Bars',  value: track.totalBars    },
            { label: 'BPM',   value: track.bpm          },
          ]).map(({ label, value }) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <div style={{ color: S.muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
              <div style={{ color: S.primaryText, fontSize: 15, fontWeight: 700, fontFamily: 'ui-monospace, monospace', marginTop: 2 }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div style={{
            background: S.dangerBg, border: `1px solid ${S.danger}55`,
            borderRadius: 7, padding: '8px 12px', marginBottom: 12,
            color: 'hsl(0 80% 80%)', fontSize: 12,
          }}>
            {error}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose}
            style={{
              flex: 1, padding: '9px 0', borderRadius: 8,
              background: 'transparent', border: `1px solid ${S.border}`,
              color: S.muted, fontSize: 13, fontWeight: 500,
              cursor: 'pointer', fontFamily: FONT, transition: 'border-color 0.12s, color 0.12s',
            }}
            onMouseEnter={e => { const el = e.currentTarget; el.style.borderColor = 'hsl(224 15% 36%)'; el.style.color = S.text }}
            onMouseLeave={e => { const el = e.currentTarget; el.style.borderColor = S.border; el.style.color = S.muted }}
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={loading}
            style={{
              flex: 2, padding: '9px 0', borderRadius: 8,
              background: loading ? S.primaryBg : S.primary, border: 'none',
              color: 'white', fontSize: 13, fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer', fontFamily: FONT,
              boxShadow: loading ? 'none' : `0 0 18px hsl(262 83% 58% / 0.32)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              opacity: loading ? 0.7 : 1,
              transition: 'opacity 0.12s',
            }}
          >
            {loading ? (
              <span style={{ opacity: 0.7 }}>Exporting…</span>
            ) : (
              <>
                <DownloadIcon />
                Export PNG
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

function ImageIconSvg({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
      <circle cx="9" cy="9" r="2"/>
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M18 6 6 18M6 6l12 12"/>
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  )
}
