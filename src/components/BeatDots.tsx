import { useEffect, useRef, useState } from 'react';

interface BeatDotsProps {
  /** Beats the chord lasts. */
  duration: number;
  isActive: boolean;
  bpm: number;
  /**
   * Changes on every new chord *instance*, even repeats of the same chord at the same
   * position, so the fill restarts. Pass the raw, ever-increasing playback index.
   */
  rawIndex: number | string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * The row of beat dots under a chord, filling left to right as the chord sounds.
 *
 * It animates itself off `requestAnimationFrame` rather than off the playback step, for
 * the same reason DurationDots does: reading the 16th-note step anywhere near the editor
 * tree re-renders it ~6.7 times a second, which is what made the audio crackle.
 */
export function BeatDots({ duration, isActive, bpm, rawIndex, className = '', style }: BeatDotsProps) {
  const [elapsedBeats, setElapsedBeats] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);

  // `duration`/`bpm` are deliberately out of the deps: the engine captures both once per
  // scheduled segment, so a live tempo tweak must not resnap a chord already sounding.
  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (!isActive) {
      setElapsedBeats(0);
      return;
    }
    const totalMs = duration * (60000 / bpm);
    startRef.current = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - startRef.current!) / totalMs, 1);
      setElapsedBeats(p * duration);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isActive, rawIndex]);

  const dots = Math.min(Math.max(1, Math.ceil(duration)), 8);

  return (
    <span className={`cp-dots ${className}`} style={style} aria-hidden="true">
      {Array.from({ length: dots }).map((_, i) => (
        <i key={i} className={isActive && elapsedBeats > i ? 'cp-f' : ''} />
      ))}
    </span>
  );
}
