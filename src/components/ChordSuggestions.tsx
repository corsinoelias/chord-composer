/**
 * Chord Suggestions Component
 * 
 * Displays AI-powered chord suggestions based on current progression
 * and allows generating complete progressions from common patterns
 */

import { memo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sparkles, Plus, Lightbulb, RefreshCw, Shuffle, Music2 } from 'lucide-react';
import { Chord, formatChord, generateChordId } from '@/lib/musicTheory';
import { useChordSuggestions, ChordSuggestion, ProgressionSuggestion } from '@/hooks/useChordSuggestions';
import { GENRE_PROGRESSIONS, progressionToChords } from '@/lib/chordProgressions';
import { toast } from 'sonner';

interface ChordSuggestionsProps {
  currentChords: Chord[];
  styleId: string;
  onAddChord: (chord: Chord) => void;
  onSetProgression?: (chords: Chord[]) => void;
  className?: string;
}

export const ChordSuggestions = memo(function ChordSuggestions({
  currentChords,
  styleId,
  onAddChord,
  onSetProgression,
  className = '',
}: ChordSuggestionsProps) {
  const { suggestions, isLoading, error, getSuggestions, clearSuggestions, generateProgression } = useChordSuggestions();
  const [generatedProgression, setGeneratedProgression] = useState<ProgressionSuggestion | null>(null);

  const handleOpen = (open: boolean) => {
    if (open) {
      getSuggestions(currentChords, styleId);
    } else {
      clearSuggestions();
      setGeneratedProgression(null);
    }
  };

  const handleAddSuggestion = (suggestion: ChordSuggestion) => {
    const newChord: Chord = {
      ...suggestion.chord,
      id: generateChordId(),
    };
    onAddChord(newChord);
  };

  const handleRefresh = () => {
    getSuggestions(currentChords, styleId);
  };

  const handleGenerateProgression = () => {
    const result = generateProgression(styleId);
    setGeneratedProgression(result);
  };

  const handleApplyProgression = () => {
    if (generatedProgression && onSetProgression) {
      onSetProgression(generatedProgression.chords);
      toast.success(`Applied ${generatedProgression.name} progression`);
    }
  };

  const handleApplyPresetProgression = (genreId: string, progressionIndex: number) => {
    const genre = GENRE_PROGRESSIONS.find(g => g.id === genreId);
    if (genre && onSetProgression) {
      const progression = genre.progressions[progressionIndex];
      const chords = progressionToChords(progression);
      onSetProgression(chords);
      toast.success(`Applied ${progression.name} progression`);
    }
  };

  return (
    <Popover onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`gap-1.5 ${className}`}
        >
          <Sparkles className="h-4 w-4" />
          <span className="hidden sm:inline">Suggest</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        <Tabs defaultValue="next" className="w-full">
          <div className="p-3 border-b">
            <TabsList className="w-full grid grid-cols-2">
              <TabsTrigger value="next" className="text-xs">
                <Lightbulb className="h-3 w-3 mr-1" />
                Next Chord
              </TabsTrigger>
              <TabsTrigger value="generate" className="text-xs">
                <Music2 className="h-3 w-3 mr-1" />
                Progressions
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="next" className="m-0">
            <div className="p-2 border-b flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Based on music theory & style</p>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleRefresh}
                disabled={isLoading}
              >
                <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>

            <div className="p-2 max-h-64 overflow-y-auto">
              {isLoading ? (
                <div className="space-y-2 p-2">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="h-10 w-16 rounded" />
                      <div className="flex-1 space-y-1">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-3 w-full" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : error ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  {error}
                </div>
              ) : suggestions.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  No suggestions available
                </div>
              ) : (
                <div className="space-y-1">
                  {suggestions.map((suggestion, index) => (
                    <SuggestionItem
                      key={index}
                      suggestion={suggestion}
                      onAdd={() => handleAddSuggestion(suggestion)}
                    />
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="generate" className="m-0">
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
                  <Button size="sm" onClick={handleApplyProgression} disabled={!onSetProgression}>
                    Apply
                  </Button>
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

            <div className="max-h-64 overflow-y-auto">
              {GENRE_PROGRESSIONS.map((genre) => (
                <div key={genre.id} className="border-b last:border-b-0">
                  <div className="px-3 py-2 bg-muted/50">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {genre.name}
                    </span>
                  </div>
                  <div className="p-2 space-y-1">
                    {genre.progressions.slice(0, 3).map((prog, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleApplyPresetProgression(genre.id, idx)}
                        className="w-full flex items-center gap-2 p-2 rounded hover:bg-accent transition-colors text-left group"
                        disabled={!onSetProgression}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{prog.name}</p>
                          <div className="flex flex-wrap gap-1 mt-1">
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
                        <Plus className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        <div className="p-2 border-t bg-muted/50">
          <p className="text-xs text-muted-foreground text-center">
            Click to add chords or apply progressions
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
});

interface SuggestionItemProps {
  suggestion: ChordSuggestion;
  onAdd: () => void;
}

function SuggestionItem({ suggestion, onAdd }: SuggestionItemProps) {
  const displayName = formatChord(suggestion.chord);
  const confidencePercent = Math.round(suggestion.confidence * 100);

  return (
    <button
      onClick={onAdd}
      className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-accent transition-colors text-left group"
    >
      <div className="flex-shrink-0 w-14 h-10 rounded bg-primary/10 flex items-center justify-center">
        <span className="font-semibold text-primary">{displayName}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{suggestion.reason}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <Badge variant="secondary" className="text-xs">
            {confidencePercent}% match
          </Badge>
        </div>
      </div>
      <Plus className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );
}

export default ChordSuggestions;
