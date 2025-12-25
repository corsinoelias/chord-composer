/**
 * Music Theory Utilities
 * 
 * This module handles chord-to-MIDI conversion using standard music theory.
 * Each chord is defined by its root note and quality, which determines the intervals.
 */

// Root notes (natural notes only, accidentals are handled separately)
export const ROOT_NOTES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
export type RootNote = typeof ROOT_NOTES[number];

// Accidentals for sharp/flat/natural
export const ACCIDENTALS = ['', '#', 'b'] as const;
export type Accidental = typeof ACCIDENTALS[number];

// Extended chord qualities
export const CHORD_QUALITIES = [
  'maj', 'min', 'dim', 'aug',
  '7', 'maj7', 'min7', 'dim7',
  'sus2', 'sus4', 'add9',
  '9', 'maj9', 'min9',
  '6', 'min6', 'm7b5'
] as const;
export type ChordQuality = typeof CHORD_QUALITIES[number];

// Chord data structure
export interface Chord {
  id: string;
  root: RootNote;
  accidental: Accidental;
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
const QUALITY_INTERVALS: Record<ChordQuality, number[]> = {
  'maj': [0, 4, 7],
  'min': [0, 3, 7],
  'dim': [0, 3, 6],
  'aug': [0, 4, 8],
  '7': [0, 4, 7, 10],
  'maj7': [0, 4, 7, 11],
  'min7': [0, 3, 7, 10],
  'dim7': [0, 3, 6, 9],
  'sus2': [0, 2, 7],
  'sus4': [0, 5, 7],
  'add9': [0, 4, 7, 14],
  '9': [0, 4, 7, 10, 14],
  'maj9': [0, 4, 7, 11, 14],
  'min9': [0, 3, 7, 10, 14],
  '6': [0, 4, 7, 9],
  'min6': [0, 3, 7, 9],
  'm7b5': [0, 3, 6, 10],
};

/**
 * Converts a chord to an array of MIDI note numbers
 * @param chord - The chord to convert
 * @param octave - Base octave (default 4, middle C)
 * @returns Array of MIDI note numbers
 */
export function chordToMidiNotes(chord: Chord, octave: number = 4): number[] {
  let rootMidi = NOTE_TO_MIDI[chord.root] + (octave - 4) * 12;
  
  // Apply accidental
  if (chord.accidental === '#') {
    rootMidi += 1;
  } else if (chord.accidental === 'b') {
    rootMidi -= 1;
  }
  
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
 * @returns Display string (e.g., "C#maj7", "Abmin")
 */
export function formatChord(chord: Chord): string {
  const accidentalDisplay = chord.accidental === '#' ? '♯' : chord.accidental === 'b' ? '♭' : '';
  return `${chord.root}${accidentalDisplay}${chord.quality}`;
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
  accidental: Accidental = '',
  quality: ChordQuality = 'maj',
  duration: number = 2
): Chord {
  return {
    id: generateChordId(),
    root,
    accidental,
    quality,
    duration,
  };
}

/**
 * Quality display labels
 */
export const QUALITY_LABELS: Record<ChordQuality, string> = {
  'maj': 'Major',
  'min': 'Minor',
  'dim': 'Dim',
  'aug': 'Aug',
  '7': 'Dom7',
  'maj7': 'Maj7',
  'min7': 'Min7',
  'dim7': 'Dim7',
  'sus2': 'Sus2',
  'sus4': 'Sus4',
  'add9': 'Add9',
  '9': '9th',
  'maj9': 'Maj9',
  'min9': 'Min9',
  '6': '6th',
  'min6': 'Min6',
  'm7b5': 'm7♭5',
};
