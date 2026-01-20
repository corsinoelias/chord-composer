/**
 * Audio Effects Engine
 * 
 * Provides master EQ, reverb, and compression controls for the mixing console
 */

import { getAudioContext } from './audioEngine';

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
    decay: number; // 0.1 to 5 seconds
    wetDry: number; // 0 to 1
  };
  compressor: {
    enabled: boolean;
    threshold: number; // -60 to 0 dB
    ratio: number; // 1 to 20
    attack: number; // 0 to 1 second
    release: number; // 0 to 1 second
    knee: number; // 0 to 40 dB
  };
  masterVolume: number; // 0 to 1
}

export const DEFAULT_EFFECTS_STATE: EffectsState = {
  eq: {
    low: { frequency: 100, gain: 0, Q: 1 },
    mid: { frequency: 1000, gain: 0, Q: 1 },
    high: { frequency: 8000, gain: 0, Q: 1 },
  },
  reverb: {
    enabled: false,
    decay: 1.5,
    wetDry: 0.3,
  },
  compressor: {
    enabled: false,
    threshold: -24,
    ratio: 4,
    attack: 0.003,
    release: 0.25,
    knee: 30,
  },
  masterVolume: 1,
};

// Effect nodes - created on demand
let eqLowNode: BiquadFilterNode | null = null;
let eqMidNode: BiquadFilterNode | null = null;
let eqHighNode: BiquadFilterNode | null = null;
let compressorNode: DynamicsCompressorNode | null = null;
let reverbConvolverNode: ConvolverNode | null = null;
let reverbGainNode: GainNode | null = null;
let dryGainNode: GainNode | null = null;
let effectsInitialized = false;

/**
 * Generate an impulse response for reverb
 */
function createImpulseResponse(
  ctx: AudioContext,
  duration: number,
  decay: number
): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = sampleRate * duration;
  const impulse = ctx.createBuffer(2, length, sampleRate);
  
  for (let channel = 0; channel < 2; channel++) {
    const channelData = impulse.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      // Exponential decay with random noise
      channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  
  return impulse;
}

/**
 * Initialize effect nodes (call once when effects are first used)
 */
export function initializeEffects(): void {
  if (effectsInitialized) return;
  
  const ctx = getAudioContext();
  
  // Create EQ bands
  eqLowNode = ctx.createBiquadFilter();
  eqLowNode.type = 'lowshelf';
  eqLowNode.frequency.value = 100;
  eqLowNode.gain.value = 0;
  
  eqMidNode = ctx.createBiquadFilter();
  eqMidNode.type = 'peaking';
  eqMidNode.frequency.value = 1000;
  eqMidNode.Q.value = 1;
  eqMidNode.gain.value = 0;
  
  eqHighNode = ctx.createBiquadFilter();
  eqHighNode.type = 'highshelf';
  eqHighNode.frequency.value = 8000;
  eqHighNode.gain.value = 0;
  
  // Create compressor
  compressorNode = ctx.createDynamicsCompressor();
  compressorNode.threshold.value = -24;
  compressorNode.ratio.value = 4;
  compressorNode.attack.value = 0.003;
  compressorNode.release.value = 0.25;
  compressorNode.knee.value = 30;
  
  // Create reverb (convolver with dry/wet mix)
  reverbConvolverNode = ctx.createConvolver();
  reverbConvolverNode.buffer = createImpulseResponse(ctx, 2, 2);
  
  reverbGainNode = ctx.createGain();
  reverbGainNode.gain.value = 0; // Start with no wet signal
  
  dryGainNode = ctx.createGain();
  dryGainNode.gain.value = 1; // Full dry signal
  
  effectsInitialized = true;
}

/**
 * Update EQ settings
 */
export function updateEQ(band: 'low' | 'mid' | 'high', settings: Partial<EQBand>): void {
  if (!effectsInitialized) initializeEffects();
  
  const ctx = getAudioContext();
  const now = ctx.currentTime;
  
  switch (band) {
    case 'low':
      if (eqLowNode) {
        if (settings.frequency !== undefined) eqLowNode.frequency.setValueAtTime(settings.frequency, now);
        if (settings.gain !== undefined) eqLowNode.gain.setValueAtTime(settings.gain, now);
      }
      break;
    case 'mid':
      if (eqMidNode) {
        if (settings.frequency !== undefined) eqMidNode.frequency.setValueAtTime(settings.frequency, now);
        if (settings.gain !== undefined) eqMidNode.gain.setValueAtTime(settings.gain, now);
        if (settings.Q !== undefined) eqMidNode.Q.setValueAtTime(settings.Q, now);
      }
      break;
    case 'high':
      if (eqHighNode) {
        if (settings.frequency !== undefined) eqHighNode.frequency.setValueAtTime(settings.frequency, now);
        if (settings.gain !== undefined) eqHighNode.gain.setValueAtTime(settings.gain, now);
      }
      break;
  }
}

/**
 * Update reverb settings
 */
export function updateReverb(settings: Partial<EffectsState['reverb']>): void {
  if (!effectsInitialized) initializeEffects();
  
  const ctx = getAudioContext();
  const now = ctx.currentTime;
  
  if (settings.decay !== undefined && reverbConvolverNode) {
    // Regenerate impulse response with new decay
    reverbConvolverNode.buffer = createImpulseResponse(ctx, 2, settings.decay);
  }
  
  if (settings.wetDry !== undefined) {
    if (reverbGainNode) reverbGainNode.gain.setValueAtTime(settings.wetDry, now);
    if (dryGainNode) dryGainNode.gain.setValueAtTime(1 - settings.wetDry * 0.5, now);
  }
  
  if (settings.enabled !== undefined) {
    if (reverbGainNode) {
      reverbGainNode.gain.setValueAtTime(settings.enabled ? 0.3 : 0, now);
    }
  }
}

/**
 * Update compressor settings
 */
export function updateCompressor(settings: Partial<EffectsState['compressor']>): void {
  if (!effectsInitialized) initializeEffects();
  if (!compressorNode) return;
  
  const ctx = getAudioContext();
  const now = ctx.currentTime;
  
  if (settings.threshold !== undefined) compressorNode.threshold.setValueAtTime(settings.threshold, now);
  if (settings.ratio !== undefined) compressorNode.ratio.setValueAtTime(settings.ratio, now);
  if (settings.attack !== undefined) compressorNode.attack.setValueAtTime(settings.attack, now);
  if (settings.release !== undefined) compressorNode.release.setValueAtTime(settings.release, now);
  if (settings.knee !== undefined) compressorNode.knee.setValueAtTime(settings.knee, now);
}

/**
 * Get all effect nodes for connecting to audio chain
 */
export function getEffectNodes() {
  if (!effectsInitialized) initializeEffects();
  
  return {
    eqLow: eqLowNode,
    eqMid: eqMidNode,
    eqHigh: eqHighNode,
    compressor: compressorNode,
    reverbConvolver: reverbConvolverNode,
    reverbGain: reverbGainNode,
    dryGain: dryGainNode,
  };
}

/**
 * Reset all effects to defaults
 */
export function resetEffects(): void {
  updateEQ('low', DEFAULT_EFFECTS_STATE.eq.low);
  updateEQ('mid', DEFAULT_EFFECTS_STATE.eq.mid);
  updateEQ('high', DEFAULT_EFFECTS_STATE.eq.high);
  updateReverb(DEFAULT_EFFECTS_STATE.reverb);
  updateCompressor(DEFAULT_EFFECTS_STATE.compressor);
}
