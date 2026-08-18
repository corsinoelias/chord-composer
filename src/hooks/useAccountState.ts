import { useCallback, useEffect, useState } from 'react';
import { getAuthState, getCachedAuthState } from '@/lib/supabase';

/**
 * Shared auth-state reader for every surface that needs to show "who's logged in"
 * (navbar, editor header, library header). Paints the cached state on mount (sync,
 * no flash of "signed out") and then confirms it with a real getAuthState() call,
 * which corrects the UI if the cache was stale (session expired elsewhere, etc.).
 */
export function useAccountState() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(() => {
    return getAuthState().then(({ userId, displayName }) => {
      setIsLoggedIn(!!userId);
      setDisplayName(displayName);
      setIsLoading(false);
      return { userId, displayName };
    });
  }, []);

  useEffect(() => {
    const cached = getCachedAuthState();
    if (cached) {
      setIsLoggedIn(true);
      setDisplayName(cached.displayName);
      setIsLoading(false);
    }
    refresh();
  }, [refresh]);

  return { isLoggedIn, displayName, isLoading, refresh };
}
