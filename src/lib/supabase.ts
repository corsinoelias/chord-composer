import { createClient, SupabaseClient } from '@supabase/supabase-js';

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
    return { userId: null, displayName: null };
  }
  if (session.user.is_anonymous) {
    console.log('[AUTH] Discarding lingering anonymous session');
    await supabase.auth.signOut();
    return { userId: null, displayName: null };
  }
  return {
    userId: session.user.id,
    displayName: (session.user.user_metadata?.display_name as string | undefined) ?? null,
  };
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
  if (!supabase) return;
  await supabase.auth.signOut();
}
