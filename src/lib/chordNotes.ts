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
  const midiNotes = chordToMidiNotes(chord);
  const rootName = MIDI_DISPLAY_NAMES[midiClass(midiNotes[0], transposition)];
  const qualityDisplay = chord.quality === 'maj' ? '' : chord.quality;
  return `${rootName}${qualityDisplay}`;
}
