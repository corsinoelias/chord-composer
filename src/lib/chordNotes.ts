import { type Chord, chordToMidiNotes } from './musicTheory';
import { chordSuffix } from './keyPalette';

const MIDI_SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const MIDI_FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const MIDI_DISPLAY_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const MIDI_FLAT_DISPLAY_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];

function midiClass(midi: number, transposition: number): number {
  return ((midi + transposition) % 12 + 12) % 12;
}

/**
 * `preferFlats` spells the black keys as D♭/E♭/G♭/A♭/B♭ instead of C♯/D♯/F♯/G♯/A♯.
 *
 * It defaults to false — the sharp table has always been the only spelling, and
 * progressionPreview.ts parses this output back into an engine name that expects it — so
 * only callers that know the key ask for flats. The IV of F is B♭, never A♯.
 */
export function getChordNotes(chord: Chord, transposition: number = 0, preferFlats: boolean = false): string[] {
  const NAMES = preferFlats ? MIDI_FLAT_NAMES : MIDI_SHARP_NAMES;
  // Root must stay first regardless of slash-chord bass note — chordToMidiNotes()
  // puts the bass note first (for correct audio voicing), but PianoKeyboard relies
  // on activeNotes[0] being the true root to lay out keys in the right octave.
  const rootMidiNotes = chordToMidiNotes({ ...chord, bassNote: undefined });
  const names = rootMidiNotes.map(midi => NAMES[midiClass(midi, transposition)]);
  if (!chord.bassNote) return [...new Set(names)];

  const bassMidi = chordToMidiNotes(chord)[0];
  const bassName = NAMES[midiClass(bassMidi, transposition)];
  return [...new Set([...names, bassName])];
}

/**
 * See getChordNotes() for what `preferFlats` does and why it defaults to off.
 *
 * `short` writes the type the way the chord player and the Android app do (Am, Bm7, C#°)
 * instead of the stored name (Amin, Bmin7, C#dim). Off by default: song pages and the
 * preview parser read the stored spelling.
 */
export function getTransposedChordName(chord: Chord, transposition: number = 0, preferFlats: boolean = false, short: boolean = false): string {
  const NAMES = preferFlats ? MIDI_FLAT_DISPLAY_NAMES : MIDI_DISPLAY_NAMES;
  // For slash chords use the original root notes (first interval = root), not the bass note
  const rootMidiNotes = chordToMidiNotes({ ...chord, bassNote: undefined });
  const rootName = NAMES[midiClass(rootMidiNotes[0], transposition)];
  const qualityDisplay = short ? chordSuffix(chord.quality) : chord.quality === 'maj' ? '' : chord.quality;
  const base = `${rootName}${qualityDisplay}`;
  if (!chord.bassNote) return base;
  // Transpose the bass note name too
  const MIDI_SHARP: Record<string, number> = { C:60,D:62,E:64,F:65,G:67,A:69,B:71 };
  const bn = chord.bassNote.trim();
  let bassMidi = MIDI_SHARP[bn[0]?.toUpperCase()] ?? 60;
  if (bn[1] === '#') bassMidi += 1;
  else if (bn[1] === 'b') bassMidi -= 1;
  const bassName = NAMES[midiClass(bassMidi, transposition)];
  return `${base}/${bassName}`;
}
