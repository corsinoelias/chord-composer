/**
 * Hook for AI-powered chord suggestions
 * Uses Lovable AI to suggest chords based on music theory
 */

import { useState, useCallback } from 'react';
import { Chord } from '@/lib/musicTheory';

export interface ChordSuggestion {
  chord: Chord;
  reason: string;
  confidence: number;
}

interface UseChordSuggestionsReturn {
  suggestions: ChordSuggestion[];
  isLoading: boolean;
  error: string | null;
  getSuggestions: (currentChords: Chord[], styleId: string, key?: string) => Promise<void>;
  clearSuggestions: () => void;
}

// Music theory based suggestions (fallback when AI is not available)
function getMusicTheorySuggestions(currentChords: Chord[], styleId: string): ChordSuggestion[] {
  if (currentChords.length === 0) {
    // Suggest common starting chords
    return [
      { chord: { id: 'sug-1', root: 'C', accidental: '', quality: 'maj', duration: 4 }, reason: 'Classic starting chord', confidence: 0.9 },
      { chord: { id: 'sug-2', root: 'G', accidental: '', quality: 'maj', duration: 4 }, reason: 'Popular open chord', confidence: 0.85 },
      { chord: { id: 'sug-3', root: 'A', accidental: '', quality: 'min', duration: 4 }, reason: 'Melancholic tone', confidence: 0.8 },
      { chord: { id: 'sug-4', root: 'E', accidental: '', quality: 'min', duration: 4 }, reason: 'Emotional & versatile', confidence: 0.75 },
    ];
  }

  const lastChord = currentChords[currentChords.length - 1];
  const root = lastChord.root;
  const quality = lastChord.quality;

  // Common chord progressions based on the last chord
  const suggestions: ChordSuggestion[] = [];

  // Define relative chord relationships
  const circleOfFifths = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#', 'F'];
  const currentIndex = circleOfFifths.findIndex(n => n === root || n.replace('#', 's') === root + lastChord.accidental);
  
  if (currentIndex !== -1) {
    // Suggest the V chord (dominant)
    const fifthIndex = (currentIndex + 1) % 12;
    const fifthNote = circleOfFifths[fifthIndex];
    suggestions.push({
      chord: { id: 'sug-v', root: fifthNote.replace('#', '') as any, accidental: fifthNote.includes('#') ? '#' : '' as any, quality: 'maj', duration: 4 },
      reason: 'V chord (dominant) - creates tension',
      confidence: 0.9
    });

    // Suggest the IV chord (subdominant)
    const fourthIndex = (currentIndex - 1 + 12) % 12;
    const fourthNote = circleOfFifths[fourthIndex];
    suggestions.push({
      chord: { id: 'sug-iv', root: fourthNote.replace('#', '') as any, accidental: fourthNote.includes('#') ? '#' : '' as any, quality: 'maj', duration: 4 },
      reason: 'IV chord (subdominant) - smooth transition',
      confidence: 0.85
    });
  }

  // If current is major, suggest relative minor
  if (quality === 'maj' || quality === '7' || quality === 'maj7') {
    const minorRoot = getRelativeMinor(root);
    suggestions.push({
      chord: { id: 'sug-vi', root: minorRoot as any, accidental: '', quality: 'min', duration: 4 },
      reason: 'vi chord (relative minor) - adds emotion',
      confidence: 0.8
    });
  }

  // If current is minor, suggest relative major
  if (quality === 'min' || quality === 'min7') {
    const majorRoot = getRelativeMajor(root);
    suggestions.push({
      chord: { id: 'sug-III', root: majorRoot as any, accidental: '', quality: 'maj', duration: 4 },
      reason: 'III chord (relative major) - brightens mood',
      confidence: 0.8
    });
  }

  // Add style-specific suggestions
  if (styleId.includes('jazz') || styleId.includes('bossa')) {
    suggestions.push({
      chord: { id: 'sug-7', root: root as any, accidental: lastChord.accidental, quality: 'maj7', duration: 4 },
      reason: 'Major 7th - jazzy sophistication',
      confidence: 0.75
    });
  }

  if (styleId.includes('blues') || styleId.includes('rock')) {
    suggestions.push({
      chord: { id: 'sug-dom7', root: root as any, accidental: lastChord.accidental, quality: '7', duration: 4 },
      reason: 'Dominant 7th - bluesy feel',
      confidence: 0.75
    });
  }

  return suggestions.slice(0, 5);
}

function getRelativeMinor(majorRoot: string): string {
  const map: Record<string, string> = {
    'C': 'A', 'G': 'E', 'D': 'B', 'A': 'F', 'E': 'C',
    'B': 'G', 'F': 'D', 'Bb': 'G', 'Eb': 'C', 'Ab': 'F'
  };
  return map[majorRoot] || 'A';
}

function getRelativeMajor(minorRoot: string): string {
  const map: Record<string, string> = {
    'A': 'C', 'E': 'G', 'B': 'D', 'F': 'A', 'C': 'E',
    'G': 'B', 'D': 'F'
  };
  return map[minorRoot] || 'C';
}

export function useChordSuggestions(): UseChordSuggestionsReturn {
  const [suggestions, setSuggestions] = useState<ChordSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getSuggestions = useCallback(async (
    currentChords: Chord[],
    styleId: string,
    key?: string
  ) => {
    setIsLoading(true);
    setError(null);

    try {
      // For now, use music theory based suggestions
      // In the future, this will call the AI edge function
      const theorySuggestions = getMusicTheorySuggestions(currentChords, styleId);
      
      // Simulate a small delay for better UX
      await new Promise(resolve => setTimeout(resolve, 300));
      
      setSuggestions(theorySuggestions);
    } catch (err) {
      console.error('Error getting chord suggestions:', err);
      setError('Failed to get suggestions');
      // Fallback to basic suggestions
      setSuggestions(getMusicTheorySuggestions(currentChords, styleId));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearSuggestions = useCallback(() => {
    setSuggestions([]);
    setError(null);
  }, []);

  return {
    suggestions,
    isLoading,
    error,
    getSuggestions,
    clearSuggestions,
  };
}
