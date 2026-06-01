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

export async function getPublishedSongs(): Promise<PublicSong[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('is_published', true)
    .order('created_at', { ascending: false });
  if (error) { console.error('getPublishedSongs:', error.message); return []; }
  return data ?? [];
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
  return data;
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
  return data ?? [];
}

export async function savePublicSong(song: Omit<PublicSong, 'id' | 'created_by' | 'created_at' | 'updated_at'>): Promise<PublicSong | null> {
  const userId = await ensureAuth();
  if (!supabase || !userId) return null;
  const { data, error } = await supabase
    .from(TABLE)
    .insert({ ...song, created_by: userId })
    .select()
    .single();
  if (error) { console.error('savePublicSong:', error.message); return null; }
  return data;
}

export async function updatePublicSong(id: string, updates: Partial<PublicSong>): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from(TABLE)
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) { console.error('updatePublicSong:', error.message); return false; }
  return true;
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
