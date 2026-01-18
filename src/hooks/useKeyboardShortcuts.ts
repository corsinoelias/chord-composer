/**
 * Keyboard Shortcuts Hook
 * 
 * Provides keyboard shortcuts for the music editor:
 * - Space: Play/Stop
 * - Arrow keys: Navigate chords
 * - +/-: Adjust tempo
 * - M: Toggle metronome
 * - Escape: Stop playback
 */

import { useEffect, useCallback } from 'react';

interface UseKeyboardShortcutsOptions {
  isPlaying: boolean;
  bpm: number;
  onPlay: () => void;
  onStop: () => void;
  onBpmChange: (bpm: number) => void;
  onMetronomeToggle: () => void;
  onNavigateChord?: (direction: 'prev' | 'next') => void;
  enabled?: boolean;
}

export function useKeyboardShortcuts({
  isPlaying,
  bpm,
  onPlay,
  onStop,
  onBpmChange,
  onMetronomeToggle,
  onNavigateChord,
  enabled = true,
}: UseKeyboardShortcutsOptions) {
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Don't trigger shortcuts when typing in inputs
    const target = event.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    ) {
      return;
    }

    switch (event.code) {
      case 'Space':
        event.preventDefault();
        if (isPlaying) {
          onStop();
        } else {
          onPlay();
        }
        break;

      case 'Escape':
        if (isPlaying) {
          event.preventDefault();
          onStop();
        }
        break;

      case 'ArrowLeft':
        if (onNavigateChord && !isPlaying) {
          event.preventDefault();
          onNavigateChord('prev');
        }
        break;

      case 'ArrowRight':
        if (onNavigateChord && !isPlaying) {
          event.preventDefault();
          onNavigateChord('next');
        }
        break;

      case 'ArrowUp':
        event.preventDefault();
        onBpmChange(Math.min(200, bpm + 5));
        break;

      case 'ArrowDown':
        event.preventDefault();
        onBpmChange(Math.max(40, bpm - 5));
        break;

      case 'Equal': // + key
      case 'NumpadAdd':
        event.preventDefault();
        onBpmChange(Math.min(200, bpm + 5));
        break;

      case 'Minus': // - key
      case 'NumpadSubtract':
        event.preventDefault();
        onBpmChange(Math.max(40, bpm - 5));
        break;

      case 'KeyM':
        event.preventDefault();
        onMetronomeToggle();
        break;
    }
  }, [isPlaying, bpm, onPlay, onStop, onBpmChange, onMetronomeToggle, onNavigateChord]);

  useEffect(() => {
    if (!enabled) return;

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown, enabled]);
}

// Shortcut info for help display
export const SHORTCUTS = [
  { key: 'Space', description: 'Play / Stop' },
  { key: '↑ / ↓', description: 'Adjust tempo (±5 BPM)' },
  { key: '+ / -', description: 'Adjust tempo (±5 BPM)' },
  { key: 'M', description: 'Toggle metronome' },
  { key: 'Esc', description: 'Stop playback' },
] as const;
