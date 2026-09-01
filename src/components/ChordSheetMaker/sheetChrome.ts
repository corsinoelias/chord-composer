import type { CSSProperties } from 'react';
import { FAMILIES, BASE_SIZE, PRESETS, type StyleLayout, type FontRoleName } from '@/lib/chordSheet/presets';

// Pure presentation helpers shared by the read-only chart (SheetPaper) and the editor's
// interactive preview (InteractiveSheet) — kept out of the .tsx so both files can pull
// them in without tripping react-refresh's "components only" rule.

export function makeRoleStyle(layout: StyleLayout) {
  return (role: FontRoleName): CSSProperties => {
    const f = layout.fonts[role];
    return {
      fontFamily: FAMILIES[f.family],
      fontWeight: f.bold ? 700 : 400,
      fontSize: (BASE_SIZE[role] * (f.scale / 100) * (layout.scale / 100)).toFixed(1) + 'px',
      color: f.color,
    };
  };
}

export function presetPaper(layout: StyleLayout): string { return PRESETS[layout.preset].paper; }
export function presetRule(layout: StyleLayout): string { return PRESETS[layout.preset].rule; }
export function presetMeta(layout: StyleLayout): string { return PRESETS[layout.preset].meta; }

export const PAPER_MAX_WIDTH: Record<StyleLayout['pageSize'], number> = { letter: 680, a4: 660 };

export const JUSTIFY: Record<StyleLayout['align'], string> = { left: 'flex-start', center: 'center', right: 'flex-end' };
