/**
 * Chord Suggestions Component
 * 
 * Displays chord progression templates organized by genre.
 * Closes automatically when a progression is applied, with visual feedback.
 */

import { memo, useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Plus, Shuffle, Music2, Play, Square, Headphones, Check } from 'lucide-react';
import { type Chord, formatChord } from '@/lib/musicTheory';
import { useChordSuggestions, type ProgressionSuggestion } from '@/hooks/useChordSuggestions';
import { GENRE_PROGRESSIONS, progressionToChords } from '@/lib/chordProgressions';
import { toast } from 'sonner';
import { playChordPreview } from '@/lib/appEngine/preview';

interface ChordSuggestionsProps {
  styleId: string;
  onSetProgression: (chords: Chord[]) => void;
  className?: string;
  /** `tile` sits in the chord grid beside the chords, as in the Android app. */
  variant?: 'button' | 'tile';
}

export const ChordSuggestions = memo(function ChordSuggestions({
  styleId,
  onSetProgression,
  className = '',
  variant = 'button',
}: ChordSuggestionsProps) {
  const { generateProgression } = useChordSuggestions();
  const [generatedProgression, setGeneratedProgression] = useState<ProgressionSuggestion | null>(null);
  const [previewingChords, setPreviewingChords] = useState<Chord[] | null>(null);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [appliedId, setAppliedId] = useState<string | null>(null);
  const previewTimeoutRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const stopPreview = useCallback(() => {
    previewTimeoutRef.current.forEach(t => clearTimeout(t));
    previewTimeoutRef.current = [];
    setIsPreviewPlaying(false);
    setPreviewingChords(null);
  }, []);

  const playPreview = useCallback((chords: Chord[]) => {
    stopPreview();
    if (chords.length === 0) return;
    
    setIsPreviewPlaying(true);
    setPreviewingChords(chords);
    
    const chordDuration = 600;
    
    chords.forEach((chord, index) => {
      const timeout = setTimeout(() => {
        playChordPreview(chord);
      }, index * chordDuration);
      previewTimeoutRef.current.push(timeout);
    });
    
    const totalDuration = chords.length * chordDuration + 500;
    const endTimeout = setTimeout(() => {
      setIsPreviewPlaying(false);
      setPreviewingChords(null);
    }, totalDuration);
    previewTimeoutRef.current.push(endTimeout);
  }, [stopPreview]);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      stopPreview();
      setGeneratedProgression(null);
      setAppliedId(null);
    }
  };

  const handleGenerateProgression = () => {
    stopPreview();
    const result = generateProgression(styleId);
    setGeneratedProgression(result);
  };

  const handleApplyProgression = () => {
    stopPreview();
    if (generatedProgression) {
      onSetProgression(generatedProgression.chords);
      toast.success(`Applied "${generatedProgression.name}"`);
      // Close after a brief flash of confirmation
      setAppliedId('generated');
      setTimeout(() => setIsOpen(false), 400);
    }
  };

  const handlePreviewGenerated = () => {
    if (generatedProgression) {
      if (isPreviewPlaying) {
        stopPreview();
      } else {
        playPreview(generatedProgression.chords);
      }
    }
  };

  const handleApplyPresetProgression = (genreId: string, progressionIndex: number) => {
    stopPreview();
    const genre = GENRE_PROGRESSIONS.find(g => g.id === genreId);
    if (genre) {
      const progression = genre.progressions[progressionIndex];
      const chords = progressionToChords(progression);
      onSetProgression(chords);
      toast.success(`Applied "${progression.name}"`);
      // Show applied state then close
      setAppliedId(`${genreId}-${progressionIndex}`);
      setTimeout(() => setIsOpen(false), 400);
    }
  };

  const handlePreviewPreset = (genreId: string, progressionIndex: number) => {
    const genre = GENRE_PROGRESSIONS.find(g => g.id === genreId);
    if (genre) {
      const progression = genre.progressions[progressionIndex];
      const chords = progressionToChords(progression);
      
      if (isPreviewPlaying && previewingChords === chords) {
        stopPreview();
      } else {
        playPreview(chords);
      }
    }
  };

  const isPreviewingPreset = (genreId: string, progressionIndex: number): boolean => {
    if (!isPreviewPlaying || !previewingChords) return false;
    const genre = GENRE_PROGRESSIONS.find(g => g.id === genreId);
    if (!genre) return false;
    const progression = genre.progressions[progressionIndex];
    const chords = progressionToChords(progression);
    return chords.length === previewingChords.length && 
           chords.every((c, i) => c.root === previewingChords![i].root);
  };

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        {variant === 'tile' ? (
          <button className={`cp-tile ${className}`} style={{ color: 'var(--cp-act)' }}>
            <Sparkles className="h-4 w-4" />
            Suggest
          </button>
        ) : (
          <button
            className={`cp-btn cp-gh ${className}`}
            style={{ height: 36, color: 'var(--cp-act)' }}
          >
            <Sparkles className="h-4 w-4" />
            <span className="hidden sm:inline">Suggest</span>
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        <div className="p-3 border-b flex items-center gap-2">
          <Music2 className="h-4 w-4 text-primary" />
          <span className="font-medium">Chord Progressions</span>
        </div>

        <div className="p-3 border-b">
          <Button
            variant="secondary"
            size="sm"
            className="w-full gap-2"
            onClick={handleGenerateProgression}
          >
            <Shuffle className="h-4 w-4" />
            Generate Random Progression
          </Button>
        </div>

        {generatedProgression && (
          <div className="p-3 border-b bg-muted/30">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-sm font-medium">{generatedProgression.name}</p>
                <p className="text-xs text-muted-foreground">{generatedProgression.genre}</p>
              </div>
              <div className="flex items-center gap-1">
                <Button 
                  size="icon" 
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={handlePreviewGenerated}
                >
                  {isPreviewPlaying && previewingChords === generatedProgression.chords ? (
                    <Square className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                </Button>
                <Button 
                  size="sm" 
                  onClick={handleApplyProgression}
                  className={appliedId === 'generated' ? 'bg-[hsl(var(--success))] text-primary-foreground' : ''}
                >
                  {appliedId === 'generated' ? (
                    <><Check className="h-3 w-3 mr-1" /> Applied</>
                  ) : (
                    'Apply'
                  )}
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1">
              {generatedProgression.chords.map((chord, i) => (
                <Badge key={i} variant="outline" className="text-xs">
                  {formatChord(chord)}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div className="max-h-72 overflow-y-auto">
          {GENRE_PROGRESSIONS.map((genre) => (
            <div key={genre.id} className="border-b last:border-b-0">
              <div className="px-3 py-2 bg-muted/50">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {genre.name}
                </span>
              </div>
              <div className="p-1.5 space-y-0.5">
                {genre.progressions.slice(0, 4).map((prog, idx) => {
                  const isPreviewing = isPreviewingPreset(genre.id, idx);
                  const isApplied = appliedId === `${genre.id}-${idx}`;
                  
                  return (
                    <div
                      key={idx}
                      className={`flex items-center gap-2 p-2 rounded-md transition-all duration-100 group cursor-pointer ${
                        isApplied 
                          ? 'bg-[hsl(var(--success)/0.15)]' 
                          : 'hover:bg-accent'
                      }`}
                      onClick={() => handleApplyPresetProgression(genre.id, idx)}
                    >
                      {/* Preview button */}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePreviewPreset(genre.id, idx);
                        }}
                      >
                        {isPreviewing ? (
                          <Square className="h-3.5 w-3.5" />
                        ) : (
                          <Play className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      
                      {/* Progression info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{prog.name}</p>
                        <div className="flex flex-wrap gap-0.5 mt-0.5">
                          {prog.chords.slice(0, 6).map((c, i) => (
                            <span key={i} className="text-xs text-muted-foreground">
                              {c.root}{c.accidental === '#' ? '♯' : c.accidental === 'b' ? '♭' : ''}{c.quality !== 'maj' ? c.quality : ''}
                              {i < Math.min(prog.chords.length - 1, 5) ? ' → ' : ''}
                            </span>
                          ))}
                          {prog.chords.length > 6 && (
                            <span className="text-xs text-muted-foreground">...</span>
                          )}
                        </div>
                      </div>
                      
                      {/* Applied checkmark or apply icon */}
                      {isApplied ? (
                        <Check className="h-4 w-4 text-[hsl(var(--success))] shrink-0" />
                      ) : (
                        <Plus 
                          className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" 
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="p-2 border-t bg-muted/50">
          <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1">
            <Headphones className="h-3 w-3" />
            ▶ preview · click to apply
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
});

export default ChordSuggestions;