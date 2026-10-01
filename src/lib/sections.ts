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
   * The rhythm's intro or ending, played by this section instead of its groove (A or B,
   * which [variation] keeps for when it goes back). A reference, not a copy: under another
   * rhythm it plays that rhythm's intro. See docs and SectionCard's part menu.
   */
  part?: 'intro' | 'ending';
  /**
   * The sound each part of the rhythm plays in this section, by track (a kit for the drums):
   * the chorus on B can bring the strings in while the verse on A keeps the piano. Over
   * [sounds] and the song's. See appEngine/fromSong.ts, which gives the engine A's and B's.
   */
  partSounds?: Partial<Record<SectionPartKey, Partial<Record<TrackId, string>>>>;
  /**
   * Pieces of the kit (drum rows) each part leaves out in this section: still written, not
   * heard, fill included — the app's per-part mute (SectionSounds.mutedRows).
   */
  partMuted?: Partial<Record<SectionPartKey, string[]>>;
  /**
   * How long each melodic track's notes ring in this section, over the song's (app.noteLengths),
   * in sixteenths, 0 held: the app's "Only in this section" after changing Notes.
   */
  noteLengths?: Partial<Record<'piano' | 'guitar' | 'bass' | 'synth', number>>;
  /**
   * This section is a part of a rhythm's intro or ending, added with it ("Add intro and
   * ending"): it plays that part's own patterns over its own chords, in the song's key.
   */
  stylePart?: { styleId: string; kind: 'intro' | 'ending'; index: number };
  /**
   * This section's own version of a rhythm of the app's: only the tracks (and the fill) edited
   * in it, sparse. Everything else follows the rhythm. See groove.ts.
   */
  groove?: import('./groove').SectionGroove;
  /**
   * Variation B of a section on one of the web's own rhythms, as a home keyboard's VARIATION
   * button has it: another arrangement of the same part — its rhythm, its tracks' rhythms and
   * its edited grooves — made as a copy of A the first time B is asked for. Sounds and silences
   * are the section's, the same for both (as the engine keeps them). The app's rhythms bring
   * their own B (groove.ts).
   */
  alt?: SectionArrangementOnly;
}

/** What a variation of a section can play differently. */
export type SectionArrangementOnly = Pick<Section, 'styleId' | 'trackStyles' | 'patterns' | 'bassVariationId' | 'pianoVariationId' | 'guitarVariationId'>;

/** The arrangement a section has now, to make a B from. */
export function arrangementOf(section: Section): SectionArrangementOnly {
  return JSON.parse(JSON.stringify({
    styleId: section.styleId, trackStyles: section.trackStyles, patterns: section.patterns,
    bassVariationId: section.bassVariationId, pianoVariationId: section.pianoVariationId, guitarVariationId: section.guitarVariationId,
  }));
}

/** The section as its variation B plays it, or null when it has none. */
export function sectionB(section: Section): Section | null {
  if (!section.alt) return null;
  return { ...section, styleId: undefined, trackStyles: undefined, patterns: undefined, bassVariationId: undefined, pianoVariationId: undefined, guitarVariationId: undefined, ...section.alt };
}

/** Whether a section changes anything about how the song is arranged. */
/** The four parts of a keyboard's rhythm, and which one a section plays. */
export type SectionPartKey = 'intro' | 'a' | 'b' | 'ending';
export function sectionPartOf(section: Pick<Section, 'stylePart' | 'part' | 'variation'>): SectionPartKey {
  if (section.stylePart) return section.stylePart.kind === 'intro' ? 'intro' : 'ending';
  if (section.part) return section.part;
  return section.variation === 1 ? 'b' : 'a';
}
export const SECTION_PART_LABEL: Record<SectionPartKey, string> = { intro: 'Intro', a: 'A', b: 'B', ending: 'Ending' };

/**
 * A section's own sounds (section.sounds, what the section menu set before the rhythm
 * editor's pill became the one place for a sound) given to each of its parts that has none
 * of its own for that track, and taken off the section. It sounds the same, and the pill
 * shows and changes what plays. A section with none comes back as it is.
 */
export function foldSectionSounds<T extends Section>(section: T): T {
  const own = Object.fromEntries(Object.entries(section.sounds ?? {}).filter(([, id]) => id)) as Partial<Record<TrackId, string>>;
  if (!Object.keys(own).length) {
    if (!section.sounds) return section;
    const { sounds: _gone, ...rest } = section;
    return rest as T;
  }
  const { sounds: _folded, ...rest } = section;
  const parts: NonNullable<Section['partSounds']> = { ...(section.partSounds ?? {}) };
  for (const k of ['intro', 'a', 'b', 'ending'] as SectionPartKey[]) parts[k] = { ...own, ...(parts[k] ?? {}) };
  return { ...rest, partSounds: parts } as T;
}

export function sectionHasArrangement(section: Section): boolean {
  const any = (o?: object) => !!o && Object.keys(o).length > 0;
  return !!section.styleId || any(section.trackStyles) || any(section.patterns)
    || Object.values(section.silenced ?? {}).some(Boolean) || any(section.sounds)
    || Object.values(section.partSounds ?? {}).some(any);
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
