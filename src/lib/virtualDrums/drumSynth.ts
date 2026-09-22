// Ported verbatim (formulas unchanged) from the user's Claude Design project
// "Batería Virtual Interactiva" (drum-synth.js) — layered Web Audio synthesis.
// Electronic kit is pure synthesis. Acoustic kit plays real sampled sounds
// from /audio/drums/ (see ACOUSTIC_SAMPLE_PATHS below) and only falls back to
// synthesis for a piece whose sample hasn't loaded (or been sourced) yet.

export type DrumPieceId =
  | 'kick' | 'snare' | 'stick'
  | 'tom-hi' | 'tom-lo' | 'tom-floor'
  | 'hh-closed' | 'hh-open' | 'hh-foot'
  | 'crash-edge' | 'crash-body' | 'crash-bell'
  | 'ride-edge' | 'ride-body' | 'ride-bell'

export type DrumKitId = 'acoustic' | 'electronic'

// Real sampled sounds for the Acoustic kit — the same /audio/drums/*.mp3
// files the Chord Player's web engine used before the app's engine replaced
// it, loaded here on their own. Any path that 404s (e.g. a zone-specific
// crash/ride file, sourced separately) just leaves that key unset — the
// synthesized ac* function below is used for that piece until the file
// shows up.
type AcousticSampleKey =
  | 'kick' | 'snare' | 'stick'
  | 'hhClosed' | 'hhOpen1' | 'hhOpen2' | 'hhOpen3' | 'hhFoot1' | 'hhFoot2'
  | 'tomHi' | 'tomLo' | 'tomFloor'
  | 'crashEdge' | 'crashBody' | 'crashBell'
  | 'rideEdge' | 'rideBody' | 'rideBell'

const ACOUSTIC_SAMPLE_PATHS: Record<AcousticSampleKey, string> = {
  kick: '/audio/drums/kick.mp3',
  snare: '/audio/drums/snare-drum.mp3',
  stick: '/audio/drums/snare-stick.mp3',
  hhClosed: '/audio/drums/hihat.mp3',
  hhOpen1: '/audio/drums/hihat-open.mp3',
  hhOpen2: '/audio/drums/hihat-open-2.mp3',
  hhOpen3: '/audio/drums/hihat-open-3.mp3',
  hhFoot1: '/audio/drums/hihat-foot.mp3',
  hhFoot2: '/audio/drums/hihat-foot-2.mp3',
  tomHi: '/audio/drums/tom1.mp3',
  tomLo: '/audio/drums/tom2.mp3',
  tomFloor: '/audio/drums/floor-tom.mp3',
  crashEdge: '/audio/drums/crash.mp3',
  crashBody: '/audio/drums/crash-body.mp3',
  crashBell: '/audio/drums/crash-bell.mp3',
  rideEdge: '/audio/drums/ride-edge.mp3',
  rideBody: '/audio/drums/ride.mp3',
  rideBell: '/audio/drums/ride-bell.mp3',
}

export interface DrumEngine {
  // `time` is an AudioContext.currentTime-relative timestamp for sample-accurate
  // scheduling; omit it (or pass a past/undefined value) to play immediately.
  play(kit: DrumKitId, id: DrumPieceId, vel?: number, time?: number): void
  // Current AudioContext clock, for schedulers that look ahead of "now". Creates
  // the context (without unlocking audio) if it doesn't exist yet.
  now(): number
  // The engine's own AudioContext. Exposed so a scheduler built on top of this
  // engine (the Drum Tab Player transport) can put its metronome click on the
  // same clock as the kit — two AudioContexts drift against each other, and a
  // click that drifts from the drums is worse than no click.
  context(): AudioContext
  setVolume(v: number): void
  setReverb(v: number): void
  /**
   * Resolves once the acoustic samples have loaded (or failed to).
   *
   * Live playback does not need this — a piece whose sample has not arrived
   * falls back to synthesis for one stroke and nobody notices. A render does:
   * an export started a moment too early would be a whole file of fallback
   * sounds, silently different from what the app was playing.
   */
  samplesReady(): Promise<void>
  /** The decoded samples, to hand to an offline engine instead of re-fetching. */
  sampleCache(): Partial<Record<AcousticSampleKey, AudioBuffer>>
}

export interface DrumEngineOptions {
  /**
   * Render into a context that already exists instead of opening one.
   *
   * This is what makes an offline render possible: an `OfflineAudioContext`
   * passed here gets the identical signal chain (compressor, saturator, master,
   * convolution reverb) and the identical voices, so a WAV export is the same
   * kit the speakers were playing rather than a second implementation of it
   * that would drift from the first.
   */
  context?: BaseAudioContext
  /**
   * Decoded acoustic samples to reuse. An offline context can play buffers
   * decoded by the live one — they only have to agree on sample rate — so
   * handing them over avoids re-fetching every hit of the kit to export.
   */
  samples?: Partial<Record<AcousticSampleKey, AudioBuffer>>
}

export function createDrumEngine(options: DrumEngineOptions = {}): DrumEngine {
  let ctx: BaseAudioContext | null = null
  let master: GainNode | null = null
  let wet: GainNode | null = null
  let noiseBuf: AudioBuffer | null = null
  let vol = 0.9
  let rev = 0.25
  const samples: Partial<Record<AcousticSampleKey, AudioBuffer>> = { ...options.samples }
  /** Resolves once every sample that is going to load has. */
  let loaded: Promise<void> = Promise.resolve()

  function ensure() {
    if (ctx) {
      // An OfflineAudioContext also reports "suspended" until it renders, and
      // resuming one outside of a render throws — so only a context this engine
      // opened itself is ever unlocked here.
      if (!options.context && ctx.state === 'suspended') (ctx as AudioContext).resume()
      return
    }
    ctx = options.context ?? new AudioContext()

    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -12; comp.knee.value = 18; comp.ratio.value = 4
    comp.attack.value = 0.003; comp.release.value = 0.22
    comp.connect(ctx.destination)

    const sat = ctx.createWaveShaper()
    sat.curve = makeSatCurve(1.6)
    sat.oversample = '2x'
    sat.connect(comp)

    master = ctx.createGain(); master.gain.value = vol; master.connect(sat)

    const conv = ctx.createConvolver()
    conv.buffer = makeIR(2.2)
    const revLp = ctx.createBiquadFilter(); revLp.type = 'lowpass'; revLp.frequency.value = 6500
    wet = ctx.createGain(); wet.gain.value = rev
    wet.connect(conv); conv.connect(revLp); revLp.connect(master)

    noiseBuf = makeNoise(2)

    // Samples handed in are already decoded; only fetch what is missing, which
    // for an offline render is usually nothing at all.
    const pending = (Object.keys(ACOUSTIC_SAMPLE_PATHS) as AcousticSampleKey[])
      .filter(key => !samples[key])
      .map(key =>
        fetch(ACOUSTIC_SAMPLE_PATHS[key])
          .then(res => (res.ok ? res.arrayBuffer() : Promise.reject(res.status)))
          .then(arrayBuffer => ctx!.decodeAudioData(arrayBuffer))
          .then(buf => { samples[key] = buf })
          .catch(() => { /* not sourced yet — synthesized fallback is used until it is */ }),
      )
    loaded = Promise.all(pending).then(() => undefined)
  }

  function playSample(buf: AudioBuffer, t: number, v: number, gainMul: number, wetAmt: number) {
    const src = ctx!.createBufferSource()
    src.buffer = buf
    const g = ctx!.createGain()
    g.gain.value = Math.max(0.0001, v * gainMul)
    src.connect(g); g.connect(master!)
    if (wetAmt > 0) {
      const ws = ctx!.createGain(); ws.gain.value = wetAmt
      g.connect(ws); ws.connect(wet!)
    }
    src.start(t)
  }

  function makeSatCurve(k: number) {
    const n = 1024
    const c = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1
      c[i] = Math.tanh(k * x) / Math.tanh(k)
    }
    return c
  }
  function makeNoise(dur: number) {
    const b = ctx!.createBuffer(1, ctx!.sampleRate * dur, ctx!.sampleRate)
    const d = b.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    return b
  }
  function makeIR(dur: number) {
    const len = Math.floor(ctx!.sampleRate * dur)
    const b = ctx!.createBuffer(2, len, ctx!.sampleRate)
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c)
      let lp = 0
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1
        lp = lp * 0.55 + w * 0.45
        d[i] = lp * Math.pow(1 - i / len, 2.4)
      }
    }
    return b
  }

  function bus(peak: number, t: number, dec: number, wetAmt: number, hold?: number) {
    const g = ctx!.createGain()
    const p = Math.max(peak, 0.0001)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(p, t + 0.002)
    const h = hold || dec * 0.18
    g.gain.setValueAtTime(p, t + 0.002)
    g.gain.exponentialRampToValueAtTime(p * 0.35, t + h)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dec)
    g.connect(master!)
    if (wetAmt > 0) {
      const ws = ctx!.createGain(); ws.gain.value = wetAmt
      g.connect(ws); ws.connect(wet!)
    }
    return g
  }
  function osc(type: OscillatorType, f: number, t: number, dur: number) {
    const o = ctx!.createOscillator(); o.type = type
    o.frequency.setValueAtTime(f, t)
    o.start(t); o.stop(t + dur + 0.15)
    return o
  }
  function noiseSrc(t: number, dur: number) {
    const s = ctx!.createBufferSource(); s.buffer = noiseBuf; s.loop = true
    s.playbackRate.value = 0.96 + Math.random() * 0.08
    s.start(t); s.stop(t + dur + 0.15)
    return s
  }
  function filt(type: BiquadFilterType, f: number, q?: number) {
    const fl = ctx!.createBiquadFilter()
    fl.type = type; fl.frequency.value = f
    if (q) fl.Q.value = q
    return fl
  }
  function metalBank(t: number, dur: number, base: number) {
    const g = ctx!.createGain(); g.gain.value = 0.6
    ;[1, 1.34, 1.72, 2.15, 2.63, 3.22, 4.16, 5.43, 6.79, 8.21].forEach(r => {
      const det = 1 + (Math.random() - 0.5) * 0.015
      osc('square', base * r * det, t, dur).connect(g)
    })
    return g
  }
  function tick(t: number, v: number, hpf: number, dec: number, peak: number, wetAmt?: number) {
    const g = bus(peak * v, t, dec, wetAmt || 0.15)
    const f = filt('highpass', hpf)
    noiseSrc(t, dec).connect(f); f.connect(g)
  }

  // ---------- acoustic ----------
  function acKick(t: number, v: number) {
    const g = bus(1.3 * v, t, 0.55, 0.08, 0.1)
    const o = osc('sine', 170, t, 0.6)
    o.frequency.setValueAtTime(170, t)
    o.frequency.exponentialRampToValueAtTime(52, t + 0.055)
    o.frequency.exponentialRampToValueAtTime(44, t + 0.4)
    o.connect(g)
    const kg = bus(0.28 * v, t, 0.09, 0.1)
    osc('triangle', 95, t, 0.1).connect(kg)
    const cg = bus(0.5 * v, t, 0.025, 0)
    const bp = filt('bandpass', 3200, 1.2)
    noiseSrc(t, 0.04).connect(bp); bp.connect(cg)
  }
  function acSnare(t: number, v: number) {
    const body = bus(0.42 * v, t, 0.17, 0.3, 0.03)
    ;[176, 224, 330, 442].forEach((f, i) => {
      const og = ctx!.createGain(); og.gain.value = [1, 0.6, 0.5, 0.3][i]
      const o = osc(i < 2 ? 'sine' : 'triangle', f, t, 0.2)
      o.connect(og); og.connect(body)
    })
    const ng = bus(0.9 * v, t, 0.28, 0.55, 0.05)
    const hp = filt('highpass', 1400)
    const pk = filt('peaking', 4200, 1); pk.gain.value = 6
    noiseSrc(t, 0.3).connect(hp); hp.connect(pk); pk.connect(ng)
    const bg = bus(0.35 * v, t, 0.18, 0.3)
    const bp2 = filt('bandpass', 800, 0.8)
    noiseSrc(t, 0.2).connect(bp2); bp2.connect(bg)
    tick(t, v, 3000, 0.02, 0.5, 0.25)
  }
  function acStick(t: number, v: number) {
    const g = bus(0.6 * v, t, 0.09, 0.35, 0.015)
    osc('sine', 810, t, 0.1).connect(g)
    osc('sine', 1650, t, 0.06).connect(g)
    osc('triangle', 2400, t, 0.04).connect(g)
    tick(t, v, 2500, 0.018, 0.4, 0.25)
  }
  function acTom(t: number, v: number, f1: number, f2: number, dec: number, peak: number) {
    const g = bus(peak * v, t, dec, 0.35, dec * 0.25)
    const o = osc('sine', f1, t, dec + 0.05)
    o.frequency.exponentialRampToValueAtTime(f2, t + dec * 0.5)
    o.connect(g)
    const o2 = osc('triangle', f1 * 1.5, t, dec * 0.4)
    const g2 = bus(peak * 0.3 * v, t, dec * 0.4, 0.2)
    o2.frequency.exponentialRampToValueAtTime(f2 * 1.5, t + dec * 0.4)
    o2.connect(g2)
    const sg = bus(0.3 * v, t, 0.03, 0.15)
    const bp = filt('bandpass', 2000, 1)
    noiseSrc(t, 0.04).connect(bp); bp.connect(sg)
  }
  function acHat(t: number, v: number, dec: number, peak: number) {
    const g = bus(peak * v, t, dec, 0.2)
    const bp = filt('bandpass', 9500, 1)
    const hp = filt('highpass', 7200)
    metalBank(t, dec + 0.1, 130).connect(bp); bp.connect(hp); hp.connect(g)
    const ng = bus(peak * 0.6 * v, t, dec * 0.9, 0.15)
    const nh = filt('highpass', 9000)
    noiseSrc(t, dec).connect(nh); nh.connect(ng)
  }
  function wash(t: number, v: number, dec: number, peak: number, hpf: number) {
    const g = bus(peak * v, t, dec, 0.9, dec * 0.12)
    const hp = filt('highpass', hpf)
    const pk = filt('peaking', 8500, 0.8); pk.gain.value = 5
    noiseSrc(t, dec).connect(hp); hp.connect(pk); pk.connect(g)
    const mg = bus(peak * 0.5 * v, t, dec * 0.85, 0.7)
    const mh = filt('highpass', 5200)
    metalBank(t, dec * 0.85, 82).connect(mh); mh.connect(mg)
    tick(t, v, 4500, 0.025, 0.4, 0.3)
  }
  function bellPing(t: number, v: number, base: number, dec: number, peak: number) {
    const g = bus(peak * v, t, dec, 0.6, dec * 0.2)
    ;[1, 1.51, 2.02, 2.61, 3.44, 4.28].forEach((r, i) => {
      const og = ctx!.createGain(); og.gain.value = 1 / (i + 1.2)
      const det = 1 + (Math.random() - 0.5) * 0.004
      osc('sine', base * r * det, t, dec).connect(og); og.connect(g)
    })
    tick(t, v, 4000, 0.02, 0.35, 0.3)
  }
  function acRideBody(t: number, v: number) {
    const g = bus(0.3 * v, t, 1.6, 0.85, 0.25)
    const hp = filt('highpass', 5000)
    metalBank(t, 1.6, 95).connect(hp); hp.connect(g)
    const pg = bus(0.35 * v, t, 0.5, 0.4, 0.06)
    osc('sine', 1020, t, 0.55).connect(pg)
    osc('sine', 1560, t, 0.35).connect(pg)
    const ng = bus(0.18 * v, t, 1.2, 0.6)
    const nh = filt('highpass', 8000)
    noiseSrc(t, 1.2).connect(nh); nh.connect(ng)
    tick(t, v, 5000, 0.02, 0.4, 0.3)
  }

  // ---------- electronic ----------
  function elKick(t: number, v: number) {
    const g = bus(1.3 * v, t, 0.6, 0.06, 0.12)
    const o = osc('sine', 120, t, 0.65)
    o.frequency.exponentialRampToValueAtTime(42, t + 0.1)
    o.connect(g)
    const cg = bus(0.55 * v, t, 0.015, 0)
    osc('square', 1100, t, 0.02).connect(cg)
    const sg = bus(0.3 * v, t, 0.04, 0)
    const bp = filt('bandpass', 2400, 1.5)
    noiseSrc(t, 0.05).connect(bp); bp.connect(sg)
  }
  function elSnare(t: number, v: number) {
    const tg = bus(0.5 * v, t, 0.12, 0.2)
    const o = osc('triangle', 230, t, 0.14)
    o.frequency.exponentialRampToValueAtTime(155, t + 0.09)
    o.connect(tg)
    const ng = bus(0.95 * v, t, 0.26, 0.45, 0.06)
    const hp = filt('highpass', 900)
    const pk = filt('peaking', 5000, 1); pk.gain.value = 5
    noiseSrc(t, 0.3).connect(hp); hp.connect(pk); pk.connect(ng)
  }
  function elStick(t: number, v: number) {
    const g = bus(0.65 * v, t, 0.05, 0.25)
    const bp = filt('bandpass', 2000, 4)
    osc('square', 1750, t, 0.06).connect(bp); bp.connect(g)
  }
  function elTom(t: number, v: number, f1: number, f2: number, dec: number, peak: number) {
    const g = bus(peak * v, t, dec, 0.3, dec * 0.2)
    const o = osc('sine', f1, t, dec + 0.05)
    o.frequency.exponentialRampToValueAtTime(f2, t + dec * 0.6)
    o.connect(g)
    const cg = bus(0.3 * v, t, 0.012, 0)
    osc('square', 950, t, 0.018).connect(cg)
  }
  function elHat(t: number, v: number, dec: number, peak: number) {
    const g = bus(peak * v, t, dec, 0.15)
    const bp = filt('bandpass', 10500, 1.2)
    const hp = filt('highpass', 8200)
    metalBank(t, dec + 0.1, 160).connect(bp); bp.connect(hp); hp.connect(g)
  }
  function elCrash(t: number, v: number, dec: number, peak: number) {
    const g = bus(peak * v, t, dec, 0.9, dec * 0.1)
    const hp = filt('highpass', 5800)
    const pk = filt('peaking', 9000, 0.8); pk.gain.value = 4
    noiseSrc(t, dec).connect(hp); hp.connect(pk); pk.connect(g)
    const mg = bus(peak * 0.35 * v, t, dec * 0.6, 0.6)
    const mh = filt('highpass', 6500)
    metalBank(t, dec * 0.6, 110).connect(mh); mh.connect(mg)
  }
  function elRide(t: number, v: number) {
    const g = bus(0.42 * v, t, 1.0, 0.75, 0.15)
    const bp = filt('bandpass', 9200, 1.5)
    noiseSrc(t, 1.0).connect(bp); bp.connect(g)
    const cg = bus(0.32 * v, t, 0.02, 0)
    osc('square', 820, t, 0.025).connect(cg)
  }
  function cowbell(t: number, v: number, f1: number, f2: number, dec: number, peak: number) {
    const g = bus(peak * v, t, dec, 0.45, 0.02)
    const bp = filt('bandpass', 2500, 2)
    osc('square', f1, t, dec).connect(bp)
    osc('square', f2, t, dec).connect(bp)
    bp.connect(g)
  }

  const TABLE: Record<DrumKitId, Record<DrumPieceId, (t: number, v: number) => void>> = {
    acoustic: {
      'kick': (t, v) => samples.kick ? playSample(samples.kick, t, v, 1.1, 0.06) : acKick(t, v),
      'snare': (t, v) => samples.snare ? playSample(samples.snare, t, v, 1.0, 0.2) : acSnare(t, v),
      'stick': (t, v) => samples.stick ? playSample(samples.stick, t, v, 0.9, 0.15) : acStick(t, v),
      'tom-hi': (t, v) => samples.tomHi ? playSample(samples.tomHi, t, v, 1.0, 0.2) : acTom(t, v, 265, 170, 0.45, 0.9),
      'tom-lo': (t, v) => samples.tomLo ? playSample(samples.tomLo, t, v, 1.0, 0.2) : acTom(t, v, 205, 128, 0.55, 0.95),
      'tom-floor': (t, v) => samples.tomFloor ? playSample(samples.tomFloor, t, v, 1.0, 0.2) : acTom(t, v, 142, 86, 0.7, 1.05),
      'hh-closed': (t, v) => samples.hhClosed ? playSample(samples.hhClosed, t, v, 0.9, 0.1) : acHat(t, v, 0.09, 0.55),
      'hh-open': (t, v) => {
        const pool = [samples.hhOpen1, samples.hhOpen2, samples.hhOpen3].filter((b): b is AudioBuffer => !!b)
        if (pool.length) playSample(pool[Math.floor(Math.random() * pool.length)], t, v, 0.85, 0.15)
        else acHat(t, v, 0.55, 0.6)
      },
      'hh-foot': (t, v) => {
        const buf = samples.hhFoot2 ?? samples.hhFoot1
        if (buf) playSample(buf, t, v, 0.8, 0.05)
        else acHat(t, v, 0.06, 0.35)
      },
      'crash-edge': (t, v) => samples.crashEdge ? playSample(samples.crashEdge, t, v, 1.0, 0.35) : wash(t, v, 2.2, 0.9, 3800),
      'crash-body': (t, v) => samples.crashBody ? playSample(samples.crashBody, t, v, 0.9, 0.3) : wash(t, v, 1.4, 0.75, 5200),
      'crash-bell': (t, v) => samples.crashBell ? playSample(samples.crashBell, t, v, 0.85, 0.25) : bellPing(t, v, 640, 1.0, 0.55),
      'ride-edge': (t, v) => samples.rideEdge ? playSample(samples.rideEdge, t, v, 0.9, 0.3) : wash(t, v, 1.9, 0.55, 3800),
      'ride-body': (t, v) => samples.rideBody ? playSample(samples.rideBody, t, v, 0.85, 0.25) : acRideBody(t, v),
      'ride-bell': (t, v) => samples.rideBell ? playSample(samples.rideBell, t, v, 0.85, 0.25) : bellPing(t, v, 880, 1.3, 0.6),
    },
    electronic: {
      'kick': (t, v) => elKick(t, v),
      'snare': (t, v) => elSnare(t, v),
      'stick': (t, v) => elStick(t, v),
      'tom-hi': (t, v) => elTom(t, v, 300, 150, 0.42, 0.9),
      'tom-lo': (t, v) => elTom(t, v, 220, 110, 0.52, 0.95),
      'tom-floor': (t, v) => elTom(t, v, 150, 70, 0.65, 1.05),
      'hh-closed': (t, v) => elHat(t, v, 0.06, 0.55),
      'hh-open': (t, v) => elHat(t, v, 0.38, 0.6),
      'hh-foot': (t, v) => elHat(t, v, 0.05, 0.32),
      'crash-edge': (t, v) => elCrash(t, v, 1.8, 0.85),
      'crash-body': (t, v) => elCrash(t, v, 1.2, 0.7),
      'crash-bell': (t, v) => cowbell(t, v, 587, 845, 0.45, 0.55),
      'ride-edge': (t, v) => elCrash(t, v, 1.3, 0.5),
      'ride-body': (t, v) => elRide(t, v),
      'ride-bell': (t, v) => cowbell(t, v, 700, 1040, 0.55, 0.55),
    },
  }

  return {
    play(kit: DrumKitId, id: DrumPieceId, vel?: number, time?: number) {
      ensure()
      const fn = (TABLE[kit] || TABLE.acoustic)[id]
      const t = time != null && time > ctx!.currentTime ? time : ctx!.currentTime
      if (fn) fn(t, Math.max(0.1, Math.min(1, vel == null ? 1 : vel)))
    },
    now() { ensure(); return ctx!.currentTime },
    context() { ensure(); return ctx! as AudioContext },
    samplesReady() { ensure(); return loaded },
    sampleCache() { ensure(); return samples },
    setVolume(v: number) { vol = v; if (master) master.gain.setTargetAtTime(v, ctx!.currentTime, 0.02) },
    setReverb(v: number) { rev = v; if (wet) wet.gain.setTargetAtTime(v, ctx!.currentTime, 0.02) },
  }
}
