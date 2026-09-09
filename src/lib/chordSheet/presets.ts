// Style presets for the printed/rendered chart — ported from the design's PRESETS table
// (Chord Sheet Maker A v6.dc.html). These are deliberately literal colors, not the site's
// --primary/--card tokens: a chart's paper is content the user prints or shares, not app
// chrome, so "Stage" stays a dark page and "Handout" stays cream-colored regardless of
// whether the visitor's browser is in light or dark mode — same reasoning PrintChordSheet
// .astro uses literal ink/paper colors instead of theme tokens.
export type FontRoleName = 'heading' | 'section' | 'chords' | 'lyrics';
export type FontFamily = 'sans' | 'serif' | 'mono' | 'hand';
export type PresetId = 'classic' | 'modern' | 'compact' | 'dark' | 'handout';
export type PageSize = 'letter' | 'a4';
export type Alignment = 'left' | 'center' | 'right';
export type DiagramSpot = 'top' | 'bottom' | 'none';

export interface FontRole {
  family: FontFamily;
  /** Percent of BASE_SIZE[role], e.g. 100 = default size for that role. */
  scale: number;
  bold: boolean;
  color: string;
}

export interface Preset {
  label: string;
  paper: string;
  ink: string;
  meta: string;
  rule: string;
  columns: 1 | 2;
  scale: number;
  fonts: Record<FontRoleName, FontRole>;
}

export const FAMILIES: Record<FontFamily, string> = {
  sans: "'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif",
  serif: "'Lora', ui-serif, Georgia, serif",
  mono: "'Space Mono', ui-monospace, Menlo, monospace",
  hand: "'Caveat', ui-rounded, cursive",
};

// Base pixel size for each role at scale 100 / global scale 100.
export const BASE_SIZE: Record<FontRoleName, number> = {
  heading: 26, section: 12, chords: 13, lyrics: 16,
};

export const PRESETS: Record<PresetId, Preset> = {
  classic: {
    label: 'Classic', paper: '#ffffff', ink: '#111111', meta: 'hsl(220 10% 42%)', rule: 'hsl(220 13% 87%)',
    columns: 1, scale: 100,
    fonts: {
      heading: { family: 'serif', scale: 100, bold: true, color: '#111111' },
      section: { family: 'sans', scale: 100, bold: true, color: 'hsl(262 83% 52%)' },
      chords: { family: 'mono', scale: 100, bold: true, color: 'hsl(262 83% 52%)' },
      lyrics: { family: 'sans', scale: 100, bold: false, color: '#111111' },
    },
  },
  modern: {
    label: 'Modern', paper: '#ffffff', ink: '#0d1117', meta: 'hsl(220 10% 45%)', rule: 'hsl(220 13% 88%)',
    columns: 1, scale: 105,
    fonts: {
      heading: { family: 'sans', scale: 115, bold: true, color: '#0d1117' },
      section: { family: 'sans', scale: 95, bold: true, color: 'hsl(220 10% 42%)' },
      chords: { family: 'sans', scale: 100, bold: true, color: 'hsl(262 83% 52%)' },
      lyrics: { family: 'sans', scale: 100, bold: false, color: '#0d1117' },
    },
  },
  compact: {
    label: 'Compact', paper: '#ffffff', ink: '#111111', meta: 'hsl(220 10% 45%)', rule: 'hsl(220 13% 88%)',
    columns: 2, scale: 82,
    fonts: {
      heading: { family: 'sans', scale: 90, bold: true, color: '#111111' },
      section: { family: 'sans', scale: 90, bold: true, color: 'hsl(262 83% 52%)' },
      chords: { family: 'mono', scale: 95, bold: true, color: 'hsl(262 83% 52%)' },
      lyrics: { family: 'sans', scale: 95, bold: false, color: '#111111' },
    },
  },
  dark: {
    label: 'Stage', paper: '#12141c', ink: '#f2f4f8', meta: 'hsl(220 10% 62%)', rule: 'hsl(224 15% 28%)',
    columns: 1, scale: 120,
    fonts: {
      heading: { family: 'sans', scale: 110, bold: true, color: '#f2f4f8' },
      section: { family: 'sans', scale: 95, bold: true, color: 'hsl(262 83% 72%)' },
      chords: { family: 'mono', scale: 105, bold: true, color: 'hsl(262 83% 72%)' },
      lyrics: { family: 'sans', scale: 100, bold: false, color: '#f2f4f8' },
    },
  },
  handout: {
    label: 'Handout', paper: '#fdfcf8', ink: '#1a1a17', meta: 'hsl(40 8% 42%)', rule: 'hsl(40 14% 82%)',
    columns: 1, scale: 128,
    fonts: {
      heading: { family: 'serif', scale: 110, bold: true, color: '#1a1a17' },
      section: { family: 'serif', scale: 100, bold: true, color: 'hsl(24 90% 40%)' },
      chords: { family: 'hand', scale: 155, bold: true, color: 'hsl(24 90% 40%)' },
      lyrics: { family: 'serif', scale: 100, bold: false, color: '#1a1a17' },
    },
  },
};

export const SWATCHES = [
  { value: '#111111', title: 'Ink' },
  { value: 'hsl(262 83% 52%)', title: 'Primary' },
  { value: 'hsl(220 10% 42%)', title: 'Muted' },
  { value: 'hsl(24 90% 45%)', title: 'Accent' },
  { value: '#ffffff', title: 'White' },
];

export const PAGE_SIZES: { value: PageSize; label: string; widthMm: number; heightMm: number }[] = [
  { value: 'letter', label: 'Letter', widthMm: 216, heightMm: 279 },
  { value: 'a4', label: 'A4', widthMm: 210, heightMm: 297 },
];

/** Logo/watermark images, stored inline as data URIs (downscaled client-side before
 *  saving — see imageAsset.ts) rather than in Supabase storage: a chart's `layout` is
 *  already one jsonb column, and this keeps a shared/forked chart's images copying with it
 *  automatically instead of needing their own storage-bucket lifecycle. */
export interface StyleAssets {
  logo?: string;
  /** px, height of the logo in the header. */
  logoH?: number;
  watermark?: string;
  /** 0-100, opacity of the watermark behind the content. */
  wmOpacity?: number;
  /** 0-100, watermark width as a percent of the page's content width. */
  wmScale?: number;
}

export interface StyleLayout {
  preset: PresetId;
  fonts: Record<FontRoleName, FontRole>;
  columns: 1 | 2;
  align: Alignment;
  scale: number;
  pageSize: PageSize;
  diagramSpot: DiagramSpot;
  assets: StyleAssets;
}

export function defaultLayout(preset: PresetId = 'classic'): StyleLayout {
  const p = PRESETS[preset];
  return {
    preset, fonts: clone(p.fonts), columns: p.columns, align: 'left',
    scale: p.scale, pageSize: 'letter', diagramSpot: 'top', assets: {},
  };
}

/** The Chord Sequence mark, served from public/ rather than inlined as a data URI like a
 *  user's own upload. It ships with the site, so there's nothing to copy along with a
 *  forked chart, and 54 KB of base64 in every row's `layout` jsonb would be pure waste. */
export const BRAND_LOGO = '/chordsequence-mark.png';
export const BRAND_LOGO_H = 70;

/** Layout for a BRAND-NEW sheet: the house default, plus the Chord Sequence mark.
 *
 *  Deliberately separate from defaultLayout(), which is ALSO the merge base in
 *  resolveStyleLayout below. Branding the merge base would resurrect the logo on every
 *  load for anyone who deleted it: StyleControls removes it with `{ logo: undefined }`,
 *  JSON.stringify drops undefined keys on save, and `{ ...base.assets, ...r.assets }`
 *  would then find no `logo` key to override the base with. A new-sheet default can't
 *  have that problem — it's applied once, at creation, and lives in the doc from then on. */
export function newSheetLayout(preset: PresetId = 'classic'): StyleLayout {
  const l = defaultLayout(preset);
  return { ...l, assets: { ...l.assets, logo: BRAND_LOGO, logoH: BRAND_LOGO_H } };
}

// Merges a persisted (possibly partial or pre-Phase-C) layout with preset defaults, so a
// chart saved before this shipped — or with only {instrument, chartType} — still renders.
export function resolveStyleLayout(raw: unknown): StyleLayout {
  const r = (raw ?? {}) as Partial<StyleLayout> & { preset?: PresetId };
  const preset: PresetId = r.preset && PRESETS[r.preset] ? r.preset : 'classic';
  const base = defaultLayout(preset);
  return {
    preset,
    fonts: {
      heading: { ...base.fonts.heading, ...r.fonts?.heading },
      section: { ...base.fonts.section, ...r.fonts?.section },
      chords: { ...base.fonts.chords, ...r.fonts?.chords },
      lyrics: { ...base.fonts.lyrics, ...r.fonts?.lyrics },
    },
    columns: r.columns === 2 ? 2 : r.columns === 1 ? 1 : base.columns,
    align: r.align === 'center' || r.align === 'right' ? r.align : 'left',
    scale: typeof r.scale === 'number' ? r.scale : base.scale,
    pageSize: r.pageSize === 'a4' ? 'a4' : 'letter',
    diagramSpot: r.diagramSpot === 'bottom' || r.diagramSpot === 'none' ? r.diagramSpot : 'top',
    assets: { ...base.assets, ...r.assets },
  };
}

function clone<T>(o: T): T {
  return JSON.parse(JSON.stringify(o));
}
