import { supabase, ensureAuth } from './supabase';
import type { Song } from './songs';
import { generateSongId, migrateLegacySong } from './songs';

export async function getSongsFromCloud(): Promise<Song[]> {
  const userId = await ensureAuth();
  if (!supabase || !userId) return [];
  const { data, error } = await supabase
    .from('progressions')
    .select('data')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) {
    console.error('Cloud getSongs error:', error.message);
    return [];
  }
  return (data ?? []).map(row => migrateLegacySong(row.data));
}

export async function getSongFromCloud(id: string): Promise<Song | null> {
  if (!supabase) return null;
  await ensureAuth();
  const { data, error } = await supabase
    .from('progressions')
    .select('data')
    .eq('id', id)
    .single();
  if (error) return null;
  return data ? migrateLegacySong(data.data) : null;
}

export interface SongForViewer {
  song: Song;
  /** False when the song was opened from someone else's share link (or logged out). */
  isOwner: boolean;
  isPublic: boolean;
}

/**
 * Like getSongFromCloud, but also reports whether the current visitor owns the row.
 * The editor needs that distinction: a non-owner must never end up with the song's id
 * in `currentSongId`, because autosave is keyed on it and would try to write back to
 * the owner's row. RLS would reject that write anyway — this keeps it from ever being
 * attempted, and lets the UI offer a copy instead of failing silently.
 */
export async function getSongForViewer(id: string): Promise<SongForViewer | null> {
  if (!supabase) return null;
  const userId = await ensureAuth();
  const { data, error } = await supabase
    .from('progressions')
    .select('data, user_id, is_public')
    .eq('id', id)
    .single();
  if (error || !data) return null;
  return {
    song: migrateLegacySong(data.data),
    isOwner: !!userId && data.user_id === userId,
    isPublic: !!data.is_public,
  };
}

/** Opt a song in/out of being readable via its /chord-player/<id> link. Owner only. */
export async function setSongVisibility(id: string, isPublic: boolean): Promise<boolean> {
  const userId = await ensureAuth();
  if (!supabase || !userId) return false;
  const { data, error } = await supabase
    .from('progressions')
    .update({ is_public: isPublic })
    .eq('id', id)
    .eq('user_id', userId)
    .select('id')
    .maybeSingle();
  if (error) {
    console.error('Cloud setSongVisibility error:', error.message);
    return false;
  }
  return !!data;
}

export async function saveSongToCloud(song: Song): Promise<void> {
  const userId = await ensureAuth();
  if (!supabase || !userId) return;
  const { error } = await supabase.from('progressions').upsert({
    id: song.id,
    user_id: userId,
    data: song,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    console.error('Cloud saveSong error:', error.message);
  }
}

export async function deleteSongFromCloud(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('progressions').delete().eq('id', id);
  if (error) {
    console.error('Cloud deleteSong error:', error.message);
  }
}

export async function duplicateSongInCloud(id: string): Promise<Song | null> {
  const original = await getSongFromCloud(id);
  if (!original) return null;
  const duplicate: Song = {
    ...original,
    id: generateSongId(),
    title: `${original.title} (Copy)`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await saveSongToCloud(duplicate);
  return duplicate;
}

export async function migrateSongsToCloud(songs: Song[]): Promise<void> {
  const userId = await ensureAuth();
  if (!supabase || !userId || songs.length === 0) return;
  const { data: existing } = await supabase
    .from('progressions')
    .select('id')
    .eq('user_id', userId);
  const existingIds = new Set((existing ?? []).map((r: { id: string }) => r.id));
  const toMigrate = songs.filter(s => !existingIds.has(s.id));
  if (toMigrate.length === 0) return;
  const { error } = await supabase.from('progressions').insert(
    toMigrate.map(s => ({
      id: s.id,
      user_id: userId,
      data: s,
      updated_at: s.updatedAt,
    }))
  );
  if (error) {
    console.error('Cloud migration error:', error.message);
  }
}
