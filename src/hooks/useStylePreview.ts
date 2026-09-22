/**
 * Style Preview Hook
 * Provides audio preview functionality for rhythm styles: two bars of C major in the style,
 * once, on the app's engine.
 */

import { useRef, useCallback, useState } from 'react';
import { type StylePattern, getSlotsPerBar } from '@/lib/styles';
import { getDefaultInstrumentStates } from '@/lib/instruments';
import { getEffectiveInstruments } from '@/hooks/useStyleInstruments';
import { createSection } from '@/lib/sections';
import { AppPlayback } from '@/lib/appEngine/player';

export function useStylePreview() {
  const [previewingStyleId, setPreviewingStyleId] = useState<string | null>(null);
  const playbackRef = useRef<AppPlayback | null>(null);

  const stopPreview = useCallback(() => {
    // Only a preview this hook started is stopped: closing the modal must not silence the
    // song playing behind it.
    if (playbackRef.current?.active) playbackRef.current.stop();
    playbackRef.current = null;
    setPreviewingStyleId(null);
  }, []);

  const previewStyle = useCallback(async (style: StylePattern) => {
    stopPreview();
    setPreviewingStyleId(style.id);

    // One chord spanning exactly one bar of this style's own meter (3 beats for 6/8, not
    // always 4), played twice and then stopped.
    const beatsPerBar = getSlotsPerBar(style) / 4;
    const section = {
      ...createSection('Preview'),
      repeatCount: 2,
      chords: [{ id: '1', root: 'C' as const, accidental: '' as const, quality: 'maj' as const, duration: beatsPerBar }],
    };
    // The style's own sounds (e.g. 'electric' guitar), as choosing the style would give.
    const instruments = getEffectiveInstruments(getDefaultInstrumentStates(), style);

    const playback = new AppPlayback();
    playbackRef.current = playback;
    await playback.play({
      song: { sections: [section], bpm: style.bpm, instrumentSettings: instruments },
      style,
      lookup: () => undefined,
      once: true,
      onEnded: () => {
        if (playbackRef.current === playback) playbackRef.current = null;
        setPreviewingStyleId((current) => (current === style.id ? null : current));
      },
    });
  }, [stopPreview]);

  return {
    previewStyle,
    stopPreview,
    previewingStyleId,
    isPreviewPlaying: previewingStyleId !== null,
  };
}
