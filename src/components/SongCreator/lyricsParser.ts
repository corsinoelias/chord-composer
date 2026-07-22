import type { EditorSection, EditorLine, WordToken } from './types';

let _id = 0;
const uid = () => String(++_id);

const SECTION_LABEL = /^(verse|chorus|bridge|pre.?chorus|intro|outro|instrumental|solo|interlude|refrain|hook|coda|break)[\s\d:]*$/i;

function tokenizeLine(line: string): WordToken[] {
  const parts = line.split(/(?<=\S)(?=\s)|(?<=\s)(?=\S)/);
  return parts.map(p => ({
    id: uid(),
    text: p,
    chord: '',
    duration: 4,
    isSpace: /^\s+$/.test(p),
  }));
}

function makeLine(text: string): EditorLine {
  return { id: uid(), tokens: tokenizeLine(text) };
}

function makeSection(name: string): EditorSection {
  return { id: uid(), name, lines: [], repeatCount: 1 };
}

export function parseLyricsToSections(raw: string): EditorSection[] {
  const lines = raw.split('\n');
  const sections: EditorSection[] = [];
  let current = makeSection('Verse 1');

  for (const line of lines) {
    const trimmed = line.trim();

    if (SECTION_LABEL.test(trimmed)) {
      // Named section header
      if (current.lines.length > 0) sections.push(current);
      const label = trimmed.replace(/:$/, '');
      current = makeSection(label.charAt(0).toUpperCase() + label.slice(1));
    } else if (trimmed === '') {
      // Blank lines are ignored — sections split only on section labels (Verse, Chorus…)
    } else {
      current.lines.push(makeLine(line));
    }
  }

  if (current.lines.length > 0) sections.push(current);
  if (sections.length === 0) return [makeSection('Verse 1')];
  return sections;
}

import type { SongSection } from '@/data/songs';

export function sectionsToSongFormat(sections: EditorSection[]): SongSection[] {
  return sections.map(s => ({
    name: s.name,
    lines: s.lines.map(l => {
      let line = '';
      for (const t of l.tokens) {
        if (t.chord && !t.isSpace) {
          // Only encode duration when it's not the default (2)
          const tag = t.duration !== 4 ? `[${t.chord}:${t.duration}]` : `[${t.chord}]`;
          line += `${tag}${t.text}`;
        } else {
          line += t.text;
        }
      }
      return line;
    }).filter(l => l.trim() !== ''),
    ...(s.repeatCount > 1 ? { repeatCount: s.repeatCount } : {}),
    ...(s.audioRange ? { audioRange: s.audioRange } : {}),
  }));
}

// Reverse: SongSection[] → EditorSection[] (for edit mode)
const CHORD_TAG_RE = /^\[([^:\]]+)(?::(\d+(?:\.\d+)?))?\]$/;

export function parseLineToTokens(line: string): WordToken[] {
  const parts = line.split(/(\[[^\]]+\])/);
  const tokens: WordToken[] = [];
  let pendingChord = '';
  let pendingDuration = 4;

  for (const part of parts) {
    const m = part.match(CHORD_TAG_RE);
    if (m) {
      if (pendingChord) tokens.push({ id: uid(), text: '', chord: pendingChord, duration: pendingDuration, isSpace: false });
      pendingChord = m[1];
      pendingDuration = m[2] ? parseFloat(m[2]) : 4;
    } else if (part) {
      const wordParts = part.split(/(?<=\S)(?=\s)|(?<=\s)(?=\S)/);
      wordParts.forEach((w, i) => {
        tokens.push({
          id: uid(),
          text: w,
          chord: i === 0 ? pendingChord : '',
          duration: i === 0 ? pendingDuration : 2,
          isSpace: /^\s+$/.test(w),
        });
      });
      pendingChord = '';
      pendingDuration = 4;
    }
  }

  if (pendingChord) tokens.push({ id: uid(), text: '', chord: pendingChord, duration: pendingDuration, isSpace: false });
  return tokens;
}

// Serialize tokens back to editable [Chord:N]word text
export function tokensToRawLine(tokens: WordToken[]): string {
  return tokens.map(t => {
    if (t.chord && !t.isSpace) {
      return t.duration !== 4 ? `[${t.chord}:${t.duration}]${t.text}` : `[${t.chord}]${t.text}`;
    }
    return t.text;
  }).join('');
}

export function makeEmptyLine(): EditorLine {
  return { id: uid(), tokens: [{ id: uid(), text: '', chord: '', duration: 4, isSpace: false }] };
}

export function makeNewSection(name?: string): EditorSection {
  return makeSection(name ?? 'New section');
}

export function songSectionsToEditorSections(sections: SongSection[]): EditorSection[] {
  return sections.map(s => ({
    id: uid(),
    name: s.name,
    lines: s.lines.map(line => ({
      id: uid(),
      tokens: parseLineToTokens(line),
    })),
    repeatCount: s.repeatCount ?? 1,
    audioRange: s.audioRange,
  }));
}
