import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

export async function ensureAuth(): Promise<string | null> {
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) return session.user.id;
  const { data } = await supabase.auth.signInAnonymously();
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
