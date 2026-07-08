import React, { useState, useRef, useEffect, useCallback } from 'react'
import { autoCorrelate, noteInfoFromFrequency, type NoteInfo } from '../../lib/tuner/pitchDetector'
import { analytics } from '@/lib/analytics'

type Status = 'idle' | 'listening' | 'error'
type ErrorKind = 'no-api' | 'denied' | 'no-device' | 'unknown'

// SVG arc helpers
function toRad(deg: number) { return (deg * Math.PI) / 180 }
function arcPoint(cx: number, cy: number, r: number, deg: number) {
  return { x: cx + r * Math.cos(toRad(deg)), y: cy + r * Math.sin(toRad(deg)) }
}
function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const s = arcPoint(cx, cy, r, startDeg)
  const e = arcPoint(cx, cy, r, endDeg)
  const large = Math.abs(endDeg - startDeg) > 180 ? 1 : 0
  const sweep = endDeg > startDeg ? 1 : 0
  return `M ${s.x.toFixed(1)} ${s.y.toFixed(1)} A ${r} ${r} 0 ${large} ${sweep} ${e.x.toFixed(1)} ${e.y.toFixed(1)}`
}

// Pivot (160, 170), sweep from 210° to 330° centered on 270° (straight up)
const CX = 160, CY = 170, R = 125
const ARC_START = 210, ARC_END = 330
const ARC_RANGE = 60  // ±60° = ±50 cents

function TunerGauge({ cents, active }: { cents: number; active: boolean }) {
  const clamp = Math.max(-50, Math.min(50, cents))
  const angle = (clamp / 50) * ARC_RANGE  // -60 to +60 degrees

  const inTune = Math.abs(cents) <= 5
  const close  = Math.abs(cents) <= 20
  const needleColor = !active ? '#555' : inTune ? '#22c55e' : close ? '#f59e0b' : '#ef4444'

  // Needle tip (pointing up, then rotated)
  const tipBase = arcPoint(CX, CY, R - 10, 270)

  return (
    <svg viewBox="0 0 320 185" className="w-full max-w-xs mx-auto" aria-hidden="true">
      {/* Background arc */}
      <path
        d={arcPath(CX, CY, R, ARC_START, ARC_END)}
        fill="none" stroke="hsl(224 15% 16%)" strokeWidth="20" strokeLinecap="round"
      />
      {/* Flat zone — red tint */}
      <path
        d={arcPath(CX, CY, R, ARC_START, ARC_START + 20)}
        fill="none" stroke="#ef444433" strokeWidth="20" strokeLinecap="round"
      />
      {/* Sharp zone — red tint */}
      <path
        d={arcPath(CX, CY, R, ARC_END - 20, ARC_END)}
        fill="none" stroke="#ef444433" strokeWidth="20" strokeLinecap="round"
      />
      {/* Green zone — center ±10 cents */}
      <path
        d={arcPath(CX, CY, R, 258, 282)}
        fill="none" stroke="#22c55e44" strokeWidth="20" strokeLinecap="round"
      />

      {/* Tick marks */}
      {[ARC_START, ARC_START + 30, 270, ARC_END - 30, ARC_END].map((deg, i) => {
        const inner = arcPoint(CX, CY, R - 16, deg)
        const outer = arcPoint(CX, CY, R + 4, deg)
        return (
          <line key={i}
            x1={inner.x.toFixed(1)} y1={inner.y.toFixed(1)}
            x2={outer.x.toFixed(1)} y2={outer.y.toFixed(1)}
            stroke="hsl(224 15% 26%)" strokeWidth={i === 2 ? 2.5 : 1.5}
          />
        )
      })}

      {/* Labels: FLAT / IN TUNE / SHARP */}
      {(() => {
        const flat  = arcPoint(CX, CY, R + 22, ARC_START + 5)
        const sharp = arcPoint(CX, CY, R + 22, ARC_END - 5)
        return (
          <>
            <text x={flat.x.toFixed(1)} y={flat.y.toFixed(1)} textAnchor="middle" fill="hsl(220 10% 40%)" fontSize="9" fontFamily="ui-monospace,monospace">FLAT</text>
            <text x={sharp.x.toFixed(1)} y={sharp.y.toFixed(1)} textAnchor="middle" fill="hsl(220 10% 40%)" fontSize="9" fontFamily="ui-monospace,monospace">SHARP</text>
          </>
        )
      })()}

      {/* Needle */}
      <line
        x1={CX} y1={CY}
        x2={tipBase.x.toFixed(1)} y2={tipBase.y.toFixed(1)}
        stroke={needleColor} strokeWidth="2.5" strokeLinecap="round"
        transform={`rotate(${angle.toFixed(2)}, ${CX}, ${CY})`}
        style={{ transition: active ? 'all 80ms linear' : 'none' }}
      />
      {/* Pivot dot */}
      <circle cx={CX} cy={CY} r="6" fill={needleColor} style={{ transition: 'fill 80ms' }} />
    </svg>
  )
}

export function OnlineTuner() {
  const [status, setStatus]       = useState<Status>('idle')
  const [errorKind, setErrorKind] = useState<ErrorKind>('unknown')
  const [noteInfo, setNoteInfo]   = useState<NoteInfo | null>(null)
  const [hasSignal, setHasSignal] = useState(false)

  const audioCtxRef  = useRef<AudioContext | null>(null)
  const analyserRef  = useRef<AnalyserNode | null>(null)
  const streamRef    = useRef<MediaStream | null>(null)
  const rafRef       = useRef<number | null>(null)
  const lastRunRef   = useRef<number>(0)
  const bufRef       = useRef<Float32Array<ArrayBuffer>>(new Float32Array(4096) as Float32Array<ArrayBuffer>)

  const stop = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    audioCtxRef.current?.close().catch(() => {})
    audioCtxRef.current = null
    analyserRef.current = null
    streamRef.current   = null
    setStatus('idle')
    setNoteInfo(null)
    setHasSignal(false)
  }, [])

  const tick = useCallback(() => {
    if (!analyserRef.current || !audioCtxRef.current) return
    const now = performance.now()
    if (now - lastRunRef.current > 80) {
      lastRunRef.current = now
      const buf = bufRef.current
      analyserRef.current.getFloatTimeDomainData(buf)
      const freq = autoCorrelate(buf, audioCtxRef.current.sampleRate)
      if (freq > 0) {
        setNoteInfo(noteInfoFromFrequency(freq))
        setHasSignal(true)
      } else {
        setHasSignal(false)
      }
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [])

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorKind('no-api')
      setStatus('error')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      streamRef.current = stream

      const ctx = new AudioContext()
      audioCtxRef.current = ctx
      if (ctx.state === 'suspended') await ctx.resume()

      const analyser = ctx.createAnalyser()
      analyser.fftSize = 4096
      analyser.smoothingTimeConstant = 0
      analyserRef.current = analyser
      bufRef.current = new Float32Array(analyser.fftSize)

      ctx.createMediaStreamSource(stream).connect(analyser)
      setStatus('listening')
      analytics.toolWidgetUsed('tuner')
      tick()
    } catch (err) {
      console.error('[Tuner] getUserMedia failed:', err)
      const name = (err as DOMException)?.name
      setErrorKind(
        name === 'NotAllowedError' || name === 'PermissionDeniedError' ? 'denied'
        : name === 'NotFoundError' || name === 'DevicesNotFoundError' ? 'no-device'
        : 'unknown'
      )
      setStatus('error')
    }
  }, [tick])

  // Cleanup on unmount
  useEffect(() => () => { stop() }, [stop])

  const cents = noteInfo?.cents ?? 0
  const inTune = hasSignal && Math.abs(cents) <= 5

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden max-w-sm mx-auto">

      {/* Header */}
      <div className="px-6 pt-5 pb-2 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-1">Chromatic Tuner</p>
      </div>

      {/* Gauge */}
      <div className="px-6 pb-2">
        <TunerGauge cents={hasSignal ? cents : 0} active={hasSignal} />
      </div>

      {/* Note display */}
      <div className="px-6 pb-4 text-center">
        {hasSignal && noteInfo ? (
          <>
            <div className={`text-6xl font-bold tracking-tight mb-1 transition-colors ${inTune ? 'text-green-500' : 'text-foreground'}`}>
              {noteInfo.note}
              <span className="text-2xl font-normal text-muted-foreground ml-1">{noteInfo.octave}</span>
            </div>
            <p className="text-sm text-muted-foreground mb-1">
              {noteInfo.detectedFreq} Hz
              <span className="mx-2 opacity-40">·</span>
              Target {noteInfo.targetFreq} Hz
            </p>
            <p className={`text-sm font-semibold ${inTune ? 'text-green-500' : Math.abs(cents) <= 20 ? 'text-yellow-500' : 'text-red-500'}`}>
              {inTune ? 'In tune' : cents > 0 ? `+${cents} cents (sharp)` : `${cents} cents (flat)`}
            </p>
          </>
        ) : status === 'listening' ? (
          <div className="py-4">
            <p className="text-4xl font-bold text-muted-foreground/30 mb-1">—</p>
            <p className="text-sm text-muted-foreground">Play a note on your instrument…</p>
          </div>
        ) : status === 'error' ? (
          <div className="py-4">
            {errorKind === 'no-api' ? (
              <>
                <p className="text-sm text-destructive mb-1 font-medium">Microphone not supported</p>
                <p className="text-xs text-muted-foreground">Your browser doesn't support microphone access. Try Chrome or Firefox over HTTPS.</p>
              </>
            ) : errorKind === 'denied' ? (
              <>
                <p className="text-sm text-destructive mb-1 font-medium">Microphone access blocked</p>
                <p className="text-xs text-muted-foreground">You blocked the microphone for this site. Open browser settings, allow microphone access, then try again.</p>
              </>
            ) : errorKind === 'no-device' ? (
              <>
                <p className="text-sm text-destructive mb-1 font-medium">No microphone found</p>
                <p className="text-xs text-muted-foreground">Connect a microphone and try again.</p>
              </>
            ) : (
              <>
                <p className="text-sm text-destructive mb-1 font-medium">Microphone access needed</p>
                <p className="text-xs text-muted-foreground">Check your browser permissions and try again.</p>
              </>
            )}
          </div>
        ) : (
          <div className="py-4">
            <p className="text-4xl font-bold text-muted-foreground/20 mb-1">—</p>
            <p className="text-sm text-muted-foreground">Click below to start tuning</p>
          </div>
        )}
      </div>

      {/* Button */}
      <div className="px-6 pb-6">
        {status === 'listening' ? (
          <button
            onClick={stop}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-destructive/10 border border-destructive/30 text-destructive text-sm font-semibold rounded-xl hover:bg-destructive/20 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>
            Stop
          </button>
        ) : (
          <button
            onClick={start}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary text-primary-foreground text-sm font-semibold rounded-xl hover:bg-primary/90 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3Z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="22"/>
            </svg>
            Start Tuning
          </button>
        )}
      </div>

    </div>
  )
}
