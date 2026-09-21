import { memo, useMemo } from 'react';
import { type Section } from '@/lib/sections';

interface ProgressBarProps {
  sections: Section[];
  currentChordIndex: number;
  isPlaying: boolean;
  loopingSectionIndex: number | null;
}

/**
 * The hairline that sits along the bottom edge of the player header.
 *
 * It used to be a card of its own above the transport, repeating the section and chord
 * names; the structure bar now carries all of that — where you are, how far in, what is
 * looping — so this is only the thin bleed of progress under the toolbar.
 */
export const ProgressBar = memo(function ProgressBar({
  sections,
  currentChordIndex,
  isPlaying,
  loopingSectionIndex,
}: ProgressBarProps) {
  const progress = useMemo(() => {
    if (!isPlaying || currentChordIndex < 0) return 0;

    if (loopingSectionIndex !== null) {
      const section = sections[loopingSectionIndex];
      if (!section || section.chords.length === 0) return 0;
      const span = section.chords.length * section.repeatCount;
      let offset = 0;
      for (let i = 0; i < loopingSectionIndex; i++) {
        offset += sections[i].chords.length * sections[i].repeatCount;
      }
      return ((((currentChordIndex - offset) % span) + span) % span + 1) / span;
    }

    const total = sections.reduce((sum, s) => sum + s.chords.length * s.repeatCount, 0);
    return total > 0 ? (currentChordIndex + 1) / total : 0;
  }, [sections, currentChordIndex, isPlaying, loopingSectionIndex]);

  return (
    <div
      className="absolute inset-x-0 -bottom-px h-[3px]"
      style={{ background: 'var(--cp-s3)' }}
      aria-hidden="true"
    >
      <div
        className="h-[3px] transition-[width] duration-200 ease-out"
        style={{ width: `${Math.min(100, progress * 100)}%`, background: 'var(--cp-ac)' }}
      />
    </div>
  );
});
