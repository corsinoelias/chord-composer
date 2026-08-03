import { Repeat } from 'lucide-react';

interface SectionMarker {
  sectionIndex: number;
  name: string;
  startPercent: number;
}

interface SongSectionsTabProps {
  sectionMarkers: SectionMarker[];
  activeSectionIndex: number | null;
  onSeekSection: (si: number) => void;
  isPlaying: boolean;
  isLoopingSection: boolean;
  onToggleLoop: () => void;
}

// Grid of section cards — tap to jump/play, Loop toggle only on the currently active section
// (mirrors the existing bottom-bar's Repeat button, which is also disabled unless playing and
// only ever loops whichever section is currently sounding — no new semantics here, just a
// roomier touch-friendly re-presentation of the same handlers SongPlayerBar already receives).
export function SongSectionsTab({
  sectionMarkers,
  activeSectionIndex,
  onSeekSection,
  isPlaying,
  isLoopingSection,
  onToggleLoop,
}: SongSectionsTabProps) {
  if (sectionMarkers.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">Esta canción no tiene secciones.</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {sectionMarkers.map(m => {
        const isActive = m.sectionIndex === activeSectionIndex;
        return (
          <button
            key={m.sectionIndex}
            type="button"
            onClick={() => onSeekSection(m.sectionIndex)}
            className={`relative h-20 rounded-2xl border px-3 py-2.5 text-left transition-colors
              ${isActive
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-secondary/40 text-foreground hover:bg-secondary/70'
              }
            `}
          >
            <span className="block text-xs font-bold uppercase tracking-wide truncate pr-7">{m.name}</span>
            {isActive && isPlaying && (
              <span className="mt-1.5 flex items-end gap-0.5 h-2.5" aria-hidden="true">
                <span className="w-0.5 h-1.5 rounded-full bg-primary motion-safe:animate-pulse motion-reduce:animate-none" style={{ animationDelay: '0ms' }} />
                <span className="w-0.5 h-2.5 rounded-full bg-primary motion-safe:animate-pulse motion-reduce:animate-none" style={{ animationDelay: '200ms' }} />
                <span className="w-0.5 h-2 rounded-full bg-primary motion-safe:animate-pulse motion-reduce:animate-none" style={{ animationDelay: '400ms' }} />
              </span>
            )}
            {isActive && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onToggleLoop(); }}
                disabled={!isPlaying}
                title={isLoopingSection ? 'Dejar de repetir esta sección' : 'Repetir esta sección'}
                className={`absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full transition-colors disabled:opacity-30 disabled:cursor-not-allowed
                  ${isLoopingSection ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent/70'}
                `}
              >
                <Repeat className="w-3.5 h-3.5" />
              </button>
            )}
          </button>
        );
      })}
    </div>
  );
}
