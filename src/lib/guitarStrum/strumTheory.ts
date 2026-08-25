import {
  transposeNote,
  chordToMidiNotes,
  createChord,
  type Chord,
  type ChordQuality,
  type RootNote,
  type Accidental,
} from '@/lib/musicTheory';
import type { GuitarVoicing } from '@/data/guitarChords';

/** Fallback when getGuitarVoicing() can't find a shape for a quality — all strings muted. */
export const SILENT_VOICING: GuitarVoicing = {
  frets: [-1, -1, -1, -1, -1, -1],
  fingers: [0, 0, 0, 0, 0, 0],
  baseFret: 1,
};

/** Standard tuning, low E → high e. Index-matches GuitarVoicing.frets (0 = low E, 5 = high e). */
export const STRING_MIDI = [40, 45, 50, 55, 59, 64];
export const STRING_LABELS = ['E', 'A', 'D', 'G', 'B', 'e'];

const ACCIDENTAL_SYMBOL: Record<Accidental, string> = { '': '', '#': '#', b: '♭' };

/**
 * Curated subset of ChordQuality this tool exposes in its root/type picker, with the
 * compact suffixes used in the big mono chord readout (e.g. "Bm", "D7", "Gsus4").
 */
export const STRUM_CHORD_TYPES: { quality: ChordQuality; label: string; suffix: string }[] = [
  { quality: 'maj', label: 'Major', suffix: '' },
  { quality: 'min', label: 'Minor', suffix: 'm' },
  { quality: '7', label: '7th', suffix: '7' },
  { quality: 'maj7', label: 'Maj7', suffix: 'maj7' },
  { quality: 'min7', label: 'Min7', suffix: 'm7' },
  { quality: 'sus4', label: 'Sus4', suffix: 'sus4' },
  { quality: 'sus2', label: 'Sus2', suffix: 'sus2' },
  { quality: 'add9', label: 'Add9', suffix: 'add9' },
  { quality: '6', label: '6th', suffix: '6' },
  { quality: 'min6', label: 'Min6', suffix: 'm6' },
  { quality: '9', label: '9th', suffix: '9' },
  { quality: 'min9', label: 'Min9', suffix: 'm9' },
  { quality: 'dim', label: 'Dim', suffix: 'dim' },
  { quality: 'aug', label: 'Aug', suffix: 'aug' },
  { quality: 'm7b5', label: 'm7♭5', suffix: 'm7♭5' },
  { quality: '7sus4', label: '7sus4', suffix: '7sus4' },
  { quality: '13', label: '13th', suffix: '13' },
  { quality: '5', label: 'Power5', suffix: '5' },
];

/** All 12 chromatic roots (sharp spelling), for the root picker grid. */
export const CHROMATIC_ROOTS: { root: RootNote; accidental: Accidental }[] = Array.from(
  { length: 12 },
  (_, i) => transposeNote('C', '', i),
);

export function chordLabel(chord: Chord): string {
  const type = STRUM_CHORD_TYPES.find(t => t.quality === chord.quality);
  return chord.root + ACCIDENTAL_SYMBOL[chord.accidental] + (type ? type.suffix : chord.quality);
}

/** e.g. "D · F# · A" — unique pitch classes in the chord, sharp-spelled. */
export function chordNoteNames(chord: Chord): string {
  const seen = new Set<number>();
  const names: string[] = [];
  for (const midi of chordToMidiNotes(chord)) {
    const pitchClass = ((midi % 12) + 12) % 12;
    if (seen.has(pitchClass)) continue;
    seen.add(pitchClass);
    const spelled = transposeNote('C', '', pitchClass);
    names.push(spelled.root + ACCIDENTAL_SYMBOL[spelled.accidental]);
  }
  return names.join(' · ');
}

export function makeChord(root: RootNote, accidental: Accidental, quality: ChordQuality): Chord {
  return createChord(root, accidental, quality, 4);
}

export function resample<T>(arr: T[], to: number, fill: T): T[] {
  const from = arr.length;
  if (from === to) return arr.slice();
  if (to > from) {
    const out = new Array<T>(to).fill(fill);
    const k = to / from;
    arr.forEach((v, i) => { out[Math.round(i * k)] = v; });
    return out;
  }
  const out = new Array<T>(to).fill(fill);
  for (let i = 0; i < to; i++) out[i] = arr[Math.min(from - 1, Math.round((i * from) / to))];
  return out;
}
