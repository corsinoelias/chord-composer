import { memo, useMemo } from 'react';
import { Chord, formatChord } from '@/lib/musicTheory';
import { X, Copy } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

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

/** Get a human-readable quality label */
function getQualityLabel(quality: string): string {
  const q = quality.toLowerCase();
  if (q === 'maj' || q === '') return 'Major';
  if (q === 'min' || q === 'm') return 'Minor';
  if (q.includes('dim')) return 'Diminished';
  if (q.includes('aug')) return 'Augmented';
  if (q.includes('sus')) return 'Suspended';
  if (q.includes('7')) return 'Seventh';
  return quality;
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
  const qualityLabel = useMemo(() => getQualityLabel(chord.quality), [chord.quality]);

  return (
    <TooltipProvider delayDuration={500}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={`
              group relative flex flex-col items-center justify-center
              rounded-lg border transition-all duration-100
              cursor-grab active:cursor-grabbing select-none
              ${isPlaying 
                ? 'shadow-lg scale-[1.03]' 
                : 'hover:shadow-md hover:scale-[1.02]'
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
              className="font-mono font-bold text-sm sm:text-base leading-none"
              style={{ color: isPlaying ? `hsl(${colorVar})` : 'hsl(var(--foreground))' }}
            >
              {formatChord(chord)}
            </span>
            
            {/* Duration dots */}
            <div className="flex gap-0.5 mt-1">
              {Array.from({ length: Math.min(chord.duration, 8) }).map((_, i) => (
                <div
                  key={i}
                  className={`w-1 h-1 rounded-full transition-all duration-100 ${
                    isPlaying ? 'scale-125' : ''
                  }`}
                  style={{ backgroundColor: `hsl(${colorVar} / ${isPlaying ? 0.9 : 0.45})` }}
                />
              ))}
            </div>
            
            {/* Delete button - desktop hover */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="
                absolute -top-1.5 -right-1.5
                w-5 h-5 rounded-full 
                bg-destructive text-destructive-foreground
                flex items-center justify-center
                opacity-0 group-hover:opacity-100
                transition-opacity duration-100
                hover:scale-110 shadow-sm
                hidden sm:flex
              "
              aria-label="Delete chord"
            >
              <X size={10} />
            </button>

            {/* Duplicate button - desktop hover */}
            {onDuplicate && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDuplicate();
                }}
                className="
                  absolute -top-1.5 right-4
                  w-5 h-5 rounded-full 
                  bg-card text-foreground border border-border
                  flex items-center justify-center
                  opacity-0 group-hover:opacity-100
                  transition-opacity duration-100
                  hover:scale-110 shadow-sm
                  hidden sm:flex
                "
                aria-label="Duplicate chord"
              >
                <Copy size={10} />
              </button>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          <span className="font-medium">{formatChord(chord)}</span>
          <span className="text-muted-foreground ml-1">· {qualityLabel} · {chord.duration} {chord.duration === 1 ? 'beat' : 'beats'}</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});