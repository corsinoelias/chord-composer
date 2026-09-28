/**
 * What the rhythm editor's pattern strip offers for a track, as the app's (pattern_picker.dart):
 * yours first, then the rhythm's own, then the figures. A pattern is one track's rows, in the
 * engine's packed steps (appEngine/steps.ts), and how many bars they take.
 *
 *   - the figures are the app's, built by the app (tool/export_web_styles_test.dart) and
 *     brought across by `npm run rhythms:sync` into public/rhythms/patterns.json;
 *   - yours live in this browser, as the favourites do (favorites.ts): a groove you named
 *     is there in every song you open here.
 */
import { type GrooveTrack } from './groove';

export interface StripPattern {
  id: string;
  name: string;
  rows: Record<string, number[]>;
  bars: 1 | 2 | 4;
}

/** One of yours: the track it is for, and the steps per bar it was written in. */
export interface SavedPattern extends StripPattern {
  tab: GrooveTrack;
  spb: number;
}

type FigureFile = { tabs: Record<GrooveTrack, { id: string; name: string; pattern: Record<string, number[]> }[]> };
let figures: Promise<FigureFile['tabs']> | null = null;

/** The app's figures for each track: one bar each, [spb] steps of it. */
export async function loadFigures(tab: GrooveTrack, spb: number): Promise<StripPattern[]> {
  figures ??= fetch('/rhythms/patterns.json').then((r) => {
    if (!r.ok) throw new Error(`patterns.json: ${r.status}`);
    return (r.json() as Promise<FigureFile>).then((f) => f.tabs);
  }).catch((e) => { figures = null; throw e; });
  const list = (await figures)[tab] ?? [];
  return list.map((f) => ({
    id: `fig-${f.id}`,
    name: f.name,
    bars: 1,
    rows: Object.fromEntries(Object.entries(f.pattern).map(([row, lane]) => [row, fitLane(lane, spb)])),
  }));
}

const KEY = 'chord-player-patterns-v1';

export function savedPatterns(): SavedPattern[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function store(list: SavedPattern[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Full or blocked storage: the pattern stays on screen for this visit only.
  }
}

export function savePattern(p: Omit<SavedPattern, 'id'>): SavedPattern {
  const saved = { ...p, id: `mine-${Date.now().toString(36)}` };
  store([...savedPatterns(), saved]);
  return saved;
}

export function forgetPattern(id: string) {
  store(savedPatterns().filter((p) => p.id !== id));
}

export function fitLane(lane: number[] | undefined, length: number): number[] {
  const out = new Array<number>(length).fill(0);
  lane?.forEach((v, i) => { if (i < length) out[i] = v | 0; });
  return out;
}

/**
 * Whether a track spells [p]: the same bars and the same steps. A row one side does not name
 * counts as silent — a figure names the pieces it plays, a groove may name more — as the
 * app's sameTrack.
 */
export function spells(rows: Record<string, number[]> | undefined, bars: number, p: StripPattern, spb: number): boolean {
  if (bars !== p.bars) return false;
  const length = bars * spb;
  for (const row of new Set([...Object.keys(rows ?? {}), ...Object.keys(p.rows)])) {
    const a = fitLane(rows?.[row], length);
    const b = fitLane(p.rows[row], length);
    if (a.some((v, i) => v !== b[i])) return false;
  }
  return true;
}

/** Which of the first sixteen steps sound at all: the chip's thumbnail. */
export function previewOf(rows: Record<string, number[]>): boolean[] {
  return Array.from({ length: 16 }, (_, s) => Object.values(rows).some((lane) => (lane[s] ?? 0) !== 0));
}
