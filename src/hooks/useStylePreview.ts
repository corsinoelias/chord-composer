/**
 * Style Preview Hook
 * Provides audio preview functionality for rhythm styles
 */

import { useRef, useCallback, useState } from 'react';
import { StylePattern } from '@/lib/styles';
import { getAudioContext, scheduleProgression, stopPlayback } from '@/lib/audioEngine';
import { getDefaultInstrumentStates } from '@/lib/instruments';

export function useStylePreview() {
  const [previewingStyleId, setPreviewingStyleId] = useState<string | null>(null);
  const previewRef = useRef<{ cancel: () => void } | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const stopPreview = useCallback(() => {
    if (previewRef.current) {
      previewRef.current.cancel();
      previewRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    stopPlayback();
    setPreviewingStyleId(null);
  }, []);

  const previewStyle = useCallback((style: StylePattern) => {
    // Stop any existing preview
    stopPreview();
    
    setPreviewingStyleId(style.id);
    getAudioContext();

    // Create a test section with a single chord
    const testSection = {
      id: 'preview',
      name: 'Preview',
      chords: [{ id: '1', root: 'C' as const, accidental: '' as const, quality: 'maj' as const, duration: 4 }],
      repeatCount: 1
    };

    const instruments = getDefaultInstrumentStates();

    const { cancel } = scheduleProgression([testSection], style.bpm, {
      loop: true,
      metronome: false,
      instruments,
      style,
      transposition: 0,
      onChordChange: () => {},
      onLoopEnd: () => {},
      getStyle: () => style,
    });

    previewRef.current = { cancel };

    // Auto-stop after 2 bars (8 beats)
    const barDuration = (60 / style.bpm) * 4 * 2; // 2 bars in seconds
    timeoutRef.current = setTimeout(() => {
      stopPreview();
    }, barDuration * 1000);
  }, [stopPreview]);

  return {
    previewStyle,
    stopPreview,
    previewingStyleId,
    isPreviewPlaying: previewingStyleId !== null,
  };
}
