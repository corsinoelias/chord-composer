import { memo, useMemo, useEffect, useState } from 'react';
import { type Section } from '@/lib/sections';
import { formatChord } from '@/lib/musicTheory';

interface ProgressBarProps {
  sections: Section[];
  currentChordIndex: number;
  isPlaying: boolean;
  loopingSectionIndex: number | null;
}

export const ProgressBar = memo(function ProgressBar({
  sections,
  currentChordIndex,
  isPlaying,
  loopingSectionIndex,
}: ProgressBarProps) {
  // Smooth progress animation
  const [displayProgress, setDisplayProgress] = useState(0);

  // Calculate total chords and current position
  const { totalChords, currentSection, currentChord, targetProgress } = useMemo(() => {
    let total = 0;
    let currentSec = '';
    let currentCh = '';
    
    // Calculate based on looping or full play
    if (loopingSectionIndex !== null) {
      const section = sections[loopingSectionIndex];
      if (section) {
        total = section.chords.length * section.repeatCount;
        currentSec = section.name;
        const localIndex = currentChordIndex >= 0 ? currentChordIndex % section.chords.length : -1;
        if (localIndex >= 0 && section.chords[localIndex]) {
          currentCh = formatChord(section.chords[localIndex]);
        }
      }
    } else {
      for (const section of sections) {
        total += section.chords.length * section.repeatCount;
      }
      
      // Find current section and chord
      if (currentChordIndex >= 0) {
        let offset = 0;
        for (const section of sections) {
          const sectionTotal = section.chords.length * section.repeatCount;
          if (currentChordIndex < offset + sectionTotal) {
            currentSec = section.name;
            const localIndex = (currentChordIndex - offset) % section.chords.length;
            if (section.chords[localIndex]) {
              currentCh = formatChord(section.chords[localIndex]);
            }
            break;
          }
          offset += sectionTotal;
        }
      }
    }
    
    const prog = total > 0 && currentChordIndex >= 0 
      ? ((currentChordIndex + 1) / total) * 100 
      : 0;
    
    return { 
      totalChords: total, 
      currentSection: currentSec, 
      currentChord: currentCh,
      targetProgress: prog,
    };
  }, [sections, currentChordIndex, loopingSectionIndex]);

  // Animate progress smoothly
  useEffect(() => {
    setDisplayProgress(targetProgress);
  }, [targetProgress]);

  if (!isPlaying) return null;

  return (
    <div className="bg-card/80 backdrop-blur-sm border border-border/50 rounded-lg px-3 py-2 animate-in fade-in duration-200">
      <div className="flex items-center justify-between text-xs sm:text-sm mb-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          {currentSection && (
            <span className="font-medium text-muted-foreground truncate">{currentSection}</span>
          )}
          {currentChord && (
            <>
              <span className="text-muted-foreground">•</span>
              <span className="font-mono font-semibold text-foreground">{currentChord}</span>
            </>
          )}
        </div>
        <span className="text-muted-foreground/70 tabular-nums text-xs ml-2">
          {currentChordIndex + 1} / {totalChords}
        </span>
      </div>
      
      <div className="h-1 bg-secondary/50 rounded-full overflow-hidden">
        <div
          className="h-full bg-primary/80 rounded-full transition-[width] duration-200 ease-out"
          style={{ width: `${displayProgress}%` }}
        />
      </div>
    </div>
  );
});
