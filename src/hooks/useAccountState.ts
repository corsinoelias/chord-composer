import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { getCachedAuth } from '@/lib/authCache';

/**
 * Shared auth-state reader for every surface that needs to show "who's logged in"
 * (navbar, editor header, library header).
 *
 * Initial state is `false`/`null` — matching Astro's SSR output exactly (the server
 * never sees localStorage, so it always renders signed-out) — so React's first
 * hydration pass has nothing to reconcile and commits cleanly. A lazy useState
 * initializer that read the cache was tried first and reverted: it made the client's
 * first render disagree with the server-rendered HTML (signed-out `<button>` vs. an
 * `<AccountMenu>` dropdown — a different DOM shape, not just different text), which
 * React can't patch in place. It threw hydration errors #418/#423 and fell back to
 * discarding the server HTML and doing a full client remount of the island — worse
 * than the flash it was meant to fix (confirmed via a Playwright run against the prod
 * build under throttled network).
 *
 * Instead, the correction to the cached value happens in a useLayoutEffect, which
 * fires synchronously right after the hydrated commit but before the browser paints
 * that frame — so the flip from "signed out" to the cached "signed in" look is never
 * actually visible, without lying to React about what the server sent. The remaining
 * flash is bounded only by how long hydration itself takes (bundle fetch/parse/exec),
 * which is why AuthModal and supabase.ts were split out of this island's static
 * import graph (see AccountSlot.tsx and the dynamic import in refresh() below) —
 * that's the part actually worth shrinking.
 */
export function useAccountState() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { getAuthState } = await import('@/lib/supabase');
    const { userId, displayName } = await getAuthState();
    setIsLoggedIn(!!userId);
    setDisplayName(displayName);
    setIsLoading(false);
    return { userId, displayName };
  }, []);

  useLayoutEffect(() => {
    const cached = getCachedAuth();
    if (cached) {
      setIsLoggedIn(true);
      setDisplayName(cached.displayName);
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { isLoggedIn, displayName, isLoading, refresh };
}
