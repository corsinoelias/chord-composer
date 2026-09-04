import { formatChord, type ChartNotation } from '@/lib/chordSheet/chordSheetCore';

/**
 * How chord names are spelled on a song page.
 *
 * A strict subset of Chord Sheet Maker's `ChartNotation` — the whole formatting engine already
 * lives in chordSheetCore.ts, this module only narrows what the song pages offer (no movable-Do)
 * and owns the persistence rules. Assignable straight to `ChartNotation`, so no mapping table.
 */
export type SongNotation = 'standard' | 'number' | 'fixed';

// `title` carries the real explanation: "1 4 5" means nothing to someone who has never seen a
// number chart, and the button itself is too small to spell out "Nashville numbers".
export const NOTATION_OPTIONS: { value: SongNotation; label: string; title: string }[] = [
  { value: 'standard', label: 'A B C', title: 'Standard chord names' },
  { value: 'number', label: '1 4 5', title: 'Nashville numbers — degrees of the key, so the chart works in any key' },
  { value: 'fixed', label: 'Do Re Mi', title: 'Do Re Mi — solfège names (Do = C)' },
];

export const NOTATION_STORAGE_KEY = 'song_chord_notation';
const URL_PARAM = 'notation';

function isSongNotation(v: unknown): v is SongNotation {
  return v === 'standard' || v === 'number' || v === 'fixed';
}

/**
 * `?notation=` wins over localStorage, so a shared link opens in the notation it was shared in
 * even for someone whose own saved preference is different.
 *
 * Call this only after mount — reading localStorage during render would desync the client from
 * the server HTML and break hydration (same reason ChordFinderTool defers its own read).
 */
export function readStoredNotation(): SongNotation {
  if (typeof window === 'undefined') return 'standard';
  const fromUrl = new URL(window.location.href).searchParams.get(URL_PARAM);
  if (isSongNotation(fromUrl)) return fromUrl;
  try {
    const stored = localStorage.getItem(NOTATION_STORAGE_KEY);
    if (isSongNotation(stored)) return stored;
  } catch {
    /* Private mode / blocked storage — the default is fine. */
  }
  return 'standard';
}

/**
 * Remembers the choice for next time and reflects it in the URL so the page can be shared as-is.
 * `replaceState`, not `pushState`: flipping notation is a display preference, not navigation —
 * it must not put an entry between the reader and the Back button.
 */
export function persistNotation(n: SongNotation): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(NOTATION_STORAGE_KEY, n);
  } catch {
    /* ignore */
  }
  const url = new URL(window.location.href);
  // 'standard' is the default, so it drops out of the URL rather than pinning the canonical
  // song link with a redundant param.
  if (n === 'standard') url.searchParams.delete(URL_PARAM);
  else url.searchParams.set(URL_PARAM, n);
  window.history.replaceState(null, '', url.pathname + url.search + url.hash);
}

/**
 * The single formatting point for song pages. `name` must already be transposed, and `key` is the
 * *displayed* key (the transposed one) — that's what the degree numbers are counted against.
 *
 * Returns a flat string rather than chordSheetCore's {main, sup, tail} parts on purpose: the chart
 * aligns chords over lyrics with `font-mono` + `whitespace-pre`, and a superscript span would
 * break that alignment.
 */
export function displayChord(name: string, key: string, n: SongNotation): string {
  if (n === 'standard' || !name) return name;
  return formatChord(name, key, n as ChartNotation);
}
