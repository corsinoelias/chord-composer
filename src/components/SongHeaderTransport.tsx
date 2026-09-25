import { Play, Square, Loader2, ChevronDown } from 'lucide-react';

interface SongHeaderTransportProps {
  isPlaying: boolean;
  isLoading: boolean;
  onPlayPause: () => void;
  practiceOpen: boolean;
  onTogglePractice: () => void;
  // Off since the Sep 2026 redesign moved Practice into the bottom bar; see songPageFlags.ts.
  showPractice?: boolean;
}

// The header's whole transport: Play/Stop plus the door into everything else (Sections, Mixer,
// Tempo, Metronome, Export). Lives in the document header (scrolls away with it, never fixed) —
// the only place on the page besides SongPlayingPill where playback state is ever surfaced.
// No margin of its own — its portal target sits in a row shared with the song stats badges
// (see [slug].astro), which owns the spacing so the two align cleanly.
export function SongHeaderTransport({ isPlaying, isLoading, onPlayPause, practiceOpen, onTogglePractice, showPractice = true }: SongHeaderTransportProps) {
  return (
    // col-start-1 row-start-1: overlaps the shimmer placeholder in the same grid cell
    // (see the #song-header-transport comment in songs/[slug].astro) instead of
    // stacking below it as a second block row while both are briefly mounted — a
    // no-op outside that grid parent (`inline`/other callers of this component).
    <div className="col-start-1 row-start-1 flex items-center gap-2.5">
      <button
        onClick={onPlayPause}
        disabled={isLoading}
        className={`
          flex-1 sm:flex-initial inline-flex items-center justify-center gap-2.5 h-11 pl-4 pr-5 rounded-xl text-[15px] font-semibold
          transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
          disabled:opacity-50 disabled:cursor-not-allowed
          ${isPlaying
            ? 'bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/20'
            : 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/30'
          }
        `}
      >
        {isLoading
          ? <Loader2 className="w-4 h-4 animate-spin" />
          : isPlaying
            ? <><Square className="w-3.5 h-3.5 fill-current" /> Stop</>
            : <><Play className="w-4 h-4 fill-current" /> Play along</>
        }
      </button>
      {showPractice && <button
        type="button"
        onClick={onTogglePractice}
        aria-expanded={practiceOpen}
        aria-controls="song-practice-panel"
        className={`
          inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-semibold border transition-colors
          ${practiceOpen
            ? 'border-primary/30 bg-primary/10 text-primary'
            : 'border-border bg-card text-muted-foreground hover:text-foreground hover:bg-accent/40'
          }
        `}
      >
        Practice
        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-300 motion-reduce:transition-none ${practiceOpen ? 'rotate-180' : ''}`} />
      </button>}
    </div>
  );
}
