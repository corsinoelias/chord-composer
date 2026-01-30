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

// Section color palette based on index
const SECTION_COLORS = [
  '262 83%', // Purple (primary)
  '172 66%', // Teal
  '43 96%',  // Amber
  '340 75%', // Pink
  '220 70%', // Blue
  '142 71%', // Green
];

export const SectionCard = memo(function SectionCard({
  section,
  sectionIndex,
  currentChordIndex,
  globalChordOffset,
  totalSections,
  isLooping,
  styleId,
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

  // Get section accent color
  const colorHsl = SECTION_COLORS[sectionIndex % SECTION_COLORS.length];

  // Droppable zone for the section (for cross-section chord drops)
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
    onMoveUp();
  };

  const handleMoveDown = () => {
    triggerHaptic();
    onMoveDown();
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div 
        className={`bg-card rounded-2xl overflow-hidden transition-all duration-300 shadow-sm hover:shadow-md ${
          isLooping ? 'ring-2 ring-offset-2 ring-offset-background' :
          isOver ? 'ring-2 ring-offset-2 ring-offset-background ring-primary/50' :
          ''
        }`}
        style={{
          borderLeft: `4px solid hsl(${colorHsl} ${isLooping ? '55%' : '50%'})`,
          ...(isLooping ? { '--tw-ring-color': `hsl(${colorHsl} 55%)` } as React.CSSProperties : {}),
        }}
      >
        {/* Section Header */}
        <div 
          className="flex items-center justify-between px-4 py-3 border-b border-border/50 select-none"
          style={{ 
            background: `linear-gradient(90deg, hsl(${colorHsl} 50% / 0.08) 0%, transparent 100%)` 
          }}
        >
          <div className="flex items-center gap-2">
            {/* Move Up/Down Buttons - only show when multiple sections */}
            {showReorderButtons && (
              <div className="flex flex-col -my-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-7 rounded-b-none opacity-60 hover:opacity-100"
                      onClick={handleMoveUp}
                      disabled={!canMoveUp}
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Move section up</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-7 rounded-t-none opacity-60 hover:opacity-100"
                      onClick={handleMoveDown}
                      disabled={!canMoveDown}
                    >
                      <ChevronDown className="h-4 w-4" />
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
                className="h-7 w-32 text-sm font-medium"
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <button 
                className="flex items-center gap-1.5 font-semibold text-foreground hover:text-primary transition-colors group"
                onClick={() => {
                  setEditName(section.name);
                  setIsEditingName(true);
                }}
              >
                <span>{section.name}</span>
                <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity" />
              </button>
            )}
            
            <span 
              className="text-xs font-medium px-2 py-0.5 rounded-full"
              style={{ 
                backgroundColor: `hsl(${colorHsl} 50% / 0.15)`,
                color: `hsl(${colorHsl} 45%)`
              }}
            >
              {section.chords.length} {section.chords.length === 1 ? 'chord' : 'chords'}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Loop toggle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={isLooping ? "default" : "ghost"}
                  size="icon"
                  className="h-8 w-8"
                  onClick={onToggleLoop}
                  style={isLooping ? { backgroundColor: `hsl(${colorHsl} 50%)` } : {}}
                >
                  <Repeat className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isLooping ? 'Stop looping this section' : 'Loop this section'}</TooltipContent>
            </Tooltip>

            {/* Repeat Count Badge */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="relative">
                  <button
                    onClick={() => onRepeatChange(section.repeatCount === 1 ? 2 : section.repeatCount + 1)}
                    className="w-9 h-9 rounded-full bg-background border border-border flex items-center justify-center text-sm font-bold text-foreground hover:border-primary transition-colors"
                  >
                    ×{section.repeatCount}
                  </button>
                  {section.repeatCount > 1 && (
                    <button
                      onClick={() => onRepeatChange(section.repeatCount - 1)}
                      className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center hover:scale-110 transition-transform"
                    >
                      -
                    </button>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent>Repeat count (click to increase)</TooltipContent>
            </Tooltip>

            {/* Section Actions */}
            <div className="flex items-center gap-0.5 ml-1 pl-1.5 border-l border-border/50">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 opacity-60 hover:opacity-100"
                    onClick={onDuplicate}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Duplicate section</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 opacity-60 hover:opacity-100 text-destructive hover:text-destructive"
                    onClick={onDelete}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Delete section</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>

        {/* Chords */}
        <div ref={setDroppableRef} className="p-4">
          {section.chords.length === 0 ? (
            <div 
              className={`flex flex-col items-center justify-center h-24 text-muted-foreground text-sm border-2 border-dashed rounded-xl transition-all ${
                isOver ? 'border-primary bg-primary/5 scale-[1.01]' : 'border-border/70'
              }`}
            >
              {isOver ? (
                <span className="text-primary font-medium">Drop chord here</span>
              ) : (
                <>
                  <span className="mb-1">No chords yet</span>
                  <span className="text-xs opacity-70">Click the button below to add your first chord</span>
                </>
              )}
            </div>
          ) : (
            <SortableContext items={chordIds} strategy={rectSortingStrategy}>
              <div className="flex flex-wrap gap-3 items-stretch">
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

          {/* Section Action Buttons */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onAddChord}
              className="border-dashed hover:border-solid hover:border-primary hover:bg-primary/5 transition-all"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Add Chord
            </Button>
            
            {/* Chord Suggestions per section */}
            <ChordSuggestions
              styleId={styleId}
              onSetProgression={onSetProgression}
            />
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
});
