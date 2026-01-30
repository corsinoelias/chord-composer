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

  // Play metronome click - louder and using proper audio scheduling
  const playClick = useCallback((isDownbeat: boolean) => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = getAudioContext();
      }
      
      const ctx = audioContextRef.current;
      
      // Resume context if suspended (required for user interaction)
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      
      const now = ctx.currentTime;
      
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      // Higher pitch for better audibility: 1200Hz for downbeat, 900Hz for others
      osc.frequency.value = isDownbeat ? 1200 : 900;
      
      // Louder volume: 0.6 for downbeat, 0.45 for others
      const volume = isDownbeat ? 0.6 : 0.45;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(volume, now + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(now);
      osc.stop(now + 0.15);
    } catch (err) {
      console.warn('Countdown click failed:', err);
    }
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
