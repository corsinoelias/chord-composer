/**
 * Precisión rítmica del scheduler bajo carga.
 *
 *   npm run test:timing                 # con contención de hilo principal (por defecto)
 *   THROTTLE=4 npm run test:timing
 *   CONTENTION=0 npm run test:timing    # sin contención, para aislar
 *
 * Red de seguridad para la Fase 6 (cambiar el scheduler). El arnés golden no sirve: renderiza
 * offline, donde el tiempo es perfecto por construcción. Esta prueba mide la ruta en vivo.
 *
 * CÓMO MIDE, y por qué así:
 *
 * Capturar el audio real exigiría un ScriptProcessor o un AudioWorklet en el hilo principal —
 * es decir, el instrumento perturbaría justo lo que intenta medir. En su lugar se leen los
 * tiempos que el scheduler PLANIFICA (`getStepSchedule()`), que es donde aparece el fallo:
 * cuando el callback llega tarde, `scheduleSegment` aplica su clamp
 * (`segmentStartTime = ctx.currentTime + 0.01`) y el espaciado entre slots consecutivos deja
 * de ser uniforme. Web Audio respeta con precisión los tiempos futuros, así que
 * "planificado" y "sonado" coinciden salvo justo en ese caso — que es el que se busca.
 *
 * Se añade contención sintética del hilo principal (ráfagas de CPU periódicas) porque el
 * problema original aparecía con re-renders de React durante la reproducción, no en reposo.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEV_PORT = Number(process.env.AUDIO_TEST_PORT ?? 4327);
const CPU_THROTTLE = Number(process.env.THROTTLE ?? 6);
const CONTENTION = process.env.CONTENTION !== '0';
const SECONDS = Number(process.env.SECONDS ?? 20);
const args = process.argv.slice(2);
const EXTERNAL_URL = args.includes('--url') ? args[args.indexOf('--url') + 1] : null;

/** Desviación por encima de la cual un hueco entre slots se considera un fallo audible. */
const AUDIBLE_MS = 20;

async function waitForServer(url, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { const r = await fetch(url, { signal: AbortSignal.timeout(2000) }); if (r.ok) return; } catch { /* aún no */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`El servidor de desarrollo no respondió: ${url}`);
}

function startDevServer() {
  const child = spawn('npm', ['run', 'dev', '--', '--port', String(DEV_PORT), '--host', '127.0.0.1'], {
    cwd: join(HERE, '..', '..'), shell: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', () => {});
  child.stderr.on('data', () => {});
  return child;
}

function stopDevServer(child) {
  if (!child?.pid) return;
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else child.kill('SIGTERM');
}

async function runInPage([seconds, contention]) {
  const engine = await import('/src/lib/audioEngine.ts');
  const { MUSICAL_STYLES } = await import('/src/lib/styles.ts');
  const { resolveVariation } = await import('/src/lib/bassScale.ts');
  const { getSoundType } = await import('/src/lib/instruments.ts');
  const { preloadSampleDir } = await import('/src/lib/bassTab/sampleEngine.ts');

  await engine.preloadAudio();
  await new Promise((r) => setTimeout(r, 3000));

  const BPM = 140;
  const style = MUSICAL_STYLES.find((s) => s.id === 'metal');
  const instruments = [
    { id: 'piano', muted: false, solo: false, volume: 0.8, soundTypeId: style.instrumentSounds?.piano ?? 'sampled' },
    { id: 'bass', muted: false, solo: false, volume: 0.8, soundTypeId: style.instrumentSounds?.bass ?? 'fender' },
    { id: 'drums', muted: false, solo: false, volume: 0.8, soundTypeId: style.instrumentSounds?.drums ?? 'standard' },
    { id: 'guitar', muted: false, solo: false, volume: 0.8, soundTypeId: style.instrumentSounds?.guitar ?? 'electric' },
  ];
  const gSound = getSoundType('guitar', instruments[3].soundTypeId);
  const bSound = getSoundType('bass', instruments[1].soundTypeId);
  if (gSound?.sf2Instrument) await engine.ensureGuitarSoundfontLoaded(instruments[3].soundTypeId, gSound.sf2Instrument);
  if (gSound?.samplePath) engine.ensureGuitarSampleType(gSound.samplePath);
  if (bSound?.useSamples && bSound.samplePath) await preloadSampleDir(engine.getAudioContext(), bSound.samplePath);
  await new Promise((r) => setTimeout(r, 1500));

  const chord = (r, q, d) => ({ id: r + q + d, root: r, accidental: '', quality: q, duration: d });
  const sections = [{
    id: 'A', name: 'A', repeatCount: 1,
    chords: [chord('E', '5', 4), chord('C', '5', 4), chord('G', '5', 4), chord('D', '5', 4)],
  }];

  const ctx = engine.getAudioContext();
  if (ctx.state === 'suspended') await ctx.resume();

  const { cancel } = engine.scheduleProgression(sections, BPM, {
    loop: true, metronome: false, instruments, style, transposition: 0,
    getStyle: () => style, getBpm: () => BPM,
    getInstruments: () => instruments, getSections: () => sections,
    getBassScale: () => (style.melodic ? resolveVariation(style.melodic.bass, undefined) : null),
    getPianoScale: () => (style.melodic ? resolveVariation(style.melodic.piano, undefined) : null),
    getGuitarScale: () => (style.melodic ? resolveVariation(style.melodic.guitar, undefined) : null),
  });

  // El schedule está acotado y se recorta, así que hay que ir recogiéndolo. Se deduplica por
  // tiempo: la misma entrada se lee en muchos frames.
  const seen = new Set();
  const times = [];
  const collect = () => {
    for (const e of engine.getStepSchedule()) {
      const key = e.audioTime.toFixed(6);
      if (!seen.has(key)) { seen.add(key); times.push(e.audioTime); }
    }
  };

  // Contención: ráfagas de CPU en el hilo principal, como un re-render de React durante la
  // reproducción. Es el escenario que producía el problema; en reposo no se reproduce.
  let contentionTicks = 0;
  const burn = () => {
    if (!contention) return;
    const until = performance.now() + 80;
    while (performance.now() < until) { /* ocupar el hilo a propósito */ }
    contentionTicks++;
  };

  const t0 = performance.now();
  await new Promise((resolve) => {
    let lastBurn = 0;
    const tick = () => {
      collect();
      const elapsed = performance.now() - t0;
      if (elapsed - lastBurn > 250) { lastBurn = elapsed; burn(); }
      if (elapsed > seconds * 1000) return resolve();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  collect();
  cancel();
  engine.stopPlayback();

  times.sort((a, b) => a - b);
  const expected = 60 / BPM / 4; // duración de un slot de semicorchea
  const deltas = [];
  for (let i = 1; i < times.length; i++) deltas.push(times[i] - times[i - 1]);

  const devsMs = deltas.map((d) => Math.abs(d - expected) * 1000);
  const sorted = devsMs.slice().sort((a, b) => a - b);
  const pct = (p) => (sorted.length ? +sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))].toFixed(2) : 0);

  return {
    slotsCapturados: times.length,
    slotEsperado_ms: +(expected * 1000).toFixed(2),
    desviacion_ms: { mediana: pct(0.5), p95: pct(0.95), maxima: sorted.length ? +sorted[sorted.length - 1].toFixed(2) : 0 },
    huecosAudibles: devsMs.filter((d) => d > 20).length,
    rafagasDeContencion: contentionTicks,
  };
}

async function main() {
  const baseUrl = EXTERNAL_URL ?? `http://127.0.0.1:${DEV_PORT}`;
  let devServer = null;
  if (!EXTERNAL_URL) {
    for (const host of ['127.0.0.1', '[::1]']) {
      try {
        await fetch(`http://${host}:${DEV_PORT}`, { signal: AbortSignal.timeout(1500) });
        console.error(`El puerto ${DEV_PORT} ya está ocupado.`);
        process.exit(2);
      } catch { /* libre */ }
    }
    devServer = startDevServer();
  }

  let browser;
  try {
    await waitForServer(`${baseUrl}/about/`);
    browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
    const page = await browser.newPage();
    const client = await page.context().newCDPSession(page);
    await page.goto(`${baseUrl}/about/`, { waitUntil: 'domcontentloaded' });
    await client.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE });

    const r = await page.evaluate(runInPage, [SECONDS, CONTENTION]);
    console.log(`CPU ×${CPU_THROTTLE}, contención ${CONTENTION ? 'sí' : 'no'}, ${SECONDS}s, metal 140 BPM`);
    console.log(JSON.stringify(r, null, 2));

    console.log('');
    console.log(`Slot esperado: ${r.slotEsperado_ms} ms`);
    console.log(`Desviación mediana ${r.desviacion_ms.mediana} ms, p95 ${r.desviacion_ms.p95} ms, máxima ${r.desviacion_ms.maxima} ms`);
    console.log(`Huecos por encima de ${AUDIBLE_MS} ms: ${r.huecosAudibles} de ${Math.max(0, r.slotsCapturados - 1)}`);
    if (r.slotsCapturados < 50) {
      console.log('  AVISO: pocos slots capturados, la medición no es fiable');
      process.exitCode = 2;
    }
  } finally {
    if (browser) await browser.close();
    stopDevServer(devServer);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
