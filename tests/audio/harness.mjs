/**
 * Pieces shared by the golden-render harness (run-golden.mjs, synthetic fixtures) and the
 * corpus harness (tests/corpus/run-corpus.mjs, every real song). Both render through
 * renderProgressionOffline() in headless Chromium and compare a windowed fingerprint —
 * see run-golden.mjs for why it is not a PCM hash.
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

// Deliberately NOT 4321: that is `npm run dev`'s default, and this script spawns and then
// force-kills whatever holds the port. Sharing it means a test run silently takes down the
// dev server someone is using — which looks exactly like an audio bug, because the samples
// that load lazily at play time (bass, guitar soundfonts) go quiet while the preloaded ones
// (piano, drums) keep working.
export const DEV_PORT = Number(process.env.AUDIO_TEST_PORT ?? 4327);

/**
 * Deliberately a static page, not /editor/. The engine modules are pulled in by dynamic
 * import straight from the Vite dev server, so the host page only has to be same-origin —
 * and the editor is a bad host: Index.tsx redirects to /app under conditions we do not
 * control, which destroys the execution context mid-run.
 *
 * Trailing slash is required: astro.config.mjs sets trailingSlash: 'always'.
 */
export const HOST_PAGE = '/about/';

/**
 * Absolute RMS delta that counts as a real change. Measured float noise contributes
 * ~3e-8; typical window RMS is ~1e-1. 1e-6 is ~30x the noise and ~100 dB below signal.
 */
export const RMS_TOLERANCE = 1e-6;
/** Zero-crossing counts are integers; allow 1 of slack for a crossing sitting on the threshold. */
export const ZCR_TOLERANCE = 1;

export const SEED = 0x5eed;
export const WINDOW_MS = 25;

// ── Dev server ───────────────────────────────────────────────────────────────

export async function waitForServer(url, timeoutMs = 90_000) {
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

export function startDevServer() {
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

export function stopDevServer(child) {
  if (!child?.pid) return;
  if (process.platform === 'win32') {
    // child.kill() leaves the node process the npm wrapper spawned still holding the port.
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill('SIGTERM');
  }
}

/**
 * A dev server left over from an earlier run would silently win the port and serve
 * stale modules, so refuse rather than test the wrong code. Both hostnames are probed
 * on purpose: astro dev left to itself binds ::1, which a 127.0.0.1 probe misses
 * entirely — the check then reports "free", the spawn fails to bind, and the run dies
 * 90s later on a timeout that looks like a slow build.
 */
export async function isPortBusy(port) {
  for (const host of ['127.0.0.1', '[::1]']) {
    try {
      await fetch(`http://${host}:${port}`, { signal: AbortSignal.timeout(1500) });
      return true;
    } catch {
      /* free on this address */
    }
  }
  return false;
}

// ── In-page helpers ──────────────────────────────────────────────────────────

/**
 * Runs inside the browser (installed as window.__fingerprint by installPageHelpers).
 * Returns a small fingerprint — never the PCM itself, which is megabytes.
 */
function fingerprintBuffer(buffer, windowMs) {
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

/**
 * Runs inside the browser (window.__withSeed). Replaces Math.random with a seeded PRNG
 * for the duration of one render: drum synthesis uses noise buffers, and the acoustic
 * hi-hat picks a round-robin sample at random.
 */
async function withSeed(seed, fn) {
  // mulberry32 — small, fast, stable across engines.
  let a = seed;
  const prng = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const realRandom = Math.random;
  Math.random = prng;
  try {
    return await fn();
  } finally {
    Math.random = realRandom;
  }
}

/**
 * Runs inside the browser (window.__recordGraph). Records the audio graph an offline render
 * builds — every node, every param value and automation call, every connection, every
 * start/stop, every buffer by content — and skips the actual rendering.
 *
 * Why: Chromium's offline rendering cost grows with (scheduled nodes × duration), so a
 * 3-minute song takes ~2 minutes to render and the whole corpus ~6 hours. Building the graph
 * takes ~0.1 s. Same graph + same buffers ⇒ same audio, so comparing graphs catches every
 * change the engine's code can make, exactly (no tolerances: every value is computed by the
 * same JS). What it cannot see is outside the graph — a sample file replaced on disk still
 * hashes differently, since buffers are hashed by content, but a browser DSP change does not.
 * The audio fingerprint stays for that, on fewer songs.
 *
 * `fn` must create its OfflineAudioContext(s) while recording is on. Returns a compact
 * summary: overall hash, hashes per chunk of events (to locate a divergence), counts per
 * event kind, and optionally the full event list (for --dump).
 */
async function recordGraph(fn, keepEvents) {
  const events = [];
  const ids = new WeakMap(); // node/param/buffer → label
  let nextNode = 0;
  const bufferHashes = new WeakMap();
  const restore = [];

  const fmt = (v) => {
    if (v === null || v === undefined) return String(v);
    if (typeof v === 'number') return Object.is(v, -0) ? '0' : String(v);
    if (ids.has(v)) return ids.get(v);
    if (v instanceof AudioBuffer) return hashBuffer(v);
    if (v instanceof Float32Array || Array.isArray(v)) return `arr${v.length}:${hashArray(v)}`;
    if (v instanceof PeriodicWave) return 'periodicWave';
    return String(v);
  };
  const log = (...parts) => events.push(parts.map(fmt).join('|'));

  function hashArray(arr, stride = 1) {
    let h = 0x811c9dc5;
    for (let i = 0; i < arr.length; i += stride) {
      const x = Math.round(arr[i] * 1e7);
      h ^= x & 0xffff; h = Math.imul(h, 0x01000193);
      h ^= (x >>> 16) & 0xffff; h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16);
  }
  function hashBuffer(buf) {
    if (bufferHashes.has(buf)) return bufferHashes.get(buf);
    const stride = buf.length > 20000 ? 7 : 1;
    const parts = [];
    for (let c = 0; c < buf.numberOfChannels; c++) parts.push(hashArray(buf.getChannelData(c), stride));
    const h = `buf${buf.numberOfChannels}x${buf.length}@${buf.sampleRate}:${parts.join(',')}`;
    bufferHashes.set(buf, h);
    return h;
  }

  const patch = (proto, name, wrap) => {
    const orig = proto[name];
    if (typeof orig !== 'function') return;
    proto[name] = wrap(orig);
    restore.push(() => { proto[name] = orig; });
  };
  const patchSetter = (proto, name, onSet) => {
    const desc = Object.getOwnPropertyDescriptor(proto, name);
    if (!desc?.set) return;
    Object.defineProperty(proto, name, {
      ...desc,
      set(v) { onSet(this, v); desc.set.call(this, v); },
    });
    restore.push(() => Object.defineProperty(proto, name, desc));
  };

  const offline = new WeakSet();
  const registerNode = (node, type) => {
    const label = `n${nextNode++}`;
    ids.set(node, label);
    for (let p = node; p && p !== AudioNode.prototype; p = Object.getPrototypeOf(p)) {
      for (const key of Object.getOwnPropertyNames(p)) {
        let value;
        try { value = node[key]; } catch { continue; }
        if (value instanceof AudioParam && !ids.has(value)) {
          ids.set(value, `${label}.${key}`);
          log('init', value, value.value);
        }
      }
    }
    log('create', label, type);
  };

  // Every factory method a BaseAudioContext has; recorded only for offline contexts.
  for (const name of Object.getOwnPropertyNames(BaseAudioContext.prototype)) {
    if (!name.startsWith('create') || name === 'createBuffer' || name === 'createPeriodicWave') continue;
    patch(BaseAudioContext.prototype, name, (orig) => function (...args) {
      const node = orig.apply(this, args);
      if (offline.has(this) && node instanceof AudioNode) registerNode(node, name.slice(6));
      return node;
    });
  }
  const OrigOffline = window.OfflineAudioContext;
  window.OfflineAudioContext = function (...args) {
    const ctx = new OrigOffline(...args);
    offline.add(ctx);
    ids.set(ctx.destination, 'dest');
    log('context', ...(typeof args[0] === 'object' ? [args[0].numberOfChannels, args[0].length, args[0].sampleRate] : args));
    return ctx;
  };
  window.OfflineAudioContext.prototype = OrigOffline.prototype;
  restore.push(() => { window.OfflineAudioContext = OrigOffline; });
  patch(OrigOffline.prototype, 'startRendering', () => function () {
    log('render');
    return Promise.resolve(new AudioBuffer({ numberOfChannels: 2, length: 1, sampleRate: this.sampleRate }));
  });

  const tracked = (x) => ids.has(x);
  for (const method of ['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime', 'setTargetAtTime', 'setValueCurveAtTime', 'cancelScheduledValues', 'cancelAndHoldAtTime']) {
    patch(AudioParam.prototype, method, (orig) => function (...args) {
      if (tracked(this)) log(method, this, ...args);
      return orig.apply(this, args);
    });
  }
  patchSetter(AudioParam.prototype, 'value', (p, v) => { if (tracked(p)) log('value', p, v); });
  patch(AudioNode.prototype, 'connect', (orig) => function (...args) {
    if (tracked(this)) log('connect', this, ...args);
    return orig.apply(this, args);
  });
  patch(AudioNode.prototype, 'disconnect', (orig) => function (...args) {
    if (tracked(this)) log('disconnect', this, ...args);
    return orig.apply(this, args);
  });
  for (const method of ['start', 'stop']) {
    patch(AudioScheduledSourceNode.prototype, method, (orig) => function (...args) {
      if (tracked(this)) log(method, this, ...args);
      return orig.apply(this, args);
    });
  }
  patch(OscillatorNode.prototype, 'setPeriodicWave', (orig) => function (...args) {
    if (tracked(this)) log('periodicWave', this);
    return orig.apply(this, args);
  });
  const attrs = [
    [AudioBufferSourceNode.prototype, ['buffer', 'loop', 'loopStart', 'loopEnd']],
    [OscillatorNode.prototype, ['type']],
    [BiquadFilterNode.prototype, ['type']],
    [WaveShaperNode.prototype, ['curve', 'oversample']],
    [ConvolverNode.prototype, ['buffer', 'normalize']],
    [AudioNode.prototype, ['channelCount', 'channelCountMode', 'channelInterpretation']],
  ];
  for (const [proto, names] of attrs) {
    for (const name of names) patchSetter(proto, name, (node, v) => { if (tracked(node)) log('set', node, name, v); });
  }

  try {
    await fn();
  } finally {
    for (const undo of restore.reverse()) undo();
  }

  const fnv = (h, s) => {
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h;
  };
  const CHUNK = 2000;
  const chunks = [];
  let total = 0x811c9dc5;
  for (let i = 0; i < events.length; i += CHUNK) {
    let h = 0x811c9dc5;
    for (const e of events.slice(i, i + CHUNK)) { h = fnv(h, e + '\n'); total = fnv(total, e + '\n'); }
    chunks.push((h >>> 0).toString(16));
  }
  const counts = {};
  for (const e of events) {
    const bar = e.indexOf('|');
    const k = bar < 0 ? e : e.slice(0, bar);
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return {
    hash: (total >>> 0).toString(16),
    events: events.length,
    chunkSize: CHUNK,
    chunks,
    counts,
    ...(keepEvents ? { eventList: events } : {}),
  };
}

/**
 * page.evaluate() serializes functions via toString() and cannot close over this module,
 * so the shared in-page helpers are installed on window once per page load.
 */
export async function installPageHelpers(page) {
  await page.evaluate(
    `window.__fingerprint = ${fingerprintBuffer.toString()};\n` +
      `window.__withSeed = ${withSeed.toString()};\n` +
      `window.__recordGraph = ${recordGraph.toString()};`,
  );
}

/** Compares two graph summaries. Null when identical, otherwise where they part ways. */
export function diffGraph(expected, actual) {
  if (expected.hash === actual.hash) return null;
  const problems = [];
  if (expected.events !== actual.events) problems.push(`eventos ${expected.events} → ${actual.events}`);
  const first = expected.chunks.findIndex((h, i) => actual.chunks[i] !== h);
  if (first >= 0) {
    problems.push(`primer bloque distinto: eventos ${first * expected.chunkSize}–${(first + 1) * expected.chunkSize - 1}`);
  }
  const kinds = new Set([...Object.keys(expected.counts), ...Object.keys(actual.counts)]);
  for (const k of kinds) {
    if (expected.counts[k] !== actual.counts[k]) problems.push(`${k}: ${expected.counts[k] ?? 0} → ${actual.counts[k] ?? 0}`);
  }
  if (problems.length === 0) problems.push('mismos recuentos, valores distintos (usa --dump para ver cuáles)');
  return problems;
}

/** Runs inside the browser. Waits for every sample bank the renders touch to finish decoding. */
export async function warmUpSamples() {
  const engine = await import('/src/lib/audioEngine.ts');
  await engine.preloadAudio(); // drums (blocking) + piano + guitar-electric
  engine.ensureGuitarSampleType('guitar-acoustic');
  engine.ensureGuitarSampleType('guitar-nylon');
  // ensureGuitarSampleType is fire-and-forget and exposes no promise. This wait is
  // generous for localhost; if it ever isn't, the two-pass determinism check
  // fails loudly rather than baking a half-loaded render into the baseline.
  await new Promise((r) => setTimeout(r, 4000));
  return engine.areSamplesLoaded();
}

/** Opens the host page and gets it ready to render: helpers installed, samples decoded. */
export async function preparePage(page, baseUrl) {
  await page.goto(`${baseUrl}${HOST_PAGE}`, { waitUntil: 'domcontentloaded' });
  await installPageHelpers(page);
  return page.evaluate(warmUpSamples);
}

// ── Comparison ───────────────────────────────────────────────────────────────

/**
 * Compares two fingerprints. Returns null when they match within tolerance, otherwise a
 * list of human-readable problems locating the divergence in seconds.
 */
export function diff(expected, actual) {
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
