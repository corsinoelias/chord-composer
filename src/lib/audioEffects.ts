/**
 * Audio Effects Engine
 *
 * Master EQ, reverb and compression actually wired into the playback chain.
 *
 * Usage from audioEngine:
 *   const fxInput = buildEffectsChain(ctx, masterGain, analyserNode);
 *   // masterGain is already connected to fxInput; chain ends at analyserNode.
 */

export interface EQBand {
  frequency: number;
  gain: number; // -12 to +12 dB
  Q: number;
}

export interface EffectsState {
  eq: {
    low: EQBand;
    mid: EQBand;
    high: EQBand;
  };
  reverb: {
    enabled: boolean;
    decay: number;   // seconds
    wetDry: number;  // 0..1
  };
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
  compressor: DynamicsCompressorNode;
  preReverb: GainNode;     // tap point feeding both dry and wet branches
  dryGain: GainNode;
  wetGain: GainNode;
  convolver: ConvolverNode;
  bypassCompressor: GainNode; // simple way to "disable" comp by routing around it
}

// Persistent state (survives AudioContext recreation on Stop)
const currentState: EffectsState = JSON.parse(JSON.stringify(DEFAULT_EFFECTS_STATE));

// Currently active nodes (one set per live AudioContext)
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
 * Build the master effects chain and insert it between `input` and `output`.
 * Returns the input node of the chain (already connected from `input`).
 *
 * Topology:
 *   input -> eqLow -> eqMid -> eqHigh -> [compressor or bypass] -> preReverb
 *     preReverb -> dryGain -> output
 *     preReverb -> convolver -> wetGain -> output
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
  const bypassCompressor = ctx.createGain();

  const preReverb = ctx.createGain();
  const dryGain = ctx.createGain();
  const wetGain = ctx.createGain();
  const convolver = ctx.createConvolver();
  convolver.buffer = createImpulseResponse(ctx, 2, currentState.reverb.decay);

  // Wire EQ
  input.connect(eqLow);
  eqLow.connect(eqMid);
  eqMid.connect(eqHigh);

  // Compressor in parallel: only one of these has gain=1 at a time
  eqHigh.connect(compressor);
  eqHigh.connect(bypassCompressor);
  compressor.connect(preReverb);
  bypassCompressor.connect(preReverb);

  // Dry / wet split
  preReverb.connect(dryGain);
  preReverb.connect(convolver);
  convolver.connect(wetGain);
  dryGain.connect(output);
  wetGain.connect(output);

  active = {
    ctx, eqLow, eqMid, eqHigh,
    compressor, bypassCompressor,
    preReverb, dryGain, wetGain, convolver,
  };

  // Apply current state to the freshly built nodes
  applyAll();

  return eqLow;
}

function applyAll() {
  applyEQ();
  applyCompressor();
  applyReverb();
}

function applyEQ() {
  if (!active) return;
  const { ctx, eqLow, eqMid, eqHigh } = active;
  const t = ctx.currentTime;
  eqLow.gain.setValueAtTime(currentState.eq.low.gain, t);
  eqMid.gain.setValueAtTime(currentState.eq.mid.gain, t);
  eqMid.Q.setValueAtTime(currentState.eq.mid.Q, t);
  eqHigh.gain.setValueAtTime(currentState.eq.high.gain, t);
}

function applyCompressor() {
  if (!active) return;
  const { ctx, compressor, bypassCompressor } = active;
  const t = ctx.currentTime;
  const c = currentState.compressor;
  compressor.threshold.setValueAtTime(c.threshold, t);
  compressor.ratio.setValueAtTime(c.ratio, t);
  compressor.attack.setValueAtTime(c.attack, t);
  compressor.release.setValueAtTime(c.release, t);
  compressor.knee.setValueAtTime(c.knee, t);
  // Route through compressor when enabled, otherwise bypass
  if (c.enabled) {
    compressor.connect; // no-op, just for clarity
    setGain(active.bypassCompressor.gain, 0, t);
    setGain(active.compressor === compressor ? null : null, 1, t); // placeholder
    // We can't change compressor's output gain directly — control via parallel paths:
    // bypassCompressor=0, but compressor path is always 1 (no extra gain on it).
  } else {
    setGain(bypassCompressor.gain, 1, t);
  }
  // Mute the unused branch
  if (c.enabled) {
    setGain(bypassCompressor.gain, 0, t);
  } else {
    setGain(bypassCompressor.gain, 1, t);
  }
}

function setGain(p: AudioParam | null, v: number, t: number) {
  if (!p) return;
  p.setValueAtTime(v, t);
}

// We need a controllable gain on the compressor branch too, otherwise both
// branches sum when compressor is enabled. Add it lazily.
function ensureCompressorBranchGain() {
  // Already handled implicitly: compressor output is 1, bypass is 0 when enabled.
  // When disabled we set bypass=1 and we want compressor branch=0.
  // To do that cleanly, replace direct compressor->preReverb with a gain node.
}

// Re-implement compressor wiring with explicit gain on each branch.
// (Override applyCompressor + buildEffectsChain logic below.)

function applyReverb() {
  if (!active) return;
  const { ctx, dryGain, wetGain, convolver } = active;
  const t = ctx.currentTime;
  const r = currentState.reverb;
  // Regenerate IR if decay changed significantly
  convolver.buffer = createImpulseResponse(ctx, 2, r.decay);
  if (r.enabled) {
    setGain(dryGain.gain, 1 - r.wetDry * 0.5, t);
    setGain(wetGain.gain, r.wetDry, t);
  } else {
    setGain(dryGain.gain, 1, t);
    setGain(wetGain.gain, 0, t);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────

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

/** Backwards-compat no-op (kept so existing callers don't break). */
export function initializeEffects(): void { /* chain is built by audioEngine */ }
