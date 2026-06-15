import { supabase, ensureAuth } from './supabase';
import type { StylePattern } from './styles';

interface UserSettings {
  customStyles: StylePattern[];
  styleOverrides: Record<string, StylePattern>;
}

// localStorage is the primary store.
// On first load (no local data), we attempt a one-time migration from Supabase.
const LOCAL_KEY = 'chordplayer_settings_v1';

// ---------- localStorage helpers ----------

function readLocal(): UserSettings | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) {
      console.log('[SETTINGS] localStorage: no data found');
      return null;
    }
    const parsed = JSON.parse(raw) as UserSettings;
    const overrideKeys = Object.keys(parsed.styleOverrides ?? {});
    console.log(
      `[SETTINGS] localStorage: loaded — customStyles: ${parsed.customStyles?.length ?? 0}, overrides: [${overrideKeys.join(', ') || 'none'}]`,
    );
    return parsed;
  } catch (err) {
    console.warn('[SETTINGS] localStorage: parse error:', err);
    return null;
  }
}

function writeLocal(settings: UserSettings): void {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(settings));
    const overrideKeys = Object.keys(settings.styleOverrides ?? {});
    console.log(
      `[SETTINGS] localStorage: saved — customStyles: ${settings.customStyles?.length ?? 0}, overrides: [${overrideKeys.join(', ') || 'none'}]`,
    );
  } catch (err) {
    console.warn('[SETTINGS] localStorage: write error:', err);
  }
}

// ---------- One-time Supabase migration ----------

async function tryMigrateFromSupabase(): Promise<UserSettings | null> {
  if (!supabase) {
    console.log('[SETTINGS] Supabase not configured — skipping migration');
    return null;
  }
  console.log('[SETTINGS] Trying Supabase migration…');
  try {
    const userId = await ensureAuth();
    if (!userId) {
      console.warn('[SETTINGS] Migration skipped — no auth user_id');
      return null;
    }
    const { data, error } = await supabase
      .from('user_settings')
      .select('custom_styles, style_overrides')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.warn('[SETTINGS] Supabase migration query error:', error.message);
    }

    if (data) {
      const settings: UserSettings = {
        customStyles: (data.custom_styles ?? []) as StylePattern[],
        styleOverrides: (data.style_overrides ?? {}) as Record<string, StylePattern>,
      };
      const overrideKeys = Object.keys(settings.styleOverrides);
      console.log(
        `[SETTINGS] Supabase migration success (user_id: ${userId}) — customStyles: ${settings.customStyles.length}, overrides: [${overrideKeys.join(', ') || 'none'}]`,
      );
      return settings;
    }

    console.log(`[SETTINGS] Supabase: no row for user_id: ${userId}`);
  } catch (err) {
    console.warn('[SETTINGS] Migration error:', err);
  }
  return null;
}

// ---------- Public API ----------

export async function getUserSettings(): Promise<UserSettings> {
  console.log('[SETTINGS] getUserSettings called');

  const local = readLocal();
  if (local) return local;

  // No local data — try migrating from Supabase.
  // Always runs when there's no local data (flag-free: once we write to localStorage, fast path is used).
  const migrated = await tryMigrateFromSupabase();
  const result = migrated ?? { customStyles: [], styleOverrides: {} };

  // Write to localStorage (even if empty) so future calls use the fast path.
  writeLocal(result);
  return result;
}

export async function saveUserSettings(settings: Partial<UserSettings>): Promise<void> {
  const current = readLocal() ?? { customStyles: [], styleOverrides: {} };
  const merged: UserSettings = {
    customStyles: settings.customStyles ?? current.customStyles,
    styleOverrides: settings.styleOverrides ?? current.styleOverrides,
  };
  writeLocal(merged);
}
