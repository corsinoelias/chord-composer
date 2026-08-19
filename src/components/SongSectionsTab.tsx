import { useEffect, useState } from 'react';
import { Repeat, ChevronLeft, ChevronRight } from 'lucide-react';
import { usePlaybackPosition } from '@/contexts/PlaybackContext';

interface SectionMarker {
  sectionIndex: number;
  name: string;
  startPercent: number;
}

interface SongSectionsTabProps {
  sectionMarkers: SectionMarker[];
  activeSectionIndex: number | null;
  onSeekSection: (si: number) => void;
  // Section queued to take over once the active one reaches a natural end (see
  // handleSectionCardTap in SongChordPlayer.tsx) — null when nothing is queued.
  queuedSectionIndex: number | null;
  isPlaying: boolean;
  // Disables the jump button while a play() call is in flight — without this, tapping a card
  // repeatedly in quick succession fires overlapping play() calls (each one before the
  // previous had a chance to actually stop anything), audible as several sections playing at
  // once. Same guard already used by the chord chart's own per-section play button.
  isLoading: boolean;
  // Which section is armed to loop, if any — a song.sections index that is meaningful even
  // when nothing is playing, which is why the ⟳ on each card is never disabled.
  loopTargetIndex: number | null;
  onToggleLoop: (si?: number) => void;
  // For the active card's progress ring — whether the currently scheduled Section[] is a
  // solo-played single section (playbackPosition already 0-based within it) or the full song
  // (playbackPosition is global, needs localizing by spanStart) — see SongChordPlayer.tsx.
  isSoloSection: boolean;
  activeSectionSpanStart: number;
  activeSectionSpanLength: number;
}

const PAGE_SIZE = 4;
const RING_R = 15;
const RING_C = 2 * Math.PI * RING_R;

// Isolated so only this small ring re-renders at animation-frame rate (usePlaybackPosition
// updates continuously during playback) — same reasoning as SongPlayerBar's ProgressFill:
// reading playback position from the parent would re-render the whole 2x2 grid every tick.
function ActiveRing({ isSoloSection, spanStart, spanLength }: { isSoloSection: boolean; spanStart: number; spanLength: number }) {
  const playbackPosition = usePlaybackPosition();
  const local = playbackPosition - (isSoloSection ? 0 : spanStart);
  const fraction = spanLength > 0 ? Math.min(1, Math.max(0, local / spanLength)) : 0;
  return (
    <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
      <circle cx="18" cy="18" r={RING_R} fill="none" stroke="hsl(var(--border))" strokeWidth="3" />
      <circle
        cx="18" cy="18" r={RING_R} fill="none" stroke="hsl(var(--primary))" strokeWidth="3" strokeLinecap="round"
        strokeDasharray={RING_C}
        strokeDashoffset={RING_C * (1 - fraction)}
        className="transition-[stroke-dashoffset] duration-150 ease-linear"
      />
    </svg>
  );
}

// 2x2 grid of roughly-square cards, paginated with "‹ •• ›" when there are more than 4
// sections — tap a card to jump/play it, Loop is a separate explicit control (top-right,
// only on the active card) from the progress ring (top-left, purely visual).
export function SongSectionsTab({
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
}: SongSectionsTabProps) {
  const totalPages = Math.max(1, Math.ceil(sectionMarkers.length / PAGE_SIZE));
  const [page, setPage] = useState(0);

  const activeMarkerPos = sectionMarkers.findIndex(m => m.sectionIndex === activeSectionIndex);

  // Follow the active section to whichever page it's on — this panel tracks what's playing,
  // it isn't just a static section browser.
  useEffect(() => {
    if (activeMarkerPos >= 0) setPage(Math.floor(activeMarkerPos / PAGE_SIZE));
  }, [activeMarkerPos]);

  if (sectionMarkers.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-6">This song has no sections.</p>;
  }

  const pageMarkers = sectionMarkers.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  return (
    <div>
      {/* Cards are capped at a fixed width (auto-fill, not stretch-to-fill) so they stay the
          same compact size at every viewport — a 2-col phone-width grid otherwise stretches
          into oversized squares on a wide desktop panel. More columns simply appear as space
          allows; PAGE_SIZE (4) still caps how many render per page regardless of width. */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,160px))] gap-2.5">
        {pageMarkers.map(m => {
          const isActive = m.sectionIndex === activeSectionIndex;
          const isQueued = m.sectionIndex === queuedSectionIndex;
          const isLooping = m.sectionIndex === loopTargetIndex;
          return (
            // A plain div (not a button) wraps two SIBLING buttons — the full-card "jump to
            // section" button and the small Loop button — rather than nesting one button
            // inside the other, which is invalid HTML (and unreliable across browsers for
            // click handling/bubbling).
            <div
              key={m.sectionIndex}
              className={`relative aspect-[1/0.92] rounded-2xl border transition-colors
                ${isActive
                  ? 'border-primary bg-primary/[0.08] ring-1 ring-primary/25'
                  : isQueued
                    ? 'border-primary/60 border-dashed bg-primary/5 motion-safe:animate-pulse motion-reduce:animate-none'
                    : 'border-border bg-secondary/45'
                }
              `}
            >
              <button
                type="button"
                onClick={() => onSeekSection(m.sectionIndex)}
                disabled={isLoading}
                className={`absolute inset-0 rounded-2xl px-3.5 py-3 text-left flex flex-col transition-colors disabled:cursor-not-allowed
                  ${isActive || isQueued ? '' : 'hover:bg-secondary/80'}
                `}
              >
                {isActive && (
                  <span className="w-[30px] h-[30px]">
                    <ActiveRing isSoloSection={isSoloSection} spanStart={activeSectionSpanStart} spanLength={activeSectionSpanLength} />
                  </span>
                )}
                {isQueued && (
                  <span className="text-[10px] font-bold uppercase tracking-wide text-primary/80">Next</span>
                )}
                <span className={`mt-auto text-[15px] font-extrabold leading-tight ${isActive || isQueued ? 'text-primary' : 'text-foreground'}`}>
                  {m.name}
                </span>
              </button>

              {/* On EVERY card, not just the active one, and never disabled: arming the
                  chorus while the song is stopped and then pressing Play is the whole point
                  (see loopTarget in SongChordPlayer.tsx). 30px so it clears the card's own
                  tap target without becoming the thing your thumb hits by accident. */}
              <button
                type="button"
                onClick={() => onToggleLoop(m.sectionIndex)}
                aria-pressed={isLooping}
                title={isLooping ? `Stop looping ${m.name}` : `Loop ${m.name}`}
                className={`absolute top-2.5 right-2.5 w-[30px] h-[30px] flex items-center justify-center rounded-full shadow-sm transition-colors
                  ${isLooping ? 'bg-primary text-primary-foreground' : 'bg-card/80 text-muted-foreground hover:text-foreground'}
                `}
              >
                <Repeat className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 bg-secondary/45 rounded-full px-2.5 py-1.5">
          <button
            type="button"
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="w-[26px] h-[26px] flex items-center justify-center rounded-full text-muted-foreground disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-1.5">
            {Array.from({ length: totalPages }, (_, p) => (
              <span key={p} className={`w-1.5 h-1.5 rounded-full ${p === page ? 'bg-primary' : 'bg-border'}`} />
            ))}
          </div>
          <button
            type="button"
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page === totalPages - 1}
            className="w-[26px] h-[26px] flex items-center justify-center rounded-full text-muted-foreground disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
