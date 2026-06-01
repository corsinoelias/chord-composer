import type { EditorSection, ChordSlot, ChordLine, SectionData } from './types';
import { parseLyricLine } from '@/data/songs';
import type { SongSection } from '@/data/songs';

let _id = 50000;
const uid = () => String(++_id);

// ── EditorSection[] → SectionData[] (from LyricsStep output) ─────────────────
export function editorSectionsToSectionData(sections: EditorSection[]): SectionData[] {
  return sections.map(s => ({
    id: s.id,
    name: s.name,
    lines: s.lines.map(l => ({
      id: l.id,
      slots: tokensToSlots(l.tokens),
    })),
  }));
}

function tokensToSlots(tokens: EditorSection['lines'][number]['tokens']): ChordSlot[] {
  const slots: ChordSlot[] = [];
  let current: ChordSlot | null = null;

  for (const t of tokens) {
    if (t.chord) {
      if (current) slots.push(current);
      current = { id: t.id, chord: t.chord, duration: t.duration, lyric: t.text };
    } else if (current) {
      current.lyric += t.text;
    }
    // text before any chord is ignored (usually empty)
  }
  if (current) slots.push(current);
  return slots;
}

// ── SongSection[] → SectionData[] (loading existing songs) ───────────────────
export function songSectionsToSectionData(sections: SongSection[]): SectionData[] {
  return sections.map(s => ({
    id: uid(),
    name: s.name,
    lines: s.lines.map(line => ({
      id: uid(),
      slots: parseLyricLineToSlots(line),
    })),
  }));
}

function parseLyricLineToSlots(line: string): ChordSlot[] {
  const tokens = parseLyricLine(line);
  const slots: ChordSlot[] = [];
  let current: ChordSlot | null = null;

  for (const t of tokens) {
    if (t.chord) {
      if (current) slots.push(current);
      current = { id: uid(), chord: t.chord, duration: t.duration, lyric: t.lyrics };
    } else if (current) {
      current.lyric += t.lyrics;
    }
  }
  if (current) slots.push(current);
  return slots;
}

// ── SectionData[] → SongSection[] (for player + Supabase save) ───────────────
export function sectionDataToSongSections(sections: SectionData[]): SongSection[] {
  return sections.map(s => ({
    name: s.name,
    lines: s.lines
      .map(l => slotsToLine(l.slots))
      .filter(l => l.trim() !== ''),
  }));
}

export function slotsToLine(slots: ChordSlot[]): string {
  return slots.map(s => {
    if (!s.chord) return s.lyric;
    const tag = s.duration !== 4 ? `[${s.chord}:${s.duration}]` : `[${s.chord}]`;
    return `${tag}${s.lyric}`;
  }).join('');
}

// ── Empty helpers ─────────────────────────────────────────────────────────────
export function makeSlot(chord = '', duration = 4, lyric = ''): ChordSlot {
  return { id: uid(), chord, duration, lyric };
}

export function makeLine(slots: ChordSlot[] = []): ChordLine {
  return { id: uid(), slots };
}

export function makeSection(name: string): SectionData {
  return { id: uid(), name, lines: [makeLine()] };
}
