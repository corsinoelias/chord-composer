/**
 * How long Enter takes to bring the song up from silence: the app's Ajustes › Fundido de entrada
 * (AppSettings.fadeInSeconds), 2, 4 or 8 seconds. The person's, not the song's, so it lives
 * in this browser like the click settings.
 */
import { useSyncExternalStore } from 'react';

export const FADE_IN_LENGTHS = [2, 4, 8] as const;
export type FadeInLength = (typeof FADE_IN_LENGTHS)[number];

const STORE = 'fade-in-seconds-v1';
let current: FadeInLength | null = null;
const listeners = new Set<() => void>();

function snapshot(): FadeInLength {
  if (current === null) {
    let stored: unknown = null;
    try { stored = Number(localStorage.getItem(STORE)); } catch { /* private window */ }
    current = FADE_IN_LENGTHS.includes(stored as FadeInLength) ? (stored as FadeInLength) : 4;
  }
  return current;
}

export function setFadeInLength(seconds: FadeInLength): void {
  current = seconds;
  try { localStorage.setItem(STORE, String(seconds)); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}

export function useFadeInLength(): FadeInLength {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    snapshot,
    () => 4,
  );
}

/** Read at the tap that starts the song, outside any render. */
export function getFadeInLength(): FadeInLength {
  return snapshot();
}
