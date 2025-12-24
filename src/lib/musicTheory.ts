/**
 * Music Theory Utilities
 * 
 * This module handles chord-to-MIDI conversion using standard music theory.
 * Each chord is defined by its root note and quality, which determines the intervals.
 */

// Root notes and their MIDI base values (octave 4)
export const ROOT_NOTES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
export type RootNote = typeof ROOT_NOTES[number];

// Chord qualities and their intervals from root
export const CHORD_QUALITIES = ['maj', 'min', 'dim', 'aug', '7', 'maj7', 'min7'] as const;
export type ChordQuality = typeof CHORD_QUALITIES[number];

// Chord data structure
export interface Chord {
  id: string;
  root: RootNote;
  quality: ChordQuality;
  duration: number; // in beats
}

// MIDI note numbers for C4 octave (middle C = 60)
const NOTE_TO_MIDI: Record<RootNote, number> = {
  'C': 60,
  'D': 62,
  'E': 64,
  'F': 65,
  'G': 67,
  'A': 69,
  'B': 71,
};

// Intervals (in semitones) for each chord quality
// These define the characteristic sound of each chord type
const QUALITY_INTERVALS: Record<ChordQuality, number[]> = {
  'maj': [0, 4, 7],           // Major triad: root, major 3rd, perfect 5th
  'min': [0, 3, 7],           // Minor triad: root, minor 3rd, perfect 5th
  'dim': [0, 3, 6],           // Diminished: root, minor 3rd, diminished 5th
  'aug': [0, 4, 8],           // Augmented: root, major 3rd, augmented 5th
  '7': [0, 4, 7, 10],         // Dominant 7th: major triad + minor 7th
  'maj7': [0, 4, 7, 11],      // Major 7th: major triad + major 7th
  'min7': [0, 3, 7, 10],      // Minor 7th: minor triad + minor 7th
};

/**
 * Converts a chord to an array of MIDI note numbers
 * @param chord - The chord to convert
 * @param octave - Base octave (default 4, middle C)
 * @returns Array of MIDI note numbers
 */
export function chordToMidiNotes(chord: Chord, octave: number = 4): number[] {
  const rootMidi = NOTE_TO_MIDI[chord.root] + (octave - 4) * 12;
  const intervals = QUALITY_INTERVALS[chord.quality];
  
  return intervals.map(interval => rootMidi + interval);
}

/**
 * Converts MIDI note number to frequency in Hz
 * Uses the standard A4 = 440Hz tuning
 * @param midiNote - MIDI note number (0-127)
 * @returns Frequency in Hz
 */
export function midiToFrequency(midiNote: number): number {
  return 440 * Math.pow(2, (midiNote - 69) / 12);
}

/**
 * Formats a chord for display
 * @param chord - The chord to format
 * @returns Display string (e.g., "Cmaj7", "Amin")
 */
export function formatChord(chord: Chord): string {
  return `${chord.root}${chord.quality}`;
}

/**
 * Generates a unique ID for a new chord
 */
export function generateChordId(): string {
  return `chord_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Creates a new chord with default values
 */
export function createChord(
  root: RootNote = 'C',
  quality: ChordQuality = 'maj',
  duration: number = 2
): Chord {
  return {
    id: generateChordId(),
    root,
    quality,
    duration,
  };
}
