import { memo, useMemo, useRef } from 'react';
import { type Section } from '@/lib/sections';
import { chordPosition, useGlide } from '@/lib/playbackPosition';

interface ProgressBarProps {
  sections: Section[];
  currentChordIndex: number;
  isPlaying: boolean;
  loopingSectionIndex: number | null;
  bpm: number;
}

/**
 * The hairline that sits along the bottom edge of the player header.
 *
 * It glides through each chord in time with the music instead of stepping once per chord:
 * each chord change sets where the bar is and where it will be when the chord ends, and
 * the frames in between are drawn straight onto the element (see useGlide).
 */
export const ProgressBar = memo(function ProgressBar({
  sections,
  currentChordIndex,
  isPlaying,
  loopingSectionIndex,
  bpm,
}: ProgressBarProps) {
  const fillRef = useRef<HTMLDivElement>(null);

  const tween = useMemo(() => {
    if (!isPlaying) return null;
    const pos = chordPosition(sections, currentChordIndex, loopingSectionIndex);
    if (!pos || pos.totalBeats <= 0) return null;
    const start = pos.sectionStartInSong + pos.chordStartInSection;
    return {
      key: currentChordIndex,
      from: start / pos.totalBeats,
      to: (start + pos.chordBeats) / pos.totalBeats,
      ms: (pos.chordBeats * 60000) / bpm,
    };
    // bpm is read when a chord starts; a tempo change mid-chord takes effect on the next.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections, currentChordIndex, isPlaying, loopingSectionIndex]);

  useGlide(tween, (v) => {
    if (fillRef.current) fillRef.current.style.width = `${Math.min(100, v * 100)}%`;
  });

  return (
    <div
      className="absolute inset-x-0 -bottom-px h-[3px]"
      style={{ background: 'var(--cp-s3)' }}
      aria-hidden="true"
    >
      <div ref={fillRef} className="h-[3px]" style={{ width: 0, background: 'var(--cp-ac)' }} />
    </div>
  );
});
