import { transposeNote, type RootNote, type Accidental } from './musicTheory';

/**
 * The chords of a song written out in the keys people actually search for.
 *
 * The keys below are not a music-theory choice, they are the demand curve. Over 90 days
 * of Search Console (Jun-Sep 2026) the key-modified queries reaching this site break
 * down as G 2,346 impressions, C 2,307, D 490, A 322, E 227, F 148 — these six are 96%
 * of it, and G and C alone are 77%. B, Ab and Bb are the long tail and are only ever
 * shown here when a song is recorded in one.
 *
 * The recorded key is deliberately NOT the point of this. It is the one key nobody
 * searches for: great-are-you-lord is recorded in A and earns its clicks on "key of g",
 * center-bethel is recorded in A and earns them on "key of c". People search the key
 * they want to sing in. So the original is listed and labelled, but it is one row among
 * several rather than the answer.
 */

// Ordered by search demand, highest first, so the row someone came for is near the top.
export const COMMON_SEARCHED_KEYS = ['G', 'C', 'D', 'A', 'E', 'F'] as const;

// A key signature with flats in it should spell its chords with flats: the IV of F is Bb,
// never A#. Everything else takes the sharp spelling transposeNote returns.
//
// Minor keys need their own list rather than being derived from the root letter: a minor
// key borrows the signature of its relative major, three semitones up. G major is sharp
// but G MINOR is Bb major's relative and therefore flat, so a song in F#m offered "in G"
// has to read Gm / Eb / Bb / F and not Gm / D# / A# / F.
const FLAT_MAJOR_KEYS = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb']);
const FLAT_MINOR_KEYS = new Set(['Dm', 'Gm', 'Cm', 'Fm', 'Bbm', 'Ebm', 'Abm']);

const NOTE_PITCH_CLASS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

interface SplitName {
  root: RootNote;
  accidental: Accidental;
  /** Everything after the root and its accidental, kept verbatim ("m7", "sus4", "add9"). */
  rest: string;
}

/**
 * Splits "F#m7" into F / # / m7.
 *
 * Only the root is ever transposed and the suffix is carried through untouched, which is
 * why this does not round-trip through the Chord type: parsing a quality and rendering it
 * back loses the exact spelling the chart author wrote (and getTransposedChordName would
 * render a 'min' quality as "Cmin"). Accepts ♯/♭ as well as #/b — charts use both.
 */
function splitChordName(name: string): SplitName | null {
  const trimmed = name.trim();
  const rootChar = trimmed[0]?.toUpperCase();
  if (!rootChar || !(rootChar in NOTE_PITCH_CLASS)) return null;

  let index = 1;
  let accidental: Accidental = '';
  const next = trimmed[1];
  if (next === '#' || next === '♯') {
    accidental = '#';
    index = 2;
  } else if (next === 'b' || next === '♭') {
    accidental = 'b';
    index = 2;
  }

  return { root: rootChar as RootNote, accidental, rest: trimmed.slice(index) };
}

export function pitchClassOf(note: string): number | null {
  const split = splitChordName(note);
  if (!split) return null;
  const offset = split.accidental === '#' ? 1 : split.accidental === 'b' ? -1 : 0;
  return ((NOTE_PITCH_CLASS[split.root] + offset) % 12 + 12) % 12;
}

/** Shifts one chord name by N semitones, suffix and slash bass note included. */
export function transposeChordName(name: string, semitones: number, preferFlats: boolean): string {
  const slashIndex = name.indexOf('/');
  const head = slashIndex === -1 ? name : name.slice(0, slashIndex);
  const bass = slashIndex === -1 ? null : name.slice(slashIndex + 1);

  const split = splitChordName(head);
  if (!split) return name;

  const moved = transposeNote(split.root, split.accidental, semitones, preferFlats);
  const chord = `${moved.root}${moved.accidental}${split.rest}`;
  if (bass === null) return chord;

  const bassSplit = splitChordName(bass);
  if (!bassSplit) return `${chord}/${bass}`;
  const movedBass = transposeNote(bassSplit.root, bassSplit.accidental, semitones, preferFlats);
  return `${chord}/${movedBass.root}${movedBass.accidental}${bassSplit.rest}`;
}

export interface KeyVariant {
  /** Root of the key, e.g. "G" — no modality suffix, for ids and labels. */
  key: string;
  /** How the key reads to a musician, e.g. "G" or "Em" for a song recorded minor. */
  label: string;
  chords: string[];
  isOriginal: boolean;
  semitones: number;
}

/**
 * Every listed key for a song: its own first, then the searched keys it is not already in.
 *
 * A minor song stays minor — a song in F#m offered "in G" means Gm, not G major — so the
 * modality suffix of the recorded key rides along into every label. The transposition
 * itself is a root-to-root semitone shift either way.
 */
export function buildKeyVariants(songKey: string, chords: string[]): KeyVariant[] {
  const cleanChords = chords.map((c) => c.trim()).filter(Boolean);
  if (cleanChords.length === 0) return [];

  const rawKey = (songKey || '').trim();
  const modality = /m$/.test(rawKey) && !/maj$/i.test(rawKey) ? 'm' : '';
  const rootOfKey = modality ? rawKey.slice(0, -1) : rawKey;
  const sourcePitch = pitchClassOf(rootOfKey);
  if (sourcePitch === null) return [];

  const seen = new Set<number>();
  const variants: KeyVariant[] = [];

  const push = (targetRoot: string, isOriginal: boolean) => {
    const targetPitch = pitchClassOf(targetRoot);
    if (targetPitch === null || seen.has(targetPitch)) return;
    seen.add(targetPitch);

    const semitones = ((targetPitch - sourcePitch) % 12 + 12) % 12;
    const label = `${targetRoot}${modality}`;
    const preferFlats = modality ? FLAT_MINOR_KEYS.has(label) : FLAT_MAJOR_KEYS.has(targetRoot);
    variants.push({
      key: targetRoot,
      label,
      chords: cleanChords.map((c) => transposeChordName(c, semitones, preferFlats)),
      isOriginal,
      semitones,
    });
  };

  push(rootOfKey, true);
  for (const key of COMMON_SEARCHED_KEYS) push(key, false);

  return variants;
}
