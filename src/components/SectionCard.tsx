import { useState, memo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { Section } from '@/lib/sections';
import { Chord } from '@/lib/musicTheory';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Plus, Trash2, Copy, ChevronUp, ChevronDown, Repeat, Pencil, GripVertical } from 'lucide-react';
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
  onAddChord: () => void;
  onChordClick: (chordIndex: number) => void;
  onChordDelete: (chordIndex: number) => void;
  onChordDuplicate: (chordIndex: number) => void;
  onRepeatChange: (repeatCount: number) => void;
  onNameChange: (name: string) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onToggleLoop: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onSetProgression: (chords: Chord[]) => void;
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

// Get consistent color index from section ID
function getColorIndexFromId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    const char = id.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
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
  onAddChord,
  onChordClick,
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
}: SectionCardProps) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState(section.name);

  const colorHsl = SECTION_COLORS[getColorIndexFromId(section.id)];

  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: `section-drop-${sectionIndex}`,
  });

  const handleNameSubmit = () => {
    if (editName.trim()) {
      onNameChange(editName.trim());
    } else {
      setEditName(section.name);
    }
    setIsEditingName(false);
  };

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
  const chordIds = section.chords.map(c => `chord-${sectionIndex}-${c.id}`);

  const canMoveUp = sectionIndex > 0;
  const canMoveDown = sectionIndex < totalSections - 1;
  const showReorderButtons = totalSections > 1;

  const triggerHaptic = () => {
    if ('vibrate' in navigator) {
      navigator.vibrate(10);
    }
  };

  const handleMoveUp = () => {
    triggerHaptic();
    onMoveUp();
  };

  const handleMoveDown = () => {
    triggerHaptic();
    onMoveDown();
  };

  const animationClass = swapAnimation === 'up' 
    ? 'animate-section-swap-up' 
    : swapAnimation === 'down' 
      ? 'animate-section-swap-down' 
      : '';

  return (
    <TooltipProvider delayDuration={300}>
      <div 
        className={`bg-card rounded-xl overflow-hidden transition-shadow duration-100 shadow-sm hover:shadow-md ${
          isLooping ? 'ring-2 ring-offset-2 ring-offset-background' :
          isOver ? 'ring-2 ring-offset-2 ring-offset-background ring-primary/50' :
          ''
        } ${animationClass}`}
        style={{
          borderLeft: `3px solid hsl(${colorHsl} ${isLooping ? '55%' : '50%'})`,
          ...(isLooping ? { '--tw-ring-color': `hsl(${colorHsl} 55%)` } as React.CSSProperties : {}),
        }}
      >
        {/* Section Header */}
        <div 
          className="flex items-center justify-between px-2.5 sm:px-3 py-2 border-b border-border/30 select-none gap-1 sm:gap-2"
          style={{ 
            background: `linear-gradient(90deg, hsl(${colorHsl} 50% / 0.06) 0%, transparent 100%)` 
          }}
        >
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            {/* Reorder buttons */}
            {showReorderButtons && (
              <div className="flex flex-col -my-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 sm:h-6 sm:w-6 rounded-b-none opacity-40 hover:opacity-100"
                  onClick={handleMoveUp}
                  disabled={!canMoveUp}
                >
                  <ChevronUp className="h-3 w-3 sm:h-4 sm:w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 sm:h-6 sm:w-6 rounded-t-none opacity-40 hover:opacity-100"
                  onClick={handleMoveDown}
                  disabled={!canMoveDown}
                >
                  <ChevronDown className="h-3 w-3 sm:h-4 sm:w-4" />
                </Button>
              </div>
            )}
            
            {/* Section name - editable on click */}
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
              <Tooltip>
                <TooltipTrigger asChild>
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
                </TooltipTrigger>
                <TooltipContent>Click to rename section</TooltipContent>
              </Tooltip>
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
                  onClick={onToggleLoop}
                  style={isLooping ? { backgroundColor: `hsl(${colorHsl} 50%)` } : {}}
                >
                  <Repeat className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isLooping ? 'Stop looping this section' : 'Loop only this section'}</TooltipContent>
            </Tooltip>

            {/* Repeat Count */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="relative">
                  <button
                    onClick={() => onRepeatChange(section.repeatCount === 1 ? 2 : section.repeatCount + 1)}
                    className="w-7 h-7 rounded-full bg-background border border-border/60 flex items-center justify-center text-xs font-semibold text-foreground hover:border-primary/50 transition-colors"
                  >
                    ×{section.repeatCount}
                  </button>
                  {section.repeatCount > 1 && (
                    <button
                      onClick={() => onRepeatChange(section.repeatCount - 1)}
                      className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center hover:scale-110 transition-transform"
                    >
                      -
                    </button>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent>Click to add repeats, badge to reduce</TooltipContent>
            </Tooltip>

            {/* Section Actions - desktop */}
            <div className="hidden xs:flex items-center gap-0.5 ml-1 pl-1.5 border-l border-border/30">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 opacity-40 hover:opacity-100"
                    onClick={onDuplicate}
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
                    className="h-7 w-7 opacity-40 hover:opacity-100 hover:text-destructive"
                    onClick={onDelete}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Delete section</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>

        {/* Chords Area */}
        <div ref={setDroppableRef} className="p-2 sm:p-3">
          {section.chords.length === 0 ? (
            <div 
              className={`flex flex-col items-center justify-center h-20 text-muted-foreground text-sm border-2 border-dashed rounded-lg transition-all ${
                isOver ? 'border-primary bg-primary/5' : 'border-border/50'
              }`}
            >
              {isOver ? (
                <span className="text-primary font-medium">Drop chord here</span>
              ) : (
                <div className="flex flex-col items-center gap-1">
                  <span className="opacity-60">No chords yet</span>
                  <span className="text-xs opacity-40">Click "Add Chord" or drag one here</span>
                </div>
              )}
            </div>
          ) : (
            <SortableContext items={chordIds} strategy={rectSortingStrategy}>
              <div className="flex flex-wrap gap-1.5 sm:gap-2 items-stretch">
                {section.chords.map((chord, index) => (
                  <SortableChord
                    key={chord.id}
                    chord={chord}
                    chordId={`chord-${sectionIndex}-${chord.id}`}
                    index={index}
                    isPlaying={localPlayingIndex === index}
                    onClick={() => onChordClick(index)}
                    onDelete={() => onChordDelete(index)}
                    onDuplicate={() => onChordDuplicate(index)}
                  />
                ))}
              </div>
            </SortableContext>
          )}

          {/* Section Action Bar */}
          <div className="mt-2 sm:mt-3 flex flex-wrap items-center gap-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onAddChord}
                  className="border-dashed border-border/60 hover:border-primary/50 hover:bg-primary/5 transition-all h-7 text-xs px-2"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Chord
                </Button>
              </TooltipTrigger>
              <TooltipContent>Add a new chord to this section</TooltipContent>
            </Tooltip>
            
            <ChordSuggestions
              styleId={styleId}
              onSetProgression={onSetProgression}
            />

            {/* Mobile: duplicate/delete */}
            <div className="xs:hidden flex items-center gap-0.5 ml-auto">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 opacity-50 hover:opacity-100"
                onClick={onDuplicate}
              >
                <Copy className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 opacity-50 hover:opacity-100 hover:text-destructive"
                onClick={onDelete}
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