/**
 * Songs System
 * 
 * Defines the Song data model and utility functions
 */

import type { Section } from './sections';
import type { InstrumentState } from './instruments';
import type { MelodicData, DegreePattern } from './bassScale';

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
  melodic?: MelodicData;
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
 * Migrate a raw song JSON object from any previous schema version to the current Song shape.
 * Safe to call on already-migrated songs (no-op when fields are current).
 */
export function migrateLegacySong(raw: unknown): Song {
  const r = raw as Record<string, unknown>;

  // v1 → v2: bassScalePattern/bassScaleLoopBars/bassScaleEnabled → melodic
  if (r.bassScalePattern && !r.melodic) {
    const firstVar = {
      id: `sv_mig_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: 'Var 1',
      pattern: r.bassScalePattern as DegreePattern,
      loopBars: (r.bassScaleLoopBars as 1 | 2 | 4) ?? 1,
    };
    const melodic: MelodicData = {
      bass: { variations: [firstVar], enabled: (r.bassScaleEnabled as boolean) ?? false },
      piano: { variations: [], enabled: false },
      guitar: { variations: [], enabled: false },
    };
    r.melodic = melodic;
  }

  return r as unknown as Song;
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
