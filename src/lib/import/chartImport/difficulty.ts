import type { Difficulty } from './types';

// Difficulty is derived from the chord label itself, not taken from the source file.
// The analysis JSON happens to ship three pre-baked columns (basic/simple/complex), but
// relying on them would tie us to one provider — and this reducer reproduces them
// exactly (see validateAgainstSource), so it can stand in for any source that only
// gives us one set of labels.
//
//   avanzado — everything the detector heard: triad + sus + extension + colour tones
//   medio    — triad + sus + extension (7ths, 9ths…), colour tones dropped
//   facil    — plain triad only: major / minor / dim / aug

const ROOT_RE = /^([A-G][#b]?)/;
const EXT_RE = /^(maj|Maj|M|Δ)?(13|11|9|7|6)/;
const COLOUR_RE = /^(add\d+|no\d+|alt|\(\d+\)|[b#]\d+)/;

// Analyses use the typographic accidentals (♭ U+266D, ♯ U+266F) inside chord labels —
// "Cm7♭5" — while every regex here, and the app's own chord parser, speak ASCII.
function normalizeAccidentals(label: string): string {
  return label.replace(/♭/g, 'b').replace(/♯/g, '#');
}

// "No chord": the analysis marks silence, count-ins and dead air with this. It is not a
// chord and must never reach the chart as one.
export const NO_CHORD = 'N';

export function isNoChord(label: string): boolean {
  return label === NO_CHORD || label === '' || label === 'X';
}

export interface ParsedLabel {
  root: string;
  triad: '' | 'm' | 'dim' | 'aug';
  sus: '' | 'sus2' | 'sus4';
  ext: string;          // '', '6', '7', 'maj7', '9', 'maj9', '11', '13'…
  colours: string[];    // 'add9', 'b5', '#11'…
  bass: string | null;
  unparsed: string;     // leftover we did not understand — kept so nothing is silently lost
}

export function parseLabel(rawLabel: string): ParsedLabel | null {
  const label = normalizeAccidentals(rawLabel);
  const [body, bass = null] = label.split('/');
  const rootMatch = body.match(ROOT_RE);
  if (!rootMatch) return null;

  const root = rootMatch[1];
  let s = body.slice(root.length);
  let triad: ParsedLabel['triad'] = '';
  let sus: ParsedLabel['sus'] = '';
  let ext = '';
  const colours: string[] = [];

  if (/^(dim|°|o)/.test(s)) {
    triad = 'dim';
    s = s.replace(/^(dim|°|o)/, '');
  } else if (/^(aug|\+)/.test(s)) {
    triad = 'aug';
    s = s.replace(/^(aug|\+)/, '');
  } else if (/^(min|m(?!aj)|-)/.test(s)) {
    triad = 'm';
    s = s.replace(/^(min|m|-)/, '');
  }

  const extMatch = s.match(EXT_RE);
  if (extMatch) {
    const major = extMatch[1] ? 'maj' : '';
    ext = `${major}${extMatch[2]}`;
    s = s.slice(extMatch[0].length);
  }

  // sus can appear either before or after the extension (Csus4, C7sus4)
  const susMatch = s.match(/^sus([24]?)/);
  if (susMatch) {
    sus = susMatch[1] === '2' ? 'sus2' : 'sus4';
    s = s.slice(susMatch[0].length);
  }

  while (s) {
    const m = s.match(COLOUR_RE);
    if (!m) break;
    colours.push(m[1]);
    s = s.slice(m[1].length);
  }

  const lateSus = s.match(/^sus([24]?)/);
  if (lateSus) {
    sus = lateSus[1] === '2' ? 'sus2' : 'sus4';
    s = s.slice(lateSus[0].length);
  }

  return { root, triad, sus, ext, colours, bass, unparsed: s };
}

// A half-diminished (m7b5) is a diminished triad carrying a minor 7th. Dropping the b5
// along with the 7th would turn it into a plain minor, which is a different chord — at
// the middle level it keeps the diminished quality and loses only the extension. The
// easy level does flatten it to a minor triad, which is the reference charts' own call.
function isHalfDiminished(p: ParsedLabel): boolean {
  return p.triad === 'm' && p.colours.includes('b5');
}

export function formatLabel(p: ParsedLabel, level: Difficulty): string {
  if (level === 'medio' && isHalfDiminished(p)) return `${p.root}dim`;

  let out = p.root + p.triad;

  if (level !== 'facil') {
    if (p.ext) out += p.ext;
    if (p.sus) out += p.sus;
  }
  if (level === 'avanzado') {
    out += p.colours.join('');
    out += p.unparsed;
  }
  return out;
}

// Reduces a chord label to the given difficulty. Unknown labels pass through untouched
// rather than being mangled.
export function reduceLabel(label: string, level: Difficulty): string {
  if (level === 'avanzado') return normalizeAccidentals(label).split('/')[0];
  const parsed = parseLabel(label);
  if (!parsed) return normalizeAccidentals(label);
  return formatLabel(parsed, level);
}

// ── Enharmonic spelling ──────────────────────────────────────────────────────
// The analysis always spells roots with sharps. A chart in a flat key has to read in
// flats — Gbmaj7, not F#maj7 — or every accidental fights the key signature.

const TO_FLAT: Record<string, string> = {
  'A#': 'Bb', 'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab',
};

// How many flats each key signature carries. Only flat keys are listed; anything else
// keeps the sharp spelling it arrived with.
const FLAT_COUNT: Record<string, number> = {
  F: 1, Bb: 2, Eb: 3, Ab: 4, Db: 5, Gb: 6,
  Dm: 1, Gm: 2, Cm: 3, Fm: 4, Bbm: 5, Ebm: 6,
};

function respellRoot(root: string, flats: number): string {
  const flat = TO_FLAT[root];
  if (flat) return flat;
  // Deep flat keys (5+) spell the chromatic B as Cb, so the whole chart stays on the
  // flat side of the circle — that is what the reference charts do in Bb minor.
  if (root === 'B' && flats >= 5) return 'Cb';
  return root;
}

export function respellForKey(label: string, key: string): string {
  const flats = FLAT_COUNT[key];
  if (!flats) return label;
  return label
    .split('/')
    .map(part => part.replace(ROOT_RE, r => respellRoot(r, flats)))
    .join('/');
}

export interface SourceCheck {
  level: Difficulty;
  column: string;
  total: number;
  mismatches: { beat: number; expected: string; got: string }[];
}

// How closely our reducer tracks the provider's own simpler columns. Informative, not a
// pass/fail: the reference charts and the provider disagree at the easy level — a
// half-diminished is printed as a plain minor triad there, while the provider's basic
// column keeps it diminished. Where they disagree we follow the reference charts.
export function validateAgainstSource(
  rows: { chord_complex_pop: string; chord_simple_pop: string; chord_basic_pop: string }[],
): SourceCheck[] {
  const checks: { level: Difficulty; column: 'chord_simple_pop' | 'chord_basic_pop' }[] = [
    { level: 'medio', column: 'chord_simple_pop' },
    { level: 'facil', column: 'chord_basic_pop' },
  ];

  return checks.map(({ level, column }) => {
    const mismatches: SourceCheck['mismatches'] = [];
    let total = 0;
    rows.forEach((row, i) => {
      if (isNoChord(row.chord_complex_pop)) return;
      total += 1;
      const got = reduceLabel(row.chord_complex_pop, level);
      const expected = normalizeAccidentals(row[column]);
      if (got !== expected) mismatches.push({ beat: i, expected, got });
    });
    return { level, column, total, mismatches };
  });
}
