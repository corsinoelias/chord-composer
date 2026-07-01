import { supabase, ensureAuth } from './supabase';
import type { SongSection } from '@/data/songs';

export interface PublicSong {
  id: string;
  slug: string;
  title: string;
  artist: string;
  album?: string;
  year?: number;
  genre: string[];
  key: string;
  capo?: number;
  bpm: number;
  style: string;
  description: string;
  tags: string[];
  relatedProgressions: string[];
  sections: SongSection[];
  created_by?: string;
  is_published: boolean;
  created_at?: string;
  updated_at?: string;
}

const TABLE = 'public_songs';

// The DB column is related_progressions (snake_case); the app uses relatedProgressions (camelCase).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromDb(row: any): PublicSong {
  const { related_progressions, ...rest } = row;
  return { ...rest, relatedProgressions: related_progressions ?? [] } as PublicSong;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toDb(song: Record<string, any>): Record<string, any> {
  const { relatedProgressions, ...rest } = song;
  return relatedProgressions !== undefined
    ? { ...rest, related_progressions: relatedProgressions }
    : rest;
}

export async function getPublishedSongs(): Promise<PublicSong[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('is_published', true)
    .order('created_at', { ascending: false });
  if (error) { console.error('getPublishedSongs:', error.message); return []; }
  return (data ?? []).map(fromDb);
}

export async function getPublicSongBySlug(slug: string): Promise<PublicSong | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('slug', slug)
    .eq('is_published', true)
    .single();
  if (error) return null;
  return fromDb(data);
}

// Published songs sharing at least one genre with `genres`, excluding `excludeSlug`.
// Used for "related songs" cross-linking — includes both curated and community songs.
export async function getRelatedPublicSongs(excludeSlug: string, genres: string[], limit = 3): Promise<PublicSong[]> {
  if (!supabase || genres.length === 0) return [];
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('is_published', true)
    .neq('slug', excludeSlug)
    .overlaps('genre', genres)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) { console.error('getRelatedPublicSongs:', error.message); return []; }
  return (data ?? []).map(fromDb);
}

export async function getMyDraftSongs(): Promise<PublicSong[]> {
  const userId = await ensureAuth();
  if (!supabase || !userId) return [];
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('created_by', userId)
    .order('created_at', { ascending: false });
  if (error) { console.error('getMyDraftSongs:', error.message); return []; }
  return (data ?? []).map(fromDb);
}

export async function savePublicSong(song: Omit<PublicSong, 'id' | 'created_by' | 'created_at' | 'updated_at'>): Promise<PublicSong | null> {
  const userId = await ensureAuth();
  if (!supabase || !userId) return null;
  const { data, error } = await supabase
    .from(TABLE)
    .insert(toDb({ ...song, created_by: userId }))
    .select()
    .single();
  if (error) { console.error('savePublicSong:', error.message); return null; }
  return fromDb(data);
}

export async function updatePublicSong(id: string, updates: Partial<PublicSong>): Promise<boolean> {
  const payload = toDb(updates);

  // On localhost, use admin route that holds the service key server-side (bypasses RLS)
  if (typeof window !== 'undefined' &&
      ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)) {
    try {
      const res = await fetch('/api/admin/update-song/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, payload }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        console.error('updatePublicSong (admin):', body.error ?? res.status);
        return false;
      }
      return true;
    } catch (e) {
      console.error('updatePublicSong (admin) fetch failed:', e);
      return false;
    }
  }

  if (!supabase) return false;
  const { data, error } = await supabase
    .from(TABLE)
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) { console.error('updatePublicSong error:', error.message); return false; }
  return !!data;
}

// Upsert by slug — creates if new, updates if already exists (for from-static flow)
export async function upsertPublicSongBySlug(
  slug: string,
  song: Omit<PublicSong, 'id' | 'created_by' | 'created_at' | 'updated_at'>,
): Promise<PublicSong | null> {
  const userId = await ensureAuth();
  if (!supabase || !userId) return null;
  const { data, error } = await supabase
    .from(TABLE)
    .upsert(
      toDb({ ...song, slug, created_by: userId, updated_at: new Date().toISOString() }),
      { onConflict: 'slug', ignoreDuplicates: false },
    )
    .select()
    .single();
  if (error) { console.error('upsertPublicSong error:', error.message); return null; }
  if (!data) return null;
  // If the returned record belongs to a different user, RLS silently blocked the update
  // and Supabase returned the old row instead of actually updating it.
  if (data.created_by !== userId) {
    console.error('upsertPublicSong: RLS blocked update — record owned by different user');
    return null;
  }
  return fromDb(data);
}

export async function deletePublicSong(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) { console.error('deletePublicSong:', error.message); return false; }
  return true;
}

// Checks if a slug is already taken
export async function isSlugTaken(slug: string): Promise<boolean> {
  if (!supabase) return false;
  const { data } = await supabase.from(TABLE).select('id').eq('slug', slug).maybeSingle();
  return !!data;
}
