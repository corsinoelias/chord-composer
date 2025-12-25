/**
 * Audio Engine - Realistic Sound Synthesis
 * 
 * Uses advanced Web Audio API techniques for more realistic instrument sounds:
 * - Multiple harmonics with proper amplitude ratios
 * - Filters to shape tone
 * - Noise-based percussion
 * - Proper ADSR envelopes
 */

import { Chord, chordToMidiNotes, midiToFrequency } from './musicTheory';
import { InstrumentState, getSoundType, SoundType, isInstrumentAudible } from './instruments';
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
 * Creates a more realistic piano sound with harmonics
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
  const freq = frequency * Math.pow(2, soundType.octaveOffset);
  
  // Harmonic series for piano-like timbre
  const harmonics = [
    { ratio: 1, amp: 1.0 },      // Fundamental
    { ratio: 2, amp: 0.5 },      // Octave
    { ratio: 3, amp: 0.25 },     // Fifth
    { ratio: 4, amp: 0.125 },    // 2nd octave
    { ratio: 5, amp: 0.0625 },   // Major 3rd
  ];
  
  const mainGain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 4000;
  filter.Q.value = 0.5;
  
  filter.connect(mainGain);
  mainGain.connect(destination);
  
  const { attackTime, decayTime, sustainLevel, releaseTime } = soundType;
  const noteEnd = startTime + duration;
  const maxGain = 0.2 * volume;
  
  // ADSR envelope
  mainGain.gain.setValueAtTime(0, startTime);
  mainGain.gain.linearRampToValueAtTime(maxGain, startTime + attackTime);
  mainGain.gain.exponentialRampToValueAtTime(
    Math.max(0.001, maxGain * sustainLevel), 
    startTime + attackTime + decayTime
  );
  mainGain.gain.setValueAtTime(
    Math.max(0.001, maxGain * sustainLevel), 
    Math.max(startTime, noteEnd - releaseTime)
  );
  mainGain.gain.exponentialRampToValueAtTime(0.001, noteEnd);
  
  // Filter envelope for brightness decay
  filter.frequency.setValueAtTime(6000, startTime);
  filter.frequency.exponentialRampToValueAtTime(2000, startTime + 0.3);
  
  harmonics.forEach(h => {
    const osc = ctx.createOscillator();
    const harmGain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.value = freq * h.ratio;
    
    // Slight detuning for richness
    osc.detune.value = (Math.random() - 0.5) * 4;
    
    harmGain.gain.value = h.amp;
    osc.connect(harmGain);
    harmGain.connect(filter);
    
    osc.start(startTime);
    osc.stop(noteEnd + 0.1);
  });
}

/**
 * Creates a realistic bass sound
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
  const freq = frequency * Math.pow(2, soundType.octaveOffset);
  
  const mainGain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 800;
  filter.Q.value = 2;
  
  filter.connect(mainGain);
  mainGain.connect(destination);
  
  // Create sub and main oscillators
  const subOsc = ctx.createOscillator();
  const mainOsc = ctx.createOscillator();
  
  subOsc.type = 'sine';
  subOsc.frequency.value = freq;
  
  mainOsc.type = soundType.oscillatorType;
  mainOsc.frequency.value = freq;
  
  const subGain = ctx.createGain();
  const mainOscGain = ctx.createGain();
  subGain.gain.value = 0.7;
  mainOscGain.gain.value = 0.3;
  
  subOsc.connect(subGain);
  mainOsc.connect(mainOscGain);
  subGain.connect(filter);
  mainOscGain.connect(filter);
  
  const { attackTime, decayTime, sustainLevel, releaseTime } = soundType;
  const noteEnd = startTime + duration;
  const maxGain = 0.35 * volume;
  
  mainGain.gain.setValueAtTime(0, startTime);
  mainGain.gain.linearRampToValueAtTime(maxGain, startTime + attackTime);
  mainGain.gain.exponentialRampToValueAtTime(
    Math.max(0.001, maxGain * sustainLevel),
    startTime + attackTime + decayTime
  );
  mainGain.gain.setValueAtTime(
    Math.max(0.001, maxGain * sustainLevel),
    Math.max(startTime, noteEnd - releaseTime)
  );
  mainGain.gain.exponentialRampToValueAtTime(0.001, noteEnd);
  
  subOsc.start(startTime);
  mainOsc.start(startTime);
  subOsc.stop(noteEnd + 0.1);
  mainOsc.stop(noteEnd + 0.1);
}

/**
 * Creates realistic kick drum with pitched body + noise transient
 */
function playKick(
  ctx: AudioContext,
  destination: AudioNode,
  startTime: number,
  volume: number
): void {
  // Pitched body
  const osc = ctx.createOscillator();
  const oscGain = ctx.createGain();
  
  osc.type = 'sine';
  osc.frequency.setValueAtTime(180, startTime);
  osc.frequency.exponentialRampToValueAtTime(40, startTime + 0.08);
  
  oscGain.gain.setValueAtTime(0.8 * volume, startTime);
  oscGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.3);
  
  osc.connect(oscGain);
  oscGain.connect(destination);
  
  // Click transient
  const clickOsc = ctx.createOscillator();
  const clickGain = ctx.createGain();
  
  clickOsc.type = 'triangle';
  clickOsc.frequency.value = 800;
  
  clickGain.gain.setValueAtTime(0.3 * volume, startTime);
  clickGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.02);
  
  clickOsc.connect(clickGain);
  clickGain.connect(destination);
  
  osc.start(startTime);
  osc.stop(startTime + 0.35);
  clickOsc.start(startTime);
  clickOsc.stop(startTime + 0.03);
}

/**
 * Creates realistic snare with pitched body + noise
 */
function playSnare(
  ctx: AudioContext,
  destination: AudioNode,
  startTime: number,
  volume: number
): void {
  // Pitched body
  const osc = ctx.createOscillator();
  const oscGain = ctx.createGain();
  
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(200, startTime);
  osc.frequency.exponentialRampToValueAtTime(120, startTime + 0.05);
  
  oscGain.gain.setValueAtTime(0.4 * volume, startTime);
  oscGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.1);
  
  osc.connect(oscGain);
  oscGain.connect(destination);
  
  // Noise for snare wires
  const bufferSize = ctx.sampleRate * 0.15;
  const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const noiseData = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    noiseData[i] = (Math.random() * 2 - 1) * 0.8;
  }
  
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer;
  
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'highpass';
  noiseFilter.frequency.value = 2000;
  
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.35 * volume, startTime);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.15);
  
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(destination);
  
  osc.start(startTime);
  osc.stop(startTime + 0.15);
  noise.start(startTime);
  noise.stop(startTime + 0.2);
}

/**
 * Creates hi-hat sound
 */
function playHiHat(
  ctx: AudioContext,
  destination: AudioNode,
  startTime: number,
  volume: number,
  isOpen: boolean = false
): void {
  const duration = isOpen ? 0.3 : 0.08;
  
  // Noise-based hi-hat
  const bufferSize = ctx.sampleRate * duration;
  const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const noiseData = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    noiseData[i] = Math.random() * 2 - 1;
  }
  
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer;
  
  // High-pass and band-pass filtering for metallic sound
  const highpass = ctx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 7000;
  
  const bandpass = ctx.createBiquadFilter();
  bandpass.type = 'bandpass';
  bandpass.frequency.value = 10000;
  bandpass.Q.value = 1;
  
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.2 * volume, startTime);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  
  noise.connect(highpass);
  highpass.connect(bandpass);
  bandpass.connect(noiseGain);
  noiseGain.connect(destination);
  
  noise.start(startTime);
  noise.stop(startTime + duration + 0.05);
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

/**
 * Plays instrument based on type
 */
function playInstrumentNote(
  ctx: AudioContext,
  destination: AudioNode,
  frequency: number,
  startTime: number,
  duration: number,
  soundType: SoundType,
  volume: number,
  instrumentType: 'piano' | 'bass'
): void {
  if (instrumentType === 'piano') {
    playPianoNote(ctx, destination, frequency, startTime, duration, soundType, volume);
  } else {
    playBassNote(ctx, destination, frequency, startTime, duration, soundType, volume);
  }
}

/**
 * Plays drum hit based on pattern position
 */
function playDrumHit(
  ctx: AudioContext,
  destination: AudioNode,
  startTime: number,
  volume: number,
  drumType: 'kick' | 'snare' | 'hihat' | 'hihat-open'
): void {
  switch (drumType) {
    case 'kick':
      playKick(ctx, destination, startTime, volume);
      break;
    case 'snare':
      playSnare(ctx, destination, startTime, volume);
      break;
    case 'hihat':
      playHiHat(ctx, destination, startTime, volume, false);
      break;
    case 'hihat-open':
      playHiHat(ctx, destination, startTime, volume, true);
      break;
  }
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
            if (pianoState && isInstrumentAudible(pianoState, instruments) && pianoSound && style.rhythm.piano.includes(beatInPattern)) {
              midiNotes.forEach(midiNote => {
                const frequency = midiToFrequency(midiNote);
                playInstrumentNote(
                  ctx, masterGain!, frequency, beatTime, 
                  beatDuration * 0.9, pianoSound, 
                  pianoState.volume * style.volumes.piano,
                  'piano'
                );
              });
            }
            
            // Bass - plays root note on pattern beats
            if (bassState && isInstrumentAudible(bassState, instruments) && bassSound && style.rhythm.bass.includes(beatInPattern)) {
              const bassNote = midiNotes[0]; // Root note
              const frequency = midiToFrequency(bassNote);
              playInstrumentNote(
                ctx, masterGain!, frequency, beatTime,
                beatDuration * 0.8, bassSound,
                bassState.volume * style.volumes.bass,
                'bass'
              );
            }
            
            // Drums - plays kick/snare/hihat pattern
            if (drumsState && isInstrumentAudible(drumsState, instruments) && style.rhythm.drums.includes(beatInPattern)) {
              const drumVolume = drumsState.volume * style.volumes.drums;
              // Determine drum type based on beat position
              let drumType: 'kick' | 'snare' | 'hihat' = 'hihat';
              if (beatInPattern === 0 || beatInPattern === 2) {
                drumType = 'kick';
              } else if (beatInPattern === 1 || beatInPattern === 3) {
                drumType = 'snare';
              }
              playDrumHit(ctx, masterGain!, beatTime, drumVolume, drumType);
              // Also play hihat on all beats for rhythm
              if (drumType !== 'hihat') {
                playDrumHit(ctx, masterGain!, beatTime, drumVolume * 0.4, 'hihat');
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
          
          // Piano - using realistic synthesis
          if (pianoState && isInstrumentAudible(pianoState, instruments) && pianoSound && style.rhythm.piano.includes(beatInPattern)) {
            midiNotes.forEach(midiNote => {
              const frequency = midiToFrequency(midiNote);
              const volume = pianoState.volume * style.volumes.piano;
              
              // Simplified but better sounding piano for offline
              const harmonics = [
                { ratio: 1, amp: 1.0 },
                { ratio: 2, amp: 0.5 },
                { ratio: 3, amp: 0.25 },
              ];
              
              harmonics.forEach(h => {
                const osc = offlineCtx.createOscillator();
                const gain = offlineCtx.createGain();
                osc.type = 'sine';
                osc.frequency.value = frequency * Math.pow(2, pianoSound.octaveOffset) * h.ratio;
                osc.connect(gain);
                gain.connect(offlineMasterGain);
                
                const maxGain = 0.15 * volume * h.amp;
                gain.gain.setValueAtTime(0, beatTime);
                gain.gain.linearRampToValueAtTime(maxGain, beatTime + pianoSound.attackTime);
                gain.gain.exponentialRampToValueAtTime(Math.max(0.001, maxGain * pianoSound.sustainLevel), beatTime + pianoSound.attackTime + pianoSound.decayTime);
                gain.gain.exponentialRampToValueAtTime(0.001, beatTime + beatDuration * 0.9);
                
                osc.start(beatTime);
                osc.stop(beatTime + beatDuration);
              });
            });
          }
          
          // Bass
          if (bassState && isInstrumentAudible(bassState, instruments) && bassSound && style.rhythm.bass.includes(beatInPattern)) {
            const bassNote = midiNotes[0];
            const frequency = midiToFrequency(bassNote);
            const volume = bassState.volume * style.volumes.bass;
            
            // Sub bass + harmonics
            const osc = offlineCtx.createOscillator();
            const osc2 = offlineCtx.createOscillator();
            const gain = offlineCtx.createGain();
            osc.type = 'sine';
            osc.frequency.value = frequency * Math.pow(2, bassSound.octaveOffset);
            osc2.type = 'triangle';
            osc2.frequency.value = frequency * Math.pow(2, bassSound.octaveOffset);
            
            const subGain = offlineCtx.createGain();
            const mainGain = offlineCtx.createGain();
            subGain.gain.value = 0.7;
            mainGain.gain.value = 0.3;
            
            osc.connect(subGain);
            osc2.connect(mainGain);
            subGain.connect(gain);
            mainGain.connect(gain);
            gain.connect(offlineMasterGain);
            
            const maxGain = 0.3 * volume;
            gain.gain.setValueAtTime(0, beatTime);
            gain.gain.linearRampToValueAtTime(maxGain, beatTime + bassSound.attackTime);
            gain.gain.exponentialRampToValueAtTime(0.001, beatTime + beatDuration * 0.8);
            
            osc.start(beatTime);
            osc2.start(beatTime);
            osc.stop(beatTime + beatDuration);
            osc2.stop(beatTime + beatDuration);
          }
          
          // Drums - using realistic synthesis
          if (drumsState && isInstrumentAudible(drumsState, instruments) && style.rhythm.drums.includes(beatInPattern)) {
            const volume = drumsState.volume * style.volumes.drums;
            const isKick = beatInPattern === 0 || beatInPattern === 2;
            const isSnare = beatInPattern === 1 || beatInPattern === 3;
            
            if (isKick) {
              // Kick drum
              const osc = offlineCtx.createOscillator();
              const gain = offlineCtx.createGain();
              osc.type = 'sine';
              osc.frequency.setValueAtTime(180, beatTime);
              osc.frequency.exponentialRampToValueAtTime(40, beatTime + 0.08);
              osc.connect(gain);
              gain.connect(offlineMasterGain);
              gain.gain.setValueAtTime(0.6 * volume, beatTime);
              gain.gain.exponentialRampToValueAtTime(0.001, beatTime + 0.3);
              osc.start(beatTime);
              osc.stop(beatTime + 0.35);
            }
            
            if (isSnare) {
              // Snare body
              const osc = offlineCtx.createOscillator();
              const gain = offlineCtx.createGain();
              osc.type = 'triangle';
              osc.frequency.setValueAtTime(200, beatTime);
              osc.frequency.exponentialRampToValueAtTime(120, beatTime + 0.05);
              osc.connect(gain);
              gain.connect(offlineMasterGain);
              gain.gain.setValueAtTime(0.3 * volume, beatTime);
              gain.gain.exponentialRampToValueAtTime(0.001, beatTime + 0.1);
              osc.start(beatTime);
              osc.stop(beatTime + 0.15);
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
