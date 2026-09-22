import { Play, Square, ChevronDown, ChevronUp, Repeat } from 'lucide-react';
import { DurationDots } from '@/components/DurationDots';
import ChordTooltip from '@/components/ChordTooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { parseChordString } from '@/lib/chordParser';
import { playChordPreview } from '@/lib/appEngine/preview';
import { analytics } from '@/lib/analytics';
import { displayChord, type SongNotation } from '@/lib/songNotation';

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
  compact?: boolean;
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
  currentChordIndex,
  bpm,
  songSlug,
  notation,
  displayKey,
  compact = false,
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

  if (repeatOfName) {
    return (
      <div className="break-inside-avoid-column mb-3 flex items-center gap-2.5 px-3 py-2.5 border border-dashed border-border rounded-lg bg-secondary/30">
        <Repeat className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs text-muted-foreground min-w-0 truncate">
          <strong className="text-foreground">{repeatOfName}</strong> again{repeatCount > 1 ? ` ×${repeatCount}` : ''}
        </span>
        <span className="ml-auto hidden sm:inline shrink-0 text-[10px] text-muted-foreground">printed once above</span>
        {transportButtons}
      </div>
    );
  }

  return (
    <div
      className={`break-inside-avoid-column mb-5 ${
        isActiveSection ? 'rounded-xl bg-primary/5 border border-primary/15 -mx-3 px-3 pt-2 pb-3' : ''
      }`}
    >
      <div className={`flex items-center gap-2 pb-1.5 mb-2 border-b ${isActiveSection ? 'border-primary/20' : 'border-border'}`}>
        <button
          onClick={onToggleCollapse}
          className="flex-1 flex items-center justify-between text-left min-w-0"
        >
          <span className="flex items-center gap-1.5 min-w-0">
            <span className={`text-[11px] font-bold uppercase tracking-widest truncate ${isActiveSection ? 'text-primary' : 'text-muted-foreground'}`}>
              {section.name}
            </span>
            {repeatCount > 1 && (
              <span
                title={`Repeats ${repeatCount}×`}
                className="shrink-0 text-[10px] font-bold text-primary/80 bg-primary/10 border border-primary/20 rounded-full px-1.5 py-0.5"
              >
                ×{repeatCount}
              </span>
            )}
          </span>
          {collapsed
            ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0 ml-2" />
            : <ChevronUp className="w-3.5 h-3.5 text-muted-foreground shrink-0 ml-2" />
          }
        </button>
        {transportButtons}
      </div>

      {!collapsed && (
        <div className={compact ? 'space-y-1.5' : 'space-y-3'}>
          {section.lines.map((line, li) => {
            if (line.length === 0) return null;
            const isChordOnlyLine = line.every(t => !t.lyrics.trim());

            return (
              <div key={li} className={`flex flex-wrap ${isChordOnlyLine ? 'gap-x-3 gap-y-1' : ''}`}>
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
                      style={{ fontFamily: 'var(--font-mono, monospace)' }}
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
                                text-xs font-bold whitespace-pre transition-all duration-100
                                cursor-pointer select-none
                                ${isActive
                                  ? 'text-primary bg-primary/15 rounded scale-105'
                                  : 'text-primary/70 hover:text-primary'
                                }
                              `}
                              onMouseEnter={() => onOpenTooltip(token.globalIndex)}
                              onClick={() => {
                                const parsed = parseChordString(token.chord);
                                if (parsed[0]) {
                                  analytics.playChordPreview(songSlug, token.chord, 'chart');
                                  playChordPreview(parsed[0]);
                                }
                              }}
                            >
                              {displayChord(token.chord, displayKey, notation)}
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
                        <span className="invisible select-none inline-flex items-center h-[18px] text-xs font-bold whitespace-pre px-0.5" style={{ minWidth: '0' }}>.</span>
                      )}

                      {hasChord && isPlaying && <DurationDots duration={token.duration} isActive={isActive} bpm={bpm} uid={token.globalIndex} rawIndex={currentChordIndex} className="mt-0.5" />}

                      {!isChordOnlyLine && (
                        <span
                          className={`
                            text-sm leading-relaxed whitespace-pre-wrap break-words transition-colors duration-100
                            ${isActive ? 'text-foreground font-medium' : 'text-muted-foreground'}
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
