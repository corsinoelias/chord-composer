import { Play, Square, Repeat } from 'lucide-react';
import { parseChordString } from '@/lib/chordParser';
import { playChordPreview } from '@/lib/audioEngine';
import { analytics } from '@/lib/analytics';

export interface ChordOnlyRow {
  sectionIndex: number;
  name: string;
  repeatCount: number;
  chords: { chord: string; globalIndex: number }[];
}

interface SongChordsOnlyChartProps {
  rows: ChordOnlyRow[];
  activeSectionIndex: number | null;
  activeGlobal: number;
  isPlaying: boolean;
  isLoading: boolean;
  loopTargetIndex: number | null;
  onPlaySection: (si: number) => void;
  onToggleLoop: (si: number) => void;
  isSectionPlaying: (si: number) => boolean;
  songSlug: string;
}

// The whole arrangement as chord-only rows — one screen, no lyrics, the way a player who
// already knows the words reads a chart. Chords wrap in a plain flex grid rather than a fixed
// 8-column bar grid: real songs don't reliably chunk into 8-beat rows, and the codebase has no
// time-signature field to do true bar math safely (only a per-chord `duration` in beats).
export function SongChordsOnlyChart({
  rows,
  activeSectionIndex,
  activeGlobal,
  isPlaying,
  isLoading,
  loopTargetIndex,
  onPlaySection,
  onToggleLoop,
  isSectionPlaying,
  songSlug,
}: SongChordsOnlyChartProps) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-6">This song has no chords.</p>;
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border">
      {rows.map(row => {
        const isActive = row.sectionIndex === activeSectionIndex;
        const isLooping = row.sectionIndex === loopTargetIndex;
        const playing = isSectionPlaying(row.sectionIndex);
        return (
          <div key={row.sectionIndex} className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-3 sm:px-4 py-3 ${isActive ? 'bg-primary/5' : ''}`}>
            <div className="flex items-center gap-1.5 w-full sm:w-auto sm:min-w-[130px] shrink-0">
              <span className={`text-[11px] font-bold uppercase tracking-widest ${isActive ? 'text-primary' : 'text-muted-foreground'}`}>
                {row.name}
              </span>
              {row.repeatCount > 1 && (
                <span className="text-[9.5px] font-bold text-primary/80 bg-primary/10 border border-primary/20 rounded-full px-1.5 py-0.5">
                  ×{row.repeatCount}
                </span>
              )}
              <div className="ml-auto sm:ml-1.5 flex items-center gap-0.5">
                <button
                  onClick={() => onPlaySection(row.sectionIndex)}
                  disabled={isLoading}
                  title={playing ? 'Stop' : `Play ${row.name}`}
                  className={`flex items-center justify-center w-6 h-6 rounded-md transition-all
                    ${playing ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-primary hover:bg-primary/10'}
                  `}
                >
                  {playing ? <Square className="w-2.5 h-2.5" /> : <Play className="w-2.5 h-2.5" />}
                </button>
                <button
                  onClick={() => onToggleLoop(row.sectionIndex)}
                  aria-pressed={isLooping}
                  title={isLooping ? `Stop looping ${row.name}` : `Loop ${row.name}`}
                  className={`flex items-center justify-center w-6 h-6 rounded-md transition-all
                    ${isLooping ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-primary hover:bg-primary/10'}
                  `}
                >
                  <Repeat className="w-2.5 h-2.5" />
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1.5 flex-1 min-w-0">
              {row.chords.map((c, i) => {
                const isActiveChord = isPlaying && c.globalIndex === activeGlobal;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      const parsed = parseChordString(c.chord);
                      if (parsed[0]) {
                        analytics.playChordPreview(songSlug, c.chord, 'chart');
                        playChordPreview(parsed[0]);
                      }
                    }}
                    className={`font-mono text-sm font-bold px-1.5 py-0.5 rounded transition-all
                      ${isActiveChord ? 'text-primary bg-primary/15 scale-105' : 'text-primary/70 hover:text-primary hover:bg-primary/10'}
                    `}
                    style={{ fontFamily: 'var(--font-mono, monospace)' }}
                  >
                    {c.chord}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
