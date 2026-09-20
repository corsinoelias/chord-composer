/**
 * Audio golden-render regression harness.
 *
 *   npm run test:audio                          # compare against tests/audio/baseline.json
 *   npm run test:audio:update                   # regenerate the baseline
 *   node tests/audio/run-golden.mjs --only swing-jazz
 *   node tests/audio/run-golden.mjs --url http://localhost:4321   # reuse a running dev server
 *
 * renderProgressionOffline() is musically deterministic, so fingerprinting its output
 * turns the whole engine into a regression test.
 *
 * It is NOT bit-exact, though — two identical renders differ by up to ~3e-8 per sample
 * (measured: 8.9% of samples, peak signal 0.27, so ~113 dB down). That is inaudible
 * float noise from Chromium's mixing, but it is enough to flip an int16 rounding
 * boundary, which is why a plain PCM hash is useless as a verdict here. The verdict
 * instead comes from a windowed fingerprint compared with a tolerance far above the
 * noise floor and far below anything audible:
 *
 *   rms — energy per window. Catches missing/extra notes, wrong volumes, timing shifts.
 *   zcr — zero crossings per window, with hysteresis so float noise cannot flip one.
 *         Catches pitch changes, which rms alone is blind to.
 *
 * Math.random is replaced with a seeded PRNG for each render (drum synthesis uses noise
 * buffers, and the acoustic hi-hat picks a round-robin sample at random), then restored.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright';
import { fixtures } from './fixtures.mjs';
import {
  DEV_PORT, HOST_PAGE, SEED, WINDOW_MS,
  waitForServer, startDevServer, stopDevServer, isPortBusy, preparePage, diff,
} from './harness.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = join(HERE, 'baseline.json');

const args = process.argv.slice(2);
const UPDATE = args.includes('--update');
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const EXTERNAL_URL = args.includes('--url') ? args[args.indexOf('--url') + 1] : null;

/**
 * Runs inside the browser. Resolves the fixture's style by id (plus shallow overrides to
 * reach code paths no built-in style exercises) and renders it under a seeded PRNG.
 * Takes a single tuple argument because page.evaluate() passes exactly one.
 */
async function renderFingerprint([fixture, seed, windowMs]) {
  const [{ MUSICAL_STYLES }, { renderProgressionOffline }] = await Promise.all([
    import('/src/lib/styles.ts'),
    import('/src/lib/audioEngine.ts'),
  ]);

  const base = MUSICAL_STYLES.find((s) => s.id === fixture.styleId);
  if (!base) throw new Error(`Estilo desconocido: ${fixture.styleId}`);
  const style = fixture.styleOverrides ? { ...base, ...fixture.styleOverrides } : base;

  const buffer = await window.__withSeed(seed, () =>
    renderProgressionOffline(
      fixture.sections,
      fixture.bpm,
      fixture.instruments,
      style,
      fixture.transposition ?? 0,
    ),
  );
  return window.__fingerprint(buffer, windowMs);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const selected = ONLY ? fixtures.filter((f) => f.name === ONLY) : fixtures;
  if (selected.length === 0) {
    console.error(`No hay ningún fixture llamado "${ONLY}".`);
    process.exit(2);
  }

  const baseUrl = EXTERNAL_URL ?? `http://127.0.0.1:${DEV_PORT}`;
  let devServer = null;

  if (!EXTERNAL_URL) {
    if (await isPortBusy(DEV_PORT)) {
      console.error(
        `El puerto ${DEV_PORT} ya está ocupado. Ciérralo, o reutilízalo con --url ${baseUrl}`,
      );
      process.exit(2);
    }
    console.log(`Arrancando el servidor de desarrollo en ${baseUrl} …`);
    devServer = startDevServer();
  }

  let browser;
  try {
    await waitForServer(`${baseUrl}${HOST_PAGE}`);

    browser = await chromium.launch({
      args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
    });
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));

    console.log('Cargando bancos de samples …');
    const loaded = await preparePage(page, baseUrl);
    if (!loaded) console.warn('  aviso: areSamplesLoaded() devolvió false tras la precarga.');

    const results = {};
    const report = [];
    const seed = SEED;
    const windowMs = WINDOW_MS;

    for (const fixture of selected) {
      process.stdout.write(`  ${fixture.name.padEnd(24)}`);

      // If anything navigated the page away, the decoded sample banks went with it.
      if (!page.url().endsWith(HOST_PAGE)) {
        await preparePage(page, baseUrl);
      }

      // First render is discarded: it warms per-context sample decode paths that would
      // otherwise make render #1 differ from every later one.
      await page.evaluate(renderFingerprint, [fixture, seed, windowMs]);

      const a = await page.evaluate(renderFingerprint, [fixture, seed, windowMs]);
      const b = await page.evaluate(renderFingerprint, [fixture, seed, windowMs]);

      const unstable = diff(a, b);
      if (unstable) {
        console.log('NO DETERMINISTA');
        report.push({ name: fixture.name, status: 'nondeterministic', problems: unstable });
        continue;
      }

      results[fixture.name] = a;
      console.log(
        `${a.durationSec}s  ${a.rms.length} ventanas  pico ${a.peak.toFixed(4)}  rms ${a.totalRms.toFixed(5)}`,
      );
    }

    if (pageErrors.length > 0) {
      console.warn('\nErrores de página durante el render:');
      for (const e of pageErrors.slice(0, 5)) console.warn(`  ${e}`);
    }

    const nondeterministic = report.filter((r) => r.status === 'nondeterministic');

    if (UPDATE) {
      if (nondeterministic.length > 0) {
        console.error('\nNo se escribe la línea base: hay fixtures no deterministas.');
        for (const r of nondeterministic) {
          console.error(`  ${r.name}`);
          for (const p of r.problems) console.error(`      ${p}`);
        }
        process.exit(1);
      }
      const merged = existsSync(BASELINE_PATH)
        ? { ...JSON.parse(readFileSync(BASELINE_PATH, 'utf8')), ...results }
        : results;
      writeFileSync(BASELINE_PATH, JSON.stringify(merged, null, 2) + '\n');
      console.log(`\nLínea base escrita: ${Object.keys(results).length} fixture(s).`);
      return;
    }

    if (!existsSync(BASELINE_PATH)) {
      console.error('\nNo existe tests/audio/baseline.json. Genérala con npm run test:audio:update.');
      process.exit(2);
    }

    const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
    for (const fixture of selected) {
      if (!results[fixture.name]) continue;
      if (!baseline[fixture.name]) {
        report.push({ name: fixture.name, status: 'missing', problems: ['sin línea base'] });
        continue;
      }
      const problems = diff(baseline[fixture.name], results[fixture.name]);
      report.push(
        problems
          ? { name: fixture.name, status: 'changed', problems }
          : { name: fixture.name, status: 'ok' },
      );
    }

    console.log('');
    const failures = report.filter((r) => r.status !== 'ok');
    for (const r of failures) {
      const label =
        r.status === 'changed'
          ? 'CAMBIO AUDIBLE'
          : r.status === 'missing'
            ? 'SIN LÍNEA BASE'
            : 'NO DETERMINISTA';
      console.log(`${label} — ${r.name}`);
      for (const p of r.problems ?? []) console.log(`    ${p}`);
    }

    const ok = report.filter((r) => r.status === 'ok').length;
    console.log(`\n${ok}/${report.length} sin cambios.`);
    if (failures.length > 0) process.exit(1);
  } finally {
    if (browser) await browser.close();
    stopDevServer(devServer);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
