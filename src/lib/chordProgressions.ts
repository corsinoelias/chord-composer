/**
 * Common Chord Progressions by Genre
 * 
 * A collection of popular chord progressions organized by musical style.
 */

import { Chord, RootNote, Accidental, ChordQuality, generateChordId } from './musicTheory';

export interface ChordProgression {
  name: string;
  chords: Array<{ root: RootNote; accidental: Accidental; quality: ChordQuality }>;
}

export interface GenreProgressions {
  id: string;
  name: string;
  progressions: ChordProgression[];
}

export const GENRE_PROGRESSIONS: GenreProgressions[] = [
  {
    id: 'pop',
    name: 'Pop',
    progressions: [
      { name: 'I-V-vi-IV', chords: [
        { root: 'C', accidental: '', quality: 'maj' },
        { root: 'G', accidental: '', quality: 'maj' },
        { root: 'A', accidental: '', quality: 'min' },
        { root: 'F', accidental: '', quality: 'maj' },
      ]},
      { name: 'I-IV-V-I', chords: [
        { root: 'C', accidental: '', quality: 'maj' },
        { root: 'F', accidental: '', quality: 'maj' },
        { root: 'G', accidental: '', quality: 'maj' },
        { root: 'C', accidental: '', quality: 'maj' },
      ]},
      { name: 'I-IV-Vsus4-V', chords: [
        { root: 'C', accidental: '', quality: 'maj' },
        { root: 'F', accidental: '', quality: 'maj' },
        { root: 'G', accidental: '', quality: 'sus4' },
        { root: 'G', accidental: '', quality: 'maj' },
      ]},
      { name: 'I-vi-ii-V', chords: [
        { root: 'C', accidental: '', quality: 'maj' },
        { root: 'A', accidental: '', quality: 'min' },
        { root: 'D', accidental: '', quality: 'min' },
        { root: 'G', accidental: '', quality: 'maj' },
      ]},
      { name: 'I-ii-IV-V', chords: [
        { root: 'C', accidental: '', quality: 'maj' },
        { root: 'D', accidental: '', quality: 'min' },
        { root: 'F', accidental: '', quality: 'maj' },
        { root: 'G', accidental: '', quality: 'maj' },
      ]},
      { name: 'I-V/vii-vi-V', chords: [
        { root: 'C', accidental: '', quality: 'maj' },
        { root: 'G', accidental: '', quality: 'maj' },
        { root: 'A', accidental: '', quality: 'min' },
        { root: 'G', accidental: '', quality: 'maj' },
      ]},
    ]
  },
  {
    id: 'rock',
    name: 'Rock',
    progressions: [
      { name: 'I-vi-IV-V', chords: [
        { root: 'C', accidental: '', quality: 'maj' },
        { root: 'A', accidental: '', quality: 'min' },
        { root: 'F', accidental: '', quality: 'maj' },
        { root: 'G', accidental: '', quality: 'maj' },
      ]},
      { name: 'I-IV-I-V', chords: [
        { root: 'C', accidental: '', quality: 'maj' },
        { root: 'F', accidental: '', quality: 'maj' },
        { root: 'C', accidental: '', quality: 'maj' },
        { root: 'G', accidental: '', quality: 'maj' },
      ]},
      { name: 'I-bIII-IV-I', chords: [
        { root: 'C', accidental: '', quality: 'maj' },
        { root: 'E', accidental: 'b', quality: 'maj' },
        { root: 'F', accidental: '', quality: 'maj' },
        { root: 'C', accidental: '', quality: 'maj' },
      ]},
      { name: 'I-bVII-IV-I', chords: [
        { root: 'E', accidental: '', quality: 'maj' },
        { root: 'F', accidental: '', quality: 'maj' },
        { root: 'F', accidental: '', quality: 'min' },
        { root: 'D', accidental: '', quality: 'min' },
      ]},
      { name: 'I-V-bVII-IV', chords: [
        { root: 'C', accidental: '', quality: 'maj' },
        { root: 'G', accidental: '', quality: 'maj' },
        { root: 'B', accidental: 'b', quality: 'maj' },
        { root: 'G', accidental: '', quality: 'maj' },
      ]},
      { name: 'I-bVII-IV-vi', chords: [
        { root: 'G', accidental: '', quality: 'maj' },
        { root: 'F', accidental: '', quality: 'maj' },
        { root: 'C', accidental: '', quality: 'maj' },
        { root: 'A', accidental: '', quality: 'min' },
      ]},
      { name: 'vi-ii-V-I', chords: [
        { root: 'F', accidental: '', quality: 'maj' },
        { root: 'C', accidental: '', quality: 'maj' },
        { root: 'G', accidental: '', quality: 'maj' },
        { root: 'A', accidental: '', quality: 'min' },
      ]},
      { name: 'vi-IV-V7-I', chords: [
        { root: 'E', accidental: '', quality: 'maj' },
        { root: 'D', accidental: '', quality: 'maj' },
        { root: 'G', accidental: '', quality: '7' },
      ]},
    ]
  },
  {
    id: 'jazz',
    name: 'Jazz',
    progressions: [
      { name: 'ii-V-I', chords: [
        { root: 'D', accidental: '', quality: 'min7' },
        { root: 'G', accidental: '', quality: '7' },
        { root: 'C', accidental: '', quality: 'maj7' },
      ]},
      { name: 'I-ii-V-I', chords: [
        { root: 'C', accidental: '', quality: 'maj7' },
        { root: 'D', accidental: '', quality: 'min7' },
        { root: 'G', accidental: '', quality: '7' },
        { root: 'C', accidental: '', quality: 'maj7' },
      ]},
      { name: 'I-vi-ii-V (Turnaround)', chords: [
        { root: 'C', accidental: '', quality: 'maj7' },
        { root: 'A', accidental: '', quality: 'min7' },
        { root: 'D', accidental: '', quality: 'min7' },
        { root: 'G', accidental: '', quality: '7' },
      ]},
      { name: 'I-#io-ii-V', chords: [
        { root: 'C', accidental: '', quality: 'maj7' },
        { root: 'C', accidental: '#', quality: 'dim7' },
        { root: 'D', accidental: '', quality: 'min7' },
        { root: 'G', accidental: '', quality: '7' },
      ]},
      { name: 'I-VII7-IVmaj7-ivm7', chords: [
        { root: 'C', accidental: '', quality: 'maj7' },
        { root: 'C', accidental: '', quality: '7' },
        { root: 'F', accidental: '', quality: 'maj7' },
        { root: 'F', accidental: '', quality: 'min7' },
      ]},
      { name: 'vi7b5-ii-V-I', chords: [
        { root: 'A', accidental: '', quality: 'm7b5' },
        { root: 'D', accidental: '', quality: 'min7' },
        { root: 'G', accidental: '', quality: '7' },
        { root: 'C', accidental: '', quality: 'maj7' },
      ]},
      { name: 'ii7b5-V7-im', chords: [
        { root: 'D', accidental: '', quality: 'm7b5' },
        { root: 'G', accidental: '', quality: '7' },
        { root: 'C', accidental: '', quality: 'min7' },
      ]},
      { name: 'im7-V7-im7 (Minor ii-V-i)', chords: [
        { root: 'C', accidental: '', quality: 'min7' },
        { root: 'G', accidental: '', quality: '7' },
        { root: 'C', accidental: '', quality: 'min7' },
      ]},
    ]
  },
  {
    id: 'blues',
    name: 'Blues',
    progressions: [
      { name: '12-Bar Blues', chords: [
        { root: 'C', accidental: '', quality: '7' },
        { root: 'C', accidental: '', quality: '7' },
        { root: 'C', accidental: '', quality: '7' },
        { root: 'C', accidental: '', quality: '7' },
        { root: 'F', accidental: '', quality: '7' },
        { root: 'F', accidental: '', quality: '7' },
        { root: 'C', accidental: '', quality: '7' },
        { root: 'C', accidental: '', quality: '7' },
        { root: 'G', accidental: '', quality: '7' },
        { root: 'F', accidental: '', quality: '7' },
        { root: 'C', accidental: '', quality: '7' },
        { root: 'C', accidental: '', quality: '7' },
      ]},
      { name: 'Quick Change Blues', chords: [
        { root: 'C', accidental: '', quality: '7' },
        { root: 'F', accidental: '', quality: '7' },
        { root: 'C', accidental: '', quality: '7' },
        { root: 'C', accidental: '', quality: '7' },
        { root: 'F', accidental: '', quality: '7' },
        { root: 'F', accidental: '', quality: '7' },
        { root: 'C', accidental: '', quality: '7' },
        { root: 'C', accidental: '', quality: '7' },
        { root: 'G', accidental: '', quality: '7' },
        { root: 'F', accidental: '', quality: '7' },
        { root: 'C', accidental: '', quality: '7' },
        { root: 'G', accidental: '', quality: '7' },
      ]},
      { name: 'Minor Blues', chords: [
        { root: 'A', accidental: '', quality: 'min7' },
        { root: 'A', accidental: '', quality: 'min7' },
        { root: 'A', accidental: '', quality: 'min7' },
        { root: 'A', accidental: '', quality: 'min7' },
        { root: 'D', accidental: '', quality: 'min7' },
        { root: 'D', accidental: '', quality: 'min7' },
        { root: 'A', accidental: '', quality: 'min7' },
        { root: 'A', accidental: '', quality: 'min7' },
        { root: 'E', accidental: '', quality: '7' },
        { root: 'D', accidental: '', quality: 'min7' },
        { root: 'A', accidental: '', quality: 'min7' },
        { root: 'E', accidental: '', quality: '7' },
      ]},
    ]
  },
  {
    id: 'folk',
    name: 'Folk / Country',
    progressions: [
      { name: 'I-IV-V', chords: [
        { root: 'G', accidental: '', quality: 'maj' },
        { root: 'C', accidental: '', quality: 'maj' },
        { root: 'D', accidental: '', quality: 'maj' },
      ]},
      { name: 'I-V-IV-V', chords: [
        { root: 'G', accidental: '', quality: 'maj' },
        { root: 'D', accidental: '', quality: 'maj' },
        { root: 'C', accidental: '', quality: 'maj' },
        { root: 'D', accidental: '', quality: 'maj' },
      ]},
      { name: 'I-vi-IV-V', chords: [
        { root: 'G', accidental: '', quality: 'maj' },
        { root: 'E', accidental: '', quality: 'min' },
        { root: 'C', accidental: '', quality: 'maj' },
        { root: 'D', accidental: '', quality: 'maj' },
      ]},
      { name: 'vi-IV-I-V', chords: [
        { root: 'A', accidental: '', quality: 'min' },
        { root: 'F', accidental: '', quality: 'maj' },
        { root: 'C', accidental: '', quality: 'maj' },
        { root: 'G', accidental: '', quality: 'maj' },
      ]},
    ]
  },
  {
    id: 'latin',
    name: 'Latin / Bossa Nova',
    progressions: [
      { name: 'Bossa Nova I-vi-ii-V', chords: [
        { root: 'C', accidental: '', quality: 'maj7' },
        { root: 'A', accidental: '', quality: 'min7' },
        { root: 'D', accidental: '', quality: 'min7' },
        { root: 'G', accidental: '', quality: '7' },
      ]},
      { name: 'Girl from Ipanema', chords: [
        { root: 'F', accidental: '', quality: 'maj7' },
        { root: 'G', accidental: '', quality: '7' },
        { root: 'G', accidental: '', quality: 'min7' },
        { root: 'G', accidental: 'b', quality: '7' },
      ]},
      { name: 'So What', chords: [
        { root: 'D', accidental: '', quality: 'min7' },
        { root: 'D', accidental: '', quality: 'min7' },
        { root: 'E', accidental: 'b', quality: 'min7' },
        { root: 'D', accidental: '', quality: 'min7' },
      ]},
    ]
  },
];

/**
 * Get progressions matching a style ID
 */
export function getProgressionsForStyle(styleId: string): GenreProgressions | undefined {
  const styleLower = styleId.toLowerCase();
  
  // Map style categories to genre progressions
  if (styleLower.includes('pop')) return GENRE_PROGRESSIONS.find(g => g.id === 'pop');
  if (styleLower.includes('rock') || styleLower.includes('metal')) return GENRE_PROGRESSIONS.find(g => g.id === 'rock');
  if (styleLower.includes('jazz') || styleLower.includes('bossa')) return GENRE_PROGRESSIONS.find(g => g.id === 'jazz');
  if (styleLower.includes('blues')) return GENRE_PROGRESSIONS.find(g => g.id === 'blues');
  if (styleLower.includes('folk') || styleLower.includes('country')) return GENRE_PROGRESSIONS.find(g => g.id === 'folk');
  if (styleLower.includes('latin') || styleLower.includes('reggae')) return GENRE_PROGRESSIONS.find(g => g.id === 'latin');
  
  // Default to pop progressions
  return GENRE_PROGRESSIONS.find(g => g.id === 'pop');
}

/**
 * Convert a chord progression to full Chord objects
 */
export function progressionToChords(progression: ChordProgression, duration: number = 4): Chord[] {
  return progression.chords.map(chord => ({
    id: generateChordId(),
    root: chord.root,
    accidental: chord.accidental,
    quality: chord.quality,
    duration,
  }));
}

/**
 * Get a random progression for a given style
 */
export function getRandomProgression(styleId: string): { progression: ChordProgression; genre: string } | null {
  const genre = getProgressionsForStyle(styleId);
  if (!genre || genre.progressions.length === 0) return null;
  
  const randomIndex = Math.floor(Math.random() * genre.progressions.length);
  return {
    progression: genre.progressions[randomIndex],
    genre: genre.name,
  };
}
