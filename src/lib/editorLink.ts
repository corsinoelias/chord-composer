/**
 * Rich section+duration payload passed to the editor via the `data` URL param
 * (e.g. from the songs pages, which have per-chord durations and named,
 * repeatable sections — the plain `chords=Am-F-C-G` param used by blog embeds
 * only carries flat chord names at a default duration).
 */
import { type Chord } from './musicTheory';
import { parseChordString } from './chordParser';
import { createSection, type Section } from './sections';
import { MUSICAL_STYLES } from './styles';
import { parseLyricLine, type Song } from '../data/songs';

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

/**
 * A song's sections in the shape the `?data=` param expects, at the pitch the chart
 * is written in. SongChordPlayer builds its own version from `displayedSections` so
 * the link carries the user's live transposition; this one is for the server-rendered
 * links on the song page, which have no transposition state to read.
 */
export function songToEditorSections(song: Song): EditorLinkSection[] {
  return song.sections
    .map(section => ({
      name: section.name,
      repeatCount: section.repeatCount ?? 1,
      chords: section.lines.flatMap(line =>
        parseLyricLine(line)
          .filter(t => t.chord)
          .map(t => ({ c: t.chord, d: t.duration })),
      ),
    }))
    .filter(s => s.chords.length > 0);
}

/**
 * The editor validates `?style=` against the real style ids and silently falls back to
 * reggaeton when it doesn't match (Index.tsx's getInitialStyleId) — so an unknown id
 * opens a worship song with a reggaeton feel. Songs coming from Supabase can still
 * carry ids that no longer exist, so the id is checked here rather than trusted.
 * `pop_1` is what playback already falls back to (MUSICAL_STYLES[0]).
 */
function resolveStyleId(styleId: string): string {
  return MUSICAL_STYLES.some(s => s.id === styleId) ? styleId : 'pop_1';
}

/**
 * Deep link into the chord player carrying the song's full structure. Used by the
 * song page's server-rendered CTAs and by the player bar (which passes its own
 * transposed `sections` and the BPM the listener has dialled in).
 */
export function buildSongEditorUrl(
  song: Song,
  opts: { bpm?: number; sections?: EditorLinkSection[] } = {},
): string {
  const sections = opts.sections ?? songToEditorSections(song);
  const data = encodeEditorSections(sections);
  const bpm = opts.bpm ?? song.bpm;
  const title = encodeURIComponent(`${song.title} - ${song.artist}`);
  return `/chord-player/?data=${data}&bpm=${bpm}&style=${resolveStyleId(song.style)}&title=${title}`;
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
