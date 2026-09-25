import { useSyncExternalStore } from 'react';
import type { GuitarVoicing } from '@/data/guitarChords';

// Left-handed chord diagrams: the reader's preference (set from the song page's "Aa" menu),
// remembered per browser and shared by every GuitarChordDiagram on the page — the diagram strip,
// the chart's hover diagrams, the bar. One tiny store instead of a prop threaded through them all.

const KEY = 'chord-diagrams-lefty';
const listeners = new Set<() => void>();
let value: boolean | null = null;

function read(): boolean {
  if (value === null) {
    try { value = typeof window !== 'undefined' && localStorage.getItem(KEY) === '1'; } catch { value = false; }
  }
  return value;
}

export function setLeftHanded(on: boolean): void {
  value = on;
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* storage blocked */ }
  listeners.forEach(l => l());
}

export function useLeftHanded(): boolean {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    read,
    () => false,
  );
}

// The same shape seen from the other side of the neck: strings reversed, barre re-indexed.
// Mirroring the data (not the drawing) keeps finger numbers and labels readable.
export function mirrorVoicing(v: GuitarVoicing): GuitarVoicing {
  const n = v.frets.length;
  return {
    ...v,
    frets: [...v.frets].reverse(),
    fingers: [...v.fingers].reverse(),
    barre: v.barre ? { fret: v.barre.fret, fromString: n - 1 - v.barre.toString, toString: n - 1 - v.barre.fromString } : undefined,
  };
}
