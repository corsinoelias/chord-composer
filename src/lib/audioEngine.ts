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
 * Plays a click/tick sound for the metronome
 * Uses a short high-frequency ping
 */
function playClick(
  ctx: AudioContext,
  destination: AudioNode,
  startTime: number,
  isDownbeat: boolean = false
): void {
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();
  
  // Higher pitch for downbeat, lower for other beats
  osc.type = 'sine';
  osc.frequency.value = isDownbeat ? 1000 : 800;
  
  osc.connect(gainNode);
  gainNode.connect(destination);
  
  // Very short envelope for a click sound
  gainNode.gain.setValueAtTime(0, startTime);
  gainNode.gain.linearRampToValueAtTime(0.15, startTime + 0.005);
  gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + 0.05);
  
  osc.start(startTime);
  osc.stop(startTime + 0.06);
}

/**
 * Schedules playback of an entire chord progression with optional looping
 * Returns the total duration and a cancel function
 */
export function scheduleProgression(
  chords: Chord[],
  bpm: number,
  onChordChange: (index: number) => void,
  options: {
    loop?: boolean;
    metronome?: boolean;
    onBeat?: (beat: number) => void;
    onLoopEnd?: () => void;
  } = {}
): { duration: number; cancel: () => void } {
  const { loop = false, metronome = true, onBeat, onLoopEnd } = options;
  const ctx = getAudioContext();
  const startTime = ctx.currentTime + 0.1;
  const beatDuration = 60 / bpm;
  
  let currentTime = startTime;
  const timeouts: number[] = [];
  let totalBeats = 0;
  let cancelled = false;
  let nextLoopTimeout: number | null = null;
  
  const scheduleLoop = (loopStartTime: number) => {
    if (cancelled) return;
    
    currentTime = loopStartTime;
    totalBeats = 0;
    
    chords.forEach((chord, index) => {
      const chordStartTime = currentTime;
      const durationInSeconds = (chord.duration * 60) / bpm;
      
      // Schedule the chord audio
      playChord(chord, chordStartTime, bpm);
      
      // Schedule click sounds for each beat if metronome is enabled
      if (metronome) {
        for (let beat = 0; beat < chord.duration; beat++) {
          const beatTime = chordStartTime + (beat * beatDuration);
          const isDownbeat = beat === 0;
          playClick(ctx, masterGain!, beatTime, isDownbeat);
          
          if (onBeat) {
            const beatDelayMs = (beatTime - ctx.currentTime) * 1000;
            const beatTimeout = window.setTimeout(() => {
              if (!cancelled) onBeat(totalBeats + beat);
            }, beatDelayMs);
            timeouts.push(beatTimeout);
          }
        }
      }
      
      totalBeats += chord.duration;
      
      // Schedule UI update callback for chord change
      const delayMs = (chordStartTime - ctx.currentTime) * 1000;
      const timeout = window.setTimeout(() => {
        if (!cancelled) onChordChange(index);
      }, delayMs);
      timeouts.push(timeout);
      
      currentTime += durationInSeconds;
    });
    
    const loopDuration = currentTime - loopStartTime;
    
    // If looping, schedule the next iteration
    if (loop && !cancelled) {
      const loopDelayMs = (currentTime - ctx.currentTime) * 1000;
      nextLoopTimeout = window.setTimeout(() => {
        if (!cancelled) {
          onLoopEnd?.();
          scheduleLoop(ctx.currentTime + 0.05);
        }
      }, loopDelayMs);
    }
    
    return loopDuration;
  };
  
  const totalDuration = scheduleLoop(startTime) || 0;
  
  return {
    duration: totalDuration,
    cancel: () => {
      cancelled = true;
      timeouts.forEach(t => clearTimeout(t));
      if (nextLoopTimeout) clearTimeout(nextLoopTimeout);
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
