/**
 * Sections System
 * 
 * Allows organizing chord progressions into repeatable sections
 */

import { type Chord, generateChordId } from './musicTheory';

export interface Section {
  id: string;
  name: string;
  chords: Chord[];
  repeatCount: number;
}

export function generateSectionId(): string {
  return `section_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function createSection(name: string = 'Section A', chords: Chord[] = []): Section {
  return {
    id: generateSectionId(),
    name,
    chords,
    repeatCount: 1,
  };
}

export function getSectionDisplayName(index: number): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return `Section ${letters[index % 26]}`;
}

/**
 * Expands sections into a flat chord array for playback
 */
export function expandSectionsToChords(sections: Section[]): Chord[] {
  const expandedChords: Chord[] = [];
  
  sections.forEach(section => {
    for (let i = 0; i < section.repeatCount; i++) {
      section.chords.forEach(chord => {
        // Clone the chord with a new ID to avoid key conflicts
        expandedChords.push({
          ...chord,
          id: generateChordId(),
        });
      });
    }
  });
  
  return expandedChords;
}

/**
 * Calculate total beats including repeats
 */
export function getTotalBeats(sections: Section[]): number {
  return sections.reduce((total, section) => {
    const sectionBeats = section.chords.reduce((sum, chord) => sum + chord.duration, 0);
    return total + (sectionBeats * section.repeatCount);
  }, 0);
}
