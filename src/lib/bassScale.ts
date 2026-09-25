export const SCALE_SEMITONES: Record<string, number[]> = {
  maj:   [0, 2, 4, 5, 7, 9, 11, 12],
  min:   [0, 2, 3, 5, 7, 8, 10, 12],
  '7':   [0, 2, 4, 5, 7, 9, 10, 12],
  min7:  [0, 2, 3, 5, 7, 8, 10, 12],
  maj7:  [0, 2, 4, 5, 7, 9, 11, 12],
  dim:   [0, 2, 3, 5, 6, 8,  9, 12],
  aug:   [0, 2, 4, 5, 8, 9, 11, 12],
};

export const DEGREES = [1, 2, 3, 4, 5, 6, 7, 8] as const;
export type Degree = typeof DEGREES[number];

/**
 * A degree moved a semitone: 'b3' is the blues third, '#4' the raised fourth walking up
 * to the fifth. Written as its own row of the pattern, beside the natural ones — a song
 * saved before these existed only has the keys 1-8, and reads exactly as it did.
 * The app plays the same thing (chord_sequencer, packStep's alteration bits).
 */
export type AlteredDegree = `${'b' | '#'}${Degree}`;
export type DegreeKey = Degree | AlteredDegree;

/** Every altered degree, in the order a picker offers them: flats, then sharps. */
export const ALTERED_DEGREES: AlteredDegree[] = [
  ...DEGREES.map((d) => `b${d}` as AlteredDegree),
  ...DEGREES.map((d) => `#${d}` as AlteredDegree),
];

/** A pattern key read back: its degree and how far it is moved (-1, 0 or 1), or null. */
export function parseDegreeKey(key: string | number): { degree: Degree; alter: -1 | 0 | 1 } | null {
  const match = /^([b#]?)([1-8])$/.exec(String(key));
  if (!match) return null;
  return { degree: Number(match[2]) as Degree, alter: match[1] === 'b' ? -1 : match[1] === '#' ? 1 : 0 };
}

/** How a degree is written: 3, ♭3, ♯4. */
export function degreeLabel(key: DegreeKey): string {
  const parsed = parseDegreeKey(key);
  if (!parsed) return String(key);
  return `${parsed.alter < 0 ? '♭' : parsed.alter > 0 ? '♯' : ''}${parsed.degree}`;
}

/**
 * Every degree a pattern writes, low to high: a flat just under its natural, a sharp just
 * over. A natural comes back as the number it is (5, not the object key "5"), so it is the
 * same key as the one in DEGREES.
 */
export function degreeKeysOf(pattern: DegreePattern): DegreeKey[] {
  return Object.keys(pattern)
    .map((key): DegreeKey | null => {
      const parsed = parseDegreeKey(key);
      if (!parsed) return null;
      return parsed.alter === 0 ? parsed.degree : (key as AlteredDegree);
    })
    .filter((key): key is DegreeKey => key !== null)
    .sort((a, b) => degreeOrder(a) - degreeOrder(b));
}

/** Sort position of a degree: the natural rows 1-8 with each alteration beside its own. */
export function degreeOrder(key: DegreeKey): number {
  const parsed = parseDegreeKey(key)!;
  return parsed.degree * 3 + parsed.alter;
}

// degree → velocity array (length = 16 * loopBars)
export type DegreePattern = Partial<Record<DegreeKey, number[]>>;

export interface BassScaleData {
  pattern: DegreePattern;
  chordHit?: number[]; // velocity per slot — plays ALL chord tones simultaneously
  loopBars: 1 | 2 | 4;
  octaveOffsets?: Partial<Record<DegreeKey, number>>;
}

export interface ScaleVariation {
  id: string;
  name: string;
  pattern: DegreePattern;
  chordHit?: number[]; // velocity per slot — plays ALL chord tones simultaneously
  loopBars: 1 | 2 | 4;
  octaveOffsets?: Partial<Record<DegreeKey, number>>;
}

export interface InstrumentMelodic {
  variations: ScaleVariation[];
  enabled: boolean;
}

export interface MelodicData {
  bass: InstrumentMelodic;
  piano: InstrumentMelodic;
  guitar: InstrumentMelodic;
}

export function createVariation(name: string): ScaleVariation {
  return {
    id: `sv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name,
    pattern: {},
    loopBars: 1,
  };
}

export function emptyMelodicData(): MelodicData {
  return {
    bass:   { variations: [], enabled: false },
    piano:  { variations: [], enabled: false },
    guitar: { variations: [], enabled: false },
  };
}

export function resolveVariation(
  melodic: InstrumentMelodic,
  variationId: string | undefined,
): BassScaleData | null {
  if (!melodic.enabled || !melodic.variations.length) return null;
  const v = variationId
    ? (melodic.variations.find(x => x.id === variationId) ?? melodic.variations[0])
    : melodic.variations[0];
  const hasContent = !scalePatternIsEmpty(v?.pattern ?? {}) || (v?.chordHit ?? []).some(x => x > 0);
  if (!v || !hasContent) return null;
  return { pattern: v.pattern, chordHit: v.chordHit, loopBars: v.loopBars, octaveOffsets: v.octaveOffsets };
}

export function getScale(quality: string): number[] {
  if (quality.startsWith('min') || quality === 'm') return SCALE_SEMITONES.min;
  if (quality === '7' || quality === 'dom7') return SCALE_SEMITONES['7'];
  if (quality === 'dim') return SCALE_SEMITONES.dim;
  if (quality === 'aug') return SCALE_SEMITONES.aug;
  return SCALE_SEMITONES.maj;
}

/** Semitones above the chord's lowest note: the degree in the chord's scale, moved by its alteration. */
export function degreeToSemitone(degree: DegreeKey, quality: string): number {
  const parsed = parseDegreeKey(degree);
  if (!parsed) return 0;
  return getScale(quality)[parsed.degree - 1] + parsed.alter;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function getScaleNoteNames(
  rootMidi: number,
  quality: string,
  octaveOffsets?: Partial<Record<DegreeKey, number>>,
): Record<DegreeKey, string> {
  const result = {} as Record<DegreeKey, string>;
  for (const deg of [...DEGREES, ...ALTERED_DEGREES]) {
    const midi = rootMidi + degreeToSemitone(deg, quality) + (octaveOffsets?.[deg] ?? 0) * 12;
    const octave = Math.floor(midi / 12) - 1;
    result[deg] = `${NOTE_NAMES[((midi % 12) + 12) % 12]}${octave}`;
  }
  return result;
}

// Chord tones are more stable / important
export const CHORD_TONES = new Set<Degree>([1, 3, 5, 7, 8]);

const empty16 = () => Array(16).fill(0) as number[];

export const BASS_SCALE_PRESETS: Array<{ name: string; pattern: DegreePattern }> = [
  {
    name: 'Raíz',
    pattern: { 1: [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0] },
  },
  {
    name: 'Raíz-Quinta',
    pattern: {
      1: [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
      5: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    },
  },
  {
    name: 'Merengue',
    pattern: { 1: [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0] },
  },
  {
    name: 'Walking',
    pattern: {
      1: [1,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      3: [0,0,0,0, 1,0,0,0, 0,0,0,0, 0,0,0,0],
      5: [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
      7: [0,0,0,0, 0,0,0,0, 0,0,0,0, 1,0,0,0],
    },
  },
  {
    name: 'Reggaeton',
    pattern: { 1: [1,0,0,1, 0,0,1,0, 0,1,0,0, 1,0,0,0] },
  },
  {
    name: 'Funk',
    pattern: {
      1: [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
      5: [0,0,0,0, 0,1,0,0, 0,0,0,0, 0,1,0,0],
    },
  },
];

export function emptyPattern(): DegreePattern {
  return {};
}

export function scalePatternIsEmpty(pattern: DegreePattern): boolean {
  return degreeKeysOf(pattern).every(d => !pattern[d] || pattern[d]!.every(v => v === 0));
}
