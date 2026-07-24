import React, { useState, useRef, useEffect, useCallback } from 'react'
import type { BassTrack, BassSound } from '../../lib/bassTab/types'
import { startVideoExport, drawVideoFrame, dims as exportDims, type AspectRatio, type VideoQuality, type VideoExportHandle, type UIViewMode } from '../../lib/bassTab/videoExporter'

interface Props {
  track: BassTrack
  sound: BassSound
  onClose: () => void
}

const S = {
  bg:          'var(--bt-sunken)',
  border:      'var(--bt-rule)',
  text:        'var(--bt-ink)',
  muted:       'var(--bt-soft)',
  primary:     'var(--bt-accent)',
  primaryBg:   'var(--bt-accent-wash)',
  primaryText: 'var(--bt-accent)',
  surface:     'var(--bt-card)',
  danger:      'var(--bt-danger)',
  dangerBg:    'var(--bt-danger-wash)',
  green:       'var(--bt-ok)',
  greenBg:     'var(--bt-ok-wash)',
}
const FONT = 'var(--bt-ui)'

function fmtTime(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

function sanitize(s: string) {
  return s.replace(/[^a-z0-9_\-\s]/gi, '').trim() || 'bass-tab'
}

function estimateMB(q: VideoQuality, totalSec: number): number {
  const bps = q === 'fhd' ? 12_000_000 : 6_000_000
  return Math.round((bps / 8 * totalSec) / 1_000_000)
}

function resLabel(ar: AspectRatio, q: VideoQuality): string {
  if (ar === '16:9') return q === 'fhd' ? '1920×1080' : '1280×720'
  if (ar === '9:16') return q === 'fhd' ? '1080×1920' : '720×1280'
  return q === 'fhd' ? '1080×1080' : '720×720'
}

function formatSuffix(ar: AspectRatio): string {
  if (ar === '9:16') return '-short'
  if (ar === '1:1')  return '-square'
  return ''
}


// ── Format thumbnail shapes ───────────────────────────────────────────────────
function FormatThumb({ ar, active }: { ar: AspectRatio; active: boolean }) {
  const color  = active ? 'var(--bt-accent)' : 'var(--bt-dim)'
  const border = active ? 'var(--bt-accent)' : 'var(--bt-dim)'

  const shapes: Record<AspectRatio, { w: number; h: number }> = {
    '16:9': { w: 32, h: 18 },
    '9:16': { w: 18, h: 32 },
    '1:1':  { w: 24, h: 24 },
  }
  const { w, h } = shapes[ar]

  return (
    <div style={{
      width: w, height: h, borderRadius: 3,
      border: `2px solid ${border}`,
      background: active ? 'var(--bt-accent-wash)' : 'var(--bt-rule)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'all 0.12s', flexShrink: 0,
    }}>
      {/* inner accent line */}
      <div style={{
        width: '55%', height: 2, borderRadius: 1,
        background: color, opacity: 0.7,
      }} />
    </div>
  )
}

const FORMAT_OPTS: { id: AspectRatio; label: string; desc: string }[] = [
  { id: '16:9', label: '16:9', desc: 'YouTube · Desktop' },
  { id: '9:16', label: '9:16', desc: 'Reels · Shorts'   },
  { id: '1:1',  label: '1:1',  desc: 'Instagram · Post'  },
]

// ── Component ─────────────────────────────────────────────────────────────────

export function ExportVideoModal({ track, sound, onClose }: Props) {
  const [aratio,      setAratio]      = useState<AspectRatio>('16:9')
  const [viewMode,    setViewMode]    = useState<UIViewMode>('tab')
  const [barsPerPage, setBarsPerPage] = useState<1 | 2 | 4>(2)
  const [basename,    setBasename]    = useState(() => sanitize(track.name))
  const [loading,     setLoading]     = useState(false)
  const [progress,    setProgress]    = useState(0)
  const [frameInfo,   setFrameInfo]   = useState({ cur: 0, total: 0 })
  const [done,        setDone]        = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [previewBeat, setPreviewBeat] = useState(0)

  const quality: VideoQuality  = 'fhd'
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const handleRef = useRef<VideoExportHandle | null>(null)
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null)

  const totalBeats  = track.totalBars * track.beatsPerBar
  const totalSec    = totalBeats * (60 / track.bpm)
  const totalFrames = Math.ceil(totalSec * 30)
  const estMB       = estimateMB(quality, totalSec)
  const suffix      = formatSuffix(aratio)
  const fullName    = `${basename || sanitize(track.name)}${suffix}.webm`

  // ── Animated preview ────────────────────────────────────────────────────────
  useEffect(() => {
    if (loading) return
    timerRef.current = setInterval(() => {
      setPreviewBeat(b => {
        const next = b + track.beatsPerBar
        return next >= totalBeats ? 0 : next
      })
    }, 1800)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [loading, track.beatsPerBar, totalBeats])

  // Reset beat when format changes
  useEffect(() => { setPreviewBeat(0) }, [aratio])

  // Draw preview frame
  useEffect(() => {
    if (loading || !canvasRef.current) return
    const canvas = canvasRef.current
    // Use exact export dimensions so preview matches the real video (WYSIWYG)
    const { w, h } = exportDims(aratio, quality)
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width  = w
      canvas.height = h
    }
    drawVideoFrame(canvas.getContext('2d')!, w, h, track, previewBeat, aratio, viewMode, barsPerPage)
  }, [aratio, quality, track, loading, previewBeat, viewMode, barsPerPage])

  // ── Export ──────────────────────────────────────────────────────────────────
  const handleExport = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    setLoading(true); setError(null); setDone(false); setProgress(0)
    setFrameInfo({ cur: 0, total: totalFrames })

    handleRef.current = startVideoExport(
      track, sound, canvas,
      {
        aspectRatio:  aratio,
        quality,
        viewMode,
        barsPerPage,
        countInBeats: track.beatsPerBar,
        onProgress: (beat, total) => {
          const frac = beat / total
          setProgress(frac)
          setFrameInfo(fi => ({ ...fi, cur: Math.round(frac * totalFrames) }))
        },
      },
      (blob) => {
        setLoading(false); setDone(true); setProgress(1)
        const url = URL.createObjectURL(blob)
        const a   = document.createElement('a')
        a.href = url; a.download = fullName; a.click()
        setTimeout(() => URL.revokeObjectURL(url), 60_000)
      },
      (err) => {
        setLoading(false)
        setError(err.message || 'Video export failed.')
      },
    )
  }, [track, sound, aratio, quality, viewMode, barsPerPage, fullName, totalFrames])

  const handleCancel = () => {
    handleRef.current?.cancel()
    handleRef.current = null
    setLoading(false); setProgress(0); setDone(false)
  }

  const handleReset = () => {
    setDone(false); setProgress(0); setError(null)
  }

  const canvasMaxH = aratio === '9:16' ? 260 : aratio === '1:1' ? 220 : 180

  // ── Current bar indicator for preview ──────────────────────────────────────
  const previewBar  = Math.floor(previewBeat / track.beatsPerBar) + 1

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
          borderRadius: 14, padding: '20px 22px',
          width: 400, maxWidth: '96vw', maxHeight: '96dvh', overflow: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
        }}
        onPointerDown={e => e.stopPropagation()}
      >

        {/* ── Header with badges ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 9, flexShrink: 0,
              background: S.primaryBg, border: `1px solid ${S.primary}44`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <VideoIcon color={S.primary} />
            </div>
            <div>
              <div style={{ color: S.text, fontWeight: 600, fontSize: 14, lineHeight: 1.3 }}>
                Exportar Video
              </div>
              <div style={{ color: S.muted, fontSize: 11, marginTop: 1, marginBottom: 6 }}>
                {track.name}
              </div>
              {/* Info badges */}
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {([
                  fmtTime(totalSec),
                  `${track.bpm} BPM`,
                  `~${estMB} MB`,
                  resLabel(aratio, quality),
                ] as string[]).map(label => (
                  <span key={label} style={{
                    fontSize: 9, fontWeight: 600, letterSpacing: '0.04em',
                    padding: '2px 7px', borderRadius: 20,
                    background: S.surface, border: `1px solid ${S.border}`,
                    color: S.muted,
                  }}>
                    {label}
                  </span>
                ))}
              </div>
            </div>
          </div>
          {!loading && (
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: S.muted, cursor: 'pointer', padding: 4, flexShrink: 0 }}>
              <CloseIcon />
            </button>
          )}
        </div>

        {/* ── Format selector (visual thumbnails) ── */}
        {!loading && (
          <>
            <div style={{ marginBottom: 12 }}>
              <div style={{ color: S.muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                Formato
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {FORMAT_OPTS.map(opt => {
                  const active = aratio === opt.id
                  return (
                    <button key={opt.id} onClick={() => setAratio(opt.id)}
                      style={{
                        flex: 1, padding: '10px 8px 8px', borderRadius: 9,
                        cursor: 'pointer', textAlign: 'center',
                        background: active ? S.primaryBg : S.surface,
                        border: `1px solid ${active ? S.primary : S.border}`,
                        color: active ? S.primaryText : S.text,
                        transition: 'all 0.12s',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
                      }}
                    >
                      <FormatThumb ar={opt.id} active={active} />
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700 }}>{opt.label}</div>
                        <div style={{ fontSize: 9, color: active ? S.primaryText + 'aa' : S.muted, marginTop: 1 }}>{opt.desc}</div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* ── View mode selector ── */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ color: S.muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                Vista
              </div>
              <div style={{ display: 'flex', gap: 5 }}>
                {(
                  [
                    { id: 'tab',    label: 'Tab',    desc: 'Notación' },
                    { id: 'score',  label: 'Score',  desc: 'Con barras' },
                    { id: 'grid',   label: 'Grid',   desc: 'Piano roll' },
                    { id: 'guitar', label: 'Guitar', desc: 'Fretboard' },
                  ] as { id: UIViewMode; label: string; desc: string }[]
                ).map(opt => {
                  const active = viewMode === opt.id
                  return (
                    <button key={opt.id} onClick={() => setViewMode(opt.id)}
                      style={{
                        flex: 1, padding: '7px 4px', borderRadius: 8,
                        cursor: 'pointer', textAlign: 'center',
                        background: active ? S.primaryBg : S.surface,
                        border: `1px solid ${active ? S.primary : S.border}`,
                        color: active ? S.primaryText : S.text,
                        transition: 'all 0.12s',
                      }}
                    >
                      <div style={{ fontSize: 11, fontWeight: 700 }}>{opt.label}</div>
                      <div style={{ fontSize: 9, color: active ? S.primaryText + 'aa' : S.muted, marginTop: 2 }}>{opt.desc}</div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* ── Bars per page ── */}
            {viewMode !== 'guitar' && aratio !== '9:16' && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ color: S.muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                  Compases por página
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {([1, 2, 4] as (1 | 2 | 4)[]).map(n => {
                    const active = barsPerPage === n
                    return (
                      <button key={n} onClick={() => setBarsPerPage(n)}
                        style={{
                          flex: 1, padding: '7px 4px', borderRadius: 8,
                          cursor: 'pointer', textAlign: 'center',
                          background: active ? S.primaryBg : S.surface,
                          border: `1px solid ${active ? S.primary : S.border}`,
                          color: active ? S.primaryText : S.text,
                          fontSize: 13, fontWeight: 700,
                          transition: 'all 0.12s',
                        }}
                      >
                        {n} {n === 1 ? 'compás' : 'compases'}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── Smart filename ── */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ color: S.muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                Nombre de archivo
              </div>
              <div style={{ display: 'flex', alignItems: 'center', borderRadius: 7, overflow: 'hidden', border: `1px solid ${S.border}` }}>
                <input
                  type="text"
                  value={basename}
                  onChange={e => setBasename(e.target.value)}
                  placeholder={sanitize(track.name)}
                  style={{
                    flex: 1, height: 34, padding: '0 10px',
                    background: S.surface, border: 'none',
                    color: S.text, fontSize: 13, fontFamily: FONT, outline: 'none',
                  }}
                  onFocus={e => { e.currentTarget.parentElement!.style.borderColor = S.primary }}
                  onBlur={e => { e.currentTarget.parentElement!.style.borderColor = S.border }}
                />
                <span style={{
                  height: 34, padding: '0 10px', whiteSpace: 'nowrap',
                  background: 'var(--bt-paper)', borderLeft: `1px solid ${S.border}`,
                  color: S.muted, fontSize: 11, fontFamily: FONT,
                  display: 'flex', alignItems: 'center', gap: 1,
                }}>
                  {suffix && <span style={{ color: 'var(--bt-accent)' }}>{suffix}</span>}
                  <span>.webm</span>
                </span>
              </div>
            </div>
          </>
        )}

        {/* ── Canvas preview / recording ── */}
        <div style={{
          borderRadius: 8, overflow: 'hidden', marginBottom: 10, lineHeight: 0,
          border: `1px solid ${loading ? S.primary + '55' : done ? S.green + '55' : S.border}`,
          background: '#0a0e16', position: 'relative',
          maxHeight: canvasMaxH, display: 'flex', justifyContent: 'center',
          transition: 'border-color 0.2s',
        }}>
          <canvas
            ref={canvasRef}
            style={{ width: '100%', height: 'auto', display: 'block', maxHeight: canvasMaxH, objectFit: 'contain' }}
          />

          {/* Animated preview bar indicator */}
          {!loading && !done && (
            <div style={{
              position: 'absolute', bottom: 6, right: 8,
              fontSize: 10, fontWeight: 600, fontFamily: 'var(--bt-mono)',
              color: 'rgba(160,140,220,0.70)',
              background: 'rgba(8,10,20,0.65)', borderRadius: 4, padding: '2px 6px',
              pointerEvents: 'none',
            }}>
              Bar {previewBar} / {track.totalBars}
            </div>
          )}
        </div>

        {/* ── Progress (during export) ── */}
        {loading && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ background: 'var(--bt-paper)', borderRadius: 6, height: 5, overflow: 'hidden', marginBottom: 6 }}>
              <div style={{
                height: '100%', borderRadius: 6,
                background: `linear-gradient(90deg, var(--bt-accent), var(--bt-accent))`,
                width: `${progress * 100}%`,
                transition: 'width 0.15s linear',
                boxShadow: `0 0 10px var(--bt-accent-wash)`,
              }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
              <span style={{ color: S.primary, fontWeight: 600 }}>
                Procesando… {Math.round(progress * 100)}%
              </span>
              <span style={{ color: S.muted, fontFamily: 'var(--bt-mono)', fontSize: 10 }}>
                Frame {frameInfo.cur.toLocaleString()} / {frameInfo.total.toLocaleString()}
              </span>
            </div>
          </div>
        )}

        {/* ── Done banner ── */}
        {done && (
          <div style={{
            background: S.greenBg, border: `1px solid ${S.green}55`,
            borderRadius: 8, padding: '10px 14px', marginBottom: 10,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <CheckIcon color={S.green} />
            <div>
              <div style={{ color: S.green, fontSize: 13, fontWeight: 600 }}>Video exportado</div>
              <div style={{ color: S.muted, fontSize: 11, marginTop: 2 }}>
                {resLabel(aratio, quality)} · ~{estMB} MB · descargado automáticamente
              </div>
            </div>
          </div>
        )}

        {/* ── Error ── */}
        {error && (
          <div style={{
            background: S.dangerBg, border: `1px solid ${S.danger}55`,
            borderRadius: 7, padding: '8px 12px', marginBottom: 10,
            color: 'var(--bt-danger)', fontSize: 12,
          }}>
            {error}
          </div>
        )}

        {/* ── Actions ── */}
        <div style={{ display: 'flex', gap: 8 }}>
          {loading ? (
            <button onClick={handleCancel}
              style={{
                flex: 1, padding: '9px 0', borderRadius: 8,
                background: S.dangerBg, border: `1px solid ${S.danger}55`,
                color: 'var(--bt-danger)', fontSize: 13, fontWeight: 500,
                cursor: 'pointer', fontFamily: FONT,
              }}
            >
              Cancelar
            </button>
          ) : done ? (
            <>
              <button onClick={handleReset}
                style={{
                  flex: 1, padding: '9px 0', borderRadius: 8,
                  background: S.surface, border: `1px solid ${S.border}`,
                  color: S.muted, fontSize: 13, fontWeight: 500,
                  cursor: 'pointer', fontFamily: FONT,
                }}
              >
                Exportar de nuevo
              </button>
              <button onClick={onClose}
                style={{
                  flex: 2, padding: '9px 0', borderRadius: 8,
                  background: S.green, border: 'none',
                  color: 'white', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', fontFamily: FONT,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                }}
              >
                <CheckIcon color="white" size={13} />
                Listo
              </button>
            </>
          ) : (
            <>
              <button onClick={onClose}
                style={{
                  flex: 1, padding: '9px 0', borderRadius: 8,
                  background: 'transparent', border: `1px solid ${S.border}`,
                  color: S.muted, fontSize: 13, fontWeight: 500,
                  cursor: 'pointer', fontFamily: FONT, transition: 'border-color 0.12s, color 0.12s',
                }}
                onMouseEnter={e => { const el = e.currentTarget; el.style.borderColor = 'var(--bt-dim)'; el.style.color = S.text }}
                onMouseLeave={e => { const el = e.currentTarget; el.style.borderColor = S.border; el.style.color = S.muted }}
              >
                Cancelar
              </button>
              <button onClick={handleExport}
                style={{
                  flex: 2, padding: '9px 0', borderRadius: 8,
                  background: S.primary, border: 'none',
                  color: 'white', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', fontFamily: FONT,
                  boxShadow: `0 0 18px transparent`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                  transition: 'opacity 0.12s',
                }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '0.88' }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
              >
                <VideoIcon color="white" size={13} />
                Exportar Video
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Icons ──────────────────────────────────────────────────────────────────────

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

function CheckIcon({ color, size = 16 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5"/>
    </svg>
  )
}
