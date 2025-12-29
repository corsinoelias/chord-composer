import { useState, useRef, useEffect } from 'react';
import { Section } from '@/lib/sections';
import { ChordBlock } from './ChordBlock';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, Copy, GripVertical, Repeat } from 'lucide-react';

interface SectionCardProps {
  section: Section;
  sectionIndex: number;
  currentChordIndex: number;
  globalChordOffset: number;
  totalSections: number;
  isLooping?: boolean;
  onAddChord: () => void;
  onChordClick: (chordIndex: number) => void;
  onChordDelete: (chordIndex: number) => void;
  onChordDuplicate: (chordIndex: number) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onMoveChordToSection: (fromSectionIndex: number, chordIndex: number, toSectionIndex: number) => void;
  onRepeatChange: (repeatCount: number) => void;
  onNameChange: (name: string) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onToggleLoop: () => void;
  isFirst: boolean;
  isLast: boolean;
  // Section drag & drop
  onSectionDragStart: (e: React.DragEvent) => void;
  onSectionDragOver: (e: React.DragEvent) => void;
  onSectionDrop: (e: React.DragEvent) => void;
  isSectionDragOver?: boolean;
}

export function SectionCard({
  section,
  sectionIndex,
  currentChordIndex,
  globalChordOffset,
  totalSections,
  isLooping,
  onAddChord,
  onChordClick,
  onChordDelete,
  onChordDuplicate,
  onReorder,
  onMoveChordToSection,
  onRepeatChange,
  onNameChange,
  onDelete,
  onDuplicate,
  onToggleLoop,
  isFirst,
  isLast,
  onSectionDragStart,
  onSectionDragOver,
  onSectionDrop,
  isSectionDragOver,
}: SectionCardProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const [dropPosition, setDropPosition] = useState<'before' | 'after' | null>(null);
  const [isDragOverContainer, setIsDragOverContainer] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState(section.name);
  const containerRef = useRef<HTMLDivElement>(null);
  const chordRefs = useRef<(HTMLDivElement | null)[]>([]);
  const dragImageRef = useRef<HTMLDivElement | null>(null);

  // Update refs array when chords change
  useEffect(() => {
    chordRefs.current = chordRefs.current.slice(0, section.chords.length);
  }, [section.chords.length]);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.stopPropagation();
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/chord', JSON.stringify({ 
      sectionIndex, 
      chordIndex: index 
    }));
    
    // Create a custom drag image
    const chord = section.chords[index];
    const dragImage = document.createElement('div');
    dragImage.className = 'bg-primary text-primary-foreground px-3 py-2 rounded-lg shadow-lg font-medium text-sm';
    dragImage.textContent = `${chord.root}${chord.accidental}${chord.quality}`;
    dragImage.style.position = 'absolute';
    dragImage.style.top = '-1000px';
    dragImage.style.left = '-1000px';
    document.body.appendChild(dragImage);
    dragImageRef.current = dragImage;
    e.dataTransfer.setDragImage(dragImage, 30, 20);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!e.dataTransfer.types.includes('application/chord')) return;
    
    e.dataTransfer.dropEffect = 'move';
    
    // Calculate if we should drop before or after the target chord
    const chordEl = chordRefs.current[index];
    if (chordEl) {
      const rect = chordEl.getBoundingClientRect();
      const midpoint = rect.left + rect.width / 2;
      const position = e.clientX < midpoint ? 'before' : 'after';
      setDropPosition(position);
      setDropTargetIndex(index);
    }
  };

  const handleContainerDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes('application/chord')) {
      setIsDragOverContainer(true);
      e.dataTransfer.dropEffect = 'move';
    }
  };

  const handleContainerDragLeave = (e: React.DragEvent) => {
    // Only reset if leaving the container entirely
    if (!containerRef.current?.contains(e.relatedTarget as Node)) {
      setIsDragOverContainer(false);
      setDropTargetIndex(null);
      setDropPosition(null);
    }
  };

  const handleDrop = (e: React.DragEvent, targetIndex?: number) => {
    e.preventDefault();
    e.stopPropagation();
    
    try {
      const data = e.dataTransfer.getData('application/chord');
      if (!data) return;
      
      const parsed = JSON.parse(data);
      const fromSectionIndex = parsed.sectionIndex;
      const fromChordIndex = parsed.chordIndex;
      
      // Calculate actual insertion index
      let insertIndex = targetIndex ?? section.chords.length;
      
      // If dropping after, increment the index
      if (dropPosition === 'after' && targetIndex !== undefined) {
        insertIndex = targetIndex + 1;
      }
      
      if (fromSectionIndex === sectionIndex) {
        // Same section reorder
        if (fromChordIndex !== insertIndex && fromChordIndex !== insertIndex - 1) {
          // Adjust for the removal if dragging to a later position
          const adjustedIndex = fromChordIndex < insertIndex ? insertIndex - 1 : insertIndex;
          onReorder(fromChordIndex, adjustedIndex);
        }
      } else {
        // Cross-section move
        onMoveChordToSection(fromSectionIndex, fromChordIndex, sectionIndex);
      }
    } catch {
      // Fallback for same-section drag
      if (targetIndex !== undefined && draggedIndex !== null) {
        let insertIndex = targetIndex;
        if (dropPosition === 'after') {
          insertIndex = targetIndex + 1;
        }
        if (draggedIndex !== insertIndex && draggedIndex !== insertIndex - 1) {
          const adjustedIndex = draggedIndex < insertIndex ? insertIndex - 1 : insertIndex;
          onReorder(draggedIndex, adjustedIndex);
        }
      }
    }
    
    resetDragState();
  };

  const handleDragEnd = () => {
    resetDragState();
    // Clean up drag image
    if (dragImageRef.current) {
      document.body.removeChild(dragImageRef.current);
      dragImageRef.current = null;
    }
  };

  const resetDragState = () => {
    setDraggedIndex(null);
    setDropTargetIndex(null);
    setDropPosition(null);
    setIsDragOverContainer(false);
  };

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

  // Get drop indicator position
  const getDropIndicatorStyle = (index: number): React.CSSProperties | null => {
    if (dropTargetIndex !== index || draggedIndex === index) return null;
    return {};
  };

  return (
    <div 
      className={`bg-card border-2 rounded-xl overflow-hidden transition-all duration-200 ${
        isSectionDragOver ? 'border-primary border-dashed bg-primary/5 scale-[1.01]' : 
        isDragOverContainer ? 'border-primary/50 bg-primary/5' : 
        isLooping ? 'border-primary' :
        'border-border'
      }`}
      ref={containerRef}
      onDragOver={handleContainerDragOver}
      onDragLeave={handleContainerDragLeave}
      onDrop={(e) => handleDrop(e)}
    >
      {/* Section Header - Draggable */}
      <div 
        className="flex items-center justify-between px-4 py-3 bg-secondary/30 border-b border-border cursor-grab active:cursor-grabbing select-none transition-colors hover:bg-secondary/50"
        draggable
        onDragStart={onSectionDragStart}
        onDragOver={onSectionDragOver}
        onDrop={onSectionDrop}
      >
        <div className="flex items-center gap-3">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
          
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
      <div className="p-4">
        {section.chords.length === 0 ? (
          <div className={`flex items-center justify-center h-20 text-muted-foreground text-sm border-2 border-dashed rounded-lg transition-all ${
            isDragOverContainer ? 'border-primary bg-primary/10 text-primary' : 'border-border'
          }`}>
            {isDragOverContainer ? 'Drop chord here' : 'No chords yet. Click + to add.'}
          </div>
        ) : (
          <div className="flex flex-wrap gap-3">
            {section.chords.map((chord, index) => {
              const showBeforeIndicator = dropTargetIndex === index && dropPosition === 'before' && draggedIndex !== index;
              const showAfterIndicator = dropTargetIndex === index && dropPosition === 'after' && draggedIndex !== index;
              const isDragging = draggedIndex === index;
              
              return (
                <div
                  key={chord.id}
                  ref={(el) => { chordRefs.current[index] = el; }}
                  draggable
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragLeave={() => {}}
                  onDrop={(e) => handleDrop(e, index)}
                  onDragEnd={handleDragEnd}
                  className={`relative flex items-center transition-all duration-150 ${
                    isDragging ? 'opacity-40 scale-95' : ''
                  }`}
                >
                  {/* Drop indicator - before */}
                  {showBeforeIndicator && (
                    <div className="absolute -left-2 top-0 bottom-0 w-1 bg-primary rounded-full animate-pulse" />
                  )}
                  
                  <div onClick={() => onChordClick(index)} className="cursor-pointer">
                    <ChordBlock
                      chord={chord}
                      isPlaying={localPlayingIndex === index}
                      onDelete={() => onChordDelete(index)}
                      onDuplicate={() => onChordDuplicate(index)}
                      isDragging={isDragging}
                      fixedWidth
                    />
                  </div>
                  
                  {/* Drop indicator - after */}
                  {showAfterIndicator && (
                    <div className="absolute -right-2 top-0 bottom-0 w-1 bg-primary rounded-full animate-pulse" />
                  )}
                </div>
              );
            })}
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
