/**
 * Audio Engine
 * 
 * This module handles all audio synthesis and playback using the Web Audio API.
 * It creates a simple but pleasant piano-like synthesizer sound using
 * multiple oscillators with envelope shaping.
 */

import { Chord, chordToMidiNotes, midiToFrequency } from './musicTheory';

// ADSR envelope parameters for natural sound
const ATTACK = 0.02;   // Quick attack for percussive feel
const DECAY = 0.1;     // Short decay
const SUSTAIN = 0.7;   // Sustain level (0-1)
const RELEASE = 0.3;   // Release time

let audioContext: AudioContext | null = null;
let masterGain: GainNode | null = null;

/**
 * Initializes or returns the existing AudioContext
 * Must be called after user interaction (browser autoplay policy)
 */
export function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
    masterGain = audioContext.createGain();
    masterGain.gain.value = 0.3; // Master volume
    masterGain.connect(audioContext.destination);
  }
  
  // Resume if suspended (happens on page load in some browsers)
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
  
  return audioContext;
}

/**
 * Creates and plays a single note with ADSR envelope
 * Uses a combination of triangle and sine waves for a warmer sound
 */
function playNote(
  ctx: AudioContext,
  destination: AudioNode,
  frequency: number,
  startTime: number,
  duration: number
): void {
  // Create oscillators for richer sound
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const gainNode = ctx.createGain();
  
  // Triangle wave for fundamental
  osc1.type = 'triangle';
  osc1.frequency.value = frequency;
  
  // Sine wave one octave lower for warmth
  osc2.type = 'sine';
  osc2.frequency.value = frequency / 2;
  
  // Mix oscillators
  const osc1Gain = ctx.createGain();
  const osc2Gain = ctx.createGain();
  osc1Gain.gain.value = 0.6;
  osc2Gain.gain.value = 0.4;
  
  osc1.connect(osc1Gain);
  osc2.connect(osc2Gain);
  osc1Gain.connect(gainNode);
  osc2Gain.connect(gainNode);
  gainNode.connect(destination);
  
  // ADSR envelope
  const now = startTime;
  const noteEnd = now + duration;
  
  gainNode.gain.setValueAtTime(0, now);
  gainNode.gain.linearRampToValueAtTime(0.3, now + ATTACK);
  gainNode.gain.linearRampToValueAtTime(0.3 * SUSTAIN, now + ATTACK + DECAY);
  gainNode.gain.setValueAtTime(0.3 * SUSTAIN, noteEnd - RELEASE);
  gainNode.gain.linearRampToValueAtTime(0, noteEnd);
  
  // Start and stop oscillators
  osc1.start(now);
  osc2.start(now);
  osc1.stop(noteEnd + 0.1);
  osc2.stop(noteEnd + 0.1);
}

/**
 * Plays a chord at a specific time
 * @param chord - The chord to play
 * @param startTime - AudioContext time to start playing
 * @param bpm - Beats per minute for duration calculation
 */
export function playChord(
  chord: Chord,
  startTime: number,
  bpm: number
): void {
  const ctx = getAudioContext();
  const midiNotes = chordToMidiNotes(chord);
  const durationInSeconds = (chord.duration * 60) / bpm;
  
  // Play each note in the chord
  midiNotes.forEach(midiNote => {
    const frequency = midiToFrequency(midiNote);
    playNote(ctx, masterGain!, frequency, startTime, durationInSeconds);
  });
}

/**
 * Schedules playback of an entire chord progression
 * Returns the total duration and a cancel function
 */
export function scheduleProgression(
  chords: Chord[],
  bpm: number,
  onChordChange: (index: number) => void
): { duration: number; cancel: () => void } {
  const ctx = getAudioContext();
  const startTime = ctx.currentTime + 0.1; // Small delay for stability
  
  let currentTime = startTime;
  const timeouts: number[] = [];
  
  chords.forEach((chord, index) => {
    const chordStartTime = currentTime;
    const durationInSeconds = (chord.duration * 60) / bpm;
    
    // Schedule the chord audio
    playChord(chord, chordStartTime, bpm);
    
    // Schedule UI update callback
    const delayMs = (chordStartTime - ctx.currentTime) * 1000;
    const timeout = window.setTimeout(() => {
      onChordChange(index);
    }, delayMs);
    timeouts.push(timeout);
    
    currentTime += durationInSeconds;
  });
  
  const totalDuration = currentTime - startTime;
  
  return {
    duration: totalDuration,
    cancel: () => {
      timeouts.forEach(t => clearTimeout(t));
    }
  };
}

/**
 * Renders a chord progression to an audio buffer using OfflineAudioContext
 * This is used for MP3 export
 */
export async function renderProgressionOffline(
  chords: Chord[],
  bpm: number,
  sampleRate: number = 44100
): Promise<AudioBuffer> {
  // Calculate total duration
  const totalBeats = chords.reduce((sum, chord) => sum + chord.duration, 0);
  const totalDuration = (totalBeats * 60) / bpm;
  const totalSamples = Math.ceil(totalDuration * sampleRate) + sampleRate; // Extra second for release
  
  // Create offline context
  const offlineCtx = new OfflineAudioContext(2, totalSamples, sampleRate);
  const masterGain = offlineCtx.createGain();
  masterGain.gain.value = 0.3;
  masterGain.connect(offlineCtx.destination);
  
  let currentTime = 0;
  
  // Schedule all chords
  chords.forEach(chord => {
    const midiNotes = chordToMidiNotes(chord);
    const durationInSeconds = (chord.duration * 60) / bpm;
    
    midiNotes.forEach(midiNote => {
      const frequency = midiToFrequency(midiNote);
      
      // Create oscillators
      const osc1 = offlineCtx.createOscillator();
      const osc2 = offlineCtx.createOscillator();
      const gainNode = offlineCtx.createGain();
      
      osc1.type = 'triangle';
      osc1.frequency.value = frequency;
      
      osc2.type = 'sine';
      osc2.frequency.value = frequency / 2;
      
      const osc1Gain = offlineCtx.createGain();
      const osc2Gain = offlineCtx.createGain();
      osc1Gain.gain.value = 0.6;
      osc2Gain.gain.value = 0.4;
      
      osc1.connect(osc1Gain);
      osc2.connect(osc2Gain);
      osc1Gain.connect(gainNode);
      osc2Gain.connect(gainNode);
      gainNode.connect(masterGain);
      
      // ADSR envelope
      const noteEnd = currentTime + durationInSeconds;
      
      gainNode.gain.setValueAtTime(0, currentTime);
      gainNode.gain.linearRampToValueAtTime(0.3, currentTime + ATTACK);
      gainNode.gain.linearRampToValueAtTime(0.3 * SUSTAIN, currentTime + ATTACK + DECAY);
      gainNode.gain.setValueAtTime(0.3 * SUSTAIN, noteEnd - RELEASE);
      gainNode.gain.linearRampToValueAtTime(0, noteEnd);
      
      osc1.start(currentTime);
      osc2.start(currentTime);
      osc1.stop(noteEnd + 0.1);
      osc2.stop(noteEnd + 0.1);
    });
    
    currentTime += durationInSeconds;
  });
  
  // Render the audio
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
}
