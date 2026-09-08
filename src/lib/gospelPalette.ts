/**
 * The 22-chord gospel / neo-soul palette, spelled correctly for all 12 major keys.
 *
 * Why this doesn't go through `transposeChordName`: that helper deliberately inherits the
 * accidental of the SOURCE chord, because nothing else on the site tracks what key a
 * progression is in ("guessing from the pitch class alone is worse than useless"). Here the
 * key IS the state — it is the page's main control — so the spelling can be done properly
 * instead of inherited. Transposing a C palette would print D#maj9 where a gospel chart
 * says Ebmaj9.
 *
 * Every `symbol` below must survive `parseChordString`, which only understands ASCII '#'
 * and 'b' and fails SILENTLY (an unparseable suffix degrades to plain major). The pretty
 * ♯/♭ forms live in `label`, which is render-only — never feed one back into the parser.
 */

/** How one major key spells the notes this palette needs. */
interface KeySpelling {
  /** The seven diatonic notes, I through VII. */
  degrees: readonly [string, string, string, string, string, string, string];
  /**
   * The borrowed ♭III / ♭VI / ♭VII, spelled the way charts actually write them rather than
   * the way strict theory does: Db major's ♭III is Fb on paper and E everywhere else, and
   * Gb major's IV is Cb on paper and B on every lead sheet. Double flats never appear.
   */
  flat3: string;
  flat6: string;
  flat7: string;
}

export const PALETTE_KEYS = [
  'C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B',
] as const;

export type PaletteKey = typeof PALETTE_KEYS[number];

const KEY_SPELLINGS: Record<PaletteKey, KeySpelling> = {
  C:  { degrees: ['C', 'D', 'E', 'F', 'G', 'A', 'B'],          flat3: 'Eb', flat6: 'Ab', flat7: 'Bb' },
  Db: { degrees: ['Db', 'Eb', 'F', 'Gb', 'Ab', 'Bb', 'C'],     flat3: 'E',  flat6: 'A',  flat7: 'B'  },
  D:  { degrees: ['D', 'E', 'F#', 'G', 'A', 'B', 'C#'],        flat3: 'F',  flat6: 'Bb', flat7: 'C'  },
  Eb: { degrees: ['Eb', 'F', 'G', 'Ab', 'Bb', 'C', 'D'],       flat3: 'Gb', flat6: 'B',  flat7: 'Db' },
  E:  { degrees: ['E', 'F#', 'G#', 'A', 'B', 'C#', 'D#'],      flat3: 'G',  flat6: 'C',  flat7: 'D'  },
  F:  { degrees: ['F', 'G', 'A', 'Bb', 'C', 'D', 'E'],         flat3: 'Ab', flat6: 'Db', flat7: 'Eb' },
  Gb: { degrees: ['Gb', 'Ab', 'Bb', 'B', 'Db', 'Eb', 'F'],     flat3: 'A',  flat6: 'D',  flat7: 'E'  },
  G:  { degrees: ['G', 'A', 'B', 'C', 'D', 'E', 'F#'],         flat3: 'Bb', flat6: 'Eb', flat7: 'F'  },
  Ab: { degrees: ['Ab', 'Bb', 'C', 'Db', 'Eb', 'F', 'G'],      flat3: 'B',  flat6: 'E',  flat7: 'Gb' },
  A:  { degrees: ['A', 'B', 'C#', 'D', 'E', 'F#', 'G#'],       flat3: 'C',  flat6: 'F',  flat7: 'G'  },
  Bb: { degrees: ['Bb', 'C', 'D', 'Eb', 'F', 'G', 'A'],        flat3: 'Db', flat6: 'Gb', flat7: 'Ab' },
  B:  { degrees: ['B', 'C#', 'D#', 'E', 'F#', 'G#', 'A#'],     flat3: 'D',  flat6: 'G',  flat7: 'A'  },
};

/** Render-only ♯/♭ typography for a note name. */
function prettyNote(note: string): string {
  return note.replace(/#$/, '♯').replace(/b$/, '♭');
}

/**
 * Render-only form of a quality suffix. Only entries whose ASCII spelling reads badly on
 * screen need to be here; anything else is shown as written.
 */
const PRETTY_QUALITY: Record<string, string> = {
  'maj7#11': 'maj7♯11',
  '9sus4': '9sus',
  '7sus4': '7sus',
  'm7b5': 'm7♭5',
  '7#9': '7♯9',
};

function label(note: string, quality: string): string {
  return `${prettyNote(note)}${PRETTY_QUALITY[quality] ?? quality}`;
}

export type PaletteFamily = 'home' | 'tension' | 'colour';

export interface PaletteChord {
  /** Stable across keys, so React keys and selection survive a transpose. */
  id: string;
  family: PaletteFamily;
  /** Function label for the left column, e.g. 'ii' or '♭VII'. */
  roman: string;
  /** ASCII, parser-safe. Feeds playback, MIDI/WAV export and the editor deep link. */
  symbol: string;
  /** Typographic form. Render only. */
  label: string;
  /** What the chord does. Key-independent, because function is what it describes. */
  blurb: string;
}

/** The seven diatonic degrees as gospel players voice them: 9ths, 11ths, a Lydian IV. */
const EXTENDED_DEGREES = [
  { id: 'I',   roman: 'I',   degree: 0, quality: 'maj9',     blurb: 'Home. The 9th on top keeps it from sounding like a hymn.' },
  { id: 'ii',  roman: 'ii',  degree: 1, quality: 'm9',       blurb: 'The softest way to leave home. Half of all worship verses start here.' },
  { id: 'iii', roman: 'iii', degree: 2, quality: 'm11',      blurb: 'A tonic that floats. Substitute it for I when the vocal needs air.' },
  { id: 'IV',  roman: 'IV',  degree: 3, quality: 'maj7#11',  blurb: 'The ♯11 is the single note that turns a church IV into a gospel one.' },
  { id: 'V',   roman: 'V',   degree: 4, quality: '9sus4',    blurb: 'Suspended, not dominant. It pulls home without sounding like a cadence.' },
  { id: 'vi',  roman: 'vi',  degree: 5, quality: 'm11',      blurb: 'The relative minor, stacked to four notes so it reads as colour, not sadness.' },
  { id: 'vii', roman: 'vii', degree: 6, quality: 'm7b5',     blurb: 'Rarely a destination. It is the first chord of the 7–3–6 turnaround.' },
] as const;

/** The same seven as plain sevenths, for when the extensions are too much. */
const PLAIN_DEGREES = [
  { id: 'I7',   roman: 'I',   degree: 0, quality: 'maj7',   blurb: 'The plain tonic. Where a chart starts before anyone adds colour.' },
  { id: 'ii7',  roman: 'ii',  degree: 1, quality: 'm7',     blurb: 'Half of every 2–5–1 ever played.' },
  { id: 'iii7', roman: 'iii', degree: 2, quality: 'm7',     blurb: 'The 3 in a 7–3–6. Passing, almost never a landing.' },
  { id: 'IV7',  roman: 'IV',  degree: 3, quality: 'maj7',   blurb: 'The straight subdominant, no Lydian colour on top.' },
  { id: 'V7',   roman: 'V',   degree: 4, quality: '7sus4',  blurb: 'The sus dominant without the 9th. Plainer, still not a cadence.' },
  { id: 'vi7',  roman: 'vi',  degree: 5, quality: 'm7',     blurb: 'The 6 every gospel turnaround resolves into.' },
  { id: 'vii7', roman: 'vii', degree: 6, quality: 'm7b5',   blurb: 'Same half-diminished as above — there is no plainer version of it.' },
] as const;

/**
 * Secondary dominants. The engine's altered quality is 7♯9, so that is what is played and
 * what is printed: calling it "7alt" would promise a ♭13 that is not in the voicing.
 */
const TENSION_DEGREES = [
  { id: 'VI7', roman: 'VI7',  degree: 5, blurb: 'Falls into ii. The workhorse of the genre.' },
  { id: 'III7', roman: 'III7', degree: 2, blurb: 'The hinge in 7–3–6. Falls into vi.' },
  { id: 'V7a', roman: 'V7',   degree: 4, blurb: 'The hardest pull back to I there is.' },
  { id: 'II7', roman: 'II7',  degree: 1, blurb: 'Falls into V. Sets up a big ending.' },
] as const;

const COLOUR_CHORDS = [
  { id: 'b3',   roman: '♭III',  from: 'flat3' as const, quality: 'maj7', blurb: 'A key change that never happened.' },
  { id: 'b6',   roman: '♭VI',   from: 'flat6' as const, quality: 'maj7', blurb: 'The weight under a final chorus.' },
  { id: 'b7',   roman: '♭VII',  from: 'flat7' as const, quality: 'maj7', blurb: 'Step down from I and the room lifts.' },
  { id: 'b7m',  roman: '♭VIIm', from: 'flat7' as const, quality: 'm7',   blurb: 'Rarer, darker. Pairs with ♭VI.' },
] as const;

export interface Palette {
  key: PaletteKey;
  /** The seven diatonic degrees, extended voicings. */
  home: PaletteChord[];
  /** The same seven as plain sevenths. */
  homePlain: PaletteChord[];
  tension: PaletteChord[];
  colour: PaletteChord[];
  /**
   * I – VI7♯9 – ii – V9sus: the four bars the page uses as its worked example. Chosen
   * because it is the shortest phrase that contains one chord from each family a beginner
   * has to learn — a tonic, a secondary dominant and a resolution that is not a cadence.
   */
  example: PaletteChord[];
}

export function buildPalette(key: PaletteKey): Palette {
  const spelling = KEY_SPELLINGS[key];
  const note = (degree: number) => spelling.degrees[degree];

  const home = EXTENDED_DEGREES.map((d) => ({
    id: d.id,
    family: 'home' as const,
    roman: d.roman,
    symbol: `${note(d.degree)}${d.quality}`,
    label: label(note(d.degree), d.quality),
    blurb: d.blurb,
  }));

  const homePlain = PLAIN_DEGREES.map((d) => ({
    id: d.id,
    family: 'home' as const,
    roman: d.roman,
    symbol: `${note(d.degree)}${d.quality}`,
    label: label(note(d.degree), d.quality),
    blurb: d.blurb,
  }));

  const tension = TENSION_DEGREES.map((d) => ({
    id: d.id,
    family: 'tension' as const,
    roman: d.roman,
    symbol: `${note(d.degree)}7#9`,
    label: label(note(d.degree), '7#9'),
    blurb: d.blurb,
  }));

  const colour = COLOUR_CHORDS.map((c) => ({
    id: c.id,
    family: 'colour' as const,
    roman: c.roman,
    symbol: `${spelling[c.from]}${c.quality}`,
    label: label(spelling[c.from], c.quality),
    blurb: c.blurb,
  }));

  const example = [home[0], tension[0], home[1], home[4]];

  return { key, home, homePlain, tension, colour, example };
}

/**
 * Family colour, reusing the chord-quality variables already in src/index.css so both
 * themes are handled without a second palette.
 *
 * These paint GRAPHICS only — the group's dot and the active row's rule and tint. The
 * mockup coloured the Roman numerals too, but --chord-seventh is hsl(160 60% 45%), which
 * is about 2.5:1 on white: fine for a 9px dot, not for text at any size. The numerals use
 * muted-foreground instead, and family identity is carried by the dot and the tint.
 */
export const FAMILY_STYLE: Record<PaletteFamily, { accent: string; tint: string }> = {
  home:    { accent: 'hsl(var(--chord-seventh))',    tint: 'hsl(var(--chord-seventh) / 0.10)' },
  tension: { accent: 'hsl(var(--chord-sus))',        tint: 'hsl(var(--chord-sus) / 0.12)' },
  colour:  { accent: 'hsl(var(--chord-diminished))', tint: 'hsl(var(--chord-diminished) / 0.11)' },
};
