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
 * Plays a drum hit with noise-based synthesis for realism
 */
function playDrumHit(
  ctx: AudioContext,
  destination: AudioNode,
  startTime: number,
  soundType: SoundType,
  volume: number,
  drumType: 'kick' | 'snare' | 'hihat'
): void {
  const gainNode = ctx.createGain();
  gainNode.connect(destination);
  
  if (drumType === 'kick') {
    // Kick drum: pitched oscillator with fast pitch envelope
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
    
    // Add click transient
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
    
  } else if (drumType === 'snare') {
    // Snare: noise + pitched component
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
    
    // Body tone
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
    
  } else {
    // Hi-hat: filtered noise
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
}

/**
 * Schedules playback with instruments, styles, and sections
 */
export function scheduleProgression(
  sections: Section[],
  bpm: number,
  options: PlaybackOptions
): { duration: number; cancel: () => void } {
  const { loop = false, metronome = true, instruments, style, transposition = 0, onBeat, onChordChange, onLoopEnd } = options;
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
          // Apply transposition to MIDI notes
          const midiNotes = chordToMidiNotes(chord).map(note => note + transposition);
          
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
                playPianoNote(
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
              playBassNote(
                ctx, masterGain!, frequency, beatTime,
                beatDuration * 0.8, bassSound,
                bassState.volume * style.volumes.bass
              );
            }
            
            // Drums - plays on separate patterns for kick, snare, hihat
            if (drumsState && !drumsState.muted && drumsSound) {
              const volume = drumsState.volume * style.volumes.drums;
              if (style.rhythm.kick.includes(beatInPattern)) {
                playDrumHit(ctx, masterGain!, beatTime, drumsSound, volume, 'kick');
              }
              if (style.rhythm.snare.includes(beatInPattern)) {
                playDrumHit(ctx, masterGain!, beatTime, drumsSound, volume, 'snare');
              }
              if (style.rhythm.hihat.includes(beatInPattern)) {
                playDrumHit(ctx, masterGain!, beatTime, drumsSound, volume * 0.6, 'hihat');
              }
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
  transposition: number = 0,
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
        // Apply transposition to MIDI notes
        const midiNotes = chordToMidiNotes(chord).map(note => note + transposition);
        
        for (let beat = 0; beat < chord.duration; beat++) {
          const beatTime = currentTime + (beat * beatDuration);
          const beatInPattern = beat % 4;
          
          // Piano with harmonics
          if (pianoState && !pianoState.muted && pianoSound && style.rhythm.piano.includes(beatInPattern)) {
            midiNotes.forEach(midiNote => {
              const frequency = midiToFrequency(midiNote);
              const volume = pianoState.volume * style.volumes.piano;
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
                osc.start(beatTime);
                osc.stop(beatTime + beatDuration);
              });
              
              pianoGain.gain.setValueAtTime(0, beatTime);
              pianoGain.gain.linearRampToValueAtTime(1, beatTime + pianoSound.attackTime);
              pianoGain.gain.linearRampToValueAtTime(pianoSound.sustainLevel, beatTime + pianoSound.attackTime + pianoSound.decayTime);
              pianoGain.gain.linearRampToValueAtTime(0, beatTime + beatDuration * 0.9);
            });
          }
          
          // Bass with sub
          if (bassState && !bassState.muted && bassSound && style.rhythm.bass.includes(beatInPattern)) {
            const bassNote = midiNotes[0];
            const frequency = midiToFrequency(bassNote);
            const volume = bassState.volume * style.volumes.bass;
            const baseFreq = frequency * Math.pow(2, bassSound.octaveOffset);
            
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
            
            bassGain.gain.setValueAtTime(0, beatTime);
            bassGain.gain.linearRampToValueAtTime(1, beatTime + bassSound.attackTime);
            bassGain.gain.linearRampToValueAtTime(bassSound.sustainLevel, beatTime + bassSound.attackTime + bassSound.decayTime);
            bassGain.gain.linearRampToValueAtTime(0, beatTime + beatDuration * 0.8);
            
            mainOsc.start(beatTime);
            subOsc.start(beatTime);
            mainOsc.stop(beatTime + beatDuration);
            subOsc.stop(beatTime + beatDuration);
          }
          
          // Drums - separate kick, snare, hihat
          if (drumsState && !drumsState.muted && drumsSound) {
            const volume = drumsState.volume * style.volumes.drums;
            
            // Kick
            if (style.rhythm.kick.includes(beatInPattern)) {
              const osc = offlineCtx.createOscillator();
              osc.type = 'sine';
              osc.frequency.setValueAtTime(150, beatTime);
              osc.frequency.exponentialRampToValueAtTime(40, beatTime + 0.1);
              const gain = offlineCtx.createGain();
              gain.gain.setValueAtTime(0.4 * volume, beatTime);
              gain.gain.exponentialRampToValueAtTime(0.001, beatTime + 0.3);
              osc.connect(gain);
              gain.connect(offlineMasterGain);
              osc.start(beatTime);
              osc.stop(beatTime + 0.35);
            }
            
            // Snare
            if (style.rhythm.snare.includes(beatInPattern)) {
              const osc = offlineCtx.createOscillator();
              osc.type = 'triangle';
              osc.frequency.value = 180;
              const gain = offlineCtx.createGain();
              gain.gain.setValueAtTime(0.2 * volume, beatTime);
              gain.gain.exponentialRampToValueAtTime(0.001, beatTime + 0.12);
              osc.connect(gain);
              gain.connect(offlineMasterGain);
              osc.start(beatTime);
              osc.stop(beatTime + 0.15);
            }
            
            // Hi-hat
            if (style.rhythm.hihat.includes(beatInPattern)) {
              const osc = offlineCtx.createOscillator();
              osc.type = 'square';
              osc.frequency.value = 8000;
              const filter = offlineCtx.createBiquadFilter();
              filter.type = 'highpass';
              filter.frequency.value = 7000;
              const gain = offlineCtx.createGain();
              gain.gain.setValueAtTime(0.04 * volume, beatTime);
              gain.gain.exponentialRampToValueAtTime(0.001, beatTime + 0.05);
              osc.connect(filter);
              filter.connect(gain);
              gain.connect(offlineMasterGain);
              osc.start(beatTime);
              osc.stop(beatTime + 0.06);
            }
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
