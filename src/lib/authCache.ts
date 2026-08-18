/**
 * Sync localStorage mirror of the last known auth state, so the account UI (navbar,
 * editor header, library header) can paint the logged-in look on first render instead
 * of flashing "signed out" while getAuthState()'s getSession() call resolves. It is
 * always corrected by a real getAuthState() call right after — see useAccountState.
 */

const AUTH_CACHE_KEY = 'chord-player-auth-cache';

interface CachedAuth {
  userId: string;
  displayName: string | null;
}

export function getCachedAuth(): CachedAuth | null {
  try {
    const raw = localStorage.getItem(AUTH_CACHE_KEY);
    return raw ? (JSON.parse(raw) as CachedAuth) : null;
  } catch {
    return null;
  }
}

export function setCachedAuth(auth: CachedAuth | null): void {
  try {
    if (auth) {
      localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(auth));
    } else {
      localStorage.removeItem(AUTH_CACHE_KEY);
    }
  } catch {
    // localStorage unavailable (SSR, private mode) — cache is best-effort only
  }
}
