import { useCallback, useEffect, useState } from 'react';

export type ChordView = 'guitar' | 'piano' | 'ukulele';

// Cross-island sync: ChordAside and SongChordPreview each mount as their own React island
// (client:load), so plain React state can't share between them — same event-bus pattern
// already used for 'song-transpose' / 'song-active-chord'. Switching the instrument in either
// one immediately updates the other, since a listener picking the same view they're already
// on is a harmless no-op re-render.
const EVENT = 'song-chord-view';

export function useSyncedChordView(initial: ChordView = 'guitar') {
  const [view, setViewState] = useState<ChordView>(initial);

  useEffect(() => {
    const handler = (e: Event) => {
      setViewState((e as CustomEvent<{ view: ChordView }>).detail.view);
    };
    window.addEventListener(EVENT, handler);
    return () => window.removeEventListener(EVENT, handler);
  }, []);

  const setView = useCallback((v: ChordView) => {
    setViewState(v);
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { view: v } }));
  }, []);

  return [view, setView] as const;
}
