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

// Extended chord qualities - ordered by frequency of use
export const CHORD_QUALITIES = [
  // Triads — used in virtually every song
  'maj', 'min', 'dim', 'aug', '5',
  // Suspended — very common in pop/rock
  'sus2', 'sus4', '7sus4',
  // Seventh — staple of jazz, blues, pop
  '7', 'maj7', 'min7', 'minMaj7',
  // Add chords — common in pop
  'add9', 'minadd9', 'add11',
  // Sixth
  '6', 'min6', '6/9',
  // Ninth
  '9', 'maj9', 'min9',
  // Eleventh
  '11', 'maj11', 'min11',
  // Thirteenth
  '13', 'maj13', 'min13',
  // Less common seventh variants
  'dim7', 'aug7', 'm7b5',
  // Altered / extended
  '7b9', '7#9', '7b5', '7#5', '9b5', '9#5', 'maj7#11',
] as const;
export type ChordQuality = typeof CHORD_QUALITIES[number];

// Chord data structure
export interface Chord {
  id: string;
  root: RootNote;
  accidental: Accidental;
  quality: ChordQuality;
  duration: number; // in beats
  bassNote?: string; // slash chord bass note, e.g. 'E' in C/E, 'B' in G/B
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
  // Triads
  'maj': [0, 4, 7],
  'min': [0, 3, 7],
  'dim': [0, 3, 6],
  'aug': [0, 4, 8],
  // Suspended
  'sus2': [0, 2, 7],
  'sus4': [0, 5, 7],
  // Sixth
  '6': [0, 4, 7, 9],
  'min6': [0, 3, 7, 9],
  // Seventh
  '7': [0, 4, 7, 10],
  'maj7': [0, 4, 7, 11],
  'min7': [0, 3, 7, 10],
  'dim7': [0, 3, 6, 9],
  'aug7': [0, 4, 8, 10],
  'minMaj7': [0, 3, 7, 11],
  'm7b5': [0, 3, 6, 10],
  // Ninth
  'add9': [0, 4, 7, 14],
  '9': [0, 4, 7, 10, 14],
  'maj9': [0, 4, 7, 11, 14],
  'min9': [0, 3, 7, 10, 14],
  '7b9': [0, 4, 7, 10, 13],
  '7#9': [0, 4, 7, 10, 15],
  // Eleventh
  '11': [0, 4, 7, 10, 14, 17],
  'maj11': [0, 4, 7, 11, 14, 17],
  'min11': [0, 3, 7, 10, 14, 17],
  'add11': [0, 4, 7, 17],
  // Thirteenth
  '13': [0, 4, 7, 10, 14, 21],
  'maj13': [0, 4, 7, 11, 14, 21],
  'min13': [0, 3, 7, 10, 14, 21],
  // Altered
  '7#5': [0, 4, 8, 10],
  '7b5': [0, 4, 6, 10],
  '9#5': [0, 4, 8, 10, 14],
  '9b5': [0, 4, 6, 10, 14],
  // Power chord
  '5': [0, 7],
  // Suspended dominant
  '7sus4': [0, 5, 7, 10],
  // Lydian
  'maj7#11': [0, 4, 7, 11, 18],
  // Six-nine
  '6/9': [0, 4, 7, 9, 14],
  // Minor add9
  'minadd9': [0, 3, 7, 14],
};

/** Returns the pitch class (0-11) of a bass note string like 'E', 'F#', 'Bb'. */
function bassNoteToClass(bassNote: string): number | null {
  const trimmed = bassNote.trim();
  if (!trimmed) return null;
  const rootChar = trimmed[0].toUpperCase() as RootNote;
  if (!(ROOT_NOTES as readonly string[]).includes(rootChar)) return null;
  let cls = NOTE_TO_MIDI[rootChar] % 12;
  if (trimmed[1] === '#') cls = (cls + 1) % 12;
  else if (trimmed[1] === 'b') cls = (cls - 1 + 12) % 12;
  return cls;
}

/**
 * Converts a chord to an array of MIDI note numbers.
 * When the chord has a `bassNote` (slash chord), the bass note is placed
 * below all other chord tones so inversions sound correct.
 * @param chord - The chord to convert
 * @param octave - Base octave (default 4, middle C)
 * @returns Array of MIDI note numbers, lowest first when inverted
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
  const notes = intervals.map(interval => rootMidi + interval);

  if (chord.bassNote) {
    const targetClass = bassNoteToClass(chord.bassNote);
    if (targetClass !== null) {
      const pitchClass = (n: number) => ((n % 12) + 12) % 12;
      const bassIdx = notes.findIndex(n => pitchClass(n) === targetClass);

      let bassNote: number;
      let remaining: number[];

      if (bassIdx !== -1) {
        // Chord tone in bass — move it below the other notes
        bassNote = notes[bassIdx];
        remaining = notes.filter((_, i) => i !== bassIdx);
      } else {
        // Pedal tone — place it below the chord
        bassNote = rootMidi - 12 + targetClass - (rootMidi % 12);
        remaining = notes;
      }

      // Shift bass note down by octaves until it is below all remaining notes
      const lowestRemaining = Math.min(...remaining);
      while (bassNote >= lowestRemaining) bassNote -= 12;

      return [bassNote, ...remaining];
    }
  }

  return notes;
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
  // Triads
  'maj': 'Major',
  'min': 'Minor',
  'dim': 'Dim',
  'aug': 'Aug',
  // Suspended
  'sus2': 'Sus2',
  'sus4': 'Sus4',
  // Sixth
  '6': '6th',
  'min6': 'Min6',
  // Seventh
  '7': 'Dom7',
  'maj7': 'Maj7',
  'min7': 'Min7',
  'dim7': 'Dim7',
  'aug7': 'Aug7',
  'minMaj7': 'minMaj7',
  'm7b5': 'm7♭5',
  // Ninth
  'add9': 'Add9',
  '9': '9th',
  'maj9': 'Maj9',
  'min9': 'Min9',
  '7b9': '7♭9',
  '7#9': '7♯9',
  // Eleventh
  '11': '11th',
  'maj11': 'Maj11',
  'min11': 'Min11',
  'add11': 'Add11',
  // Thirteenth
  '13': '13th',
  'maj13': 'Maj13',
  'min13': 'Min13',
  // Altered
  '7#5': '7♯5',
  '7b5': '7♭5',
  '9#5': '9♯5',
  '9b5': '9♭5',
  // Power chord
  '5': 'Power5',
  // Suspended dominant
  '7sus4': '7sus4',
  // Lydian
  'maj7#11': 'Maj7♯11',
  // Six-nine
  '6/9': '6/9',
  // Minor add9
  'minadd9': 'mAdd9',
};
