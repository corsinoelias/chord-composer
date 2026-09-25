import { Play, Square, ChevronDown, ChevronUp, Repeat } from 'lucide-react';
import ChordTooltip from '@/components/ChordTooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { parseChordString } from '@/lib/chordParser';
import { playChordPreview } from '@/lib/appEngine/preview';
import { analytics } from '@/lib/analytics';
import { displayChord, type SongNotation } from '@/lib/songNotation';
import { sectionShort, sectionStyle } from '@/lib/sectionKind';

interface ResolvedToken {
  chord: string;
  lyrics: string;
  duration: number;
  globalIndex: number;
}

interface ResolvedSection {
  name: string;
  lines: ResolvedToken[][];
}

interface SongSectionChartProps {
  section: ResolvedSection;
  repeatCount: number;
  isActiveSection: boolean;
  isSectionPlaying: boolean;
  isSectionPlayable: boolean;
  isSectionLoopArmed: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onPlaySection: () => void;
  onToggleLoop: () => void;
  isLoading: boolean;
  isPlaying: boolean;
  activeGlobal: number;
  currentChordIndex: number;
  bpm: number;
  songSlug: string;
  // Display-only. `token.chord` stays the real, transposed chord name — it's what gets parsed for
  // audio preview, fed to analytics and shown in the tooltip's "what this actually is" line.
  notation: SongNotation;
  displayKey: string;
  // With a capo on, the chart draws shapes; this maps a drawn name to the chord that sounds, so
  // tapping one plays it at the song pitch. Identity when there is no capo.
  soundingChord?: (name: string) => string;
  compact?: boolean;
  // "Lyrics" view: the words only, no chord row.
  lyricsOnly?: boolean;
  // Hovering a chord name shows its diagram (the reader can turn that off in "Aa").
  hoverDiagrams?: boolean;
  chordRefs: React.MutableRefObject<Map<number, HTMLElement>>;
  openTooltipIdx: number | null;
  onOpenTooltip: (idx: number | null) => void;
  // Set when this section is a verbatim repeat of an earlier one — renders a small reference
  // card instead of the full lyric+chord block, but keeps Play/Loop so this specific instance
  // stays individually playable (the mockup this is based on drops those buttons, but every
  // other section instance on the page keeps them, and losing that here would be a real
  // regression, not just a visual simplification).
  repeatOfName?: string | null;
}

// One section's chart block. No per-section bordered card (the mockups this follows never use
// one) — a thin border-b under the section name is the only separator, and the section that's
// actually sounding gets a soft tinted rounded wrapper instead of every section always being
// boxed. `compact` only tightens vertical rhythm; it's the same content as full density.
// Sep 2026 redesign: each section wears its kind's colour (sectionKind.ts) on a short badge —
// V1, C, B — the same one the song map and the playback bar use; lyrics are set in the page's
// own typeface (the chord sits above the start of its own lyric segment, so no monospace is
// needed to line it up), and the beat dots moved out of the chart into the bottom bar.
export function SongSectionChart({
  section,
  repeatCount,
  isActiveSection,
  isSectionPlaying,
  isSectionPlayable,
  isSectionLoopArmed,
  collapsed,
  onToggleCollapse,
  onPlaySection,
  onToggleLoop,
  isLoading,
  isPlaying,
  activeGlobal,
  songSlug,
  notation,
  displayKey,
  soundingChord = (name: string) => name,
  compact = false,
  lyricsOnly = false,
  hoverDiagrams = true,
  chordRefs,
  openTooltipIdx,
  onOpenTooltip,
  repeatOfName = null,
}: SongSectionChartProps) {
  const transportButtons = isSectionPlayable && (
    <div className="shrink-0 flex items-center gap-0.5">
      <button
        onClick={onPlaySection}
        disabled={isLoading}
        title={isSectionPlaying ? 'Stop' : `Play ${section.name}`}
        className={`flex items-center justify-center w-7 h-7 rounded-lg transition-all
          ${isSectionPlaying
            ? 'bg-primary text-primary-foreground hover:bg-primary/80'
            : 'text-muted-foreground hover:text-primary hover:bg-primary/10'
          }
        `}
      >
        {isSectionPlaying ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
      </button>
      <button
        onClick={onToggleLoop}
        aria-pressed={isSectionLoopArmed}
        title={isSectionLoopArmed ? `Stop looping ${section.name}` : `Loop ${section.name}`}
        className={`flex items-center justify-center w-7 h-7 rounded-lg transition-all
          ${isSectionLoopArmed
            ? 'bg-primary/15 text-primary hover:bg-primary/25'
            : 'text-muted-foreground hover:text-primary hover:bg-primary/10'
          }
        `}
      >
        <Repeat className="w-3 h-3" />
      </button>
    </div>
  );

  const kindStyle = sectionStyle(section.name);
  // "8 bars": the section's chord durations (beats) over four.
  const bars = Math.round(section.lines.reduce((sum, line) => sum + line.reduce((s, t) => s + (t.chord ? t.duration : 0), 0), 0) / 4);
  const barsLabel = bars > 0 ? `${bars} bar${bars === 1 ? '' : 's'}` : '';
  const badge = (
    <span className={`shrink-0 inline-grid place-items-center min-w-[30px] h-[22px] px-1.5 rounded-md border text-[11px] font-bold ${isActiveSection ? kindStyle.solid : kindStyle.chip}`}>
      {sectionShort(section.name)}
    </span>
  );

  if (repeatOfName) {
    return (
      <div className={`break-inside-avoid-column mb-4 flex items-center gap-2.5 px-3 py-2.5 border rounded-lg ${isActiveSection ? kindStyle.soft : 'border-dashed border-border'}`}>
        {badge}
        <span className="text-sm font-semibold text-foreground/80 min-w-0 truncate">
          {repeatOfName}{repeatCount > 1 ? ` ×${repeatCount}` : ''}
        </span>
        <span className="ml-auto shrink-0 text-xs text-muted-foreground">Repeat{barsLabel ? ` · ${barsLabel}` : ''}</span>
        {transportButtons}
      </div>
    );
  }

  return (
    <div
      className="break-inside-avoid-column mb-7"
    >
      <div className={`flex items-center gap-2.5 pb-2 mb-3 border-b transition-colors ${isActiveSection ? kindStyle.rule : 'border-border'}`}>
        {badge}
        <span className="text-[12.5px] font-bold uppercase tracking-[0.07em] text-foreground/75 truncate">
          {section.name}
        </span>
        {barsLabel && <span className="shrink-0 text-xs text-muted-foreground">{barsLabel}</span>}
        {repeatCount > 1 && (
          <span title={`Repeats ${repeatCount}×`} className={`shrink-0 text-[11px] font-bold leading-[18px] px-1.5 rounded-md border ${kindStyle.chip}`}>
            ×{repeatCount}
          </span>
        )}
        <span className="ml-auto flex items-center gap-0.5 opacity-70 hover:opacity-100 focus-within:opacity-100 transition-opacity">
          {transportButtons}
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-expanded={!collapsed}
            aria-label={collapsed ? `Show ${section.name}` : `Hide ${section.name}`}
            className="flex items-center justify-center w-7 h-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            {collapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
        </span>
      </div>

      {!collapsed && (
        <div className={compact ? 'space-y-1' : 'space-y-2.5'}>
          {section.lines.map((line, li) => {
            if (line.length === 0) return null;
            const isChordOnlyLine = line.every(t => !t.lyrics.trim());
            // The line being played gets a soft highlight; its chord gets the solid pill below.
            const isLineActive = isPlaying && line.some(t => t.globalIndex === activeGlobal);
            const lineActiveClass = isLineActive ? '-mx-2 px-2 rounded-lg bg-primary/[0.08]' : '';

            if (lyricsOnly) {
              if (isChordOnlyLine) return null;
              return (
                <p key={li} className={`text-[16.5px] md:text-[17px] leading-snug text-foreground/85 transition-colors ${lineActiveClass}`}>
                  {line.map(t => t.lyrics).join('')}
                </p>
              );
            }

            return (
              <div key={li} className={`flex flex-wrap transition-colors ${isChordOnlyLine ? 'gap-x-3 gap-y-1' : ''} ${lineActiveClass}`}>
                {line.map((token, ti) => {
                  if (!token.chord && !token.lyrics.trim()) return null;
                  const isActive = isPlaying && token.globalIndex === activeGlobal;
                  const hasChord = token.chord !== '';

                  return (
                    <span
                      key={ti}
                      ref={hasChord ? el => {
                        if (el) chordRefs.current.set(token.globalIndex, el);
                        else chordRefs.current.delete(token.globalIndex);
                      } : undefined}
                      className="inline-flex flex-col items-start relative max-w-full min-w-0"
                    >
                      {hasChord ? (
                        <Popover
                          open={openTooltipIdx === token.globalIndex}
                          onOpenChange={(open) => { if (!open) onOpenTooltip(null); }}
                        >
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              // Always the real chord name, so someone reading "6m" can still find
                              // out it's an Am without opening the tooltip.
                              title={`Play ${token.chord}`}
                              className={`
                                relative inline-flex items-center justify-center
                                min-h-[44px] min-w-[1ch] -mt-[14px] -mb-[12px] px-0.5
                                text-[14.5px] font-bold whitespace-pre transition-all duration-100
                                cursor-pointer select-none
                                text-primary
                              `}
                              onMouseEnter={hoverDiagrams ? () => onOpenTooltip(token.globalIndex) : undefined}
                              onClick={() => {
                                const parsed = parseChordString(soundingChord(token.chord));
                                if (parsed[0]) {
                                  analytics.playChordPreview(songSlug, token.chord, 'chart');
                                  playChordPreview(parsed[0]);
                                }
                              }}
                            >
                              {/* The 44px-tall button is the touch target; only this span is painted,
                                  so the playing chord's fill never covers the lyric under it. */}
                              <span className={`rounded-md px-0.5 -mx-0.5 transition-colors ${isActive ? 'bg-primary text-primary-foreground' : 'hover:bg-primary/10'}`}>
                                {displayChord(token.chord, displayKey, notation)}
                              </span>
                            </button>
                          </PopoverTrigger>
                          <PopoverContent
                            side="top"
                            sideOffset={10}
                            collisionPadding={16}
                            className="p-0 border-none shadow-none bg-transparent overflow-visible w-auto"
                          >
                            <ChordTooltip chord={token.chord} notation={notation} displayKey={displayKey} />
                          </PopoverContent>
                        </Popover>
                      ) : (
                        <span className="invisible select-none inline-flex items-center h-[18px] text-[13.5px] font-bold whitespace-pre px-0.5" style={{ minWidth: '0' }}>.</span>
                      )}

                      {!isChordOnlyLine && (
                        <span
                          className={`
                            text-[16.5px] md:text-[17px] leading-snug whitespace-pre-wrap break-words transition-colors duration-100
                            ${isActive ? 'text-foreground font-medium' : 'text-foreground/85'}
                          `}
                        >
                          {token.lyrics || (hasChord ? ' ' : '')}
                        </span>
                      )}
                    </span>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
