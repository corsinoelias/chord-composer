import { memo } from 'react';
import { Chord, formatChord } from '@/lib/musicTheory';
import { X, GripVertical, Copy } from 'lucide-react';

interface ChordBlockProps {
  chord: Chord;
  isPlaying: boolean;
  onDelete: () => void;
  onDuplicate?: () => void;
  isDragging?: boolean;
  fixedWidth?: boolean;
}

/**
 * ChordBlock Component
 * 
 * Displays a single chord in the timeline.
 * Can use fixed width or proportional width based on duration.
 * Memoized to prevent unnecessary re-renders.
 */
export const ChordBlock = memo(function ChordBlock({ chord, isPlaying, onDelete, onDuplicate, isDragging, fixedWidth = false }: ChordBlockProps) {
  return (
    <div
      className={`
        group relative flex flex-col items-center justify-center
        rounded-lg border-2 transition-all duration-200
        cursor-grab active:cursor-grabbing select-none
        ${isPlaying 
          ? 'border-primary bg-primary/20 shadow-lg scale-105' 
          : 'border-border bg-card hover:border-primary/50 hover:shadow-md'
        }
        ${isDragging ? 'opacity-50 scale-95' : ''}
      `}
      style={{ 
        width: fixedWidth ? '5rem' : `${chord.duration * 5}rem`,
        minWidth: '4rem',
        height: '5rem',
      }}
    >
      {/* Drag handle indicator */}
      <div className="absolute left-1 top-1/2 -translate-y-1/2 text-muted-foreground/50">
        <GripVertical size={14} />
      </div>
      
      {/* Chord name */}
      <span className={`
        font-mono font-bold text-lg
        ${isPlaying ? 'text-primary' : 'text-foreground'}
      `}>
        {formatChord(chord)}
      </span>
      
      {/* Duration indicator */}
      <span className="text-xs text-muted-foreground mt-1">
        {chord.duration} {chord.duration === 1 ? 'beat' : 'beats'}
      </span>
      
      {/* Delete button - hidden on mobile */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="
          absolute -top-2 -right-2 
          w-5 h-5 rounded-full 
          bg-destructive text-destructive-foreground
          flex items-center justify-center
          opacity-0 group-hover:opacity-100 hover:opacity-100
          transition-opacity duration-200
          hover:scale-110
          hidden sm:flex
        "
        aria-label="Delete chord"
      >
        <X size={12} />
      </button>

      {/* Duplicate button - hidden on mobile */}
      {onDuplicate && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate();
          }}
          className="
            absolute -top-2 right-5 
            w-5 h-5 rounded-full 
            bg-secondary text-secondary-foreground border border-border
            flex items-center justify-center
            opacity-0 group-hover:opacity-100 hover:opacity-100
            transition-opacity duration-200
            hover:scale-110
            hidden sm:flex
          "
          aria-label="Duplicate chord"
        >
          <Copy size={10} />
        </button>
      )}
      
      {/* Playing indicator animation */}
      {isPlaying && (
        <div className="absolute inset-0 rounded-lg animate-pulse bg-primary/10 pointer-events-none" />
      )}
    </div>
  );
});
