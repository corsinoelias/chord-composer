/** 0 = silence, 1 = downstroke, 2 = upstroke, 3 = muted/percussive hit */
export type StrumStep = 0 | 1 | 2 | 3;
export type StrumPatternData = StrumStep[];

/** [stringIndex][step] — stringIndex 0 = low E ... 5 = high e, matching GuitarVoicing.frets order */
export type ArpPatternData = boolean[][];

export type StrumMode = 'strum' | 'arp';
export type GridSize = 8 | 16;

export interface PatternEntry {
  id: string;
  name: string;
  mode: StrumMode;
  steps: GridSize;
  data: StrumPatternData | ArpPatternData;
  custom: boolean;
}

export interface StrumVisualEvent {
  time: number;
  strings: number[];
  spread: number;
  amp: number;
}

export type SchedEvent =
  | ({ kind: 'strum' } & StrumVisualEvent)
  | { kind: 'count'; time: number; label: string }
  | { kind: 'grid'; time: number; step: number; chordIndex: number };
