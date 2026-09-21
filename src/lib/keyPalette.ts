/**
 * How the chord player writes chords and reads them against the song's key — ported from
 * the Android app (`chord_sequencer`: lib/core/music/chord_spelling.dart and
 * key_signature.dart), which is the standard the web now follows for these screens.
 *
 * Display only: nothing here changes what a song stores or what the engine plays.
 */

import { type Accidental, type Chord, type ChordQuality, type RootNote } from './musicTheory';
import { mod12, MAJOR_KEY_NAMES, MINOR_KEY_NAMES, type DetectedKey, type KeyMode } from './keyDetect';

/**
 * A chord type as a musician writes it after the root: nothing for a major triad, "m" for
 * a minor one, "°" for a diminished one — "Am", "G", "Bm7", not "Amin", "Gmaj", "Bmin7".
 */
const SHORT_SUFFIX: Partial<Record<ChordQuality, string>> = {
  maj: '',
  min: 'm',
  min6: 'm6',
  min7: 'm7',
  min9: 'm9',
  min11: 'm11',
  min13: 'm13',
  minMaj7: 'm(maj7)',
  minadd9: 'm(add9)',
  dim: '°',
  dim7: '°7',
  aug: '+',
  aug7: '+7',
  aug9: '+9',
};

export function chordSuffix(quality: ChordQuality): string {
  const short = SHORT_SUFFIX[quality];
  if (short !== undefined) return short;
  // 7b5 → 7♭5, 7#9 → 7♯9. A "b" is only a flat when a number follows it.
  return quality.replace(/b(?=\d)/g, '♭').replace(/#/g, '♯');
}

const LETTER_PC: Record<RootNote, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function pitchClassOf(root: RootNote, accidental: Accidental): number {
  return mod12(LETTER_PC[root] + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0));
}

const SHARP_SPELLING: [RootNote, Accidental][] = [
  ['C', ''], ['C', '#'], ['D', ''], ['D', '#'], ['E', ''], ['F', ''],
  ['F', '#'], ['G', ''], ['G', '#'], ['A', ''], ['A', '#'], ['B', ''],
];
const FLAT_SPELLING: [RootNote, Accidental][] = [
  ['C', ''], ['D', 'b'], ['D', ''], ['E', 'b'], ['E', ''], ['F', ''],
  ['G', 'b'], ['G', ''], ['A', 'b'], ['A', ''], ['B', 'b'], ['B', ''],
];

export function spellPitchClass(pc: number, flats: boolean): { root: RootNote; accidental: Accidental } {
  const [root, accidental] = (flats ? FLAT_SPELLING : SHARP_SPELLING)[mod12(pc)];
  return { root, accidental };
}

// ─── Keys ────────────────────────────────────────────────────────────────────────────

interface Borrowing {
  semitones: number;
  triad: ChordQuality;
  seventh: ChordQuality;
  /** What the borrowing is called by the people who use it: "♭VI" says where, not why. */
  gloss: string;
}

/**
 * Borrowed from the parallel minor, which is where a major key goes when it wants to
 * darken without leaving. The Neapolitan is the one outsider, from neither scale.
 */
const MAJOR_BORROWINGS: Borrowing[] = [
  { semitones: 5, triad: 'min', seventh: 'min7', gloss: 'minor four' },
  { semitones: 10, triad: 'maj', seventh: '7', gloss: 'subtonic' },
  { semitones: 8, triad: 'maj', seventh: 'maj7', gloss: 'flat six' },
  { semitones: 3, triad: 'maj', seventh: 'maj7', gloss: 'flat three' },
  { semitones: 2, triad: 'dim', seventh: 'm7b5', gloss: 'half-dim. two' },
  { semitones: 1, triad: 'maj', seventh: 'maj7', gloss: 'Neapolitan' },
];

/** A minor key's own outside chords; the raised seventh is harmonic minor's dominant. */
const MINOR_BORROWINGS: Borrowing[] = [
  { semitones: 7, triad: 'maj', seventh: '7', gloss: 'major dominant' },
  { semitones: 11, triad: 'dim', seventh: 'm7b5', gloss: 'leading tone' },
  { semitones: 5, triad: 'maj', seventh: '7', gloss: 'Dorian four' },
  { semitones: 9, triad: 'dim', seventh: 'm7b5', gloss: 'Dorian six' },
  { semitones: 0, triad: 'maj', seventh: 'maj7', gloss: 'Picardy third' },
  { semitones: 1, triad: 'maj', seventh: 'maj7', gloss: 'Neapolitan' },
];

interface ScaleDef {
  steps: number[];
  triads: ChordQuality[];
  sevenths: ChordQuality[];
  /** A numeral for all twelve semitones, so a chord from outside the key can say where it is. */
  chromatic: string[];
  borrowings: Borrowing[];
}

const SCALES: Record<KeyMode, ScaleDef> = {
  major: {
    steps: [0, 2, 4, 5, 7, 9, 11],
    triads: ['maj', 'min', 'min', 'maj', 'maj', 'min', 'dim'],
    sevenths: ['maj7', 'min7', 'min7', 'maj7', '7', 'min7', 'm7b5'],
    chromatic: ['I', '♭II', 'II', '♭III', 'III', 'IV', '♭V', 'V', '♭VI', 'VI', '♭VII', 'VII'],
    borrowings: MAJOR_BORROWINGS,
  },
  minor: {
    steps: [0, 2, 3, 5, 7, 8, 10],
    triads: ['min', 'dim', 'maj', 'min', 'min', 'maj', 'maj'],
    sevenths: ['min7', 'm7b5', 'maj7', 'min7', 'min7', 'maj7', '7'],
    // A minor key names its outsiders upward: the raised seventh is a leading tone.
    chromatic: ['I', '♭II', 'II', 'III', '♯III', 'IV', '♯IV', 'V', 'VI', '♯VI', 'VII', '♯VII'],
    borrowings: MINOR_BORROWINGS,
  },
};

type Family = 'maj' | 'min' | 'dim' | 'aug' | 'sus';

/** What a chord is, reduced to the part that decides whether it belongs on a degree. */
function familyOf(quality: ChordQuality): Family {
  switch (quality) {
    case 'min': case 'min6': case 'min7': case 'min9': case 'min11': case 'min13':
    case 'minMaj7': case 'minadd9':
      return 'min';
    case 'dim': case 'dim7': case 'm7b5':
      return 'dim';
    case 'aug': case 'aug7': case 'aug9': case '7#5': case '9#5':
      return 'aug';
    // No third, so it cannot disagree with the scale about one.
    case 'sus2': case 'sus4': case '7sus4': case '9sus4': case '5':
      return 'sus';
    default:
      return 'maj';
  }
}

export interface Degree {
  numeral: string;
  /** The key does not contain it: its root is off the scale, or it wears another quality. */
  borrowed: boolean;
}

/**
 * Where a chord sits in a key. The case follows the chord actually written, so a major
 * four in a minor key reads IV and its minor iv.
 */
export function degreeOf(chordPc: number, quality: ChordQuality, key: DetectedKey): Degree {
  const scale = SCALES[key.mode];
  const distance = mod12(chordPc - key.pitchClass);
  const onScale = scale.steps.indexOf(distance);
  const family = familyOf(quality);
  const borrowed = onScale < 0 || (family !== 'sus' && family !== familyOf(scale.triads[onScale]));
  const numeral = scale.chromatic[distance];
  const minorish = family === 'min' || family === 'dim';
  return { numeral: minorish ? numeral.toLowerCase() : numeral, borrowed };
}

/** The numeral of a stored chord against the song's key, both untransposed. */
export function chordDegree(chord: Chord, key: DetectedKey | null): Degree | null {
  if (!key) return null;
  return degreeOf(pitchClassOf(chord.root, chord.accidental), chord.quality, key);
}

/** Major and natural-minor keys conventionally written with flats, by tonic pitch class. */
const FLAT_MAJOR = new Set([5, 10, 3, 8, 1, 6]); // F Bb Eb Ab Db Gb
const FLAT_MINOR = new Set([2, 7, 0, 5, 10, 3]); // D G C F Bb Eb

function keyPrefersFlats(key: DetectedKey): boolean {
  return (key.mode === 'minor' ? FLAT_MINOR : FLAT_MAJOR).has(mod12(key.pitchClass));
}

/**
 * Flats or sharps for a note, by where it falls: the key's own preference for anything it
 * contains, and the numeral's for an outsider — the ♭VI of C is an A♭, never a G♯.
 */
function flatsFor(pc: number, key: DetectedKey): boolean {
  const numeral = SCALES[key.mode].chromatic[mod12(pc - key.pitchClass)];
  if (numeral.includes('♭')) return true;
  if (numeral.includes('♯')) return false;
  return keyPrefersFlats(key);
}

export function keyName(key: DetectedKey): string {
  return (key.mode === 'minor' ? MINOR_KEY_NAMES : MAJOR_KEY_NAMES)[mod12(key.pitchClass)];
}

/** "C", "F#m", "Bbm" — the ALL_KEYS spellings the rest of the site passes around. */
export function parseKeyName(name: string | undefined): DetectedKey | null {
  if (!name) return null;
  const m = name.trim().match(/^([A-G])([#b]?)(m?)$/);
  if (!m) return null;
  return {
    pitchClass: pitchClassOf(m[1] as RootNote, (m[2] || '') as Accidental),
    mode: m[3] ? 'minor' : 'major',
  };
}

// ─── The palette ─────────────────────────────────────────────────────────────────────

export type PaletteMode = 'triads' | 'sevenths' | 'ninths';

export interface PaletteChord {
  root: RootNote;
  accidental: Accidental;
  quality: ChordQuality;
  /** "Bm7", spelled for the key. */
  name: string;
  /** Its numeral in the key: "vi", "♭VI". */
  caption: string;
  /** What a borrowing is called: "flat six". */
  gloss?: string;
}

/** Ninths are the sevenths carried one further; the half-diminished stays as it is. */
function inMode(quality: ChordQuality, mode: PaletteMode): ChordQuality {
  if (mode !== 'ninths') return quality;
  if (quality === 'maj7') return 'add9';
  if (quality === 'min7') return 'min9';
  if (quality === '7') return '9';
  return quality;
}

/** The chord cards write accidentals as glyphs (chordNotes.ts), so the palette does too. */
const ACC_GLYPH: Record<Accidental, string> = { '': '', '#': '♯', b: '♭' };

function paletteChord(pc: number, quality: ChordQuality, key: DetectedKey, caption: string, gloss?: string): PaletteChord {
  const { root, accidental } = spellPitchClass(pc, flatsFor(pc, key));
  return { root, accidental, quality, name: `${root}${ACC_GLYPH[accidental]}${chordSuffix(quality)}`, caption, gloss };
}

/** The seven chords of the key, in the given vocabulary. `key` is the sounding key. */
export function chordsInKey(key: DetectedKey, mode: PaletteMode): PaletteChord[] {
  const scale = SCALES[key.mode];
  return scale.steps.map((step, i) => {
    const pc = mod12(key.pitchClass + step);
    const quality = inMode(mode === 'triads' ? scale.triads[i] : scale.sevenths[i], mode);
    return paletteChord(pc, quality, key, degreeOf(pc, quality, key).numeral);
  });
}

/** The chords worth reaching for that the key does not contain, most reached-for first. */
export function chordsOutsideKey(key: DetectedKey, mode: PaletteMode): PaletteChord[] {
  return SCALES[key.mode].borrowings.map((b) => {
    const pc = mod12(key.pitchClass + b.semitones);
    const quality = inMode(mode === 'triads' ? b.triad : b.seventh, mode);
    return paletteChord(pc, quality, key, degreeOf(pc, quality, key).numeral, b.gloss);
  });
}

/** Which vocabulary a chord already speaks, so the palette opens on it. */
export function paletteModeFor(quality: ChordQuality): PaletteMode {
  if (['9', 'min9', 'add9', 'maj9'].includes(quality)) return 'ninths';
  if (['7', 'maj7', 'min7', 'm7b5', '6', 'min6'].includes(quality)) return 'sevenths';
  return 'triads';
}

export type PaletteTab = 'key' | 'outside' | 'manual';

/** The tab a chord opens on: where it already lives, or Manual when it lives in neither. */
export function paletteTabFor(
  songKey: DetectedKey | null,
  root: RootNote,
  accidental: Accidental,
  quality: ChordQuality,
  mode: PaletteMode,
  isNew: boolean,
): PaletteTab {
  if (!songKey) return 'manual';
  if (isNew) return 'key';
  const pc = pitchClassOf(root, accidental);
  const matches = (list: PaletteChord[]) =>
    list.some((c) => pitchClassOf(c.root, c.accidental) === pc && c.quality === quality);
  if (matches(chordsInKey(songKey, mode))) return 'key';
  if (matches(chordsOutsideKey(songKey, mode))) return 'outside';
  return 'manual';
}
