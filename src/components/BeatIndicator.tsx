/**
 * Beat Indicator Component
 * 
 * Visual indicator that pulses with the beat during playback
 * Shows 4 dots representing the current beat in a 4/4 bar
 */

import { memo, useMemo } from 'react';

interface BeatIndicatorProps {
  currentStep: number; // 0-15 for 16th notes
  isPlaying: boolean;
  bpm: number;
}

export const BeatIndicator = memo(function BeatIndicator({
  currentStep,
  isPlaying,
  bpm,
}: BeatIndicatorProps) {
  // Convert 16th note step to quarter note beat (0-3)
  const currentBeat = Math.floor((currentStep % 16) / 4);
  
  // Animation duration based on BPM
  const beatDuration = useMemo(() => 60 / bpm, [bpm]);
  
  if (!isPlaying) {
    return (
      <div className="flex items-center gap-2">
        {[0, 1, 2, 3].map((beat) => (
          <div
            key={beat}
            className="w-3 h-3 rounded-full bg-muted-foreground/30"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {[0, 1, 2, 3].map((beat) => {
        const isActive = beat === currentBeat;
        const isFirstBeat = beat === 0;
        
        return (
          <div
            key={beat}
            className={`
              w-3 h-3 rounded-full transition-all
              ${isActive 
                ? isFirstBeat 
                  ? 'bg-primary scale-125 shadow-[0_0_8px_var(--primary)]' 
                  : 'bg-primary/80 scale-110'
                : 'bg-muted-foreground/30'
              }
            `}
            style={{
              transitionDuration: `${beatDuration * 0.1}s`,
            }}
          />
        );
      })}
    </div>
  );
});
