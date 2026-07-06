import { useState, useRef, useEffect } from 'react';

interface DurationDotsProps {
  duration: number;
  isActive: boolean;
  bpm: number;
  uid: number | string;
  size?: number;
  className?: string;
}

export function DurationDots({ duration, isActive, bpm, uid, size = 6, className = '' }: DurationDotsProps) {
  const [progress, setProgress] = useState(0)
  const rafRef = useRef<number | null>(null)
  const startRef = useRef<number | null>(null)

  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    if (!isActive) { setProgress(0); return }
    const totalMs = duration * (60000 / bpm)
    startRef.current = performance.now()
    const tick = (now: number) => {
      const p = Math.min((now - startRef.current!) / totalMs, 1)
      setProgress(p)
      if (p < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [isActive, duration, bpm])

  const elapsedBeats = progress * duration
  const full = Math.floor(duration)
  const half = duration % 1 >= 0.5

  return (
    <span
      className={`flex items-center transition-opacity duration-100 ${isActive ? 'opacity-80' : 'opacity-25'} ${className}`}
      style={{ gap: Math.max(3, size / 2) }}
    >
      {Array.from({ length: Math.min(full, 8) }, (_, i) => {
        const p = isActive ? Math.max(0, Math.min(1, elapsedBeats - i)) : 0
        const clipId = `dc-${uid}-${i}`
        return (
          <svg key={i} width={size} height={size} viewBox="0 0 6 6">
            {p > 0 && (
              <defs>
                <clipPath id={clipId}>
                  <rect x="0" y="0" width={p * 6} height="6" />
                </clipPath>
              </defs>
            )}
            <circle cx="3" cy="3" r="2.5" fill="none" stroke="currentColor" strokeWidth="0.8" />
            {p > 0 && <circle cx="3" cy="3" r="3" fill="currentColor" clipPath={`url(#${clipId})`} />}
          </svg>
        )
      })}
      {half && (() => {
        const p = isActive ? Math.max(0, Math.min(1, (elapsedBeats - full) / 0.5)) : 0
        const clipId = `dc-${uid}-h`
        return (
          <svg width={size} height={size} viewBox="0 0 6 6">
            {p > 0 && (
              <defs>
                <clipPath id={clipId}>
                  <rect x="0" y="0" width={p * 3} height="6" />
                </clipPath>
              </defs>
            )}
            <circle cx="3" cy="3" r="2.5" fill="none" stroke="currentColor" strokeWidth="0.8" />
            <path d="M3,0.5 A2.5,2.5 0 0,1 3,5.5 Z" fill="none" stroke="currentColor" strokeWidth="0.4" />
            {p > 0 && <path d="M3,0.5 A2.5,2.5 0 0,1 3,5.5 Z" fill="currentColor" clipPath={`url(#${clipId})`} />}
          </svg>
        )
      })()}
    </span>
  )
}
