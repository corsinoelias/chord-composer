// Types for turning a beat-aligned chord/lyric analysis (Chordify-style JSON export)
// into a chord chart with real per-chord durations anchored to the lyric.

export type Difficulty = 'facil' | 'medio' | 'avanzado';

export const DIFFICULTIES: Difficulty[] = ['facil', 'medio', 'avanzado'];

// ── Raw input shapes (as exported by the analysis tool) ──────────────────────

export interface RawBeat {
  time: number;
  beatNum: number;
}

export interface RawChordBeat {
  curr_beat_time: number;
  bar_num: number;
  beat_num: number;
  prev_chord: string | null;
  bass: string | null;
  bass_nashville: string | null;
  chord_complex_pop: string;
  chord_simple_pop: string;
  chord_basic_pop: string;
  chord_complex_nashville: string;
  chord_simple_nashville: string;
  chord_basic_nashville: string;
  chord_complex_jazz: string;
  chord_simple_jazz: string;
  chord_basic_jazz: string;
}

export interface RawLyricWord {
  id: number;
  line_id: number;
  start: number;
  end: number;
  text: string;
  confidence: string | null;
}

// ── Normalized model ─────────────────────────────────────────────────────────

export interface Beat {
  index: number;      // global beat index, 0-based
  time: number;       // seconds
  endTime: number;    // seconds — start of the next beat
  bar: number;
  beatInBar: number;
}

// One chord held for N consecutive beats. `beats` is the real measured duration,
// not an assumption about the bar length.
export interface ChordSpan {
  label: string;         // "Bm7"
  bass: string | null;   // slash-chord bass, e.g. "A" in D/A — null when absent
  startBeat: number;     // global beat index
  beats: number;
  startTime: number;
  endTime: number;
  bar: number;
  beatInBar: number;
}

export interface LyricWord {
  text: string;
  start: number;
  end: number;
  confidence: number | null;
}

export interface LyricLine {
  id: number;
  words: LyricWord[];
  start: number;
  end: number;
  text: string;
}

// A chord placed on a specific word of a specific line.
export interface ChartAnchor {
  span: ChordSpan;
  wordIndex: number;   // index into line.words; -1 on instrumental lines
}

export interface ChartLine {
  lyric: LyricLine | null;   // null = instrumental line (chords only)
  anchors: ChartAnchor[];
}

export interface ChartSection {
  name: string;
  lines: ChartLine[];
  // Where this section sits in the recording. Derived from the lyric timings and the
  // section plan, never from the chords — the chords differ per difficulty, and these
  // seconds become the per-section audio slices, which must not.
  range: { startSec: number; endSec: number };
}

export interface SongChart {
  difficulty: Difficulty;
  key: string;
  bpm: number;
  sections: ChartSection[];
  spans: ChordSpan[];
}
