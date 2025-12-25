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
  
  // Duration of one 16th note
  const slotDuration = beatDuration / 4;
  
  const scheduleLoop = (loopStartTime: number) => {
    if (cancelled) return 0;
    
    let currentTime = loopStartTime;
    let globalChordIndex = 0;
    let barNumber = 0;
    
    // Process each section with its repeats
    sections.forEach(section => {
      for (let repeat = 0; repeat < section.repeatCount; repeat++) {
        section.chords.forEach((chord) => {
          const chordStartTime = currentTime;
          const durationInSeconds = chord.duration * beatDuration;
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
          
          // Schedule each beat for metronome and callbacks
          for (let beat = 0; beat < chord.duration; beat++) {
            const beatTime = chordStartTime + (beat * beatDuration);
            const isDownbeat = beat === 0;
            
            if (metronome) {
              playClick(ctx, masterGain!, beatTime, isDownbeat);
            }
            
            if (onBeat) {
              const beatDelayMs = (beatTime - ctx.currentTime) * 1000;
              const beatTimeout = window.setTimeout(() => {
                if (!cancelled) onBeat(beat);
              }, Math.max(0, beatDelayMs));
              timeouts.push(beatTimeout);
            }
          }
          
          // Schedule instruments using 16th note slots (16 slots per bar)
          const barsInChord = Math.ceil(chord.duration / 4);
          for (let bar = 0; bar < barsInChord; bar++) {
            barNumber++;
            const barStartTime = chordStartTime + (bar * 4 * beatDuration);
            
            // Generate pattern for this bar (with fills on bar 4, 8, etc.)
            const pattern = generateBarPattern(style, barNumber, 4, true);
            
            // Schedule each 16th note slot
            for (let slot = 0; slot < 16; slot++) {
              const slotTime = barStartTime + (slot * slotDuration);
              
              // Skip if slot is beyond chord duration
              if (slotTime >= chordStartTime + durationInSeconds) break;
              
              // Piano - uses velocity from pattern
              const pianoVelocity = pattern.piano[slot];
              if (pianoState && isInstrumentAudible(pianoState, instruments) && pianoSound && pianoVelocity > 0) {
                midiNotes.forEach(midiNote => {
                  const frequency = midiToFrequency(midiNote);
                  playPianoNote(
                    ctx, masterGain!, frequency, slotTime, 
                    slotDuration * 3, pianoSound, 
                    pianoState.volume * style.volumes.piano * pianoVelocity
                  );
                });
              }
              
              // Bass - uses velocity from pattern
              const bassVelocity = pattern.bass[slot];
              if (bassState && isInstrumentAudible(bassState, instruments) && bassSound && bassVelocity > 0) {
                const bassNote = midiNotes[0];
                const frequency = midiToFrequency(bassNote);
                const noteDuration = style.bassSustain ? beatDuration * 2 : slotDuration * 2;
                playBassNote(
                  ctx, masterGain!, frequency, slotTime,
                  noteDuration, bassSound,
                  bassState.volume * style.volumes.bass * bassVelocity
                );
              }
              
              // Drums - separate kick, snare, hihat with velocities
              if (drumsState && isInstrumentAudible(drumsState, instruments) && drumsSound) {
                const baseVolume = drumsState.volume * style.volumes.drums;
                
                if (pattern.kick[slot] > 0) {
                  playDrumHit(ctx, masterGain!, slotTime, drumsSound, baseVolume * pattern.kick[slot], 'kick');
                }
                if (pattern.snare[slot] > 0) {
                  playDrumHit(ctx, masterGain!, slotTime, drumsSound, baseVolume * pattern.snare[slot], 'snare');
                }
                if (pattern.hihat[slot] > 0) {
                  playDrumHit(ctx, masterGain!, slotTime, drumsSound, baseVolume * pattern.hihat[slot] * 0.7, 'hihat');
                }
              }
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
  
  const slotDuration = beatDuration / 4;
  let barNumber = 0;
  
  sections.forEach(section => {
    for (let repeat = 0; repeat < section.repeatCount; repeat++) {
      section.chords.forEach(chord => {
        const midiNotes = chordToMidiNotes(chord).map(note => note + transposition);
        const chordStartTime = currentTime;
        const durationInSeconds = chord.duration * beatDuration;
        
        // Process in 16th note slots
        const barsInChord = Math.ceil(chord.duration / 4);
        for (let bar = 0; bar < barsInChord; bar++) {
          barNumber++;
          const barStartTime = chordStartTime + (bar * 4 * beatDuration);
          
          const pattern = generateBarPattern(style, barNumber, 4, true);
          
          for (let slot = 0; slot < 16; slot++) {
            const slotTime = barStartTime + (slot * slotDuration);
            if (slotTime >= chordStartTime + durationInSeconds) break;
            
            // Piano
            const pianoVelocity = pattern.piano[slot];
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
            const bassVelocity = pattern.bass[slot];
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
              if (pattern.kick[slot] > 0) {
                const vol = baseVolume * pattern.kick[slot];
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
              
              // Snare
              if (pattern.snare[slot] > 0) {
                const vol = baseVolume * pattern.snare[slot];
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
              
              // Hi-hat
              if (pattern.hihat[slot] > 0) {
                const vol = baseVolume * pattern.hihat[slot] * 0.7;
                const osc = offlineCtx.createOscillator();
                osc.type = 'square';
                osc.frequency.value = 8000;
                const filter = offlineCtx.createBiquadFilter();
                filter.type = 'highpass';
                filter.frequency.value = 7000;
                const gain = offlineCtx.createGain();
                gain.gain.setValueAtTime(0.04 * vol, slotTime);
                gain.gain.exponentialRampToValueAtTime(0.001, slotTime + 0.05);
                osc.connect(filter);
                filter.connect(gain);
                gain.connect(offlineMasterGain);
                osc.start(slotTime);
                osc.stop(slotTime + 0.06);
              }
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
