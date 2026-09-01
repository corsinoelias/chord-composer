// Data access for Chord Sheet Maker — its own table (chord_sheets), independent of
// public_songs. See supabase/migrations/<date>_chord_sheets.sql for the schema and RLS.
// Mirrors the shape of src/lib/publicSongs.ts on purpose (same fromDb/toDb pattern, same
// auth-gating via ensureAuth) without sharing any data with it: a chart made here has no
// bpm, no rhythm style, no synced playback — it's a plain print/read chord chart.
import { supabase, ensureAuth } from './supabase';

export interface ChordSheet {
  id: string;
  slug: string;
  title: string;
  artist: string;
  baseKey: string;
  capo?: number;
  /** Raw ChordPro source — see src/lib/chordSheet/chordSheetCore.ts. */
  text: string;
  /** Presentation only: instrument, chart notation, and (from Phase C) style/font/paper. */
  layout: Record<string, unknown>;
  created_by?: string;
  is_published: boolean;
  created_at?: string;
  updated_at?: string;
}

const TABLE = 'chord_sheets';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromDb(row: any): ChordSheet {
  const { base_key, ...rest } = row;
  return { ...rest, baseKey: base_key, layout: row.layout ?? {} } as ChordSheet;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toDb(sheet: Record<string, any>): Record<string, any> {
  const { baseKey, ...rest } = sheet;
  const out = { ...rest };
  if (baseKey !== undefined) out.base_key = baseKey;
  return out;
}

export async function getPublishedChordSheets(): Promise<ChordSheet[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('is_published', true)
    .order('created_at', { ascending: false });
  if (error) { console.error('getPublishedChordSheets:', error.message); return []; }
  return (data ?? []).map(fromDb);
}

export async function getChordSheetBySlug(slug: string): Promise<ChordSheet | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('slug', slug)
    .eq('is_published', true)
    .maybeSingle();
  if (error || !data) return null;
  return fromDb(data);
}

export async function getMyChordSheets(): Promise<ChordSheet[]> {
  const userId = await ensureAuth();
  if (!supabase || !userId) return [];
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('created_by', userId)
    .order('created_at', { ascending: false });
  if (error) { console.error('getMyChordSheets:', error.message); return []; }
  return (data ?? []).map(fromDb);
}

// Resumes editing a private draft — getChordSheetBySlug only returns published rows.
// Scoped to created_by so an id can never leak another user's unpublished chart.
export async function getMyChordSheetById(id: string): Promise<ChordSheet | null> {
  const userId = await ensureAuth();
  if (!supabase || !userId) return null;
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('id', id)
    .eq('created_by', userId)
    .maybeSingle();
  if (error || !data) return null;
  return fromDb(data);
}

export async function saveChordSheet(
  sheet: Omit<ChordSheet, 'id' | 'created_by' | 'created_at' | 'updated_at'>,
): Promise<ChordSheet | null> {
  const userId = await ensureAuth();
  if (!supabase || !userId) return null;
  const { data, error } = await supabase
    .from(TABLE)
    .insert(toDb({ ...sheet, created_by: userId }))
    .select()
    .single();
  if (error) { console.error('saveChordSheet:', error.message); return null; }
  return fromDb(data);
}

export async function updateChordSheet(id: string, updates: Partial<ChordSheet>): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase
    .from(TABLE)
    .update({ ...toDb(updates), updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) { console.error('updateChordSheet:', error.message); return false; }
  return !!data;
}

export async function deleteChordSheet(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) { console.error('deleteChordSheet:', error.message); return false; }
  return true;
}
