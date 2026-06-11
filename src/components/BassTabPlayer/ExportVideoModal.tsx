import React, { useState, useRef, useEffect, useCallback } from 'react'
import type { BassTrack, BassSound } from '../../lib/bassTab/types'
import { startVideoExport, drawVideoFrame, type AspectRatio, type VideoExportHandle } from '../../lib/bassTab/videoExporter'

interface Props {
  track: BassTrack
  sound: BassSound
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

function fmtTime(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

export function ExportVideoModal({ track, sound, onClose }: Props) {
  const [aratio,   setAratio]   = useState<AspectRatio>('16:9')
  const [loading,  setLoading]  = useState(false)
  const [progress, setProgress] = useState(0)
  const [done,     setDone]     = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const handleRef = useRef<VideoExportHandle | null>(null)

  const totalBeats = track.totalBars * track.beatsPerBar
  const totalSec   = totalBeats * (60 / track.bpm)
  const elapsed    = totalSec * progress

  // Draw static preview frame when aspect ratio changes (only when not recording)
  useEffect(() => {
    if (loading || !canvasRef.current) return
    const canvas = canvasRef.current
    const { w, h } = aratio === '16:9' ? { w: 640, h: 360 } : { w: 360, h: 640 }
    canvas.width  = w
    canvas.height = h
    const ctx = canvas.getContext('2d')!
    drawVideoFrame(ctx, w, h, track, 0, aratio)
  }, [aratio, track, loading])

  const handleExport = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    setLoading(true); setError(null); setDone(false); setProgress(0)

    handleRef.current = startVideoExport(
      track, sound, canvas,
      {
        aspectRatio: aratio,
        onProgress: (beat, total) => setProgress(beat / total),
      },
      (blob) => {
        setLoading(false); setDone(true); setProgress(1)
        const safe = track.name.replace(/[^a-z0-9_\-\s]/gi, '').trim() || 'bass-tab'
        const ext  = aratio === '9:16' ? 'short' : 'video'
        const url  = URL.createObjectURL(blob)
        const a    = document.createElement('a')
        a.href = url; a.download = `${safe}-${ext}.webm`; a.click()
        setTimeout(() => URL.revokeObjectURL(url), 60_000)
        setTimeout(() => onClose(), 1400)
      },
      (err) => {
        setLoading(false)
        setError(err.message || 'Video export failed.')
      },
    )
  }, [track, sound, aratio, onClose])

  const handleCancel = () => {
    handleRef.current?.cancel()
    handleRef.current = null
    setLoading(false); setProgress(0); setDone(false)
  }

  const canvasMaxH = aratio === '9:16' ? 290 : 200

  return (
    <div
      style={{
        position: 'absolute', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: FONT,
      }}
      onPointerDown={loading ? undefined : onClose}
    >
      <div
        style={{
          background: S.bg, border: `1px solid ${S.border}`,
          borderRadius: 14, padding: '22px 24px',
          width: aratio === '9:16' ? 390 : 380,
          maxWidth: '96vw', maxHeight: '96dvh', overflow: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
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
              <VideoIcon color={S.primary} />
            </div>
            <div>
              <div style={{ color: S.text, fontWeight: 600, fontSize: 14 }}>Export Video</div>
              <div style={{ color: S.muted, fontSize: 11, marginTop: 1 }}>{track.name}</div>
            </div>
          </div>
          {!loading && (
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: S.muted, cursor: 'pointer', padding: 4 }}>
              <CloseIcon />
            </button>
          )}
        </div>

        {/* Aspect ratio selector (only before export) */}
        {!loading && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ color: S.muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              Format
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {([
                { id: '16:9' as AspectRatio, label: '16:9', desc: 'YouTube · Desktop · 1280×720' },
                { id: '9:16' as AspectRatio, label: '9:16', desc: 'Reels · Shorts · 720×1280'   },
              ]).map(opt => {
                const active = aratio === opt.id
                return (
                  <button key={opt.id} onClick={() => setAratio(opt.id)}
                    style={{
                      flex: 1, padding: '9px 8px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                      background: active ? S.primaryBg : S.surface,
                      border: `1px solid ${active ? S.primary : S.border}`,
                      color: active ? S.primaryText : S.text,
                      transition: 'all 0.12s',
                    }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{opt.label}</div>
                    <div style={{ fontSize: 10, color: active ? S.primaryText + 'aa' : S.muted, marginTop: 3 }}>{opt.desc}</div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Canvas preview / recording */}
        <div style={{
          borderRadius: 8, overflow: 'hidden',
          border: `1px solid ${loading ? S.primary + '55' : S.border}`,
          background: '#0a0e16', lineHeight: 0, marginBottom: 12,
          maxHeight: canvasMaxH,
          display: 'flex', justifyContent: 'center',
          transition: 'border-color 0.2s',
        }}>
          <canvas
            ref={canvasRef}
            style={{
              width: '100%', height: 'auto', display: 'block',
              maxHeight: canvasMaxH, objectFit: 'contain',
            }}
          />
        </div>

        {/* Progress bar (only while recording) */}
        {loading && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ background: 'hsl(224 24% 7%)', borderRadius: 6, height: 5, overflow: 'hidden', marginBottom: 7 }}>
              <div style={{
                height: '100%', borderRadius: 6,
                background: `linear-gradient(90deg, hsl(262 70% 45%), hsl(262 83% 68%))`,
                width: `${progress * 100}%`,
                transition: 'width 0.2s linear',
                boxShadow: `0 0 10px hsl(262 83% 58% / 0.55)`,
              }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: S.muted }}>
              <span style={{ color: done ? 'hsl(142 71% 55%)' : S.primary, fontWeight: 600 }}>
                {done ? '✓ Done' : 'Recording…'}
              </span>
              <span style={{ fontFamily: 'ui-monospace, monospace' }}>
                {fmtTime(elapsed)} / {fmtTime(totalSec)}
              </span>
            </div>
          </div>
        )}

        {/* Spec info (before export) */}
        {!loading && (
          <div style={{ color: S.muted, fontSize: 10, textAlign: 'center', marginBottom: 14 }}>
            {aratio === '16:9' ? '1280×720' : '720×1280'} · 30fps · VP9 · WebM · ~{fmtTime(totalSec)} long
          </div>
        )}

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
          {loading ? (
            <button onClick={handleCancel}
              style={{
                flex: 1, padding: '9px 0', borderRadius: 8,
                background: S.dangerBg, border: `1px solid ${S.danger}55`,
                color: 'hsl(0 80% 80%)', fontSize: 13, fontWeight: 500,
                cursor: 'pointer', fontFamily: FONT,
              }}
            >
              Cancel
            </button>
          ) : (
            <>
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
                style={{
                  flex: 2, padding: '9px 0', borderRadius: 8,
                  background: S.primary, border: 'none',
                  color: 'white', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', fontFamily: FONT,
                  boxShadow: `0 0 18px hsl(262 83% 58% / 0.35)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                  transition: 'opacity 0.12s',
                }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '0.88' }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
              >
                <VideoIcon color="white" size={13} />
                Export Video
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Icons ──────────────────────────────────────────────────────────────────

function VideoIcon({ color, size = 16 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m22 8-6 4 6 4V8z"/>
      <rect width="14" height="12" x="2" y="6" rx="2" ry="2"/>
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
