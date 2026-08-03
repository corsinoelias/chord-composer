import { Play, Square, Download, ExternalLink, Loader2, SkipBack, SkipForward, Repeat } from 'lucide-react';
import type { Song } from '@/data/songs';
import { analytics } from '@/lib/analytics';
import { usePlayback, usePlaybackPosition } from '@/contexts/PlaybackContext';

interface SectionMarker {
  sectionIndex: number;
  name: string;
  startPercent: number;
}

interface SongPlayerBarProps {
  song: Song;
  isPlaying: boolean;
  isLoading: boolean;
  isExportingWav: boolean;
  bpm: number;
  transpose: number;
  displayKey: string;
  // Chord-count position of the currently-playing Section[]'s own start within the FULL
  // song's timeline (0 when playing/looping the full song; the song-section's offset when
  // soloing one section) — added to the live chord index so the fill always reflects where
  // that section actually sits in the song, instead of restarting from the left edge.
  baseChordOffset: number;
  totalChordSpan: number;
  allChordsCount: number;
  sectionMarkers?: SectionMarker[];
  activeSectionIndex?: number | null;
  onSeekSection?: (si: number) => void;
  canGoPrevSection?: boolean;
  canGoNextSection?: boolean;
  onPrevSection?: () => void;
  onNextSection?: () => void;
  isLoopingSection?: boolean;
  onToggleLoop?: () => void;
  onPlayPause: () => void;
  onBpmChange: (bpm: number) => void;
  onTransposeChange: (t: number) => void;
  onExportWav: () => void;
  onExportMidi: () => void;
  editorUrl: string;
  inline?: boolean;
  showWavExport?: boolean;
}

// Give each label a CSS box spanning exactly its section's slot (start → next section's
// start), so adjacent labels can never overlap regardless of name length.
function markersWithWidth(markers: SectionMarker[]) {
  return markers.map((m, i) => ({
    ...m,
    widthPercent: (i < markers.length - 1 ? markers[i + 1].startPercent : 100) - m.startPercent,
  }));
}

// Rough width of one uppercase, tracked-out 9px character as a % of the timeline — used to
// decide whether a section's own slot can fit its FULL name. Below that, the label is left
// blank (just the tick + tint band show) rather than truncated to an illegible "P…" fragment.
const PERCENT_PER_CHAR = 1.15;
const LABEL_PADDING_PERCENT = 2;
function fitsLabel(name: string, widthPercent: number) {
  return widthPercent >= name.length * PERCENT_PER_CHAR + LABEL_PADDING_PERCENT;
}

// Isolated so only this tiny div re-renders on every animation frame (usePlaybackPosition
// updates ~60x/sec) — reading it from the parent would re-render the whole player bar (and,
// if hoisted further up, the entire song chart) at that rate. No CSS transition: the value
// itself already advances continuously every frame, so animating on top would just add lag.
// Reads chordIndex+fraction as ONE combined number (not `state.currentChordIndex` plus a
// separate fraction) — those two used to update in different React commits, which produced
// a visible backward-then-forward flicker at every chord boundary.
function ProgressFill({ baseChordOffset, totalChordSpan }: { baseChordOffset: number; totalChordSpan: number }) {
  const { state } = usePlayback();
  const playbackPosition = usePlaybackPosition();
  const position = baseChordOffset + Math.max(0, playbackPosition);
  const progress = state.isPlaying && totalChordSpan > 0 ? Math.min(100, (position / totalChordSpan) * 100) : 0;
  return (
    <>
      <div className="h-full bg-primary rounded-full" style={{ width: `${progress}%` }} />
      {state.isPlaying && (
        <div
          className="absolute top-1/2 w-2 h-2 -translate-y-1/2 -translate-x-1/2 rounded-full bg-primary ring-4 ring-primary/15"
          style={{ left: `${progress}%` }}
        />
      )}
    </>
  );
}

export function SongPlayerBar({
  song,
  isPlaying,
  isLoading,
  isExportingWav,
  bpm,
  transpose,
  displayKey,
  baseChordOffset,
  totalChordSpan,
  allChordsCount,
  sectionMarkers = [],
  activeSectionIndex = null,
  onSeekSection,
  canGoPrevSection = false,
  canGoNextSection = false,
  onPrevSection,
  onNextSection,
  isLoopingSection = false,
  onToggleLoop,
  onPlayPause,
  onBpmChange,
  onTransposeChange,
  onExportWav,
  onExportMidi,
  editorUrl,
  inline = false,
  showWavExport = true,
}: SongPlayerBarProps) {
  const markers = markersWithWidth(sectionMarkers);
  const activeSectionName = sectionMarkers.find(m => m.sectionIndex === activeSectionIndex)?.name;

  return (
    <div className={`${inline ? 'border-b mb-2' : 'fixed bottom-0 left-0 right-0 z-50 border-t shadow-[0_-4px_20px_rgba(0,0,0,0.08)]'} border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80`}>
      {/* Song structure timeline — section bands/labels + progress track */}
      {sectionMarkers.length > 1 && (
        <div className="relative h-4 select-none">
          {markers.map(m => (
            <div
              key={m.sectionIndex}
              className={`absolute top-0 bottom-0 transition-colors ${activeSectionIndex === m.sectionIndex ? 'bg-primary/[0.06]' : ''}`}
              style={{ left: `${m.startPercent}%`, width: `${m.widthPercent}%` }}
            />
          ))}
          {/* The button itself always renders (tap-to-seek works on mobile too) — only its
              TEXT is `sm:`-and-up. On a real phone width a section's slot is rarely wide
              enough to fit a whole name, and the truncated "VERS…"/"CHORU…" fragments it
              leaves behind read worse than no text at all. The tick + tint band still show
              the structure, and the "now playing" line next to the song title (always
              full-width, never slot-constrained) carries the name on mobile instead. */}
          {markers.map(m => (
            <button
              key={m.sectionIndex}
              type="button"
              onClick={() => onSeekSection?.(m.sectionIndex)}
              title={m.name}
              style={{ left: `${m.startPercent}%`, width: `${m.widthPercent}%` }}
              className={`absolute top-0 overflow-hidden truncate px-1 text-left text-[9px] font-semibold uppercase tracking-wide leading-[16px] transition-colors
                ${activeSectionIndex === m.sectionIndex ? 'text-primary' : 'text-muted-foreground/70 hover:text-muted-foreground'}
              `}
            >
              <span className="hidden sm:inline">{fitsLabel(m.name, m.widthPercent) ? m.name : ''}</span>
            </button>
          ))}
        </div>
      )}
      <div className="relative h-1 rounded-full bg-muted">
        <ProgressFill baseChordOffset={baseChordOffset} totalChordSpan={totalChordSpan} />
        {sectionMarkers.slice(1).map(m => (
          <div
            key={m.sectionIndex}
            className="absolute top-0 bottom-0 w-px bg-background/70"
            style={{ left: `${m.startPercent}%` }}
          />
        ))}
      </div>

      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3 sm:gap-4">

        {/* Song info */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 text-base leading-none select-none">
            🎵
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate leading-tight">{song.title}</p>
            {isPlaying && activeSectionName ? (
              <p className="flex items-center gap-1.5 text-xs font-medium text-primary truncate">
                <span className="flex items-end gap-0.5 h-2.5 shrink-0" aria-hidden="true">
                  <span className="w-0.5 h-1.5 rounded-full bg-primary motion-safe:animate-pulse motion-reduce:animate-none" style={{ animationDelay: '0ms' }} />
                  <span className="w-0.5 h-2.5 rounded-full bg-primary motion-safe:animate-pulse motion-reduce:animate-none" style={{ animationDelay: '200ms' }} />
                  <span className="w-0.5 h-2 rounded-full bg-primary motion-safe:animate-pulse motion-reduce:animate-none" style={{ animationDelay: '400ms' }} />
                </span>
                <span className="truncate">{activeSectionName}</span>
              </p>
            ) : (
              <p className="text-xs text-muted-foreground truncate">{song.artist}</p>
            )}
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

        {/* Section transport: prev / play / next / loop, grouped as one module */}
        <div className="flex items-center gap-0.5 shrink-0 rounded-full bg-muted/50 p-1">
          <button
            onClick={onPrevSection}
            disabled={!isPlaying || !canGoPrevSection}
            title="Previous section"
            className="w-7 h-7 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-accent/70 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <SkipBack className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={onPlayPause}
            disabled={isLoading}
            className={`
              inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold
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
                : <><Play className="w-3.5 h-3.5 fill-current" /> Play chords</>
            }
          </button>

          <button
            onClick={onNextSection}
            disabled={!isPlaying || !canGoNextSection}
            title="Next section"
            className="w-7 h-7 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-accent/70 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <SkipForward className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={onToggleLoop}
            disabled={!isPlaying}
            title={isLoopingSection ? 'Stop looping this section' : 'Loop this section'}
            className={`w-7 h-7 flex items-center justify-center rounded-full transition-colors disabled:opacity-30 disabled:cursor-not-allowed
              ${isLoopingSection
                ? 'text-primary bg-primary/15 hover:bg-primary/25'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/70'
              }
            `}
          >
            <Repeat className="w-3.5 h-3.5" />
          </button>
        </div>

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
          {showWavExport && (
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
          )}
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
            onClick={() => analytics.songEditorOpened(song.slug)}
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
