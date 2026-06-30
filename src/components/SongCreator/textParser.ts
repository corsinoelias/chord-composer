import type { EditorSection, EditorLine, WordToken, SongMeta } from './types';
import { parseLineToTokens } from './lyricsParser';

let _id = 200000;
const uid = () => String(++_id);

// Accepts both Spanish and English field names
const META_KEYS: Record<string, keyof SongMeta> = {
  'título': 'title', 'titulo': 'title', 'title': 'title',
  'artista': 'artist', 'artist': 'artist',
  'tonalidad': 'key', 'clave': 'key', 'key': 'key',
  'capo': 'capo',
  'bpm': 'bpm',
  'estilo': 'style', 'style': 'style',
  'género': 'genre', 'genero': 'genre', 'genre': 'genre',
};

const STYLE_MAP: Record<string, string> = {
  'pop': 'pop_basic', 'rock': 'rock_basic', 'jazz': 'jazz_swing',
  'folk': 'folk_strum', 'blues': 'blues_shuffle',
  'lofi': 'lofi_chill', 'lo-fi': 'lofi_chill', 'chill': 'lofi_chill',
};

const STYLE_LABELS: Record<string, string> = {
  'pop_basic': 'Pop', 'rock_basic': 'Rock', 'jazz_swing': 'Jazz',
  'folk_strum': 'Folk', 'blues_shuffle': 'Blues', 'lofi_chill': 'Lo-fi',
};

// A line that is exactly [Something] with nothing after = section header (inline format)
const SECTION_LINE_RE = /^\[([^\]]+)\]\s*$/;

// Section labels without brackets (Nashville/plain format): Verse, Chorus, Bridge, etc.
const SECTION_LABEL_RE = /^(verse|chorus|bridge|prechorus|pre[-\s]?chorus|intro|outro|instrumental|solo|interlude|refrain|hook|coda|break|tag|vamp|strophe|estrofa|coro|puente|precoro)[\s\d:]*$/i;

// Chord name: A-G root + optional accidental + optional quality + optional number + optional bass note
const CHORD_NAME_RE = /^[A-G][#b]?(m|maj|min|dim|aug|sus[24]?|add|M|b)?[0-9]*(\/[A-G][#b]?)?$/;

function isChordName(s: string): boolean {
  return CHORD_NAME_RE.test(s);
}

// A line is a "chord line" if every non-whitespace token is a valid chord name
function isChordLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  // Must have at least one chord; reject if any token isn't a chord
  return tokens.every(t => isChordName(t));
}

interface ChordPos { chord: string; col: number; }

function parseChordPositions(line: string): ChordPos[] {
  const result: ChordPos[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    if (isChordName(m[0])) result.push({ chord: m[0], col: m.index });
  }
  return result;
}

// Assign chords from a chord line to words in a lyric line by column proximity
function assignChordsToLyric(chordPositions: ChordPos[], lyricLine: string): WordToken[] {
  if (chordPositions.length === 0) return parseLineToTokens(lyricLine);

  // Tokenize lyric into alternating word/space chunks with their column positions
  const chunks: Array<{ text: string; col: number; isSpace: boolean }> = [];
  const re = /\S+|\s+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(lyricLine)) !== null) {
    chunks.push({ text: m[0], col: m.index, isSpace: /^\s/.test(m[0]) });
  }

  const wordChunks = chunks.filter(c => !c.isSpace);
  if (wordChunks.length === 0) {
    // No lyric words — create a token for the first chord
    return chordPositions.map((cp, i) => ({
      id: uid(), text: i === 0 ? '' : '', chord: cp.chord, duration: 4, isSpace: false,
    }));
  }

  // For each chord, assign to the nearest word by column distance.
  // Prefer the word to the left when equidistant.
  const wordChordMap = new Map<number, string>(); // wordChunk index → first assigned chord

  for (const cp of chordPositions) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < wordChunks.length; i++) {
      const dist = Math.abs(wordChunks[i].col - cp.col);
      // Prefer left (col <= chord) when equal distance
      const tieBreak = wordChunks[i].col <= cp.col ? 0 : 1;
      if (dist < bestDist || (dist === bestDist && tieBreak === 0)) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    if (!wordChordMap.has(bestIdx)) {
      wordChordMap.set(bestIdx, cp.chord);
    }
  }

  // Build the token array preserving spaces
  const tokens: WordToken[] = [];
  let wordIdx = 0;
  for (const chunk of chunks) {
    if (chunk.isSpace) {
      tokens.push({ id: uid(), text: chunk.text, chord: '', duration: 4, isSpace: true });
    } else {
      tokens.push({
        id: uid(),
        text: chunk.text,
        chord: wordChordMap.get(wordIdx) ?? '',
        duration: 4,
        isSpace: false,
      });
      wordIdx++;
    }
  }
  return tokens;
}

function isSectionLine(content: string): boolean {
  // If it looks like a chord name (A-G root, no spaces, short), treat as chord, not section
  if (isChordName(content) && content.length <= 8) return false;
  return true;
}

export interface ParseResult {
  meta: Partial<SongMeta>;
  sections: EditorSection[];
}

export function parseTextMode(raw: string): ParseResult {
  const lines = raw.split('\n');
  const meta: Partial<SongMeta> = {};
  const sections: EditorSection[] = [];

  let inHeader = true;
  let current: EditorSection | null = null;
  let pendingChords: ChordPos[] | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    // Try to parse a metadata field (only while in the header block)
    if (inHeader && trimmed.includes(':')) {
      const colonIdx = trimmed.indexOf(':');
      const rawKey = trimmed.slice(0, colonIdx).trim().toLowerCase();
      const val = trimmed.slice(colonIdx + 1).trim();
      const metaKey = META_KEYS[rawKey];

      if (metaKey) {
        if (metaKey === 'capo') {
          const n = parseInt(val);
          if (!isNaN(n)) meta.capo = n;
        } else if (metaKey === 'bpm') {
          const n = parseInt(val);
          if (!isNaN(n)) meta.bpm = n;
        } else if (metaKey === 'genre') {
          meta.genre = val.split(',').map(g => g.trim().toLowerCase()).filter(Boolean);
        } else if (metaKey === 'style') {
          meta.style = STYLE_MAP[val.toLowerCase()] ?? val;
        } else {
          (meta as Record<string, unknown>)[metaKey] = val;
        }
        continue;
      }
    }

    // Section header with brackets: [Verse 1]
    const bracketMatch = trimmed.match(SECTION_LINE_RE);
    if (bracketMatch && isSectionLine(bracketMatch[1])) {
      inHeader = false;
      pendingChords = null;
      if (current && current.lines.length > 0) sections.push(current);
      current = { id: uid(), name: bracketMatch[1], lines: [] };
      continue;
    }

    // Section header without brackets: Verse, Chorus, Bridge, Prechorus…
    if (SECTION_LABEL_RE.test(trimmed)) {
      inHeader = false;
      pendingChords = null;
      if (current && current.lines.length > 0) sections.push(current);
      const label = trimmed.replace(/:$/, '');
      current = { id: uid(), name: label.charAt(0).toUpperCase() + label.slice(1), lines: [] };
      continue;
    }

    // Blank line
    if (trimmed === '') {
      inHeader = false;
      // Don't clear pendingChords — a blank line between chord line and lyric is unusual but possible
      continue;
    }

    inHeader = false;

    // Chord-above-lyric format: a line that contains only chord names
    if (isChordLine(line)) {
      // If there were already pending chords, flush them as a chord-only line
      if (pendingChords && current) {
        const tokens = assignChordsToLyric(pendingChords, '');
        if (tokens.length > 0) current.lines.push({ id: uid(), tokens });
      }
      pendingChords = parseChordPositions(line);
      if (!current) current = { id: uid(), name: 'Verse 1', lines: [] };
      continue;
    }

    // Regular content line (lyric or inline [Chord]lyric)
    if (!current) current = { id: uid(), name: 'Verse 1', lines: [] };

    let editorLine: EditorLine;
    if (pendingChords) {
      editorLine = { id: uid(), tokens: assignChordsToLyric(pendingChords, line) };
      pendingChords = null;
    } else {
      editorLine = { id: uid(), tokens: parseLineToTokens(line) };
    }
    current.lines.push(editorLine);
  }

  // Flush any trailing pending chords
  if (pendingChords && current) {
    const tokens = assignChordsToLyric(pendingChords, '');
    if (tokens.length > 0) current.lines.push({ id: uid(), tokens });
  }

  if (current && current.lines.length > 0) sections.push(current);

  return { meta, sections };
}

export function serializeToTextMode(meta: SongMeta, sections: EditorSection[]): string {
  const lines: string[] = [];

  if (meta.title)  lines.push(`Title: ${meta.title}`);
  if (meta.artist) lines.push(`Artist: ${meta.artist}`);
  if (meta.key)    lines.push(`Key: ${meta.key}`);
  if (meta.capo)   lines.push(`Capo: ${meta.capo}`);
  if (meta.bpm)    lines.push(`BPM: ${meta.bpm}`);
  if (meta.style)  lines.push(`Style: ${STYLE_LABELS[meta.style] ?? meta.style}`);
  if (meta.genre?.length) lines.push(`Genre: ${meta.genre.join(', ')}`);

  lines.push('');

  for (const section of sections) {
    lines.push(`[${section.name}]`);
    for (const line of section.lines) {
      let rawLine = '';
      for (const t of line.tokens) {
        if (t.chord && !t.isSpace) {
          rawLine += `[${t.chord}]${t.text}`;
        } else {
          rawLine += t.text;
        }
      }
      if (rawLine.trim()) lines.push(rawLine);
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}
