import type { EditorSection, EditorLine, SongMeta } from './types';
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

// A line that is exactly [Something] with nothing after = section header
const SECTION_LINE_RE = /^\[([^\]]+)\]\s*$/;
// Chord pattern: starts with A-G optionally followed by # or b and quality markers, no spaces
const CHORD_ONLY_RE = /^[A-G][#b]?[^a-z\s]*$/;

function isSectionLine(content: string): boolean {
  // If it looks like a chord name (A-G root, no spaces, short), treat as chord, not section
  if (CHORD_ONLY_RE.test(content) && content.length <= 8) return false;
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

    // Section header: [Verse 1] or [Chorus] — alone on a line
    const sectionMatch = trimmed.match(SECTION_LINE_RE);
    if (sectionMatch && isSectionLine(sectionMatch[1])) {
      inHeader = false;
      if (current && current.lines.length > 0) sections.push(current);
      current = { id: uid(), name: sectionMatch[1], lines: [] };
      continue;
    }

    // Blank line
    if (trimmed === '') {
      inHeader = false;
      continue;
    }

    inHeader = false;

    if (!current) {
      current = { id: uid(), name: 'Verse 1', lines: [] };
    }

    const editorLine: EditorLine = {
      id: uid(),
      tokens: parseLineToTokens(line),
    };
    current.lines.push(editorLine);
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
