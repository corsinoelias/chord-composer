/**
 * Chord Suggestions Component
 * 
 * Displays AI-powered chord suggestions based on current progression
 */

import { memo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Plus, Lightbulb, RefreshCw } from 'lucide-react';
import { Chord, formatChord, generateChordId } from '@/lib/musicTheory';
import { useChordSuggestions, ChordSuggestion } from '@/hooks/useChordSuggestions';

interface ChordSuggestionsProps {
  currentChords: Chord[];
  styleId: string;
  onAddChord: (chord: Chord) => void;
  className?: string;
}

export const ChordSuggestions = memo(function ChordSuggestions({
  currentChords,
  styleId,
  onAddChord,
  className = '',
}: ChordSuggestionsProps) {
  const { suggestions, isLoading, error, getSuggestions, clearSuggestions } = useChordSuggestions();

  const handleOpen = (open: boolean) => {
    if (open) {
      getSuggestions(currentChords, styleId);
    } else {
      clearSuggestions();
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
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-4 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-primary" />
              <h4 className="font-medium">Chord Suggestions</h4>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleRefresh}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Based on music theory & your style
          </p>
        </div>

        <div className="p-2 max-h-72 overflow-y-auto">
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

        <div className="p-3 border-t bg-muted/50">
          <p className="text-xs text-muted-foreground text-center">
            Click a suggestion to add it to your progression
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
