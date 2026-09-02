import { useCallback, useEffect, useState } from 'react';
import { persistNotation, readStoredNotation, type SongNotation } from '@/lib/songNotation';

// Cross-island sync, same event-bus pattern as useSyncedChordView / 'song-transpose':
// SongChordPlayer, SongChordPreview, ChordAside and SongHeaderActions each hydrate as their own
// client:load island, so plain React state can't reach between them.
const EVENT = 'song-notation';

// The current choice, shared by every island in the page. Doubles as the "storage already read"
// flag, so only the first island to hydrate touches localStorage and the rest inherit — they
// can't end up disagreeing.
let lastKnown: SongNotation | null = null;

export function useSongNotation() {
  // ALWAYS 'standard' on the first render, never `lastKnown`. These are separate Astro islands
  // sharing one module instance: whichever hydrates first would otherwise set `lastKnown` and
  // make the next island's very first render disagree with the server HTML, which React reports
  // as a hydration failure and recovers from by throwing the whole island's DOM away.
  const [notation, setNotationState] = useState<SongNotation>('standard');

  useEffect(() => {
    const handler = (e: Event) => {
      const n = (e as CustomEvent<{ notation: SongNotation }>).detail.notation;
      lastKnown = n;
      setNotationState(n);
    };
    window.addEventListener(EVENT, handler);

    // Post-mount, so the stored preference is applied without ever being part of the render the
    // server has to match. An island mounting later (after someone already switched) lands here
    // too and adopts the current choice instead of snapping back to standard.
    if (lastKnown === null) lastKnown = readStoredNotation();
    if (lastKnown !== 'standard') setNotationState(lastKnown);

    return () => window.removeEventListener(EVENT, handler);
  }, []);

  const setNotation = useCallback((n: SongNotation) => {
    lastKnown = n;
    setNotationState(n);
    persistNotation(n);
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { notation: n } }));
  }, []);

  return [notation, setNotation] as const;
}
