/**
 * Custom Styles Storage
 * Manages user-created rhythm patterns stored in localStorage
 */

import { StylePattern } from './styles';

const STORAGE_KEY = 'custom_rhythm_styles';
const OVERRIDES_KEY = 'style_overrides';

/**
 * Get all custom styles from localStorage
 */
export function getCustomStyles(): StylePattern[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

/**
 * Save a custom style
 * If a style with the same ID exists, it will be updated
 */
export function saveCustomStyle(style: StylePattern): void {
  const styles = getCustomStyles();
  const existingIndex = styles.findIndex(s => s.id === style.id);
  
  if (existingIndex >= 0) {
    styles[existingIndex] = style;
  } else {
    styles.push(style);
  }
  
  localStorage.setItem(STORAGE_KEY, JSON.stringify(styles));
}

/**
 * Delete a custom style by ID
 */
export function deleteCustomStyle(styleId: string): void {
  const styles = getCustomStyles();
  const filtered = styles.filter(s => s.id !== styleId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}

/**
 * Check if a style is custom (not built-in)
 */
export function isCustomStyle(styleId: string): boolean {
  return styleId.startsWith('custom_');
}

/**
 * Generate a unique ID for a new custom style
 */
export function generateCustomStyleId(): string {
  return `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ==================== OVERRIDES SYSTEM ====================

export interface StyleOverride {
  originalId: string;
  customStyle: StylePattern;
}

/**
 * Get all style overrides from localStorage
 */
export function getStyleOverrides(): Record<string, StylePattern> {
  try {
    const stored = localStorage.getItem(OVERRIDES_KEY);
    if (!stored) return {};
    return JSON.parse(stored);
  } catch {
    return {};
  }
}

/**
 * Get override for a specific original style
 */
export function getStyleOverride(originalId: string): StylePattern | null {
  const overrides = getStyleOverrides();
  return overrides[originalId] || null;
}

/**
 * Save an override for an original style
 */
export function saveStyleOverride(originalId: string, style: StylePattern): void {
  const overrides = getStyleOverrides();
  overrides[originalId] = style;
  localStorage.setItem(OVERRIDES_KEY, JSON.stringify(overrides));
}

/**
 * Delete an override (reset to original)
 */
export function deleteStyleOverride(originalId: string): void {
  const overrides = getStyleOverrides();
  delete overrides[originalId];
  localStorage.setItem(OVERRIDES_KEY, JSON.stringify(overrides));
}

/**
 * Check if an original style has an override
 */
export function hasStyleOverride(originalId: string): boolean {
  const overrides = getStyleOverrides();
  return originalId in overrides;
}
