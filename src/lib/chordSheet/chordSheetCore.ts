// Chord Sheet Maker's ChordPro engine — ported from the Claude Design prototype's
// chordsheet-core.js (see Chord Sheet Maker A v6.dc.html in the design project). Same
// algorithms, typed, with the fret-diagram generation dropped: this app already has
// real, curated guitar/ukulele voicing lookups (getGuitarVoicing/getUkuleleVoicing in
// src/data/guitarChords.ts / ukuleleChords.ts) plus GuitarChordDiagram.tsx to render
// them, so diagrams go through those instead of re-deriving shapes from a flat table.
// Only the piano key-highlight helper (pianoKeys) is kept here, since there's no
// existing equivalent.

const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
const IDX: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, 'E#': 5, Fb: 4, F: 5, 'F#': 6, Gb: 6,
  G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11, 'B#': 0, Cb: 11,
};
const KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const FLAT_KEYS = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Dm', 'Gm', 'Cm', 'Fm', 'Bbm', 'Ebm']);

/** Whether a key is conventionally spelled with flats (F, Bb, Eb…) rather than sharps —
 *  same table PrintChordSheet.astro uses, so a chart looks the same printed as it does here. */
export function isFlatKey(key: string): boolean {
  return FLAT_KEYS.has(key);
}

export interface ParsedChord {
  root: string;
  suffix: string;
  bass: string;
}

export function parseChord(name: string): ParsedChord | null {
  const m = /^([A-G][#b]?)([^/\s]*)(?:\/([A-G][#b]?))?$/.exec((name || '').trim());
  return m ? { root: m[1], suffix: m[2] || '', bass: m[3] || '' } : null;
}

export function transposeNote(n: string, semi: number, flats: boolean): string {
  const i = IDX[n];
  if (i == null) return n;
  return (flats ? FLAT : SHARP)[((i + semi) % 12 + 12) % 12];
}

export function transposeChord(name: string, semi: number, flats: boolean): string {
  if (!semi) return name;
  const c = parseChord(name);
  if (!c) return name;
  let out = transposeNote(c.root, semi, flats) + c.suffix;
  if (c.bass) out += '/' + transposeNote(c.bass, semi, flats);
  return out;
}

export function transposeKey(key: string, semi: number): string {
  const flats = FLAT_KEYS.has(transposeNote(key, semi, true));
  return transposeNote(key, semi, flats);
}

const DEG = [0, 2, 4, 5, 7, 9, 11];
const QUAL = ['', 'm', 'm', '', '', 'm', 'dim'];

/** The 7 diatonic triads of a key, root position — e.g. diatonic('G') → ['G','Am','Bm','C','D','Em','F#dim']. */
export function diatonic(key: string): string[] {
  const flats = FLAT_KEYS.has(key);
  const i = IDX[key] ?? 0;
  return DEG.map((d, n) => (flats ? FLAT : SHARP)[(i + d) % 12] + QUAL[n]);
}

const SECTION_RE = /^\[?\s*(verse|chorus|bridge|pre.?chorus|intro|outro|instrumental|solo|interlude|refrain|hook|coda|break|tag|ending)[\s\d:.-]*\]?\s*$/i;

export interface SheetSlot {
  chord: string;
  lyric: string;
}

export function splitLine(line: string): SheetSlot[] {
  const parts = line.split(/(\[[^\]]+\])/).filter((p) => p !== '');
  const slots: SheetSlot[] = [];
  let pending: SheetSlot | null = null;
  for (const p of parts) {
    if (/^\[[^\]]+\]$/.test(p)) {
      if (pending) slots.push(pending);
      pending = { chord: p.slice(1, -1).trim(), lyric: '' };
    } else if (pending) {
      pending.lyric += p;
    } else {
      slots.push({ chord: '', lyric: p });
    }
  }
  if (pending) slots.push(pending);
  if (!slots.length) slots.push({ chord: '', lyric: '' });
  return slots;
}

export interface SheetLine {
  blank: boolean;
  slots: SheetSlot[];
}

export interface SheetSection {
  name: string;
  lines: SheetLine[];
}

/** Parses ChordPro-ish text (`[G]like this`) into named sections of chord/lyric lines. */
export function parseSheet(text: string): SheetSection[] {
  const sections: SheetSection[] = [];
  let cur: SheetSection | null = null;
  for (const raw of (text || '').split('\n')) {
    const t = raw.trim();
    if (SECTION_RE.test(t)) {
      const label = t.replace(/^\[|\]$/g, '').replace(/:$/, '').trim();
      cur = { name: label.charAt(0).toUpperCase() + label.slice(1), lines: [] };
      sections.push(cur);
    } else if (t === '') {
      if (cur && cur.lines.length) cur.lines.push({ blank: true, slots: [] });
    } else {
      if (!cur) { cur = { name: '', lines: [] }; sections.push(cur); }
      cur.lines.push({ blank: false, slots: splitLine(raw) });
    }
  }
  for (const s of sections) while (s.lines.length && s.lines[s.lines.length - 1].blank) s.lines.pop();
  return sections.filter((s) => s.lines.length || s.name);
}

// ── Position-aware document model (drag & drop rewrites the source) ──

export interface LineChord {
  chord: string;
  at: number;
}

export interface LineTokens {
  plain: string;
  chords: LineChord[];
}

export function lineTokens(raw: string): LineTokens {
  const chords: LineChord[] = [];
  let plain = '';
  let last = 0;
  let m: RegExpExecArray | null;
  const re = /\[([^\]]*)\]/g;
  while ((m = re.exec(raw))) {
    plain += raw.slice(last, m.index);
    chords.push({ chord: m[1].trim(), at: plain.length });
    last = re.lastIndex;
  }
  plain += raw.slice(last);
  return { plain, chords };
}

export function tokensToLine(plain: string, chords: LineChord[]): string {
  let out = '';
  let prev = 0;
  chords.forEach((c) => {
    const at = Math.max(prev, Math.min(plain.length, c.at));
    out += plain.slice(prev, at) + '[' + c.chord + ']';
    prev = at;
  });
  return out + plain.slice(prev);
}

export interface DocSlot extends SheetSlot {
  ci: number;
  at: number;
}

export function slotsOf(plain: string, chords: LineChord[]): DocSlot[] {
  const slots: DocSlot[] = [];
  const first = chords.length ? chords[0].at : plain.length;
  if (first > 0 || !chords.length) slots.push({ chord: '', lyric: plain.slice(0, first), ci: -1, at: 0 });
  chords.forEach((c, i) => {
    const end = i + 1 < chords.length ? chords[i + 1].at : plain.length;
    slots.push({ chord: c.chord, lyric: plain.slice(c.at, Math.max(c.at, end)), ci: i, at: c.at });
  });
  return slots;
}

export interface DocLine {
  src: number;
  blank: boolean;
  plain: string;
  chords: LineChord[];
  chordsOnly: boolean;
}

export interface DocSection {
  name: string;
  src: number;
  lines: DocLine[];
}

/** Same parse as parseSheet, but each line keeps its source-line index so edits round-trip. */
export function parseDoc(text: string): DocSection[] {
  const lines = (text || '').split('\n');
  const sections: DocSection[] = [];
  let cur: DocSection | null = null;
  lines.forEach((raw, i) => {
    const t = raw.trim();
    if (SECTION_RE.test(t)) {
      const label = t.replace(/^\[|\]$/g, '').replace(/:$/, '').trim();
      cur = { name: label.charAt(0).toUpperCase() + label.slice(1), src: i, lines: [] };
      sections.push(cur);
    } else if (t === '') {
      if (cur && cur.lines.length) cur.lines.push({ src: i, blank: true, plain: '', chords: [], chordsOnly: false });
    } else {
      if (!cur) { cur = { name: '', src: i, lines: [] }; sections.push(cur); }
      const tk = lineTokens(raw);
      cur.lines.push({
        src: i, blank: false, plain: tk.plain, chords: tk.chords,
        chordsOnly: /^[\s|]*$/.test(tk.plain) && tk.chords.length > 0,
      });
    }
  });
  sections.forEach((sec) => { while (sec.lines.length && sec.lines[sec.lines.length - 1].blank) sec.lines.pop(); });
  return sections.filter((s) => s.lines.length || s.name);
}

export function replaceLine(text: string, idx: number, newLine: string): string {
  const l = (text || '').split('\n');
  if (idx < 0 || idx >= l.length) return text;
  l[idx] = newLine;
  return l.join('\n');
}

/** Moves chord #ci of line `idx` to character `at`. `after` picks which side of any chord
 *  already sitting at that exact character the moved one lands on. */
export function moveChord(text: string, idx: number, ci: number, at: number, after: boolean): string {
  const l = (text || '').split('\n');
  if (idx < 0 || idx >= l.length) return text;
  const tk = lineTokens(l[idx]);
  if (!tk.chords[ci]) return text;
  const moved = tk.chords.splice(ci, 1)[0];
  moved.at = Math.max(0, Math.min(tk.plain.length, at));
  let i = 0;
  while (i < tk.chords.length && (tk.chords[i].at < moved.at || (tk.chords[i].at === moved.at && after))) i++;
  tk.chords.splice(i, 0, moved);
  l[idx] = tokensToLine(tk.plain, tk.chords);
  return l.join('\n');
}

export function insertChord(text: string, idx: number, name: string, at: number, after: boolean): string {
  const l = (text || '').split('\n');
  if (idx < 0 || idx >= l.length) return text;
  const tk = lineTokens(l[idx]);
  const c: LineChord = { chord: name, at: Math.max(0, Math.min(tk.plain.length, at)) };
  let i = 0;
  while (i < tk.chords.length && (tk.chords[i].at < c.at || (tk.chords[i].at === c.at && after))) i++;
  tk.chords.splice(i, 0, c);
  l[idx] = tokensToLine(tk.plain, tk.chords);
  return l.join('\n');
}

export function removeChord(text: string, idx: number, ci: number): string {
  const l = (text || '').split('\n');
  if (idx < 0 || idx >= l.length) return text;
  const tk = lineTokens(l[idx]);
  if (!tk.chords[ci]) return text;
  tk.chords.splice(ci, 1);
  l[idx] = tokensToLine(tk.plain, tk.chords);
  return l.join('\n');
}

export type BarToken = { kind: 'chord'; chord: string; ci: number; at: number } | { kind: 'bar' };

/** A chord-only line is layout, not lyrics — its whitespace is typing noise. Exposes its
 *  chords (and bar marks, from any `|`) as discrete tokens so the renderer can space them
 *  evenly: "[G][C][G] [D]" and "[G][C][G][D]" must look identical. */
export function barTokens(line: DocLine): BarToken[] {
  const out: BarToken[] = [];
  const firstAt = line.chords.length ? line.chords[0].at : line.plain.length;
  if (line.plain.slice(0, firstAt).includes('|')) out.push({ kind: 'bar' });
  let plainCursor = 0;
  line.chords.forEach((c, i) => {
    const gapStart = c.at;
    out.push({ kind: 'chord', chord: c.chord, ci: i, at: c.at });
    const next = i + 1 < line.chords.length ? line.chords[i + 1].at : line.plain.length;
    if (line.plain.slice(gapStart, next).includes('|')) out.push({ kind: 'bar' });
    plainCursor = next;
  });
  if (line.plain.slice(plainCursor).includes('|')) out.push({ kind: 'bar' });
  return out;
}

export function serialize(sections: SheetSection[]): string {
  const out: string[] = [];
  sections.forEach((s, i) => {
    if (i) out.push('');
    if (s.name) out.push(s.name);
    s.lines.forEach((l) => {
      if (l.blank) { out.push(''); return; }
      out.push(l.slots.map((sl) => (sl.chord ? '[' + sl.chord + ']' : '') + sl.lyric).join(''));
    });
  });
  return out.join('\n');
}

export function uniqueChords(sections: SheetSection[]): string[] {
  const seen: string[] = [];
  sections.forEach((s) => s.lines.forEach((l) => l.slots.forEach((sl) => {
    if (sl.chord && !seen.includes(sl.chord)) seen.push(sl.chord);
  })));
  return seen;
}

const INTERVALS: Record<string, number[]> = {
  '': [0, 4, 7], M: [0, 4, 7], maj: [0, 4, 7],
  m: [0, 3, 7], min: [0, 3, 7], '-': [0, 3, 7],
  '5': [0, 7], sus2: [0, 2, 7], sus4: [0, 5, 7], sus: [0, 5, 7],
  '6': [0, 4, 7, 9], m6: [0, 3, 7, 9],
  '7': [0, 4, 7, 10], m7: [0, 3, 7, 10], min7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11], M7: [0, 4, 7, 11],
  '7sus4': [0, 5, 7, 10], dim: [0, 3, 6], dim7: [0, 3, 6, 9], m7b5: [0, 3, 6, 10],
  aug: [0, 4, 8], '+': [0, 4, 8],
  add9: [0, 4, 7, 14], '9': [0, 4, 7, 10, 14], m9: [0, 3, 7, 10, 14], maj9: [0, 4, 7, 11, 14],
  '11': [0, 4, 7, 10, 14, 17], '13': [0, 4, 7, 10, 14, 21],
};

export function chordPitches(name: string): number[] {
  const c = parseChord(name);
  if (!c) return [];
  const iv = INTERVALS[c.suffix] || INTERVALS[c.suffix.replace(/\d+$/, '')] || [0, 4, 7];
  const root = IDX[c.root] ?? 0;
  return iv.map((i) => root + i);
}

export function pitchClasses(name: string): number[] {
  return chordPitches(name).map((p) => ((p % 12) + 12) % 12);
}

// ── Piano key-highlight — no existing repo equivalent, kept from the prototype ──
const WHITE = [0, 2, 4, 5, 7, 9, 11];
const BLACK = [{ pc: 1, left: 10 }, { pc: 3, left: 24 }, { pc: 6, left: 52 }, { pc: 8, left: 66 }, { pc: 10, left: 80 }];

export interface PianoKeys {
  white: { id: string; on: boolean; root: boolean }[];
  black: { id: string; left: number; on: boolean; root: boolean }[];
}

export function pianoKeys(name: string): PianoKeys {
  const pcs = pitchClasses(name);
  const rootPc = pcs.length ? pcs[0] : -1;
  return {
    white: WHITE.map((pc, i) => ({ id: 'w' + i, on: pcs.includes(pc), root: pc === rootPc })),
    black: BLACK.map((b, i) => ({ id: 'b' + i, left: b.left, on: pcs.includes(b.pc), root: b.pc === rootPc })),
  };
}

// ── Chart notation: Standard / Nashville numbers / Do-Re-Mi fixed & movable ──
const SOLFEGE: Record<string, string> = { C: 'Do', D: 'Re', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si' };
const MOVABLE = ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Si'];
const DEG_OF_SEMI: Record<number, [number, string]> = {
  0: [1, ''], 1: [1, '#'], 2: [2, ''], 3: [3, 'b'], 4: [3, ''], 5: [4, ''],
  6: [4, '#'], 7: [5, ''], 8: [6, 'b'], 9: [6, ''], 10: [7, 'b'], 11: [7, ''],
};

export type ChartNotation = 'standard' | 'number' | 'fixed' | 'movable';

function degreeOf(root: string, key: string): [number, string] | null {
  const r = IDX[root];
  const k = IDX[key];
  if (r == null || k == null) return null;
  return DEG_OF_SEMI[((r - k) % 12 + 12) % 12];
}

export function solfege(note: string): string {
  const m = /^([A-G])([#b]?)$/.exec(note);
  return m ? SOLFEGE[m[1]] + (m[2] === '#' ? '♯' : m[2] === 'b' ? '♭' : '') : note;
}

// Quality letters stay full size; the numeric extension is meant to render as a superscript.
const QUAL_PREFIX = /^(maj|min|dim|aug|sus|m|M|°|ø|\+|-)?(.*)$/;

export interface ChordParts {
  main: string;
  sup: string;
  tail: string;
}

/** `name` is already transposed to the sounding key. Returns {main, sup, tail} so the
 *  caller can render `sup` as a superscript span. */
export function formatChordParts(name: string, key: string, mode?: ChartNotation): ChordParts {
  const c = parseChord(name);
  if (!c) return { main: name || '', sup: '', tail: '' };
  if (!mode || mode === 'standard') return { main: name, sup: '', tail: '' };
  const render = (n: string) => {
    if (mode === 'fixed') return solfege(n);
    const d = degreeOf(n, key);
    if (!d) return n;
    const acc = d[1] === '#' ? '♯' : d[1] === 'b' ? '♭' : '';
    return mode === 'number' ? acc + d[0] : acc + MOVABLE[d[0] - 1];
  };
  const m = QUAL_PREFIX.exec(c.suffix) || [null, '', ''];
  return {
    main: render(c.root) + (m[1] || ''),
    sup: m[2] || '',
    tail: c.bass ? '/' + render(c.bass) : '',
  };
}

export function formatChord(name: string, key: string, mode?: ChartNotation): string {
  const p = formatChordParts(name, key, mode);
  return p.main + p.sup + p.tail;
}

// ── Simple oscillator playback for clicking a chord to hear it ──
let ctx: AudioContext | null = null;
function audio(): AudioContext {
  if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function playChord(name: string, dur = 1.1): void {
  if (typeof window === 'undefined') return;
  const pitches = chordPitches(name);
  if (!pitches.length) return;
  const ac = audio();
  const t0 = ac.currentTime;
  const master = ac.createGain();
  master.gain.value = 0.0001;
  master.connect(ac.destination);
  master.gain.setValueAtTime(0.0001, t0);
  master.gain.exponentialRampToValueAtTime(0.22, t0 + 0.02);
  master.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  pitches.forEach((p, i) => {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = i === 0 ? 'triangle' : 'sine';
    osc.frequency.value = 261.63 * Math.pow(2, (p - 12) / 12);
    g.gain.value = i === 0 ? 0.9 : 0.6;
    osc.connect(g);
    g.connect(master);
    osc.start(t0 + i * 0.012);
    osc.stop(t0 + dur + 0.05);
  });
}

export const KEYS_CHROMATIC = KEYS;
