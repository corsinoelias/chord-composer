import { type Chord, chordToMidiNotes } from '@/lib/musicTheory';

export interface GuitarVoicing {
  /** 6 strings [lowE, A, D, G, B, highE]. -1=muted, 0=open, n=fret */
  frets: number[];
  /** Finger numbers per string: 0=none, 1=index, 2=middle, 3=ring, 4=pinky */
  fingers: number[];
  barre?: { fret: number; fromString: number; toString: number };
  /** First visible fret row. 1 = at nut (thick line shown). >1 = fret label shown */
  baseFret: number;
}

// ─── Open-position hardcoded voicings ────────────────────────────────────────
// Key format: root+quality  e.g. "Cmaj", "Amin", "E7"

const OPEN: Record<string, GuitarVoicing> = {
  // Major
  Cmaj:  { frets: [-1, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0], baseFret: 1 },
  Dmaj:  { frets: [-1,-1, 0, 2, 3, 2], fingers: [0, 0, 0, 1, 3, 2], baseFret: 1 },
  Emaj:  { frets: [ 0, 2, 2, 1, 0, 0], fingers: [0, 2, 3, 1, 0, 0], baseFret: 1 },
  Fmaj:  { frets: [ 1, 3, 3, 2, 1, 1], fingers: [1, 3, 4, 2, 1, 1], barre: { fret: 1, fromString: 0, toString: 5 }, baseFret: 1 },
  Gmaj:  { frets: [ 3, 2, 0, 0, 0, 3], fingers: [2, 1, 0, 0, 0, 3], baseFret: 1 },
  Amaj:  { frets: [-1, 0, 2, 2, 2, 0], fingers: [0, 0, 1, 2, 3, 0], baseFret: 1 },
  Bmaj:  { frets: [-1, 2, 4, 4, 4,-1], fingers: [0, 1, 3, 3, 3, 0], barre: { fret: 4, fromString: 2, toString: 4 }, baseFret: 1 },
  // Sharp majors — specific low-position voicings
  'C#maj': { frets: [-1, 4, 3, 1, 2, 1], fingers: [0, 4, 3, 1, 2, 1], barre: { fret: 1, fromString: 3, toString: 5 }, baseFret: 1 },
  'D#maj': { frets: [-1,-1, 1, 3, 4, 3], fingers: [0, 0, 1, 2, 4, 3], baseFret: 1 },
  'G#maj': { frets: [ 4, 3, 1, 1, 1,-1], fingers: [4, 3, 1, 1, 1, 0], barre: { fret: 1, fromString: 2, toString: 4 }, baseFret: 1 },
  // Bmaj shape shifted down 1 fret — same compact (partial-barre) shape, no full 6-string barre
  'A#maj': { frets: [-1, 1, 3, 3, 3,-1], fingers: [0, 1, 3, 3, 3, 0], barre: { fret: 3, fromString: 2, toString: 4 }, baseFret: 1 },
  // Minor
  Amin:  { frets: [-1, 0, 2, 2, 1, 0], fingers: [0, 0, 2, 3, 1, 0], baseFret: 1 },
  Emin:  { frets: [ 0, 2, 2, 0, 0, 0], fingers: [0, 2, 3, 0, 0, 0], baseFret: 1 },
  Dmin:  { frets: [-1,-1, 0, 2, 3, 1], fingers: [0, 0, 0, 2, 3, 1], baseFret: 1 },
  Bmin:  { frets: [-1, 2, 4, 4, 3, 2], fingers: [0, 1, 3, 4, 2, 1], barre: { fret: 2, fromString: 1, toString: 5 }, baseFret: 1 },
  // Open Dm shape shifted up 1 fret — same trick as D#maj below, no barre needed
  'D#min': { frets: [-1,-1, 1, 3, 4, 2], fingers: [0, 0, 1, 3, 4, 2], baseFret: 1 },
  // Bmin shape shifted down 1 fret — same compact (partial-barre) shape
  'A#min': { frets: [-1, 1, 3, 3, 2, 1], fingers: [0, 1, 3, 4, 2, 1], barre: { fret: 1, fromString: 1, toString: 5 }, baseFret: 1 },
  // G#maj shape with the 3rd flattened a semitone (A-string 3→2, B-string 1→open)
  'G#min': { frets: [ 4, 2, 1, 1, 0,-1], fingers: [4, 2, 1, 1, 0, 0], barre: { fret: 1, fromString: 2, toString: 3 }, baseFret: 1 },
  // C#(root), E(m3), G#(5th) — muted low E, open high e, no barre
  'C#min': { frets: [-1, 4, 2, 1, 2, 0], fingers: [0, 4, 2, 1, 3, 0], baseFret: 1 },
  // Dominant 7th
  'E7':  { frets: [ 0, 2, 0, 1, 0, 0], fingers: [0, 2, 0, 1, 0, 0], baseFret: 1 },
  'A7':  { frets: [-1, 0, 2, 0, 2, 0], fingers: [0, 0, 2, 0, 3, 0], baseFret: 1 },
  'D7':  { frets: [-1,-1, 0, 2, 1, 2], fingers: [0, 0, 0, 2, 1, 3], baseFret: 1 },
  'G7':  { frets: [ 3, 2, 0, 0, 0, 1], fingers: [3, 2, 0, 0, 0, 1], baseFret: 1 },
  'C7':  { frets: [-1, 3, 2, 3, 1, 0], fingers: [0, 3, 2, 4, 1, 0], baseFret: 1 },
  'B7':  { frets: [-1, 2, 1, 2, 0, 2], fingers: [0, 2, 1, 3, 0, 4], baseFret: 1 },
  // Major 7th
  Cmaj7: { frets: [-1, 3, 2, 0, 0, 0], fingers: [0, 3, 2, 0, 0, 0], baseFret: 1 },
  Dmaj7: { frets: [-1,-1, 0, 2, 2, 2], fingers: [0, 0, 0, 1, 2, 3], baseFret: 1 },
  Emaj7: { frets: [ 0, 2, 1, 1, 0, 0], fingers: [0, 3, 2, 1, 0, 0], baseFret: 1 },
  Fmaj7: { frets: [-1,-1, 3, 2, 1, 0], fingers: [0, 0, 4, 3, 2, 1], baseFret: 1 },
  Gmaj7: { frets: [ 3, 2, 0, 0, 0, 2], fingers: [3, 2, 0, 0, 0, 1], baseFret: 1 },
  Amaj7: { frets: [-1, 0, 2, 1, 2, 0], fingers: [0, 0, 2, 1, 3, 0], baseFret: 1 },
  // D#(root), G(3rd, open), D(maj7), G(3rd octave) — 5th omitted, standard compact voicing
  'D#maj7': { frets: [-1,-1, 1, 0, 3, 3], fingers: [0, 0, 1, 0, 3, 4], baseFret: 1 },
  // Minor 7th
  Amin7: { frets: [-1, 0, 2, 0, 1, 0], fingers: [0, 0, 2, 0, 1, 0], baseFret: 1 },
  Emin7: { frets: [ 0, 2, 0, 0, 0, 0], fingers: [0, 2, 0, 0, 0, 0], baseFret: 1 },
  Dmin7: { frets: [-1,-1, 0, 2, 1, 1], fingers: [0, 0, 0, 2, 1, 1], baseFret: 1 },
  // D#(root), A#(5th), F#(m3), C#(m7) — full 4-tone voicing, no barre needed
  'D#min7': { frets: [-1,-1, 1, 3, 2, 2], fingers: [0, 0, 1, 4, 2, 3], baseFret: 1 },
  // C#(root), E(m3), G#(5th), B(m7) — muted low E and B strings, no barre
  'C#min7': { frets: [-1, 4, 2, 4,-1, 4], fingers: [0, 2, 1, 3, 0, 4], baseFret: 1 },
  // Dominant 9th (common jazz voicings)
  'E9':  { frets: [ 0, 2, 0, 1, 0, 2], fingers: [0, 2, 0, 1, 0, 3], baseFret: 1 },
  'A9':  { frets: [-1, 0, 2, 0, 2, 2], fingers: [0, 0, 2, 0, 3, 4], baseFret: 1 },
  // Add9
  // A(root, open), E(5th), B(9th), C#(3rd), E(5th octave, open) — small 2-string barre for D/B
  'Aadd9': { frets: [-1, 0, 2, 4, 2, 0], fingers: [0, 0, 1, 4, 1, 0], barre: { fret: 2, fromString: 2, toString: 4 }, baseFret: 1 },
  // A#(root), D(3rd, open), F(5th), C(9th), A#(root octave) — small 2-string barre for the top
  'A#add9': { frets: [-1, 1, 0, 3, 1, 1], fingers: [0, 2, 0, 4, 1, 1], barre: { fret: 1, fromString: 4, toString: 5 }, baseFret: 1 },
  // Sus4
  // B(root), F#(5th), B(root octave), B(root, open), E(4th, open) — no barre
  Bsus4: { frets: [-1, 2, 4, 4, 0, 0], fingers: [0, 1, 3, 4, 0, 0], baseFret: 1 },
  // C(root), F(4th), G(5th, open), C(root octave), F(4th octave) — small 2-string barre for B/e
  Csus4: { frets: [-1, 3, 3, 0, 1, 1], fingers: [0, 3, 4, 0, 1, 1], barre: { fret: 1, fromString: 4, toString: 5 }, baseFret: 1 },
};

// ─── Movable shape templates ──────────────────────────────────────────────────

interface ShapeTemplate {
  offsets: number[];  // -1=muted, n=semitone offset from root fret
  fingers: number[];
  barre?: { offsetFromRoot: number; from: number; to: number };
}

// Root on string 0 (low E). Base fret = root fret on low E string.
const E_SHAPES: Record<string, ShapeTemplate> = {
  maj:   { offsets: [0, 2, 2, 1, 0, 0], fingers: [1, 3, 4, 2, 1, 1], barre: { offsetFromRoot: 0, from: 0, to: 5 } },
  min:   { offsets: [0, 2, 2, 0, 0, 0], fingers: [1, 3, 4, 1, 1, 1], barre: { offsetFromRoot: 0, from: 0, to: 5 } },
  '7':   { offsets: [0, 2, 0, 1, 0, 0], fingers: [1, 3, 0, 2, 1, 1], barre: { offsetFromRoot: 0, from: 0, to: 5 } },
  maj7:  { offsets: [0, 2, 1, 1, 0, 0], fingers: [1, 3, 2, 2, 1, 1], barre: { offsetFromRoot: 0, from: 0, to: 5 } },
  min7:  { offsets: [0, 2, 0, 0, 0, 0], fingers: [1, 3, 1, 1, 1, 1], barre: { offsetFromRoot: 0, from: 0, to: 5 } },
  sus4:  { offsets: [0, 2, 2, 2, 0, 0], fingers: [1, 2, 3, 4, 1, 1], barre: { offsetFromRoot: 0, from: 0, to: 5 } },
  sus2:  { offsets: [0, 2, 2, 0, 0, 2], fingers: [1, 3, 4, 1, 1, 1], barre: { offsetFromRoot: 0, from: 0, to: 5 } },
  aug:   { offsets: [0, 3, 2, 1, 0,-1], fingers: [1, 4, 3, 2, 1, 0] },
  dim:   { offsets: [0, 1, 2, 0, 2, 0], fingers: [1, 2, 3, 0, 4, 0] },
  dim7:  { offsets: [0, 1, 2, 0, 2, 0], fingers: [1, 2, 3, 0, 4, 0] },
  m7b5:  { offsets: [0, 1, 2, 0, 1, 0], fingers: [1, 2, 3, 0, 4, 0] },
  '9':   { offsets: [0, 2, 0, 1, 0, 2], fingers: [1, 3, 0, 2, 1, 4], barre: { offsetFromRoot: 0, from: 0, to: 5 } },
  min9:  { offsets: [0, 2, 0, 0, 1, 0], fingers: [1, 3, 1, 1, 2, 1], barre: { offsetFromRoot: 0, from: 0, to: 5 } },
  '13':  { offsets: [0, 2, 0, 1, 2, 0], fingers: [1, 3, 0, 2, 4, 1], barre: { offsetFromRoot: 0, from: 0, to: 5 } },
  '6':      { offsets: [0, 2, 2, 1, 2, 0], fingers: [1, 3, 4, 2, 1, 1], barre: { offsetFromRoot: 0, from: 0, to: 5 } },
  'min6':   { offsets: [0, 2, 2, 0, 2, 0], fingers: [1, 3, 4, 0, 2, 1], barre: { offsetFromRoot: 0, from: 0, to: 5 } },
  'add9':   { offsets: [0, 2, 2, 1, 0, 2], fingers: [1, 3, 4, 2, 1, 1], barre: { offsetFromRoot: 0, from: 0, to: 5 } },
  '5':      { offsets: [0, 2, 2, -1, -1, -1], fingers: [1, 3, 4, 0, 0, 0] },
  'minMaj7':{ offsets: [0, 2, 2, 0, 0, -1], fingers: [1, 3, 4, 1, 1, 0], barre: { offsetFromRoot: 0, from: 0, to: 4 } },
  'aug7':   { offsets: [0, 3, 2, 1, 0, -1], fingers: [1, 4, 3, 2, 1, 0] },
  '7b9':    { offsets: [0, 2, 0, 1, 1, 0], fingers: [1, 3, 0, 2, 2, 1], barre: { offsetFromRoot: 0, from: 0, to: 5 } },
  '7#9':    { offsets: [0, 2, 0, 1, 3, 0], fingers: [1, 3, 0, 2, 4, 1], barre: { offsetFromRoot: 0, from: 0, to: 5 } },
  '7sus4':  { offsets: [0, 2, 2, 2, 0, 0], fingers: [1, 2, 3, 4, 1, 1], barre: { offsetFromRoot: 0, from: 0, to: 5 } },
  'maj9':   { offsets: [0, 2, 1, 1, 0, 2], fingers: [1, 3, 2, 2, 1, 4], barre: { offsetFromRoot: 0, from: 0, to: 5 } },
  '7#5':    { offsets: [0, 3, 2, 1, 0, -1], fingers: [1, 4, 3, 2, 1, 0] },
  '7b5':    { offsets: [0, 2, 0, 1, -1, 0], fingers: [1, 3, 0, 2, 0, 1] },
  'maj7#11':{ offsets: [0, 2, 1, 3, 0, -1], fingers: [1, 3, 2, 4, 1, 0], barre: { offsetFromRoot: 0, from: 0, to: 4 } },
  '6/9':    { offsets: [0, 2, 2, 1, 2, 2], fingers: [1, 3, 4, 2, 1, 1], barre: { offsetFromRoot: 0, from: 0, to: 5 } },
  'minadd9':{ offsets: [0, 2, 2, 0, 0, 2], fingers: [1, 3, 4, 1, 1, 1], barre: { offsetFromRoot: 0, from: 0, to: 5 } },
};

// Root on string 1 (A). Base fret = root fret on A string.
const A_SHAPES: Record<string, ShapeTemplate> = {
  maj:   { offsets: [-1, 0, 2, 2, 2,-1], fingers: [0, 1, 3, 3, 3, 0], barre: { offsetFromRoot: 2, from: 2, to: 4 } },
  min:   { offsets: [-1, 0, 2, 2, 1, 0], fingers: [0, 1, 3, 4, 2, 0] },
  '7':   { offsets: [-1, 0, 2, 0, 2, 0], fingers: [0, 1, 3, 0, 4, 0] },
  maj7:  { offsets: [-1, 0, 2, 1, 2, 0], fingers: [0, 1, 3, 2, 4, 0] },
  min7:  { offsets: [-1, 0, 2, 0, 1, 0], fingers: [0, 1, 3, 0, 2, 0] },
  sus4:  { offsets: [-1, 0, 2, 2, 3, 0], fingers: [0, 1, 2, 3, 4, 0] },
  sus2:  { offsets: [-1, 0, 2, 2, 0, 0], fingers: [0, 1, 3, 4, 0, 0] },
  aug:   { offsets: [-1, 0, 3, 2, 2, 0], fingers: [0, 1, 4, 2, 3, 0] },
  dim:   { offsets: [-1, 0, 1, 2, 1,-1], fingers: [0, 1, 2, 3, 4, 0] },
  dim7:  { offsets: [-1, 0, 1, 2, 1,-1], fingers: [0, 1, 2, 3, 4, 0] },
  m7b5:  { offsets: [-1, 0, 1, 2, 0, 1], fingers: [0, 1, 2, 3, 0, 4] },
  '9':   { offsets: [-1, 0, 2, 0, 2, 2], fingers: [0, 1, 3, 0, 2, 4] },
  min9:  { offsets: [-1, 0, 2, 0, 1, 2], fingers: [0, 1, 3, 0, 2, 4] },
  '13':     { offsets: [-1, 0, 2, 0, 2, 2], fingers: [0, 1, 3, 0, 2, 4] },
  '6':      { offsets: [-1, 0, 2, 2, 2, 2], fingers: [0, 1, 2, 3, 4, 4] },
  'min6':   { offsets: [-1, 0, 2, 2, 1, 2], fingers: [0, 1, 3, 4, 2, 4] },
  'add9':   { offsets: [-1, 0, 2, 2, 3, 0], fingers: [0, 1, 2, 3, 4, 0] },
  '5':      { offsets: [-1, 0, 2, 2, -1, -1], fingers: [0, 1, 3, 4, 0, 0] },
  'minMaj7':{ offsets: [-1, 0, 2, 1, 1, 0], fingers: [0, 1, 3, 2, 2, 0] },
  'aug7':   { offsets: [-1, 0, 3, 2, 2, -1], fingers: [0, 1, 4, 2, 3, 0] },
  '7b9':    { offsets: [-1, 0, 2, 0, 2, 1], fingers: [0, 1, 3, 0, 4, 2] },
  '7#9':    { offsets: [-1, 0, 2, 0, 2, 3], fingers: [0, 1, 3, 0, 2, 4] },
  '7sus4':  { offsets: [-1, 0, 2, 2, 3, 0], fingers: [0, 1, 2, 3, 4, 0] },
  'maj9':   { offsets: [-1, 0, 2, 1, 2, 2], fingers: [0, 1, 3, 2, 3, 4] },
  '7#5':    { offsets: [-1, 0, 3, 2, 2, -1], fingers: [0, 1, 4, 2, 3, 0] },
  '7b5':    { offsets: [-1, 0, 1, 2, 0, 1], fingers: [0, 1, 2, 3, 0, 4] },
  'maj7#11':{ offsets: [-1, 0, 2, 1, 2, 3], fingers: [0, 1, 3, 2, 3, 4] },
  '6/9':    { offsets: [-1, 0, 2, 2, 3, 2], fingers: [0, 1, 2, 3, 4, 3] },
  'minadd9':{ offsets: [-1, 0, 2, 0, 3, 0], fingers: [0, 1, 3, 0, 4, 0] },
};

// ─── Root note → fret on each string ─────────────────────────────────────────

const E_FRET: Record<string, number> = {
  E: 0, F: 1, 'F#': 2, G: 3, 'G#': 4, A: 5, 'A#': 6, B: 7, C: 8, 'C#': 9, D: 10, 'D#': 11,
};
const A_FRET: Record<string, number> = {
  A: 0, 'A#': 1, B: 2, C: 3, 'C#': 4, D: 5, 'D#': 6, E: 7, F: 8, 'F#': 9, G: 10, 'G#': 11,
};

// ─── Quality alias map ────────────────────────────────────────────────────────
// Maps ChordQuality → shape key

const Q_MAP: Record<string, string> = {
  maj: 'maj', min: 'min',
  '7': '7', maj7: 'maj7', min7: 'min7',
  dim: 'dim', dim7: 'dim7', aug: 'aug',
  sus2: 'sus2', sus4: 'sus4',
  m7b5: 'm7b5',
  '9': '9', maj9: 'maj9', min9: 'min9',
  '7b9': '7b9', '7#9': '7#9', '7#5': '7#5', '7b5': '7b5',
  add9: 'add9', '11': '7sus4', maj11: 'maj9', min11: 'min9',
  '13': '13', maj13: '13', min13: 'min7',
  aug7: 'aug7',
  '6': '6', min6: 'min6',
  minMaj7: 'minMaj7',
  add11: 'sus4',
  '5': '5',
  '9#5': 'aug7', '9b5': '7b5',
  '7sus4': '7sus4', 'maj7#11': 'maj7#11', '6/9': '6/9', minadd9: 'minadd9',
  '9sus4': '7sus4', aug9: 'aug7',
};

// ─── MIDI → pitch-class name ──────────────────────────────────────────────────

const MIDI_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function midiToName(midi: number, transposition: number): string {
  return MIDI_NAMES[((midi + transposition) % 12 + 12) % 12];
}

// ─── baseFret computation ─────────────────────────────────────────────────────

function computeBaseFret(frets: number[]): number {
  const played = frets.filter(f => f > 0);
  if (played.length === 0) return 1;
  const maxF = Math.max(...played);
  if (maxF <= 4) return 1;
  return Math.min(...played);
}

// ─── Build voicing from movable template ─────────────────────────────────────

function fromTemplate(tmpl: ShapeTemplate, rootFret: number): GuitarVoicing {
  const frets = tmpl.offsets.map(o => (o === -1 ? -1 : o === 0 ? rootFret : o + rootFret));
  const baseFret = computeBaseFret(frets);
  const voicing: GuitarVoicing = { frets, fingers: tmpl.fingers, baseFret };
  if (tmpl.barre) {
    voicing.barre = {
      fret: tmpl.barre.offsetFromRoot + rootFret,
      fromString: tmpl.barre.from,
      toString: tmpl.barre.to,
    };
  }
  return voicing;
}

// ─── Main lookup function ─────────────────────────────────────────────────────

export function getGuitarVoicing(chord: Chord, transposition = 0): GuitarVoicing | null {
  const midiNotes = chordToMidiNotes(chord);
  const rootName = midiToName(midiNotes[0], transposition);
  const quality = Q_MAP[chord.quality] ?? 'maj';

  // 1. Hardcoded open position
  const openKey = rootName + (quality === 'maj' ? 'maj' : quality === 'min' ? 'min' : quality);
  if (OPEN[openKey]) return OPEN[openKey];

  // 2. E-shape (root on low E string)
  const eFret = E_FRET[rootName];
  if (eFret !== undefined) {
    const tmpl = E_SHAPES[quality] ?? E_SHAPES.maj;
    return fromTemplate(tmpl, eFret === 0 ? 12 : eFret);
  }

  // 3. A-shape (root on A string)
  const aFret = A_FRET[rootName];
  if (aFret !== undefined) {
    const tmpl = A_SHAPES[quality] ?? A_SHAPES.maj;
    return fromTemplate(tmpl, aFret === 0 ? 12 : aFret);
  }

  return null;
}
