import type { ChartLine, ChartSection, ChordSpan, LyricLine } from './types';

export interface AlignOptions {
  // Average seconds per beat — sets the scale for every tolerance below.
  beatSeconds: number;
  // A chord landing more than this many beats outside every lyric line becomes its own
  // instrumental line instead of being glued to the nearest word.
  gapBeats?: number;
}

interface Placement {
  // Index into the lyric lines. When `instrumental` is true this is the gap *before*
  // that line — gap `lines.length` is the run after the last line.
  lineIndex: number;
  instrumental: boolean;
}

// Which lyric line owns a given moment. Lines are separated at the midpoint of the
// silence between them, so a chord that changes just before a line begins is heard as
// belonging to that line — which is how a player reads it. Chords sitting deep in the
// silence, past `lead`/`tail` on both sides, belong to no line: they are the intro,
// the turnaround, the instrumental break.
function placeSpan(span: ChordSpan, lines: LyricLine[], lead: number, tail: number): Placement {
  let index = lines.length - 1;
  for (let i = 0; i < lines.length; i++) {
    const upper = i + 1 < lines.length
      ? (lines[i].end + lines[i + 1].start) / 2
      : Infinity;
    if (span.startTime < upper) {
      index = i;
      break;
    }
  }

  const line = lines[index];
  const prev = lines[index - 1];

  if (span.startTime < line.start - lead && (!prev || span.startTime > prev.end + tail)) {
    return { lineIndex: index, instrumental: true };
  }
  // Past the end of its own line: it lives in the gap that follows.
  if (span.startTime > line.end + tail) {
    return { lineIndex: index + 1, instrumental: true };
  }

  return { lineIndex: index, instrumental: false };
}

// The word the chord change lands on. When the change happens in a breath between two
// words it goes to whichever one it is closer to in time.
function anchorWord(span: ChordSpan, line: LyricLine): number {
  const { words } = line;
  const t = span.startTime;
  if (t <= words[0].start) return 0;

  for (let i = words.length - 1; i >= 0; i--) {
    if (words[i].start > t) continue;
    if (t < words[i].end) return i;
    const next = words[i + 1];
    if (!next) return i;
    return t - words[i].end <= next.start - t ? i : i + 1;
  }
  return 0;
}

export function alignChart(spans: ChordSpan[], lines: LyricLine[], options: AlignOptions): ChartLine[] {
  const { beatSeconds, gapBeats = 2 } = options;
  const tolerance = gapBeats * beatSeconds;

  if (lines.length === 0) {
    return spans.length ? [{ lyric: null, anchors: spans.map(span => ({ span, wordIndex: -1 })) }] : [];
  }

  // Bucket every span before emitting, so a whole instrumental run lands on one line
  // instead of being split across the two lyric lines that surround it.
  const lyricAnchors: ChordSpan[][] = lines.map(() => []);
  const gaps: ChordSpan[][] = Array.from({ length: lines.length + 1 }, () => []);

  for (const span of spans) {
    const { lineIndex, instrumental } = placeSpan(span, lines, tolerance, tolerance);
    if (instrumental) gaps[lineIndex].push(span);
    else lyricAnchors[lineIndex].push(span);
  }

  const instrumentalLine = (bucket: ChordSpan[]): ChartLine => ({
    lyric: null,
    anchors: bucket.map(span => ({ span, wordIndex: -1 })),
  });

  const out: ChartLine[] = [];
  lines.forEach((line, i) => {
    if (gaps[i].length > 0) out.push(instrumentalLine(gaps[i]));

    let previous = -1;
    const anchors = lyricAnchors[i].map(span => {
      // Never let a later chord land on an earlier word — order on the page has to match
      // order in time. Chords that run out of words stack on the last one.
      const wordIndex = Math.min(Math.max(anchorWord(span, line), previous + 1), line.words.length - 1);
      previous = wordIndex;
      return { span, wordIndex };
    });

    out.push({ lyric: line, anchors });
  });

  if (gaps[lines.length].length > 0) out.push(instrumentalLine(gaps[lines.length]));

  return out;
}

// ── Sections ─────────────────────────────────────────────────────────────────
// Nothing in the source marks verses and choruses, so structure is inferred. Two things
// matter here:
//
// 1. The plan is computed from the lyric timings alone, never from the chords. Chord
//    spans differ per difficulty — a run that is one chord at the easy level can be two
//    at the advanced one — and grouping off them made a song come out with a different
//    number of sections depending on which level you happened to be looking at. Since
//    the measured per-section audio ranges are derived from these boundaries, that also
//    made the audio slices depend on the difficulty. They must not.
//
// 2. There is no absolute amount of silence that means "new section". Across two real
//    songs the median gap between lyric lines was 0.5 and 0.9 beats, with maxima of 6.7
//    and 19.9 — a fixed threshold that suits one leaves the other as two giant blocks.
//    So the target is a section *size*, and the boundaries are the longest pauses that
//    deliver roughly that size.

export interface SectionPlanOptions {
  beatSeconds: number;
  songStart: number;
  songEnd: number;
  // Roughly how many lyric lines a section should hold. The real driver of granularity.
  linesPerSection?: number;
  // A pause at least this long is a piece of the arrangement in its own right (intro,
  // turnaround, break) and gets a section to itself.
  instrumentalGapBeats?: number;
}

type Slot =
  | { kind: 'lyrics'; lines: number[] }
  | { kind: 'instrumental'; gap: number };

export interface SectionPlan {
  slots: Slot[];
  // Slot index for lyric line k, and for the gap that precedes lyric line k (gap
  // `lines.length` is the run after the last line). Null where a gap has no slot.
  lineSlot: number[];
  gapSlot: (number | null)[];
}

// Gap k sits before lyric line k; gap `lines.length` is everything after the last line.
function gapDurations(lines: LyricLine[], songStart: number, songEnd: number): number[] {
  const gaps: number[] = [];
  for (let i = 0; i <= lines.length; i++) {
    const from = i === 0 ? songStart : lines[i - 1].end;
    const to = i === lines.length ? songEnd : lines[i].start;
    gaps.push(Math.max(0, to - from));
  }
  return gaps;
}

export function planSections(lines: LyricLine[], options: SectionPlanOptions): SectionPlan {
  const { beatSeconds, songStart, songEnd, linesPerSection = 8, instrumentalGapBeats = 6 } = options;

  if (lines.length === 0) {
    return { slots: [{ kind: 'instrumental', gap: 0 }], lineSlot: [], gapSlot: [0] };
  }

  const gaps = gapDurations(lines, songStart, songEnd);
  const standalone = gaps.map(g => g >= instrumentalGapBeats * beatSeconds);

  // Candidate boundaries: interior gaps only (a split before the first line or after the
  // last one isn't a split), long enough to read as a pause rather than a breath.
  const interior = gaps.slice(1, lines.length);
  const sortedInterior = [...interior].filter(g => g > 0).sort((a, b) => a - b);
  const median = sortedInterior.length ? sortedInterior[Math.floor(sortedInterior.length / 2)] : 0;
  const floor = Math.max(1.5 * beatSeconds, 1.5 * median);

  const targetBlocks = Math.max(1, Math.ceil(lines.length / Math.max(1, linesPerSection)));
  const forced = new Set<number>();
  for (let k = 1; k < lines.length; k++) if (standalone[k]) forced.add(k);

  const ranked = interior
    .map((g, i) => ({ gap: g, k: i + 1 }))
    .filter(c => !forced.has(c.k) && c.gap >= floor)
    .sort((a, b) => b.gap - a.gap);

  const wanted = Math.max(0, targetBlocks - 1 - forced.size);
  const boundaries = new Set<number>(forced);
  ranked.slice(0, wanted).forEach(c => boundaries.add(c.k));

  // Build the slots in playing order.
  const slots: Slot[] = [];
  const lineSlot: number[] = new Array(lines.length).fill(-1);
  const gapSlot: (number | null)[] = new Array(lines.length + 1).fill(null);

  let current: Extract<Slot, { kind: 'lyrics' }> | null = null;
  for (let k = 0; k < lines.length; k++) {
    if (standalone[k]) {
      current = null;
      gapSlot[k] = slots.length;
      slots.push({ kind: 'instrumental', gap: k });
    } else if (k > 0) {
      gapSlot[k] = null;
    }
    if (!current || boundaries.has(k)) {
      current = { kind: 'lyrics', lines: [] };
      slots.push(current);
    }
    current.lines.push(k);
    lineSlot[k] = slots.length - 1;
  }

  const last = lines.length;
  if (standalone[last]) {
    gapSlot[last] = slots.length;
    slots.push({ kind: 'instrumental', gap: last });
  }

  return { slots, lineSlot, gapSlot };
}

// Which gaps actually ended up with chords of their own, read off the emitted lines.
function populatedGaps(chartLines: ChartLine[]): Set<number> {
  const out = new Set<number>();
  let next = 0;
  for (const line of chartLines) {
    if (line.lyric) { next += 1; continue; }
    out.add(next);
  }
  return out;
}

// Drops instrumental slots that no chord landed in, folding them back into the section
// that follows. A slot planned from the lyric timings can still come out empty once the
// chords are placed — every chord around it belonged to a neighbouring line — and an
// empty section would be dropped at one difficulty and kept at another.
//
// `reference` must be the coarsest level's lines. Reducing a chord label can only merge
// neighbouring spans, never split one, so the easy level's chord boundaries are a subset
// of every other level's: a gap it populates is populated at every level. The extra
// chords the richer levels have can only ever land in gaps that were pruned here, and
// those join the following section instead of forming one — so the section count comes
// out the same at all three levels.
export function prunePlan(plan: SectionPlan, reference: ChartLine[]): SectionPlan {
  const populated = populatedGaps(reference);
  const keep = plan.slots.map(s => s.kind !== 'instrumental' || populated.has(s.gap));
  if (keep.every(Boolean)) return plan;

  const remap = new Map<number, number>();
  const slots: SectionPlan['slots'] = [];
  plan.slots.forEach((slot, i) => {
    if (!keep[i]) return;
    remap.set(i, slots.length);
    slots.push(slot);
  });

  return {
    slots,
    lineSlot: plan.lineSlot.map(i => remap.get(i) ?? 0),
    gapSlot: plan.gapSlot.map(i => (i === null ? null : remap.get(i) ?? null)),
  };
}

// Applies a plan to one difficulty's chart lines. alignChart emits strictly in order —
// gap 0, line 0, gap 1, line 1, … — so the position in that stream is enough to tell
// which lyric line or gap each chart line belongs to.
export interface GroupContext {
  lyricLines: LyricLine[];
  songStart: number;
  songEnd: number;
}

// A contiguous partition of the recording, one slice per section. A section begins the
// moment the previous one stops singing, so a pickup chord ahead of the first word falls
// inside its own section rather than the one before.
function slotRanges(plan: SectionPlan, ctx: GroupContext): { startSec: number; endSec: number }[] {
  const { lyricLines, songStart, songEnd } = ctx;
  const starts = plan.slots.map(slot => {
    const k = slot.kind === 'instrumental' ? slot.gap : slot.lines[0];
    return k === 0 ? songStart : (lyricLines[k - 1]?.end ?? songStart);
  });
  return starts.map((startSec, i) => ({ startSec, endSec: starts[i + 1] ?? songEnd }));
}

export function groupSections(lines: ChartLine[], plan: SectionPlan, ctx: GroupContext): ChartSection[] {
  const buckets: ChartLine[][] = plan.slots.map(() => []);
  const ranges = slotRanges(plan, ctx);
  let next = 0;

  for (const line of lines) {
    if (line.lyric) {
      const slot = plan.lineSlot[next] ?? 0;
      buckets[slot]?.push(line);
      next += 1;
      continue;
    }
    // An instrumental run belongs to its own slot when the gap earned one; otherwise it
    // rides along with the section it introduces.
    const own = plan.gapSlot[next];
    const slot = own ?? plan.lineSlot[Math.min(next, plan.lineSlot.length - 1)] ?? 0;
    buckets[slot]?.push(line);
  }

  const seen = new Map<string, string>();
  let lyricCount = 0;
  let instrumentalCount = 0;
  const named: ChartSection[] = [];

  plan.slots.forEach((slot, i) => {
    const block = buckets[i];
    if (block.length === 0) return;

    const range = ranges[i];

    if (slot.kind === 'instrumental') {
      if (i === 0) { named.push({ name: 'Intro', lines: block, range }); return; }
      if (i === plan.slots.length - 1) { named.push({ name: 'Outro', lines: block, range }); return; }
      instrumentalCount += 1;
      named.push({ name: `Instrumental ${instrumentalCount}`, lines: block, range });
      return;
    }

    // Blocks with the same words are the same part of the song, so they share a name —
    // that's what makes a repeating chorus visible at a glance.
    const signature = block.map(l => l.lyric?.text ?? '').join(' | ').toLowerCase();
    const known = seen.get(signature);
    if (known) { named.push({ name: known, lines: block, range }); return; }

    lyricCount += 1;
    const name = `Section ${lyricCount}`;
    seen.set(signature, name);
    named.push({ name, lines: block, range });
  });

  return named;
}
