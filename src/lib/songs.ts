/**
 * Songs System
 * 
 * Defines the Song data model and utility functions
 */

import { Section } from './sections';
import { InstrumentState } from './instruments';

export interface Song {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  sections: Section[];
  bpm: number;
  styleId: string;
  transposition: number;
  instrumentSettings: InstrumentState[];
  metronomeEnabled: boolean;
}

export function generateSongId(): string {
  return `song_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function createSong(title: string = 'Untitled Song'): Song {
  return {
    id: generateSongId(),
    title,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sections: [],
    bpm: 100,
    styleId: 'rock_basic',
    transposition: 0,
    instrumentSettings: [],
    metronomeEnabled: true,
  };
}

/**
 * Calculate total duration in seconds
 */
export function getSongDuration(song: Song): number {
  const totalBeats = song.sections.reduce((total, section) => {
    const sectionBeats = section.chords.reduce((sum, chord) => sum + chord.duration, 0);
    return total + (sectionBeats * section.repeatCount);
  }, 0);
  
  return (totalBeats / song.bpm) * 60;
}

/**
 * Format duration as mm:ss
 */
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Get a preview of chords as a string
 */
export function getChordsPreview(song: Song, maxChords: number = 6): string {
  const allChords: string[] = [];
  
  for (const section of song.sections) {
    for (const chord of section.chords) {
      const chordName = `${chord.root}${chord.accidental}${chord.quality === 'maj' ? '' : chord.quality}`;
      allChords.push(chordName);
      if (allChords.length >= maxChords) {
        return allChords.join(' - ') + '...';
      }
    }
  }
  
  return allChords.join(' - ') || 'No chords';
}
