import { alignChart, groupSections, planSections, prunePlan } from './align';
import { isNoChord } from './difficulty';
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
export { parseLabel, reduceLabel, respellForKey, isNoChord, validateAgainstSource } from './difficulty';
export { segmentChords, spanChordName } from './segment';
export { serializeChart, renderChordAbove } from './serialize';
export { buildBeats, buildLyricLines, estimateBpm, inferKey } from './source';

export interface BuildOptions extends SegmentOptions {
  bpm?: number;
  key?: string;
  gapBeats?: number;
  // Roughly how many lyric lines a section should hold. Replaces the old absolute
  // "silence that opens a section": no single amount of silence works across songs.
  linesPerSection?: number;
  instrumentalGapBeats?: number;
}

export interface BuildResult {
  charts: Record<Difficulty, SongChart>;
  bpm: number;
  key: string;
  detectedBpm: number;
  detectedKey: string | null;
  beatCount: number;
  // Beats the analysis marked as silence ("N"). They carry no chord, so they are absent
  // from every span — the duration check has to add them back to reach beatCount.
  noChordBeats: number;
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
  const songStart = beats[0]?.time ?? 0;
  const songEnd = beats[beats.length - 1]?.endTime ?? 0;

  const alignOptions = { beatSeconds, gapBeats: options.gapBeats };

  // Planned once, off the lyric timings only, and shared by all three levels — see the
  // note above planSections for why this must not depend on the chords.
  const planned = planSections(lines, {
    beatSeconds,
    songStart,
    songEnd,
    linesPerSection: options.linesPerSection,
    instrumentalGapBeats: options.instrumentalGapBeats,
  });

  const levels: Difficulty[] = ['facil', 'medio', 'avanzado'];
  const linesByLevel = {} as Record<Difficulty, ReturnType<typeof alignChart>>;
  const spansByLevel = {} as Record<Difficulty, ReturnType<typeof segmentChords>>;

  for (const level of levels) {
    spansByLevel[level] = segmentChords(rawChords, beats, level, {
      includeBass: options.includeBass,
      minBeats: options.minBeats,
      key,
    });
    linesByLevel[level] = alignChart(spansByLevel[level], lines, alignOptions);
  }

  // 'facil' is the coarsest level; pruning against it is what keeps the three in step.
  const plan = prunePlan(planned, linesByLevel.facil);

  const charts = {} as Record<Difficulty, SongChart>;
  for (const level of levels) {
    charts[level] = {
      difficulty: level,
      key,
      bpm,
      sections: groupSections(linesByLevel[level], plan, { lyricLines: lines, songStart, songEnd }),
      spans: spansByLevel[level],
    };
  }

  return {
    charts,
    bpm,
    key,
    detectedBpm,
    detectedKey,
    beatCount: beats.length,
    noChordBeats: rawChords.filter(r => isNoChord(r.chord_complex_pop)).length,
    lineCount: lines.length,
  };
}
