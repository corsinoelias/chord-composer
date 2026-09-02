import type { PageSize } from './presets';

// Real 96dpi page geometry for the Canva-style paginated preview (PaginatedPaper.tsx) —
// pages are laid out at their true physical size (in CSS px, 1in = 96px) so text wraps the
// same way it will on paper, then the whole card is scaled down to fit the viewport via
// useFitScale. Deliberately separate from print's own `@page { margin: 12mm }` rule (see
// ChordSheetMaker.tsx / ChordSheetView.tsx) — the two only need to look similar, not match
// exactly: print reflows through the browser's own page-break engine, this is a
// JS-measured on-screen approximation of the same document.
const MM_PER_IN = 25.4;
const DPI = 96;

export const PAGE_PX: Record<PageSize, { w: number; h: number }> = {
  letter: { w: Math.round(8.5 * DPI), h: Math.round(11 * DPI) },
  a4: { w: Math.round((210 / MM_PER_IN) * DPI), h: Math.round((297 / MM_PER_IN) * DPI) },
};

export const PAGE_PAD_X = 64;
export const PAGE_PAD_Y = 72;
export const PAGE_GAP = 40;
