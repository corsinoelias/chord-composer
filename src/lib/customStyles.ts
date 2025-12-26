/**
 * Custom Styles Storage
 * Manages user-created rhythm patterns stored in localStorage
 */

import { StylePattern } from './styles';

const STORAGE_KEY = 'custom_rhythm_styles';

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
