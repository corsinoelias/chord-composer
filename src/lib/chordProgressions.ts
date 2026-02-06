/**
 * Common Chord Progressions by Genre
 * 
 * A comprehensive collection of popular chord progressions organized by musical style,
 * including famous song references.
 */

import { Chord, RootNote, Accidental, ChordQuality, generateChordId } from './musicTheory';

export interface ChordProgression {
  name: string;
  chords: Array<{ root: RootNote; accidental: Accidental; quality: ChordQuality }>;
  /** Famous songs that use this progression */
  examples?: string[];
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
      ], examples: ['Let It Be', 'No Woman No Cry', 'Someone Like You'] },
      { name: 'vi-IV-I-V', chords: [
        { root: 'A', accidental: '', quality: 'min' },
        { root: 'F', accidental: '', quality: 'maj' },
        { root: 'C', accidental: '', quality: 'maj' },
        { root: 'G', accidental: '', quality: 'maj' },
      ], examples: ['Numb', 'Hello (Adele)', 'Grenade'] },
      { name: 'I-IV-V-I', chords: [
        { root: 'C', accidental: '', quality: 'maj' },
        { root: 'F', accidental: '', quality: 'maj' },
        { root: 'G', accidental: '', quality: 'maj' },
        { root: 'C', accidental: '', quality: 'maj' },
      ], examples: ['Twist and Shout', 'La Bamba'] },
      { name: 'I-vi-IV-V (50s)', chords: [
        { root: 'C', accidental: '', quality: 'maj' },
        { root: 'A', accidental: '', quality: 'min' },
        { root: 'F', accidental: '', quality: 'maj' },
        { root: 'G', accidental: '', quality: 'maj' },
      ], examples: ['Stand By Me', 'Every Breath You Take', 'Can You Feel the Love Tonight'] },
      { name: 'I-IV-vi-V', chords: [
        { root: 'C', accidental: '', quality: 'maj' },
        { root: 'F', accidental: '', quality: 'maj' },
        { root: 'A', accidental: '', quality: 'min' },
        { root: 'G', accidental: '', quality: 'maj' },
      ], examples: ['Zombie', 'Self Esteem'] },
      { name: 'I-V-vi-iii-IV', chords: [
        { root: 'C', accidental: '', quality: 'maj' },
        { root: 'G', accidental: '', quality: 'maj' },
        { root: 'A', accidental: '', quality: 'min' },
        { root: 'E', accidental: '', quality: 'min' },
        { root: 'F', accidental: '', quality: 'maj' },
      ], examples: ['Canon in D (modern)', 'Graduation'] },
    ]
  },
  {
    id: 'rock',
    name: 'Rock',
    progressions: [
      { name: 'I-♭VII-IV', chords: [
        { root: 'A', accidental: '', quality: 'maj' },
        { root: 'G', accidental: '', quality: 'maj' },
        { root: 'D', accidental: '', quality: 'maj' },
      ], examples: ['Sweet Child O\' Mine', 'Free Fallin\''] },
      { name: 'I-IV-V', chords: [
        { root: 'E', accidental: '', quality: 'maj' },
        { root: 'A', accidental: '', quality: 'maj' },
        { root: 'B', accidental: '', quality: 'maj' },
      ], examples: ['Johnny B. Goode', 'Wild Thing'] },
      { name: 'I-♭III-IV', chords: [
        { root: 'C', accidental: '', quality: 'maj' },
        { root: 'E', accidental: 'b', quality: 'maj' },
        { root: 'F', accidental: '', quality: 'maj' },
      ], examples: ['All Along the Watchtower'] },
      { name: 'i-♭VII-♭VI-V', chords: [
        { root: 'A', accidental: '', quality: 'min' },
        { root: 'G', accidental: '', quality: 'maj' },
        { root: 'F', accidental: '', quality: 'maj' },
        { root: 'E', accidental: '', quality: 'maj' },
      ], examples: ['Hit The Road Jack', 'Stairway to Heaven (verse)', 'Smooth'] },
      { name: 'I-V-♭VII-IV', chords: [
        { root: 'C', accidental: '', quality: 'maj' },
        { root: 'G', accidental: '', quality: 'maj' },
        { root: 'B', accidental: 'b', quality: 'maj' },
        { root: 'F', accidental: '', quality: 'maj' },
      ], examples: ['Hey Jude (coda)', 'Born to Run'] },
      { name: 'I-IV-I-V (Punk)', chords: [
        { root: 'E', accidental: '', quality: 'maj' },
        { root: 'A', accidental: '', quality: 'maj' },
        { root: 'E', accidental: '', quality: 'maj' },
        { root: 'B', accidental: '', quality: 'maj' },
      ], examples: ['Blitzkrieg Bop', 'Louie Louie'] },
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
      ], examples: ['Autumn Leaves', 'All The Things You Are'] },
      { name: 'I-vi-ii-V (Turnaround)', chords: [
        { root: 'C', accidental: '', quality: 'maj7' },
        { root: 'A', accidental: '', quality: 'min7' },
        { root: 'D', accidental: '', quality: 'min7' },
        { root: 'G', accidental: '', quality: '7' },
      ], examples: ['I Got Rhythm', 'Blue Moon'] },
      { name: 'I-♯i°-ii-V', chords: [
        { root: 'C', accidental: '', quality: 'maj7' },
        { root: 'C', accidental: '#', quality: 'dim7' },
        { root: 'D', accidental: '', quality: 'min7' },
        { root: 'G', accidental: '', quality: '7' },
      ], examples: ['Night and Day'] },
      { name: 'iiø-V7-i (Minor ii-V-i)', chords: [
        { root: 'D', accidental: '', quality: 'm7b5' },
        { root: 'G', accidental: '', quality: '7' },
        { root: 'C', accidental: '', quality: 'min7' },
      ], examples: ['Softly As In A Morning Sunrise'] },
      { name: 'I-VII7-IVmaj7-ivm7', chords: [
        { root: 'C', accidental: '', quality: 'maj7' },
        { root: 'C', accidental: '', quality: '7' },
        { root: 'F', accidental: '', quality: 'maj7' },
        { root: 'F', accidental: '', quality: 'min7' },
      ], examples: ['Misty'] },
      { name: 'Coltrane Changes (iii-VI-II-V)', chords: [
        { root: 'E', accidental: '', quality: 'min7' },
        { root: 'A', accidental: '', quality: '7' },
        { root: 'D', accidental: '', quality: 'maj7' },
        { root: 'G', accidental: '', quality: '7' },
      ], examples: ['Giant Steps', 'Countdown'] },
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
      ], examples: ['Sweet Home Chicago', 'Pride and Joy'] },
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
      ], examples: ['Rock and Roll (Led Zeppelin)'] },
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
      ], examples: ['The Thrill Is Gone'] },
      { name: 'Jazz Blues', chords: [
        { root: 'C', accidental: '', quality: '7' },
        { root: 'F', accidental: '', quality: '7' },
        { root: 'C', accidental: '', quality: '7' },
        { root: 'G', accidental: '', quality: 'min7' },
        { root: 'C', accidental: '', quality: '7' },
        { root: 'F', accidental: '', quality: '7' },
        { root: 'F', accidental: '#', quality: 'dim7' },
        { root: 'C', accidental: '', quality: '7' },
        { root: 'A', accidental: '', quality: '7' },
        { root: 'D', accidental: '', quality: 'min7' },
        { root: 'G', accidental: '', quality: '7' },
        { root: 'C', accidental: '', quality: '7' },
      ], examples: ['Blues for Alice', 'Billie\'s Bounce'] },
    ]
  },
  {
    id: 'rnb',
    name: 'R&B / Soul',
    progressions: [
      { name: 'I-vi-ii-V (Motown)', chords: [
        { root: 'C', accidental: '', quality: 'maj7' },
        { root: 'A', accidental: '', quality: 'min7' },
        { root: 'D', accidental: '', quality: 'min7' },
        { root: 'G', accidental: '', quality: '7' },
      ], examples: ['My Girl', 'Ain\'t No Sunshine'] },
      { name: 'vi-IV-I-V (Neo Soul)', chords: [
        { root: 'A', accidental: '', quality: 'min7' },
        { root: 'F', accidental: '', quality: 'maj7' },
        { root: 'C', accidental: '', quality: 'maj7' },
        { root: 'G', accidental: '', quality: '7' },
      ], examples: ['Ordinary People', 'Electric'] },
      { name: 'I-iii-IV-iv', chords: [
        { root: 'C', accidental: '', quality: 'maj7' },
        { root: 'E', accidental: '', quality: 'min7' },
        { root: 'F', accidental: '', quality: 'maj7' },
        { root: 'F', accidental: '', quality: 'min7' },
      ], examples: ['Creep (Radiohead)', 'Something (Beatles)'] },
      { name: 'I-V-vi-IV-I (Axis Extended)', chords: [
        { root: 'G', accidental: '', quality: 'maj' },
        { root: 'D', accidental: '', quality: 'maj' },
        { root: 'E', accidental: '', quality: 'min' },
        { root: 'C', accidental: '', quality: 'maj' },
        { root: 'G', accidental: '', quality: 'maj' },
      ], examples: ['Stay With Me', 'Counting Stars'] },
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
      ], examples: ['Blowin\' in the Wind', 'Ring of Fire'] },
      { name: 'I-V-vi-IV', chords: [
        { root: 'G', accidental: '', quality: 'maj' },
        { root: 'D', accidental: '', quality: 'maj' },
        { root: 'E', accidental: '', quality: 'min' },
        { root: 'C', accidental: '', quality: 'maj' },
      ], examples: ['Wagon Wheel', 'Ho Hey'] },
      { name: 'I-V-IV-V (Country)', chords: [
        { root: 'G', accidental: '', quality: 'maj' },
        { root: 'D', accidental: '', quality: 'maj' },
        { root: 'C', accidental: '', quality: 'maj' },
        { root: 'D', accidental: '', quality: 'maj' },
      ], examples: ['Country Roads', 'Knockin\' on Heaven\'s Door'] },
      { name: 'vi-IV-I-V (Emotional)', chords: [
        { root: 'A', accidental: '', quality: 'min' },
        { root: 'F', accidental: '', quality: 'maj' },
        { root: 'C', accidental: '', quality: 'maj' },
        { root: 'G', accidental: '', quality: 'maj' },
      ], examples: ['Fast Car', 'Wake Me Up'] },
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
      ], examples: ['The Girl from Ipanema'] },
      { name: 'i-iv-V-i (Latin minor)', chords: [
        { root: 'A', accidental: '', quality: 'min' },
        { root: 'D', accidental: '', quality: 'min' },
        { root: 'E', accidental: '', quality: '7' },
        { root: 'A', accidental: '', quality: 'min' },
      ], examples: ['Bésame Mucho', 'Oye Como Va'] },
      { name: 'So What (Modal)', chords: [
        { root: 'D', accidental: '', quality: 'min7' },
        { root: 'D', accidental: '', quality: 'min7' },
        { root: 'E', accidental: 'b', quality: 'min7' },
        { root: 'D', accidental: '', quality: 'min7' },
      ], examples: ['So What'] },
      { name: 'Reggaeton i-♭VII-♭VI-V', chords: [
        { root: 'A', accidental: '', quality: 'min' },
        { root: 'G', accidental: '', quality: 'maj' },
        { root: 'F', accidental: '', quality: 'maj' },
        { root: 'E', accidental: '', quality: 'maj' },
      ], examples: ['Despacito', 'Dákiti'] },
    ]
  },
  {
    id: 'edm',
    name: 'EDM / Electronic',
    progressions: [
      { name: 'vi-IV-I-V (Anthem)', chords: [
        { root: 'A', accidental: '', quality: 'min' },
        { root: 'F', accidental: '', quality: 'maj' },
        { root: 'C', accidental: '', quality: 'maj' },
        { root: 'G', accidental: '', quality: 'maj' },
      ], examples: ['Levels (Avicii)', 'Wake Me Up'] },
      { name: 'i-♭III-♭VII-IV', chords: [
        { root: 'A', accidental: '', quality: 'min' },
        { root: 'C', accidental: '', quality: 'maj' },
        { root: 'G', accidental: '', quality: 'maj' },
        { root: 'D', accidental: '', quality: 'maj' },
      ], examples: ['Titanium', 'Clarity'] },
      { name: 'I-I-IV-IV (Trance)', chords: [
        { root: 'C', accidental: '', quality: 'min' },
        { root: 'C', accidental: '', quality: 'min' },
        { root: 'A', accidental: 'b', quality: 'maj' },
        { root: 'A', accidental: 'b', quality: 'maj' },
      ], examples: ['Sandstorm', 'Children'] },
      { name: 'vi-I-V-IV (Future Bass)', chords: [
        { root: 'F', accidental: '#', quality: 'min' },
        { root: 'A', accidental: '', quality: 'maj' },
        { root: 'E', accidental: '', quality: 'maj' },
        { root: 'D', accidental: '', quality: 'maj' },
      ], examples: ['Lean On', 'Don\'t Let Me Down'] },
    ]
  },
  {
    id: 'funk',
    name: 'Funk / Disco',
    progressions: [
      { name: 'I7-IV7 (Two Chord Funk)', chords: [
        { root: 'E', accidental: '', quality: '7' },
        { root: 'A', accidental: '', quality: '7' },
      ], examples: ['Get Up (I Feel Like Being a Sex Machine)', 'Superstition'] },
      { name: 'i7-IV7 (Minor Funk)', chords: [
        { root: 'E', accidental: '', quality: 'min7' },
        { root: 'A', accidental: '', quality: '7' },
        { root: 'E', accidental: '', quality: 'min7' },
        { root: 'E', accidental: '', quality: 'min7' },
      ], examples: ['Ain\'t No Stoppin\' Us Now'] },
      { name: 'I-ii-iii-IV (Disco)', chords: [
        { root: 'C', accidental: '', quality: 'maj' },
        { root: 'D', accidental: '', quality: 'min' },
        { root: 'E', accidental: '', quality: 'min' },
        { root: 'F', accidental: '', quality: 'maj' },
      ], examples: ['September', 'Stayin\' Alive'] },
      { name: 'i-♭VII-IV-i (P-Funk)', chords: [
        { root: 'G', accidental: '', quality: 'min7' },
        { root: 'F', accidental: '', quality: '7' },
        { root: 'C', accidental: '', quality: '7' },
        { root: 'G', accidental: '', quality: 'min7' },
      ], examples: ['Give Up the Funk', 'Flash Light'] },
    ]
  },
];

/**
 * Get progressions matching a style ID
 */
export function getProgressionsForStyle(styleId: string): GenreProgressions | undefined {
  const styleLower = styleId.toLowerCase();
  
  if (styleLower.includes('pop')) return GENRE_PROGRESSIONS.find(g => g.id === 'pop');
  if (styleLower.includes('rock') || styleLower.includes('metal')) return GENRE_PROGRESSIONS.find(g => g.id === 'rock');
  if (styleLower.includes('jazz') || styleLower.includes('bossa')) return GENRE_PROGRESSIONS.find(g => g.id === 'jazz');
  if (styleLower.includes('blues')) return GENRE_PROGRESSIONS.find(g => g.id === 'blues');
  if (styleLower.includes('folk') || styleLower.includes('country')) return GENRE_PROGRESSIONS.find(g => g.id === 'folk');
  if (styleLower.includes('latin') || styleLower.includes('reggae')) return GENRE_PROGRESSIONS.find(g => g.id === 'latin');
  if (styleLower.includes('rnb') || styleLower.includes('soul')) return GENRE_PROGRESSIONS.find(g => g.id === 'rnb');
  if (styleLower.includes('edm') || styleLower.includes('electronic') || styleLower.includes('house')) return GENRE_PROGRESSIONS.find(g => g.id === 'edm');
  if (styleLower.includes('funk') || styleLower.includes('disco')) return GENRE_PROGRESSIONS.find(g => g.id === 'funk');
  
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