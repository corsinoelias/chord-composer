import { memo, useMemo } from 'react';
import { type Chord } from '@/lib/musicTheory';
import { getTransposedChordName } from '@/lib/chordNotes';
import { X, Copy } from 'lucide-react';

/** Split a transposed chord name into [chordPart, bassNotePart | null] */
function splitChordName(chord: Chord, transposition: number): [string, string | null] {
  const full = getTransposedChordName(chord, transposition)
  const slash = full.indexOf('/')
  if (slash === -1) return [full, null]
  return [full.slice(0, slash), full.slice(slash)]  // bass part keeps the '/'
}

interface ChordBlockProps {
  chord: Chord;
  isPlaying: boolean;
  isSelected?: boolean;
  onDelete: () => void;
  onDuplicate?: () => void;
  isDragging?: boolean;
  fixedWidth?: boolean;
  transposition?: number;
  isOutOfScale?: boolean;
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
  isSelected = false,
  onDelete,
  onDuplicate,
  isDragging,
  fixedWidth = false,
  transposition = 0,
  isOutOfScale = false,
}: ChordBlockProps) {
  const colorVar = useMemo(() => getChordColorVar(chord.quality), [chord.quality]);
  const [chordPart, bassPart] = useMemo(
    () => splitChordName(chord, transposition),
    [chord, transposition],
  );

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
        ${isOutOfScale && !isPlaying ? 'opacity-35 grayscale-[60%]' : ''}
      `}
      style={{
        width: fixedWidth ? '3.5rem' : `${Math.max(chord.duration * 3.5, 3.5)}rem`,
        minWidth: '3.5rem',
        height: '3.5rem',
        backgroundColor: isPlaying
          ? `hsl(${colorVar} / 0.18)`
          : isSelected
            ? `hsl(${colorVar} / 0.14)`
            : `hsl(${colorVar} / 0.08)`,
        borderColor: isSelected
          ? `hsl(var(--primary))`
          : isPlaying
            ? `hsl(${colorVar})`
            : `hsl(${colorVar} / 0.25)`,
        boxShadow: isSelected
          ? `0 0 0 2px hsl(var(--primary) / 0.5)`
          : isPlaying
            ? `0 0 12px hsl(${colorVar} / 0.25)`
            : undefined,
      }}
    >
      {/* Chord name — split into two lines for slash chords */}
      <div className="flex flex-col items-center leading-none gap-px">
        <span
          className={`font-mono font-bold leading-none ${bassPart ? 'text-xs sm:text-sm' : 'text-sm sm:text-base'}`}
          style={{ color: isPlaying ? `hsl(${colorVar})` : 'hsl(var(--foreground))' }}
        >
          {chordPart}
        </span>
        {bassPart && (
          <span
            className="font-mono font-semibold text-[10px] sm:text-xs leading-none"
            style={{ color: isPlaying ? `hsl(${colorVar} / 0.8)` : 'hsl(var(--muted-foreground))' }}
          >
            {bassPart}
          </span>
        )}
      </div>

      {/* Duration indicator - visual dots */}
      <div className="flex gap-0.5 mt-0.5">
        {Array.from({ length: Math.min(chord.duration, 8) }).map((_, i) => (
          <div
            key={i}
            className="w-1 h-1 rounded-full"
            style={{ backgroundColor: `hsl(${colorVar} / ${isPlaying ? 0.8 : 0.5})` }}
          />
        ))}
      </div>
      
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
