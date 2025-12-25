/**
 * Audio Engine
 * 
 * This module handles all audio synthesis and playback using the Web Audio API.
 * Supports multiple instruments, style rhythms, and section repeats.
 */

import { Chord, chordToMidiNotes, midiToFrequency } from './musicTheory';
import { InstrumentState, getSoundType, SoundType } from './instruments';
import { StylePattern } from './styles';
import { Section } from './sections';

let audioContext: AudioContext | null = null;
let masterGain: GainNode | null = null;

/**
 * Initializes or returns the existing AudioContext
 */
export function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
    masterGain = audioContext.createGain();
    masterGain.gain.value = 0.5;
    masterGain.connect(audioContext.destination);
  }
  
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
  
  return audioContext;
}

/**
 * Creates and plays instrument notes with ADSR envelope
 */
function playInstrumentNote(
  ctx: AudioContext,
  destination: AudioNode,
  frequency: number,
  startTime: number,
  duration: number,
  soundType: SoundType,
  volume: number
): void {
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const gainNode = ctx.createGain();
  
  osc1.type = soundType.oscillatorType;
  osc1.frequency.value = frequency * Math.pow(2, soundType.octaveOffset);
  
  // Second oscillator for warmth
  osc2.type = 'sine';
  osc2.frequency.value = (frequency * Math.pow(2, soundType.octaveOffset)) / 2;
  
  const osc1Gain = ctx.createGain();
  const osc2Gain = ctx.createGain();
  osc1Gain.gain.value = 0.7;
  osc2Gain.gain.value = 0.3;
  
  osc1.connect(osc1Gain);
  osc2.connect(osc2Gain);
  osc1Gain.connect(gainNode);
  osc2Gain.connect(gainNode);
  gainNode.connect(destination);
  
  // ADSR envelope
  const { attackTime, decayTime, sustainLevel, releaseTime } = soundType;
  const noteEnd = startTime + duration;
  const maxGain = 0.3 * volume;
  
  gainNode.gain.setValueAtTime(0, startTime);
  gainNode.gain.linearRampToValueAtTime(maxGain, startTime + attackTime);
  gainNode.gain.linearRampToValueAtTime(maxGain * sustainLevel, startTime + attackTime + decayTime);
  gainNode.gain.setValueAtTime(maxGain * sustainLevel, Math.max(startTime, noteEnd - releaseTime));
  gainNode.gain.linearRampToValueAtTime(0, noteEnd);
  
  osc1.start(startTime);
  osc2.start(startTime);
  osc1.stop(noteEnd + 0.1);
  osc2.stop(noteEnd + 0.1);
}

/**
 * Plays a drum hit
 */
function playDrumHit(
  ctx: AudioContext,
  destination: AudioNode,
  startTime: number,
  soundType: SoundType,
  volume: number,
  isKick: boolean
): void {
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();
  
  osc.type = soundType.oscillatorType;
  osc.frequency.value = isKick ? 60 : 200;
  
  // Pitch envelope for drums
  osc.frequency.setValueAtTime(isKick ? 150 : 400, startTime);
  osc.frequency.exponentialRampToValueAtTime(isKick ? 60 : 200, startTime + 0.05);
  
  osc.connect(gainNode);
  gainNode.connect(destination);
  
  const maxGain = 0.25 * volume;
  gainNode.gain.setValueAtTime(0, startTime);
  gainNode.gain.linearRampToValueAtTime(maxGain, startTime + 0.005);
  gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + 0.15);
  
  osc.start(startTime);
  osc.stop(startTime + 0.2);
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
  onBeat?: (beat: number) => void;
  onChordChange?: (index: number) => void;
  onLoopEnd?: () => void;
}

/**
 * Schedules playback with instruments, styles, and sections
 */
export function scheduleProgression(
  sections: Section[],
  bpm: number,
  options: PlaybackOptions
): { duration: number; cancel: () => void } {
  const { loop = false, metronome = true, instruments, style, onBeat, onChordChange, onLoopEnd } = options;
  const ctx = getAudioContext();
  const startTime = ctx.currentTime + 0.1;
  const beatDuration = 60 / bpm;
  
  const timeouts: number[] = [];
  let cancelled = false;
  let nextLoopTimeout: number | null = null;
  
  // Get sound types for each instrument
  const pianoState = instruments.find(i => i.id === 'piano');
  const bassState = instruments.find(i => i.id === 'bass');
  const drumsState = instruments.find(i => i.id === 'drums');
  
  const pianoSound = pianoState ? getSoundType('piano', pianoState.soundTypeId) : null;
  const bassSound = bassState ? getSoundType('bass', bassState.soundTypeId) : null;
  const drumsSound = drumsState ? getSoundType('drums', drumsState.soundTypeId) : null;
  
  const scheduleLoop = (loopStartTime: number) => {
    if (cancelled) return 0;
    
    let currentTime = loopStartTime;
    let globalChordIndex = 0;
    
    // Process each section with its repeats
    sections.forEach(section => {
      for (let repeat = 0; repeat < section.repeatCount; repeat++) {
        section.chords.forEach((chord) => {
          const chordStartTime = currentTime;
          const durationInSeconds = chord.duration * beatDuration;
          const midiNotes = chordToMidiNotes(chord);
          
          // Schedule chord change callback
          if (onChordChange) {
            const delayMs = (chordStartTime - ctx.currentTime) * 1000;
            const chordIdx = globalChordIndex;
            const timeout = window.setTimeout(() => {
              if (!cancelled) onChordChange(chordIdx);
            }, Math.max(0, delayMs));
            timeouts.push(timeout);
          }
          
          // Schedule each beat within the chord
          for (let beat = 0; beat < chord.duration; beat++) {
            const beatTime = chordStartTime + (beat * beatDuration);
            const isDownbeat = beat === 0;
            const beatInPattern = beat % 4; // For style patterns
            
            // Metronome click
            if (metronome) {
              playClick(ctx, masterGain!, beatTime, isDownbeat);
            }
            
            // Piano - plays on pattern beats
            if (pianoState && !pianoState.muted && pianoSound && style.rhythm.piano.includes(beatInPattern)) {
              midiNotes.forEach(midiNote => {
                const frequency = midiToFrequency(midiNote);
                playInstrumentNote(
                  ctx, masterGain!, frequency, beatTime, 
                  beatDuration * 0.9, pianoSound, 
                  pianoState.volume * style.volumes.piano
                );
              });
            }
            
            // Bass - plays root note on pattern beats
            if (bassState && !bassState.muted && bassSound && style.rhythm.bass.includes(beatInPattern)) {
              const bassNote = midiNotes[0]; // Root note
              const frequency = midiToFrequency(bassNote);
              playInstrumentNote(
                ctx, masterGain!, frequency, beatTime,
                beatDuration * 0.8, bassSound,
                bassState.volume * style.volumes.bass
              );
            }
            
            // Drums - plays on pattern beats
            if (drumsState && !drumsState.muted && drumsSound && style.rhythm.drums.includes(beatInPattern)) {
              const isKick = beatInPattern === 0 || beatInPattern === 2;
              playDrumHit(ctx, masterGain!, beatTime, drumsSound, drumsState.volume * style.volumes.drums, isKick);
            }
            
            // Beat callback
            if (onBeat) {
              const beatDelayMs = (beatTime - ctx.currentTime) * 1000;
              const beatTimeout = window.setTimeout(() => {
                if (!cancelled) onBeat(beat);
              }, Math.max(0, beatDelayMs));
              timeouts.push(beatTimeout);
            }
          }
          
          currentTime += durationInSeconds;
          globalChordIndex++;
        });
      }
    });
    
    const loopDuration = currentTime - loopStartTime;
    
    // Schedule next loop
    if (loop && !cancelled && loopDuration > 0) {
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
  
  const totalDuration = scheduleLoop(startTime);
  
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
 * Renders a chord progression to an audio buffer (for export)
 */
export async function renderProgressionOffline(
  sections: Section[],
  bpm: number,
  instruments: InstrumentState[],
  style: StylePattern,
  sampleRate: number = 44100
): Promise<AudioBuffer> {
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
  
  sections.forEach(section => {
    for (let repeat = 0; repeat < section.repeatCount; repeat++) {
      section.chords.forEach(chord => {
        const midiNotes = chordToMidiNotes(chord);
        
        for (let beat = 0; beat < chord.duration; beat++) {
          const beatTime = currentTime + (beat * beatDuration);
          const beatInPattern = beat % 4;
          
          // Piano
          if (pianoState && !pianoState.muted && pianoSound && style.rhythm.piano.includes(beatInPattern)) {
            midiNotes.forEach(midiNote => {
              const frequency = midiToFrequency(midiNote);
              const soundType = pianoSound;
              const volume = pianoState.volume * style.volumes.piano;
              
              const osc = offlineCtx.createOscillator();
              const gain = offlineCtx.createGain();
              osc.type = soundType.oscillatorType;
              osc.frequency.value = frequency * Math.pow(2, soundType.octaveOffset);
              osc.connect(gain);
              gain.connect(offlineMasterGain);
              
              const maxGain = 0.3 * volume;
              gain.gain.setValueAtTime(0, beatTime);
              gain.gain.linearRampToValueAtTime(maxGain, beatTime + soundType.attackTime);
              gain.gain.linearRampToValueAtTime(maxGain * soundType.sustainLevel, beatTime + soundType.attackTime + soundType.decayTime);
              gain.gain.linearRampToValueAtTime(0, beatTime + beatDuration * 0.9);
              
              osc.start(beatTime);
              osc.stop(beatTime + beatDuration);
            });
          }
          
          // Bass
          if (bassState && !bassState.muted && bassSound && style.rhythm.bass.includes(beatInPattern)) {
            const bassNote = midiNotes[0];
            const frequency = midiToFrequency(bassNote);
            const soundType = bassSound;
            const volume = bassState.volume * style.volumes.bass;
            
            const osc = offlineCtx.createOscillator();
            const gain = offlineCtx.createGain();
            osc.type = soundType.oscillatorType;
            osc.frequency.value = frequency * Math.pow(2, soundType.octaveOffset);
            osc.connect(gain);
            gain.connect(offlineMasterGain);
            
            const maxGain = 0.3 * volume;
            gain.gain.setValueAtTime(0, beatTime);
            gain.gain.linearRampToValueAtTime(maxGain, beatTime + soundType.attackTime);
            gain.gain.linearRampToValueAtTime(0, beatTime + beatDuration * 0.8);
            
            osc.start(beatTime);
            osc.stop(beatTime + beatDuration);
          }
          
          // Drums
          if (drumsState && !drumsState.muted && drumsSound && style.rhythm.drums.includes(beatInPattern)) {
            const isKick = beatInPattern === 0 || beatInPattern === 2;
            const volume = drumsState.volume * style.volumes.drums;
            
            const osc = offlineCtx.createOscillator();
            const gain = offlineCtx.createGain();
            osc.type = drumsSound.oscillatorType;
            osc.frequency.setValueAtTime(isKick ? 150 : 400, beatTime);
            osc.frequency.exponentialRampToValueAtTime(isKick ? 60 : 200, beatTime + 0.05);
            osc.connect(gain);
            gain.connect(offlineMasterGain);
            
            gain.gain.setValueAtTime(0, beatTime);
            gain.gain.linearRampToValueAtTime(0.25 * volume, beatTime + 0.005);
            gain.gain.exponentialRampToValueAtTime(0.001, beatTime + 0.15);
            
            osc.start(beatTime);
            osc.stop(beatTime + 0.2);
          }
        }
        
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
}
