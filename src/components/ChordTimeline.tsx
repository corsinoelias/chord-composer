import { useState, useRef, useEffect } from 'react';
import { Chord } from '@/lib/musicTheory';
import { ChordBlock } from './ChordBlock';
import { Music } from 'lucide-react';

interface ChordTimelineProps {
  chords: Chord[];
  currentChordIndex: number;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onDelete: (index: number) => void;
}

/**
 * ChordTimeline Component
 * 
 * Displays the chord progression as a horizontal timeline.
 * Supports drag-and-drop reordering of chords.
 */
export function ChordTimeline({ chords, currentChordIndex, onReorder, onDelete }: ChordTimelineProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Scroll to current chord during playback
  useEffect(() => {
    if (currentChordIndex >= 0 && containerRef.current) {
      const chordElements = containerRef.current.querySelectorAll('[data-chord-block]');
      const currentElement = chordElements[currentChordIndex] as HTMLElement;
      if (currentElement) {
        currentElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [currentChordIndex]);
  
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
  
  const handleDragLeave = () => {
    setDragOverIndex(null);
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
  
  if (chords.length === 0) {
    return (
      <div className="
        bg-card border border-border rounded-xl p-8
        flex flex-col items-center justify-center
        min-h-[160px] text-center
      ">
        <Music className="w-12 h-12 text-muted-foreground/30 mb-3" />
        <p className="text-muted-foreground text-sm">
          No chords yet. Add some chords to start building your progression!
        </p>
      </div>
    );
  }
  
  return (
    <div className="bg-card border border-border rounded-xl p-4 overflow-hidden">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
        <span className="text-xs text-muted-foreground uppercase tracking-wide">
          Timeline
        </span>
        <span className="text-xs text-muted-foreground ml-auto">
          {chords.length} {chords.length === 1 ? 'chord' : 'chords'}
        </span>
      </div>
      
      <div
        ref={containerRef}
        className="flex gap-3 overflow-x-auto pb-3 pt-2 px-1 scrollbar-thin"
        style={{ scrollbarWidth: 'thin' }}
      >
        {chords.map((chord, index) => (
          <div
            key={chord.id}
            data-chord-block
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, index)}
            onDragEnd={handleDragEnd}
            className={`
              group relative shrink-0
              ${dragOverIndex === index && draggedIndex !== index ? 'pl-4' : ''}
              transition-all duration-200
            `}
          >
            {/* Drop indicator */}
            {dragOverIndex === index && draggedIndex !== index && (
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-full" />
            )}
            
            <ChordBlock
              chord={chord}
              isPlaying={currentChordIndex === index}
              onDelete={() => onDelete(index)}
              isDragging={draggedIndex === index}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
