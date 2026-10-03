import { useSyncExternalStore } from 'react';

/**
 * Whether Play counts a bar in on the engine's cowbell first — the app's Ajustes › Cuenta
 * atrás. On by default. It is the key the shared song page's own switch has always used, so
 * a choice made there is the one the editor reads now, and the other way round.
 */
const STORE = 'song-count-in';
let current: boolean | null = null;
const listeners = new Set<() => void>();

function snapshot(): boolean {
  if (current === null) {
    let stored: string | null = null;
    try { stored = localStorage.getItem(STORE); } catch { /* private window: counted in */ }
    current = stored !== '0';
  }
  return current;
}

export function getCountIn(): boolean {
  return snapshot();
}

export function setCountIn(on: boolean): void {
  current = on;
  try { localStorage.setItem(STORE, on ? '1' : '0'); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}

export function useCountIn(): boolean {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    snapshot,
    () => true,
  );
}
