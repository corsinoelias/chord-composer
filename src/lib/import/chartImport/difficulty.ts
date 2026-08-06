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
const COLOUR_RE = /^(add\d+|no\d+|alt|[b#]\d+)/;

export interface ParsedLabel {
  root: string;
  triad: '' | 'm' | 'dim' | 'aug';
  sus: '' | 'sus2' | 'sus4';
  ext: string;          // '', '6', '7', 'maj7', '9', 'maj9', '11', '13'…
  colours: string[];    // 'add9', 'b5', '#11'…
  bass: string | null;
  unparsed: string;     // leftover we did not understand — kept so nothing is silently lost
}

export function parseLabel(label: string): ParsedLabel | null {
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

export function formatLabel(p: ParsedLabel, level: Difficulty): string {
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
  if (level === 'avanzado') return label.split('/')[0];
  const parsed = parseLabel(label);
  if (!parsed) return label;
  return formatLabel(parsed, level);
}

export interface SourceCheck {
  level: Difficulty;
  column: string;
  total: number;
  mismatches: { beat: number; expected: string; got: string }[];
}

// Sanity check: our reducer applied to the richest column should reproduce the
// provider's own simpler columns beat for beat.
export function validateAgainstSource(
  rows: { chord_complex_pop: string; chord_simple_pop: string; chord_basic_pop: string }[],
): SourceCheck[] {
  const checks: { level: Difficulty; column: 'chord_simple_pop' | 'chord_basic_pop' }[] = [
    { level: 'medio', column: 'chord_simple_pop' },
    { level: 'facil', column: 'chord_basic_pop' },
  ];

  return checks.map(({ level, column }) => {
    const mismatches: SourceCheck['mismatches'] = [];
    rows.forEach((row, i) => {
      const got = reduceLabel(row.chord_complex_pop, level);
      const expected = row[column];
      if (got !== expected) mismatches.push({ beat: i, expected, got });
    });
    return { level, column, total: rows.length, mismatches };
  });
}
