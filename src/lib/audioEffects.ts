/**
 * Audio Effects Engine
 *
 * Master EQ, reverb and compression actually wired into the playback chain.
 * The chain is built by audioEngine.ts each time the AudioContext is (re)created.
 */

export interface EQBand {
  frequency: number;
  gain: number; // -12..+12 dB
  Q: number;
}

export interface EffectsState {
  eq: { low: EQBand; mid: EQBand; high: EQBand };
  reverb: { enabled: boolean; decay: number; wetDry: number };
  compressor: {
    enabled: boolean;
    threshold: number;
    ratio: number;
    attack: number;
    release: number;
    knee: number;
  };
  masterVolume: number;
}

export const DEFAULT_EFFECTS_STATE: EffectsState = {
  eq: {
    low:  { frequency: 100,  gain: 0, Q: 1 },
    mid:  { frequency: 1000, gain: 0, Q: 1 },
    high: { frequency: 8000, gain: 0, Q: 1 },
  },
  reverb:     { enabled: false, decay: 1.5, wetDry: 0.3 },
  compressor: { enabled: false, threshold: -24, ratio: 4, attack: 0.003, release: 0.25, knee: 30 },
  masterVolume: 1,
};

interface EffectNodes {
  ctx: AudioContext;
  eqLow: BiquadFilterNode;
  eqMid: BiquadFilterNode;
  eqHigh: BiquadFilterNode;
  // Compressor wet/bypass branches
  compressor: DynamicsCompressorNode;
  compGain: GainNode;     // gain on compressor branch
  bypassGain: GainNode;   // gain on direct branch
  preReverb: GainNode;
  // Reverb wet/dry
  dryGain: GainNode;
  wetGain: GainNode;
  convolver: ConvolverNode;
}

const currentState: EffectsState = JSON.parse(JSON.stringify(DEFAULT_EFFECTS_STATE));
let active: EffectNodes | null = null;

function createImpulseResponse(ctx: AudioContext, duration: number, decay: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.max(1, Math.floor(sr * duration));
  const impulse = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return impulse;
}

/**
 * Build chain and connect input -> chain -> output.
 *
 *   input -> eqLow -> eqMid -> eqHigh ─┬─> compressor -> compGain ──┐
 *                                      └─> bypassGain ──────────────┴─> preReverb
 *   preReverb -> dryGain -> output
 *   preReverb -> convolver -> wetGain -> output
 */
export function buildEffectsChain(
  ctx: AudioContext,
  input: AudioNode,
  output: AudioNode,
): AudioNode {
  const eqLow = ctx.createBiquadFilter();
  eqLow.type = 'lowshelf';
  eqLow.frequency.value = currentState.eq.low.frequency;

  const eqMid = ctx.createBiquadFilter();
  eqMid.type = 'peaking';
  eqMid.frequency.value = currentState.eq.mid.frequency;
  eqMid.Q.value = currentState.eq.mid.Q;

  const eqHigh = ctx.createBiquadFilter();
  eqHigh.type = 'highshelf';
  eqHigh.frequency.value = currentState.eq.high.frequency;

  const compressor = ctx.createDynamicsCompressor();
  const compGain = ctx.createGain();
  const bypassGain = ctx.createGain();
  const preReverb = ctx.createGain();

  const dryGain = ctx.createGain();
  const wetGain = ctx.createGain();
  const convolver = ctx.createConvolver();
  convolver.buffer = createImpulseResponse(ctx, 2, currentState.reverb.decay);

  // EQ chain
  input.connect(eqLow);
  eqLow.connect(eqMid);
  eqMid.connect(eqHigh);

  // Parallel compressor / bypass
  eqHigh.connect(compressor);
  compressor.connect(compGain);
  eqHigh.connect(bypassGain);
  compGain.connect(preReverb);
  bypassGain.connect(preReverb);

  // Reverb dry/wet
  preReverb.connect(dryGain);
  preReverb.connect(convolver);
  convolver.connect(wetGain);
  dryGain.connect(output);
  wetGain.connect(output);

  active = {
    ctx, eqLow, eqMid, eqHigh,
    compressor, compGain, bypassGain, preReverb,
    dryGain, wetGain, convolver,
  };

  applyAll();
  return eqLow;
}

function setParam(p: AudioParam, v: number, t: number) { p.setValueAtTime(v, t); }

function applyAll() { applyEQ(); applyCompressor(); applyReverb(); }

function applyEQ() {
  if (!active) return;
  const t = active.ctx.currentTime;
  setParam(active.eqLow.gain, currentState.eq.low.gain, t);
  setParam(active.eqMid.gain, currentState.eq.mid.gain, t);
  setParam(active.eqMid.Q,    currentState.eq.mid.Q, t);
  setParam(active.eqHigh.gain, currentState.eq.high.gain, t);
}

function applyCompressor() {
  if (!active) return;
  const { ctx, compressor, compGain, bypassGain } = active;
  const t = ctx.currentTime;
  const c = currentState.compressor;
  setParam(compressor.threshold, c.threshold, t);
  setParam(compressor.ratio,     c.ratio, t);
  setParam(compressor.attack,    c.attack, t);
  setParam(compressor.release,   c.release, t);
  setParam(compressor.knee,      c.knee, t);
  setParam(compGain.gain,   c.enabled ? 1 : 0, t);
  setParam(bypassGain.gain, c.enabled ? 0 : 1, t);
}

function applyReverb() {
  if (!active) return;
  const { ctx, dryGain, wetGain, convolver } = active;
  const t = ctx.currentTime;
  const r = currentState.reverb;
  convolver.buffer = createImpulseResponse(ctx, 2, r.decay);
  if (r.enabled) {
    setParam(dryGain.gain, 1 - r.wetDry * 0.5, t);
    setParam(wetGain.gain, r.wetDry, t);
  } else {
    setParam(dryGain.gain, 1, t);
    setParam(wetGain.gain, 0, t);
  }
}

// ─── Public API ─────────────────────────────────────────────────────────

export function getCurrentEffectsState(): EffectsState {
  return JSON.parse(JSON.stringify(currentState));
}

export function updateEQ(band: 'low' | 'mid' | 'high', settings: Partial<EQBand>): void {
  Object.assign(currentState.eq[band], settings);
  applyEQ();
}

export function updateReverb(settings: Partial<EffectsState['reverb']>): void {
  Object.assign(currentState.reverb, settings);
  applyReverb();
}

export function updateCompressor(settings: Partial<EffectsState['compressor']>): void {
  Object.assign(currentState.compressor, settings);
  applyCompressor();
}

export function resetEffects(): void {
  const d = DEFAULT_EFFECTS_STATE;
  currentState.eq.low  = { ...d.eq.low };
  currentState.eq.mid  = { ...d.eq.mid };
  currentState.eq.high = { ...d.eq.high };
  currentState.reverb     = { ...d.reverb };
  currentState.compressor = { ...d.compressor };
  currentState.masterVolume = d.masterVolume;
  applyAll();
}

/** Backwards-compat no-op. */
export function initializeEffects(): void { /* chain built by audioEngine */ }
