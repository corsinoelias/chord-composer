/**
 * The mixer's master effects — EQ, compressor, reverb — on the app's engine.
 *
 * Same controls and state as the web engine's master chain had (the MixingConsole panel
 * is unchanged), turned into the engine's own tools: each of its four channels has a
 * three-band EQ and a compressor (strip), and there is one reverb send. The master EQ and
 * compressor are applied to all four channels alike, which is what a master chain does to
 * their sum. The reverb starts off, as the web's did.
 */
import { type EngineCommand } from './commands';
import { startedAppEngine } from './player';

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
    low: { frequency: 160, gain: 0, Q: 1 },
    mid: { frequency: 1000, gain: 0, Q: 0.9 },
    high: { frequency: 4500, gain: 0, Q: 1 },
  },
  reverb: { enabled: false, decay: 1.5, wetDry: 0.3 },
  compressor: { enabled: false, threshold: -24, ratio: 4, attack: 0.003, release: 0.25, knee: 30 },
  masterVolume: 1,
};

const clone = (s: EffectsState): EffectsState => JSON.parse(JSON.stringify(s));
const state: EffectsState = clone(DEFAULT_EFFECTS_STATE);

/** The engine commands that put the current effects in place. Sent after every song load. */
export function effectsCommands(): EngineCommand[] {
  const { eq, compressor, reverb } = state;
  const threshold = compressor.enabled ? compressor.threshold : 0;
  const ratio = compressor.enabled ? compressor.ratio : 1;
  const strips: EngineCommand[] = (['drums', 'piano', 'guitar', 'bass'] as const).map((track) =>
    ['strip', track, eq.low.gain, eq.mid.gain, eq.high.gain, threshold, ratio]);
  // The panel's decay runs 0.1-5 s; the engine's room size runs 0-1.
  const size = Math.max(0, Math.min(1, (reverb.decay - 0.1) / 4.9));
  return [...strips, ['reverb', size, reverb.enabled ? reverb.wetDry : 0]];
}

function apply(): void {
  startedAppEngine()?.send(effectsCommands());
}

export function getCurrentEffectsState(): EffectsState {
  return clone(state);
}

export function updateEQ(band: 'low' | 'mid' | 'high', settings: Partial<EQBand>): void {
  Object.assign(state.eq[band], settings);
  apply();
}

export function updateReverb(settings: Partial<EffectsState['reverb']>): void {
  Object.assign(state.reverb, settings);
  apply();
}

export function updateCompressor(settings: Partial<EffectsState['compressor']>): void {
  Object.assign(state.compressor, settings);
  apply();
}

export function resetEffects(): void {
  Object.assign(state, clone(DEFAULT_EFFECTS_STATE));
  apply();
}
