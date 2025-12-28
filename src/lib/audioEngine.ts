/**
 * Audio Engine
 * 
 * This module handles all audio synthesis and playback using the Web Audio API.
 * Supports multiple instruments with 16-slot rhythm patterns (16th note resolution).
 */

import { Chord, chordToMidiNotes, midiToFrequency } from './musicTheory';
import { InstrumentState, getSoundType, SoundType, isInstrumentAudible } from './instruments';
import { StylePattern, generateBarPattern } from './styles';
import { Section } from './sections';

let audioContext: AudioContext | null = null;
let masterGain: GainNode | null = null;
let currentlyPlaying = false;
let playbackStoppedCallback: (() => void) | null = null;

/**
 * Register a callback to be notified when playback stops
 */
export function onPlaybackStopped(callback: (() => void) | null): void {
  playbackStoppedCallback = callback;
}

/**
 * Check if audio is currently playing
 */
export function isCurrentlyPlaying(): boolean {
  return currentlyPlaying;
}

// Sample buffers for acoustic kit
interface AcousticKitSamples {
  kick: AudioBuffer | null;
  snare: AudioBuffer | null;
  snareStick: AudioBuffer | null;  // Rim/edge hit
  hihat: AudioBuffer | null;
  hihatOpen: AudioBuffer | null;
  hihatFoot: AudioBuffer | null;
  hihatFoot2: AudioBuffer | null;  // Alternative foot sound
  tom1: AudioBuffer | null;
  tom2: AudioBuffer | null;
  floorTom: AudioBuffer | null;
  ride: AudioBuffer | null;
  crash: AudioBuffer | null;
}

let acousticKit: AcousticKitSamples = {
  kick: null,
  snare: null,
  snareStick: null,
  hihat: null,
  hihatOpen: null,
  hihatFoot: null,
  hihatFoot2: null,
  tom1: null,
  tom2: null,
  floorTom: null,
  ride: null,
  crash: null,
};

let sampleLoadPromise: Promise<void> | null = null;

/**
 * Loads all acoustic kit samples
 */
async function loadAcousticSamples(ctx: AudioContext): Promise<void> {
  const samplePaths: { key: keyof AcousticKitSamples; path: string }[] = [
    { key: 'kick', path: '/audio/kick.mp3' },
    { key: 'snare', path: '/audio/snare-drum.mp3' },
    { key: 'snareStick', path: '/audio/snare-stick.mp3' },
    { key: 'hihat', path: '/audio/hihat.mp3' },
    { key: 'hihatOpen', path: '/audio/hihat-open.mp3' },
    { key: 'hihatFoot', path: '/audio/hihat-foot.mp3' },
    { key: 'hihatFoot2', path: '/audio/hihat-foot-2.mp3' },
    { key: 'tom1', path: '/audio/tom1.mp3' },
    { key: 'tom2', path: '/audio/tom2.mp3' },
    { key: 'floorTom', path: '/audio/floor-tom.mp3' },
    { key: 'ride', path: '/audio/ride.mp3' },
    { key: 'crash', path: '/audio/crash.mp3' },
  ];

  await Promise.all(
    samplePaths.map(async ({ key, path }) => {
      try {
        const response = await fetch(path);
        const arrayBuffer = await response.arrayBuffer();
        acousticKit[key] = await ctx.decodeAudioData(arrayBuffer);
      } catch (error) {
        console.warn(`Failed to load ${key} sample:`, error);
      }
    })
  );
}

/**
 * Initializes or returns the existing AudioContext
 */
export function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
    masterGain = audioContext.createGain();
    masterGain.gain.value = 0.5;
    masterGain.connect(audioContext.destination);
    
    // Start loading samples
    sampleLoadPromise = loadAcousticSamples(audioContext);
  }
  
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
  
  return audioContext;
}

/**
 * Ensures samples are loaded before playback
 */
export async function ensureSamplesLoaded(): Promise<void> {
  getAudioContext();
  if (sampleLoadPromise) {
    await sampleLoadPromise;
  }
}

/**
 * Creates and plays piano notes with harmonic synthesis for realistic sound
 */
function playPianoNote(
  ctx: AudioContext,
  destination: AudioNode,
  frequency: number,
  startTime: number,
  duration: number,
  soundType: SoundType,
  volume: number
): void {
  const gainNode = ctx.createGain();
  gainNode.connect(destination);
  
  // Create multiple harmonics for richer piano sound
  const harmonics = [
    { freq: 1, amp: 1.0 },
    { freq: 2, amp: 0.5 },
    { freq: 3, amp: 0.25 },
    { freq: 4, amp: 0.15 },
    { freq: 5, amp: 0.08 },
    { freq: 6, amp: 0.04 },
  ];
  
  const baseFreq = frequency * Math.pow(2, soundType.octaveOffset);
  
  harmonics.forEach(({ freq, amp }) => {
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    
    osc.type = freq === 1 ? soundType.oscillatorType : 'sine';
    osc.frequency.value = baseFreq * freq;
    
    // Add slight detuning for warmth
    if (freq > 1) {
      osc.detune.value = Math.random() * 4 - 2;
    }
    
    oscGain.gain.value = amp * 0.15 * volume;
    
    osc.connect(oscGain);
    oscGain.connect(gainNode);
    
    osc.start(startTime);
    osc.stop(startTime + duration + 0.1);
  });
  
  // ADSR envelope
  const { attackTime, decayTime, sustainLevel, releaseTime } = soundType;
  const noteEnd = startTime + duration;
  
  gainNode.gain.setValueAtTime(0, startTime);
  gainNode.gain.linearRampToValueAtTime(1, startTime + attackTime);
  gainNode.gain.linearRampToValueAtTime(sustainLevel, startTime + attackTime + decayTime);
  gainNode.gain.setValueAtTime(sustainLevel, Math.max(startTime, noteEnd - releaseTime));
  gainNode.gain.linearRampToValueAtTime(0, noteEnd);
}

/**
 * Creates and plays bass notes with sub oscillator for full low end
 */
function playBassNote(
  ctx: AudioContext,
  destination: AudioNode,
  frequency: number,
  startTime: number,
  duration: number,
  soundType: SoundType,
  volume: number
): void {
  const gainNode = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  
  filter.type = 'lowpass';
  filter.frequency.value = 800;
  filter.Q.value = 1;
  
  filter.connect(gainNode);
  gainNode.connect(destination);
  
  const baseFreq = frequency * Math.pow(2, soundType.octaveOffset);
  
  // Main oscillator
  const mainOsc = ctx.createOscillator();
  mainOsc.type = soundType.oscillatorType;
  mainOsc.frequency.value = baseFreq;
  
  // Sub oscillator (one octave down)
  const subOsc = ctx.createOscillator();
  subOsc.type = 'sine';
  subOsc.frequency.value = baseFreq / 2;
  
  const mainGain = ctx.createGain();
  const subGain = ctx.createGain();
  mainGain.gain.value = 0.2 * volume;
  subGain.gain.value = 0.15 * volume;
  
  mainOsc.connect(mainGain);
  subOsc.connect(subGain);
  mainGain.connect(filter);
  subGain.connect(filter);
  
  // ADSR envelope
  const { attackTime, decayTime, sustainLevel, releaseTime } = soundType;
  const noteEnd = startTime + duration;
  
  gainNode.gain.setValueAtTime(0, startTime);
  gainNode.gain.linearRampToValueAtTime(1, startTime + attackTime);
  gainNode.gain.linearRampToValueAtTime(sustainLevel, startTime + attackTime + decayTime);
  gainNode.gain.setValueAtTime(sustainLevel, Math.max(startTime, noteEnd - releaseTime));
  gainNode.gain.linearRampToValueAtTime(0, noteEnd);
  
  mainOsc.start(startTime);
  subOsc.start(startTime);
  mainOsc.stop(noteEnd + 0.1);
  subOsc.stop(noteEnd + 0.1);
}

/**
 * Plays a sample buffer
 */
function playSample(
  ctx: AudioContext,
  destination: AudioNode,
  buffer: AudioBuffer,
  startTime: number,
  volume: number
): void {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.value = volume;
  source.connect(gain);
  gain.connect(destination);
  source.start(startTime);
}

/**
 * Plays a drum hit with samples for Acoustic Kit or synthesis for others
 */
function playDrumHit(
  ctx: AudioContext,
  destination: AudioNode,
  startTime: number,
  soundType: SoundType,
  volume: number,
  drumType: 'kick' | 'snare' | 'snareStick' | 'hihat' | 'hihatFoot' | 'tom1' | 'tom2' | 'floorTom' | 'ride' | 'crash'
): void {
  const gainNode = ctx.createGain();
  gainNode.connect(destination);
  const useAcousticSamples = soundType.id === 'standard';
  
  if (drumType === 'kick') {
    if (useAcousticSamples && acousticKit.kick) {
      playSample(ctx, gainNode, acousticKit.kick, startTime, volume * 0.9);
    } else {
      // Synthesized kick
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, startTime);
      osc.frequency.exponentialRampToValueAtTime(40, startTime + 0.1);
      const kickGain = ctx.createGain();
      kickGain.gain.setValueAtTime(0.4 * volume, startTime);
      kickGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.3);
      osc.connect(kickGain);
      kickGain.connect(gainNode);
      osc.start(startTime);
      osc.stop(startTime + 0.35);
      
      const click = ctx.createOscillator();
      click.type = 'triangle';
      click.frequency.value = 800;
      const clickGain = ctx.createGain();
      clickGain.gain.setValueAtTime(0.1 * volume, startTime);
      clickGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.02);
      click.connect(clickGain);
      clickGain.connect(gainNode);
      click.start(startTime);
      click.stop(startTime + 0.03);
    }
    
  } else if (drumType === 'snare') {
    if (useAcousticSamples && acousticKit.snare) {
      playSample(ctx, gainNode, acousticKit.snare, startTime, volume * 0.8);
    } else {
      // Synthesized snare
      const bufferSize = ctx.sampleRate * 0.2;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;
      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'highpass';
      noiseFilter.frequency.value = 1000;
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.2 * volume, startTime);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.15);
      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(gainNode);
      noise.start(startTime);
      noise.stop(startTime + 0.2);
      
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = 180;
      const oscGain = ctx.createGain();
      oscGain.gain.setValueAtTime(0.15 * volume, startTime);
      oscGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.08);
      osc.connect(oscGain);
      oscGain.connect(gainNode);
      osc.start(startTime);
      osc.stop(startTime + 0.1);
    }
    
  } else if (drumType === 'snareStick') {
    // Snare rim/edge hit
    if (useAcousticSamples && acousticKit.snareStick) {
      playSample(ctx, gainNode, acousticKit.snareStick, startTime, volume * 0.7);
    } else {
      // Synthesized rim click
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = 1200;
      const oscGain = ctx.createGain();
      oscGain.gain.setValueAtTime(0.12 * volume, startTime);
      oscGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.04);
      osc.connect(oscGain);
      oscGain.connect(gainNode);
      osc.start(startTime);
      osc.stop(startTime + 0.05);
    }
    
  } else if (drumType === 'hihat') {
    // Hi-hat closed (hand)
    if (useAcousticSamples && acousticKit.hihat) {
      playSample(ctx, gainNode, acousticKit.hihat, startTime, volume * 0.5);
    } else {
      // Synthesized hi-hat
      const bufferSize = ctx.sampleRate * 0.1;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;
      const hiFilter = ctx.createBiquadFilter();
      hiFilter.type = 'highpass';
      hiFilter.frequency.value = 7000;
      const loFilter = ctx.createBiquadFilter();
      loFilter.type = 'lowpass';
      loFilter.frequency.value = 14000;
      const hatGain = ctx.createGain();
      hatGain.gain.setValueAtTime(0.08 * volume, startTime);
      hatGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.05);
      noise.connect(hiFilter);
      hiFilter.connect(loFilter);
      loFilter.connect(hatGain);
      hatGain.connect(gainNode);
      noise.start(startTime);
      noise.stop(startTime + 0.08);
    }
    
  } else if (drumType === 'hihatFoot') {
    // Hi-hat foot pedal
    if (useAcousticSamples && acousticKit.hihatFoot2) {
      playSample(ctx, gainNode, acousticKit.hihatFoot2, startTime, volume * 0.45);
    } else if (useAcousticSamples && acousticKit.hihatFoot) {
      playSample(ctx, gainNode, acousticKit.hihatFoot, startTime, volume * 0.45);
    } else {
      // Synthesized foot hi-hat (shorter, more muffled)
      const bufferSize = ctx.sampleRate * 0.08;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 5000;
      filter.Q.value = 2;
      const hatGain = ctx.createGain();
      hatGain.gain.setValueAtTime(0.06 * volume, startTime);
      hatGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.04);
      noise.connect(filter);
      filter.connect(hatGain);
      hatGain.connect(gainNode);
      noise.start(startTime);
      noise.stop(startTime + 0.06);
    }
    
  } else if (drumType === 'tom1') {
    // High tom
    if (useAcousticSamples && acousticKit.tom1) {
      playSample(ctx, gainNode, acousticKit.tom1, startTime, volume * 0.8);
    } else {
      // Synthesized high tom
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(200, startTime);
      osc.frequency.exponentialRampToValueAtTime(120, startTime + 0.15);
      const tomGain = ctx.createGain();
      tomGain.gain.setValueAtTime(0.3 * volume, startTime);
      tomGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.25);
      osc.connect(tomGain);
      tomGain.connect(gainNode);
      osc.start(startTime);
      osc.stop(startTime + 0.3);
    }
    
  } else if (drumType === 'tom2') {
    // Mid tom
    if (useAcousticSamples && acousticKit.tom2) {
      playSample(ctx, gainNode, acousticKit.tom2, startTime, volume * 0.8);
    } else {
      // Synthesized mid tom
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, startTime);
      osc.frequency.exponentialRampToValueAtTime(90, startTime + 0.18);
      const tomGain = ctx.createGain();
      tomGain.gain.setValueAtTime(0.3 * volume, startTime);
      tomGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.3);
      osc.connect(tomGain);
      tomGain.connect(gainNode);
      osc.start(startTime);
      osc.stop(startTime + 0.35);
    }
    
  } else if (drumType === 'floorTom') {
    // Floor tom
    if (useAcousticSamples && acousticKit.floorTom) {
      playSample(ctx, gainNode, acousticKit.floorTom, startTime, volume * 0.85);
    } else {
      // Synthesized floor tom
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(100, startTime);
      osc.frequency.exponentialRampToValueAtTime(60, startTime + 0.2);
      const tomGain = ctx.createGain();
      tomGain.gain.setValueAtTime(0.35 * volume, startTime);
      tomGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.35);
      osc.connect(tomGain);
      tomGain.connect(gainNode);
      osc.start(startTime);
      osc.stop(startTime + 0.4);
    }
    
  } else if (drumType === 'ride') {
    // Ride cymbal
    if (useAcousticSamples && acousticKit.ride) {
      playSample(ctx, gainNode, acousticKit.ride, startTime, volume * 0.55);
    } else {
      // Synthesized ride
      const bufferSize = ctx.sampleRate * 0.3;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 5000;
      filter.Q.value = 0.5;
      const rideGain = ctx.createGain();
      rideGain.gain.setValueAtTime(0.06 * volume, startTime);
      rideGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.25);
      noise.connect(filter);
      filter.connect(rideGain);
      rideGain.connect(gainNode);
      noise.start(startTime);
      noise.stop(startTime + 0.3);
    }
    
  } else if (drumType === 'crash') {
    // Crash cymbal
    if (useAcousticSamples && acousticKit.crash) {
      playSample(ctx, gainNode, acousticKit.crash, startTime, volume * 0.7);
    } else {
      // Synthesized crash
      const bufferSize = ctx.sampleRate * 0.8;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;
      const hiFilter = ctx.createBiquadFilter();
      hiFilter.type = 'highpass';
      hiFilter.frequency.value = 3000;
      const crashGain = ctx.createGain();
      crashGain.gain.setValueAtTime(0.15 * volume, startTime);
      crashGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.7);
      noise.connect(hiFilter);
      hiFilter.connect(crashGain);
      crashGain.connect(gainNode);
      noise.start(startTime);
      noise.stop(startTime + 0.8);
    }
  }
}

/**
 * Plays a click/tick sound for the metronome
 */
function playClick(
  ctx: AudioContext,
  destination: AudioNode,
  startTime: number,
  isDownbeat: boolean = false
): void {
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();
  
  osc.type = 'sine';
  osc.frequency.value = isDownbeat ? 1000 : 800;
  
  osc.connect(gainNode);
  gainNode.connect(destination);
  
  gainNode.gain.setValueAtTime(0, startTime);
  gainNode.gain.linearRampToValueAtTime(0.15, startTime + 0.005);
  gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + 0.05);
  
  osc.start(startTime);
  osc.stop(startTime + 0.06);
}

export interface PlaybackOptions {
  loop?: boolean;
  metronome?: boolean;
  instruments: InstrumentState[];
  style: StylePattern;
  transposition?: number;
  onBeat?: (beat: number) => void;
  onChordChange?: (index: number) => void;
  onLoopEnd?: () => void;
  onStep?: (step: number) => void;
  onStepChange?: (step: number) => void; // Called continuously for playhead sync
  getStyle?: () => StylePattern;
  forceFill?: boolean;
}

/**
 * Schedules playback with instruments, styles, and sections
 * Now schedules bar-by-bar for immediate style updates
 */
export function scheduleProgression(
  sections: Section[],
  bpm: number,
  options: PlaybackOptions
): { duration: number; cancel: () => void } {
  const { 
    loop = false, 
    metronome = true, 
    instruments, 
    style, 
    transposition = 0, 
    onBeat, 
    onChordChange, 
    onLoopEnd,
    onStep,
    onStepChange,
    getStyle,
    forceFill = false
  } = options;
  
  const ctx = getAudioContext();
  const startTime = ctx.currentTime + 0.1;
  const beatDuration = 60 / bpm;
  const barDuration = beatDuration * 4; // 4 beats per bar
  const slotDuration = beatDuration / 4; // 16th note duration
  
  const timeouts: number[] = [];
  let cancelled = false;
  let nextBarTimeout: number | null = null;
  
  // Get sound types for each instrument
  const pianoState = instruments.find(i => i.id === 'piano');
  const bassState = instruments.find(i => i.id === 'bass');
  const drumsState = instruments.find(i => i.id === 'drums');
  
  const pianoSound = pianoState ? getSoundType('piano', pianoState.soundTypeId) : null;
  const bassSound = bassState ? getSoundType('bass', bassState.soundTypeId) : null;
  const drumsSound = drumsState ? getSoundType('drums', drumsState.soundTypeId) : null;
  
  // Build a flat list of chord segments with their slot counts
  // Each chord gets exactly as many slots as its duration in beats * 4 (16th notes per beat)
  interface ChordSegment {
    chord: Chord;
    slotCount: number; // Number of 16th note slots for this chord
    globalChordIndex: number;
    beatOffset: number; // Beat offset within the full progression for bar numbering
  }
  
  const buildChordSegments = (): ChordSegment[] => {
    const segments: ChordSegment[] = [];
    let globalChordIndex = 0;
    let beatOffset = 0;
    
    sections.forEach(section => {
      for (let repeat = 0; repeat < section.repeatCount; repeat++) {
        section.chords.forEach((chord) => {
          // Each beat = 4 slots (16th notes)
          const slotCount = chord.duration * 4;
          segments.push({
            chord,
            slotCount,
            globalChordIndex,
            beatOffset
          });
          beatOffset += chord.duration;
          globalChordIndex++;
        });
      }
    });
    
    return segments;
  };
  
  const chordSegments = buildChordSegments();
  let currentSegmentIndex = 0;
  let slotWithinSegment = 0;
  let globalSlotIndex = 0;
  let lastChordIndex = -1;
  
  // Calculate total slots
  const totalSlots = chordSegments.reduce((sum, seg) => sum + seg.slotCount, 0);
  
  // Schedule a batch of slots (one chord segment at a time for efficiency)
  const scheduleSegment = (segmentStartTime: number) => {
    if (cancelled) return;
    
    // Check if we've finished all segments
    if (currentSegmentIndex >= chordSegments.length) {
      if (loop) {
        onLoopEnd?.();
        currentSegmentIndex = 0;
        slotWithinSegment = 0;
        globalSlotIndex = 0;
        lastChordIndex = -1;
        // Schedule next loop iteration
        const delayMs = Math.max(0, (segmentStartTime - ctx.currentTime) * 1000);
        nextBarTimeout = window.setTimeout(() => {
          if (!cancelled) {
            scheduleSegment(ctx.currentTime + 0.05);
          }
        }, delayMs);
      }
      return;
    }
    
    const segment = chordSegments[currentSegmentIndex];
    const { chord, slotCount, globalChordIndex, beatOffset } = segment;
    
    // Get current style
    const currentStyle = getStyle ? getStyle() : style;
    
    const midiNotes = chordToMidiNotes(chord).map(note => note + transposition);
    
    // Schedule chord change callback (only at start of chord)
    if (globalChordIndex !== lastChordIndex) {
      lastChordIndex = globalChordIndex;
      if (onChordChange) {
        const delayMs = Math.max(0, (segmentStartTime - ctx.currentTime) * 1000);
        const timeout = window.setTimeout(() => {
          if (!cancelled) onChordChange(globalChordIndex);
        }, delayMs);
        timeouts.push(timeout);
      }
    }
    
    // Calculate which bar pattern slot to use (0-15 within a 16-slot pattern)
    // This creates proper musical phrasing even for shorter chords
    const segmentDuration = slotCount * slotDuration;
    
    // Calculate bar number for fill logic based on beat position
    const barNumber = Math.floor(beatOffset / 4) + 1;
    const effectiveBarNumber = forceFill ? 4 : barNumber;
    
    // Generate a full bar pattern - we'll use the slots we need from it
    const pattern = generateBarPattern(currentStyle, effectiveBarNumber, 4, true);
    
    // Schedule each slot in this chord segment
    for (let i = 0; i < slotCount; i++) {
      const slotTime = segmentStartTime + (i * slotDuration);
      
      // Calculate which slot in the 16-slot pattern to use
      // This allows patterns to wrap correctly for longer chords
      const patternSlot = (globalSlotIndex + i) % 16;
      
      // Schedule step change callback for playhead sync
      if (onStepChange) {
        const stepDelayMs = Math.max(0, (slotTime - ctx.currentTime) * 1000);
        const stepTimeout = window.setTimeout(() => {
          if (!cancelled) onStepChange(patternSlot);
        }, stepDelayMs);
        timeouts.push(stepTimeout);
      }
      
      if (onStep) {
        const stepDelayMs = Math.max(0, (slotTime - ctx.currentTime) * 1000);
        const stepTimeout = window.setTimeout(() => {
          if (!cancelled) onStep(patternSlot);
        }, stepDelayMs);
        timeouts.push(stepTimeout);
      }
      
      // Schedule metronome on beat boundaries (every 4 slots)
      if (metronome && masterGain && patternSlot % 4 === 0) {
        const beatInBar = Math.floor(patternSlot / 4);
        const isDownbeat = patternSlot === 0;
        playClick(ctx, masterGain, slotTime, isDownbeat);
        
        if (onBeat) {
          const beatDelayMs = Math.max(0, (slotTime - ctx.currentTime) * 1000);
          const beatTimeout = window.setTimeout(() => {
            if (!cancelled) onBeat(beatInBar);
          }, beatDelayMs);
          timeouts.push(beatTimeout);
        }
      }
      
      // Piano - uses velocity from pattern
      const pianoVelocity = pattern.piano[patternSlot];
      if (pianoState && isInstrumentAudible(pianoState, instruments) && pianoSound && pianoVelocity > 0) {
        midiNotes.forEach(midiNote => {
          const frequency = midiToFrequency(midiNote);
          playPianoNote(
            ctx, masterGain!, frequency, slotTime, 
            slotDuration * 3, pianoSound, 
            pianoState.volume * currentStyle.volumes.piano * pianoVelocity
          );
        });
      }
      
      // Bass - uses velocity from pattern
      const bassVelocity = pattern.bass[patternSlot];
      if (bassState && isInstrumentAudible(bassState, instruments) && bassSound && bassVelocity > 0) {
        const bassNote = midiNotes[0];
        const frequency = midiToFrequency(bassNote);
        const noteDuration = currentStyle.bassSustain ? beatDuration * 2 : slotDuration * 2;
        playBassNote(
          ctx, masterGain!, frequency, slotTime,
          noteDuration, bassSound,
          bassState.volume * currentStyle.volumes.bass * bassVelocity
        );
      }
      
      // Drums - all drum types with velocities
      if (drumsState && isInstrumentAudible(drumsState, instruments) && drumsSound) {
        const baseVolume = drumsState.volume * currentStyle.volumes.drums;
        
        if (pattern.kick[patternSlot] > 0) {
          playDrumHit(ctx, masterGain!, slotTime, drumsSound, baseVolume * pattern.kick[patternSlot], 'kick');
        }
        if (pattern.snare[patternSlot] > 0) {
          playDrumHit(ctx, masterGain!, slotTime, drumsSound, baseVolume * pattern.snare[patternSlot], 'snare');
        }
        if (pattern.snareStick[patternSlot] > 0) {
          playDrumHit(ctx, masterGain!, slotTime, drumsSound, baseVolume * pattern.snareStick[patternSlot], 'snareStick');
        }
        if (pattern.hihat[patternSlot] > 0) {
          playDrumHit(ctx, masterGain!, slotTime, drumsSound, baseVolume * pattern.hihat[patternSlot] * 0.7, 'hihat');
        }
        if (pattern.hihatFoot[patternSlot] > 0) {
          playDrumHit(ctx, masterGain!, slotTime, drumsSound, baseVolume * pattern.hihatFoot[patternSlot] * 0.6, 'hihatFoot');
        }
        if (pattern.tom1[patternSlot] > 0) {
          playDrumHit(ctx, masterGain!, slotTime, drumsSound, baseVolume * pattern.tom1[patternSlot], 'tom1');
        }
        if (pattern.tom2[patternSlot] > 0) {
          playDrumHit(ctx, masterGain!, slotTime, drumsSound, baseVolume * pattern.tom2[patternSlot], 'tom2');
        }
        if (pattern.floorTom[patternSlot] > 0) {
          playDrumHit(ctx, masterGain!, slotTime, drumsSound, baseVolume * pattern.floorTom[patternSlot], 'floorTom');
        }
        if (pattern.ride[patternSlot] > 0) {
          playDrumHit(ctx, masterGain!, slotTime, drumsSound, baseVolume * pattern.ride[patternSlot] * 0.7, 'ride');
        }
        if (pattern.crash[patternSlot] > 0) {
          playDrumHit(ctx, masterGain!, slotTime, drumsSound, baseVolume * pattern.crash[patternSlot], 'crash');
        }
      }
    }
    
    // Update global slot index
    globalSlotIndex += slotCount;
    
    // Schedule next segment
    currentSegmentIndex++;
    const nextSegmentTime = segmentStartTime + segmentDuration;
    const delayMs = Math.max(0, (nextSegmentTime - ctx.currentTime - 0.1) * 1000);
    
    nextBarTimeout = window.setTimeout(() => {
      if (!cancelled) {
        scheduleSegment(nextSegmentTime);
      }
    }, delayMs);
  };
  
  // Calculate total duration for return value
  const totalDuration = totalSlots * slotDuration;
  
  // Start scheduling
  scheduleSegment(startTime);
  
  return {
    duration: totalDuration,
    cancel: () => {
      cancelled = true;
      timeouts.forEach(t => clearTimeout(t));
      if (nextBarTimeout) clearTimeout(nextBarTimeout);
    }
  };
}

/**
 * Renders a chord progression to an audio buffer (for export)
 */
export async function renderProgressionOffline(
  sections: Section[],
  bpm: number,
  instruments: InstrumentState[],
  style: StylePattern,
  transposition: number = 0,
  sampleRate: number = 44100
): Promise<AudioBuffer> {
  // Ensure samples are loaded
  await ensureSamplesLoaded();
  
  // Load samples into offline context if available
  const offlineKit: Partial<AcousticKitSamples> = {};
  const samplePaths: { key: keyof AcousticKitSamples; path: string }[] = [
    { key: 'kick', path: '/audio/kick.mp3' },
    { key: 'snare', path: '/audio/snare-drum.mp3' },
    { key: 'snareStick', path: '/audio/snare-stick.mp3' },
    { key: 'hihat', path: '/audio/hihat.mp3' },
    { key: 'hihatFoot', path: '/audio/hihat-foot.mp3' },
    { key: 'hihatFoot2', path: '/audio/hihat-foot-2.mp3' },
    { key: 'tom1', path: '/audio/tom1.mp3' },
    { key: 'tom2', path: '/audio/tom2.mp3' },
    { key: 'floorTom', path: '/audio/floor-tom.mp3' },
    { key: 'ride', path: '/audio/ride.mp3' },
    { key: 'crash', path: '/audio/crash.mp3' },
  ];
  
  const tempCtx = new OfflineAudioContext(2, 1, sampleRate);
  await Promise.all(
    samplePaths.map(async ({ key, path }) => {
      if (acousticKit[key]) {
        try {
          const response = await fetch(path);
          const arrayBuffer = await response.arrayBuffer();
          offlineKit[key] = await tempCtx.decodeAudioData(arrayBuffer);
        } catch (error) {
          console.warn(`Failed to load ${key} for offline:`, error);
        }
      }
    })
  );
  
  // Calculate total duration
  let totalBeats = 0;
  sections.forEach(section => {
    const sectionBeats = section.chords.reduce((sum, chord) => sum + chord.duration, 0);
    totalBeats += sectionBeats * section.repeatCount;
  });
  
  const totalDuration = (totalBeats * 60) / bpm;
  const totalSamples = Math.ceil(totalDuration * sampleRate) + sampleRate;
  
  const offlineCtx = new OfflineAudioContext(2, totalSamples, sampleRate);
  const offlineMasterGain = offlineCtx.createGain();
  offlineMasterGain.gain.value = 0.5;
  offlineMasterGain.connect(offlineCtx.destination);
  
  const beatDuration = 60 / bpm;
  let currentTime = 0;
  
  const pianoState = instruments.find(i => i.id === 'piano');
  const bassState = instruments.find(i => i.id === 'bass');
  const drumsState = instruments.find(i => i.id === 'drums');
  
  const pianoSound = pianoState ? getSoundType('piano', pianoState.soundTypeId) : null;
  const bassSound = bassState ? getSoundType('bass', bassState.soundTypeId) : null;
  const drumsSound = drumsState ? getSoundType('drums', drumsState.soundTypeId) : null;
  
  const slotDuration = beatDuration / 4;
  let globalSlotIndex = 0;
  let beatOffset = 0;
  
  sections.forEach(section => {
    for (let repeat = 0; repeat < section.repeatCount; repeat++) {
      section.chords.forEach(chord => {
        const midiNotes = chordToMidiNotes(chord).map(note => note + transposition);
        const chordStartTime = currentTime;
        
        // Calculate exact slot count based on chord duration
        const slotCount = chord.duration * 4; // 4 slots per beat
        
        // Calculate bar number for fill logic
        const barNumber = Math.floor(beatOffset / 4) + 1;
        
        // Generate pattern using bar number
        const pattern = generateBarPattern(style, barNumber, 4, true);
        
        // Process each slot in this chord
        for (let i = 0; i < slotCount; i++) {
          const slotTime = chordStartTime + (i * slotDuration);
          
          // Use pattern slot based on global position (wraps every 16 slots)
          const patternSlot = (globalSlotIndex + i) % 16;
          
          // Piano
          const pianoVelocity = pattern.piano[patternSlot];
          if (pianoState && !pianoState.muted && pianoSound && pianoVelocity > 0) {
            midiNotes.forEach(midiNote => {
              const frequency = midiToFrequency(midiNote);
              const volume = pianoState.volume * style.volumes.piano * pianoVelocity;
              const baseFreq = frequency * Math.pow(2, pianoSound.octaveOffset);
              
              const harmonics = [
                { freq: 1, amp: 1.0 },
                { freq: 2, amp: 0.5 },
                { freq: 3, amp: 0.25 },
                { freq: 4, amp: 0.15 },
              ];
              
              const pianoGain = offlineCtx.createGain();
              pianoGain.connect(offlineMasterGain);
              
              harmonics.forEach(({ freq, amp }) => {
                const osc = offlineCtx.createOscillator();
                const oscGain = offlineCtx.createGain();
                osc.type = freq === 1 ? pianoSound.oscillatorType : 'sine';
                osc.frequency.value = baseFreq * freq;
                oscGain.gain.value = amp * 0.12 * volume;
                osc.connect(oscGain);
                oscGain.connect(pianoGain);
                osc.start(slotTime);
                osc.stop(slotTime + slotDuration * 3);
              });
              
              pianoGain.gain.setValueAtTime(0, slotTime);
              pianoGain.gain.linearRampToValueAtTime(1, slotTime + pianoSound.attackTime);
              pianoGain.gain.linearRampToValueAtTime(pianoSound.sustainLevel, slotTime + pianoSound.attackTime + pianoSound.decayTime);
              pianoGain.gain.linearRampToValueAtTime(0, slotTime + slotDuration * 3);
            });
          }
          
          // Bass
          const bassVelocity = pattern.bass[patternSlot];
          if (bassState && !bassState.muted && bassSound && bassVelocity > 0) {
            const bassNote = midiNotes[0];
            const frequency = midiToFrequency(bassNote);
            const volume = bassState.volume * style.volumes.bass * bassVelocity;
            const baseFreq = frequency * Math.pow(2, bassSound.octaveOffset);
            const noteDuration = style.bassSustain ? beatDuration * 2 : slotDuration * 2;
            
            const bassGain = offlineCtx.createGain();
            const filter = offlineCtx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 800;
            filter.connect(bassGain);
            bassGain.connect(offlineMasterGain);
            
            const mainOsc = offlineCtx.createOscillator();
            mainOsc.type = bassSound.oscillatorType;
            mainOsc.frequency.value = baseFreq;
            const mainOscGain = offlineCtx.createGain();
            mainOscGain.gain.value = 0.2 * volume;
            mainOsc.connect(mainOscGain);
            mainOscGain.connect(filter);
            
            const subOsc = offlineCtx.createOscillator();
            subOsc.type = 'sine';
            subOsc.frequency.value = baseFreq / 2;
            const subOscGain = offlineCtx.createGain();
            subOscGain.gain.value = 0.15 * volume;
            subOsc.connect(subOscGain);
            subOscGain.connect(filter);
            
            bassGain.gain.setValueAtTime(0, slotTime);
            bassGain.gain.linearRampToValueAtTime(1, slotTime + bassSound.attackTime);
            bassGain.gain.linearRampToValueAtTime(bassSound.sustainLevel, slotTime + bassSound.attackTime + bassSound.decayTime);
            bassGain.gain.linearRampToValueAtTime(0, slotTime + noteDuration);
            
            mainOsc.start(slotTime);
            subOsc.start(slotTime);
            mainOsc.stop(slotTime + noteDuration + 0.1);
            subOsc.stop(slotTime + noteDuration + 0.1);
          }
          
          // Drums
          if (drumsState && !drumsState.muted && drumsSound) {
            const baseVolume = drumsState.volume * style.volumes.drums;
            
            // Kick
            if (pattern.kick[patternSlot] > 0) {
              const vol = baseVolume * pattern.kick[patternSlot];
              if (drumsSound.id === 'standard' && offlineKit.kick) {
                const source = offlineCtx.createBufferSource();
                source.buffer = offlineKit.kick;
                const gain = offlineCtx.createGain();
                gain.gain.value = vol * 0.9;
                source.connect(gain);
                gain.connect(offlineMasterGain);
                source.start(slotTime);
              } else {
                const osc = offlineCtx.createOscillator();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(150, slotTime);
                osc.frequency.exponentialRampToValueAtTime(40, slotTime + 0.1);
                const gain = offlineCtx.createGain();
                gain.gain.setValueAtTime(0.4 * vol, slotTime);
                gain.gain.exponentialRampToValueAtTime(0.001, slotTime + 0.3);
                osc.connect(gain);
                gain.connect(offlineMasterGain);
                osc.start(slotTime);
                osc.stop(slotTime + 0.35);
              }
            }
            
            // Snare
            if (pattern.snare[patternSlot] > 0) {
              const vol = baseVolume * pattern.snare[patternSlot];
              if (drumsSound.id === 'standard' && offlineKit.snare) {
                const source = offlineCtx.createBufferSource();
                source.buffer = offlineKit.snare;
                const gain = offlineCtx.createGain();
                gain.gain.value = vol * 0.8;
                source.connect(gain);
                gain.connect(offlineMasterGain);
                source.start(slotTime);
              } else {
                const osc = offlineCtx.createOscillator();
                osc.type = 'triangle';
                osc.frequency.value = 180;
                const gain = offlineCtx.createGain();
                gain.gain.setValueAtTime(0.2 * vol, slotTime);
                gain.gain.exponentialRampToValueAtTime(0.001, slotTime + 0.12);
                osc.connect(gain);
                gain.connect(offlineMasterGain);
                osc.start(slotTime);
                osc.stop(slotTime + 0.15);
              }
            }
            
            // Hi-hat
            if (pattern.hihat[patternSlot] > 0) {
              const vol = baseVolume * pattern.hihat[patternSlot] * 0.7;
              if (drumsSound.id === 'standard' && offlineKit.hihat) {
                const source = offlineCtx.createBufferSource();
                source.buffer = offlineKit.hihat;
                const gain = offlineCtx.createGain();
                gain.gain.value = vol * 0.5;
                source.connect(gain);
                gain.connect(offlineMasterGain);
                source.start(slotTime);
              }
            }
            
            // Snare stick (rim)
            if (pattern.snareStick[patternSlot] > 0) {
              const vol = baseVolume * pattern.snareStick[patternSlot];
              if (drumsSound.id === 'standard' && offlineKit.snareStick) {
                const source = offlineCtx.createBufferSource();
                source.buffer = offlineKit.snareStick;
                const gain = offlineCtx.createGain();
                gain.gain.value = vol * 0.7;
                source.connect(gain);
                gain.connect(offlineMasterGain);
                source.start(slotTime);
              }
            }
            
            // Hi-hat foot
            if (pattern.hihatFoot[patternSlot] > 0) {
              const vol = baseVolume * pattern.hihatFoot[patternSlot] * 0.6;
              const buffer = offlineKit.hihatFoot2 || offlineKit.hihatFoot;
              if (drumsSound.id === 'standard' && buffer) {
                const source = offlineCtx.createBufferSource();
                source.buffer = buffer;
                const gain = offlineCtx.createGain();
                gain.gain.value = vol * 0.45;
                source.connect(gain);
                gain.connect(offlineMasterGain);
                source.start(slotTime);
              }
            }
            
            // Toms
            if (pattern.tom1[patternSlot] > 0 && drumsSound.id === 'standard' && offlineKit.tom1) {
              const source = offlineCtx.createBufferSource();
              source.buffer = offlineKit.tom1;
              const gain = offlineCtx.createGain();
              gain.gain.value = baseVolume * pattern.tom1[patternSlot] * 0.8;
              source.connect(gain);
              gain.connect(offlineMasterGain);
              source.start(slotTime);
            }
            if (pattern.tom2[patternSlot] > 0 && drumsSound.id === 'standard' && offlineKit.tom2) {
              const source = offlineCtx.createBufferSource();
              source.buffer = offlineKit.tom2;
              const gain = offlineCtx.createGain();
              gain.gain.value = baseVolume * pattern.tom2[patternSlot] * 0.8;
              source.connect(gain);
              gain.connect(offlineMasterGain);
              source.start(slotTime);
            }
            if (pattern.floorTom[patternSlot] > 0 && drumsSound.id === 'standard' && offlineKit.floorTom) {
              const source = offlineCtx.createBufferSource();
              source.buffer = offlineKit.floorTom;
              const gain = offlineCtx.createGain();
              gain.gain.value = baseVolume * pattern.floorTom[patternSlot] * 0.85;
              source.connect(gain);
              gain.connect(offlineMasterGain);
              source.start(slotTime);
            }
            
            // Ride & Crash
            if (pattern.ride[patternSlot] > 0 && drumsSound.id === 'standard' && offlineKit.ride) {
              const source = offlineCtx.createBufferSource();
              source.buffer = offlineKit.ride;
              const gain = offlineCtx.createGain();
              gain.gain.value = baseVolume * pattern.ride[patternSlot] * 0.55;
              source.connect(gain);
              gain.connect(offlineMasterGain);
              source.start(slotTime);
            }
            if (pattern.crash[patternSlot] > 0 && drumsSound.id === 'standard' && offlineKit.crash) {
              const source = offlineCtx.createBufferSource();
              source.buffer = offlineKit.crash;
              const gain = offlineCtx.createGain();
              gain.gain.value = baseVolume * pattern.crash[patternSlot] * 0.7;
              source.connect(gain);
              gain.connect(offlineMasterGain);
              source.start(slotTime);
            }
          }
        }
        
        // Update counters
        globalSlotIndex += slotCount;
        beatOffset += chord.duration;
        currentTime += chord.duration * beatDuration;
      });
    }
  });
  
  return await offlineCtx.startRendering();
}

/**
 * Stops all audio playback
 */
export function stopPlayback(): void {
  if (audioContext) {
    audioContext.close();
    audioContext = null;
    masterGain = null;
  }
  currentlyPlaying = false;
  // Notify the UI that playback has stopped
  if (playbackStoppedCallback) {
    playbackStoppedCallback();
  }
}
