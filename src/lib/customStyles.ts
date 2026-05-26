import type { StylePattern } from './styles';
import { getUserSettings, saveUserSettings } from './userSettings';

// In-memory cache — loaded once via initCustomStylesCache()
let _customStyles: StylePattern[] = [];
let _styleOverrides: Record<string, StylePattern> = {};

export async function initCustomStylesCache(): Promise<{
  customStyles: StylePattern[];
  styleOverrides: Record<string, StylePattern>;
}> {
  const settings = await getUserSettings();
  _customStyles = settings.customStyles;
  _styleOverrides = settings.styleOverrides;
  return settings;
}

// ==================== CUSTOM STYLES ====================

export function getCustomStyles(): StylePattern[] {
  return [..._customStyles];
}

export async function saveCustomStyle(style: StylePattern): Promise<void> {
  const existing = _customStyles.findIndex(s => s.id === style.id);
  if (existing >= 0) {
    _customStyles[existing] = style;
  } else {
    _customStyles.push(style);
  }
  await saveUserSettings({ customStyles: _customStyles });
}

export async function deleteCustomStyle(styleId: string): Promise<void> {
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
  return _styleOverrides[originalId] ?? null;
}

export async function saveStyleOverride(originalId: string, style: StylePattern): Promise<void> {
  _styleOverrides[originalId] = style;
  await saveUserSettings({ styleOverrides: _styleOverrides });
}

export async function deleteStyleOverride(originalId: string): Promise<void> {
  delete _styleOverrides[originalId];
  await saveUserSettings({ styleOverrides: _styleOverrides });
}

export function hasStyleOverride(originalId: string): boolean {
  return originalId in _styleOverrides;
}
