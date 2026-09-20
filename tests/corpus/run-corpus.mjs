/**
 * Real-song regression test: renders every public song and every saved progression the way
 * its page plays it today, and compares against a frozen fingerprint. The safety net for
 * docs/plan-paridad-web-app.md (rule 0: nothing that exists changes how it sounds).
 *
 *   npm run corpus:fetch                      # snapshot the songs (tests/corpus/data/, gitignored)
 *   npm run corpus:update                     # freeze their sound (first time, or a new snapshot)
 *   npm run test:corpus                       # compare against the frozen sound
 *   node tests/corpus/run-corpus.mjs --only pub:washed-elevation-rhythm
 *   node tests/corpus/run-corpus.mjs --kind public --limit 5
 *   node tests/corpus/run-corpus.mjs --only prog:<id> --dump      # write its event list
 *   node tests/corpus/run-corpus.mjs --audio --limit 10           # real audio, slow
 *   node tests/corpus/run-corpus.mjs --url http://127.0.0.1:4327   # reuse a running dev server
 *
 * Two modes, two baselines (tests/corpus/data/baseline-graph.json, baseline-audio.json):
 *
 * - graph (default): records the audio graph the engine builds for the whole song and skips
 *   the rendering (recordGraph in harness.mjs). Exact, ~0.1 s per song, covers every song
 *   end to end. This is the gate.
 * - --audio: renders the audio and compares the windowed fingerprint, like tests/audio/.
 *   Chromium's offline rendering grows with nodes × duration (a 3-minute song takes ~2
 *   minutes), so this is for spot checks with --only / --limit, not the whole corpus.
 *
 * Baselines are local, next to the data: they are keyed by ids of other people's songs.
 *
 * What "the way its page plays it" means is reproduced in renderEntry() below, with the
 * source lines it mirrors. If the page logic changes, this has to change with it — that is
 * the weak point of the harness, and why it cites where each rule comes from.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright';
import {
  DEV_PORT, SEED, WINDOW_MS,
  waitForServer, startDevServer, stopDevServer, isPortBusy, preparePage, diff, diffGraph,
} from '../audio/harness.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, 'data');


const args = process.argv.slice(2);
const arg = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const UPDATE = args.includes('--update');
const ONLY = arg('--only');
const KIND = arg('--kind'); // 'public' | 'progression'
const LIMIT = arg('--limit') ? Number(arg('--limit')) : Infinity;
const EXTERNAL_URL = arg('--url');
const MODE = args.includes('--audio') ? 'audio' : 'graph';
const DUMP = args.includes('--dump');
const BASELINE_PATH = join(DATA, `baseline-${MODE}.json`);
const compare = MODE === 'graph' ? diffGraph : diff;

// ── Entries ──────────────────────────────────────────────────────────────────

function loadEntries() {
  if (!existsSync(join(DATA, 'progressions.json'))) {
    console.error('No hay corpus descargado. Ejecuta primero: npm run corpus:fetch');
    process.exit(2);
  }
  const read = (name) => JSON.parse(readFileSync(join(DATA, name), 'utf8'));
  const settings = read('owner-settings.json');
  const entries = [
    ...read('public-songs.json')
      .filter((s) => s.is_published)
      .map((song) => ({ key: `pub:${song.slug}`, kind: 'public', song })),
    ...read('progressions.json').map((row) => ({
      key: `prog:${row.id}`,
      kind: 'progression',
      song: row.data,
      settings: settings[row.user_id] ?? null,
    })),
  ];
  return entries
    .filter((e) => !KIND || e.kind === KIND)
    .filter((e) => !ONLY || e.key === ONLY)
    .slice(0, LIMIT);
}

// ── In-page render ───────────────────────────────────────────────────────────

/**
 * Runs inside the browser. Builds the exact inputs the page would hand the engine, renders
 * under a seeded PRNG and returns the fingerprint plus what was resolved, so a report can
 * say "this song played as pop_1 because its style does not exist".
 */
async function renderEntry([entry, seed, windowMs, mode, dump]) {
  const [
    { MUSICAL_STYLES, resolveActiveStyle, getStyleByIdWithOverrides },
    { renderProgressionOffline },
    { getDefaultInstrumentStates },
    { getEffectiveInstruments, createInstrumentStatesFromStyle },
    { parseLyricLine },
    { parseChordString },
    { createSection },
    { migrateLegacySong },
    sectionPlayback,
  ] = await Promise.all([
    import('/src/lib/styles.ts'),
    import('/src/lib/audioEngine.ts'),
    import('/src/lib/instruments.ts'),
    import('/src/hooks/useStyleInstruments.ts'),
    import('/src/data/songs.ts'),
    import('/src/lib/chordParser.ts'),
    import('/src/lib/sections.ts'),
    import('/src/lib/songs.ts'),
    // Absent in the code from before per-section arrangements existed, which is exactly
    // the code the baseline is frozen from — so its absence means "no resolver", not an error.
    import('/src/lib/sectionPlayback.ts').catch(() => null),
  ]);
  const makeStyleLookup = sectionPlayback?.makeStyleLookup ?? (() => null);
  const makeOfflineSectionResolver = sectionPlayback?.makeOfflineSectionResolver ?? (() => undefined);

  let sections;
  let bpm;
  let style;
  let instruments;
  let transposition = 0;
  let lookup = makeStyleLookup([], () => null); // public songs: built-in styles only

  if (entry.kind === 'public') {
    // SongChordPlayer.tsx: buildFullSongSections → buildPlayback, one Section per song
    // section, chords from parseLyricLine + parseChordString with the token's duration.
    const song = entry.song;
    sections = song.sections.map((section) => {
      const chords = (section.lines ?? []).flatMap((line) =>
        parseLyricLine(line)
          .filter((t) => t.chord)
          .flatMap((t) => parseChordString(t.chord).map((c) => ({ ...c, duration: t.duration }))),
      );
      const { styleId, trackStyles, patterns, silenced, sounds } = section;
      return { ...createSection(section.name), chords, repeatCount: section.repeatCount ?? 1, styleId, trackStyles, patterns, silenced, sounds };
    });
    bpm = song.bpm; // useState(song.bpm); transpose starts at 0
    // resolvedStyle: built-in styles only, unknown id → MUSICAL_STYLES[0]
    style = MUSICAL_STYLES.find((s) => s.id === song.style) ?? MUSICAL_STYLES[0];
    // instruments: default states (volume 0.7) with the style's sound types layered on;
    // the style's own volumes are NOT applied here, unlike the editor.
    instruments = getEffectiveInstruments(getDefaultInstrumentStates(), style);
  } else {
    // Index.tsx, loading /chord-player/<id> as its owner (getSongForViewer → migrateLegacySong).
    const song = migrateLegacySong(structuredClone(entry.song));
    const customStyles = entry.settings?.customStyles ?? [];
    const overrides = entry.settings?.styleOverrides ?? {};
    const getOverride = (id) => overrides[id] ?? null;
    lookup = makeStyleLookup(customStyles, getOverride);

    sections = song.sections ?? [];
    bpm = song.bpm;
    transposition = song.transposition ?? 0;
    style = resolveActiveStyle(song.styleId, null, customStyles, getOverride);

    // The legacy song.melodic migration (Index.tsx ~429) writes it into the style when the
    // style has none, and from then on that is what plays.
    if (song.melodic) {
      const target = getStyleByIdWithOverrides(song.styleId, [...customStyles, ...MUSICAL_STYLES], getOverride);
      if (target && !target.melodic) style = { ...style, melodic: song.melodic };
    }

    // The editor starts on 'rock_basic' while the song loads (getInitialStyleId), then sets
    // the saved instrumentSettings and the song's style in the same batch. If the resolved
    // style differs from that placeholder, useStyleInstruments fires and replaces every
    // instrument's sound AND volume with the style's, keeping only mute/solo. So what plays
    // is the style's mix, not the saved one — unless the song is on rock_basic.
    const placeholder = resolveActiveStyle('rock_basic', null, customStyles, getOverride);
    const saved = song.instrumentSettings?.length > 0 ? song.instrumentSettings : getDefaultInstrumentStates();
    instruments = style.id !== placeholder.id ? createInstrumentStatesFromStyle(style, saved) : saved;
  }

  const requestedStyle = entry.kind === 'public' ? entry.song.style : entry.song.styleId;
  const info = {
    requestedStyle,
    playedStyle: style.id,
    styleFallback: style.id !== requestedStyle,
    chords: sections.reduce((n, s) => n + s.chords.length, 0),
    instruments: instruments.map((i) => `${i.id}:${i.soundTypeId}@${i.volume}${i.muted ? ':m' : ''}${i.solo ? ':s' : ''}`),
  };
  if (info.chords === 0) return { info, fingerprint: null };

  const render = () => renderProgressionOffline(sections, bpm, instruments, style, transposition, undefined, makeOfflineSectionResolver(lookup));
  if (mode === 'graph') {
    return { info, fingerprint: await window.__withSeed(seed, () => window.__recordGraph(render, dump)) };
  }
  const buffer = await window.__withSeed(seed, render);
  return { info, fingerprint: window.__fingerprint(buffer, windowMs) };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const entries = loadEntries();
  if (entries.length === 0) {
    console.error('Ninguna canción coincide con los filtros.');
    process.exit(2);
  }

  const baseUrl = EXTERNAL_URL ?? `http://127.0.0.1:${DEV_PORT}`;
  let devServer = null;
  if (!EXTERNAL_URL) {
    if (await isPortBusy(DEV_PORT)) {
      console.error(`El puerto ${DEV_PORT} ya está ocupado. Ciérralo, o reutilízalo con --url ${baseUrl}`);
      process.exit(2);
    }
    console.log(`Arrancando el servidor de desarrollo en ${baseUrl} …`);
    devServer = startDevServer();
  }

  const baseline = existsSync(BASELINE_PATH) ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) : {};
  if (!UPDATE && Object.keys(baseline).length === 0) {
    console.error(`No hay línea base del corpus (${MODE}). Congélala con npm run corpus:update${MODE === 'audio' ? ' -- --audio' : ''}`);
    process.exit(2);
  }

  let browser;
  const results = {};
  const report = [];
  const fallbacks = [];
  const started = Date.now();
  try {
    await waitForServer(`${baseUrl}/about/`);
    browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));

    console.log('Cargando bancos de samples …');
    await preparePage(page, baseUrl);

    for (const [i, entry] of entries.entries()) {
      process.stdout.write(`  [${String(i + 1).padStart(3)}/${entries.length}] ${entry.key.padEnd(44)}`);
      if (!page.url().endsWith('/about/')) await preparePage(page, baseUrl);

      let a;
      let b;
      try {
        // Renders until two in a row agree. Notes load on demand: until a note's own sample
        // has arrived, the engine plays the nearest loaded one pitch-shifted (a real effect —
        // a cold first play sounds slightly different), and loading continues in the
        // background after the render returns. What gets frozen is the steady state, once
        // everything the song uses is in. Audio also needs one extra discarded render to warm
        // per-context decode paths.
        const params = [entry, SEED, WINDOW_MS, MODE, DUMP];
        const MAX_TRIES = MODE === 'audio' ? 4 : 8;
        if (MODE === 'audio') await page.evaluate(renderEntry, params);
        b = await page.evaluate(renderEntry, params);
        for (let tries = 1; tries < MAX_TRIES; tries++) {
          a = b;
          if (!a.fingerprint) break;
          if (tries > 1) await page.waitForTimeout(500 * tries); // let background loads land
          b = await page.evaluate(renderEntry, params);
          if (!compare(a.fingerprint, b.fingerprint)) break;
        }
        if (b.fingerprint?.eventList) {
          const out = join(DATA, `dump-${entry.key.replace(/[^\w.-]/g, '_')}.b.txt`);
          writeFileSync(out, b.fingerprint.eventList.join('\n') + '\n');
          delete b.fingerprint.eventList;
        }
      } catch (err) {
        console.log('ERROR');
        report.push({ key: entry.key, status: 'error', problems: [String(err).split('\n')[0]] });
        continue;
      }

      if (a.info.styleFallback) fallbacks.push(`${entry.key}: "${a.info.requestedStyle}" → ${a.info.playedStyle}`);
      if (!a.fingerprint) {
        console.log('sin acordes, se omite');
        continue;
      }
      if (a.fingerprint.eventList) {
        const out = join(DATA, `dump-${entry.key.replace(/[^\w.-]/g, '_')}.txt`);
        writeFileSync(out, a.fingerprint.eventList.join('\n') + '\n');
        delete a.fingerprint.eventList;
        console.log(`(volcado en ${out}) `);
      }
      const unstable = compare(a.fingerprint, b.fingerprint);
      if (unstable) {
        console.log('NO DETERMINISTA');
        report.push({ key: entry.key, status: 'nondeterministic', problems: unstable });
        continue;
      }

      results[entry.key] = { ...a.fingerprint, info: a.info };
      if (UPDATE) {
        console.log(MODE === 'graph' ? `${a.fingerprint.events} eventos  ${a.info.playedStyle}` : `${a.fingerprint.durationSec}s  ${a.info.playedStyle}`);
        continue;
      }
      const expected = baseline[entry.key];
      if (!expected) {
        console.log('sin línea base');
        report.push({ key: entry.key, status: 'missing', problems: ['sin línea base (¿canción nueva desde el último corpus:update?)'] });
        continue;
      }
      const problems = compare(expected, a.fingerprint);
      console.log(problems ? 'CAMBIO' : 'ok');
      report.push(problems ? { key: entry.key, status: 'changed', problems, info: a.info, was: expected.info } : { key: entry.key, status: 'ok' });
    }

    if (pageErrors.length > 0) {
      console.warn('\nErrores de página durante el render:');
      for (const e of [...new Set(pageErrors)].slice(0, 5)) console.warn(`  ${e}`);
    }
  } finally {
    if (browser) await browser.close();
    stopDevServer(devServer);
  }

  const minutes = ((Date.now() - started) / 60000).toFixed(1);
  if (fallbacks.length > 0) {
    console.log(`\n${fallbacks.length} canciones suenan con otro estilo del que piden (fallback de hoy, se conserva):`);
    for (const f of fallbacks.slice(0, 10)) console.log(`  ${f}`);
    if (fallbacks.length > 10) console.log(`  … y ${fallbacks.length - 10} más`);
  }

  const broken = report.filter((r) => r.status === 'nondeterministic' || r.status === 'error');
  if (UPDATE) {
    if (broken.length > 0) {
      console.error('\nNo se escribe la línea base: hay canciones no deterministas o con error.');
      for (const r of broken) console.error(`  ${r.key}: ${r.problems.join('; ')}`);
      process.exit(1);
    }
    const merged = { ...baseline, ...results };
    writeFileSync(BASELINE_PATH, JSON.stringify(merged) + '\n');
    console.log(`\nLínea base del corpus escrita: ${Object.keys(results).length} canciones (${minutes} min).`);
    return;
  }

  console.log('');
  const failures = report.filter((r) => r.status !== 'ok');
  for (const r of failures) {
    const label = { changed: 'CAMBIO AUDIBLE', missing: 'SIN LÍNEA BASE', nondeterministic: 'NO DETERMINISTA', error: 'ERROR' }[r.status];
    console.log(`${label} — ${r.key}`);
    for (const p of r.problems ?? []) console.log(`    ${p}`);
    if (r.status === 'changed' && JSON.stringify(r.info) !== JSON.stringify(r.was)) {
      console.log(`    entradas: ${JSON.stringify(r.was)} → ${JSON.stringify(r.info)}`);
    }
  }
  const ok = report.filter((r) => r.status === 'ok').length;
  console.log(`\n${ok}/${report.length} sin cambios (${minutes} min).`);
  if (failures.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
