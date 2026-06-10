import { Play, Square, Download, ExternalLink, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import type { Song } from '@/data/songs';

interface SongPlayerBarProps {
  song: Song;
  isPlaying: boolean;
  isLoading: boolean;
  isExportingWav: boolean;
  bpm: number;
  transpose: number;
  displayKey: string;
  progress: number;
  allChordsCount: number;
  onPlayPause: () => void;
  onBpmChange: (bpm: number) => void;
  onTransposeChange: (t: number) => void;
  onExportWav: () => void;
  onExportMidi: () => void;
  editorUrl: string;
}

export function SongPlayerBar({
  song,
  isPlaying,
  isLoading,
  isExportingWav,
  bpm,
  transpose,
  displayKey,
  progress,
  allChordsCount,
  onPlayPause,
  onBpmChange,
  onTransposeChange,
  onExportWav,
  onExportMidi,
  editorUrl,
}: SongPlayerBarProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
      {/* Progress bar */}
      <div className="h-0.5 bg-muted">
        <div
          className="h-full bg-primary transition-all duration-300 ease-linear"
          style={{ width: isPlaying ? `${progress}%` : '0%' }}
        />
      </div>

      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3 sm:gap-4">

        {/* Song info */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 text-base leading-none select-none">
            🎵
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate leading-tight">{song.title}</p>
            <p className="text-xs text-muted-foreground truncate">{song.artist}</p>
          </div>
        </div>

        {/* BPM — hidden on mobile */}
        <div className="hidden sm:flex items-center gap-1 shrink-0">
          <button
            onClick={() => onBpmChange(Math.max(50, bpm - 4))}
            className="w-6 h-6 rounded text-muted-foreground hover:text-foreground hover:bg-accent/50 text-xs font-bold transition-colors"
          >−</button>
          <span className="text-xs text-muted-foreground w-14 text-center tabular-nums">{bpm} BPM</span>
          <button
            onClick={() => onBpmChange(Math.min(200, bpm + 4))}
            className="w-6 h-6 rounded text-muted-foreground hover:text-foreground hover:bg-accent/50 text-xs font-bold transition-colors"
          >+</button>
        </div>

        {/* Play / Stop */}
        <button
          onClick={onPlayPause}
          disabled={isLoading}
          className={`
            shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold
            transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
            disabled:opacity-50 disabled:cursor-not-allowed
            ${isPlaying
              ? 'bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/20'
              : 'bg-primary text-primary-foreground hover:bg-primary/90'
            }
          `}
        >
          {isLoading
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : isPlaying
              ? <><Square className="w-3.5 h-3.5 fill-current" /> Stop</>
              : <><Play className="w-3.5 h-3.5 fill-current" /> Play</>
          }
        </button>

        {/* Transpose — hidden on mobile */}
        <div className="hidden sm:flex items-center gap-1 border border-border rounded-lg px-2 py-1 bg-background shrink-0">
          <button
            onClick={() => onTransposeChange(Math.max(-6, transpose - 1))}
            disabled={transpose <= -6}
            className="w-5 h-5 rounded text-muted-foreground hover:text-foreground hover:bg-accent/50 disabled:opacity-30 text-xs font-bold transition-colors"
            title="Transpose down"
          >−</button>
          <span className="text-xs text-muted-foreground w-16 text-center select-none tabular-nums">
            {displayKey}{transpose !== 0 ? ` (${transpose > 0 ? '+' : ''}${transpose})` : ''}
          </span>
          <button
            onClick={() => onTransposeChange(Math.min(6, transpose + 1))}
            disabled={transpose >= 6}
            className="w-5 h-5 rounded text-muted-foreground hover:text-foreground hover:bg-accent/50 disabled:opacity-30 text-xs font-bold transition-colors"
            title="Transpose up"
          >+</button>
        </div>

        {/* Exports + editor — hidden on mobile */}
        <div className="hidden sm:flex items-center gap-1.5 shrink-0">
          <button
            onClick={onExportWav}
            disabled={isPlaying || isExportingWav || allChordsCount === 0}
            title="Download WAV"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isExportingWav
              ? <Loader2 className="w-3 h-3 animate-spin" />
              : <Download className="w-3 h-3" />
            }
            WAV
          </button>
          <button
            onClick={onExportMidi}
            disabled={allChordsCount === 0}
            title="Download MIDI"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download className="w-3 h-3" />
            MIDI
          </button>
          <a
            href={editorUrl}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-primary hover:text-primary/80 hover:bg-primary/5 transition-colors"
          >
            Editor
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>

      </div>
    </div>
  );
}
