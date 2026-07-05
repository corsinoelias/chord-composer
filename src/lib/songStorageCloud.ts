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
