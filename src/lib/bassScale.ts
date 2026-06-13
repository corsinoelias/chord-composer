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

// degree → velocity array (length = 16 * loopBars)
export type DegreePattern = Partial<Record<Degree, number[]>>;

export interface BassScaleData {
  pattern: DegreePattern;
  chordHit?: number[]; // velocity per slot — plays ALL chord tones simultaneously
  loopBars: 1 | 2 | 4;
  octaveOffsets?: Partial<Record<Degree, number>>;
}

export interface ScaleVariation {
  id: string;
  name: string;
  pattern: DegreePattern;
  chordHit?: number[]; // velocity per slot — plays ALL chord tones simultaneously
  loopBars: 1 | 2 | 4;
  octaveOffsets?: Partial<Record<Degree, number>>;
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

export function degreeToSemitone(degree: Degree, quality: string): number {
  return getScale(quality)[degree - 1];
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function getScaleNoteNames(
  rootMidi: number,
  quality: string,
  octaveOffsets?: Partial<Record<Degree, number>>,
): Record<Degree, string> {
  const scale = getScale(quality);
  const result = {} as Record<Degree, string>;
  DEGREES.forEach((deg, i) => {
    const midi = rootMidi + scale[i] + (octaveOffsets?.[deg] ?? 0) * 12;
    const octave = Math.floor(midi / 12) - 1;
    result[deg] = `${NOTE_NAMES[midi % 12]}${octave}`;
  });
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
  return DEGREES.every(d => !pattern[d] || pattern[d]!.every(v => v === 0));
}
