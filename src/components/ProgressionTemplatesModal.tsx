/**
 * Progression Templates Modal
 * 
 * Allows users to quickly load famous chord progressions.
 * Organized by genre with song examples and audio preview.
 */

import { useState, useCallback, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Chord, generateChordId, formatChord } from '@/lib/musicTheory';
import { GENRE_PROGRESSIONS, progressionToChords } from '@/lib/chordProgressions';
import { playChordPreview } from '@/lib/audioEngine';
import { Music2, Play, Square, Check, Headphones } from 'lucide-react';

interface ProgressionTemplatesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (chords: Chord[]) => void;
}

export function ProgressionTemplatesModal({
  open,
  onOpenChange,
  onSelect,
}: ProgressionTemplatesModalProps) {
  const [selectedGenre, setSelectedGenre] = useState<string>(GENRE_PROGRESSIONS[0]?.id || 'pop');
  const [appliedId, setAppliedId] = useState<string | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const previewTimeoutRef = useRef<NodeJS.Timeout[]>([]);

  const stopPreview = useCallback(() => {
    previewTimeoutRef.current.forEach(t => clearTimeout(t));
    previewTimeoutRef.current = [];
    setPreviewingId(null);
  }, []);

  const playPreview = useCallback((chords: Chord[], id: string) => {
    stopPreview();
    setPreviewingId(id);
    
    const chordDuration = 550;
    chords.forEach((chord, index) => {
      const timeout = setTimeout(() => {
        playChordPreview(chord);
      }, index * chordDuration);
      previewTimeoutRef.current.push(timeout);
    });
    
    const endTimeout = setTimeout(() => {
      setPreviewingId(null);
    }, chords.length * chordDuration + 400);
    previewTimeoutRef.current.push(endTimeout);
  }, [stopPreview]);

  const handleSelect = useCallback((genreId: string, progIdx: number) => {
    stopPreview();
    const genre = GENRE_PROGRESSIONS.find(g => g.id === genreId);
    if (!genre) return;
    
    const prog = genre.progressions[progIdx];
    const chords = progressionToChords(prog);
    onSelect(chords);
    
    // Show applied state, then close
    const id = `${genreId}-${progIdx}`;
    setAppliedId(id);
    setTimeout(() => {
      onOpenChange(false);
      setAppliedId(null);
    }, 500);
  }, [onSelect, onOpenChange, stopPreview]);

  const handlePreview = useCallback((genreId: string, progIdx: number) => {
    const id = `${genreId}-${progIdx}`;
    if (previewingId === id) {
      stopPreview();
      return;
    }
    const genre = GENRE_PROGRESSIONS.find(g => g.id === genreId);
    if (!genre) return;
    const chords = progressionToChords(genre.progressions[progIdx]);
    playPreview(chords, id);
  }, [previewingId, stopPreview, playPreview]);

  const handleOpenChange = useCallback((open: boolean) => {
    if (!open) {
      stopPreview();
      setAppliedId(null);
    }
    onOpenChange(open);
  }, [onOpenChange, stopPreview]);

  const currentGenre = GENRE_PROGRESSIONS.find(g => g.id === selectedGenre) || GENRE_PROGRESSIONS[0];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] p-0 gap-0 overflow-hidden">
        <DialogHeader className="p-4 pb-3 border-b border-border">
          <DialogTitle className="flex items-center gap-2">
            <Music2 className="h-5 w-5 text-primary" />
            Progression Templates
          </DialogTitle>
        </DialogHeader>

        {/* Genre tabs */}
        <div className="border-b border-border px-4 py-2 overflow-x-auto">
          <div className="flex gap-1 min-w-max">
            {GENRE_PROGRESSIONS.map((genre) => (
              <Button
                key={genre.id}
                variant={selectedGenre === genre.id ? 'default' : 'ghost'}
                size="sm"
                className="h-7 text-xs px-3 shrink-0"
                onClick={() => setSelectedGenre(genre.id)}
              >
                {genre.name}
              </Button>
            ))}
          </div>
        </div>

        {/* Progressions list */}
        <ScrollArea className="flex-1 max-h-[55vh]">
          <div className="p-3 space-y-2">
            {currentGenre.progressions.map((prog, idx) => {
              const id = `${currentGenre.id}-${idx}`;
              const isPreviewing = previewingId === id;
              const isApplied = appliedId === id;
              
              return (
                <div
                  key={idx}
                  className={`p-3 rounded-lg border transition-all duration-100 cursor-pointer group ${
                    isApplied
                      ? 'border-[hsl(var(--success))] bg-[hsl(var(--success)/0.08)]'
                      : 'border-border hover:border-primary/40 hover:bg-accent/50'
                  }`}
                  onClick={() => handleSelect(currentGenre.id, idx)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <h3 className="font-semibold text-sm text-foreground">
                          {prog.name}
                        </h3>
                      </div>
                      
                      {/* Chord preview chips */}
                      <div className="flex flex-wrap gap-1 mb-2">
                        {prog.chords.slice(0, 8).map((chord, i) => (
                          <span
                            key={i}
                            className="px-1.5 py-0.5 rounded text-xs font-mono bg-secondary text-secondary-foreground"
                          >
                            {chord.root}
                            {chord.accidental === '#' ? '♯' : chord.accidental === 'b' ? '♭' : ''}
                            {chord.quality === 'maj' ? '' : chord.quality}
                          </span>
                        ))}
                        {prog.chords.length > 8 && (
                          <span className="text-xs text-muted-foreground self-center">
                            +{prog.chords.length - 8}
                          </span>
                        )}
                      </div>
                      
                      {/* Song examples */}
                      {prog.examples && prog.examples.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          🎵 {prog.examples.join(' · ')}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Preview button */}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePreview(currentGenre.id, idx);
                        }}
                      >
                        {isPreviewing ? (
                          <Square className="h-4 w-4" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                      </Button>
                      
                      {/* Apply button */}
                      <Button
                        size="sm"
                        variant={isApplied ? 'default' : 'secondary'}
                        className={`h-8 text-xs ${isApplied ? 'bg-[hsl(var(--success))]' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelect(currentGenre.id, idx);
                        }}
                      >
                        {isApplied ? (
                          <><Check className="h-3 w-3 mr-1" /> Applied</>
                        ) : (
                          'Use'
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <div className="p-2 border-t border-border bg-muted/50">
          <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1">
            <Headphones className="h-3 w-3" />
            ▶ preview · click to apply
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}