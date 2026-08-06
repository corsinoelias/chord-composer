import { alignChart, groupSections } from './align';
import { segmentChords, type SegmentOptions } from './segment';
import { buildBeats, buildLyricLines, estimateBpm, inferKey } from './source';
import type {
  Difficulty,
  RawBeat,
  RawChordBeat,
  RawLyricWord,
  SongChart,
} from './types';

export * from './types';
export { parseLabel, reduceLabel, validateAgainstSource } from './difficulty';
export { segmentChords, spanChordName } from './segment';
export { serializeChart, renderChordAbove } from './serialize';
export { buildBeats, buildLyricLines, estimateBpm, inferKey } from './source';

export interface BuildOptions extends SegmentOptions {
  bpm?: number;
  key?: string;
  gapBeats?: number;
  sectionGapBeats?: number;
}

export interface BuildResult {
  charts: Record<Difficulty, SongChart>;
  bpm: number;
  key: string;
  detectedBpm: number;
  detectedKey: string | null;
  beatCount: number;
  lineCount: number;
}

export function buildCharts(
  rawBeats: RawBeat[],
  rawChords: RawChordBeat[],
  rawLyrics: RawLyricWord[],
  options: BuildOptions = {},
): BuildResult {
  const beats = buildBeats(rawBeats, rawChords);
  const lines = buildLyricLines(rawLyrics);

  const detectedBpm = estimateBpm(beats);
  const detectedKey = inferKey(rawChords);
  const bpm = options.bpm ?? detectedBpm;
  const key = options.key ?? detectedKey ?? '';

  // Tolerances scale with the tempo the user is actually charting at, not with the
  // detector's median — a hand-corrected BPM should move the section splits too.
  const beatSeconds = bpm > 0 ? 60 / bpm : 0.5;
  const alignOptions = {
    beatSeconds,
    gapBeats: options.gapBeats,
    sectionGapBeats: options.sectionGapBeats,
  };

  const levels: Difficulty[] = ['facil', 'medio', 'avanzado'];
  const charts = {} as Record<Difficulty, SongChart>;

  for (const level of levels) {
    const spans = segmentChords(rawChords, beats, level, {
      includeBass: options.includeBass,
      minBeats: options.minBeats,
    });
    const chartLines = alignChart(spans, lines, alignOptions);
    charts[level] = {
      difficulty: level,
      key,
      bpm,
      sections: groupSections(chartLines, alignOptions),
      spans,
    };
  }

  return {
    charts,
    bpm,
    key,
    detectedBpm,
    detectedKey,
    beatCount: beats.length,
    lineCount: lines.length,
  };
}
