import { resample } from './strumTheory';
import type { ArpPatternData, GridSize, PatternEntry, StrumMode, StrumPatternData } from './types';

const STRUM_PRESETS: Record<GridSize, [string, number[]][]> = {
  8: [
    ['Basic D-DU-UDU', [1, 0, 1, 2, 0, 2, 1, 2]],
    ['Pop', [1, 0, 1, 2, 1, 0, 1, 2]],
    ['Ballad', [1, 0, 0, 2, 1, 0, 1, 2]],
    ['Reggae', [0, 2, 0, 2, 0, 2, 0, 2]],
    ['Muted Rock', [1, 3, 1, 3, 1, 3, 1, 3]],
  ],
  16: [
    ['Basic D-DU-UDU', [1, 0, 0, 0, 1, 0, 2, 0, 0, 0, 2, 0, 1, 0, 2, 0]],
    ['Funk 16', [1, 0, 2, 0, 0, 3, 2, 0, 1, 0, 2, 0, 3, 0, 2, 0]],
    ['Country', [1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0]],
    ['Ballad', [1, 0, 0, 0, 0, 0, 2, 0, 1, 0, 0, 0, 1, 0, 2, 0]],
  ],
};

const ARP_PRESETS: Record<GridSize, [string, number[]][]> = {
  8: [
    ['Ascending', [0, 2, 3, 4, 5, 4, 3, 2]],
    ['Alternating Bass', [0, 3, 4, 3, 1, 3, 4, 3]],
    ['Travis', [0, 3, 2, 4, 1, 3, 2, 4]],
    ['Ballad', [0, 4, 3, 4, 2, 4, 3, 4]],
  ],
  16: [
    ['Ascending', [0, 1, 2, 3, 4, 5, 4, 3, 2, 1, 0, 1, 2, 3, 4, 5]],
    ['Alternating Bass', [0, 3, 4, 3, 1, 3, 4, 3, 0, 3, 4, 3, 1, 3, 4, 3]],
    ['Travis', [0, 3, 2, 4, 1, 3, 2, 4, 0, 3, 2, 4, 1, 3, 2, 4]],
  ],
};

const LS_KEY = 'cs_guitar_strum_library_v1';

export function arpFromStringSeq(seq: number[]): ArpPatternData {
  const rows: boolean[][] = [0, 1, 2, 3, 4, 5].map(() => new Array(seq.length).fill(false));
  seq.forEach((stringIndex, step) => {
    if (stringIndex >= 0 && stringIndex < 6) rows[stringIndex][step] = true;
  });
  return rows;
}

export function baseLibrary(): PatternEntry[] {
  const out: PatternEntry[] = [];
  (Object.keys(STRUM_PRESETS).map(Number) as GridSize[]).forEach(steps => {
    STRUM_PRESETS[steps].forEach(([name, seq]) => {
      out.push({ id: `p-s${steps}-${name}`, name, mode: 'strum', steps, data: seq.slice() as StrumPatternData, custom: false });
    });
    ARP_PRESETS[steps].forEach(([name, seq]) => {
      out.push({ id: `p-a${steps}-${name}`, name, mode: 'arp', steps, data: arpFromStringSeq(seq), custom: false });
    });
  });
  return out;
}

export function loadCustomPatterns(): PatternEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCustomPatterns(list: PatternEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(list.filter(p => p.custom)));
  } catch {
    // storage unavailable (private mode / quota) — saved pattern just won't persist
  }
}

export function previewOf(entry: PatternEntry): string {
  const glyphs = ['·', '↓', '↑', '✕'];
  if (entry.mode === 'strum') {
    return (entry.data as StrumPatternData).map(v => glyphs[v] ?? '·').join('');
  }
  const rows = entry.data as ArpPatternData;
  const steps = rows[0]?.length ?? 0;
  return Array.from({ length: steps }, (_, step) => {
    for (let r = 0; r < 6; r++) if (rows[r][step]) return '•';
    return '·';
  }).join('');
}

export function defaultStrumPattern(steps: GridSize): StrumPatternData {
  return STRUM_PRESETS[steps][0][1].slice() as StrumPatternData;
}
export function defaultArpPattern(steps: GridSize): ArpPatternData {
  return arpFromStringSeq(ARP_PRESETS[steps][0][1]);
}
export function defaultPatternId(mode: StrumMode, steps: GridSize): string {
  return mode === 'strum' ? `p-s${steps}-${STRUM_PRESETS[steps][0][0]}` : `p-a${steps}-${ARP_PRESETS[steps][0][0]}`;
}
export function defaultPatternName(mode: StrumMode, steps: GridSize): string {
  return mode === 'strum' ? STRUM_PRESETS[steps][0][0] : ARP_PRESETS[steps][0][0];
}

export function resamplePatternData(mode: StrumMode, data: StrumPatternData | ArpPatternData, toSteps: GridSize): StrumPatternData | ArpPatternData {
  return mode === 'strum'
    ? resample(data as StrumPatternData, toSteps, 0)
    : (data as ArpPatternData).map(row => resample(row, toSteps, false));
}
