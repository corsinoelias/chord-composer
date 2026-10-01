/**
 * How long Finish takes to bring the song down to silence: the app's Ajustes › Fundido
 * (AppSettings.fadeSeconds), 2, 4 or 8 seconds. The person's, not the song's, so it lives
 * in this browser like the click settings.
 */
import { useSyncExternalStore } from 'react';

export const FADE_LENGTHS = [2, 4, 8] as const;
export type FadeLength = (typeof FADE_LENGTHS)[number];

const STORE = 'fade-seconds-v1';
let current: FadeLength | null = null;
const listeners = new Set<() => void>();

function snapshot(): FadeLength {
  if (current === null) {
    let stored: unknown = null;
    try { stored = Number(localStorage.getItem(STORE)); } catch { /* private window */ }
    current = FADE_LENGTHS.includes(stored as FadeLength) ? (stored as FadeLength) : 4;
  }
  return current;
}

export function setFadeLength(seconds: FadeLength): void {
  current = seconds;
  try { localStorage.setItem(STORE, String(seconds)); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}

export function useFadeLength(): FadeLength {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    snapshot,
    () => 4,
  );
}
