/**
 * Prueba del transporte: Stop y Play seguidos.
 *
 *   node tests/audio/run-transport.mjs
 *
 * El arnés golden (run-golden.mjs) no puede cubrir esto: renderiza offline y una render
 * offline nunca para. Este script mide la ruta ONLINE, que es donde vive el riesgo de la
 * Fase 4 — quitar el cierre del AudioContext en stopPlayback().
 *
 * Dos cosas que medir, con intenciones opuestas:
 *
 *   1. GANANCIA — cuánto tarda en oírse el Play que viene justo después de un Stop.
 *      Cerrar el contexto invalida las cachés indexadas por él (soundfont de guitarra,
 *      samples de bajo, buses, efectos), así que ese segundo Play paga una redecodificación
 *      entera. Es el stall que la fase quiere eliminar.
 *
 *   2. RIESGO — que al dejar de cerrar el contexto vuelva el solape de audio que motivó
 *      cerrarlo. El scheduler programa ~300 ms por delante, así que al parar hay notas ya
 *      encoladas; si no se paran de verdad, "vuelven" sobre el siguiente Play y el nivel
 *      sube. Se detecta comparando el RMS del segundo Play con el del primero.
 *
 * Deliberadamente NO compara "silencio tras el Stop": con el contexto cerrado eso da 0
 * trivialmente, así que la versión antigua saldría perfecta por hacer trampa.
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEV_PORT = Number(process.env.AUDIO_TEST_PORT ?? 4327);
const args = process.argv.slice(2);
const EXTERNAL_URL = args.includes('--url') ? args[args.indexOf('--url') + 1] : null;

/**
 * Un solape haría subir el nivel medio. Medido en la versión que cierra el contexto — donde
 * el solape es imposible — la variación entre pasadas ya llega a 1,2 dB, porque cada Play
 * cae en un punto distinto del loop. 3 dB deja margen sobre ese ruido; un solape real de la
 * señal entera serían +6 dB.
 *
 * Ojo: esta métrica sola no basta, porque un solape parcial (solo la cola del lookahead)
 * se escondería en el ruido. El detector fuerte es SILENCE_RATIO de abajo.
 */
const OVERLAP_TOLERANCE_DB = 3;

/**
 * Tras el Stop no debe quedar audio sonando. Este es el detector directo del riesgo de la
 * fase: si stopAllVoices() se deja algún tipo de nodo sin parar, las notas ya encoladas
 * (hasta ~300 ms de lookahead más sus colas de release) siguen sonando. Se mide a partir de
 * 250 ms para no contar un release legítimo.
 */
const SILENCE_RATIO = 0.02;

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
  throw new Error(`El servidor de desarrollo no respondió: ${url}`);
}

function startDevServer() {
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
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill('SIGTERM');
  }
}

async function runInPage() {
  const engine = await import('/src/lib/audioEngine.ts');
  const { MUSICAL_STYLES } = await import('/src/lib/styles.ts');
  const { getSoundType } = await import('/src/lib/instruments.ts');
  const { preloadSampleDir } = await import('/src/lib/bassTab/sampleEngine.ts');
  const { resolveVariation } = await import('/src/lib/bassScale.ts');

  await engine.preloadAudio();
  await new Promise((r) => setTimeout(r, 3000));

  const chord = (root, quality, duration) => ({ id: root + quality + duration, root, accidental: '', quality, duration });
  const sections = [{
    id: 'A', name: 'A', repeatCount: 1,
    chords: [chord('C', 'maj', 4), chord('G', 'maj', 4), chord('A', 'min', 4), chord('F', 'maj', 4)],
  }];
  // rock_basic a propósito: su guitarra por defecto es un soundfont SF2 y su bajo es
  // sampleado — los dos que dependen de cachés atadas al AudioContext, o sea los que
  // pagan el precio de cerrarlo.
  const style = MUSICAL_STYLES.find((s) => s.id === 'rock_basic');
  const instruments = [
    { id: 'piano', muted: false, solo: false, volume: 0.8, soundTypeId: style.instrumentSounds?.piano ?? 'sampled' },
    { id: 'bass', muted: false, solo: false, volume: 0.8, soundTypeId: style.instrumentSounds?.bass ?? 'fender' },
    { id: 'drums', muted: false, solo: false, volume: 0.8, soundTypeId: style.instrumentSounds?.drums ?? 'standard' },
    { id: 'guitar', muted: false, solo: false, volume: 0.8, soundTypeId: style.instrumentSounds?.guitar ?? 'electric' },
  ];
  const guitarSound = getSoundType('guitar', instruments[3].soundTypeId);
  const bassSound = getSoundType('bass', instruments[1].soundTypeId);

  /** Lo mismo que hace PlaybackContext.play() antes de arrancar el scheduler. */
  const prepare = async () => {
    if (guitarSound?.sf2Instrument) {
      await engine.ensureGuitarSoundfontLoaded(instruments[3].soundTypeId, guitarSound.sf2Instrument);
    }
    if (bassSound?.useSamples && bassSound.samplePath) {
      await preloadSampleDir(engine.getAudioContext(), bassSound.samplePath);
    }
  };

  const scheduleOpts = () => ({
    loop: true, metronome: false, instruments, style, transposition: 0,
    getStyle: () => style, getBpm: () => 120,
    getInstruments: () => instruments, getSections: () => sections,
    getBassScale: () => (style.melodic ? resolveVariation(style.melodic.bass, undefined) : null),
    getPianoScale: () => (style.melodic ? resolveVariation(style.melodic.piano, undefined) : null),
    getGuitarScale: () => (style.melodic ? resolveVariation(style.melodic.guitar, undefined) : null),
  });

  /**
   * Arranca y observa. Devuelve cuánto tardó en oírse algo y el nivel estable.
   * Re-lee contexto y analyser en cada pasada: si el Stop anterior cerró el contexto,
   * los de antes están muertos y medirían 0 para siempre.
   */
  const playAndMeasure = async (seconds) => {
    // El stall de cerrar el contexto NO cae después del play(): cae aquí dentro, porque
    // PlaybackContext.play() también espera a esto antes de arrancar el scheduler. Se
    // cronometra por separado o se mediría como si no existiera.
    const prepareStart = performance.now();
    await prepare();
    const prepareMs = Math.round(performance.now() - prepareStart);
    const ctx = engine.getAudioContext();
    if (ctx.state === 'suspended') await ctx.resume();
    const analyser = engine.getAnalyserNode();
    const buf = new Float32Array(analyser.fftSize);
    const rmsNow = () => {
      analyser.getFloatTimeDomainData(buf);
      let s = 0;
      for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
      return Math.sqrt(s / buf.length);
    };

    const startedAt = performance.now();
    const { cancel } = engine.scheduleProgression(sections, 120, scheduleOpts());

    let firstAudibleMs = null;
    let peak = 0;
    const steady = [];
    await new Promise((resolve) => {
      const tick = () => {
        const elapsed = performance.now() - startedAt;
        const r = rmsNow();
        if (r > peak) peak = r;
        if (firstAudibleMs === null && r > 0.01) firstAudibleMs = Math.round(elapsed);
        // Ignora el primer segundo: es el lookahead más el arranque.
        if (elapsed > 1000) steady.push(r * r);
        if (elapsed > seconds * 1000) return resolve();
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

    const rms = steady.length ? Math.sqrt(steady.reduce((a, v) => a + v, 0) / steady.length) : 0;
    return { cancel, prepareMs, firstAudibleMs, rms: +rms.toFixed(5), peak: +peak.toFixed(4) };
  };

  /**
   * Para y escucha si queda algo sonando. Re-lee el analyser: si el Stop cerró el contexto,
   * el de antes está muerto y esto da 0 — cierto y esperado, porque el usuario tampoco oye
   * nada. La prueba es una guarda de regresión, no una comparación entre versiones.
   */
  const stopAndListen = async () => {
    // Hay que quedarse con el contexto ANTES de parar: getAudioContext() crearía uno nuevo.
    const ctxBefore = engine.getAudioContext();
    engine.stopPlayback();
    // Si el Stop cerró el contexto, esto no es medible: audioEngine no anula analyserNode,
    // así que getAnalyserNode() devuelve el analyser del contexto muerto y
    // getFloatTimeDomainData lee su último frame CONGELADO — un valor alto que parece audio
    // sonando y no lo es. Devolver null y decirlo, en vez de un número inventado.
    if (ctxBefore.state === 'closed') return null;
    const analyser = engine.getAnalyserNode();
    if (!analyser) return 0;
    const buf = new Float32Array(analyser.fftSize);
    const t0 = performance.now();
    let acc = 0;
    let n = 0;
    await new Promise((resolve) => {
      const tick = () => {
        const elapsed = performance.now() - t0;
        if (elapsed > 250) {
          analyser.getFloatTimeDomainData(buf);
          let s = 0;
          for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
          acc += s / buf.length;
          n++;
        }
        if (elapsed > 800) return resolve();
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    return n ? +Math.sqrt(acc / n).toFixed(5) : 0;
  };

  const voiceCount = () => (typeof engine.activeVoiceCount === 'function' ? engine.activeVoiceCount() : null);

  // ── 1) Primer Play, en frío ────────────────────────────────────────────────
  const first = await playAndMeasure(4);
  first.cancel();
  const rmsAfterStop1 = await stopAndListen();
  const voicesAfterStop = voiceCount();

  // ── 2) Play inmediatamente después del Stop ────────────────────────────────
  const second = await playAndMeasure(4);
  second.cancel();
  const rmsAfterStop2 = await stopAndListen();

  // ── 3) Tres ciclos Stop/Play rápidos, buscando solape ──────────────────────
  let worstCyclePeak = 0;
  let worstCycleRms = 0;
  let worstAfterStop = 0;
  for (let i = 0; i < 3; i++) {
    const c = await playAndMeasure(2.2);
    c.cancel();
    const q = await stopAndListen();
    if (c.peak > worstCyclePeak) worstCyclePeak = c.peak;
    if (c.rms > worstCycleRms) worstCycleRms = c.rms;
    if (q > worstAfterStop) worstAfterStop = q;
  }

  return {
    primerPlay: { prepararMs: first.prepareMs, msHastaSonar: first.firstAudibleMs, rms: first.rms, pico: first.peak },
    playTrasStop: { prepararMs: second.prepareMs, msHastaSonar: second.firstAudibleMs, rms: second.rms, pico: second.peak },
    ciclosRapidos: { peorRms: +worstCycleRms.toFixed(5), peorPico: +worstCyclePeak.toFixed(4) },
    rmsTrasStop: { primero: rmsAfterStop1, segundo: rmsAfterStop2, peorDeLosCiclos: worstAfterStop },
    vocesVivasTrasStop: voicesAfterStop,
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
    console.log(`Arrancando el servidor de desarrollo en ${baseUrl} …`);
    devServer = startDevServer();
  }

  let browser;
  try {
    await waitForServer(`${baseUrl}/about/`);
    browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
    await page.goto(`${baseUrl}/about/`, { waitUntil: 'domcontentloaded' });

    const r = await page.evaluate(runInPage);
    console.log(JSON.stringify(r, null, 2));

    if (errors.length) {
      console.log('\nErrores de consola:');
      for (const e of [...new Set(errors)].slice(0, 6)) console.log('  ' + e);
    }

    // Veredicto
    console.log('');
    let failed = false;
    console.log(
      `Preparar antes de sonar: ${r.playTrasStop.prepararMs} ms tras un Stop ` +
      `(primer Play en frío: ${r.primerPlay.prepararMs} ms) — este es el stall que la fase ataca`,
    );
    console.log(`Lookahead hasta el primer sonido: ${r.playTrasStop.msHastaSonar} ms`);

    const dB = (a, b) => 20 * Math.log10(a / b);
    if (r.primerPlay.rms > 0 && r.playTrasStop.rms > 0) {
      const delta = dB(r.playTrasStop.rms, r.primerPlay.rms);
      console.log(`Nivel del Play tras Stop: ${delta >= 0 ? '+' : ''}${delta.toFixed(2)} dB respecto al primero`);
      if (delta > OVERLAP_TOLERANCE_DB) {
        console.log(`  FALLO: por encima de +${OVERLAP_TOLERANCE_DB} dB — audio solapado`);
        failed = true;
      }
      const cycleDelta = dB(r.ciclosRapidos.peorRms, r.primerPlay.rms);
      console.log(`Peor de 3 ciclos rápidos: ${cycleDelta >= 0 ? '+' : ''}${cycleDelta.toFixed(2)} dB`);
      if (cycleDelta > OVERLAP_TOLERANCE_DB) {
        console.log(`  FALLO: por encima de +${OVERLAP_TOLERANCE_DB} dB — audio solapado`);
        failed = true;
      }
    } else {
      console.log('  FALLO: no se midió señal en algún Play');
      failed = true;
    }
    // Detector fuerte del riesgo: tras el Stop no puede quedar audio sonando.
    const limit = r.primerPlay.rms * SILENCE_RATIO;
    const quietValues = [r.rmsTrasStop.primero, r.rmsTrasStop.segundo, r.rmsTrasStop.peorDeLosCiclos]
      .filter((v) => v !== null);
    if (quietValues.length === 0) {
      console.log('Audio residual tras Stop: no medible — el Stop cierra el AudioContext');
    } else {
      const worstQuiet = Math.max(...quietValues);
      console.log(
        `Audio residual tras Stop: ${worstQuiet.toFixed(5)} ` +
        `(límite ${limit.toFixed(5)}, ${(SILENCE_RATIO * 100).toFixed(0)} % del nivel de reproducción)`,
      );
      if (worstQuiet > limit) {
        console.log('  FALLO: sigue sonando audio después del Stop');
        failed = true;
      }
    }

    if (r.vocesVivasTrasStop !== null) {
      console.log(`Voces vivas tras Stop: ${r.vocesVivasTrasStop}`);
      if (r.vocesVivasTrasStop > 0) { console.log('  FALLO: fuga de voces'); failed = true; }
    }

    // exitCode, no process.exit(): process.exit() salta el finally y dejaría el dev server
    // huérfano ocupando el puerto para la siguiente ejecución.
    process.exitCode = failed ? 1 : 0;
  } finally {
    if (browser) await browser.close();
    stopDevServer(devServer);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
