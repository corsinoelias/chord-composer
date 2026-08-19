import { useCallback, useEffect, useState } from 'react';

export type ChordView = 'guitar' | 'piano' | 'ukulele';

// Cross-island sync: ChordAside and SongChordPreview each mount as their own React island
// (client:load), so plain React state can't share between them — same event-bus pattern
// already used for 'song-transpose' / 'song-active-chord'. Switching the instrument in either
// one immediately updates the other, since a listener picking the same view they're already
// on is a harmless no-op re-render.
const EVENT = 'song-chord-view';

// Module-scoped, so an island that mounts *after* the user already switched instruments
// elsewhere (e.g. a ChordTooltip popover opened later) starts on that choice instead of
// snapping back to `initial` — it only knows about the current view via this, since state
// itself can't survive a fresh useState call in a brand-new component instance.
let lastKnownView: ChordView | null = null;

export function useSyncedChordView(initial: ChordView = 'guitar') {
  const [view, setViewState] = useState<ChordView>(lastKnownView ?? initial);

  useEffect(() => {
    const handler = (e: Event) => {
      const v = (e as CustomEvent<{ view: ChordView }>).detail.view;
      lastKnownView = v;
      setViewState(v);
    };
    window.addEventListener(EVENT, handler);
    return () => window.removeEventListener(EVENT, handler);
  }, []);

  const setView = useCallback((v: ChordView) => {
    lastKnownView = v;
    setViewState(v);
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { view: v } }));
  }, []);

  return [view, setView] as const;
}
