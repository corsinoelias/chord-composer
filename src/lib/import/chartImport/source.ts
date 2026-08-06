import type { Beat, LyricLine, LyricWord, RawBeat, RawChordBeat, RawLyricWord } from './types';

// Tokens the aligner emits to mark line boundaries — not sung words.
const MARKER_RE = /^<[^>]*>$/;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

// beats.json carries one more entry than chords.json (it includes the downbeat that
// closes the last chord), so the extra tail entry is what gives the final beat its
// real length. Falls back to the median inter-beat interval if the two files drift.
export function buildBeats(rawBeats: RawBeat[], rawChords: RawChordBeat[]): Beat[] {
  const times = rawBeats.map(b => b.time).sort((a, b) => a - b);
  const intervals: number[] = [];
  for (let i = 1; i < times.length; i++) intervals.push(times[i] - times[i - 1]);
  const fallback = median(intervals) || 0.5;

  return rawChords.map((row, i) => {
    const time = row.curr_beat_time;
    const next = i + 1 < rawChords.length
      ? rawChords[i + 1].curr_beat_time
      : (times.find(t => t > time) ?? time + fallback);
    return {
      index: i,
      time,
      endTime: next,
      bar: row.bar_num,
      beatInBar: row.beat_num,
    };
  });
}

// Median tempo across the track. The recording breathes (this analysis ranges from
// 0.72s to 0.96s per beat), so a single BPM is only a hint for the engine — the real
// timing lives in each beat's start/end.
export function estimateBpm(beats: Beat[]): number {
  const intervals = beats.map(b => b.endTime - b.time).filter(d => d > 0);
  const m = median(intervals);
  return m > 0 ? Math.round(60 / m) : 0;
}

// The nashville columns are degrees relative to the detected key, so whichever pop chord
// is labelled a "1" names the tonic — "1-" for a minor one. Both spellings can appear in
// the same song (a borrowed major tonic over a minor key, say), so the mode is decided by
// which one actually holds the song, counted in beats, rather than by which comes first.
export function inferKey(rawChords: RawChordBeat[]): string | null {
  let major = 0;
  let minor = 0;
  let majorRoot: string | null = null;
  let minorRoot: string | null = null;

  for (const row of rawChords) {
    const degree = row.chord_complex_nashville;
    const root = row.chord_complex_pop?.match(/^([A-G][#b]?)/)?.[1];
    if (!degree || !root) continue;
    if (/^1-/.test(degree)) {
      minor += 1;
      minorRoot ??= root;
    } else if (/^1(?!\d)/.test(degree) || degree === '1') {
      major += 1;
      majorRoot ??= root;
    }
  }

  if (minor > major && minorRoot) return canonicalKey(minorRoot, true);
  if (majorRoot) return canonicalKey(majorRoot, false);
  return minorRoot ? canonicalKey(minorRoot, true) : null;
}

// The analysis names every tonic with sharps, but half of those keys are never written
// that way — nobody charts in A# major, they chart in Bb. Snapping to the name the app
// actually offers (ALL_KEYS in musicKeys.ts) is also what lets the flat-key lookup in
// respellForKey recognise the key at all.
const MAJOR_CANON: Record<string, string> = { 'A#': 'Bb', 'C#': 'Db', 'D#': 'Eb', 'G#': 'Ab' };
const MINOR_CANON: Record<string, string> = { 'A#': 'Bb', 'D#': 'Eb' };

function canonicalKey(root: string, minor: boolean): string {
  return minor
    ? `${MINOR_CANON[root] ?? root}m`
    : (MAJOR_CANON[root] ?? root);
}

export function buildLyricLines(raw: RawLyricWord[]): LyricLine[] {
  const byLine = new Map<number, LyricWord[]>();

  for (const w of raw) {
    if (MARKER_RE.test(w.text)) continue;
    const text = w.text.trim();
    if (!text) continue;
    const list = byLine.get(w.line_id) ?? [];
    list.push({
      text,
      start: w.start,
      end: w.end,
      confidence: w.confidence === null ? null : Number(w.confidence),
    });
    byLine.set(w.line_id, list);
  }

  const lines: LyricLine[] = [];
  for (const [id, words] of byLine) {
    words.sort((a, b) => a.start - b.start);
    // The aligner sometimes gives a word zero length or lets it overrun the next one;
    // clamp so "which word is sounding at time t" stays answerable.
    for (let i = 0; i < words.length; i++) {
      const next = words[i + 1];
      if (words[i].end <= words[i].start) words[i].end = next ? next.start : words[i].start + 0.2;
      if (next && words[i].end > next.start) words[i].end = next.start;
    }
    lines.push({
      id,
      words,
      start: words[0].start,
      end: words[words.length - 1].end,
      text: words.map(w => w.text).join(' '),
    });
  }

  lines.sort((a, b) => a.start - b.start);
  return lines;
}
