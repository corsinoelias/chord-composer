import { useState, memo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { type Section } from '@/lib/sections';
import { type Chord } from '@/lib/musicTheory';
import { type MelodicData } from '@/lib/bassScale';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Plus, Trash2, Copy, ChevronUp, ChevronDown, Repeat, Pencil } from 'lucide-react';
import { SortableChord } from './SortableChord';
import { ChordSuggestions } from './ChordSuggestions';

interface SectionCardProps {
  section: Section;
  sectionIndex: number;
  currentChordIndex: number;
  globalChordOffset: number;
  totalSections: number;
  isLooping?: boolean;
  styleId: string;
  swapAnimation?: 'up' | 'down' | null;
  selectedChordIds: Set<string>;
  onAddChord: (sectionIndex: number) => void;
  onChordClick: (sectionIndex: number, chordIndex: number) => void;
  onChordSelect: (sectionIndex: number, chordIndex: number, ctrl: boolean) => void;
  onChordDelete: (sectionIndex: number, chordIndex: number) => void;
  onChordDuplicate: (sectionIndex: number, chordIndex: number) => void;
  onRepeatChange: (sectionIndex: number, repeatCount: number) => void;
  onNameChange: (sectionIndex: number, name: string) => void;
  onDelete: (sectionIndex: number) => void;
  onDuplicate: (sectionIndex: number) => void;
  onToggleLoop: (sectionIndex: number) => void;
  onMoveUp: (sectionIndex: number) => void;
  onMoveDown: (sectionIndex: number) => void;
  onSetProgression: (sectionIndex: number, chords: Chord[]) => void;
  melodic?: MelodicData;
  onVariationChange?: (sectionIndex: number, instrument: 'bass' | 'piano' | 'guitar', variationId: string) => void;
  transposition?: number;
}

// Section color palette
const SECTION_COLORS = [
  '262 83%', // Purple (primary)
  '172 66%', // Teal
  '43 96%',  // Amber
  '340 75%', // Pink
  '220 70%', // Blue
  '142 71%', // Green
];

// Get consistent color index from section ID (so color stays with section when reordering)
function getColorIndexFromId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    const char = id.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash) % SECTION_COLORS.length;
}

export const SectionCard = memo(function SectionCard({
  section,
  sectionIndex,
  currentChordIndex,
  globalChordOffset,
  totalSections,
  isLooping,
  styleId,
  swapAnimation,
  selectedChordIds,
  onAddChord,
  onChordClick,
  onChordSelect,
  onChordDelete,
  onChordDuplicate,
  onRepeatChange,
  onNameChange,
  onDelete,
  onDuplicate,
  onToggleLoop,
  onMoveUp,
  onMoveDown,
  onSetProgression,
  melodic,
  onVariationChange,
  transposition = 0,
}: SectionCardProps) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState(section.name);

  // Get section accent color based on ID (persists across reordering)
  const colorHsl = SECTION_COLORS[getColorIndexFromId(section.id)];

  // Droppable zone for the section (for cross-section chord drops)
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: `section-drop-${sectionIndex}`,
  });

  const handleNameSubmit = () => {
    if (editName.trim()) {
      onNameChange(sectionIndex, editName.trim());
    } else {
      setEditName(section.name);
    }
    setIsEditingName(false);
  };

  // Calculate which chord in this section is playing
  const getLocalPlayingIndex = (): number => {
    if (currentChordIndex < 0) return -1;
    const localIndex = currentChordIndex - globalChordOffset;
    const sectionLength = section.chords.length;
    if (sectionLength === 0) return -1;
    const adjustedIndex = localIndex % sectionLength;
    if (localIndex >= 0 && localIndex < sectionLength * section.repeatCount) {
      return adjustedIndex;
    }
    return -1;
  };

  const localPlayingIndex = getLocalPlayingIndex();

  // Generate unique chord IDs that include section index
  const chordIds = section.chords.map(c => `chord-${sectionIndex}-${c.id}`);

  const canMoveUp = sectionIndex > 0;
  const canMoveDown = sectionIndex < totalSections - 1;
  const showReorderButtons = totalSections > 1;

  // Haptic feedback helper
  const triggerHaptic = () => {
    if ('vibrate' in navigator) {
      navigator.vibrate(10);
    }
  };

  const handleMoveUp = () => {
    triggerHaptic();
    onMoveUp(sectionIndex);
  };

  const handleMoveDown = () => {
    triggerHaptic();
    onMoveDown(sectionIndex);
  };

  // Determine animation class
  const animationClass = swapAnimation === 'up' 
    ? 'animate-section-swap-up' 
    : swapAnimation === 'down' 
      ? 'animate-section-swap-down' 
      : '';

  return (
    <TooltipProvider delayDuration={300}>
      <div 
        className={`bg-card rounded-xl overflow-hidden transition-shadow duration-200 shadow-sm hover:shadow-md ${
          isLooping ? 'ring-2 ring-offset-2 ring-offset-background' :
          isOver ? 'ring-2 ring-offset-2 ring-offset-background ring-primary/50' :
          ''
        } ${animationClass}`}
        style={{
          borderLeft: `3px solid hsl(${colorHsl} ${isLooping ? '55%' : '50%'})`,
          ...(isLooping ? { '--tw-ring-color': `hsl(${colorHsl} 55%)` } as React.CSSProperties : {}),
        }}
      >
        {/* Section Header - Responsive */}
        <div 
          className="flex items-center justify-between px-2 sm:px-3 py-2 border-b border-border/30 select-none gap-1 sm:gap-2"
          style={{ 
            background: `linear-gradient(90deg, hsl(${colorHsl} 50% / 0.06) 0%, transparent 100%)` 
          }}
        >
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            {/* Move Up/Down Buttons - only show when multiple sections */}
            {showReorderButtons && (
              <div className="flex flex-col -my-1 shrink-0">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 sm:h-6 sm:w-6 rounded-b-none opacity-50 hover:opacity-100"
                      onClick={handleMoveUp}
                      disabled={!canMoveUp}
                      aria-label={`Move ${section.name} up`}
                    >
                      <ChevronUp className="h-3 w-3 sm:h-4 sm:w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Move section up</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 sm:h-6 sm:w-6 rounded-t-none opacity-50 hover:opacity-100"
                      onClick={handleMoveDown}
                      disabled={!canMoveDown}
                      aria-label={`Move ${section.name} down`}
                    >
                      <ChevronDown className="h-3 w-3 sm:h-4 sm:w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Move section down</TooltipContent>
                </Tooltip>
              </div>
            )}
            
            {isEditingName ? (
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={handleNameSubmit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleNameSubmit();
                  if (e.key === 'Escape') {
                    setEditName(section.name);
                    setIsEditingName(false);
                  }
                }}
                className="h-6 sm:h-7 w-20 sm:w-28 text-xs sm:text-sm font-medium"
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <button 
                className="flex items-center gap-1 font-medium text-foreground hover:text-primary transition-colors group text-sm truncate"
                onClick={() => {
                  setEditName(section.name);
                  setIsEditingName(true);
                }}
              >
                <span className="truncate">{section.name}</span>
                <Pencil className="h-2.5 w-2.5 opacity-0 group-hover:opacity-50 transition-opacity shrink-0" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-0.5 sm:gap-1.5 shrink-0">
            {/* Loop toggle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={isLooping ? "default" : "ghost"}
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => onToggleLoop(sectionIndex)}
                  style={isLooping ? { backgroundColor: `hsl(${colorHsl} 50%)` } : {}}
                  aria-label={isLooping ? `Stop looping ${section.name}` : `Loop ${section.name}`}
                >
                  <Repeat className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isLooping ? 'Stop looping' : 'Loop section'}</TooltipContent>
            </Tooltip>

            {/* Repeat Count Badge */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="relative">
                  <button
                    onClick={() => onRepeatChange(sectionIndex, section.repeatCount === 1 ? 2 : section.repeatCount + 1)}
                    className="w-7 h-7 rounded-full bg-background border border-border/60 flex items-center justify-center text-xs font-semibold text-foreground hover:border-primary/50 transition-colors"
                  >
                    ×{section.repeatCount}
                  </button>
                  {section.repeatCount > 1 && (
                    <button
                      onClick={() => onRepeatChange(sectionIndex, section.repeatCount - 1)}
                      className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center hover:scale-110 transition-transform"
                    >
                      -
                    </button>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent>Repeat count</TooltipContent>
            </Tooltip>

            {/* Section Actions - hidden on mobile, show on larger screens */}
            <div className="hidden xs:flex items-center gap-0.5 ml-1 pl-1.5 border-l border-border/30">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 opacity-50 hover:opacity-100"
                    onClick={() => onDuplicate(sectionIndex)}
                    aria-label={`Duplicate ${section.name}`}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Duplicate section</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 opacity-50 hover:opacity-100 hover:text-destructive"
                    onClick={() => onDelete(sectionIndex)}
                    aria-label={`Delete ${section.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Delete section</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>

        {/* Variation selectors — only when an instrument has 2+ variations */}
        {melodic && (['bass', 'piano', 'guitar'] as const).some(inst => melodic[inst].enabled && melodic[inst].variations.length >= 2) && (
          <div className="px-2 sm:px-3 py-1.5 border-b border-border/20 bg-muted/20 flex items-center gap-2 flex-wrap">
            {(['bass', 'piano', 'guitar'] as const).map(inst => {
              const data = melodic[inst];
              if (!data.enabled || data.variations.length < 2) return null;
              const currentId = inst === 'bass' ? section.bassVariationId : inst === 'piano' ? section.pianoVariationId : section.guitarVariationId;
              const current = data.variations.find(v => v.id === currentId) ?? data.variations[0];
              const label = inst === 'bass' ? 'Bajo' : inst === 'piano' ? 'Piano' : 'Guitarra';
              return (
                <div key={inst} className="flex items-center gap-1">
                  <span className="text-[10px] text-muted-foreground">{label}:</span>
                  <Select value={current?.id ?? ''} onValueChange={id => onVariationChange?.(sectionIndex, inst, id)}>
                    <SelectTrigger className="h-5 w-24 text-[10px] px-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {data.variations.map(v => (
                        <SelectItem key={v.id} value={v.id} className="text-xs">{v.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </div>
        )}

        {/* Chords */}
        <div ref={setDroppableRef} className="p-2 sm:p-3">
          {section.chords.length === 0 ? (
            <div 
              className={`flex flex-col items-center justify-center h-16 sm:h-20 text-muted-foreground text-xs border-2 border-dashed rounded-lg transition-all ${
                isOver ? 'border-primary bg-primary/5' : 'border-border/50'
              }`}
            >
              {isOver ? (
                <span className="text-primary font-medium">Drop chord here</span>
              ) : (
                <>
                  <span className="opacity-70">No chords yet</span>
                </>
              )}
            </div>
          ) : (
            <SortableContext items={chordIds} strategy={rectSortingStrategy}>
              <div className="flex flex-wrap gap-1.5 sm:gap-2 items-stretch">
                {section.chords.map((chord, index) => {
                  const compoundId = `chord-${sectionIndex}-${chord.id}`
                  return (
                    <SortableChord
                      key={chord.id}
                      chord={chord}
                      chordId={compoundId}
                      index={index}
                      isPlaying={localPlayingIndex === index}
                      isSelected={selectedChordIds.has(compoundId)}
                      hasSelection={selectedChordIds.size > 0}
                      onClick={() => onChordClick(sectionIndex, index)}
                      onSelectToggle={(ctrl) => onChordSelect(sectionIndex, index, ctrl)}
                      onDelete={() => onChordDelete(sectionIndex, index)}
                      onDuplicate={() => onChordDuplicate(sectionIndex, index)}
                      transposition={transposition}
                    />
                  )
                })}
              </div>
            </SortableContext>
          )}

          {/* Section Action Buttons - Responsive */}
          <div className="mt-2 sm:mt-3 flex flex-wrap items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onAddChord(sectionIndex)}
              className="border-dashed border-border/60 hover:border-primary/50 hover:bg-primary/5 transition-all h-7 text-xs px-2"
            >
              <Plus className="h-3 w-3 mr-1" />
              Add Chord
            </Button>
            
            {/* Chord Suggestions per section */}
            <ChordSuggestions
              styleId={styleId}
              onSetProgression={(chords) => onSetProgression(sectionIndex, chords)}
            />

            {/* Mobile: Show duplicate/delete actions */}
            <div className="xs:hidden flex items-center gap-0.5 ml-auto">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 opacity-50 hover:opacity-100"
                onClick={() => onDuplicate(sectionIndex)}
                aria-label={`Duplicate ${section.name}`}
              >
                <Copy className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 opacity-50 hover:opacity-100 hover:text-destructive"
                onClick={() => onDelete(sectionIndex)}
                aria-label={`Delete ${section.name}`}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
});
