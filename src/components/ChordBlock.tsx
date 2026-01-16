import { memo, useMemo } from 'react';
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
 * Returns the CSS variable name for chord quality color
 */
function getChordColorVar(quality: string): string {
  const q = quality.toLowerCase();
  if (q.includes('dim')) return 'var(--chord-diminished)';
  if (q.includes('aug')) return 'var(--chord-aug)';
  if (q.includes('sus')) return 'var(--chord-sus)';
  if (q.includes('7') || q.includes('9') || q.includes('11') || q.includes('13')) return 'var(--chord-seventh)';
  if (q.includes('min') || q === 'm') return 'var(--chord-minor)';
  return 'var(--chord-major)';
}

export const ChordBlock = memo(function ChordBlock({ 
  chord, 
  isPlaying, 
  onDelete, 
  onDuplicate, 
  isDragging, 
  fixedWidth = false 
}: ChordBlockProps) {
  const colorVar = useMemo(() => getChordColorVar(chord.quality), [chord.quality]);

  return (
    <div
      className={`
        group relative flex flex-col items-center justify-center
        rounded-xl border-2 transition-all duration-200
        cursor-grab active:cursor-grabbing select-none
        ${isPlaying 
          ? 'scale-105 shadow-xl' 
          : 'hover:shadow-lg hover:-translate-y-0.5'
        }
        ${isDragging ? 'opacity-50 scale-95' : ''}
      `}
      style={{ 
        width: fixedWidth ? '5.5rem' : `${Math.max(chord.duration * 4.5, 5.5)}rem`,
        minWidth: '5rem',
        height: '5.5rem',
        backgroundColor: isPlaying 
          ? `hsl(${colorVar} / 0.2)`
          : `hsl(${colorVar} / 0.08)`,
        borderColor: isPlaying 
          ? `hsl(${colorVar})`
          : `hsl(${colorVar} / 0.3)`,
        boxShadow: isPlaying 
          ? `0 0 20px hsl(${colorVar} / 0.3), inset 0 0 20px hsl(${colorVar} / 0.1)`
          : undefined,
      }}
    >
      {/* Drag handle indicator */}
      <div 
        className="absolute left-1.5 top-1/2 -translate-y-1/2 opacity-40 group-hover:opacity-60 transition-opacity"
        style={{ color: `hsl(${colorVar})` }}
      >
        <GripVertical size={14} />
      </div>
      
      {/* Chord name */}
      <span 
        className="font-mono font-bold text-xl transition-colors"
        style={{ color: isPlaying ? `hsl(${colorVar})` : 'hsl(var(--foreground))' }}
      >
        {formatChord(chord)}
      </span>
      
      {/* Duration indicator */}
      <span 
        className="text-xs mt-1 transition-colors"
        style={{ color: `hsl(${colorVar} / 0.7)` }}
      >
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
          w-6 h-6 rounded-full 
          bg-destructive text-destructive-foreground
          flex items-center justify-center
          opacity-0 group-hover:opacity-100
          transition-all duration-200
          hover:scale-110 shadow-md
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
            w-6 h-6 rounded-full 
            bg-card text-foreground border border-border
            flex items-center justify-center
            opacity-0 group-hover:opacity-100
            transition-all duration-200
            hover:scale-110 shadow-md
            hidden sm:flex
          "
          aria-label="Duplicate chord"
        >
          <Copy size={10} />
        </button>
      )}
      
      {/* Playing indicator animation */}
      {isPlaying && (
        <div 
          className="absolute inset-0 rounded-xl animate-pulse pointer-events-none"
          style={{ backgroundColor: `hsl(${colorVar} / 0.1)` }}
        />
      )}
    </div>
  );
});
