/**
 * A section's own version of a rhythm of the app's (appStyles.ts): what the rhythm editor
 * writes, and what the engine then plays in that section instead of the rhythm as written.
 *
 * The rule the app and the web share (docs/plan-paridad-web-app.md, D1): the rhythm is a
 * reference, and a section keeps a copy only of what was edited in it — a track at a time, and
 * the fill as a whole. Everything else keeps following the rhythm. Steps are the engine's own
 * packed values (native_audio.cpp), stored sparse ([step, value] pairs) so a song does not grow
 * by five tracks of 24 rows of 80 steps for a handful of changed hits.
 *
 * The shape maps one to one onto the app's Section (patterns + patternBars, alt for B,
 * SectionFill), for when the two share songs.
 */
import { type AppFill, type AppPatterns, type AppStyle, type AppVariation, appStepsPerBar } from './appStyles';
import { type Section } from './sections';

export const GROOVE_TRACKS = ['drums', 'piano', 'guitar', 'bass', 'synth'] as const;
export type GrooveTrack = (typeof GROOVE_TRACKS)[number];
export const MELODIC_GROOVE_TRACKS: GrooveTrack[] = ['piano', 'guitar', 'bass', 'synth'];

/** [step, packed] pairs, the steps that are not silent. */
export type SparseLane = [number, number][];

export interface GrooveTrackCopy {
  bars: 1 | 2 | 4;
  rows: Record<string, SparseLane>;
}

export interface GrooveVariation {
  tracks?: Partial<Record<GrooveTrack, GrooveTrackCopy>>;
  /** The fill as a whole, when it was edited. A lane present is a lane the fill rewrites. */
  fill?: { from: number; lanes: Record<string, SparseLane> };
}

export interface SectionGroove {
  /** The rhythm this copy was made from: it means nothing on another one. */
  styleId: string;
  a?: GrooveVariation;
  b?: GrooveVariation;
}

/** A variation spelled out in full: every row of every track as a lane of steps. What the editor edits. */
export interface DenseVariation {
  bars: Record<GrooveTrack, 1 | 2 | 4>;
  rows: Record<GrooveTrack, Record<string, number[]>>;
  fill: { from: number; lanes: Record<string, number[]> };
}

export type VariationKey = 'a' | 'b';

const barsOf = (n: number | undefined): 1 | 2 | 4 => ((n ?? 1) >= 4 ? 4 : (n ?? 1) >= 2 ? 2 : 1);
const fit = (lane: number[] | undefined, length: number) => {
  const out = new Array<number>(length).fill(0);
  lane?.forEach((v, i) => { if (i < length) out[i] = v | 0; });
  return out;
};
export const toSparse = (lane: number[]): SparseLane => lane.flatMap((v, i) => (v ? [[i, v] as [number, number]] : []));
export const fromSparse = (lane: SparseLane | undefined, length: number): number[] => {
  const out = new Array<number>(length).fill(0);
  lane?.forEach(([i, v]) => { if (i >= 0 && i < length) out[i] = v | 0; });
  return out;
};

function dense(patterns: AppPatterns, patternBars: Record<string, number>, fill: AppFill | undefined, spb: number): DenseVariation {
  const out: DenseVariation = {
    bars: {} as DenseVariation['bars'],
    rows: {} as DenseVariation['rows'],
    fill: { from: fill?.from ?? spb - 4, lanes: {} },
  };
  for (const track of GROOVE_TRACKS) {
    const bars = barsOf(patternBars[track]);
    out.bars[track] = bars;
    out.rows[track] = {};
    for (const [row, lane] of Object.entries(patterns[track] ?? {})) out.rows[track][row] = fit(lane, bars * spb);
    if (track !== 'drums' && !out.rows[track].lane) out.rows[track].lane = new Array(bars * spb).fill(0);
  }
  for (const [key, lane] of Object.entries(fill?.lanes ?? {})) out.fill.lanes[key] = fit(lane, spb);
  return out;
}

/** What the section plays in [v] before anything was edited: the rhythm's variation, or its intro or ending part. */
export function baseVariation(style: AppStyle, section: Pick<Section, 'stylePart'>, v: VariationKey): DenseVariation | null {
  const spb = appStepsPerBar(style);
  const part = section.stylePart?.styleId === style.id
    ? (section.stylePart.kind === 'intro' ? style.intro : style.ending)?.[section.stylePart.index]
    : undefined;
  // A part of an intro or an ending has one variation and no fill.
  if (part) return v === 'a' ? dense(part.patterns, part.patternBars, undefined, spb) : null;
  const variation: AppVariation | undefined = v === 'a' ? style.a : style.b;
  return variation ? dense(variation.patterns, variation.patternBars, variation.fill, spb) : null;
}

/** [base] with a section's edits of it laid over. */
export function withGroove(base: DenseVariation, edits: GrooveVariation | undefined, spb: number): DenseVariation {
  if (!edits) return base;
  const out: DenseVariation = { bars: { ...base.bars }, rows: { ...base.rows }, fill: base.fill };
  for (const track of GROOVE_TRACKS) {
    const copy = edits.tracks?.[track];
    if (!copy) continue;
    out.bars[track] = copy.bars;
    out.rows[track] = {};
    for (const [row, lane] of Object.entries(copy.rows)) out.rows[track][row] = fromSparse(lane, copy.bars * spb);
    if (track !== 'drums' && !out.rows[track].lane) out.rows[track].lane = new Array(copy.bars * spb).fill(0);
  }
  if (edits.fill) {
    out.fill = { from: edits.fill.from, lanes: {} };
    for (const [key, lane] of Object.entries(edits.fill.lanes)) out.fill.lanes[key] = fromSparse(lane, spb);
  }
  return out;
}

const sectionEdits = (style: AppStyle, section: Pick<Section, 'groove'>, v: VariationKey) =>
  section.groove?.styleId === style.id ? section.groove[v] : undefined;

/** What the section plays in [v]: the rhythm with this section's edits, or null when the rhythm has no such variation. */
export function effectiveVariation(style: AppStyle, section: Pick<Section, 'stylePart' | 'groove'>, v: VariationKey): DenseVariation | null {
  const base = baseVariation(style, section, v);
  return base ? withGroove(base, sectionEdits(style, section, v), appStepsPerBar(style)) : null;
}

const laneSame = (a: number[] | undefined, b: number[] | undefined) => {
  const n = Math.max(a?.length ?? 0, b?.length ?? 0);
  for (let i = 0; i < n; i++) if ((a?.[i] ?? 0) !== (b?.[i] ?? 0)) return false;
  return true;
};
function trackSame(a: DenseVariation, b: DenseVariation, track: GrooveTrack): boolean {
  if (a.bars[track] !== b.bars[track]) return false;
  const rows = new Set([...Object.keys(a.rows[track] ?? {}), ...Object.keys(b.rows[track] ?? {})]);
  for (const row of rows) if (!laneSame(a.rows[track]?.[row], b.rows[track]?.[row])) return false;
  return true;
}
function fillSame(a: DenseVariation, b: DenseVariation): boolean {
  if (a.fill.from !== b.fill.from) return false;
  const keys = new Set([...Object.keys(a.fill.lanes), ...Object.keys(b.fill.lanes)]);
  for (const key of keys) {
    // A lane present with nothing in it still silences the groove there: presence matters.
    if (!!a.fill.lanes[key] !== !!b.fill.lanes[key]) return false;
    if (!laneSame(a.fill.lanes[key], b.fill.lanes[key])) return false;
  }
  return true;
}

/** Whether [track] (or the fill, with 'fill') differs from the rhythm as written. */
export function differs(edited: DenseVariation, base: DenseVariation, what: GrooveTrack | 'fill'): boolean {
  return what === 'fill' ? !fillSame(edited, base) : !trackSame(edited, base, what);
}

/** Only what [edited] changes from [base], sparse; undefined when nothing does. */
export function grooveOf(edited: DenseVariation, base: DenseVariation): GrooveVariation | undefined {
  const out: GrooveVariation = {};
  for (const track of GROOVE_TRACKS) {
    if (trackSame(edited, base, track)) continue;
    const rows: Record<string, SparseLane> = {};
    for (const [row, lane] of Object.entries(edited.rows[track] ?? {})) {
      const sparse = toSparse(lane);
      if (sparse.length) rows[row] = sparse;
    }
    (out.tracks ??= {})[track] = { bars: edited.bars[track], rows };
  }
  if (!fillSame(edited, base)) {
    out.fill = { from: edited.fill.from, lanes: Object.fromEntries(Object.entries(edited.fill.lanes).map(([k, l]) => [k, toSparse(l)])) };
  }
  return out.tracks || out.fill ? out : undefined;
}

/** A section's groove from its edited variations, or undefined when neither differs from the rhythm. */
export function sectionGrooveOf(
  style: AppStyle, section: Pick<Section, 'stylePart'>, edited: Partial<Record<VariationKey, DenseVariation | null>>,
): SectionGroove | undefined {
  const out: SectionGroove = { styleId: style.id };
  for (const v of ['a', 'b'] as const) {
    const base = baseVariation(style, section, v);
    const e = edited[v];
    if (!base || !e) continue;
    const g = grooveOf(e, base);
    if (g) out[v] = g;
  }
  return out.a || out.b ? out : undefined;
}

/** A dense variation as the engine writer takes it. */
export function toAppVariation(d: DenseVariation): AppVariation {
  const patterns: AppPatterns = {};
  const patternBars: Record<string, number> = {};
  for (const track of GROOVE_TRACKS) {
    patterns[track] = d.rows[track] ?? {};
    patternBars[track] = d.bars[track];
  }
  const hasFill = Object.keys(d.fill.lanes).length > 0;
  return { patterns, patternBars, fill: hasFill ? { from: d.fill.from, lanes: d.fill.lanes } : undefined };
}

/** A lane longer or shorter: going longer repeats what there was, so the new bars start as the old ones. */
export function resizeLane(lane: number[], fromBars: number, toBars: number, spb: number): number[] {
  return Array.from({ length: toBars * spb }, (_, i) => (toBars > fromBars ? lane[i % (fromBars * spb)] : lane[i]) || 0);
}

export const cloneDense = (d: DenseVariation): DenseVariation => JSON.parse(JSON.stringify(d));
