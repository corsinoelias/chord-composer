/**
 * Sections System
 * 
 * Allows organizing chord progressions into repeatable sections
 */

import { type Chord, generateChordId } from './musicTheory';
import type { StylePattern, ArpeggioCell } from './styles';
import type { ScaleVariation } from './bassScale';

/** The four tracks a section can treat differently from the song. */
export type TrackId = 'drums' | 'bass' | 'piano' | 'guitar' | 'synth';
export const TRACK_IDS: TrackId[] = ['drums', 'bass', 'piano', 'guitar', 'synth'];

/**
 * One track's groove, written by hand for one section (see docs/plan-paridad-web-app.md,
 * D1). Only the fields of that track: the drum rows and fill for 'drums', the `bass` row
 * or a melodic line for 'bass', and so on. Absent fields fall back to the section's style.
 * Same vocabulary as StylePattern, so the engine plays it without a second format.
 */
export interface TrackPattern {
  rhythm?: Partial<StylePattern['rhythm']>;
  arpeggios?: (ArpeggioCell | null)[];
  melodic?: ScaleVariation;
  fill?: StylePattern['fill'];
  loopBars?: number;
}

export interface Section {
  id: string;
  name: string;
  chords: Chord[];
  repeatCount: number;
  bassVariationId?: string;
  pianoVariationId?: string;
  guitarVariationId?: string;
  // ── Per-section arrangement (all optional; absent = whatever the song says) ─────────
  // A section without any of these plays exactly as before they existed: the engine only
  // takes the per-section path when one is present (see src/lib/sectionPlayback.ts).
  /** The whole rhythm for this section: another style by id. Same meter as the song. */
  styleId?: string;
  /** One style per track: "the drums of reggaeton, the bass of ballad". Wins over styleId. */
  trackStyles?: Partial<Record<TrackId, string>>;
  /** Tracks whose groove was edited by hand in this section. Wins over both of the above. */
  patterns?: Partial<Record<TrackId, TrackPattern>>;
  /** Tracks this section does not play (intro without drums). */
  silenced?: Partial<Record<TrackId, boolean>>;
  /** A different sound for a track in this section, by InstrumentConfig sound type id. */
  sounds?: Partial<Record<TrackId, string>>;
  // ── A rhythm of the app's (appStyles.ts) ─────────
  /**
   * Which of the rhythm's two variations this section plays, as a home keyboard's VARIATION
   * button: 0 (or absent) A, 1 B. Only rhythms that have a B offer it; the app keeps the same.
   */
  variation?: 0 | 1;
  /**
   * This section is a part of a rhythm's intro or ending, added with it ("Add intro and
   * ending"): it plays that part's own patterns over its own chords, in the song's key.
   */
  stylePart?: { styleId: string; kind: 'intro' | 'ending'; index: number };
}

/** Whether a section changes anything about how the song is arranged. */
export function sectionHasArrangement(section: Section): boolean {
  const any = (o?: object) => !!o && Object.keys(o).length > 0;
  return !!section.styleId || any(section.trackStyles) || any(section.patterns)
    || Object.values(section.silenced ?? {}).some(Boolean) || any(section.sounds);
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
