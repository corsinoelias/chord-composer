import { supabase, ensureAuth } from './supabase';
import type { StylePattern } from './styles';

interface UserSettings {
  customStyles: StylePattern[];
  styleOverrides: Record<string, StylePattern>;
}

export async function getUserSettings(): Promise<UserSettings> {
  const userId = await ensureAuth();
  if (!supabase || !userId) return { customStyles: [], styleOverrides: {} };
  const { data } = await supabase
    .from('user_settings')
    .select('custom_styles, style_overrides')
    .eq('user_id', userId)
    .single();
  return {
    customStyles: (data?.custom_styles ?? []) as StylePattern[],
    styleOverrides: (data?.style_overrides ?? {}) as Record<string, StylePattern>,
  };
}

export async function saveUserSettings(settings: Partial<UserSettings>): Promise<void> {
  const userId = await ensureAuth();
  if (!supabase || !userId) return;
  await supabase.from('user_settings').upsert({
    user_id: userId,
    ...(settings.customStyles !== undefined && { custom_styles: settings.customStyles }),
    ...(settings.styleOverrides !== undefined && { style_overrides: settings.styleOverrides }),
    updated_at: new Date().toISOString(),
  });
}
