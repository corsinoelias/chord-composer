/**
 * Chord Charts — Supabase CRUD
 *
 * Table: chord_charts
 * Columns: id (uuid), user_id (uuid), title, artist, key, capo, bpm, style,
 *          sections (jsonb), is_public (bool), created_at, updated_at
 */

import { supabase, ensureAuth } from './supabase';

export interface ChordChartSection {
  id: string;
  name: string;
  lines: string[]; // "[Chord]lyrics" notation
}

export interface ChordChart {
  id: string;
  user_id?: string;
  title: string;
  artist: string;
  key: string;
  capo: number | null;
  bpm: number;
  style: string;
  sections: ChordChartSection[];
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export type ChordChartInput = Omit<ChordChart, 'id' | 'user_id' | 'created_at' | 'updated_at'>;

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getMyChordCharts(): Promise<ChordChart[]> {
  const userId = await ensureAuth();
  if (!supabase || !userId) return [];
  const { data, error } = await supabase
    .from('chord_charts')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) { console.error('getMyChordCharts:', error.message); return []; }
  return data ?? [];
}

export async function getChordChart(id: string): Promise<ChordChart | null> {
  if (!supabase) return null;
  await ensureAuth();
  const { data, error } = await supabase
    .from('chord_charts')
    .select('*')
    .eq('id', id)
    .single();
  if (error) { console.error('getChordChart:', error.message); return null; }
  return data;
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createChordChart(input: ChordChartInput): Promise<ChordChart | null> {
  const userId = await ensureAuth();
  if (!supabase || !userId) return null;
  const { data, error } = await supabase
    .from('chord_charts')
    .insert({ ...input, user_id: userId })
    .select()
    .single();
  if (error) { console.error('createChordChart:', error.message); return null; }
  return data;
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function updateChordChart(id: string, input: Partial<ChordChartInput>): Promise<ChordChart | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('chord_charts')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) { console.error('updateChordChart:', error.message); return null; }
  return data;
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteChordChart(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('chord_charts').delete().eq('id', id);
  if (error) { console.error('deleteChordChart:', error.message); return false; }
  return true;
}

// ─── Upsert (create-or-update) used by auto-save ─────────────────────────────

export async function upsertChordChart(chart: Omit<ChordChart, 'user_id' | 'created_at' | 'updated_at'>): Promise<ChordChart | null> {
  const userId = await ensureAuth();
  if (!supabase || !userId) return null;
  const { data, error } = await supabase
    .from('chord_charts')
    .upsert({ ...chart, user_id: userId, updated_at: new Date().toISOString() })
    .select()
    .single();
  if (error) { console.error('upsertChordChart:', error.message); return null; }
  return data;
}
