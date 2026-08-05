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

import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright';
import { fixtures } from './fixtures.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = join(HERE, 'baseline.json');
const DEV_PORT = Number(process.env.AUDIO_TEST_PORT ?? 4321);

/**
 * Deliberately a static page, not /editor/. The engine modules are pulled in by dynamic
 * import straight from the Vite dev server, so the host page only has to be same-origin —
 * and the editor is a bad host: Index.tsx redirects to /app under conditions we do not
 * control, which destroys the execution context mid-run.
 *
 * Trailing slash is required: astro.config.mjs sets trailingSlash: 'always'.
 */
const HOST_PAGE = '/about/';

const args = process.argv.slice(2);
const UPDATE = args.includes('--update');
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const EXTERNAL_URL = args.includes('--url') ? args[args.indexOf('--url') + 1] : null;

/**
 * Absolute RMS delta that counts as a real change. Measured float noise contributes
 * ~3e-8; typical window RMS is ~1e-1. 1e-6 is ~30x the noise and ~100 dB below signal.
 */
const RMS_TOLERANCE = 1e-6;
/** Zero-crossing counts are integers; allow 1 of slack for a crossing sitting on the threshold. */
const ZCR_TOLERANCE = 1;

// ── Dev server ───────────────────────────────────────────────────────────────

async function waitForServer(url, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`El servidor de desarrollo no respondió en ${timeoutMs / 1000}s: ${url}`);
}

function startDevServer() {
  // --host 127.0.0.1 on purpose: left to itself astro dev can bind ::1 only, and Node's
  // fetch resolves "localhost" to 127.0.0.1 first — the connection then never lands.
  const child = spawn('npm', ['run', 'dev', '--', '--port', String(DEV_PORT), '--host', '127.0.0.1'], {
    cwd: join(HERE, '..', '..'),
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', () => {});
  child.stderr.on('data', () => {});
  return child;
}

function stopDevServer(child) {
  if (!child?.pid) return;
  if (process.platform === 'win32') {
    // child.kill() leaves the node process the npm wrapper spawned still holding the port.
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill('SIGTERM');
  }
}

// ── In-page render ───────────────────────────────────────────────────────────

/**
 * Runs inside the browser. Returns a small fingerprint — never the PCM itself, which is
 * megabytes.
 *
 * Takes a single tuple argument because page.evaluate() passes exactly one, and cannot
 * close over anything in this module's scope — it is serialized via toString().
 */
async function renderFingerprint([fixture, seed, windowMs]) {
  const [{ MUSICAL_STYLES }, { renderProgressionOffline }] = await Promise.all([
    import('/src/lib/styles.ts'),
    import('/src/lib/audioEngine.ts'),
  ]);

  const base = MUSICAL_STYLES.find((s) => s.id === fixture.styleId);
  if (!base) throw new Error(`Estilo desconocido: ${fixture.styleId}`);
  const style = fixture.styleOverrides ? { ...base, ...fixture.styleOverrides } : base;

  // mulberry32 — small, fast, stable across engines.
  const makePrng = (a) => () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const realRandom = Math.random;
  Math.random = makePrng(seed);
  let buffer;
  try {
    buffer = await renderProgressionOffline(
      fixture.sections,
      fixture.bpm,
      fixture.instruments,
      style,
      fixture.transposition ?? 0,
    );
  } finally {
    Math.random = realRandom;
  }

  const { numberOfChannels, sampleRate, length } = buffer;
  const channels = [];
  for (let c = 0; c < numberOfChannels; c++) channels.push(buffer.getChannelData(c));

  // Zero-crossing hysteresis: the signal must travel past ±ZC_GATE to count as having
  // crossed. Well above the ~3e-8 render-to-render float noise, well below any real note.
  const ZC_GATE = 1e-4;
  const windowSamples = Math.max(1, Math.round((sampleRate * windowMs) / 1000));

  const rms = [];
  const zcr = [];
  let peak = 0;
  let sumSquares = 0;
  let zcState = 0; // -1 below gate, +1 above gate, 0 undecided

  for (let start = 0; start < length; start += windowSamples) {
    const end = Math.min(length, start + windowSamples);
    let acc = 0;
    let crossings = 0;
    for (let i = start; i < end; i++) {
      let mono = 0;
      for (let c = 0; c < numberOfChannels; c++) {
        const v = channels[c][i];
        const abs = v < 0 ? -v : v;
        if (abs > peak) peak = abs;
        sumSquares += v * v;
        mono += v;
      }
      acc += mono * mono;
      if (mono > ZC_GATE) {
        if (zcState === -1) crossings++;
        zcState = 1;
      } else if (mono < -ZC_GATE) {
        if (zcState === 1) crossings++;
        zcState = -1;
      }
    }
    rms.push(Number(Math.sqrt(acc / Math.max(1, end - start)).toFixed(9)));
    zcr.push(crossings);
  }

  return {
    windowMs,
    rms,
    zcr,
    durationSec: Number((length / sampleRate).toFixed(6)),
    sampleRate,
    channels: numberOfChannels,
    peak: Number(peak.toFixed(8)),
    totalRms: Number(Math.sqrt(sumSquares / (length * numberOfChannels)).toFixed(9)),
  };
}

/** Waits for every sample bank the fixtures touch to finish decoding. */
async function warmUpSamples() {
  const engine = await import('/src/lib/audioEngine.ts');
  await engine.preloadAudio(); // drums (blocking) + piano + guitar-electric
  engine.ensureGuitarSampleType('guitar-acoustic');
  engine.ensureGuitarSampleType('guitar-nylon');
  // ensureGuitarSampleType is fire-and-forget and exposes no promise. This wait is
  // generous for localhost; if it ever isn't, the two-pass determinism check below
  // fails loudly rather than baking a half-loaded render into the baseline.
  await new Promise((r) => setTimeout(r, 4000));
  return engine.areSamplesLoaded();
}

// ── Comparison ───────────────────────────────────────────────────────────────

/**
 * Compares two fingerprints. Returns null when they match within tolerance, otherwise a
 * list of human-readable problems locating the divergence in seconds.
 */
function diff(expected, actual) {
  const problems = [];

  if (expected.durationSec !== actual.durationSec) {
    problems.push(`duración ${expected.durationSec}s → ${actual.durationSec}s`);
  }
  if (expected.channels !== actual.channels || expected.sampleRate !== actual.sampleRate) {
    problems.push(
      `formato ${expected.channels}ch@${expected.sampleRate} → ${actual.channels}ch@${actual.sampleRate}`,
    );
  }
  if (expected.windowMs !== actual.windowMs) {
    problems.push(`ventana ${expected.windowMs}ms → ${actual.windowMs}ms (línea base obsoleta)`);
    return problems;
  }

  const secOf = (i) => ((i * expected.windowMs) / 1000).toFixed(2);
  const n = Math.min(expected.rms.length, actual.rms.length);
  if (expected.rms.length !== actual.rms.length) {
    problems.push(`nº de ventanas ${expected.rms.length} → ${actual.rms.length}`);
  }

  let rmsFirst = -1;
  let rmsMax = 0;
  let rmsCount = 0;
  let zcrFirst = -1;
  let zcrMax = 0;
  let zcrCount = 0;
  for (let i = 0; i < n; i++) {
    const dr = Math.abs(expected.rms[i] - actual.rms[i]);
    if (dr > RMS_TOLERANCE) {
      rmsCount++;
      if (rmsFirst < 0) rmsFirst = i;
      if (dr > rmsMax) rmsMax = dr;
    }
    const dz = Math.abs(expected.zcr[i] - actual.zcr[i]);
    if (dz > ZCR_TOLERANCE) {
      zcrCount++;
      if (zcrFirst < 0) zcrFirst = i;
      if (dz > zcrMax) zcrMax = dz;
    }
  }

  if (rmsCount > 0) {
    problems.push(
      `energía: ${rmsCount}/${n} ventanas, desde ${secOf(rmsFirst)}s, delta máx ${rmsMax.toExponential(2)}`,
    );
  }
  if (zcrCount > 0) {
    problems.push(
      `tono: ${zcrCount}/${n} ventanas con cruces por cero distintos, desde ${secOf(zcrFirst)}s, delta máx ${zcrMax}`,
    );
  }
  if (Math.abs(expected.peak - actual.peak) > RMS_TOLERANCE) {
    problems.push(`pico ${expected.peak} → ${actual.peak}`);
  }
  if (Math.abs(expected.totalRms - actual.totalRms) > RMS_TOLERANCE) {
    problems.push(`RMS total ${expected.totalRms} → ${actual.totalRms}`);
  }

  return problems.length > 0 ? problems : null;
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
    // A dev server left over from an earlier run would silently win the port and serve
    // stale modules, so refuse rather than test the wrong code. Both hostnames are probed
    // on purpose: astro dev left to itself binds ::1, which a 127.0.0.1 probe misses
    // entirely — the check then reports "free", the spawn fails to bind, and the run dies
    // 90s later on a timeout that looks like a slow build.
    let portBusy = false;
    for (const host of ['127.0.0.1', '[::1]']) {
      try {
        await fetch(`http://${host}:${DEV_PORT}`, { signal: AbortSignal.timeout(1500) });
        portBusy = true;
        break;
      } catch {
        /* free on this address */
      }
    }
    if (portBusy) {
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

    await page.goto(`${baseUrl}${HOST_PAGE}`, { waitUntil: 'domcontentloaded' });

    console.log('Cargando bancos de samples …');
    const loaded = await page.evaluate(warmUpSamples);
    if (!loaded) console.warn('  aviso: areSamplesLoaded() devolvió false tras la precarga.');

    const results = {};
    const report = [];
    const seed = 0x5eed;
    const windowMs = 25;

    for (const fixture of selected) {
      process.stdout.write(`  ${fixture.name.padEnd(24)}`);

      // If anything navigated the page away, the decoded sample banks went with it.
      if (!page.url().endsWith(HOST_PAGE)) {
        await page.goto(`${baseUrl}${HOST_PAGE}`, { waitUntil: 'domcontentloaded' });
        await page.evaluate(warmUpSamples);
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
