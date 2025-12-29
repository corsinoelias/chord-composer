import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { Section } from '@/lib/sections';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, Copy, GripVertical, Repeat } from 'lucide-react';
import { SortableChord } from './SortableChord';

// Invisible drop zone at the end of chord list
function EndDropZone({ sectionIndex }: { sectionIndex: number }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `chord-end-${sectionIndex}`,
  });

  return (
    <div
      ref={setNodeRef}
      className={`w-4 min-h-[60px] rounded transition-colors ${
        isOver ? 'bg-primary/30' : ''
      }`}
    />
  );
}

interface SectionCardContentProps {
  section: Section;
  sectionIndex: number;
  currentChordIndex: number;
  globalChordOffset: number;
  totalSections: number;
  isLooping?: boolean;
  isDragging?: boolean;
  dragHandleProps?: Record<string, unknown>;
  onAddChord: () => void;
  onChordClick: (chordIndex: number) => void;
  onChordDelete: (chordIndex: number) => void;
  onChordDuplicate: (chordIndex: number) => void;
  onChordReorder: (fromIndex: number, toIndex: number) => void;
  onRepeatChange: (repeatCount: number) => void;
  onNameChange: (name: string) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onToggleLoop: () => void;
}

export function SectionCardContent({
  section,
  sectionIndex,
  currentChordIndex,
  globalChordOffset,
  totalSections,
  isLooping,
  isDragging,
  dragHandleProps,
  onAddChord,
  onChordClick,
  onChordDelete,
  onChordDuplicate,
  onChordReorder,
  onRepeatChange,
  onNameChange,
  onDelete,
  onDuplicate,
  onToggleLoop,
}: SectionCardContentProps) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState(section.name);

  // Droppable zone for the section (for cross-section drops)
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

  return (
    <div 
      className={`bg-card border-2 rounded-xl overflow-hidden transition-all duration-200 ${
        isDragging ? 'border-primary shadow-lg scale-[1.02]' :
        isLooping ? 'border-primary' :
        isOver ? 'border-primary/50 bg-primary/5' :
        'border-border'
      }`}
    >
      {/* Section Header */}
      <div 
        className="flex items-center justify-between px-4 py-3 bg-secondary/30 border-b border-border select-none"
      >
        <div className="flex items-center gap-3">
          <div 
            {...dragHandleProps}
            className="cursor-grab hover:text-primary transition-colors touch-none select-none"
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
          
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
              className="h-7 w-32 text-sm"
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span 
              className="font-medium text-foreground cursor-pointer hover:text-primary transition-colors"
              onClick={() => {
                setEditName(section.name);
                setIsEditingName(true);
              }}
            >
              {section.name}
            </span>
          )}
          
          <span className="text-xs text-muted-foreground">
            {section.chords.length} {section.chords.length === 1 ? 'chord' : 'chords'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Loop toggle */}
          <Button
            variant={isLooping ? "default" : "ghost"}
            size="icon"
            className="h-8 w-8"
            onClick={onToggleLoop}
            title="Loop this section"
          >
            <Repeat className="h-4 w-4" />
          </Button>

          {/* Repeat Count Badge */}
          <div className="relative">
            <button
              onClick={() => onRepeatChange(section.repeatCount === 1 ? 2 : section.repeatCount + 1)}
              className="w-10 h-10 rounded-full bg-background border border-border flex items-center justify-center text-sm font-medium text-foreground hover:bg-accent transition-colors"
            >
              x{section.repeatCount}
            </button>
            {section.repeatCount > 1 && (
              <button
                onClick={() => onRepeatChange(section.repeatCount - 1)}
                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center hover:opacity-80"
              >
                -
              </button>
            )}
          </div>

          {/* Section Actions */}
          <div className="flex items-center gap-1 ml-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onDuplicate}
              title="Duplicate section"
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              onClick={onDelete}
              title="Delete section"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Chords */}
      <div ref={setDroppableRef} className="p-4">
        {section.chords.length === 0 ? (
          <div className={`flex items-center justify-center h-20 text-muted-foreground text-sm border-2 border-dashed rounded-lg transition-colors ${
            isOver ? 'border-primary bg-primary/10' : 'border-border'
          }`}>
            {isOver ? 'Drop chord here' : 'No chords yet. Click + to add.'}
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
              {/* Drop zone at the end for dropping after last chord */}
              <EndDropZone sectionIndex={sectionIndex} />
            </div>
          </SortableContext>
        )}

        {/* Add Chord Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={onAddChord}
          className="mt-3 border-dashed"
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Chord
        </Button>
      </div>
    </div>
  );
}