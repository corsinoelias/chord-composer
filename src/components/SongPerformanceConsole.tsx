import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { SongSectionsTab } from '@/components/SongSectionsTab';
import { SongMixerTab } from '@/components/SongMixerTab';
import { SongTempoTab } from '@/components/SongTempoTab';
import type { InstrumentState } from '@/lib/instruments';

interface SectionMarker {
  sectionIndex: number;
  name: string;
  startPercent: number;
}

interface SongPerformanceConsoleProps {
  open: boolean;

  // Sections — always visible
  sectionMarkers: SectionMarker[];
  activeSectionIndex: number | null;
  onSeekSection: (si: number) => void;
  queuedSectionIndex: number | null;
  isPlaying: boolean;
  isLoading: boolean;
  loopTargetIndex: number | null;
  onToggleLoop: (si?: number) => void;
  isSoloSection: boolean;
  activeSectionSpanStart: number;
  activeSectionSpanLength: number;

  // Mixer — collapsed by default, its own small toggle (not a tab of equal rank)
  instruments: InstrumentState[];
  onInstrumentsChange: (next: InstrumentState[]) => void;
  hasVocalTrack: boolean;
  vocalMuted: boolean;
  vocalVolume: number;
  onVocalMutedChange: (muted: boolean) => void;
  onVocalVolumeChange: (volume: number) => void;
  vocalForcedMuted: boolean;

  // Pitch & BPM — always visible, at the bottom
  bpm: number;
  originalBpm: number;
  onBpmChange: (bpm: number) => void;
  transpose: number;
  onTransposeChange: (t: number) => void;
  songKey: string;
  metronome: boolean;
  onMetronomeChange: (enabled: boolean) => void;
}

// The mobile performance console's expanding panel — anchored above SongPlayerBar's collapsed
// bar (which renders this component and owns `open`), not a modal/drawer/overlay. Animates via
// CSS grid-rows (0fr <-> 1fr), which handles this panel's variable content height without any
// JS measurement or fixed max-height guess.
export function SongPerformanceConsole({
  open,
  sectionMarkers,
  activeSectionIndex,
  onSeekSection,
  queuedSectionIndex,
  isPlaying,
  isLoading,
  loopTargetIndex,
  onToggleLoop,
  isSoloSection,
  activeSectionSpanStart,
  activeSectionSpanLength,
  instruments,
  onInstrumentsChange,
  hasVocalTrack,
  vocalMuted,
  vocalVolume,
  onVocalMutedChange,
  onVocalVolumeChange,
  vocalForcedMuted,
  bpm,
  originalBpm,
  onBpmChange,
  transpose,
  onTransposeChange,
  songKey,
  metronome,
  onMetronomeChange,
}: SongPerformanceConsoleProps) {
  const [mixerOpen, setMixerOpen] = useState(false);

  return (
    <div
      id="song-performance-console"
      className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none rounded-t-[26px] bg-background border-x border-t border-border ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr] border-transparent'}`}
    >
      <div className="overflow-hidden min-h-0">
        <div className="max-h-[65vh] overflow-y-auto px-4 pt-4 pb-3">
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Sections</span>
          <div className="mt-2.5">
            <SongSectionsTab
              sectionMarkers={sectionMarkers}
              activeSectionIndex={activeSectionIndex}
              onSeekSection={onSeekSection}
              queuedSectionIndex={queuedSectionIndex}
              isPlaying={isPlaying}
              isLoading={isLoading}
              loopTargetIndex={loopTargetIndex}
              onToggleLoop={onToggleLoop}
              isSoloSection={isSoloSection}
              activeSectionSpanStart={activeSectionSpanStart}
              activeSectionSpanLength={activeSectionSpanLength}
            />
          </div>

          <button
            type="button"
            onClick={() => setMixerOpen(v => !v)}
            aria-expanded={mixerOpen}
            aria-controls="song-mixer-tab"
            className="flex items-center justify-between w-full mt-5"
          >
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Mixer</span>
            <span className="w-[26px] h-[26px] flex items-center justify-center rounded-full bg-secondary/60">
              <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-250 motion-reduce:transition-none ${mixerOpen ? 'rotate-180' : ''}`} />
            </span>
          </button>
          <div
            id="song-mixer-tab"
            className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${mixerOpen ? 'grid-rows-[1fr] mt-3' : 'grid-rows-[0fr]'}`}
          >
            <div className="overflow-hidden min-h-0">
              <SongMixerTab
                instruments={instruments}
                onInstrumentsChange={onInstrumentsChange}
                hasVocalTrack={hasVocalTrack}
                vocalMuted={vocalMuted}
                vocalVolume={vocalVolume}
                onVocalMutedChange={onVocalMutedChange}
                onVocalVolumeChange={onVocalVolumeChange}
                vocalForcedMuted={vocalForcedMuted}
              />
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-border">
            <SongTempoTab
              bpm={bpm}
              originalBpm={originalBpm}
              onBpmChange={onBpmChange}
              transpose={transpose}
              onTransposeChange={onTransposeChange}
              songKey={songKey}
              metronome={metronome}
              onMetronomeChange={onMetronomeChange}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
