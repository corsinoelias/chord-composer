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
