import type { StylePattern } from './styles';
import { getUserSettings, saveUserSettings, syncUserSettings } from './userSettings';
import { supabase } from './supabase';

// In-memory cache — loaded once via initCustomStylesCache()
let _customStyles: StylePattern[] = [];
let _styleOverrides: Record<string, StylePattern> = {};

export async function initCustomStylesCache(): Promise<{
  customStyles: StylePattern[];
  styleOverrides: Record<string, StylePattern>;
}> {
  console.log('[STYLES] initCustomStylesCache — loading settings…');
  const settings = await getUserSettings();
  _customStyles = settings.customStyles;
  _styleOverrides = settings.styleOverrides;

  const overrideKeys = Object.keys(_styleOverrides);
  console.log(
    `[STYLES] Cache ready — customStyles: ${_customStyles.length}, overrides: [${overrideKeys.join(', ')}]`,
  );
  overrideKeys.forEach(key => {
    const ov = _styleOverrides[key];
    const melodicBass = (ov as StylePattern & { melodic?: { bass?: { variations?: unknown[] } } }).melodic?.bass?.variations?.length ?? 0;
    const melodicPiano = (ov as StylePattern & { melodic?: { piano?: { variations?: unknown[] } } }).melodic?.piano?.variations?.length ?? 0;
    const melodicGuitar = (ov as StylePattern & { melodic?: { guitar?: { variations?: unknown[] } } }).melodic?.guitar?.variations?.length ?? 0;
    console.log(`[STYLES]   override["${key}"] — bpm: ${ov.bpm}, melodic bass:${melodicBass} piano:${melodicPiano} guitar:${melodicGuitar}`);
  });

  return { customStyles: _customStyles, styleOverrides: _styleOverrides };
}

// Cloud sync (userSettings.ts) can bring styles saved on another device. When it does, the
// cache takes them and the editor hears about it through the event it already listens to.
function adoptSynced(settings: { customStyles: StylePattern[]; styleOverrides: Record<string, StylePattern> }) {
  _customStyles = settings.customStyles;
  _styleOverrides = settings.styleOverrides;
  window.dispatchEvent(new Event('customStylesChanged'));
}

if (typeof window !== 'undefined') {
  window.addEventListener('userSettingsSynced', (e) => adoptSynced((e as CustomEvent).detail));
  // Logging in mid-session: merge this browser's rhythms with the account's right away.
  supabase?.auth.onAuthStateChange((event) => {
    if (event !== 'SIGNED_IN') return;
    void syncUserSettings().then((merged) => { if (merged) adoptSynced(merged); });
  });
}

// ==================== CUSTOM STYLES ====================

export function getCustomStyles(): StylePattern[] {
  return [..._customStyles];
}

export async function saveCustomStyle(style: StylePattern): Promise<void> {
  console.log(`[STYLES] saveCustomStyle — id: ${style.id}`);
  const existing = _customStyles.findIndex(s => s.id === style.id);
  if (existing >= 0) {
    _customStyles[existing] = style;
  } else {
    _customStyles.push(style);
  }
  await saveUserSettings({ customStyles: _customStyles });
}

export async function deleteCustomStyle(styleId: string): Promise<void> {
  console.log(`[STYLES] deleteCustomStyle — id: ${styleId}`);
  _customStyles = _customStyles.filter(s => s.id !== styleId);
  await saveUserSettings({ customStyles: _customStyles });
}

export function isCustomStyle(styleId: string): boolean {
  return styleId.startsWith('custom_');
}

export function generateCustomStyleId(): string {
  return `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ==================== OVERRIDES SYSTEM ====================

export interface StyleOverride {
  originalId: string;
  customStyle: StylePattern;
}

export function getStyleOverrides(): Record<string, StylePattern> {
  return { ..._styleOverrides };
}

export function getStyleOverride(originalId: string): StylePattern | null {
  const ov = _styleOverrides[originalId] ?? null;
  if (ov) {
    console.log(`[STYLES] getStyleOverride("${originalId}") — found override`);
  }
  return ov;
}

export async function saveStyleOverride(originalId: string, style: StylePattern): Promise<void> {
  console.log(`[STYLES] saveStyleOverride("${originalId}") — bpm: ${style.bpm}`);
  _styleOverrides[originalId] = style;
  await saveUserSettings({ styleOverrides: _styleOverrides });
}

export async function deleteStyleOverride(originalId: string): Promise<void> {
  console.log(`[STYLES] deleteStyleOverride("${originalId}")`);
  delete _styleOverrides[originalId];
  await saveUserSettings({ styleOverrides: _styleOverrides });
}

export function hasStyleOverride(originalId: string): boolean {
  return originalId in _styleOverrides;
}
