import { useState, useRef } from 'react';
import { Section } from '@/lib/sections';
import { ChordBlock } from './ChordBlock';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Plus, Trash2, Copy, ChevronUp, ChevronDown, MoveRight } from 'lucide-react';

interface SectionCardProps {
  section: Section;
  sectionIndex: number;
  currentChordIndex: number;
  globalChordOffset: number;
  totalSections: number;
  onAddChord: () => void;
  onChordClick: (chordIndex: number) => void;
  onChordDelete: (chordIndex: number) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onMoveChordToSection: (chordIndex: number, toSectionIndex: number) => void;
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
  totalSections,
  onAddChord,
  onChordClick,
  onChordDelete,
  onReorder,
  onMoveChordToSection,
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
  const [isDragOver, setIsDragOver] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/json', JSON.stringify({ 
      sectionIndex, 
      chordIndex: index 
    }));
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleContainerDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleContainerDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent, toIndex?: number) => {
    e.preventDefault();
    e.stopPropagation();
    
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      const fromSectionIndex = data.sectionIndex;
      const fromChordIndex = data.chordIndex;
      
      if (fromSectionIndex === sectionIndex) {
        // Same section reorder
        if (toIndex !== undefined && fromChordIndex !== toIndex) {
          onReorder(fromChordIndex, toIndex);
        }
      } else {
        // Cross-section move
        onMoveChordToSection(fromChordIndex, sectionIndex);
      }
    } catch {
      // Fallback for same-section drag
      if (toIndex !== undefined && draggedIndex !== null && draggedIndex !== toIndex) {
        onReorder(draggedIndex, toIndex);
      }
    }
    
    setDraggedIndex(null);
    setDragOverIndex(null);
    setIsDragOver(false);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
    setIsDragOver(false);
  };

  // Calculate which chord in this section is playing
  const getLocalPlayingIndex = (): number => {
    if (currentChordIndex < 0) return -1;
    const localIndex = currentChordIndex - globalChordOffset;
    // Account for repeats - the playing index wraps within section
    const sectionLength = section.chords.length;
    if (sectionLength === 0) return -1;
    const adjustedIndex = localIndex % sectionLength;
    if (localIndex >= 0 && localIndex < sectionLength * section.repeatCount) {
      return adjustedIndex;
    }
    return -1;
  };

  const localPlayingIndex = getLocalPlayingIndex();

  // Generate section names for the move dropdown
  const otherSections = Array.from({ length: totalSections }, (_, i) => ({
    index: i,
    name: String.fromCharCode(65 + i), // A, B, C...
  })).filter(s => s.index !== sectionIndex);

  return (
    <div 
      className={`bg-card border rounded-xl overflow-hidden transition-colors ${
        isDragOver ? 'border-primary bg-primary/5' : 'border-border'
      }`}
      onDragOver={handleContainerDragOver}
      onDragLeave={handleContainerDragLeave}
      onDrop={(e) => handleDrop(e)}
    >
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
          <div className="flex items-center justify-center h-20 text-muted-foreground text-sm border-2 border-dashed border-border rounded-lg">
            {isDragOver ? 'Drop chord here' : 'No chords yet. Click + to add.'}
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
                className={`
                  relative group
                  ${dragOverIndex === index && draggedIndex !== index ? 'pl-4' : ''}
                  transition-all duration-200
                `}
              >
                {dragOverIndex === index && draggedIndex !== index && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-full" />
                )}
                <div onClick={() => onChordClick(index)}>
                  <ChordBlock
                    chord={chord}
                    isPlaying={localPlayingIndex === index}
                    onDelete={() => onChordDelete(index)}
                    isDragging={draggedIndex === index}
                    fixedWidth
                  />
                </div>
                
                {/* Move to section dropdown */}
                {totalSections > 1 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-secondary border border-border flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <MoveRight className="h-3 w-3" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      {otherSections.map(s => (
                        <DropdownMenuItem 
                          key={s.index}
                          onClick={() => onMoveChordToSection(index, s.index)}
                        >
                          Move to Section {s.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
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
