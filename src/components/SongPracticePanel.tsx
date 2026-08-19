import { Download, ExternalLink, Loader2 } from 'lucide-react';
import { SongSectionsTab } from '@/components/SongSectionsTab';
import { SongMixerTab } from '@/components/SongMixerTab';
import { SongTempoTab } from '@/components/SongTempoTab';
import { analytics } from '@/lib/analytics';
import type { InstrumentState } from '@/lib/instruments';

interface SectionMarker {
  sectionIndex: number;
  name: string;
  startPercent: number;
}

interface SongPracticePanelProps {
  open: boolean;

  // Sections
  sectionMarkers: SectionMarker[];
  activeSectionIndex: number | null;
  onSelectSection: (si: number) => void;
  queuedSectionIndex: number | null;
  isPlaying: boolean;
  loopTargetIndex: number | null;
  onToggleLoop: (si: number) => void;
  isLoading: boolean;
  isSoloSection: boolean;
  activeSectionSpanStart: number;
  activeSectionSpanLength: number;

  // Mixer
  instruments: InstrumentState[];
  onInstrumentsChange: (next: InstrumentState[]) => void;
  hasVocalTrack: boolean;
  vocalMuted: boolean;
  vocalVolume: number;
  onVocalMutedChange: (muted: boolean) => void;
  onVocalVolumeChange: (volume: number) => void;
  vocalForcedMuted: boolean;

  // Tempo & key
  bpm: number;
  originalBpm: number;
  onBpmChange: (bpm: number) => void;
  transpose: number;
  onTransposeChange: (t: number) => void;
  songKey: string;
  metronome: boolean;
  onMetronomeChange: (enabled: boolean) => void;

  // Export
  songSlug: string;
  allChordsCount: number;
  isExportingWav: boolean;
  onExportWav: () => void;
  onExportMidi: () => void;
  editorUrl: string;
  showWavExport: boolean;
}

function PanelCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card px-3.5 pt-2.5 pb-3">
      <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">{title}</h2>
      {children}
    </section>
  );
}

// The one "advanced controls" surface, opened on demand from the header's Practice button —
// same component at every breakpoint. Expands/collapses in normal document flow (CSS
// grid-template-rows 0fr<->1fr, no measured heights) directly under the header transport, so it
// is never an overlay and never a new piece of fixed chrome.
export function SongPracticePanel({
  open,
  sectionMarkers,
  activeSectionIndex,
  onSelectSection,
  queuedSectionIndex,
  isPlaying,
  loopTargetIndex,
  onToggleLoop,
  isLoading,
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
  songSlug,
  allChordsCount,
  isExportingWav,
  onExportWav,
  onExportMidi,
  editorUrl,
  showWavExport,
}: SongPracticePanelProps) {
  return (
    <div
      id="song-practice-panel"
      className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none mt-3 ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
    >
      <div className="overflow-hidden min-h-0">
        <div className="flex flex-col gap-3 pb-1">
          <PanelCard title="Sections">
            <SongSectionsTab
              sectionMarkers={sectionMarkers}
              activeSectionIndex={activeSectionIndex}
              onSeekSection={onSelectSection}
              queuedSectionIndex={queuedSectionIndex}
              isPlaying={isPlaying}
              isLoading={isLoading}
              loopTargetIndex={loopTargetIndex}
              onToggleLoop={onToggleLoop}
              isSoloSection={isSoloSection}
              activeSectionSpanStart={activeSectionSpanStart}
              activeSectionSpanLength={activeSectionSpanLength}
            />
          </PanelCard>

          <PanelCard title="Mixer">
            <SongMixerTab
              compact
              instruments={instruments}
              onInstrumentsChange={onInstrumentsChange}
              hasVocalTrack={hasVocalTrack}
              vocalMuted={vocalMuted}
              vocalVolume={vocalVolume}
              onVocalMutedChange={onVocalMutedChange}
              onVocalVolumeChange={onVocalVolumeChange}
              vocalForcedMuted={vocalForcedMuted}
            />
          </PanelCard>

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

          <PanelCard title="Export & editor">
            <div className="flex flex-wrap items-center gap-2">
              {showWavExport && (
                <button
                  onClick={onExportWav}
                  disabled={isExportingWav || allChordsCount === 0}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isExportingWav ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                  WAV
                </button>
              )}
              <button
                onClick={onExportMidi}
                disabled={allChordsCount === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Download className="w-3 h-3" />
                MIDI
              </button>
              <a
                href={editorUrl}
                onClick={() => analytics.songEditorOpened(songSlug, 'practice_panel')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-primary hover:text-primary/80 hover:bg-primary/5 transition-colors ml-auto"
              >
                Open in Chord Player
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </PanelCard>
        </div>
      </div>
    </div>
  );
}
