/**
 * Beat Indicator Component
 * 
 * Visual indicator that pulses with the beat during playback
 * Shows 4 dots representing the current beat in a 4/4 bar
 * Uses immediate visual updates for tight audio sync
 */

import { memo } from 'react';

interface BeatIndicatorProps {
  currentStep: number; // 0-15 for 16th notes
  isPlaying: boolean;
  bpm?: number; // Optional, kept for API compatibility
}

export const BeatIndicator = memo(function BeatIndicator({
  currentStep,
  isPlaying,
}: BeatIndicatorProps) {
  // Convert 16th note step to quarter note beat (0-3)
  const currentBeat = Math.floor((currentStep % 16) / 4);
  
  if (!isPlaying) {
    return (
      <div className="flex items-center gap-1.5">
        {[0, 1, 2, 3].map((beat) => (
          <div
            key={beat}
            className="w-2.5 h-2.5 rounded-full bg-muted-foreground/20"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      {[0, 1, 2, 3].map((beat) => {
        const isActive = beat === currentBeat;
        const isFirstBeat = beat === 0;
        
        return (
          <div
            key={beat}
            className={`w-2.5 h-2.5 rounded-full ${
              isActive 
                ? isFirstBeat 
                  ? 'bg-primary shadow-[0_0_6px_hsl(var(--primary)/0.6)]' 
                  : 'bg-primary/70'
                : 'bg-muted-foreground/20'
            }`}
          />
        );
      })}
    </div>
  );
});
