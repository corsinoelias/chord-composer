/**
 * Instrument Configuration
 * 
 * Defines available instruments and their sound types
 */

export type InstrumentType = 'piano' | 'bass' | 'drums';

export interface InstrumentConfig {
  id: InstrumentType;
  name: string;
  soundTypes: SoundType[];
  defaultSoundType: string;
}

export interface SoundType {
  id: string;
  name: string;
  // Oscillator configuration (for synth sounds)
  oscillatorType: OscillatorType;
  octaveOffset: number;
  attackTime: number;
  decayTime: number;
  sustainLevel: number;
  releaseTime: number;
  // Sampler configuration (for realistic sounds)
  useSampler?: boolean;
  samplerType?: 'piano' | 'bass' | 'tr808' | 'tr909';
}

export interface InstrumentState {
  id: InstrumentType;
  muted: boolean;
  solo: boolean;
  volume: number; // 0-1
  soundTypeId: string;
}

export const INSTRUMENTS: InstrumentConfig[] = [
  {
    id: 'piano',
    name: 'Piano',
    defaultSoundType: 'sampled',
    soundTypes: [
      {
        id: 'sampled',
        name: '🎹 Grand Piano (Sampled)',
        oscillatorType: 'triangle',
        octaveOffset: 0,
        attackTime: 0.01,
        decayTime: 0.15,
        sustainLevel: 0.6,
        releaseTime: 0.4,
        useSampler: true,
        samplerType: 'piano',
      },
      {
        id: 'acoustic',
        name: 'Acoustic Grand (Synth)',
        oscillatorType: 'triangle',
        octaveOffset: 0,
        attackTime: 0.01,
        decayTime: 0.15,
        sustainLevel: 0.6,
        releaseTime: 0.4,
      },
      {
        id: 'bright',
        name: 'Bright Piano (Synth)',
        oscillatorType: 'sawtooth',
        octaveOffset: 0,
        attackTime: 0.005,
        decayTime: 0.08,
        sustainLevel: 0.5,
        releaseTime: 0.25,
      },
      {
        id: 'electric',
        name: 'Electric Piano (Synth)',
        oscillatorType: 'sine',
        octaveOffset: 0,
        attackTime: 0.01,
        decayTime: 0.2,
        sustainLevel: 0.7,
        releaseTime: 0.5,
      },
      {
        id: 'soft',
        name: 'Soft Piano (Synth)',
        oscillatorType: 'sine',
        octaveOffset: 0,
        attackTime: 0.03,
        decayTime: 0.3,
        sustainLevel: 0.8,
        releaseTime: 0.6,
      },
      {
        id: 'upright',
        name: 'Upright Piano (Synth)',
        oscillatorType: 'triangle',
        octaveOffset: 0,
        attackTime: 0.015,
        decayTime: 0.12,
        sustainLevel: 0.55,
        releaseTime: 0.35,
      },
      {
        id: 'honkytonk',
        name: 'Honky Tonk (Synth)',
        oscillatorType: 'sawtooth',
        octaveOffset: 0,
        attackTime: 0.008,
        decayTime: 0.1,
        sustainLevel: 0.45,
        releaseTime: 0.2,
      },
    ],
  },
  {
    id: 'bass',
    name: 'Bass',
    defaultSoundType: 'sampled',
    soundTypes: [
      {
        id: 'sampled',
        name: '🎸 Acoustic Bass (Sampled)',
        oscillatorType: 'triangle',
        octaveOffset: -2,
        attackTime: 0.015,
        decayTime: 0.12,
        sustainLevel: 0.75,
        releaseTime: 0.25,
        useSampler: true,
        samplerType: 'bass',
      },
      {
        id: 'electric',
        name: 'Electric Fingerstyle (Synth)',
        oscillatorType: 'triangle',
        octaveOffset: -2,
        attackTime: 0.015,
        decayTime: 0.12,
        sustainLevel: 0.75,
        releaseTime: 0.25,
      },
      {
        id: 'picked',
        name: 'Picked Bass (Synth)',
        oscillatorType: 'sawtooth',
        octaveOffset: -2,
        attackTime: 0.008,
        decayTime: 0.08,
        sustainLevel: 0.6,
        releaseTime: 0.15,
      },
      {
        id: 'synth',
        name: 'Synth Bass',
        oscillatorType: 'sawtooth',
        octaveOffset: -2,
        attackTime: 0.01,
        decayTime: 0.05,
        sustainLevel: 0.9,
        releaseTime: 0.1,
      },
      {
        id: 'acoustic',
        name: 'Acoustic Upright (Synth)',
        oscillatorType: 'sine',
        octaveOffset: -2,
        attackTime: 0.025,
        decayTime: 0.18,
        sustainLevel: 0.55,
        releaseTime: 0.35,
      },
      {
        id: 'sub',
        name: 'Deep Sub (Synth)',
        oscillatorType: 'sine',
        octaveOffset: -3,
        attackTime: 0.02,
        decayTime: 0.1,
        sustainLevel: 0.9,
        releaseTime: 0.2,
      },
      {
        id: 'slap',
        name: 'Slap Bass (Synth)',
        oscillatorType: 'square',
        octaveOffset: -2,
        attackTime: 0.005,
        decayTime: 0.06,
        sustainLevel: 0.4,
        releaseTime: 0.1,
      },
    ],
  },
  {
    id: 'drums',
    name: 'Drums',
    defaultSoundType: 'standard',
    soundTypes: [
      {
        id: 'standard',
        name: 'Acoustic Kit',
        oscillatorType: 'triangle',
        octaveOffset: 0,
        attackTime: 0.001,
        decayTime: 0.12,
        sustainLevel: 0.1,
        releaseTime: 0.1,
      },
      {
        id: 'tr808',
        name: '🥁 TR-808 (Sampled)',
        oscillatorType: 'triangle',
        octaveOffset: 0,
        attackTime: 0.001,
        decayTime: 0.12,
        sustainLevel: 0.1,
        releaseTime: 0.1,
        useSampler: true,
        samplerType: 'tr808',
      },
      {
        id: 'tr909',
        name: '🥁 TR-909 (Sampled)',
        oscillatorType: 'triangle',
        octaveOffset: 0,
        attackTime: 0.001,
        decayTime: 0.12,
        sustainLevel: 0.1,
        releaseTime: 0.1,
        useSampler: true,
        samplerType: 'tr909',
      },
      {
        id: 'rock',
        name: 'Rock Kit (Synth)',
        oscillatorType: 'sawtooth',
        octaveOffset: 0,
        attackTime: 0.001,
        decayTime: 0.08,
        sustainLevel: 0.15,
        releaseTime: 0.08,
      },
      {
        id: 'electronic',
        name: 'Electronic 808 (Synth)',
        oscillatorType: 'square',
        octaveOffset: 0,
        attackTime: 0.001,
        decayTime: 0.05,
        sustainLevel: 0.2,
        releaseTime: 0.05,
      },
      {
        id: 'jazz',
        name: 'Jazz Brushes (Synth)',
        oscillatorType: 'sine',
        octaveOffset: 0,
        attackTime: 0.01,
        decayTime: 0.2,
        sustainLevel: 0.25,
        releaseTime: 0.2,
      },
      {
        id: 'tight',
        name: 'Tight Pop (Synth)',
        oscillatorType: 'triangle',
        octaveOffset: 0,
        attackTime: 0.001,
        decayTime: 0.06,
        sustainLevel: 0.08,
        releaseTime: 0.06,
      },
    ],
  },
];
export function getInstrumentConfig(id: InstrumentType): InstrumentConfig | undefined {
  return INSTRUMENTS.find(i => i.id === id);
}

export function getSoundType(instrumentId: InstrumentType, soundTypeId: string): SoundType | undefined {
  const instrument = getInstrumentConfig(instrumentId);
  return instrument?.soundTypes.find(s => s.id === soundTypeId);
}

export function getDefaultInstrumentStates(): InstrumentState[] {
  return INSTRUMENTS.map(inst => ({
    id: inst.id,
    muted: false,
    solo: false,
    volume: 0.7,
    soundTypeId: inst.defaultSoundType,
  }));
}

/**
 * Calculate effective mute state considering solo
 */
export function isInstrumentAudible(instrument: InstrumentState, allInstruments: InstrumentState[]): boolean {
  if (instrument.muted) return false;
  
  const anySolo = allInstruments.some(i => i.solo);
  if (anySolo && !instrument.solo) return false;
  
  return true;
}
