/**
 * Rich section+duration payload passed to the editor via the `data` URL param
 * (e.g. from the songs pages, which have per-chord durations and named,
 * repeatable sections — the plain `chords=Am-F-C-G` param used by blog embeds
 * only carries flat chord names at a default duration).
 */
import { type Chord } from './musicTheory';
import { parseChordString } from './chordParser';
import { createSection, type Section } from './sections';

export interface EditorLinkChord {
  c: string; // chord string, e.g. "Gb", "Abm", "C/E"
  d: number; // duration in beats
}

export interface EditorLinkSection {
  name: string;
  repeatCount: number;
  chords: EditorLinkChord[];
}

// Binary-safe base64url (no padding) — keeps the URL short and free of characters
// that would need percent-escaping, while still handling non-ASCII section names.
function toBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  bytes.forEach(b => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str: string): string {
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeEditorSections(sections: EditorLinkSection[]): string {
  return toBase64Url(JSON.stringify(sections));
}

export function decodeEditorSections(param: string): EditorLinkSection[] | null {
  try {
    const parsed = JSON.parse(fromBase64Url(param));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function editorSectionsToSections(data: EditorLinkSection[]): Section[] {
  return data
    .map(s => {
      const chords = s.chords
        .map(({ c, d }): Chord | null => {
          const parsed = parseChordString(c)[0];
          return parsed ? { ...parsed, duration: d } : null;
        })
        .filter((c): c is Chord => c !== null);
      return {
        ...createSection(s.name || 'Section A'),
        repeatCount: s.repeatCount > 0 ? s.repeatCount : 1,
        chords,
      };
    })
    .filter(s => s.chords.length > 0);
}
