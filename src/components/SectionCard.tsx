import { useState, useRef, useEffect, useCallback } from 'react';
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
  // Section reorder
  onSectionReorder: (fromIndex: number, toIndex: number) => void;
  isSectionDragging?: boolean;
  sectionDraggedIndex?: number | null;
  sectionDropTargetIndex?: number | null;
  sectionDropPosition?: 'before' | 'after' | null;
  onSectionDragStart: (index: number, element: HTMLElement) => void;
  onSectionDragEnd: () => void;
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
  onSectionReorder,
  isSectionDragging,
  sectionDraggedIndex,
  sectionDropTargetIndex,
  sectionDropPosition,
  onSectionDragStart,
  onSectionDragEnd,
}: SectionCardProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const [dropPosition, setDropPosition] = useState<'before' | 'after' | null>(null);
  const [isDragOverContainer, setIsDragOverContainer] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState(section.name);
  const containerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const chordRefs = useRef<(HTMLDivElement | null)[]>([]);
  const dragImageRef = useRef<HTMLDivElement | null>(null);

  // Touch drag state for chords
  const [isTouchDragging, setIsTouchDragging] = useState(false);
  const touchDragIndexRef = useRef<number | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const touchHoldTimerRef = useRef<NodeJS.Timeout | null>(null);
  const touchGhostRef = useRef<HTMLDivElement | null>(null);

  // Update refs array when chords change
  useEffect(() => {
    chordRefs.current = chordRefs.current.slice(0, section.chords.length);
  }, [section.chords.length]);

  // Cleanup touch ghost on unmount
  useEffect(() => {
    return () => {
      if (touchGhostRef.current) {
        document.body.removeChild(touchGhostRef.current);
      }
      if (touchHoldTimerRef.current) {
        clearTimeout(touchHoldTimerRef.current);
      }
    };
  }, []);

  // CHORD DRAG HANDLERS (Desktop)
  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.stopPropagation();
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/chord', JSON.stringify({ 
      sectionIndex, 
      chordIndex: index 
    }));
    
    // Create custom drag image
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
      
      let insertIndex = targetIndex ?? section.chords.length;
      
      if (dropPosition === 'after' && targetIndex !== undefined) {
        insertIndex = targetIndex + 1;
      }
      
      if (fromSectionIndex === sectionIndex) {
        if (fromChordIndex !== insertIndex && fromChordIndex !== insertIndex - 1) {
          const adjustedIndex = fromChordIndex < insertIndex ? insertIndex - 1 : insertIndex;
          onReorder(fromChordIndex, adjustedIndex);
        }
      } else {
        onMoveChordToSection(fromSectionIndex, fromChordIndex, sectionIndex);
      }
    } catch {
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

  // CHORD TOUCH HANDLERS (Mobile)
  const handleChordTouchStart = useCallback((e: React.TouchEvent, index: number) => {
    const touch = e.touches[0];
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
    touchDragIndexRef.current = index;

    touchHoldTimerRef.current = setTimeout(() => {
      if (navigator.vibrate) navigator.vibrate(50);
      
      setIsTouchDragging(true);
      setDraggedIndex(index);

      // Create ghost element
      const chord = section.chords[index];
      const ghost = document.createElement('div');
      ghost.className = 'fixed pointer-events-none z-[9999] bg-primary text-primary-foreground px-4 py-3 rounded-xl shadow-2xl font-medium text-base';
      ghost.textContent = `${chord.root}${chord.accidental}${chord.quality}`;
      ghost.style.left = `${touch.clientX - 40}px`;
      ghost.style.top = `${touch.clientY - 25}px`;
      ghost.style.transform = 'scale(1.1)';
      document.body.appendChild(ghost);
      touchGhostRef.current = ghost;
    }, 200);
  }, [section.chords]);

  const handleChordTouchMove = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];

    // Cancel hold if moved too much before drag started
    if (!isTouchDragging && touchStartPosRef.current) {
      const dx = Math.abs(touch.clientX - touchStartPosRef.current.x);
      const dy = Math.abs(touch.clientY - touchStartPosRef.current.y);
      if (dx > 10 || dy > 10) {
        if (touchHoldTimerRef.current) {
          clearTimeout(touchHoldTimerRef.current);
          touchHoldTimerRef.current = null;
        }
        return;
      }
    }

    if (!isTouchDragging) return;
    e.preventDefault();

    // Update ghost position
    if (touchGhostRef.current) {
      touchGhostRef.current.style.left = `${touch.clientX - 40}px`;
      touchGhostRef.current.style.top = `${touch.clientY - 25}px`;
    }

    // Find drop target
    let closestIndex = -1;
    let closestPosition: 'before' | 'after' = 'before';
    let closestDistance = Infinity;

    chordRefs.current.forEach((ref, i) => {
      if (!ref) return;
      const rect = ref.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const distance = Math.sqrt(
        Math.pow(touch.clientX - centerX, 2) + 
        Math.pow(touch.clientY - centerY, 2)
      );
      
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = i;
        closestPosition = touch.clientX < centerX ? 'before' : 'after';
      }
    });

    if (closestIndex !== -1) {
      setDropTargetIndex(closestIndex);
      setDropPosition(closestPosition);
    }
  }, [isTouchDragging]);

  const handleChordTouchEnd = useCallback(() => {
    if (touchHoldTimerRef.current) {
      clearTimeout(touchHoldTimerRef.current);
      touchHoldTimerRef.current = null;
    }

    if (isTouchDragging && draggedIndex !== null && dropTargetIndex !== null) {
      let insertIndex = dropTargetIndex;
      if (dropPosition === 'after') insertIndex++;
      if (draggedIndex < insertIndex) insertIndex--;

      if (draggedIndex !== insertIndex) {
        onReorder(draggedIndex, insertIndex);
      }
    }

    // Cleanup
    if (touchGhostRef.current) {
      document.body.removeChild(touchGhostRef.current);
      touchGhostRef.current = null;
    }

    setIsTouchDragging(false);
    setDraggedIndex(null);
    setDropTargetIndex(null);
    setDropPosition(null);
    touchDragIndexRef.current = null;
    touchStartPosRef.current = null;
  }, [isTouchDragging, draggedIndex, dropTargetIndex, dropPosition, onReorder]);

  // SECTION DRAG HANDLERS
  const handleSectionDragStart = (e: React.DragEvent) => {
    e.stopPropagation();
    if (headerRef.current) {
      onSectionDragStart(sectionIndex, headerRef.current);
    }
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/section', sectionIndex.toString());
    
    // Create drag image
    const dragImage = document.createElement('div');
    dragImage.className = 'bg-primary text-primary-foreground px-4 py-2 rounded-lg shadow-lg font-medium text-sm';
    dragImage.textContent = `${section.name} (${section.chords.length} chords)`;
    dragImage.style.position = 'absolute';
    dragImage.style.top = '-1000px';
    document.body.appendChild(dragImage);
    e.dataTransfer.setDragImage(dragImage, 50, 20);
    
    setTimeout(() => document.body.removeChild(dragImage), 0);
  };

  const handleSectionDragEnd = () => {
    onSectionDragEnd();
  };

  // Section touch handlers
  const sectionTouchStartRef = useRef<{ x: number; y: number } | null>(null);
  const sectionTouchHoldTimerRef = useRef<NodeJS.Timeout | null>(null);
  const sectionTouchGhostRef = useRef<HTMLDivElement | null>(null);

  const handleSectionTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    sectionTouchStartRef.current = { x: touch.clientX, y: touch.clientY };

    sectionTouchHoldTimerRef.current = setTimeout(() => {
      if (navigator.vibrate) navigator.vibrate(50);
      
      if (headerRef.current) {
        onSectionDragStart(sectionIndex, headerRef.current);
      }

      // Create ghost
      const ghost = document.createElement('div');
      ghost.className = 'fixed pointer-events-none z-[9999] bg-primary text-primary-foreground px-5 py-3 rounded-xl shadow-2xl font-medium';
      ghost.textContent = `${section.name}`;
      ghost.style.left = `${touch.clientX - 60}px`;
      ghost.style.top = `${touch.clientY - 25}px`;
      ghost.style.transform = 'scale(1.05)';
      document.body.appendChild(ghost);
      sectionTouchGhostRef.current = ghost;
    }, 250);
  }, [section.name, sectionIndex, onSectionDragStart]);

  const handleSectionTouchMove = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];

    if (!isSectionDragging && sectionTouchStartRef.current) {
      const dx = Math.abs(touch.clientX - sectionTouchStartRef.current.x);
      const dy = Math.abs(touch.clientY - sectionTouchStartRef.current.y);
      if (dx > 10 || dy > 10) {
        if (sectionTouchHoldTimerRef.current) {
          clearTimeout(sectionTouchHoldTimerRef.current);
          sectionTouchHoldTimerRef.current = null;
        }
        return;
      }
    }

    if (!isSectionDragging) return;
    e.preventDefault();

    if (sectionTouchGhostRef.current) {
      sectionTouchGhostRef.current.style.left = `${touch.clientX - 60}px`;
      sectionTouchGhostRef.current.style.top = `${touch.clientY - 25}px`;
    }
  }, [isSectionDragging]);

  const handleSectionTouchEnd = useCallback(() => {
    if (sectionTouchHoldTimerRef.current) {
      clearTimeout(sectionTouchHoldTimerRef.current);
      sectionTouchHoldTimerRef.current = null;
    }

    if (sectionTouchGhostRef.current) {
      document.body.removeChild(sectionTouchGhostRef.current);
      sectionTouchGhostRef.current = null;
    }

    onSectionDragEnd();
    sectionTouchStartRef.current = null;
  }, [onSectionDragEnd]);

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

  // Check if this section should show drop indicator
  const showDropIndicatorBefore = sectionDraggedIndex !== null && 
    sectionDropTargetIndex === sectionIndex && 
    sectionDropPosition === 'before' && 
    sectionDraggedIndex !== sectionIndex;
  
  const showDropIndicatorAfter = sectionDraggedIndex !== null && 
    sectionDropTargetIndex === sectionIndex && 
    sectionDropPosition === 'after' && 
    sectionDraggedIndex !== sectionIndex;

  const isBeingDragged = sectionDraggedIndex === sectionIndex;

  return (
    <div className="relative">
      {/* Drop indicator BEFORE this section */}
      <div 
        className={`h-2 -mt-2 mb-2 mx-4 rounded-full transition-all duration-200 ${
          showDropIndicatorBefore 
            ? 'bg-primary animate-pulse' 
            : 'bg-transparent'
        }`} 
      />

      <div 
        className={`bg-card border-2 rounded-xl overflow-hidden transition-all duration-200 ${
          isBeingDragged ? 'opacity-50 scale-[0.98] border-primary border-dashed' :
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
          ref={headerRef}
          className={`flex items-center justify-between px-4 py-3 bg-secondary/30 border-b border-border select-none transition-colors ${
            isBeingDragged ? 'cursor-grabbing' : 'cursor-grab hover:bg-secondary/50'
          }`}
          draggable
          onDragStart={handleSectionDragStart}
          onDragEnd={handleSectionDragEnd}
          onTouchStart={handleSectionTouchStart}
          onTouchMove={handleSectionTouchMove}
          onTouchEnd={handleSectionTouchEnd}
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
            <div 
              className="flex flex-wrap gap-3"
              onTouchMove={handleChordTouchMove}
              onTouchEnd={handleChordTouchEnd}
            >
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
                    onDrop={(e) => handleDrop(e, index)}
                    onDragEnd={handleDragEnd}
                    onTouchStart={(e) => handleChordTouchStart(e, index)}
                    className={`relative flex items-center transition-all duration-200 ${
                      isDragging ? 'opacity-40 scale-95' : ''
                    }`}
                  >
                    {/* Drop indicator - before */}
                    <div className={`absolute -left-2 top-0 bottom-0 w-1 rounded-full transition-all duration-200 ${
                      showBeforeIndicator ? 'bg-primary animate-pulse' : 'bg-transparent'
                    }`} />
                    
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
                    <div className={`absolute -right-2 top-0 bottom-0 w-1 rounded-full transition-all duration-200 ${
                      showAfterIndicator ? 'bg-primary animate-pulse' : 'bg-transparent'
                    }`} />
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

      {/* Drop indicator AFTER this section */}
      <div 
        className={`h-2 mt-2 -mb-2 mx-4 rounded-full transition-all duration-200 ${
          showDropIndicatorAfter 
            ? 'bg-primary animate-pulse' 
            : 'bg-transparent'
        }`} 
      />
    </div>
  );
}
