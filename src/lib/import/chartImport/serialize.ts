import { spanChordName } from './segment';
import type { ChartLine, ChartSection, SongChart } from './types';

// Serializes to the paste-in text format that /songs/new/ understands (see
// SongCreator/textParser.ts): `[Chord:beats]lyric`, with `:beats` omitted when it is
// the default of 4.

export interface SongMetaText {
  title?: string;
  artist?: string;
  album?: string;
  key?: string;
  capo?: number;
  bpm?: number;
  style?: string;
  genre?: string[];
}

function chordTag(chord: string, beats: number): string {
  return beats === 4 ? `[${chord}]` : `[${chord}:${beats}]`;
}

function serializeLyricLine(line: ChartLine): string {
  const words = line.lyric!.words;
  const tagsByWord = new Map<number, string[]>();

  for (const anchor of line.anchors) {
    const list = tagsByWord.get(anchor.wordIndex) ?? [];
    list.push(chordTag(spanChordName(anchor.span), anchor.span.beats));
    tagsByWord.set(anchor.wordIndex, list);
  }

  return words
    .map((word, i) => (tagsByWord.get(i) ?? []).join('') + word.text)
    .join(' ');
}

// A line that is exactly one bracketed token reads as a section header, unless what is
// inside looks like a plain chord name (see isSectionLine in SongCreator/textParser.ts).
// `[G]` alone is safe; `[G:3]` alone is not, and gets a placeholder to stay a chord.
function needsPlaceholder(tags: string[]): boolean {
  if (tags.length !== 1) return false;
  const inner = tags[0].slice(1, -1);
  return inner.includes(':') || inner.length > 8;
}

function serializeInstrumentalLine(line: ChartLine): string {
  const tags = line.anchors.map(a => chordTag(spanChordName(a.span), a.span.beats));
  return needsPlaceholder(tags) ? `${tags[0]}—` : tags.join('');
}

export function serializeLine(line: ChartLine): string {
  return line.lyric ? serializeLyricLine(line) : serializeInstrumentalLine(line);
}

export function serializeSection(section: ChartSection): string[] {
  return [`[${section.name}]`, ...section.lines.map(serializeLine)];
}

export function serializeChart(chart: SongChart, meta: SongMetaText = {}): string {
  const out: string[] = [];

  if (meta.title) out.push(`Title: ${meta.title}`);
  if (meta.artist) out.push(`Artist: ${meta.artist}`);
  if (meta.album) out.push(`Album: ${meta.album}`);
  out.push(`Key: ${meta.key ?? chart.key}`);
  if (meta.capo) out.push(`Capo: ${meta.capo}`);
  out.push(`BPM: ${meta.bpm ?? chart.bpm}`);
  if (meta.style) out.push(`Style: ${meta.style}`);
  if (meta.genre?.length) out.push(`Genre: ${meta.genre.join(', ')}`);

  for (const section of chart.sections) {
    out.push('', ...serializeSection(section));
  }

  return out.join('\n');
}

// Chord-above-lyric rendering, matching how the reference PDFs lay a chart out. Used to
// eyeball the alignment; the text format above is what gets pasted into the editor.
export function renderChordAbove(chart: SongChart): string {
  const out: string[] = [];

  for (const section of chart.sections) {
    out.push(`[${section.name}]`);

    for (const line of section.lines) {
      if (!line.lyric) {
        out.push(line.anchors.map(a => spanChordName(a.span)).join(' '), '');
        continue;
      }

      const words = line.lyric.words.map(w => w.text);
      const columns: number[] = [];
      let column = 0;
      for (const word of words) {
        columns.push(column);
        column += word.length + 1;
      }

      let chordRow = '';
      for (const anchor of line.anchors) {
        const target = columns[anchor.wordIndex] ?? 0;
        if (chordRow.length > 0 && target <= chordRow.length) chordRow += ' ';
        else chordRow = chordRow.padEnd(target, ' ');
        chordRow += spanChordName(anchor.span);
      }

      if (chordRow.trim()) out.push(chordRow);
      out.push(words.join(' '), '');
    }
  }

  return out.join('\n');
}
