/**
 * One step of an app pattern, read and written the engine's way (native_audio.cpp):
 *
 *   bits 0-7   velocity         bits 8-11  degree        bits 12-15 octave shift + 8
 *   bits 16-19 second degree    bits 20-23 second octave + 8                bit 24 accent
 *   bits 25-26 alteration       bits 27-28 second alteration (1 flat, 2 sharp)
 *
 * A drum hit keeps its own percussion tone, a General MIDI note, in bits 16-23 (stepTone);
 * a plain hit carries 0x80 there, which means the row's own sound.
 *
 * A melodic note is never a fixed pitch: it is relative to the chord that sounds. Two families
 * (chordTone in the engine): chord tones (root … octave) follow the chord's own intervals,
 * clamped to the ones it has; scale degrees 1-8 follow the chord's scale. Either takes a
 * semitone up or down and an octave shift.
 */
export const DEG = { rest: 0, chord: 1, root: 2, third: 3, fifth: 4, seventh: 5, ninth: 6, octave: 7, scale1: 8 } as const;

export interface StepNote {
  /** Degree id: 1 the whole chord, 2-7 chord tones, 8-15 scale degrees 1-8. */
  d: number;
  /** Octave shift. */
  o: number;
  /** -1 flat, 0 as written, 1 sharp. */
  a: number;
}

export const vel = (p: number) => p & 0xff;
export const accent = (p: number) => (p >> 24) & 1;
const altOf = (b: number) => (b === 1 ? -1 : b === 2 ? 1 : 0);
const altBits = (a: number) => (a < 0 ? 1 : a > 0 ? 2 : 0);
/** A hit's own percussion tone, or 0 for its row's sound. */
export const hitTone = (p: number) => { const t = (p >> 16) & 0xff; return t >= 1 && t <= 127 ? t : 0; };

export function notesOf(p: number): StepNote[] {
  if (!p || !vel(p)) return [];
  const d = (p >> 8) & 0xf;
  if (!d) return [];
  const out: StepNote[] = [{ d, o: ((p >> 12) & 0xf) - 8, a: altOf((p >> 25) & 3) }];
  const d2 = (p >> 16) & 0xf;
  if (d2) out.push({ d: d2, o: ((p >> 20) & 0xf) - 8, a: altOf((p >> 27) & 3) });
  return out;
}

/** A melodic step: up to two notes, or the whole chord. 0 when there is nothing to play. */
export function packNotes(velocity: number, notes: StepNote[], acc = 0): number {
  const v = Math.max(1, Math.min(255, Math.round(velocity)));
  if (!notes.length) return 0;
  const [a, b] = notes;
  return v | ((a.d & 0xf) << 8) | (((a.o + 8) & 0xf) << 12)
    | ((b ? b.d & 0xf : 0) << 16) | ((((b ? b.o : 0) + 8) & 0xf) << 20)
    | (acc ? 1 << 24 : 0)
    | ((a.d === DEG.chord ? 0 : altBits(a.a)) << 25)
    | ((b && b.d > DEG.chord ? altBits(b.a) : 0) << 27);
}

/** A drum hit, on the row's own sound (tone 0) or on a percussion tone of its own. */
export function packHit(velocity: number, tone = 0, acc = 0): number {
  const v = Math.max(1, Math.min(255, Math.round(velocity)));
  return v | (8 << 12) | ((tone ? tone & 0x7f : 0x80) << 16) | (acc ? 1 << 24 : 0);
}

export const withVelocity = (p: number, v: number) => (p & ~0xff) | Math.max(1, Math.min(255, Math.round(v)));
export const toggleAccent = (p: number) => p ^ (1 << 24);

/** The four strengths the editor offers, as the web's rhythm editor has them. */
export const STRENGTHS = [{ v: 90, name: 'Soft' }, { v: 150, name: 'Medium' }, { v: 205, name: 'Strong' }, { v: 255, name: 'Full' }];
export const strengthOf = (p: number) => Math.max(0, STRENGTHS.findIndex((s) => vel(p) <= s.v));

// ── Notes against a chord ──

/** The intervals of the chord types the engine knows (kChordTypes). */
export const CHORD_INTERVALS: Record<string, number[]> = {
  maj: [0, 4, 7], min: [0, 3, 7], '7': [0, 4, 7, 10], maj7: [0, 4, 7, 11], min7: [0, 3, 7, 10], dim: [0, 3, 6],
  aug: [0, 4, 8], sus4: [0, 5, 7], m9: [0, 3, 7, 10, 14], '9': [0, 4, 7, 10, 14], '6': [0, 4, 7, 9], sus2: [0, 2, 7],
  add9: [0, 4, 7, 14], m7b5: [0, 3, 6, 10], m11: [0, 3, 7, 10, 17], dim7: [0, 3, 6, 9], min6: [0, 3, 7, 9],
  maj9: [0, 4, 7, 11, 14], '7sus4': [0, 5, 7, 10], '11': [0, 4, 7, 10, 17], '13': [0, 4, 7, 10, 21], min9: [0, 3, 7, 10, 14], min11: [0, 3, 7, 10, 17],
};
const MAJOR = [0, 2, 4, 5, 7, 9, 11, 12];
const MINOR = [0, 2, 3, 5, 7, 8, 10, 12];
const DOMINANT = [0, 2, 4, 5, 7, 9, 10, 12];
const DIMINISHED = [0, 2, 3, 5, 6, 8, 9, 12];
const AUGMENTED = [0, 2, 4, 5, 8, 9, 11, 12];
/** The scale a chord's degrees are counted in: the engine's scaleOf. */
export function scaleOf(type: string): number[] {
  if (type.startsWith('min') || type === 'm9' || type === 'm11') return MINOR;
  if (type === '7') return DOMINANT;
  if (type === 'dim') return DIMINISHED;
  if (type === 'aug') return AUGMENTED;
  return MAJOR;
}

/** Semitones above the chord's root a note sounds at (the engine's chordTone), or null for the whole chord. */
export function semitoneOf(n: StepNote, type: string): number | null {
  if (n.d === DEG.chord) return null;
  let s: number;
  if (n.d >= DEG.scale1) s = scaleOf(type)[n.d - DEG.scale1];
  else if (n.d === DEG.octave) s = 12;
  else {
    const iv = CHORD_INTERVALS[type] ?? CHORD_INTERVALS.maj;
    s = iv[Math.min(n.d - DEG.root, iv.length - 1)];
  }
  return s + n.a + n.o * 12;
}

/** The degree row a note sits on (1-8, and its alteration): a chord tone on its degree's row. */
const TONE_ROW: Record<number, number> = { 2: 1, 3: 3, 4: 5, 5: 7, 6: 2, 7: 8 };
/** The chord tone a degree row can hold instead of a scale degree. */
export const ROW_TONE: Record<number, number> = { 1: 2, 3: 3, 5: 4, 7: 5, 2: 6, 8: 7 };
export const TONE_LETTER: Record<number, string> = { 2: 'R', 3: '3', 4: '5', 5: '7', 6: '9', 7: '8' };
export const TONE_NAME: Record<number, string> = { 2: 'root', 3: 'third', 4: 'fifth', 5: 'seventh', 6: 'ninth', 7: 'octave' };
export function rowOf(n: StepNote): { k: number; a: number } | null {
  if (n.d === DEG.chord) return null;
  return n.d >= DEG.scale1 ? { k: n.d - 7, a: n.a } : { k: TONE_ROW[n.d], a: n.a };
}
export const rowText = (k: number, a: number) => (a < 0 ? '♭' : a > 0 ? '♯' : '') + k;
export const notesOnRow = (p: number, k: number, a: number) =>
  notesOf(p).filter((n) => { const r = rowOf(n); return !!r && r.k === k && r.a === a; });

const NOTE_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const pitchName = (pc: number) => NOTE_NAMES[((pc % 12) + 12) % 12];

/**
 * Percussion: what a General MIDI note is called, and the instrument its tones belong to.
 * The app's names (gmPercussionNames in constants.dart, in English).
 */
export const GM_PERC_NAMES: Record<number, string> = {
  27: 'High Q', 28: 'Slap', 31: 'Sticks', 33: 'Click', 34: 'Metronome bell',
  35: 'Kick 2', 37: 'Side stick', 39: 'Hand clap GM', 52: 'China', 53: 'Ride bell', 54: 'Tambourine', 55: 'Splash', 56: 'Cowbell', 58: 'Vibraslap', 60: 'High bongo', 61: 'Low bongo',
  62: 'Muted conga', 63: 'Open conga', 64: 'Low conga', 65: 'High timbale', 66: 'Low timbale', 67: 'High agogo',
  68: 'Low agogo', 69: 'Cabasa', 70: 'Maracas', 71: 'Short whistle', 72: 'Long whistle', 73: 'Short güiro',
  74: 'Long güiro', 75: 'Claves', 76: 'High woodblock', 77: 'Low woodblock', 78: 'Muted cuica', 79: 'Open cuica',
  80: 'Muted triangle', 81: 'Open triangle', 82: 'Shaker', 83: 'Jingle bell', 84: 'Bell tree', 85: 'Castanets',
  86: 'Muted surdo', 87: 'Open surdo',
};
const FAMILIES: Record<number, string> = {
  60: 'Bongos', 61: 'Bongos', 62: 'Congas', 63: 'Congas', 64: 'Congas', 65: 'Timbales', 66: 'Timbales',
  67: 'Agogo', 68: 'Agogo', 71: 'Whistle', 72: 'Whistle', 73: 'Güiro', 74: 'Güiro', 76: 'Woodblock', 77: 'Woodblock',
  78: 'Cuica', 79: 'Cuica', 80: 'Triangle', 81: 'Triangle', 86: 'Surdo', 87: 'Surdo',
};
export const percFamily = (note: number) => FAMILIES[note];
/** The tones of the instrument [note] is one of, lowest first; just [note] for an instrument of one sound. */
export const percTones = (note: number) => {
  const family = FAMILIES[note];
  return family ? Object.keys(FAMILIES).map(Number).filter((n) => FAMILIES[n] === family).sort((a, b) => a - b) : [note];
};
/** The letter a tone is told apart by on its cell: H open or high, M muted, L low. */
export const toneMark = (note: number) => ({ 63: 'H', 60: 'H', 65: 'H', 67: 'H', 76: 'H', 78: 'H', 81: 'H', 87: 'H', 71: 'H', 73: 'H', 62: 'M', 80: 'M', 86: 'M', 79: 'M', 64: 'L', 61: 'L', 66: 'L', 68: 'L', 77: 'L', 72: 'L', 74: 'L' } as Record<number, string>)[note] ?? '';
/** The percussion a row can be given, in the order the app offers it (gmPercussionOrder), Latin first. */
export const PERC_CHOICES = [
  63, 62, 64, 60, 61, 65, 66, 56, 75, 70, 69, 82, 73, 74, 54, 67, 68, 76, 77, 78, 79, 80, 81,
  83, 84, 85, 86, 87, 71, 72, 58, 53, 55, 52, 39, 37, 31, 33, 34, 27, 28,
];
