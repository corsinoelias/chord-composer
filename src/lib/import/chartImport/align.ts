import type { ChartLine, ChartSection, ChordSpan, LyricLine } from './types';

export interface AlignOptions {
  // Average seconds per beat — sets the scale for every tolerance below.
  beatSeconds: number;
  // A chord landing more than this many beats outside every lyric line becomes its own
  // instrumental line instead of being glued to the nearest word.
  gapBeats?: number;
  // Silence of at least this many beats between lines starts a new section.
  sectionGapBeats?: number;
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
// Nothing in the source marks verses and choruses, so structure is inferred from
// silence and from lyric lines repeating verbatim. Names are a starting point for the
// editor, not a claim about the arrangement.

function lineStart(line: ChartLine): number {
  if (line.lyric) return line.lyric.start;
  return line.anchors[0]?.span.startTime ?? 0;
}

function lineEnd(line: ChartLine): number {
  if (line.lyric) return line.lyric.end;
  return line.anchors[line.anchors.length - 1]?.span.endTime ?? 0;
}

export function groupSections(lines: ChartLine[], options: AlignOptions): ChartSection[] {
  const { beatSeconds, sectionGapBeats = 6 } = options;
  const gap = sectionGapBeats * beatSeconds;

  // An instrumental run this long is a part of the arrangement in its own right (intro,
  // turnaround, break), not a stray chord ahead of the next line.
  const isStandalone = (line: ChartLine) =>
    !line.lyric && line.anchors.reduce((n, a) => n + a.span.beats, 0) >= sectionGapBeats;

  const blocks: ChartLine[][] = [];
  for (const line of lines) {
    const current = blocks[blocks.length - 1];
    const previous = current?.[current.length - 1];
    const silence = previous ? lineStart(line) - lineEnd(previous) >= gap : false;
    if (!current || silence || isStandalone(line) || (previous && isStandalone(previous))) {
      blocks.push([line]);
      continue;
    }
    current.push(line);
  }

  const seen = new Map<string, string>();
  let lyricCount = 0;
  let instrumentalCount = 0;

  return blocks.map((block, i) => {
    const hasLyric = block.some(l => l.lyric);

    if (!hasLyric) {
      if (i === 0) return { name: 'Intro', lines: block };
      if (i === blocks.length - 1) return { name: 'Outro', lines: block };
      instrumentalCount += 1;
      return { name: `Instrumental ${instrumentalCount}`, lines: block };
    }

    const signature = block.map(l => l.lyric?.text ?? '').join(' | ').toLowerCase();
    const known = seen.get(signature);
    if (known) return { name: known, lines: block };

    lyricCount += 1;
    const name = `Section ${lyricCount}`;
    seen.set(signature, name);
    return { name, lines: block };
  });
}
