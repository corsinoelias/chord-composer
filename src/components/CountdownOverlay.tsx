/**
 * Countdown Overlay Component
 *
 * Shows the count-in the engine is playing: the beats left, read from the engine's own state,
 * which counts them on the same sample clock as the song, with the cowbell on each beat — so
 * the number, the sound and the song's first downbeat can never drift apart, as they did when
 * this was a page timer of its own that started the song when it ran out. Closes when the
 * song begins.
 */

import { useState, useEffect, useRef } from 'react';
import { startedAppEngine } from '@/lib/appEngine/player';

interface CountdownOverlayProps {
  onComplete: () => void;
  onCancel: () => void;
}

/** The engine not having started counting by then means it could not: close rather than hang. */
const GIVE_UP_MS = 15000;

export function CountdownOverlay({ onComplete, onCancel }: CountdownOverlayProps) {
  // null until the engine is ready and counting (the first time it may still be loading).
  const [count, setCount] = useState<number | null>(null);
  const counted = useRef(false);

  useEffect(() => {
    let raf = 0;
    const began = performance.now();
    const tick = () => {
      const state = startedAppEngine()?.state;
      if (state?.playing && state.countInBeats > 0) {
        counted.current = true;
        setCount(prev => (prev === state.countInBeats ? prev : state.countInBeats));
      } else if (state?.playing && counted.current) {
        onComplete();
        return;
      }
      if (performance.now() - began > GIVE_UP_MS) {
        onComplete();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [onComplete]);

  // Escape or Space cancels.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape' || e.code === 'Space') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div className="text-center">
        <div
          key={count ?? 'wait'}
          className="text-[200px] font-bold leading-none text-primary animate-in zoom-in-50 fade-in duration-150"
          aria-live="assertive"
          data-countdown
        >
          {count ?? '·'}
        </div>
        <p className="mt-4 text-lg text-muted-foreground">
          Press <kbd className="px-2 py-1 rounded bg-muted font-mono">Esc</kbd> to cancel
        </p>
      </div>
    </div>
  );
}
