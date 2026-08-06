import { reduceLabel } from './difficulty';
import type { Beat, ChordSpan, Difficulty, RawChordBeat } from './types';

export interface SegmentOptions {
  // Keep slash-chord bass notes (D/A). The reference charts drop them at every level;
  // our engine can play them, so this is opt-in.
  includeBass?: boolean;
  // Absorb chord changes shorter than this into their neighbour. 1 = keep everything,
  // which is the faithful default — one-beat chords are real (the "D Bm" in bar 14).
  minBeats?: number;
}

// Collapses consecutive beats carrying the same chord into one span. The number of
// beats collapsed IS the chord's duration — nothing is rounded to bar lengths.
export function segmentChords(
  rows: RawChordBeat[],
  beats: Beat[],
  level: Difficulty,
  options: SegmentOptions = {},
): ChordSpan[] {
  const { includeBass = false, minBeats = 1 } = options;
  const spans: ChordSpan[] = [];

  rows.forEach((row, i) => {
    const beat = beats[i];
    const label = reduceLabel(row.chord_complex_pop, level);
    // Bass movement under a held chord is colour, so it only survives at avanzado.
    const bass = includeBass && level === 'avanzado' && row.bass && row.bass !== label
      ? row.bass
      : null;

    const prev = spans[spans.length - 1];
    if (prev && prev.label === label && prev.bass === bass) {
      prev.beats += 1;
      prev.endTime = beat.endTime;
      return;
    }

    spans.push({
      label,
      bass,
      startBeat: beat.index,
      beats: 1,
      startTime: beat.time,
      endTime: beat.endTime,
      bar: beat.bar,
      beatInBar: beat.beatInBar,
    });
  });

  return minBeats > 1 ? absorbShortSpans(spans, minBeats) : spans;
}

function absorbShortSpans(spans: ChordSpan[], minBeats: number): ChordSpan[] {
  const out: ChordSpan[] = [];

  for (const span of spans) {
    const prev = out[out.length - 1];
    if (prev && span.beats < minBeats) {
      prev.beats += span.beats;
      prev.endTime = span.endTime;
      continue;
    }
    out.push({ ...span });
  }

  // Merging can leave two identical neighbours touching; fuse them.
  const merged: ChordSpan[] = [];
  for (const span of out) {
    const prev = merged[merged.length - 1];
    if (prev && prev.label === span.label && prev.bass === span.bass) {
      prev.beats += span.beats;
      prev.endTime = span.endTime;
      continue;
    }
    merged.push(span);
  }
  return merged;
}

export function spanChordName(span: ChordSpan): string {
  return span.bass ? `${span.label}/${span.bass}` : span.label;
}
