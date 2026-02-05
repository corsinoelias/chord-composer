import { memo, useMemo } from 'react';
import { Chord, formatChord } from '@/lib/musicTheory';
import { X, Copy } from 'lucide-react';

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
        rounded-lg border transition-all duration-100
        cursor-grab active:cursor-grabbing select-none
        ${isPlaying 
          ? 'shadow-lg' 
          : 'hover:shadow-md'
        }
        ${isDragging ? 'opacity-50 scale-95' : ''}
      `}
      style={{ 
        width: fixedWidth ? '3.5rem' : `${Math.max(chord.duration * 3.5, 3.5)}rem`,
        minWidth: '3.5rem',
        height: '3.5rem',
        backgroundColor: isPlaying 
          ? `hsl(${colorVar} / 0.18)`
          : `hsl(${colorVar} / 0.08)`,
        borderColor: isPlaying 
          ? `hsl(${colorVar})`
          : `hsl(${colorVar} / 0.25)`,
        boxShadow: isPlaying 
          ? `0 0 12px hsl(${colorVar} / 0.25)`
          : undefined,
      }}
    >
      {/* Chord name */}
      <span 
        className="font-mono font-bold text-sm sm:text-base"
        style={{ color: isPlaying ? `hsl(${colorVar})` : 'hsl(var(--foreground))' }}
      >
        {formatChord(chord)}
      </span>
      
      {/* Duration indicator */}
      <span 
        className="text-[9px] sm:text-[10px] mt-0.5"
        style={{ color: `hsl(${colorVar} / 0.7)` }}
      >
        {chord.duration}b
      </span>
      
      {/* Delete button - hidden on mobile, show on hover on desktop */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="
          absolute -top-1 -right-1
          w-4 h-4 sm:w-5 sm:h-5 rounded-full 
          bg-destructive text-destructive-foreground
          flex items-center justify-center
          opacity-0 group-hover:opacity-100
          transition-opacity duration-100
          hover:scale-110 shadow-sm
          hidden sm:flex
        "
        aria-label="Delete chord"
      >
        <X size={8} />
      </button>

      {/* Duplicate button - hidden on mobile */}
      {onDuplicate && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate();
          }}
          className="
            absolute -top-1 right-3 sm:right-4
            w-4 h-4 sm:w-5 sm:h-5 rounded-full 
            bg-card text-foreground border border-border
            flex items-center justify-center
            opacity-0 group-hover:opacity-100
            transition-opacity duration-100
            hover:scale-110 shadow-sm
            hidden sm:flex
          "
          aria-label="Duplicate chord"
        >
          <Copy size={8} />
        </button>
      )}
    </div>
  );
});
