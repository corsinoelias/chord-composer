import { useLayoutEffect, useRef, useState } from 'react';
import { Play, Square, Download, ExternalLink, Loader2, SkipBack, SkipForward, Repeat, ChevronUp } from 'lucide-react';
import type { Song } from '@/data/songs';
import { analytics } from '@/lib/analytics';
import { usePlayback, usePlaybackPosition } from '@/contexts/PlaybackContext';
import { SongPerformanceConsole } from '@/components/SongPerformanceConsole';
import type { InstrumentState } from '@/lib/instruments';

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
  // Separate from onSeekSection — the desktop timeline (above) always jumps immediately, but
  // a tap on a card in the mobile Sections panel queues instead of interrupting playback (see
  // handleSectionCardTap in SongChordPlayer.tsx).
  onPanelSectionTap?: (si: number) => void;
  queuedSectionIndex?: number | null;
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

  // Mobile performance console — SongPlayerBar owns rendering it (anchored directly above
  // the bar, not a modal), so it needs the full set of props SongPerformanceConsole takes.
  consoleOpen: boolean;
  onToggleConsole: () => void;
  isSoloSection: boolean;
  activeSectionSpanStart: number;
  activeSectionSpanLength: number;
  instruments: InstrumentState[];
  onInstrumentsChange: (next: InstrumentState[]) => void;
  hasVocalTrack: boolean;
  vocalMuted: boolean;
  vocalVolume: number;
  onVocalMutedChange: (muted: boolean) => void;
  onVocalVolumeChange: (volume: number) => void;
  vocalForcedMuted: boolean;
  originalBpm: number;
}

// Give each label a CSS box spanning exactly its section's slot (start → next section's
// start), so adjacent labels can never overlap regardless of name length.
function markersWithWidth(markers: SectionMarker[]) {
  return markers.map((m, i) => ({
    ...m,
    widthPercent: (i < markers.length - 1 ? markers[i + 1].startPercent : 100) - m.startPercent,
  }));
}

// Whether a section's own slot can fit its FULL name, measured in real pixels rather than a
// fixed %-of-timeline guess. A %-based threshold conflates two different container widths —
// tuned generously enough to hide labels on a narrow phone screen, it also hides them on a
// wide desktop bar where the SAME percent is a much bigger, plenty-wide slot (e.g. a real bug:
// "Intro" invisible on a 1100px-wide desktop bar because its slot was only ~4% of the total,
// even though 4% of 1100px is ~42px — comfortably enough for 5 characters at 9px). Below the
// real fit, the label is left blank (tick + tint band still show) rather than truncated to an
// illegible "P…" fragment.
const LABEL_FONT = '600 9px system-ui, sans-serif'; // matches font-semibold text-[9px]
const LABEL_HORIZONTAL_PADDING_PX = 8; // px-1 on each side ≈ 4px + 4px
let measureCtx: CanvasRenderingContext2D | null | undefined;
function measureLabelWidthPx(text: string): number {
  if (measureCtx === undefined) {
    measureCtx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
  }
  if (!measureCtx) return text.length * 8; // SSR/no-canvas fallback — conservative estimate
  measureCtx.font = LABEL_FONT;
  // canvas measureText doesn't apply CSS letter-spacing — `tracking-wide` is 0.025em, added here.
  return measureCtx.measureText(text).width + text.length * 9 * 0.025;
}
function fitsLabel(name: string, slotWidthPx: number) {
  return slotWidthPx >= measureLabelWidthPx(name) + LABEL_HORIZONTAL_PADDING_PX;
}

// Real pixel width of the timeline row — needed because label-fit is judged in px (see
// fitsLabel above), not just the %-of-total-song value each marker already carries.
function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
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
  onPanelSectionTap,
  queuedSectionIndex = null,
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
  consoleOpen,
  onToggleConsole,
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
  originalBpm,
}: SongPlayerBarProps) {
  const markers = markersWithWidth(sectionMarkers);
  const activeSectionName = sectionMarkers.find(m => m.sectionIndex === activeSectionIndex)?.name;
  const [timelineRef, timelineWidth] = useElementWidth<HTMLDivElement>();
  const expanded = consoleOpen && !inline;

  return (
    <div className={inline ? '' : 'fixed bottom-0 left-0 right-0 z-50 drop-shadow-[0_16px_28px_rgba(0,0,0,0.16)] sm:drop-shadow-none'}>
      {/* Mobile performance console — anchored directly above the bar below (not a modal),
          grows/shrinks via its own grid-rows transition. Never shown for the `inline` embed
          variant (e.g. SongCreator's preview); the `sm:hidden` wrapper below keeps it fully
          invisible on desktop regardless of `consoleOpen`, since desktop has no chevron to
          ever open it in the first place. */}
      {!inline && (
        <div className="mx-3 sm:mx-0 sm:hidden">
          <SongPerformanceConsole
            open={consoleOpen}
            sectionMarkers={sectionMarkers}
            activeSectionIndex={activeSectionIndex}
            onSeekSection={(si) => onPanelSectionTap?.(si)}
            queuedSectionIndex={queuedSectionIndex}
            isLoading={isLoading}
            isPlaying={isPlaying}
            isLoopingSection={isLoopingSection}
            onToggleLoop={() => onToggleLoop?.()}
            isSoloSection={isSoloSection}
            activeSectionSpanStart={activeSectionSpanStart}
            activeSectionSpanLength={activeSectionSpanLength}
            instruments={instruments}
            onInstrumentsChange={onInstrumentsChange}
            hasVocalTrack={hasVocalTrack}
            vocalMuted={vocalMuted}
            vocalVolume={vocalVolume}
            onVocalMutedChange={onVocalMutedChange}
            onVocalVolumeChange={onVocalVolumeChange}
            vocalForcedMuted={vocalForcedMuted}
            bpm={bpm}
            originalBpm={originalBpm}
            onBpmChange={onBpmChange}
            transpose={transpose}
            onTransposeChange={onTransposeChange}
            displayKey={displayKey}
          />
        </div>
      )}

      <div
        className={`
          ${inline
            ? 'border-b mb-2 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80'
            : `mx-3 mb-3 sm:mx-0 sm:mb-0 sm:border-t sm:shadow-[0_-4px_20px_rgba(0,0,0,0.08)] ${expanded ? 'rounded-b-[26px] sm:rounded-none' : 'rounded-[26px] sm:rounded-none'}
               bg-background`
          }
          border-border
        `}
      >
        {/* Song structure timeline — section bands/labels + progress track. Same max-w-5xl/px-4
            container as the controls row below, so "Intro" and "Center"/"Editor" line up at the
            same left/right edges instead of the timeline running flush to the viewport edge while
            everything under it is inset — that mismatch is what read as disjointed on desktop. */}
        <div className="max-w-5xl mx-auto px-4 pt-1.5 pb-1">
          {sectionMarkers.length > 1 && (
            <div ref={timelineRef} className="relative h-4 select-none">
              {markers.map(m => (
                <div
                  key={m.sectionIndex}
                  className={`absolute top-0 bottom-0 transition-colors ${activeSectionIndex === m.sectionIndex ? 'bg-primary/[0.06]' : ''}`}
                  style={{ left: `${m.startPercent}%`, width: `${m.widthPercent}%` }}
                />
              ))}
              {/* h-4 (not just leading-[16px]) so the button keeps a real, tappable hit box even
                  with no text inside — an empty button otherwise collapses to 0 height and can't
                  be clicked at all. The button itself always renders (tap-to-seek always works);
                  only its TEXT is conditional on actually fitting the slot's real pixel width (see
                  fitsLabel) — measured, not guessed, so a wide desktop bar shows a short section's
                  name even when its %-of-song share is small, while a narrow phone screen still
                  correctly leaves a truly-too-narrow slot blank (tick + tint band still show the
                  structure) instead of a truncated, illegible "P…" fragment. The "now playing" line
                  next to the song title (always full-width, never slot-constrained) is the
                  fallback name source whenever a slot doesn't fit one. */}
              {markers.map(m => (
                <button
                  key={m.sectionIndex}
                  type="button"
                  onClick={() => onSeekSection?.(m.sectionIndex)}
                  title={m.name}
                  style={{ left: `${m.startPercent}%`, width: `${m.widthPercent}%` }}
                  className={`absolute top-0 h-4 overflow-hidden truncate px-1 text-left text-[9px] font-semibold uppercase tracking-wide leading-[16px] transition-colors
                    ${activeSectionIndex === m.sectionIndex ? 'text-primary' : 'text-muted-foreground/70 hover:text-muted-foreground'}
                  `}
                >
                  {fitsLabel(m.name, (m.widthPercent / 100) * timelineWidth) ? m.name : ''}
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
        </div>

        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3 sm:gap-4">

          {/* Song info — the whole cluster is the mobile expand/collapse tap target (chevron
              rotates to indicate state), mirroring how a mini-player expands into a full
              dashboard. Inert on desktop and for the `inline` embed variant (no console there). */}
          <button
            type="button"
            onClick={inline ? undefined : onToggleConsole}
            aria-expanded={inline ? undefined : consoleOpen}
            aria-controls={inline ? undefined : 'song-performance-console'}
            className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
          >
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 text-base leading-none select-none">
              🎵
            </div>
            <div className="min-w-0 flex-1">
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
            {!inline && (
              <ChevronUp className={`sm:hidden w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-300 motion-reduce:transition-none ${expanded ? 'rotate-180' : ''}`} />
            )}
          </button>

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

          {/* Section transport: prev / play / next / loop, grouped as one module — desktop
              only. On mobile this is fully superseded by the Sections panel above (tap a
              card to jump, tap its Loop button to repeat it), so showing this pill too would
              just be a second, redundant way to do the same thing. */}
          <div className="hidden sm:flex items-center gap-0.5 shrink-0 rounded-full bg-muted/50 p-1">
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

          {/* Standalone Play/Stop — mobile only (desktop has it inside the transport pill
              above). Not gated on `inline` — the inline embed variant still needs a primary
              play action below `sm`, it just has no expand-panel to fall back on. */}
          <button
            onClick={onPlayPause}
            disabled={isLoading}
            className={`
              sm:hidden inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold shrink-0
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

          {/* Exports — hidden on mobile (the editor link below is not: 65% of song page
              traffic is mobile, and it used to be the one audience with no way into the
              chord player at all) */}
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
          </div>

          {/* Anchor text says "Chord Player", matching the Navbar/Footer CTAs — the
              destination is the same URL, so saying "Editor" here only diluted the signal. */}
          <a
            href={editorUrl}
            onClick={() => analytics.songEditorOpened(song.slug, 'player_bar')}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-primary hover:text-primary/80 hover:bg-primary/5 transition-colors shrink-0"
          >
            {/* On narrow screens the transport and transpose controls already compete for
                width, so only the distinctive half of the label is shown there. */}
            <span className="hidden xs:inline">Chord&nbsp;</span>Player
            <ExternalLink className="w-3 h-3" />
          </a>

        </div>
      </div>
    </div>
  );
}
