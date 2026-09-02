import { supabase, ensureAuth } from './supabase';
import { deleteSongAudio } from './songAudio';
import type { SongSection, AudioRange } from '@/data/songs';

export interface PublicSong {
  id: string;
  slug: string;
  title: string;
  artist: string;
  // Songwriter/composer, when different from the performing artist (covers). Falls back
  // to `artist` wherever composer is displayed or serialized — see supabase/migrations/
  // 20260731_add_composer_and_moderation.sql.
  composerName?: string;
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
  // Vocal/reference recording shared by the whole song — see supabase/migrations/
  // 20260723_song_audio_track.sql. Stored as flat audio_url/audio_path/
  // audio_whole_start_sec/audio_whole_end_sec columns; fromDb/toDb translate to/from
  // these nested shapes, same pattern as related_progressions <-> relatedProgressions.
  audioTrack?: { url: string; path: string };
  audioWholeRange?: AudioRange;
  created_by?: string;
  is_published: boolean;
  // Post-publish moderation (see 20260731_add_composer_and_moderation.sql) — set only via
  // src/pages/api/report-song, read only by the localhost-only admin review list.
  reportCount?: number;
  reportedAt?: string;
  reportReason?: string;
  created_at?: string;
  updated_at?: string;
}

const TABLE = 'public_songs';

// The DB column is related_progressions (snake_case); the app uses relatedProgressions (camelCase).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromDb(row: any): PublicSong {
  const {
    related_progressions, audio_url, audio_path, audio_whole_start_sec, audio_whole_end_sec,
    composer_name, report_count, reported_at, report_reason, ...rest
  } = row;
  return {
    ...rest,
    relatedProgressions: related_progressions ?? [],
    audioTrack: audio_url && audio_path ? { url: audio_url, path: audio_path } : undefined,
    audioWholeRange: audio_whole_start_sec != null && audio_whole_end_sec != null
      ? { startSec: audio_whole_start_sec, endSec: audio_whole_end_sec }
      : undefined,
    composerName: composer_name ?? undefined,
    reportCount: report_count ?? 0,
    reportedAt: reported_at ?? undefined,
    reportReason: report_reason ?? undefined,
  } as PublicSong;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toDb(song: Record<string, any>): Record<string, any> {
  const { relatedProgressions, audioTrack, audioWholeRange, composerName, ...rest } = song;
  const out = { ...rest };
  if (relatedProgressions !== undefined) out.related_progressions = relatedProgressions;
  // `null` (not just an omitted key) explicitly clears the columns — callers that mean
  // to remove the audio track must pass `audioTrack: null`, not leave the key out.
  if (audioTrack !== undefined) {
    out.audio_url = audioTrack?.url ?? null;
    out.audio_path = audioTrack?.path ?? null;
  }
  if (audioWholeRange !== undefined) {
    out.audio_whole_start_sec = audioWholeRange?.startSec ?? null;
    out.audio_whole_end_sec = audioWholeRange?.endSec ?? null;
  }
  if (composerName !== undefined) out.composer_name = composerName || null;
  return out;
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
//
// Pulls a wide candidate pool (up to 30) and picks `limit` at random from it, rather than
// always the `limit` newest (the old `order('created_at', {ascending:false}).limit(limit)`).
// With "newest wins", every song's related list is always the same 3 latest same-genre
// songs — as the catalogue grows, older songs stop being the newest-in-genre anywhere and
// never appear as a "related" link again, from any page. Confirmed as the root cause of
// several 2-3 month old community songs sitting at 0 referring URLs in GSC (2026-09-02
// sitemap audit) despite live, indexable pages. Random sampling on every request (this
// route is SSR, output:'server', no build-time caching) means a different trio surfaces
// across requests/crawls, so every song in a genre eventually gets linked from somewhere.
export async function getRelatedPublicSongs(excludeSlug: string, genres: string[], limit = 3): Promise<PublicSong[]> {
  if (!supabase || genres.length === 0) return [];
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('is_published', true)
    .neq('slug', excludeSlug)
    .overlaps('genre', genres)
    .limit(30);
  if (error) { console.error('getRelatedPublicSongs:', error.message); return []; }
  const pool = (data ?? []).map(fromDb);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, limit);
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

// `id` is optional and, when passed, is used as-is for the insert — lets the caller
// mint a stable id client-side (crypto.randomUUID()) ahead of the first save, so
// storage paths uploaded before this point (see songAudio.ts) end up matching the
// song's real row id instead of needing a separate reconciliation step.
export async function savePublicSong(song: Omit<PublicSong, 'id' | 'created_by' | 'created_at' | 'updated_at'> & { id?: string }): Promise<PublicSong | null> {
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

// Upsert by slug — creates if new, updates if already exists (for from-static flow).
// `id` is only actually used on the create path — an existing row keeps its own id
// regardless of what's passed (Postgres upsert never overwrites the conflict key's row
// id), so passing a client-generated id here is safe even when a community version
// already exists at that slug.
export async function upsertPublicSongBySlug(
  slug: string,
  song: Omit<PublicSong, 'id' | 'created_by' | 'created_at' | 'updated_at'> & { id?: string },
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
  // Fetch the audio path first — once the row is gone there's no other way to find
  // which Storage object (if any) belonged to it, and it'd be orphaned forever.
  const { data: existing } = await supabase.from(TABLE).select('audio_path').eq('id', id).maybeSingle();
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) { console.error('deletePublicSong:', error.message); return false; }
  if (existing?.audio_path) await deleteSongAudio(existing.audio_path);
  return true;
}

// Checks if a slug is already taken
export async function isSlugTaken(slug: string): Promise<boolean> {
  if (!supabase) return false;
  const { data } = await supabase.from(TABLE).select('id').eq('slug', slug).maybeSingle();
  return !!data;
}
