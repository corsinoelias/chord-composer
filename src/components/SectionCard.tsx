import { useState, useRef } from 'react';
import { Section } from '@/lib/sections';
import { Chord, formatChord } from '@/lib/musicTheory';
import { ChordBlock } from './ChordBlock';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, Copy, ChevronUp, ChevronDown } from 'lucide-react';

interface SectionCardProps {
  section: Section;
  sectionIndex: number;
  currentChordIndex: number; // Global chord index during playback
  globalChordOffset: number; // Where this section's chords start in global index
  onAddChord: () => void;
  onChordClick: (chordIndex: number) => void;
  onChordDelete: (chordIndex: number) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onRepeatChange: (repeatCount: number) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}

export function SectionCard({
  section,
  sectionIndex,
  currentChordIndex,
  globalChordOffset,
  onAddChord,
  onChordClick,
  onChordDelete,
  onReorder,
  onRepeatChange,
  onDelete,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: SectionCardProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDrop = (e: React.DragEvent, toIndex: number) => {
    e.preventDefault();
    const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
    if (fromIndex !== toIndex) {
      onReorder(fromIndex, toIndex);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // Calculate which chord in this section is playing
  const getLocalPlayingIndex = (): number => {
    if (currentChordIndex < 0) return -1;
    const localIndex = currentChordIndex - globalChordOffset;
    if (localIndex >= 0 && localIndex < section.chords.length) {
      return localIndex;
    }
    return -1;
  };

  const localPlayingIndex = getLocalPlayingIndex();

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Section Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-secondary/30 border-b border-border">
        <div className="flex items-center gap-3">
          <span className="font-medium text-foreground">{section.name}</span>
          <span className="text-xs text-muted-foreground">
            {section.chords.length} {section.chords.length === 1 ? 'chord' : 'chords'}
          </span>
        </div>

        <div className="flex items-center gap-2">
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
              onClick={onMoveUp}
              disabled={isFirst}
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onMoveDown}
              disabled={isLast}
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onDuplicate}
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Chords */}
      <div className="p-4">
        {section.chords.length === 0 ? (
          <div className="flex items-center justify-center h-20 text-muted-foreground text-sm">
            No chords yet. Click + to add.
          </div>
        ) : (
          <div
            ref={containerRef}
            className="flex flex-wrap gap-3"
          >
            {section.chords.map((chord, index) => (
              <div
                key={chord.id}
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragLeave={() => setDragOverIndex(null)}
                onDrop={(e) => handleDrop(e, index)}
                onDragEnd={handleDragEnd}
                onClick={() => onChordClick(index)}
                className={`
                  relative cursor-pointer
                  ${dragOverIndex === index && draggedIndex !== index ? 'pl-4' : ''}
                  transition-all duration-200
                `}
              >
                {dragOverIndex === index && draggedIndex !== index && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-full" />
                )}
                <ChordBlock
                  chord={chord}
                  isPlaying={localPlayingIndex === index}
                  onDelete={() => onChordDelete(index)}
                  isDragging={draggedIndex === index}
                  fixedWidth
                />
              </div>
            ))}
          </div>
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
