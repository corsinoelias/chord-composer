/**
 * ¿Es el propio scheduler una fuente de jank?
 *
 *   npm run test:jank              # reproduciendo
 *   CONTROL=1 npm run test:jank    # control: misma página, sin reproducir
 *   THROTTLE=4 npm run test:jank   # otro nivel de throttling de CPU
 *
 * Cada callback de scheduleSegment crea de golpe todos los nodos de un acorde entero. Si esa
 * ráfaga bloquea el hilo principal el tiempo suficiente, el scheduler se estorba a sí mismo
 * — y esa es la única justificación que le queda a la Fase 6 (repartir el trabajo en ticks
 * de 25 ms en vez de hacerlo por acorde).
 *
 * Se mide de dos formas independientes, porque cada una tiene su punto ciego:
 *
 *   1. PerformanceObserver de 'longtask': lo que el navegador considera bloqueo real
 *      (>50 ms). Es el criterio de verdad, pero no dice quién lo causó.
 *   2. Instrumentando setTimeout: se cronometra cada callback que el motor programa, que
 *      son justo los del scheduler. Atribuye el coste, pero no ve el trabajo de fuera.
 *
 * Y se mide con throttling de CPU, porque en un portátil de escritorio no se reproduce nada.
 */
import { chromium } from 'playwright';

const URL = process.env.URL ?? 'http://127.0.0.1:4327';
const CPU_THROTTLE = Number(process.env.THROTTLE ?? 6);
const SECONDS = 20;

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
const page = await browser.newPage();
const client = await page.context().newCDPSession(page);
await page.goto(`${URL}/about/`, { waitUntil: 'domcontentloaded' });

// Throttling de CPU: el escenario que produjo el retraso de 2,85 s era hardware de móvil.
await client.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE });

const CONTROL_RUN = !!process.env.CONTROL;

const result = await page.evaluate(async ([seconds, CONTROL]) => {
  const engine = await import('/src/lib/audioEngine.ts');
  const { MUSICAL_STYLES } = await import('/src/lib/styles.ts');
  const { resolveVariation } = await import('/src/lib/bassScale.ts');
  const { getSoundType } = await import('/src/lib/instruments.ts');
  const { preloadSampleDir } = await import('/src/lib/bassTab/sampleEngine.ts');

  await engine.preloadAudio();
  await new Promise((r) => setTimeout(r, 3000));

  // El estilo más denso disponible: 8 golpes de guitarra por compás más kit completo.
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

  // 1) Long tasks según el navegador.
  const longTasks = [];
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) longTasks.push(Math.round(e.duration));
    }).observe({ entryTypes: ['longtask'] });
  } catch { /* no soportado */ }

  // 2) Duración de cada callback que el motor programa vía setTimeout.
  const callbackMs = [];
  const realSetTimeout = window.setTimeout;
  window.setTimeout = function (fn, delay, ...rest) {
    if (typeof fn !== 'function') return realSetTimeout.apply(this, [fn, delay, ...rest]);
    return realSetTimeout.call(this, function (...a) {
      const t0 = performance.now();
      try { return fn.apply(this, a); }
      finally { callbackMs.push(performance.now() - t0); }
    }, delay, ...rest);
  };

  const ctx = engine.getAudioContext();
  if (ctx.state === 'suspended') await ctx.resume();
  const noop = { cancel: () => {} };
  const { cancel } = CONTROL ? noop : engine.scheduleProgression(sections, 140, {
    loop: true, metronome: true, instruments, style, transposition: 0,
    getStyle: () => style, getBpm: () => 140,
    getInstruments: () => instruments, getSections: () => sections,
    getBassScale: () => (style.melodic ? resolveVariation(style.melodic.bass, undefined) : null),
    getPianoScale: () => (style.melodic ? resolveVariation(style.melodic.piano, undefined) : null),
    getGuitarScale: () => (style.melodic ? resolveVariation(style.melodic.guitar, undefined) : null),
  });

  await new Promise((r) => realSetTimeout(r, seconds * 1000));
  cancel();
  engine.stopPlayback();
  window.setTimeout = realSetTimeout;

  const sorted = callbackMs.slice().sort((a, b) => a - b);
  const pct = (p) => (sorted.length ? +sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))].toFixed(1) : 0);

  return {
    callbacksDelMotor: sorted.length,
    duracionCallback_ms: {
      mediana: pct(0.5),
      p90: pct(0.9),
      maximo: sorted.length ? +sorted[sorted.length - 1].toFixed(1) : 0,
    },
    longTasks: {
      cuantas: longTasks.length,
      maxima_ms: longTasks.length ? Math.max(...longTasks) : 0,
      total_ms: longTasks.reduce((a, b) => a + b, 0),
    },
    segundosMedidos: seconds,
  };
}, [SECONDS, CONTROL_RUN]);

console.log(`CPU throttling ×${CPU_THROTTLE}, estilo metal, 140 BPM, ${SECONDS}s`);
console.log(JSON.stringify(result, null, 2));
await browser.close();
