/**
 * Key detection for the chord editor.
 *
 * The editor stores a progression as bare chords with no key attached, but the
 * transpose control and the in-key chord pickers both need to name a tonic. This
 * guesses one from the chords themselves and spells it the way the rest of the site
 * does, so the label it returns can be handed straight to `getDiatonicChords()`
 * (see `musicKeys.ts` — its ALL_KEYS list is the spelling contract).
 */

import { chordToMidiNotes, type Chord } from './musicTheory';
import type { Section } from './sections';

export type KeyMode = 'major' | 'minor';

export interface DetectedKey {
  /** 0-11, C = 0. The tonic of the progression as stored, i.e. before transposition. */
  pitchClass: number;
  mode: KeyMode;
}

export function mod12(n: number): number {
  return ((n % 12) + 12) % 12;
}

// Indexed by pitch class. These are the 24 spellings ALL_KEYS uses, which is also what
// getDiatonicChords() knows how to parse — do not "fix" Db to C# here without checking both.
export const MAJOR_KEY_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
export const MINOR_KEY_NAMES = ['Cm', 'C#m', 'Dm', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'Bbm', 'Bm'];

export function keyLabel(pitchClass: number, mode: KeyMode): string {
  const names = mode === 'minor' ? MINOR_KEY_NAMES : MAJOR_KEY_NAMES;
  return names[mod12(pitchClass)];
}

/**
 * The same key read in the other mode — C major and A minor are one key signature, so
 * switching the mode toggle moves the tonic to the relative and leaves the music alone.
 */
export function relativeTonic(pitchClass: number, from: KeyMode, to: KeyMode): number {
  if (from === to) return mod12(pitchClass);
  return to === 'minor' ? mod12(pitchClass - 3) : mod12(pitchClass + 3);
}

const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
// The leading tone (11) rides along with natural minor: a minor progression that uses a
// major V is still in that minor key, and penalising the F# of an Am–E7 would misread it.
const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10, 11];

type Flavor = 'major' | 'minor' | 'dim' | 'other';

// Degree (semitones above the tonic) → the triad quality the key expects there.
const MAJOR_DEGREES: Record<number, Flavor> = { 0: 'major', 2: 'minor', 4: 'minor', 5: 'major', 7: 'major', 9: 'minor', 11: 'dim' };
const MINOR_DEGREES: Record<number, Flavor> = { 0: 'minor', 2: 'dim', 3: 'major', 5: 'minor', 7: 'minor', 8: 'major', 10: 'major' };

interface ChordFacts {
  weight: number;
  root: number;
  tones: number[];
  flavor: Flavor;
}

function readChord(chord: Chord): ChordFacts {
  // bassNote is dropped so notes[0] is the true root — chordToMidiNotes() puts the bass
  // first for slash chords, which would otherwise read C/E as an E chord.
  const midi = chordToMidiNotes({ ...chord, bassNote: undefined });
  const root = mod12(midi[0]);
  const tones = [...new Set(midi.map(mod12))];
  const has = (interval: number) => tones.includes(mod12(root + interval));

  let flavor: Flavor = 'other';
  if (has(3)) flavor = has(6) && !has(7) ? 'dim' : 'minor';
  else if (has(4)) flavor = 'major';

  return { weight: Math.max(chord.duration, 0.5), root, tones, flavor };
}

/**
 * Guesses the key of a progression, or null when there is nothing to go on.
 *
 * Scoring per chord, weighted by how long it sounds: how much of it fits the scale, then
 * whether its quality is the one the key expects on that degree, with the tonic and the
 * dominant weighted heavier. Relative keys share a scale, so what separates C from Am is
 * almost entirely those tonic bonuses plus where the progression starts and ends.
 */
export function detectKey(sections: Section[]): DetectedKey | null {
  const chords = sections.flatMap((section) => section.chords);
  if (chords.length === 0) return null;

  const facts = chords.map(readChord);
  const totalWeight = facts.reduce((sum, f) => sum + f.weight, 0);
  const first = facts[0];
  const last = facts[facts.length - 1];

  let best: DetectedKey | null = null;
  let bestScore = -Infinity;

  for (const mode of ['major', 'minor'] as KeyMode[]) {
    const scale = mode === 'minor' ? MINOR_SCALE : MAJOR_SCALE;
    const degrees = mode === 'minor' ? MINOR_DEGREES : MAJOR_DEGREES;
    const tonicFlavor: Flavor = mode === 'minor' ? 'minor' : 'major';

    for (let tonic = 0; tonic < 12; tonic++) {
      let score = 0;

      for (const f of facts) {
        const inScale = f.tones.filter((t) => scale.includes(mod12(t - tonic))).length;
        let chordScore = (inScale / f.tones.length) * 3;

        const degree = mod12(f.root - tonic);
        if (degrees[degree] === f.flavor) chordScore += 1;
        if (degree === 0) chordScore += f.flavor === tonicFlavor ? 2.5 : 0.5;
        if (degree === 7 && f.flavor === 'major') chordScore += 0.75;

        score += chordScore * f.weight;
      }

      // Progressions tend to leave from and land on the tonic. Both bonuses stay small
      // next to the per-chord scores: when they were heavy, appending one chord to
      // C-Am-F-G was enough to re-read the whole song as F major and respell it.
      if (first.root === tonic) score += totalWeight * 0.3;
      if (last.root === tonic) score += totalWeight * 0.15;
      // Nudge so a genuine tie (an ambiguous two-chord loop) reads as major.
      if (mode === 'major') score += 0.001;

      if (score > bestScore) {
        bestScore = score;
        best = { pitchClass: tonic, mode };
      }
    }
  }

  return best;
}
