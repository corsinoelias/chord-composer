import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getCachedAuth, setCachedAuth } from './authCache';

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

/**
 * Returns the current real (non-anonymous) user's id and display name, or both
 * null if logged out. Never creates a session — anonymous accounts are no
 * longer supported. A lingering anonymous session (from before this change)
 * is signed out rather than treated as a valid identity.
 */
export async function getAuthState(): Promise<{ userId: string | null; displayName: string | null }> {
  if (!supabase) {
    console.log('[AUTH] Supabase not configured — running without auth');
    return { userId: null, displayName: null };
  }
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    setCachedAuth(null);
    return { userId: null, displayName: null };
  }
  if (session.user.is_anonymous) {
    console.log('[AUTH] Discarding lingering anonymous session');
    await supabase.auth.signOut();
    setCachedAuth(null);
    return { userId: null, displayName: null };
  }
  const result = {
    userId: session.user.id,
    displayName: (session.user.user_metadata?.display_name as string | undefined) ?? null,
  };
  setCachedAuth(result);
  return result;
}

/**
 * Synchronous, best-effort read of the last confirmed auth state — for painting the
 * logged-in look on first render, before getAuthState()'s network round trip resolves.
 * Always treat this as provisional; a real getAuthState() call must follow and wins.
 */
export function getCachedAuthState(): { userId: string; displayName: string | null } | null {
  return getCachedAuth();
}

/** Returns the current real (non-anonymous) user id, or null if logged out. */
export async function ensureAuth(): Promise<string | null> {
  return (await getAuthState()).userId;
}

export async function signUpWithEmail(
  email: string,
  password: string,
  displayName: string,
): Promise<{ userId: string | null; needsEmailConfirmation: boolean; error: string | null }> {
  if (!supabase) return { userId: null, needsEmailConfirmation: false, error: 'Supabase not configured' };
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
  });
  if (error) return { userId: null, needsEmailConfirmation: false, error: error.message };
  return {
    userId: data.user?.id ?? null,
    needsEmailConfirmation: !data.session,
    error: null,
  };
}

export async function signInWithEmail(
  email: string,
  password: string,
): Promise<{ userId: string | null; error: string | null }> {
  if (!supabase) return { userId: null, error: 'Supabase not configured' };
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { userId: null, error: error.message };
  return { userId: data.user?.id ?? null, error: null };
}

export async function signOut(): Promise<void> {
  setCachedAuth(null);
  if (!supabase) return;
  await supabase.auth.signOut();
}

/**
 * Emails a password-reset link to `email`, if an account with that address exists.
 * The link lands on /auth/reset with a token in the URL fragment; the client's
 * detectSessionInUrl (on by default) picks it up automatically and turns it into a
 * short-lived recovery session, which /auth/reset uses to let the visitor set a new
 * password. Works regardless of whether the address was ever click-verified —
 * Supabase only needs it on file, not confirmed.
 */
export async function sendPasswordReset(email: string): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Supabase not configured' };
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/auth/reset/`,
  });
  return { error: error?.message ?? null };
}

/** Sets a new password on the current session — used on /auth/reset after a recovery link. */
export async function updatePassword(newPassword: string): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Supabase not configured' };
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  return { error: error?.message ?? null };
}

/** The current user's email — not part of getAuthState()'s return shape since nothing
 *  but the account page needs it; read directly here rather than growing that shape. */
export async function getCurrentUserEmail(): Promise<string | null> {
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.email ?? null;
}

/** Changes the display name shown everywhere (navbar, editor header, library). */
export async function updateDisplayName(name: string): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Supabase not configured' };
  const { error } = await supabase.auth.updateUser({ data: { display_name: name } });
  if (error) return { error: error.message };
  // Refreshes the cached {userId, displayName} so the navbar/editor avatar picks up
  // the new name on their next render without needing a full page reload.
  await getAuthState();
  return { error: null };
}

/**
 * Permanently deletes the current user's account (and, via ON DELETE CASCADE on
 * progressions.user_id, every song they saved — confirmed empirically, this project
 * has no migration file for the original table creation to read that constraint off
 * of directly). Client code can't call the Auth Admin API itself — that needs the
 * service-role key, which must never reach the browser — so this hands the caller's
 * own access token to /api/account/delete, which verifies it server-side (proving the
 * caller IS the account being deleted, not just anyone with a valid session) before
 * invoking supabase.auth.admin.deleteUser(). Clears the local session either way on
 * success, since the account it belonged to no longer exists.
 */
export async function deleteAccount(): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Supabase not configured' };
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return { error: 'Not signed in' };

  const res = await fetch('/api/account/delete/', {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { error: body.error ?? `Request failed (${res.status})` };
  }

  setCachedAuth(null);
  await supabase.auth.signOut();
  return { error: null };
}

// Supabase doesn't hand back an explicit "this was a new account" flag for an
// ID-token sign-in — a first sign-in's created_at and last_sign_in_at land within
// moments of each other, a returning user's won't, so the gap tells them apart.
function isNewSupabaseUser(user: { created_at: string; last_sign_in_at?: string | null }): boolean {
  if (!user.last_sign_in_at) return true;
  return Math.abs(new Date(user.last_sign_in_at).getTime() - new Date(user.created_at).getTime()) < 5000;
}

/**
 * Completes Google sign-in from an ID token handed back by Google Identity Services
 * (see lib/googleIdentity.ts and AuthModal's rendered Google button) — this never
 * leaves the page, unlike Supabase's own signInWithOAuth(), which redirects to a
 * Google-hosted consent screen that (being the real OAuth client) shows Supabase's own
 * project domain rather than chordsequence.com. `nonce` must be the RAW value whose
 * SHA-256 hash was passed to GIS's initialize() — Supabase hashes it again here and
 * compares against the token's embedded nonce claim, so passing the same value to both
 * sides would never match.
 */
export async function signInWithGoogleIdToken(
  idToken: string,
  nonce: string,
): Promise<{ userId: string | null; isNewUser: boolean; error: string | null }> {
  if (!supabase) return { userId: null, isNewUser: false, error: 'Supabase not configured' };
  const { data, error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken, nonce });
  if (error || !data.user) return { userId: null, isNewUser: false, error: error?.message ?? 'Sign-in failed' };
  return { userId: data.user.id, isNewUser: isNewSupabaseUser(data.user), error: null };
}
