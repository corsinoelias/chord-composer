import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

export async function ensureAuth(): Promise<string | null> {
  if (!supabase) {
    console.log('[AUTH] Supabase not configured — running without auth');
    return null;
  }
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    console.log(`[AUTH] Existing session — user_id: ${session.user.id} (anon: ${session.user.is_anonymous})`);
    return session.user.id;
  }
  console.log('[AUTH] No session found — signing in anonymously…');
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) {
    console.error('[AUTH] Anonymous sign-in failed:', error.message);
    return null;
  }
  console.log(`[AUTH] New anonymous session — user_id: ${data.user?.id}`);
  return data.user?.id ?? null;
}

/** Returns true if the current user is anonymous (not linked to an email). */
export async function getIsAnonymousUser(): Promise<boolean> {
  if (!supabase) return false;
  const { data: { user } } = await supabase.auth.getUser();
  return user?.is_anonymous ?? false;
}

/**
 * Link Google to the current anonymous account (preserves user_id and all songs).
 * Redirects to Google OAuth, then back to /app.
 */
export async function linkGoogleAccount(): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Supabase not configured' };
  const { error } = await supabase.auth.linkIdentity({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/app` },
  });
  return { error: error?.message ?? null };
}
