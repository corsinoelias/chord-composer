import {
  type Chord,
  type RootNote,
  type Accidental,
  type ChordQuality,
  ROOT_NOTES,
  CHORD_QUALITIES,
  generateChordId,
} from './musicTheory';

// Map common shorthand notations to canonical ChordQuality values
const QUALITY_ALIASES: Record<string, ChordQuality> = {
  // Minor
  'm': 'min',
  'mi': 'min',
  'minor': 'min',
  'min': 'min',
  // Major (explicit)
  'M': 'maj',
  'maj': 'maj',
  'major': 'maj',
  // Dominant 7th
  '7': '7',
  'dom7': '7',
  // Major 7th
  'maj7': 'maj7',
  'M7': 'maj7',
  'Δ7': 'maj7',
  'Δ': 'maj7',
  // Minor 7th
  'm7': 'min7',
  'min7': 'min7',
  'mi7': 'min7',
  // Diminished
  'dim': 'dim',
  'o': 'dim',
  '°': 'dim',
  // Augmented
  'aug': 'aug',
  '+': 'aug',
  // Half-diminished / m7b5
  'm7b5': 'm7b5',
  'ø': 'm7b5',
  'ø7': 'm7b5',
  // Diminished 7th
  'dim7': 'dim7',
  'o7': 'dim7',
  '°7': 'dim7',
  // Suspended
  'sus2': 'sus2',
  'sus4': 'sus4',
  'sus': 'sus4',
  // Added 9th
  'add9': 'add9',
  'add2': 'add9',
  // 9ths
  '9': '9',
  'maj9': 'maj9',
  'min9': 'min9',
  'm9': 'min9',
  // 11ths
  '11': '11',
  'maj11': 'maj11',
  'min11': 'min11',
  'm11': 'min11',
  'add11': 'add11',
  // 13ths
  '13': '13',
  'maj13': 'maj13',
  'min13': 'min13',
  'm13': 'min13',
  // 6ths
  '6': '6',
  'min6': 'min6',
  'm6': 'min6',
  // Altered
  '7#5': '7#5',
  '7b5': '7b5',
  '7b9': '7b9',
  '7#9': '7#9',
  '9#5': '9#5',
  '9b5': '9b5',
  'minMaj7': 'minMaj7',
  'mMaj7': 'minMaj7',
  'mmaj7': 'minMaj7',
  // Power chord
  '5': '5',
  'aug7': 'aug7',
};

function parseQuality(suffix: string): ChordQuality {
  if (!suffix) return 'maj';
  const alias = QUALITY_ALIASES[suffix];
  if (alias) return alias;
  // Try direct match with CHORD_QUALITIES
  if ((CHORD_QUALITIES as readonly string[]).includes(suffix)) {
    return suffix as ChordQuality;
  }
  return 'maj';
}

/**
 * Parses a chord token like "Am", "F#m7", "Cmaj7", "Bb7", "C/E", "G/B", "D/F#"
 * into a Chord object. Returns null if the token is not recognizable.
 * Slash chord notation: chord/bassNote (e.g. C/E = C major with E in bass)
 * Optional duration suffix: "Gmin7:2" = Gmin7 held for 2 beats (default 4)
 */
function parseChordToken(token: string): Chord | null {
  const trimmed = token.trim();
  if (!trimmed) return null;

  let duration = 4;
  let chordStr = trimmed;
  const colonIdx = trimmed.indexOf(':');
  if (colonIdx !== -1) {
    const parsedDuration = parseFloat(trimmed.slice(colonIdx + 1));
    if (!isNaN(parsedDuration) && parsedDuration > 0) duration = parsedDuration;
    chordStr = trimmed.slice(0, colonIdx);
  }

  // Split slash chord notation: "C/E" → chordPart="C", bassNote="E"
  const slashIdx = chordStr.indexOf('/');
  const chordPart = slashIdx !== -1 ? chordStr.slice(0, slashIdx) : chordStr;
  const bassNote = slashIdx !== -1 ? chordStr.slice(slashIdx + 1) : undefined;

  // Root note: A-G (uppercase)
  const rootChar = chordPart[0]?.toUpperCase();
  if (!rootChar || !(ROOT_NOTES as readonly string[]).includes(rootChar)) return null;
  const root = rootChar as RootNote;

  let idx = 1;
  // Accidental: # or b
  // 'b' immediately after the root letter is always a flat (Db, Bb, Ebm, Bbmaj7…).
  // Altered-quality 'b' (like the b5 in "7b5") never appears at position 1 because
  // it follows a digit, not a root letter.
  let accidental: Accidental = '';
  if (chordPart[idx] === '#') {
    accidental = '#';
    idx++;
  } else if (chordPart[idx] === 'b') {
    accidental = 'b';
    idx++;
  }

  const qualitySuffix = chordPart.slice(idx);
  const quality = parseQuality(qualitySuffix);

  const chord: Chord = {
    id: generateChordId(),
    root,
    accidental,
    quality,
    duration,
  };

  if (bassNote) chord.bassNote = bassNote;

  return chord;
}

/**
 * Converts a human-readable chord string into an array of Chord objects.
 *
 * Supported formats:
 *   "Am F C G"        — space-separated
 *   "Am-F-C-G"        — hyphen-separated
 *   "Am, F, C, G"     — comma-separated
 *   "F#m7 Bmaj7 E7 A" — extended qualities
 *
 * Returns an empty array if parsing yields no valid chords.
 */
export function parseChordString(input: string): Chord[] {
  if (!input?.trim()) return [];
  // Split on spaces, hyphens, or commas
  const tokens = input.trim().split(/[\s,\-]+/);
  const chords: Chord[] = [];
  for (const token of tokens) {
    const chord = parseChordToken(token);
    if (chord) chords.push(chord);
  }
  return chords;
}

/**
 * Serializes a Chord array back to a compact URL-safe string.
 * e.g. [Am, F, C, G] → "Am-F-C-G"
 */
export function serializeChords(chords: Chord[]): string {
  return chords
    .map((c) => {
      const quality = c.quality === 'maj' ? '' : c.quality === 'min' ? 'm' : c.quality;
      const base = `${c.root}${c.accidental}${quality}`;
      return c.bassNote ? `${base}/${c.bassNote}` : base;
    })
    .join('-');
}
