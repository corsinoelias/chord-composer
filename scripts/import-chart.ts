/**
 * Turns a beat-aligned chord/lyric analysis into paste-ready chord charts at three
 * difficulty levels.
 *
 *   npm run import:chart -- --in <dir> --out <dir> [options]
 *
 * `--in` must contain beats.json, chords.json and lyrics.json. Writes
 * <name>.facil.txt / .medio.txt / .avanzado.txt (paste into /songs/new/ → text mode),
 * plus <name>.timeline.json with the full per-chord timing for the audio engine.
 *
 * Options:
 *   --bpm N          override the detected tempo
 *   --key X          override the detected key
 *   --title / --artist / --album / --style / --genre / --capo
 *   --name X         basename for the output files (default: the title, slugified)
 *   --slash          keep slash-chord bass notes at the avanzado level
 *   --min-beats N    absorb chord changes shorter than N beats (default 1 = keep all)
 *   --gap-beats N          silence needed to break chords out onto their own line (default 2)
 *   --lines-per-section N  roughly how many lyric lines a section should hold (default 8)
 *   --instrumental-gap N   pause, in beats, that becomes an instrumental section (default 6)
 *   --above          also write <name>.<level>.chart.txt in chord-above-lyric layout
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  buildCharts,
  renderChordAbove,
  serializeChart,
  validateAgainstSource,
  type Difficulty,
  type SongChart,
} from '../src/lib/import/chartImport/index.js';
import { parseTextMode } from '../src/components/SongCreator/textParser.js';

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      i++;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function num(value: string | boolean | undefined): number | undefined {
  if (typeof value !== 'string') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function str(value: string | boolean | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'chart';
}

function readJson<T>(dir: string, file: string): T {
  const path = join(dir, file);
  if (!existsSync(path)) {
    console.error(`Missing ${file} in ${dir}`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

function summarize(chart: SongChart): string {
  const chords = new Set(chart.spans.map(s => s.label));
  const lines = chart.sections.reduce((n, s) => n + s.lines.length, 0);
  return `${String(chart.spans.length).padStart(4)} chords  ${String(chords.size).padStart(3)} distinct  ${String(chart.sections.length).padStart(3)} sections  ${String(lines).padStart(3)} lines`;
}

const args = parseArgs(process.argv.slice(2));
const inDir = resolve(str(args.in) ?? '.');
const outDir = resolve(str(args.out) ?? join(inDir, 'chart-out'));

const rawBeats = readJson<Parameters<typeof buildCharts>[0]>(inDir, 'beats.json');
const rawChords = readJson<Parameters<typeof buildCharts>[1]>(inDir, 'chords.json');
const rawLyrics = readJson<Parameters<typeof buildCharts>[2]>(inDir, 'lyrics.json');

const result = buildCharts(rawBeats, rawChords, rawLyrics, {
  bpm: num(args.bpm),
  key: str(args.key),
  includeBass: args.slash === true,
  minBeats: num(args['min-beats']),
  gapBeats: num(args['gap-beats']),
  linesPerSection: num(args['lines-per-section']),
  instrumentalGapBeats: num(args['instrumental-gap']),
});

const meta = {
  title: str(args.title),
  artist: str(args.artist),
  album: str(args.album),
  key: result.key,
  capo: num(args.capo),
  bpm: result.bpm,
  style: str(args.style),
  genre: str(args.genre)?.split(',').map(g => g.trim()).filter(Boolean),
};

const name = slugify(str(args.name) ?? meta.title ?? 'chart');
mkdirSync(outDir, { recursive: true });

// Feeds the generated text back through the parser /songs/new/ actually uses, so a
// paste that silently loses chords or durations fails here instead of in the editor.
function verifyRoundTrip(text: string, chart: SongChart) {
  const { sections } = parseTextMode(text);
  const chords = sections.flatMap(s =>
    s.lines.flatMap(l => l.tokens.filter(t => t.chord && !t.isSpace)),
  );
  return {
    sections: sections.length,
    chords: chords.length,
    beats: chords.reduce((n, t) => n + t.duration, 0),
    expectedChords: chart.spans.length,
    expectedBeats: chart.spans.reduce((n, s) => n + s.beats, 0),
  };
}

const levels: Difficulty[] = ['facil', 'medio', 'avanzado'];
const roundTrips: Record<string, ReturnType<typeof verifyRoundTrip>> = {};

for (const level of levels) {
  const chart = result.charts[level];
  const text = serializeChart(chart, meta);
  writeFileSync(join(outDir, `${name}.${level}.txt`), text, 'utf-8');
  roundTrips[level] = verifyRoundTrip(text, chart);
  if (args.above === true) {
    writeFileSync(join(outDir, `${name}.${level}.chart.txt`), renderChordAbove(chart), 'utf-8');
  }
}

writeFileSync(
  join(outDir, `${name}.timeline.json`),
  JSON.stringify(
    {
      key: result.key,
      bpm: result.bpm,
      detectedBpm: result.detectedBpm,
      detectedKey: result.detectedKey,
      levels: Object.fromEntries(levels.map(l => [l, result.charts[l].spans])),
    },
    null,
    2,
  ),
  'utf-8',
);

// ── Report ───────────────────────────────────────────────────────────────────
console.log(`\nSource   ${result.beatCount} beats · ${result.lineCount} lyric lines`);
console.log(`Tempo    ${result.bpm} BPM${result.detectedBpm !== result.bpm ? ` (detected ${result.detectedBpm})` : ''}`);
console.log(`Key      ${result.key || '—'}${result.detectedKey && result.detectedKey !== result.key ? ` (detected ${result.detectedKey})` : ''}`);

console.log('\nLevels');
for (const level of levels) console.log(`  ${level.padEnd(9)} ${summarize(result.charts[level])}`);

// Informative, not pass/fail — the reference charts and the provider disagree at the
// easy level over half-diminished chords, and we follow the reference charts.
console.log('\nAgreement with the provider\'s own columns');
for (const check of validateAgainstSource(rawChords)) {
  const ok = check.mismatches.length === 0;
  console.log(`  ${check.level.padEnd(9)} ${ok ? 'identical' : `${check.mismatches.length}/${check.total} differ`} vs ${check.column}`);
  for (const m of check.mismatches.slice(0, 3)) {
    console.log(`    beat ${m.beat}: provider ${m.expected}, ours ${m.got}`);
  }
}

const totalBeats = result.charts.avanzado.spans.reduce((n, s) => n + s.beats, 0);
const accounted = totalBeats + result.noChordBeats;
console.log(`\nDuration check  ${totalBeats} beats of chords + ${result.noChordBeats} of silence = ${accounted} vs ${result.beatCount} in source ${accounted === result.beatCount ? '✓' : '✗'}`);

console.log('\nRound-trip through the /songs/new/ parser');
for (const level of levels) {
  const r = roundTrips[level];
  const ok = r.chords === r.expectedChords && r.beats === r.expectedBeats;
  console.log(`  ${level.padEnd(9)} ${String(r.chords).padStart(4)}/${r.expectedChords} chords  ${String(r.beats).padStart(4)}/${r.expectedBeats} beats  ${r.sections} sections  ${ok ? '✓' : '✗'}`);
}

console.log(`\nWrote ${levels.length + 1} files to ${outDir}\n`);
