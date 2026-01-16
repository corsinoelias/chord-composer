import { memo, useMemo } from 'react';
import { Section } from '@/lib/sections';
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
  // Calculate total chords and current position
  const { totalChords, currentSection, currentChord, progress } = useMemo(() => {
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
      progress: prog,
    };
  }, [sections, currentChordIndex, loopingSectionIndex]);

  if (!isPlaying) return null;

  return (
    <div className="bg-card border border-border rounded-lg p-3 animate-in slide-in-from-top-2 duration-300">
      <div className="flex items-center justify-between text-sm mb-2">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Now playing:</span>
          {currentSection && (
            <span className="font-medium text-foreground">{currentSection}</span>
          )}
          {currentChord && (
            <>
              <span className="text-muted-foreground">•</span>
              <span className="font-mono font-bold text-primary">{currentChord}</span>
            </>
          )}
        </div>
        <span className="text-muted-foreground tabular-nums">
          {currentChordIndex + 1} / {totalChords}
        </span>
      </div>
      
      <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-300 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
});
