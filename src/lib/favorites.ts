import { useCallback, useEffect, useState } from 'react';

/**
 * What you starred: songs of yours and rhythms, as the Android app lets you (a star on the
 * row, a Favourites filter).
 *
 * In this browser's localStorage, like the progression explorer's favourites: a star is a way
 * of finding something again, not part of the song, so starring one does not rewrite it in
 * the cloud or change when it was last edited.
 */
export type FavoriteKind = 'songs' | 'styles' | 'sounds';

/** Sounds are kept by program (the General MIDI number plus 128 × the bank), as text. */
const KEYS: Record<FavoriteKind, string> = {
  songs: 'cs_favorite_songs',
  styles: 'cs_favorite_styles',
  sounds: 'cs_favorite_sounds',
};
const EVENT = 'favoritesChanged';

export function getFavorites(kind: FavoriteKind): Set<string> {
  try {
    const raw = localStorage.getItem(KEYS[kind]);
    const list = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list.filter((v): v is string => typeof v === 'string') : []);
  } catch {
    // Storage blocked, or a bad value: no favourites rather than a broken page.
    return new Set();
  }
}

export function toggleFavorite(kind: FavoriteKind, id: string): Set<string> {
  const next = getFavorites(kind);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  try {
    localStorage.setItem(KEYS[kind], JSON.stringify([...next]));
  } catch { /* storage blocked: the star holds for this visit */ }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: kind }));
  return next;
}

/** The favourites of [kind], kept current across every component that shows them. */
export function useFavorites(kind: FavoriteKind): [Set<string>, (id: string) => void] {
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    const read = () => setFavorites(getFavorites(kind));
    read();
    const onChange = (e: Event) => { if ((e as CustomEvent).detail === kind) read(); };
    // Another tab starring something shows here too.
    const onStorage = (e: StorageEvent) => { if (e.key === KEYS[kind]) read(); };
    window.addEventListener(EVENT, onChange);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener('storage', onStorage);
    };
  }, [kind]);
  const toggle = useCallback((id: string) => setFavorites(toggleFavorite(kind, id)), [kind]);
  return [favorites, toggle];
}

// ── Songs of the public catalogue ─────────────────────────────────────────────────

/**
 * A song of the catalogue (/songs/…), starred from its page, as the app stars them
 * (`catalog-<slug>` in its favourites). Kept with what My songs shows of it, since that page
 * does not load the catalogue: the title, the artist and the key it was in when starred.
 */
export interface CatalogFavorite {
  slug: string;
  title: string;
  artist?: string;
  songKey?: string;
}

const CATALOG_KEY = 'cs_favorite_catalog';

export function getCatalogFavorites(): CatalogFavorite[] {
  try {
    const raw = JSON.parse(localStorage.getItem(CATALOG_KEY) ?? '[]');
    return Array.isArray(raw)
      ? raw.filter((s): s is CatalogFavorite => !!s && typeof s.slug === 'string' && typeof s.title === 'string')
      : [];
  } catch {
    return [];
  }
}

export function toggleCatalogFavorite(song: CatalogFavorite): CatalogFavorite[] {
  const now = getCatalogFavorites();
  // Newest first, as a star is usually given to the song you just played.
  const next = now.some((s) => s.slug === song.slug) ? now.filter((s) => s.slug !== song.slug) : [song, ...now];
  try {
    localStorage.setItem(CATALOG_KEY, JSON.stringify(next));
  } catch { /* storage blocked: the star holds for this visit */ }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: 'catalog' }));
  return next;
}

/** The starred catalogue songs, kept current across the page and other tabs. */
export function useCatalogFavorites(): [CatalogFavorite[], (song: CatalogFavorite) => void] {
  // Empty on the first render, read after mount: the server's HTML has no stars to match.
  const [songs, setSongs] = useState<CatalogFavorite[]>([]);
  useEffect(() => {
    const read = () => setSongs(getCatalogFavorites());
    read();
    const onChange = (e: Event) => { if ((e as CustomEvent).detail === 'catalog') read(); };
    const onStorage = (e: StorageEvent) => { if (e.key === CATALOG_KEY) read(); };
    window.addEventListener(EVENT, onChange);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);
  const toggle = useCallback((song: CatalogFavorite) => setSongs(toggleCatalogFavorite(song)), []);
  return [songs, toggle];
}
