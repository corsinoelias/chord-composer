/**
 * Sampler Engine
 * 
 * Uses smplr library for realistic sampled instruments:
 * - SplendidGrandPiano for piano
 * - Soundfont for bass
 * - DrumMachine for electronic drum kits (TR-808, TR-909)
 */

import { SplendidGrandPiano, Soundfont, DrumMachine } from 'smplr';

// Sampler instances
let piano: SplendidGrandPiano | null = null;
let bass: Soundfont | null = null;
let drumMachine808: DrumMachine | null = null;
let drumMachine909: DrumMachine | null = null;

// Loading state
let samplerContext: AudioContext | null = null;
let loadPromise: Promise<void> | null = null;
let isLoaded = false;

// Callbacks for loading state changes
type LoadingCallback = (loading: boolean, progress?: string) => void;
let loadingCallbacks: LoadingCallback[] = [];

export function onSamplerLoading(callback: LoadingCallback): () => void {
  loadingCallbacks.push(callback);
  return () => {
    loadingCallbacks = loadingCallbacks.filter(cb => cb !== callback);
  };
}

function notifyLoading(loading: boolean, progress?: string) {
  loadingCallbacks.forEach(cb => cb(loading, progress));
}

/**
 * Checks if samplers are loaded
 */
export function areSamplersLoaded(): boolean {
  return isLoaded;
}

/**
 * Initialize and load all sampler instruments
 */
export async function initSamplers(audioContext: AudioContext): Promise<void> {
  if (samplerContext === audioContext && isLoaded) {
    return;
  }

  if (loadPromise && samplerContext === audioContext) {
    return loadPromise;
  }

  samplerContext = audioContext;
  
  loadPromise = (async () => {
    notifyLoading(true, 'Loading piano samples...');
    
    try {
      // Initialize piano
      piano = new SplendidGrandPiano(audioContext, {
        volume: 100,
      });
      await piano.load;
      
      notifyLoading(true, 'Loading bass samples...');
      
      // Initialize bass (acoustic bass from Soundfont)
      bass = new Soundfont(audioContext, {
        instrument: 'acoustic_bass',
        volume: 100,
      });
      await bass.load;
      
      notifyLoading(true, 'Loading drum machines...');
      
      // Initialize TR-808
      drumMachine808 = new DrumMachine(audioContext, {
        instrument: 'TR-808',
        volume: 100,
      });
      await drumMachine808.load;
      
      // Initialize TR-909
      drumMachine909 = new DrumMachine(audioContext, {
        instrument: 'TR-909',
        volume: 100,
      });
      await drumMachine909.load;
      
      isLoaded = true;
      notifyLoading(false);
      
      console.log('All samplers loaded successfully');
    } catch (error) {
      console.error('Error loading samplers:', error);
      notifyLoading(false);
      throw error;
    }
  })();

  return loadPromise;
}

/**
 * Play a piano note using SplendidGrandPiano
 */
export function playSampledPiano(
  midiNote: number,
  startTime: number,
  duration: number,
  velocity: number
): void {
  if (!piano || !samplerContext) return;
  
  // Convert absolute time to delay from current time
  const delay = Math.max(0, startTime - samplerContext.currentTime);
  
  piano.start({
    note: midiNote,
    velocity: Math.round(velocity * 127),
    time: samplerContext.currentTime + delay,
    duration: duration,
  });
}

/**
 * Play a bass note using Soundfont
 */
export function playSampledBass(
  midiNote: number,
  startTime: number,
  duration: number,
  velocity: number
): void {
  if (!bass || !samplerContext) return;
  
  const delay = Math.max(0, startTime - samplerContext.currentTime);
  
  bass.start({
    note: midiNote,
    velocity: Math.round(velocity * 127),
    time: samplerContext.currentTime + delay,
    duration: duration,
  });
}

// Drum mapping for TR-808/909
// These are the standard note mappings for drum machines
const DRUM_MAP_808: Record<string, number> = {
  kick: 36,       // C1
  snare: 38,      // D1
  hihat: 42,      // F#1
  hihatOpen: 46,  // A#1
  tom1: 50,       // D2
  tom2: 47,       // B1
  floorTom: 45,   // A1
  ride: 51,       // D#2
  crash: 49,      // C#2
  clap: 39,       // D#1
};

const DRUM_MAP_909: Record<string, number> = {
  kick: 36,
  snare: 38,
  hihat: 42,
  hihatOpen: 46,
  tom1: 50,
  tom2: 47,
  floorTom: 45,
  ride: 51,
  crash: 49,
  clap: 39,
};

export type DrumMachineType = 'tr808' | 'tr909';

/**
 * Play a drum hit using DrumMachine
 */
export function playSampledDrum(
  drumType: 'kick' | 'snare' | 'snareStick' | 'hihat' | 'hihatFoot' | 'tom1' | 'tom2' | 'floorTom' | 'ride' | 'crash',
  startTime: number,
  velocity: number,
  machineType: DrumMachineType = 'tr808'
): void {
  const machine = machineType === 'tr909' ? drumMachine909 : drumMachine808;
  const drumMap = machineType === 'tr909' ? DRUM_MAP_909 : DRUM_MAP_808;
  
  if (!machine || !samplerContext) return;
  
  // Map drum types to machine notes
  let noteNum: number;
  switch (drumType) {
    case 'snareStick':
      noteNum = drumMap.snare; // Use snare for rim
      break;
    case 'hihatFoot':
      noteNum = drumMap.hihat; // Use closed hihat for foot
      break;
    default:
      noteNum = drumMap[drumType] || drumMap.kick;
  }
  
  const delay = Math.max(0, startTime - samplerContext.currentTime);
  
  machine.start({
    note: noteNum,
    velocity: Math.round(velocity * 127),
    time: samplerContext.currentTime + delay,
  });
}

/**
 * Stop all currently playing notes
 */
export function stopAllSamplers(): void {
  piano?.stop();
  bass?.stop();
  drumMachine808?.stop({});
  drumMachine909?.stop({});
}

/**
 * Get the audio context used by samplers
 */
export function getSamplerContext(): AudioContext | null {
  return samplerContext;
}

/**
 * Disconnect and cleanup samplers
 */
export function disconnectSamplers(): void {
  stopAllSamplers();
  if (piano) {
    piano.output.disconnect();
    piano = null;
  }
  if (bass) {
    bass.output.disconnect();
    bass = null;
  }
  if (drumMachine808) {
    drumMachine808.output.disconnect();
    drumMachine808 = null;
  }
  if (drumMachine909) {
    drumMachine909.output.disconnect();
    drumMachine909 = null;
  }
  samplerContext = null;
  isLoaded = false;
  loadPromise = null;
}
