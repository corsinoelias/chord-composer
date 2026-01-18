/**
 * Countdown Overlay Component
 * 
 * Displays a 4-count visual countdown before playback starts
 * Synced with the metronome click
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getAudioContext } from '@/lib/audioEngine';

interface CountdownOverlayProps {
  bpm: number;
  onComplete: () => void;
  onCancel: () => void;
}

export function CountdownOverlay({ bpm, onComplete, onCancel }: CountdownOverlayProps) {
  const [count, setCount] = useState(4);
  const [isAnimating, setIsAnimating] = useState(false);
  const beatInterval = (60 / bpm) * 1000; // ms per beat
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Play metronome click
  const playClick = useCallback((isDownbeat: boolean) => {
    if (!audioContextRef.current) {
      audioContextRef.current = getAudioContext();
    }
    
    const ctx = audioContextRef.current;
    const now = ctx.currentTime;
    
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.value = isDownbeat ? 1000 : 800;
    
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start(now);
    osc.stop(now + 0.1);
  }, []);

  useEffect(() => {
    // Initialize audio context
    audioContextRef.current = getAudioContext();
    
    // Play first click immediately
    playClick(true);
    setIsAnimating(true);
    
    let currentCount = 4;
    
    intervalRef.current = setInterval(() => {
      currentCount--;
      
      if (currentCount <= 0) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
        onComplete();
      } else {
        playClick(false);
        setCount(currentCount);
        setIsAnimating(false);
        // Trigger animation
        requestAnimationFrame(() => setIsAnimating(true));
      }
    }, beatInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [beatInterval, onComplete, playClick]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape' || e.code === 'Space') {
        e.preventDefault();
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
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
          className={`
            text-[200px] font-bold leading-none text-primary
            transition-all duration-150
            ${isAnimating ? 'scale-100 opacity-100' : 'scale-150 opacity-0'}
          `}
        >
          {count}
        </div>
        <p className="mt-4 text-lg text-muted-foreground">
          Press <kbd className="px-2 py-1 rounded bg-muted font-mono">Esc</kbd> to cancel
        </p>
      </div>
    </div>
  );
}
