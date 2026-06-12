/**
 * Audio Engine
 * 
 * This module handles all audio synthesis and playback using the Web Audio API.
 * Supports multiple instruments with 16-slot rhythm patterns (16th note resolution).
 */

import { type Chord, chordToMidiNotes, midiToFrequency } from './musicTheory';
import { type InstrumentState, getSoundType, type SoundType, isInstrumentAudible } from './instruments';
import { scheduleSampledNoteByDir, scheduleSampledNoteByDirAsync, preloadSampleDir } from './bassTab/sampleEngine';
import { type StylePattern, generateBarPattern, type ArpeggioCell, type ArpeggioType, type ArpeggioSpeed } from './styles';
import { type Section } from './sections';
import { buildEffectsChain } from './audioEffects';

let audioContext: AudioContext | null = null;
let masterGain: GainNode | null = null;
let analyserNode: AnalyserNode | null = null;
let currentlyPlaying = false;
let playbackStoppedCallback: (() => void) | null = null;
let playbackMutex = false; // Prevent multiple simultaneous playback instances
let sampleLoadingComplete = false; // Track if initial load completed

/**
 * Get the analyser node for visualization
 */
export function getAnalyserNode(): AnalyserNode | null {
  return analyserNode;
}

/**
 * Get audio timing info for synchronization
 */
export function getAudioTiming(): { currentTime: number; isPlaying: boolean } {
  return {
    currentTime: audioContext?.currentTime ?? 0,
    isPlaying: currentlyPlaying
  };
}

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
  hihatOpen2: AudioBuffer | null;  // Alternative open hi-hat
  hihatOpen3: AudioBuffer | null;  // Third open hi-hat variation
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
  hihatOpen2: null,
  hihatOpen3: null,
  hihatFoot: null,
  hihatFoot2: null,
  tom1: null,
  tom2: null,
  floorTom: null,
  ride: null,
  crash: null,
};

// Piano sample buffers (samples 1-88 = MIDI notes 21-108)
interface PianoSamples {
  [midiNote: number]: AudioBuffer | null;
}

let pianoSamples: PianoSamples = {};
let pianoSamplesLoaded = false;

// Guitar sample buffers (organized by sample path/type)
interface GuitarSamples {
  [samplePath: string]: {
    [noteKey: string]: AudioBuffer | null;
  };
}

let guitarSamples: GuitarSamples = {
  'guitar-acoustic': {},
  'guitar-electric': {},
  'guitar-nylon': {},
};
let guitarSamplesLoaded = false;

let sampleLoadPromise: Promise<void> | null = null;

/**
 * Check if samples are fully loaded
 */
export function areSamplesLoaded(): boolean {
  return sampleLoadingComplete;
}

/**
 * Acquire playback mutex - returns true if acquired, false if already playing
 */
export function acquirePlaybackMutex(): boolean {
  if (playbackMutex) {
    console.warn('Playback already in progress, ignoring new play request');
    return false;
  }
  playbackMutex = true;
  return true;
}

/**
 * Release playback mutex
 */
export function releasePlaybackMutex(): void {
  playbackMutex = false;
}

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
    { key: 'hihatOpen2', path: '/audio/hihat-open-2.mp3' },
    { key: 'hihatOpen3', path: '/audio/hihat-open-3.mp3' },
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
 * Loads all piano samples (1.mp3 to 88.mp3 = MIDI notes 21-108)
 */
async function loadPianoSamples(ctx: AudioContext): Promise<void> {
  const loadPromises: Promise<void>[] = [];
  
  for (let i = 1; i <= 88; i++) {
    const midiNote = i + 20; // 1.mp3 = MIDI 21 (A0), 88.mp3 = MIDI 108 (C8)
    loadPromises.push(
      (async () => {
        try {
          const response = await fetch(`/audio/piano/${i}.mp3`);
          if (!response.ok) {
            console.warn(`Piano sample ${i}.mp3 not found`);
            pianoSamples[midiNote] = null;
            return;
          }
          const arrayBuffer = await response.arrayBuffer();
          pianoSamples[midiNote] = await ctx.decodeAudioData(arrayBuffer);
        } catch (error) {
          console.warn(`Failed to load piano sample ${i}.mp3:`, error);
          pianoSamples[midiNote] = null;
        }
      })()
    );
  }
  
  await Promise.all(loadPromises);
  pianoSamplesLoaded = true;
  console.log('Piano samples loaded');
}

/**
 * Loads guitar samples for all types (acoustic, electric, nylon)
 */
async function loadGuitarSamples(ctx: AudioContext): Promise<void> {
  const guitarTypes = [
    {
      path: 'guitar-acoustic',
      notes: ['A2', 'A3', 'A4', 'As2', 'As3', 'As4', 'B2', 'B3', 'B4', 'C3', 'C4', 'C5', 'Cs3', 'Cs4', 'D3', 'D4', 'Ds3', 'Ds4', 'E2', 'E3', 'E4', 'F3', 'F4', 'Fs3', 'Fs4', 'G3', 'G4', 'Gs3', 'Gs4']
    },
    {
      path: 'guitar-electric',
      notes: ['A2', 'A3', 'A4', 'A5', 'C3', 'C4', 'C5', 'C6', 'Cs2', 'Ds3', 'Ds4', 'Ds5', 'E2', 'Fs2', 'Fs3', 'Fs4', 'Fs5']
    },
    {
      path: 'guitar-nylon',
      notes: ['A2', 'A3', 'A4', 'As2', 'As3', 'As4', 'B2', 'B3', 'B4', 'C3', 'C4', 'C5', 'Cs3', 'Cs4', 'D3', 'D4', 'Ds3', 'Ds4', 'E2', 'E3', 'E4', 'F3', 'F4', 'Fs3', 'Fs4', 'G3', 'G4', 'Gs3', 'Gs4']
    }
  ];
  
  const loadPromises: Promise<void>[] = [];
  
  for (const guitarType of guitarTypes) {
    for (const noteKey of guitarType.notes) {
      loadPromises.push(
        (async () => {
          try {
            const response = await fetch(`/audio/${guitarType.path}/${noteKey}.mp3`);
            if (!response.ok) {
              guitarSamples[guitarType.path][noteKey] = null;
              return;
            }
            const arrayBuffer = await response.arrayBuffer();
            guitarSamples[guitarType.path][noteKey] = await ctx.decodeAudioData(arrayBuffer);
          } catch (error) {
            guitarSamples[guitarType.path][noteKey] = null;
          }
        })()
      );
    }
  }
  
  await Promise.all(loadPromises);
  guitarSamplesLoaded = true;
  console.log('Guitar samples loaded');
}

/**
 * Initializes or returns the existing AudioContext
 */
export function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
    masterGain = audioContext.createGain();
    masterGain.gain.value = 1.0;

    // Create analyser node for waveform visualization
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 256;
    analyserNode.smoothingTimeConstant = 0.8;

    // Insert master effects chain: masterGain -> [EQ -> Comp -> Reverb] -> analyser -> destination
    buildEffectsChain(audioContext, masterGain, analyserNode);
    analyserNode.connect(audioContext.destination);

    // Only load samples once per app lifecycle; buffers can be reused across contexts.
    if (!sampleLoadingComplete) {
      for (const dir of ['modo', 'slap', 'finger', 'muted']) {
        preloadSampleDir(audioContext, dir).catch(() => {})
      }
      sampleLoadPromise = Promise.all([
        loadAcousticSamples(audioContext),
        loadPianoSamples(audioContext),
        loadGuitarSamples(audioContext),
      ])
        .then(() => {
          sampleLoadingComplete = true;
          console.log('All samples loaded and ready');
        })
        .catch((err) => {
          console.error('Sample loading failed:', err);
          // Mark as complete even on error to prevent infinite waiting
          sampleLoadingComplete = true;
        });
    } else {
      sampleLoadPromise = Promise.resolve();
    }
  }

  // Always try to resume if suspended (mobile browsers suspend by default)
  if (audioContext.state === 'suspended') {
    audioContext.resume().catch(console.warn);
  }

  return audioContext;
}

/**
 * Pre-initializes the audio system for faster first playback
 * Call this early (e.g., on first user interaction) to warm up the audio
 */
export async function preloadAudio(): Promise<void> {
  const ctx = getAudioContext();
  
  // Wait for samples with timeout to prevent infinite waiting
  if (sampleLoadPromise) {
    try {
      await Promise.race([
        sampleLoadPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Sample load timeout')), 15000))
      ]);
    } catch (err) {
      console.warn('Sample preload warning:', err);
    }
  }
  
  // Ensure context is running
  if (ctx.state === 'suspended') {
    await ctx.resume();
  }
}

/**
 * Ensures samples are loaded before playback with timeout
 */
export async function ensureSamplesLoaded(): Promise<void> {
  const ctx = getAudioContext();
  
  // Resume if suspended (critical for mobile)
  if (ctx.state === 'suspended') {
    await ctx.resume();
  }
  
  if (sampleLoadPromise && !sampleLoadingComplete) {
    try {
      await Promise.race([
        sampleLoadPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000))
      ]);
    } catch (err) {
      console.warn('Sample loading timeout, proceeding with synthesis fallback');
    }
  }
}

/**
 * Plays a chord preview - single chord playback for editing feedback
 * This function is self-contained and doesn't require prior audio initialization
 */
export function playChordPreview(chord: Chord, volume: number = 0.5): void {
  const ctx = getAudioContext();
  
  // Resume context if suspended (required for user interaction)
  if (ctx.state === 'suspended') {
    ctx.resume();
  }
  
  // Create a local gain node that connects directly to destination
  // This ensures the preview works even if masterGain hasn't been initialized
  const previewGain = ctx.createGain();
  previewGain.gain.value = 0.5;
  previewGain.connect(ctx.destination);
  
  const midiNotes = chordToMidiNotes(chord, 4);
  const now = ctx.currentTime;
  const duration = 0.5; // Short preview duration
  
  midiNotes.forEach(midiNote => {
    const frequency = midiToFrequency(midiNote);
    
    const gainNode = ctx.createGain();
    gainNode.connect(previewGain);
    
    // Simple piano-like sound for preview with harmonics
    const harmonics = [
      { freq: 1, amp: 1.0 },
      { freq: 2, amp: 0.4 },
      { freq: 3, amp: 0.2 },
    ];
    
    harmonics.forEach(({ freq, amp }) => {
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      
      osc.type = freq === 1 ? 'triangle' : 'sine';
      osc.frequency.value = frequency * freq;
      oscGain.gain.value = amp * 0.12 * volume;
      
      osc.connect(oscGain);
      oscGain.connect(gainNode);
      
      osc.start(now);
      osc.stop(now + duration + 0.1);
    });
    
    // Quick ADSR for preview
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(1, now + 0.02);
    gainNode.gain.linearRampToValueAtTime(0.7, now + 0.1);
    gainNode.gain.setValueAtTime(0.7, now + duration - 0.1);
    gainNode.gain.linearRampToValueAtTime(0, now + duration);
  });
}

/**
 * Plays a piano sample with envelope
 */
function playPianoSample(
  ctx: AudioContext,
  destination: AudioNode,
  midiNote: number,
  startTime: number,
  duration: number,
  volume: number
): void {
  const sample = pianoSamples[midiNote];
  
  if (!sample) {
    // Fallback to synthesis if sample not available
    const frequency = midiToFrequency(midiNote);
    const fallbackSoundType = getSoundType('piano', 'acoustic');
    if (fallbackSoundType) {
      playPianoNoteSynth(ctx, destination, frequency, startTime, duration, fallbackSoundType, volume);
    }
    return;
  }
  
  const source = ctx.createBufferSource();
  const gainNode = ctx.createGain();
  
  source.buffer = sample;
  source.connect(gainNode);
  gainNode.connect(destination);
  
  // Envelope with gradual release
  gainNode.gain.setValueAtTime(volume * 0.8, startTime);
  
  const releaseStart = startTime + Math.max(0, duration - 0.1);
  gainNode.gain.setValueAtTime(volume * 0.8, releaseStart);
  gainNode.gain.linearRampToValueAtTime(0, startTime + duration + 0.3);
  
  source.start(startTime);
  source.stop(startTime + Math.max(duration + 0.4, sample.duration));
}

/**
 * Creates and plays piano notes with harmonic synthesis for realistic sound
 */
function playPianoNoteSynth(
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
 * Main piano note function - uses samples or synthesis based on sound type
 */
function playPianoNote(
  ctx: AudioContext,
  destination: AudioNode,
  frequency: number,
  startTime: number,
  duration: number,
  soundType: SoundType,
  volume: number,
  midiNote?: number
): void {
  if (soundType.useSamples && midiNote !== undefined) {
    playPianoSample(ctx, destination, midiNote, startTime, duration, volume);
  } else {
    playPianoNoteSynth(ctx, destination, frequency, startTime, duration, soundType, volume);
  }
}

/**
 * Converts MIDI note number to note key string (e.g., 40 -> 'E2', 60 -> 'C4')
 */
function midiToNoteKey(midiNote: number): string {
  const notes = ['C', 'Cs', 'D', 'Ds', 'E', 'F', 'Fs', 'G', 'Gs', 'A', 'As', 'B'];
  const octave = Math.floor(midiNote / 12) - 1;
  const noteIndex = midiNote % 12;
  return notes[noteIndex] + octave;
}

/**
 * Finds the closest available guitar sample and returns pitch adjustment
 */
function findClosestGuitarSample(
  samplePath: string,
  midiNote: number
): { noteKey: string; pitchAdjust: number } | null {
  const samples = guitarSamples[samplePath];
  if (!samples) return null;
  
  const targetKey = midiToNoteKey(midiNote);
  
  // Check exact match first
  if (samples[targetKey]) {
    return { noteKey: targetKey, pitchAdjust: 0 };
  }
  
  // Search for closest sample (within +/- 6 semitones)
  for (let offset = 1; offset <= 6; offset++) {
    const lowerKey = midiToNoteKey(midiNote - offset);
    const upperKey = midiToNoteKey(midiNote + offset);
    
    if (samples[lowerKey]) {
      return { noteKey: lowerKey, pitchAdjust: offset };
    }
    if (samples[upperKey]) {
      return { noteKey: upperKey, pitchAdjust: -offset };
    }
  }
  
  return null;
}

/**
 * Plays a guitar sample with pitch adjustment and envelope
 */
function playGuitarSample(
  ctx: AudioContext,
  destination: AudioNode,
  midiNote: number,
  startTime: number,
  duration: number,
  volume: number,
  samplePath: string
): void {
  const match = findClosestGuitarSample(samplePath, midiNote);
  
  if (!match) {
    // Fallback to synthesis
    const frequency = midiToFrequency(midiNote);
    playGuitarSynth(ctx, destination, frequency, startTime, duration, volume);
    return;
  }
  
  const sample = guitarSamples[samplePath][match.noteKey];
  if (!sample) return;
  
  const source = ctx.createBufferSource();
  const gainNode = ctx.createGain();
  
  source.buffer = sample;
  
  // Adjust playback rate for pitch shifting
  if (match.pitchAdjust !== 0) {
    source.playbackRate.value = Math.pow(2, match.pitchAdjust / 12);
  }
  
  source.connect(gainNode);
  gainNode.connect(destination);
  
  // Natural guitar envelope
  gainNode.gain.setValueAtTime(volume * 0.8, startTime);
  
  const releaseStart = startTime + Math.max(0, duration - 0.15);
  gainNode.gain.setValueAtTime(volume * 0.8, releaseStart);
  gainNode.gain.linearRampToValueAtTime(0, startTime + duration + 0.2);
  
  source.start(startTime);
  source.stop(startTime + Math.max(duration + 0.3, sample.duration / (source.playbackRate.value || 1)));
}

/**
 * Synthesized guitar fallback
 */
function playGuitarSynth(
  ctx: AudioContext,
  destination: AudioNode,
  frequency: number,
  startTime: number,
  duration: number,
  volume: number
): void {
  const gainNode = ctx.createGain();
  gainNode.connect(destination);
  
  // Create guitar-like harmonics
  const harmonics = [
    { freq: 1, amp: 1.0 },
    { freq: 2, amp: 0.5 },
    { freq: 3, amp: 0.3 },
    { freq: 4, amp: 0.15 },
  ];
  
  harmonics.forEach(({ freq, amp }) => {
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    
    osc.type = freq === 1 ? 'triangle' : 'sine';
    osc.frequency.value = frequency * freq;
    oscGain.gain.value = amp * 0.12 * volume;
    
    osc.connect(oscGain);
    oscGain.connect(gainNode);
    
    osc.start(startTime);
    osc.stop(startTime + duration + 0.1);
  });
  
  // Guitar envelope (quick attack, gradual decay)
  gainNode.gain.setValueAtTime(0, startTime);
  gainNode.gain.linearRampToValueAtTime(1, startTime + 0.01);
  gainNode.gain.linearRampToValueAtTime(0.6, startTime + 0.1);
  gainNode.gain.setValueAtTime(0.6, startTime + duration - 0.1);
  gainNode.gain.linearRampToValueAtTime(0, startTime + duration);
}

/**
 * Main guitar note function - uses samples or synthesis based on sound type
 */
function playGuitarNote(
  ctx: AudioContext,
  destination: AudioNode,
  frequency: number,
  startTime: number,
  duration: number,
  soundType: SoundType,
  volume: number,
  midiNote?: number
): void {
  if (soundType.useSamples && soundType.samplePath && midiNote !== undefined) {
    playGuitarSample(ctx, destination, midiNote, startTime, duration, volume, soundType.samplePath);
  } else {
    playGuitarSynth(ctx, destination, frequency, startTime, duration, volume);
  }
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
  drumType: 'kick' | 'snare' | 'snareStick' | 'hihat' | 'hihatOpen' | 'hihatFoot' | 'tom1' | 'tom2' | 'floorTom' | 'ride' | 'crash'
): void {
  const gainNode = ctx.createGain();
  gainNode.connect(destination);
  const useAcousticSamples = soundType.id === 'standard';
  
  if (drumType === 'kick') {
    if (useAcousticSamples && acousticKit.kick) {
      playSample(ctx, gainNode, acousticKit.kick, startTime, volume * 1.1);
    } else {
      // Synthesized kick
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, startTime);
      osc.frequency.exponentialRampToValueAtTime(40, startTime + 0.1);
      const kickGain = ctx.createGain();
      kickGain.gain.setValueAtTime(0.5 * volume, startTime);
      kickGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.3);
      osc.connect(kickGain);
      kickGain.connect(gainNode);
      osc.start(startTime);
      osc.stop(startTime + 0.35);
      
      const click = ctx.createOscillator();
      click.type = 'triangle';
      click.frequency.value = 800;
      const clickGain = ctx.createGain();
      clickGain.gain.setValueAtTime(0.15 * volume, startTime);
      clickGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.02);
      click.connect(clickGain);
      clickGain.connect(gainNode);
      click.start(startTime);
      click.stop(startTime + 0.03);
    }
    
  } else if (drumType === 'snare') {
    if (useAcousticSamples && acousticKit.snare) {
      playSample(ctx, gainNode, acousticKit.snare, startTime, volume * 1.0);
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
      playSample(ctx, gainNode, acousticKit.hihat, startTime, volume * 0.7);
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
      hatGain.gain.setValueAtTime(0.12 * volume, startTime);
      hatGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.05);
      noise.connect(hiFilter);
      hiFilter.connect(loFilter);
      loFilter.connect(hatGain);
      hatGain.connect(gainNode);
      noise.start(startTime);
      noise.stop(startTime + 0.08);
    }
    
  } else if (drumType === 'hihatOpen') {
    // Hi-hat open - use one of the open samples with random variation
    if (useAcousticSamples) {
      const openSamples = [acousticKit.hihatOpen, acousticKit.hihatOpen2, acousticKit.hihatOpen3].filter(s => s !== null);
      if (openSamples.length > 0) {
        const sample = openSamples[Math.floor(Math.random() * openSamples.length)];
        playSample(ctx, gainNode, sample!, startTime, volume * 0.75);
      }
    } else {
      // Synthesized open hi-hat (longer, more sustain)
      const bufferSize = ctx.sampleRate * 0.3;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;
      const hiFilter = ctx.createBiquadFilter();
      hiFilter.type = 'highpass';
      hiFilter.frequency.value = 6000;
      const loFilter = ctx.createBiquadFilter();
      loFilter.type = 'lowpass';
      loFilter.frequency.value = 15000;
      const hatGain = ctx.createGain();
      hatGain.gain.setValueAtTime(0.15 * volume, startTime);
      hatGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.25);
      noise.connect(hiFilter);
      hiFilter.connect(loFilter);
      loFilter.connect(hatGain);
      hatGain.connect(gainNode);
      noise.start(startTime);
      noise.stop(startTime + 0.3);
    }
    
  } else if (drumType === 'hihatFoot') {
    // Hi-hat foot pedal
    if (useAcousticSamples && acousticKit.hihatFoot2) {
      playSample(ctx, gainNode, acousticKit.hihatFoot2, startTime, volume * 0.6);
    } else if (useAcousticSamples && acousticKit.hihatFoot) {
      playSample(ctx, gainNode, acousticKit.hihatFoot, startTime, volume * 0.6);
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
      hatGain.gain.setValueAtTime(0.1 * volume, startTime);
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
      playSample(ctx, gainNode, acousticKit.tom1, startTime, volume * 1.0);
    } else {
      // Synthesized high tom
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(200, startTime);
      osc.frequency.exponentialRampToValueAtTime(120, startTime + 0.15);
      const tomGain = ctx.createGain();
      tomGain.gain.setValueAtTime(0.4 * volume, startTime);
      tomGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.25);
      osc.connect(tomGain);
      tomGain.connect(gainNode);
      osc.start(startTime);
      osc.stop(startTime + 0.3);
    }
    
  } else if (drumType === 'tom2') {
    // Mid tom
    if (useAcousticSamples && acousticKit.tom2) {
      playSample(ctx, gainNode, acousticKit.tom2, startTime, volume * 1.0);
    } else {
      // Synthesized mid tom
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, startTime);
      osc.frequency.exponentialRampToValueAtTime(90, startTime + 0.18);
      const tomGain = ctx.createGain();
      tomGain.gain.setValueAtTime(0.4 * volume, startTime);
      tomGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.3);
      osc.connect(tomGain);
      tomGain.connect(gainNode);
      osc.start(startTime);
      osc.stop(startTime + 0.35);
    }
    
  } else if (drumType === 'floorTom') {
    // Floor tom
    if (useAcousticSamples && acousticKit.floorTom) {
      playSample(ctx, gainNode, acousticKit.floorTom, startTime, volume * 1.0);
    } else {
      // Synthesized floor tom
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(100, startTime);
      osc.frequency.exponentialRampToValueAtTime(60, startTime + 0.2);
      const tomGain = ctx.createGain();
      tomGain.gain.setValueAtTime(0.45 * volume, startTime);
      tomGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.35);
      osc.connect(tomGain);
      tomGain.connect(gainNode);
      osc.start(startTime);
      osc.stop(startTime + 0.4);
    }
    
  } else if (drumType === 'ride') {
    // Ride cymbal
    if (useAcousticSamples && acousticKit.ride) {
      playSample(ctx, gainNode, acousticKit.ride, startTime, volume * 0.75);
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
      rideGain.gain.setValueAtTime(0.1 * volume, startTime);
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
      playSample(ctx, gainNode, acousticKit.crash, startTime, volume * 0.9);
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
 * Uses a separate gain node connected directly to destination for priority over instruments
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
  osc.frequency.value = isDownbeat ? 1200 : 900;

  osc.connect(gainNode);
  // Bypass master gain so the click is always audible regardless of instrument volumes
  gainNode.connect(ctx.destination);

  const peakVolume = isDownbeat ? 0.7 : 0.5;
  gainNode.gain.setValueAtTime(0, startTime);
  gainNode.gain.linearRampToValueAtTime(peakVolume, startTime + 0.005);
  gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + 0.1);

  osc.start(startTime);
  osc.stop(startTime + 0.12);
}

/**
 * Applies arpeggio ordering to notes based on type
 */
function applyArpeggioOrder(midiNotes: number[], type: ArpeggioType): number[] {
  const sorted = [...midiNotes].sort((a, b) => a - b); // Low to high
  
  switch (type) {
    case 'up':
      return sorted;
    case 'down':
      return sorted.reverse();
    case 'updown':
      // Up then down, without repeating the top note
      if (sorted.length <= 2) return sorted;
      const down = sorted.slice(0, -1).reverse();
      return [...sorted, ...down];
    case 'random':
      // Fisher-Yates shuffle
      const shuffled = [...sorted];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
    default:
      return sorted;
  }
}

/**
 * Gets the number of notes to play per slot based on arpeggio speed
 */
function getArpeggioNotesPerSlot(speed: ArpeggioSpeed): number {
  switch (speed) {
    case 'slow': return 2;
    case 'normal': return 4;
    case 'fast': return 8;
    case 'veryfast': return 16;
    default: return 4;
  }
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
  // Dynamic getters for real-time parameter changes without restart
  getMetronome?: () => boolean;
  getInstruments?: () => InstrumentState[];
  getTransposition?: () => number;
  getBpm?: () => number;
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
    instruments: initialInstruments, 
    style, 
    transposition: initialTransposition = 0, 
    onBeat, 
    onChordChange, 
    onLoopEnd,
    onStep,
    onStepChange,
    getStyle,
    forceFill = false,
    getMetronome,
    getInstruments,
    getTransposition,
    getBpm: getBpmGetter,
  } = options;

  const ctx = getAudioContext();
  const startTime = ctx.currentTime + 0.1;
  const beatDuration = 60 / bpm;
  const barDuration = beatDuration * 4; // 4 beats per bar
  const slotDuration = beatDuration / 4; // 16th note duration — used only for totalDuration estimate
  const getCurrentBpm = () => getBpmGetter ? getBpmGetter() : bpm;
  
  const timeouts: number[] = [];
  let cancelled = false;
  let nextBarTimeout: number | null = null;
  
  // Get sound types for each instrument (initial values, will be read dynamically in scheduleSegment)
  const getInstrumentStates = () => getInstruments ? getInstruments() : initialInstruments;
  const getCurrentTransposition = () => getTransposition ? getTransposition() : initialTransposition;
  const isMetronomeEnabled = () => getMetronome ? getMetronome() : metronome;
  
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
  let globalSlotIndex = 0; // Continuous slot counter for rhythm pattern (0-15, wrapping)
  let lastChordIndex = -1;
  
  // Calculate total slots
  const totalSlots = chordSegments.reduce((sum, seg) => sum + seg.slotCount, 0);
  // For progressions ≥ 8 bars, use 8-bar phrase length so fills land at the end of the
  // full phrase rather than mid-phrase (e.g. 34-beat progression: bar 4 fill was wrong)
  const totalBars = Math.floor(totalSlots / 16);
  const phraseLength = totalBars >= 8 ? 8 : 4;

  // Schedule a batch of slots (one chord segment at a time for efficiency)
  const scheduleSegment = (segmentStartTime: number) => {
    if (cancelled) return;

    // Re-read BPM each segment so live changes take effect on the next chord
    const slotDuration = (60 / getCurrentBpm()) / 4;

    // Check if we've finished all segments
    if (currentSegmentIndex >= chordSegments.length) {
      if (loop) {
        onLoopEnd?.();
        currentSegmentIndex = 0;
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
    
    // Get current style and dynamic parameters
    const currentStyle = getStyle ? getStyle() : style;
    const instruments = getInstrumentStates();
    const transposition = getCurrentTransposition();
    const metronomeOn = isMetronomeEnabled();
    
    // Get sound types - prefer style's instrumentSounds, fallback to global instrument settings
    const pianoState = instruments.find(i => i.id === 'piano');
    const bassState = instruments.find(i => i.id === 'bass');
    const drumsState = instruments.find(i => i.id === 'drums');
    const guitarState = instruments.find(i => i.id === 'guitar');
    
    // Use instrument panel state as the single source of truth.
    // Style sounds are applied to instrument state when the style changes (useStyleInstruments hook).
    const pianoSoundId = pianoState?.soundTypeId ?? 'sampled';
    const bassSoundId = bassState?.soundTypeId ?? 'fender';
    const drumsSoundId = drumsState?.soundTypeId ?? 'standard';
    const guitarSoundId = guitarState?.soundTypeId ?? 'electric';
    
    const pianoSound = getSoundType('piano', pianoSoundId);
    const bassSound = getSoundType('bass', bassSoundId);
    const drumsSound = getSoundType('drums', drumsSoundId);
    const guitarSound = getSoundType('guitar', guitarSoundId);
    
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
    
    // Calculate segment duration for scheduling
    const segmentDuration = slotCount * slotDuration;
    
    // NO cache - always regenerate pattern to pick up live edits immediately
    const getPatternForBar = (barNum: number) => {
      return generateBarPattern(currentStyle, barNum, phraseLength, false, forceFill);
    };
    
    // Schedule each slot in this chord segment
    for (let i = 0; i < slotCount; i++) {
      const slotTime = segmentStartTime + (i * slotDuration);
      
      // CRITICAL: patternSlot is based on GLOBAL position, not chord position
      // The rhythm pattern runs continuously regardless of chord changes
      const currentGlobalSlot = globalSlotIndex + i;
      const patternSlot = currentGlobalSlot % 16;
      
      // Calculate bar number for fill logic based on GLOBAL slot position
      // This ensures fills happen at musically correct times (every 4 bars)
      // Bar changes every 16 slots (1 bar = 4 beats = 16 sixteenth notes)
      const barNumber = Math.floor(currentGlobalSlot / 16) + 1;
      const effectiveBarNumber = forceFill ? 4 : barNumber;
      
      // Get cached pattern for this bar
      const pattern = getPatternForBar(effectiveBarNumber);
      
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
      
      // Schedule metronome on beat boundaries (every 4 slots) - read dynamically
      if (metronomeOn && masterGain && patternSlot % 4 === 0) {
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
        // Check if this slot is an arpeggio
        const pianoArpeggio = currentStyle.arpeggios?.piano?.[patternSlot] ?? null;
        
        if (pianoArpeggio && midiNotes.length > 1) {
          // Apply arpeggio type ordering
          const orderedNotes = applyArpeggioOrder(midiNotes, pianoArpeggio.type);
          const notesPerSlot = getArpeggioNotesPerSlot(pianoArpeggio.speed);
          const arpeggioNoteDuration = slotDuration / notesPerSlot;
          
          // Repeat notes to fill the slot duration based on speed
          for (let i = 0; i < notesPerSlot; i++) {
            const noteIndex = i % orderedNotes.length;
            const midiNote = orderedNotes[noteIndex];
            const frequency = midiToFrequency(midiNote);
            const noteTime = slotTime + (i * arpeggioNoteDuration);
            playPianoNote(
              ctx, masterGain!, frequency, noteTime, 
              arpeggioNoteDuration * 1.5, pianoSound, 
              pianoState.volume * currentStyle.volumes.piano * pianoVelocity,
              midiNote
            );
          }
        } else {
          // Play all notes together as chord
          midiNotes.forEach(midiNote => {
            const frequency = midiToFrequency(midiNote);
            playPianoNote(
              ctx, masterGain!, frequency, slotTime, 
              slotDuration * 3, pianoSound, 
              pianoState.volume * currentStyle.volumes.piano * pianoVelocity,
              midiNote
            );
          });
        }
      }
      
      // Bass - uses velocity from pattern
      const bassVelocity = pattern.bass[patternSlot];
      if (bassState && isInstrumentAudible(bassState, instruments) && bassSound && bassVelocity > 0) {
        const bassNote = midiNotes[0];
        const noteDuration = currentStyle.bassSustain ? beatDuration * 2 : slotDuration * 2;
        const bassVol = bassState.volume * currentStyle.volumes.bass * bassVelocity;
        if (bassSound.useSamples && bassSound.samplePath) {
          const adjustedMidi = bassNote + bassSound.octaveOffset * 12;
          scheduleSampledNoteByDir(ctx, masterGain!, bassSound.samplePath, adjustedMidi, slotTime, noteDuration, bassVol);
        } else {
          const frequency = midiToFrequency(bassNote);
          playBassNote(ctx, masterGain!, frequency, slotTime, noteDuration, bassSound, bassVol);
        }
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
        if (pattern.hihatOpen[patternSlot] > 0) {
          playDrumHit(ctx, masterGain!, slotTime, drumsSound, baseVolume * pattern.hihatOpen[patternSlot] * 0.8, 'hihatOpen');
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
      
      // Guitar - uses its own pattern (no fallback to piano)
      const guitarVelocity = (pattern as any).guitar?.[patternSlot] ?? 0;
      if (guitarState && isInstrumentAudible(guitarState, instruments) && guitarSound && guitarVelocity > 0) {
        // Check if this slot is an arpeggio
        const guitarArpeggio = currentStyle.arpeggios?.guitar?.[patternSlot] ?? null;
        
        if (guitarArpeggio && midiNotes.length > 1) {
          // Apply arpeggio type ordering
          const orderedNotes = applyArpeggioOrder(midiNotes, guitarArpeggio.type);
          const notesPerSlot = getArpeggioNotesPerSlot(guitarArpeggio.speed);
          const arpeggioNoteDuration = slotDuration / notesPerSlot;
          
          // Repeat notes to fill the slot duration based on speed
          for (let i = 0; i < notesPerSlot; i++) {
            const noteIndex = i % orderedNotes.length;
            const midiNote = orderedNotes[noteIndex];
            const frequency = midiToFrequency(midiNote);
            const noteTime = slotTime + (i * arpeggioNoteDuration);
            playGuitarNote(
              ctx, masterGain!, frequency, noteTime,
              arpeggioNoteDuration * 1.5, guitarSound,
              guitarState.volume * (currentStyle.volumes.guitar ?? currentStyle.volumes.piano) * guitarVelocity,
              midiNote
            );
          }
        } else {
          // Play all notes together as chord
          midiNotes.forEach(midiNote => {
            const frequency = midiToFrequency(midiNote);
            playGuitarNote(
              ctx, masterGain!, frequency, slotTime,
              slotDuration * 3, guitarSound,
              guitarState.volume * (currentStyle.volumes.guitar ?? currentStyle.volumes.piano) * guitarVelocity,
              midiNote
            );
          });
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
  offlineMasterGain.gain.value = 1.0;
  offlineMasterGain.connect(offlineCtx.destination);

  const beatDuration = 60 / bpm;
  let currentTime = 0;

  const pianoState = instruments.find(i => i.id === 'piano');
  const bassState = instruments.find(i => i.id === 'bass');
  const drumsState = instruments.find(i => i.id === 'drums');
  const guitarState = instruments.find(i => i.id === 'guitar');

  const pianoSound = pianoState ? getSoundType('piano', pianoState.soundTypeId) : null;
  const bassSound = bassState ? getSoundType('bass', bassState.soundTypeId) : null;
  const drumsSound = drumsState ? getSoundType('drums', drumsState.soundTypeId) : null;
  const guitarSound = guitarState ? getSoundType('guitar', guitarState.soundTypeId) : null;

  // Preload bass samples into offline context if needed
  if (bassSound?.useSamples && bassSound.samplePath) {
    await preloadSampleDir(offlineCtx, bassSound.samplePath)
  }

  const offlineBassPromises: Promise<void>[] = [];
  
  const slotDuration = beatDuration / 4;
  let globalSlotIndex = 0;

  const offlineTotalBars = Math.floor((totalBeats * 4) / 16);
  const offlinePhraseLength = offlineTotalBars >= 8 ? 8 : 4;

  // Cache for patterns by bar number
  const patternCache: Map<number, ReturnType<typeof generateBarPattern>> = new Map();

  const getPatternForBar = (barNum: number) => {
    if (!patternCache.has(barNum)) {
      patternCache.set(barNum, generateBarPattern(style, barNum, offlinePhraseLength, false));
    }
    return patternCache.get(barNum)!;
  };
  
  sections.forEach(section => {
    for (let repeat = 0; repeat < section.repeatCount; repeat++) {
      section.chords.forEach(chord => {
        const midiNotes = chordToMidiNotes(chord).map(note => note + transposition);
        const chordStartTime = currentTime;
        
        // Calculate exact slot count based on chord duration
        const slotCount = chord.duration * 4; // 4 slots per beat
        
        // Process each slot in this chord
        for (let i = 0; i < slotCount; i++) {
          const slotTime = chordStartTime + (i * slotDuration);
          
          // CRITICAL: patternSlot and barNumber are based on GLOBAL position
          // The rhythm pattern runs continuously regardless of chord changes
          const currentGlobalSlot = globalSlotIndex + i;
          const patternSlot = currentGlobalSlot % 16;
          
          // Bar changes every 16 slots (1 bar = 4 beats = 16 sixteenth notes)
          const barNumber = Math.floor(currentGlobalSlot / 16) + 1;
          
          // Get cached pattern for this bar
          const pattern = getPatternForBar(barNumber);
          
          // Piano - use samples if available for sampled sound type
          const pianoVelocity = pattern.piano[patternSlot];
          if (pianoState && !pianoState.muted && pianoSound && pianoVelocity > 0) {
            // Check for arpeggio
            const pianoArpeggio = style.arpeggios?.piano?.[patternSlot] ?? null;
            
            const playOfflinePianoNote = (midiNote: number, noteTime: number, noteDuration: number) => {
              const frequency = midiToFrequency(midiNote);
              const volume = pianoState.volume * style.volumes.piano * pianoVelocity;
              
              // Check if we should use samples
              if (pianoSound.useSamples && pianoSamples[midiNote]) {
                // Use sampled piano
                const sample = pianoSamples[midiNote]!;
                const source = offlineCtx.createBufferSource();
                const gainNode = offlineCtx.createGain();
                
                source.buffer = sample;
                source.connect(gainNode);
                gainNode.connect(offlineMasterGain);
                
                // Envelope with gradual release
                gainNode.gain.setValueAtTime(volume * 0.8, noteTime);
                const releaseStart = noteTime + Math.max(0, noteDuration - 0.1);
                gainNode.gain.setValueAtTime(volume * 0.8, releaseStart);
                gainNode.gain.linearRampToValueAtTime(0, noteTime + noteDuration + 0.3);
                
                source.start(noteTime);
                source.stop(noteTime + Math.max(noteDuration + 0.4, sample.duration));
              } else {
                // Use synthesized piano
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
                  osc.start(noteTime);
                  osc.stop(noteTime + noteDuration);
                });
                
                pianoGain.gain.setValueAtTime(0, noteTime);
                pianoGain.gain.linearRampToValueAtTime(1, noteTime + pianoSound.attackTime);
                pianoGain.gain.linearRampToValueAtTime(pianoSound.sustainLevel, noteTime + pianoSound.attackTime + pianoSound.decayTime);
                pianoGain.gain.linearRampToValueAtTime(0, noteTime + noteDuration);
              }
            };
            
            if (pianoArpeggio && midiNotes.length > 1) {
              // Apply arpeggio ordering and speed
              const orderedNotes = applyArpeggioOrder(midiNotes, pianoArpeggio.type);
              const notesPerSlot = getArpeggioNotesPerSlot(pianoArpeggio.speed);
              const arpeggioNoteDuration = slotDuration / notesPerSlot;
              
              for (let j = 0; j < notesPerSlot; j++) {
                const noteIndex = j % orderedNotes.length;
                const noteTime = slotTime + (j * arpeggioNoteDuration);
                playOfflinePianoNote(orderedNotes[noteIndex], noteTime, arpeggioNoteDuration * 1.5);
              }
            } else {
              // Play all notes together as chord
              midiNotes.forEach(midiNote => {
                playOfflinePianoNote(midiNote, slotTime, slotDuration * 3);
              });
            }
          }
          
          // Bass
          const bassVelocity = pattern.bass[patternSlot];
          if (bassState && !bassState.muted && bassSound && bassVelocity > 0) {
            const bassNote = midiNotes[0];
            const volume = bassState.volume * style.volumes.bass * bassVelocity;
            const noteDuration = style.bassSustain ? beatDuration * 2 : slotDuration * 2;

            if (bassSound.useSamples && bassSound.samplePath) {
              const adjustedMidi = bassNote + bassSound.octaveOffset * 12;
              offlineBassPromises.push(
                scheduleSampledNoteByDirAsync(offlineCtx, offlineMasterGain, bassSound.samplePath, adjustedMidi, slotTime, noteDuration, volume)
              );
            } else {
              const frequency = midiToFrequency(bassNote);
              const baseFreq = frequency * Math.pow(2, bassSound.octaveOffset);
              const noteDurationLocal = noteDuration;

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
              bassGain.gain.linearRampToValueAtTime(0, slotTime + noteDurationLocal);

              mainOsc.start(slotTime);
              subOsc.start(slotTime);
              mainOsc.stop(slotTime + noteDurationLocal + 0.1);
              subOsc.stop(slotTime + noteDurationLocal + 0.1);
            }
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
          
          // Guitar - use its own pattern (no fallback to piano)
          const guitarVelocity = (pattern as any).guitar?.[patternSlot] ?? 0;
          if (guitarState && !guitarState.muted && guitarSound && guitarVelocity > 0) {
            const guitarVolume = guitarState.volume * (style.volumes.guitar ?? style.volumes.piano) * guitarVelocity;
            
            midiNotes.forEach(midiNote => {
              const samplePath = guitarSound.samplePath;
              
              if (guitarSound.useSamples && samplePath && guitarSamples[samplePath]) {
                // Find closest sample
                const match = findClosestGuitarSample(samplePath, midiNote);
                
                if (match && guitarSamples[samplePath][match.noteKey]) {
                  const sample = guitarSamples[samplePath][match.noteKey]!;
                  const source = offlineCtx.createBufferSource();
                  const gainNode = offlineCtx.createGain();
                  
                  source.buffer = sample;
                  
                  // Adjust playback rate for pitch shifting
                  if (match.pitchAdjust !== 0) {
                    source.playbackRate.value = Math.pow(2, match.pitchAdjust / 12);
                  }
                  
                  source.connect(gainNode);
                  gainNode.connect(offlineMasterGain);
                  
                  // Natural guitar envelope
                  const noteDuration = slotDuration * 3;
                  gainNode.gain.setValueAtTime(guitarVolume * 0.8, slotTime);
                  
                  const releaseStart = slotTime + Math.max(0, noteDuration - 0.15);
                  gainNode.gain.setValueAtTime(guitarVolume * 0.8, releaseStart);
                  gainNode.gain.linearRampToValueAtTime(0, slotTime + noteDuration + 0.2);
                  
                  source.start(slotTime);
                  source.stop(slotTime + Math.max(noteDuration + 0.3, sample.duration / (source.playbackRate.value || 1)));
                }
              } else {
                // Use synthesized guitar
                const frequency = midiToFrequency(midiNote);
                const baseFreq = frequency;
                
                const gainNode = offlineCtx.createGain();
                gainNode.connect(offlineMasterGain);
                
                const harmonics = [
                  { freq: 1, amp: 1.0 },
                  { freq: 2, amp: 0.5 },
                  { freq: 3, amp: 0.3 },
                ];
                
                harmonics.forEach(({ freq, amp }) => {
                  const osc = offlineCtx.createOscillator();
                  const oscGain = offlineCtx.createGain();
                  
                  osc.type = freq === 1 ? 'triangle' : 'sine';
                  osc.frequency.value = baseFreq * freq;
                  oscGain.gain.value = amp * 0.12 * guitarVolume;
                  
                  osc.connect(oscGain);
                  oscGain.connect(gainNode);
                  
                  const noteDuration = slotDuration * 3;
                  osc.start(slotTime);
                  osc.stop(slotTime + noteDuration + 0.1);
                });
                
                const noteDuration = slotDuration * 3;
                gainNode.gain.setValueAtTime(0, slotTime);
                gainNode.gain.linearRampToValueAtTime(1, slotTime + 0.01);
                gainNode.gain.linearRampToValueAtTime(0.6, slotTime + 0.1);
                gainNode.gain.setValueAtTime(0.6, slotTime + noteDuration - 0.1);
                gainNode.gain.linearRampToValueAtTime(0, slotTime + noteDuration);
              }
            });
          }
        }
        
        // Update counters
        globalSlotIndex += slotCount;
        currentTime += chord.duration * beatDuration;
      });
    }
  });
  
  await Promise.all(offlineBassPromises);
  return await offlineCtx.startRendering();
}

/**
 * Stops all audio playback
 */
export function stopPlayback(): void {
  // Release mutex first
  releasePlaybackMutex();

  // Closing the context is the most reliable way to prevent previously-scheduled
  // WebAudio events from "coming back" and overlapping on the next Play.
  if (audioContext) {
    try {
      audioContext.close().catch(() => {});
    } catch (e) {
      // Ignore close errors
    }
    audioContext = null;
    masterGain = null;
  }

  currentlyPlaying = false;

  // Clear Media Session
  if ('mediaSession' in navigator) {
    navigator.mediaSession.playbackState = 'none';
  }

  // Notify the UI that playback has stopped
  if (playbackStoppedCallback) {
    playbackStoppedCallback();
  }
}
