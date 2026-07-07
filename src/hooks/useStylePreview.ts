/**
 * Style Preview Hook
 * Provides audio preview functionality for rhythm styles
 */

import { useRef, useCallback, useState } from 'react';
import { type StylePattern, getSlotsPerBar } from '@/lib/styles';
import { ensureSamplesLoaded, scheduleProgression, stopPlayback } from '@/lib/audioEngine';
import { getDefaultInstrumentStates } from '@/lib/instruments';
import { resolveVariation } from '@/lib/bassScale';
import { getEffectiveInstruments } from '@/hooks/useStyleInstruments';

export function useStylePreview() {
  const [previewingStyleId, setPreviewingStyleId] = useState<string | null>(null);
  const previewRef = useRef<{ cancel: () => void } | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPreview = useCallback(() => {
    const hadPreview = !!previewRef.current || !!timeoutRef.current;

    if (previewRef.current) {
      previewRef.current.cancel();
      previewRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    // IMPORTANT: Only stop the global audio engine if we actually started a preview.
    // Otherwise this would silence the main playback just because the modal closed.
    if (hadPreview) {
      stopPlayback();
    }

    setPreviewingStyleId(null);
  }, []);

  const previewStyle = useCallback(async (style: StylePattern) => {
    // Stop any existing preview
    stopPreview();
    
    setPreviewingStyleId(style.id);
    
    // Ensure samples are loaded before starting preview
    await ensureSamplesLoaded();

    // Create a test section with a single chord spanning exactly one bar of
    // this style's actual meter (3 beats for 6/8, not always 4) so the loop
    // point doesn't drift out of sync with the pattern's own bar length.
    const beatsPerBar = getSlotsPerBar(style) / 4;
    const testSection = {
      id: 'preview',
      name: 'Preview',
      chords: [{ id: '1', root: 'C' as const, accidental: '' as const, quality: 'maj' as const, duration: beatsPerBar }],
      repeatCount: 1
    };

    // Apply the style's own instrument sound types (e.g. 'electric' guitar) — without this,
    // every instrument falls back to its generic default sound (guitar defaults to a soundfont
    // patch that loads over the network and can miss playback entirely).
    const instruments = getEffectiveInstruments(getDefaultInstrumentStates(), style);

    const { cancel } = scheduleProgression([testSection], style.bpm, {
      loop: true,
      metronome: false,
      instruments,
      style,
      transposition: 0,
      onChordChange: () => {},
      onLoopEnd: () => {},
      getStyle: () => style,
      getBassScale: () => resolveVariation(style.melodic?.bass, undefined),
      getPianoScale: () => resolveVariation(style.melodic?.piano, undefined),
      getGuitarScale: () => resolveVariation(style.melodic?.guitar, undefined),
    });

    previewRef.current = { cancel };

    // Auto-stop after 2 bars of this style's actual meter (e.g. 3 beats/bar in
    // 6/8, not always 4).
    const barDuration = (60 / style.bpm) * beatsPerBar * 2; // 2 bars in seconds
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
