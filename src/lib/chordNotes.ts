import { type Chord, chordToMidiNotes } from './musicTheory';

const MIDI_SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const MIDI_DISPLAY_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

function midiClass(midi: number, transposition: number): number {
  return ((midi + transposition) % 12 + 12) % 12;
}

export function getChordNotes(chord: Chord, transposition: number = 0): string[] {
  const midiNotes = chordToMidiNotes(chord);
  return [...new Set(midiNotes.map(midi => MIDI_SHARP_NAMES[midiClass(midi, transposition)]))];
}

export function getTransposedChordName(chord: Chord, transposition: number = 0): string {
  // For slash chords use the original root notes (first interval = root), not the bass note
  const rootMidiNotes = chordToMidiNotes({ ...chord, bassNote: undefined });
  const rootName = MIDI_DISPLAY_NAMES[midiClass(rootMidiNotes[0], transposition)];
  const qualityDisplay = chord.quality === 'maj' ? '' : chord.quality;
  const base = `${rootName}${qualityDisplay}`;
  if (!chord.bassNote) return base;
  // Transpose the bass note name too
  const MIDI_SHARP: Record<string, number> = { C:60,D:62,E:64,F:65,G:67,A:69,B:71 };
  const bn = chord.bassNote.trim();
  let bassMidi = MIDI_SHARP[bn[0]?.toUpperCase()] ?? 60;
  if (bn[1] === '#') bassMidi += 1;
  else if (bn[1] === 'b') bassMidi -= 1;
  const bassName = MIDI_DISPLAY_NAMES[midiClass(bassMidi, transposition)];
  return `${base}/${bassName}`;
}
