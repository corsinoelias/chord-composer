import type { AudioRange, EditorSection } from './types';

// Splits a whole-song vocal reference into one slice per section, so that soloing a
// section plays the part of the recording that actually belongs to it.
//
// The split is proportional to each section's musical length rather than clocked from
// the song's BPM. That matters: a real performance breathes (the analysis of a recent
// import ranged from 0.72s to 0.96s per beat), so multiplying beats by 60/bpm drifts
// further out of step with every bar. Sharing out the clip's measured duration instead
// pins both ends of the song to the recording and spreads the average tempo error
// evenly, which is the best that can be done without beat-tracking the audio.
//
// These are estimates by construction — every range is flagged `estimated` so the UI can
// say so, and the flag disappears as soon as the user nudges the range by hand.

export interface SectionBeats {
  id: string;
  name: string;
  beats: number;
}

export interface SeedReport {
  // Sections that got an estimated range, in playback order.
  seeded: number;
  // Sections left untouched because their range was placed by hand.
  pinned: number;
  // Sections skipped for having no chords — they take up no playback time either.
  skipped: string[];
  totalBeats: number;
  // Tempo the recording implies, given the chart's beat count and the clip's length.
  // Comparing it against the song's BPM is the quickest way to catch a chart that
  // doesn't line up with the recording (a missing intro, a repeat not written out).
  impliedBpm: number;
}

export function sectionBeats(section: EditorSection): number {
  const beats = section.lines
    .flatMap(l => l.tokens)
    .filter(t => t.chord && !t.isSpace)
    .reduce((sum, t) => sum + t.duration, 0);
  return beats * Math.max(1, section.repeatCount ?? 1);
}

export function measureSections(sections: EditorSection[]): SectionBeats[] {
  return sections.map(s => ({ id: s.id, name: s.name, beats: sectionBeats(s) }));
}

export interface SeedResult {
  sections: EditorSection[];
  report: SeedReport | null;
}

// A range the user placed by hand — no `estimated` flag. These are treated as fixed
// points: re-running the split must never overwrite work someone already checked
// against the recording, and each confirmed section makes its neighbours more accurate
// by shrinking the span the estimate has to guess across.
function isPinned(section: EditorSection): boolean {
  return !!section.audioRange && !section.audioRange.estimated;
}

export function seedSectionRanges(sections: EditorSection[], whole: AudioRange): SeedResult {
  const measured = measureSections(sections);
  const totalBeats = measured.reduce((sum, m) => sum + m.beats, 0);
  const totalSec = whole.endSec - whole.startSec;

  if (totalBeats <= 0 || totalSec <= 0) return { sections, report: null };

  const next = [...sections];

  // Walk the runs of un-pinned sections between consecutive pinned ones, and share out
  // the time available to each run in proportion to its beats.
  let runStart = 0;
  let timeCursor = whole.startSec;

  const fillRun = (from: number, to: number, startSec: number, endSec: number) => {
    const runBeats = measured.slice(from, to).reduce((sum, m) => sum + m.beats, 0);
    const available = endSec - startSec;
    if (runBeats <= 0 || available <= 0) return;
    const perBeat = available / runBeats;
    let consumed = 0;
    for (let i = from; i < to; i++) {
      const beats = measured[i].beats;
      if (beats <= 0) { next[i] = { ...next[i], audioRange: undefined }; continue; }
      // Positions are computed from the run's origin rather than accumulated, so
      // rounding never compounds and the run lands exactly on its end point.
      const a = startSec + consumed * perBeat;
      consumed += beats;
      const b = startSec + consumed * perBeat;
      next[i] = { ...next[i], audioRange: { startSec: a, endSec: b, estimated: true } satisfies AudioRange };
    }
  };

  for (let i = 0; i < sections.length; i++) {
    if (!isPinned(sections[i])) continue;
    fillRun(runStart, i, timeCursor, sections[i].audioRange!.startSec);
    timeCursor = sections[i].audioRange!.endSec;
    runStart = i + 1;
  }
  fillRun(runStart, sections.length, timeCursor, whole.endSec);

  return {
    sections: next,
    report: {
      seeded: next.filter((s, i) => measured[i].beats > 0 && s.audioRange?.estimated).length,
      pinned: sections.filter(isPinned).length,
      skipped: measured.filter(m => m.beats <= 0).map(m => m.name),
      totalBeats,
      impliedBpm: Math.round(60 / (totalSec / totalBeats)),
    },
  };
}

// ── Whole-song range vs per-section ranges ───────────────────────────────────
// Both can be set at once, on purpose: the whole range is what plays for the full song
// (one continuous clip) and the section ranges are what play when a section is soloed.
// Nothing kept the two agreeing about where the song starts, though, and when they
// disagree the full-song playback is wrong from the very first bar — the engine starts
// the vocal at the whole range's start on the same beat the chart's first chord plays,
// so a whole range beginning 10s before the first section's puts the voice 10s ahead of
// the chords. Soloing that same section sounds perfect, which makes it look like a
// playback bug rather than two numbers that don't match.

export interface RangeMismatch {
  // Signed seconds: negative means the whole range starts before the sections do.
  startDelta: number;
  endDelta: number;
  sectionsStart: number;
  sectionsEnd: number;
}

export function wholeRangeMismatch(
  sections: EditorSection[],
  whole: AudioRange,
  toleranceSec: number,
): RangeMismatch | null {
  const ranges = sections.map(s => s.audioRange).filter(Boolean) as AudioRange[];
  if (ranges.length === 0) return null;

  const sectionsStart = Math.min(...ranges.map(r => r.startSec));
  const sectionsEnd = Math.max(...ranges.map(r => r.endSec));
  const startDelta = whole.startSec - sectionsStart;
  const endDelta = whole.endSec - sectionsEnd;

  if (Math.abs(startDelta) <= toleranceSec && Math.abs(endDelta) <= toleranceSec) return null;
  return { startDelta, endDelta, sectionsStart, sectionsEnd };
}

// How far apart two ranges can sit before the estimate counts as out of date.
const STALE_TOLERANCE_SEC = 0.5;

// Whether the estimated slices still follow from the current chart. Editing chords or
// sections — or pinning a neighbour by hand — silently invalidates them, and nothing
// else in the UI would notice.
export function estimatesAreStale(sections: EditorSection[], whole: AudioRange): boolean {
  if (!sections.some(s => s.audioRange?.estimated)) return false;
  const { sections: fresh, report } = seedSectionRanges(sections, whole);
  if (!report) return false;
  return sections.some((s, i) => {
    const current = s.audioRange;
    if (!current?.estimated) return false;
    const updated = fresh[i].audioRange;
    if (!updated) return true;
    return Math.abs(updated.startSec - current.startSec) > STALE_TOLERANCE_SEC
      || Math.abs(updated.endSec - current.endSec) > STALE_TOLERANCE_SEC;
  });
}

// How far the recording's real pace sits from the BPM written on the song, as a
// percentage. Large values mean the chart and the recording disagree about how many
// beats the song has — the estimates will be wrong everywhere, not just slightly off.
export function tempoDrift(impliedBpm: number, songBpm: number): number {
  if (!songBpm) return 0;
  return Math.round(((impliedBpm - songBpm) / songBpm) * 100);
}
