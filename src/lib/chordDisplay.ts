/**
 * How chords are written in the chord player — the Android app's Ajustes › Cifrado
 * (ChordDisplay in lib/core/music/chord_spelling.dart), with the same four notations and
 * the same sharps-or-flats choice, so a song reads the same on both.
 *
 * It belongs to the person, not to the song, so it lives in this browser (localStorage),
 * like the click settings (clickSettings.ts). Display only: nothing here changes what is
 * stored or what the engine plays.
 */
import { useSyncExternalStore } from 'react';
import { type Chord, type RootNote, type Accidental } from './musicTheory';
import { chordSuffix, pitchClassOf, spellPitchClass } from './keyPalette';
import { mod12, type DetectedKey } from './keyDetect';

/** F♯m7 · 6m7 · VIm7 · Fa♯m7 */
export type ChordNotation = 'chord' | 'number' | 'roman' | 'solfege';
/** As the key wants them, or always one of the two. */
export type Accidentals = 'auto' | 'sharp' | 'flat';

export interface ChordDisplay {
  notation: ChordNotation;
  accidentals: Accidentals;
}

export const DEFAULT_CHORD_DISPLAY: ChordDisplay = { notation: 'chord', accidentals: 'auto' };

/** Numbers and numerals take their accidentals from the key (♭VII, never ♯VI). */
export const isNumeric = (d: ChordDisplay): boolean => d.notation === 'number' || d.notation === 'roman';

const STORE = 'chord-display-v1';
const NOTATIONS: ChordNotation[] = ['chord', 'number', 'roman', 'solfege'];
const ACCIDENTALS: Accidentals[] = ['auto', 'sharp', 'flat'];

function load(): ChordDisplay {
  if (typeof localStorage === 'undefined') return DEFAULT_CHORD_DISPLAY;
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) ?? 'null') as Partial<ChordDisplay> | null;
    if (!raw) return DEFAULT_CHORD_DISPLAY;
    return {
      notation: NOTATIONS.includes(raw.notation as ChordNotation) ? raw.notation! : 'chord',
      accidentals: ACCIDENTALS.includes(raw.accidentals as Accidentals) ? raw.accidentals! : 'auto',
    };
  } catch {
    return DEFAULT_CHORD_DISPLAY; // private window: this visit writes chords the default way
  }
}

// One value for the whole page, so every chord changes together when the choice does.
let current: ChordDisplay | null = null;
const listeners = new Set<() => void>();

function snapshot(): ChordDisplay {
  if (current === null) current = load();
  return current;
}

export function setChordDisplay(next: ChordDisplay): void {
  current = next;
  try { localStorage.setItem(STORE, JSON.stringify(next)); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}

export function useChordDisplay(): ChordDisplay {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    snapshot,
    () => DEFAULT_CHORD_DISPLAY,
  );
}

// ─── Writing a chord ─────────────────────────────────────────────────────────────────

/**
 * A chord in the pieces a chord chart sets at different sizes:
 * [before] [root] [accidental] [minor] [extension] [bass] — "♭" "VII", "F" "♯" "m" "7", "/G♯".
 */
export interface ChordNameParts {
  before: string;
  root: string;
  accidental: string;
  minor: string;
  extension: string;
  bass: string;
}

export const partsText = (p: ChordNameParts): string =>
  p.before + p.root + p.accidental + p.minor + p.extension + p.bass;

const SOLFEGE: Record<RootNote, string> = { C: 'Do', D: 'Re', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si' };
const DIGITS: Record<string, string> = { I: '1', II: '2', III: '3', IV: '4', V: '5', VI: '6', VII: '7' };
const CHROMATIC: Record<DetectedKey['mode'], string[]> = {
  major: ['I', '♭II', 'II', '♭III', 'III', 'IV', '♭V', 'V', '♭VI', 'VI', '♭VII', 'VII'],
  // A minor key names its outsiders upward, as the app does: the raised seventh is a leading tone.
  minor: ['I', '♭II', 'II', 'III', '♯III', 'IV', '♯IV', 'V', 'VI', '♯VI', 'VII', '♯VII'],
};

const glyph = (a: Accidental): string => (a === '#' ? '♯' : a === 'b' ? '♭' : '');

function bassPitchClass(bass: string | undefined): number | null {
  const m = /^([A-G])([#b]?)/.exec((bass ?? '').trim());
  return m ? pitchClassOf(m[1] as RootNote, (m[2] || '') as Accidental) : null;
}

/** Where a pitch class sits in [key], split into its accidental and its degree. */
function degree(pc: number, key: DetectedKey, numbers: boolean): [string, string] {
  const numeral = CHROMATIC[key.mode][mod12(pc - key.pitchClass)];
  const before = numeral[0] === '♭' || numeral[0] === '♯' ? numeral[0] : '';
  const core = numeral.slice(before.length);
  return [before, numbers ? DIGITS[core] : core];
}

/**
 * [chord] as [display] writes it. Letters are moved by [transposition]; [keyFlats] is what
 * the key would choose ("auto"). Numbers and numerals are counted in [key], the song's key as
 * stored — a transposed song keeps its numbers — and fall back to letters without one.
 */
export function chordNameParts(
  chord: Chord,
  display: ChordDisplay,
  { transposition = 0, keyFlats = false, key = null }: { transposition?: number; keyFlats?: boolean; key?: DetectedKey | null },
): ChordNameParts {
  const suffix = chordSuffix(chord.quality);
  const minor = suffix.startsWith('m') && !suffix.startsWith('maj') ? 'm' : '';
  const extension = suffix.slice(minor.length);
  const rootPc = pitchClassOf(chord.root, chord.accidental);
  const bassPc = bassPitchClass(chord.bassNote);

  if (isNumeric(display) && key) {
    const numbers = display.notation === 'number';
    const [before, root] = degree(rootPc, key, numbers);
    const bass = bassPc === null ? '' : '/' + degree(bassPc, key, numbers).join('');
    return { before, root, accidental: '', minor, extension, bass };
  }

  // A chord written as a flat keeps reading as one in a sharp key, unless flats or sharps are forced.
  const flats = display.accidentals === 'flat' ? true
    : display.accidentals === 'sharp' ? false
    : keyFlats || chord.accidental === 'b';
  const name = (pc: number) => {
    const s = spellPitchClass(pc + transposition, flats);
    return [display.notation === 'solfege' ? SOLFEGE[s.root] : s.root, glyph(s.accidental)] as const;
  };
  const [root, accidental] = name(rootPc);
  return {
    before: '',
    root,
    accidental,
    minor,
    extension,
    bass: bassPc === null ? '' : '/' + name(bassPc).join(''),
  };
}

/**
 * A key as the transport writes it, the way the app's spellKey does: the key's own spelling
 * (Eb, F#m) unless sharps or flats are forced, and Do Re Mi when that is the notation.
 * Numbers and numerals still name the key in letters: a 1 needs to know what it is 1 of.
 */
export function keyNameAs(pitchClass: number, minor: boolean, own: string, display: ChordDisplay): string {
  const tonic = own.replace(/m$/, '');
  let root = tonic[0] as RootNote;
  let accidental = tonic.slice(1);
  if (display.accidentals !== 'auto' && !isNumeric(display)) {
    const s = spellPitchClass(pitchClass, display.accidentals === 'flat');
    root = s.root;
    accidental = s.accidental;
  }
  return (display.notation === 'solfege' ? SOLFEGE[root] : root) + accidental + (minor ? 'm' : '');
}
