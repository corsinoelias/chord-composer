import { useState, useRef } from 'react';
import { Section } from '@/lib/sections';
import { ChordBlock } from './ChordBlock';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, Copy, GripVertical, Repeat } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

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
  onSectionDragLeave: () => void;
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
  onSectionDragLeave,
  onSectionDrop,
  isSectionDragOver,
}: SectionCardProps) {
  const { t } = useLanguage();
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState(section.name);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.stopPropagation();
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/chord', JSON.stringify({ 
      sectionIndex, 
      chordIndex: index 
    }));
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleContainerDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    // Check if it's a chord drag
    if (e.dataTransfer.types.includes('application/chord')) {
      setIsDragOver(true);
    }
  };

  const handleContainerDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent, toIndex?: number) => {
    e.preventDefault();
    e.stopPropagation();
    
    try {
      const data = e.dataTransfer.getData('application/chord');
      if (!data) return;
      
      const parsed = JSON.parse(data);
      const fromSectionIndex = parsed.sectionIndex;
      const fromChordIndex = parsed.chordIndex;
      
      if (fromSectionIndex === sectionIndex) {
        // Same section reorder
        // If toIndex is undefined (dropped on container), move to end
        const targetIndex = toIndex !== undefined ? toIndex : section.chords.length;
        if (fromChordIndex !== targetIndex) {
          // Adjust target if moving from before to after
          const adjustedTarget = fromChordIndex < targetIndex ? targetIndex : targetIndex;
          onReorder(fromChordIndex, adjustedTarget);
        }
      } else {
        // Cross-section move
        onMoveChordToSection(fromSectionIndex, fromChordIndex, sectionIndex);
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

  // Handle drop at end of chord list
  const handleDropAtEnd = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    try {
      const data = e.dataTransfer.getData('application/chord');
      if (!data) return;
      
      const parsed = JSON.parse(data);
      const fromSectionIndex = parsed.sectionIndex;
      const fromChordIndex = parsed.chordIndex;
      
      if (fromSectionIndex === sectionIndex) {
        // Same section - move to end
        if (fromChordIndex !== section.chords.length - 1) {
          onReorder(fromChordIndex, section.chords.length - 1);
        }
      } else {
        // Cross-section move
        onMoveChordToSection(fromSectionIndex, fromChordIndex, sectionIndex);
      }
    } catch {
      // ignore
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

  return (
    <div 
      className={`bg-card border-2 rounded-xl overflow-hidden transition-all ${
        isSectionDragOver ? 'border-primary border-dashed bg-primary/5' : 
        isDragOver ? 'border-primary/50 bg-primary/5' : 
        isLooping ? 'border-primary' :
        'border-border'
      }`}
      onDragOver={handleContainerDragOver}
      onDragLeave={handleContainerDragLeave}
      onDrop={(e) => handleDrop(e)}
    >
      {/* Section Header - Draggable */}
      <div 
        className="flex items-center justify-between px-4 py-3 bg-secondary/30 border-b border-border cursor-grab active:cursor-grabbing"
        draggable
        onDragStart={onSectionDragStart}
        onDragOver={onSectionDragOver}
        onDragLeave={onSectionDragLeave}
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
            />
          ) : (
            <span 
              className="font-medium text-foreground cursor-pointer hover:text-primary"
              onClick={() => {
                setEditName(section.name);
                setIsEditingName(true);
              }}
            >
              {section.name}
            </span>
          )}
          
          <span className="text-xs text-muted-foreground">
            {section.chords.length} {section.chords.length === 1 ? t('chord') : t('chords')}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Loop toggle */}
          <Button
            variant={isLooping ? "default" : "ghost"}
            size="icon"
            className="h-8 w-8"
            onClick={onToggleLoop}
            title={t('loopSection')}
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
              title={t('duplicateSection')}
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              onClick={onDelete}
              title={t('deleteSection')}
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
            {isDragOver ? t('dropChordHere') : t('noChords')}
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
                  relative
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
                    onDuplicate={() => onChordDuplicate(index)}
                    isDragging={draggedIndex === index}
                    fixedWidth
                  />
                </div>
              </div>
            ))}
            
            {/* Drop zone at end */}
            <div
              className={`
                w-16 h-[72px] rounded-lg border-2 border-dashed flex items-center justify-center
                transition-all duration-200
                ${isDragOver ? 'border-primary bg-primary/10' : 'border-transparent'}
              `}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDropAtEnd}
            />
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
          {t('addChord')}
        </Button>
      </div>
    </div>
  );
}
