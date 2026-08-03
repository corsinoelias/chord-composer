/**
 * Audio Engine
 * 
 * This module handles all audio synthesis and playback using the Web Audio API.
 * Supports multiple instruments with 16-slot rhythm patterns (16th note resolution).
 */

import { type Chord, chordToMidiNotes, midiToFrequency } from './musicTheory';

// ── Soundfont-player for guitar SF2 sounds ───────────────────────────────────
type SfPlayer = {
  play: (note: string, when?: number, opts?: { duration?: number; gain?: number }) => unknown
  connect: (dest: AudioNode) => SfPlayer
}
const SF2_NOTE_NAMES = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B']
const SF2_GAIN = 4.0 // soundfont MP3s are recorded at ~-18dBFS; boost to match local sample levels
function sf2NoteName(midi: number) { return SF2_NOTE_NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1) }
const sfGuitarPlayers = new Map<string, SfPlayer>()
const sfGuitarLoadings = new Map<string, Promise<void>>()

export function ensureGuitarSoundfont(soundTypeId: string, instrument: string): void {
  if (sfGuitarPlayers.has(soundTypeId) || sfGuitarLoadings.has(soundTypeId)) return
  if (!audioContext) return
  const loading = (async () => {
    const sf = await import('soundfont-player') as {
      instrument: (ctx: AudioContext, name: string, opts?: object) => Promise<SfPlayer>
    }
    const player = await sf.instrument(audioContext!, instrument, {
      soundfont: 'MusyngKite',
      nameToUrl: () => `/soundfonts/${instrument}-mp3.js`,
    })
    if (masterGain) player.connect(masterGain)
    sfGuitarPlayers.set(soundTypeId, player)
  })()
  sfGuitarLoadings.set(soundTypeId, loading)
}

// Kicks off (or reuses) the soundfont load and waits for it to fully finish before returning.
// Callers should await this BEFORE flipping any "now playing" state — nothing (audio or the
// chord-duration dots) should start until the real sample is ready; there's no early bailout
// here on purpose. The timeout only guards against a truly stuck network request — every
// stop() closes the AudioContext (see stopPlayback), so switching sections re-decodes this
// soundfont from scratch on EVERY section change, not just once per page load. 8s made that
// silent gap read as "it just stopped" long before the fallback ever kicked in; 2.5s still
// covers a normal decode (it's re-fetched from browser cache, not the network, on a repeat
// load) while keeping the worst case short enough to not feel broken.
export async function ensureGuitarSoundfontLoaded(soundTypeId: string, instrument: string): Promise<void> {
  if (sfGuitarPlayers.has(soundTypeId)) return
  ensureGuitarSoundfont(soundTypeId, instrument)
  const loading = sfGuitarLoadings.get(soundTypeId)
  if (!loading) return
  try {
    await Promise.race([
      loading,
      new Promise<void>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2500)),
    ])
  } catch {
    // Only reached if the network request is genuinely stuck — proceed rather than hang
    // the play button forever. playGuitarNote falls back to the synth tone in that case.
    console.warn(`[AUDIO] Guitar soundfont "${soundTypeId}" timed out loading — proceeding without it`);
  }
}
// ─────────────────────────────────────────────────────────────────────────────
import { type InstrumentState, getSoundType, type SoundType, isInstrumentAudible } from './instruments';
import { scheduleSampledNoteByDir, scheduleSampledNoteByDirAsync, preloadSampleDir } from './bassTab/sampleEngine';
import { type StylePattern, generateBarPattern, getSlotsPerBar, getMetronomeClickInterval, getSwingOffset, type ArpeggioCell, type ArpeggioType, type ArpeggioSpeed } from './styles';
import { type Section } from './sections';
import { buildEffectsChain } from './audioEffects';
import { getScale as getBassScale_getScale, resolveVariation } from './bassScale';

let audioContext: AudioContext | null = null;
let masterGain: GainNode | null = null;
let analyserNode: AnalyserNode | null = null;
let currentlyPlaying = false;
let playbackStoppedCallback: (() => void) | null = null;
let playbackMutex = false; // Prevent multiple simultaneous playback instances
let sampleLoadingComplete = false; // Track if initial load completed
let drumSamplePromise: Promise<void> | null = null; // Critical — no synthesis fallback

// Chord schedule for rAF-based visual sync. durationSec is the chord's own known length —
// NOT the gap to the next schedule entry, which lags behind the bar-by-bar scheduler's
// lookahead and would make a continuous progress readout stall for most of the chord.
let _chordSchedule: { audioTime: number; chordIndex: number; durationSec: number }[] = [];

export function getChordSchedule(): { audioTime: number; chordIndex: number; durationSec: number }[] {
  return _chordSchedule;
}

export function clearChordSchedule(): void {
  _chordSchedule = [];
}

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
 * Loads all piano samples (1.mp3 to 88.mp3 = MIDI notes 21-108).
 * Uses a concurrency pool of 8 to avoid spiking CPU with 88 simultaneous
 * decodeAudioData calls. Middle octaves (C3-C7, keys 28-76) load first.
 */
async function loadPianoSamples(ctx: AudioContext): Promise<void> {
  // Sort keys so middle octaves (most used) load first
  const keys = Array.from({ length: 88 }, (_, i) => i + 1).sort((a, b) => {
    const inRange = (k: number) => { const m = k + 20; return m >= 48 && m <= 96; };
    if (inRange(a) && !inRange(b)) return -1;
    if (!inRange(a) && inRange(b)) return 1;
    return 0;
  });

  const queue = [...keys];
  const CONCURRENCY = 8;

  const worker = async () => {
    while (queue.length > 0) {
      const i = queue.shift()!;
      const midiNote = i + 20;
      try {
        const response = await fetch(`/audio/piano/${i}.mp3`);
        pianoSamples[midiNote] = response.ok
          ? await ctx.decodeAudioData(await response.arrayBuffer())
          : null;
      } catch {
        pianoSamples[midiNote] = null;
      }
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  pianoSamplesLoaded = true;
}

const GUITAR_TYPE_NOTES: Record<string, string[]> = {
  'guitar-acoustic': ['A2', 'A3', 'A4', 'As2', 'As3', 'As4', 'B2', 'B3', 'B4', 'C3', 'C4', 'C5', 'Cs3', 'Cs4', 'D3', 'D4', 'Ds3', 'Ds4', 'E2', 'E3', 'E4', 'F3', 'F4', 'Fs3', 'Fs4', 'G3', 'G4', 'Gs3', 'Gs4'],
  'guitar-electric': ['A2', 'A3', 'A4', 'A5', 'C3', 'C4', 'C5', 'C6', 'Cs2', 'Ds3', 'Ds4', 'Ds5', 'E2', 'Fs2', 'Fs3', 'Fs4', 'Fs5'],
  'guitar-nylon':    ['A2', 'A3', 'A4', 'A5', 'As5', 'B1', 'B2', 'B3', 'B4', 'Cs3', 'Cs4', 'Cs5', 'D2', 'D3', 'E2', 'E3', 'E4', 'E5', 'Fs2', 'Fs3', 'Fs4', 'Fs5', 'G3', 'G5', 'Gs2', 'Gs4', 'Gs5'],
};

const guitarTypeLoading: Record<string, Promise<void> | null> = {
  'guitar-acoustic': null,
  'guitar-electric': null,
  'guitar-nylon':    null,
};

async function loadGuitarSampleType(ctx: AudioContext, path: string): Promise<void> {
  const notes = GUITAR_TYPE_NOTES[path];
  if (!notes) return;
  await Promise.all(
    notes.map(async noteKey => {
      try {
        const response = await fetch(`/audio/${path}/${noteKey}.mp3`);
        guitarSamples[path][noteKey] = response.ok
          ? await ctx.decodeAudioData(await response.arrayBuffer())
          : null;
      } catch {
        guitarSamples[path][noteKey] = null;
      }
    })
  );
}

export function ensureGuitarSampleType(samplePath: string): void {
  if (!audioContext) return;
  if (guitarTypeLoading[samplePath]) return;
  guitarTypeLoading[samplePath] = loadGuitarSampleType(audioContext, samplePath)
    .catch(() => {});
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
      // CRITICAL: drums have no synthesis fallback — must be ready before first beat
      drumSamplePromise = loadAcousticSamples(audioContext);

      // BACKGROUND: piano and guitar both have synthesis fallbacks, load after drums
      // so they don't compete for bandwidth on the critical path
      // Guitar: only load the default type (electric) — others load on demand via ensureGuitarSampleType
      // Bass sounds are not preloaded here at all — scheduleSampledNoteByDir/Async already
      // load samples lazily on demand per sound, so an eager preload would just be redundant.
      const backgroundLoad = drumSamplePromise.then(() => {
        guitarTypeLoading['guitar-electric'] = loadGuitarSampleType(audioContext!, 'guitar-electric');
        return Promise.all([
          loadPianoSamples(audioContext!),
          guitarTypeLoading['guitar-electric'],
        ]);
      });

      sampleLoadPromise = backgroundLoad
        .then(() => {
          sampleLoadingComplete = true;
        })
        .catch(() => {
          sampleLoadingComplete = true;
        });
    } else {
      drumSamplePromise = Promise.resolve();
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
 * Ensures samples are loaded before playback with timeout.
 * Only blocks on drums — they have no synthesis fallback.
 * Piano and guitar load in the background and fall back to synthesis until ready.
 */
export async function ensureSamplesLoaded(): Promise<void> {
  const ctx = getAudioContext();

  // Resume if suspended (critical for mobile)
  if (ctx.state === 'suspended') {
    await ctx.resume();
  }

  if (drumSamplePromise) {
    try {
      await Promise.race([
        drumSamplePromise,
        new Promise<void>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
      ]);
    } catch (err) {
      console.warn('Drum sample loading timeout, proceeding anyway');
    }
  }
}

/**
 * Fires a single drum hit immediately — audible feedback when a user taps a pad in
 * the rhythm editor. Routes through masterGain (so effects apply) and reuses the same
 * synthesis/samples as playback. Falls back to synth if acoustic samples aren't loaded.
 */
export function previewDrumHit(drumType: string, soundTypeId: string = 'standard', volume: number = 0.8): void {
  const ctx = getAudioContext();
  if (!masterGain) return;
  if (ctx.state === 'suspended') { void ctx.resume(); }
  const soundType = getSoundType('drums', soundTypeId) ?? getSoundType('drums', 'standard');
  if (!soundType) return;
  playDrumHit(
    ctx,
    masterGain,
    ctx.currentTime + 0.005,
    soundType,
    volume,
    drumType as Parameters<typeof playDrumHit>[5],
  );
}

/**
 * Fires a single pitched note immediately — audible feedback when a user taps a cell in
 * the melodic (scale/chord) grids. Uses the sampled piano so the pitch is clear
 * regardless of which instrument's pattern is being edited.
 */
export function previewNote(midi: number, volume: number = 0.5): void {
  const ctx = getAudioContext();
  if (!masterGain) return;
  if (ctx.state === 'suspended') { void ctx.resume(); }
  const soundType = getSoundType('piano', 'sampled') ?? getSoundType('piano', 'acoustic');
  if (!soundType) return;
  playPianoNote(ctx, masterGain, midiToFrequency(midi), ctx.currentTime + 0.005, 0.45, soundType, volume, midi);
}

/**
 * Plays a chord and sustains it until the returned stop function is called.
 * Used for press-and-hold chord previews (e.g. clicking a chord in a palette).
 * Self-contained, like playChordPreview.
 */
export function playChordHold(chord: Chord, volume: number = 0.5): () => void {
  const ctx = getAudioContext();

  if (ctx.state === 'suspended') {
    ctx.resume();
  }

  const previewGain = ctx.createGain();
  previewGain.gain.value = 0.5;
  previewGain.connect(ctx.destination);

  const midiNotes = chordToMidiNotes(chord, 4);
  const now = ctx.currentTime;

  const oscillators: OscillatorNode[] = [];
  const bufferSources: AudioBufferSourceNode[] = [];
  const gainNodes: GainNode[] = [];

  midiNotes.forEach(midiNote => {
    const gainNode = ctx.createGain();
    gainNode.connect(previewGain);
    gainNodes.push(gainNode);

    // Real sampled grand piano when available — falls back to harmonic
    // synthesis for notes outside the sampled range.
    const sample = pianoSamples[midiNote];
    if (sample) {
      const source = ctx.createBufferSource();
      source.buffer = sample;
      source.connect(gainNode);
      source.start(now);
      bufferSources.push(source);

      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(volume * 0.8, now + 0.02);
      return;
    }

    const frequency = midiToFrequency(midiNote);
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
      oscillators.push(osc);
    });

    // Attack, then sustain at 0.7 until stop() is called
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(1, now + 0.02);
    gainNode.gain.linearRampToValueAtTime(0.7, now + 0.1);
  });

  let stopped = false;
  return function stop() {
    if (stopped) return;
    stopped = true;

    const releaseTime = ctx.currentTime;
    const releaseDuration = 0.15;

    gainNodes.forEach(gainNode => {
      gainNode.gain.cancelScheduledValues(releaseTime);
      gainNode.gain.setValueAtTime(gainNode.gain.value, releaseTime);
      gainNode.gain.linearRampToValueAtTime(0, releaseTime + releaseDuration);
    });
    oscillators.forEach(osc => {
      osc.stop(releaseTime + releaseDuration + 0.05);
    });
    bufferSources.forEach(source => {
      source.stop(releaseTime + releaseDuration + 0.05);
    });
  };
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
  const duration = 0.6;

  // Real sampled grand piano — falls back to synthesis automatically inside
  // playPianoSample/playPianoNote if the sample for a given note isn't loaded yet.
  const soundType = getSoundType('piano', 'sampled')!;

  midiNotes.forEach(midiNote => {
    const frequency = midiToFrequency(midiNote);
    playPianoNote(ctx, previewGain, frequency, now, duration, soundType, volume, midiNote);
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
  // Trigger lazy load if this type hasn't been loaded yet
  ensureGuitarSampleType(samplePath);

  const match = findClosestGuitarSample(samplePath, midiNote);

  if (!match) {
    // Fallback to synthesis (also used while samples are still loading)
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
  if (soundType.sf2Instrument && midiNote !== undefined) {
    const sfPlayer = sfGuitarPlayers.get(soundType.id)
    if (sfPlayer) {
      sfPlayer.play(sf2NoteName(midiNote), startTime, { duration, gain: volume * 0.8 * SF2_GAIN })
    } else {
      ensureGuitarSoundfont(soundType.id, soundType.sf2Instrument)
      playGuitarSynth(ctx, destination, frequency, startTime, duration, volume)
    }
    return
  }
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
  // Called once when a NON-looping schedule (loop: false) reaches its natural end, so a
  // caller that deliberately opted out of looping (e.g. "play this section once") can react
  // — the engine itself just stops scheduling further segments and otherwise goes silent.
  onEnded?: () => void;
  onStep?: (step: number) => void;
  onStepChange?: (step: number) => void; // Called continuously for playhead sync
  getStyle?: () => StylePattern;
  forceFill?: boolean;
  // Dynamic getters for real-time parameter changes without restart
  getMetronome?: () => boolean;
  getInstruments?: () => InstrumentState[];
  getTransposition?: () => number;
  getBpm?: () => number;
  getBassScale?:   (sectionId: string) => import('./bassScale').BassScaleData | null;
  getPianoScale?:  (sectionId: string) => import('./bassScale').BassScaleData | null;
  getGuitarScale?: (sectionId: string) => import('./bassScale').BassScaleData | null;
  getSections?: () => Section[];
  getLoopingSectionId?: () => string | null;
  // Vocal/reference audio track — a single decoded buffer sliced per section (keyed by
  // Section.id) or as one continuous span for the whole song. Muted (not started) while
  // the key is transposed, since it can't follow the pitch shift (local-only prototype —
  // see the "Referencia vocal" plan for the eventual real pitch-shift/persistence phase).
  audioTrack?: {
    buffer: AudioBuffer;
    wholeRange?: { startSec: number; endSec: number };
    sectionRanges?: Record<string, { startSec: number; endSec: number }>;
  };
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
    onEnded,
    onStep,
    onStepChange,
    getStyle,
    forceFill = false,
    getMetronome,
    getInstruments,
    getTransposition,
    getBpm: getBpmGetter,
    getBassScale,
    getPianoScale,
    getGuitarScale,
    getSections,
    getLoopingSectionId,
    audioTrack,
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
    slotCount: number;
    globalChordIndex: number;
    beatOffset: number;
    sectionId: string;
    // True at the first chord of EACH pass through the section — including every
    // repeat when repeatCount > 1, not just the section's very first occurrence.
    // buildSectionBoundaries below merges all consecutive repeats of the same
    // section into one boundary, so the vocal-track scheduler (which needs to
    // restart the clip on every repeat, not just once for the whole merged span)
    // keys off this flag instead.
    isSectionRepeatStart: boolean;
  }

  // Section boundaries within the flat chordSegments array
  interface SectionBoundary {
    sectionId: string;
    startIdx: number;
    endIdx: number; // exclusive — boundary fires when currentSegmentIndex === endIdx
  }

  const buildChordSegments = (secs: Section[] = sections): ChordSegment[] => {
    const segments: ChordSegment[] = [];
    let globalChordIndex = 0;
    let beatOffset = 0;
    secs.forEach(section => {
      for (let repeat = 0; repeat < section.repeatCount; repeat++) {
        section.chords.forEach((chord, chordIdx) => {
          const slotCount = chord.duration * 4;
          segments.push({ chord, slotCount, globalChordIndex, beatOffset, sectionId: section.id, isSectionRepeatStart: chordIdx === 0 });
          beatOffset += chord.duration;
          globalChordIndex++;
        });
      }
    });
    return segments;
  };

  // The index just past the end of the single repeat pass starting at `startIdx`
  // (stops at the next repeat-start of the same section, a different section, or the
  // end of the array) — used to size the vocal clip's hard-stop to one pass, not the
  // whole multi-repeat span buildSectionBoundaries would otherwise report.
  const findRepeatSpanEnd = (segs: ChordSegment[], startIdx: number): number => {
    let i = startIdx + 1;
    const sectionId = segs[startIdx].sectionId;
    while (i < segs.length && segs[i].sectionId === sectionId && !segs[i].isSectionRepeatStart) i++;
    return i;
  };

  const buildSectionBoundaries = (segs: ChordSegment[]): SectionBoundary[] => {
    const boundaries: SectionBoundary[] = [];
    let i = 0;
    while (i < segs.length) {
      const sectionId = segs[i].sectionId;
      const startIdx = i;
      while (i < segs.length && segs[i].sectionId === sectionId) i++;
      boundaries.push({ sectionId, startIdx, endIdx: i });
    }
    return boundaries;
  };

  let chordSegments = buildChordSegments();
  let sectionBoundaries = buildSectionBoundaries(chordSegments);
  let currentSegmentIndex = 0;
  let globalSlotIndex = 0; // Continuous slot counter for rhythm pattern (0-15, wrapping)
  let lastChordIndex = -1;
  
  // Calculate total slots
  const totalSlots = chordSegments.reduce((sum, seg) => sum + seg.slotCount, 0);
  // For progressions ≥ 8 bars, use 8-bar phrase length so fills land at the end of the
  // full phrase rather than mid-phrase (e.g. 34-beat progression: bar 4 fill was wrong)
  let phraseLength = Math.floor(totalSlots / getSlotsPerBar(style)) >= 8 ? 8 : 4;

  // ── Vocal/reference audio track (local-only prototype) ─────────────────────
  let vocalSource: AudioBufferSourceNode | null = null;
  let vocalGain: GainNode | null = null;
  let vocalMuted = getCurrentTransposition() !== 0;

  const stopVocalClip = () => {
    if (vocalSource) {
      try { vocalSource.stop(); } catch { /* already stopped/ended */ }
      try { vocalSource.disconnect(); } catch { /* already disconnected */ }
      vocalSource = null;
    }
    if (vocalGain) {
      try { vocalGain.disconnect(); } catch { /* already disconnected */ }
      vocalGain = null;
    }
  };

  // Starts a slice of the shared audio buffer at `when`. `hardStopTime`, if given, cuts
  // the clip short at the end of the current pass through the section (the marked range
  // can be longer than the section actually plays for, especially with live BPM changes).
  const startVocalClip = (range: { startSec: number; endSec: number }, when: number, hardStopTime?: number) => {
    if (!audioTrack) return;
    const clipDuration = range.endSec - range.startSec;
    if (clipDuration <= 0) return;
    const source = ctx.createBufferSource();
    source.buffer = audioTrack.buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vocalMuted ? 0 : 1, when);
    source.connect(gain).connect(ctx.destination);
    source.start(when, range.startSec, clipDuration);
    if (hardStopTime !== undefined && hardStopTime < when + clipDuration - 0.001) {
      source.stop(Math.max(when, hardStopTime));
    }
    vocalSource = source;
    vocalGain = gain;
  };

  // Ramps (not hard-cuts) the currently playing clip's gain when the live transposition
  // flips between 0/non-zero, so toggling the key mid-clip doesn't click/pop.
  const applyVocalMute = (muted: boolean, when: number) => {
    if (muted === vocalMuted) return;
    vocalMuted = muted;
    if (!vocalGain) return;
    vocalGain.gain.cancelScheduledValues(when);
    vocalGain.gain.setValueAtTime(vocalGain.gain.value, when);
    vocalGain.gain.linearRampToValueAtTime(muted ? 0 : 1, when + 0.05);
  };

  // Reference used to detect section changes between chord boundaries
  let lastKnownSections: Section[] | null = getSections ? getSections() : null;

  // Schedule a batch of slots (one chord segment at a time for efficiency)
  const scheduleSegment = (segmentStartTime: number) => {
    if (cancelled) return;
    // Context-consistency guard: stopPlayback() closes the AudioContext and nulls
    // masterGain, and the next play() builds a fresh context. A segment already queued
    // via setTimeout from this (now-stale) scheduler would otherwise create nodes on the
    // old `ctx` and connect them to the new module-level `masterGain` — an
    // InvalidAccessError ("connect to a node belonging to a different audio context").
    // If the live context is no longer the one we captured, this scheduler is dead: bail.
    if (ctx !== audioContext || !masterGain) return;

    // Rebuild chord segments immediately when sections change so the very next
    // chord played matches what the user sees — no need to wait for loop end.
    if (getSections) {
      const latestSections = getSections();
      if (latestSections !== lastKnownSections && latestSections.length > 0 && latestSections.some(s => s.chords.length > 0)) {
        const prevSegment = currentSegmentIndex < chordSegments.length ? chordSegments[currentSegmentIndex] : null;
        const newSegments = buildChordSegments(latestSections);
        const newBoundaries = buildSectionBoundaries(newSegments);

        if (prevSegment) {
          // Keep playing from the same chord if it still exists (chord was edited, not deleted)
          const matchIdx = newSegments.findIndex(s => s.chord.id === prevSegment.chord.id);
          if (matchIdx >= 0) {
            currentSegmentIndex = matchIdx;
          } else {
            // Chord was removed — snap to closest valid index
            currentSegmentIndex = Math.min(currentSegmentIndex, newSegments.length - 1);
            lastChordIndex = -1;
          }
        } else {
          currentSegmentIndex = 0;
          lastChordIndex = -1;
        }

        chordSegments = newSegments;
        sectionBoundaries = newBoundaries;
        lastKnownSections = latestSections;
        const newTotalSlots = newSegments.reduce((sum, seg) => sum + seg.slotCount, 0);
        phraseLength = Math.floor(newTotalSlots / getSlotsPerBar(style)) >= 8 ? 8 : 4;
      }
    }

    // Section-boundary check: did we just finish a section?
    if (currentSegmentIndex > 0) {
      const crossed = sectionBoundaries.find(b => b.endIdx === currentSegmentIndex);
      if (crossed) {
        const loopingId = getLoopingSectionId?.() ?? null;
        if (loopingId === crossed.sectionId) {
          // Loop this section: jump back to its first segment
          currentSegmentIndex = crossed.startIdx;
          lastChordIndex = -1;
        }
      }
    }

    // Check if we've finished all segments (song-level loop)
    if (currentSegmentIndex >= chordSegments.length) {
      if (loop) {
        onLoopEnd?.();
        // Rebuild segments from latest sections so structural changes take effect
        if (getSections) {
          const latest = getSections();
          if (latest.length > 0 && latest.some(s => s.chords.length > 0)) {
            chordSegments = buildChordSegments(latest);
            sectionBoundaries = buildSectionBoundaries(chordSegments);
          }
        }
        currentSegmentIndex = 0;
        globalSlotIndex = 0;
        lastChordIndex = -1;
        const delayMs = Math.max(0, (segmentStartTime - ctx.currentTime) * 1000);
        nextBarTimeout = window.setTimeout(() => {
          if (!cancelled) scheduleSegment(ctx.currentTime + 0.05);
        }, delayMs);
      } else {
        onEnded?.();
      }
      return;
    }
    
    const segment = chordSegments[currentSegmentIndex];
    const { chord, slotCount, globalChordIndex, beatOffset, sectionId } = segment;
    
    // Get current style and dynamic parameters
    const currentStyle = getStyle ? getStyle() : style;
    const slotsPerBar = getSlotsPerBar(currentStyle);
    // Re-read BPM each segment so live changes take effect on the next chord
    const slotDuration = (60 / getCurrentBpm()) / 4;
    if (currentSegmentIndex === 0) {
      console.log(`[AUDIO] scheduleSegment bar#0 — currentStyle.id: "${currentStyle.id}", bpm: ${getCurrentBpm()}`);
    }
    const instruments = getInstrumentStates();
    const transposition = getCurrentTransposition();
    const metronomeOn = isMetronomeEnabled();

    // Vocal/reference audio track: (re)start a clip whenever a new pass through a
    // section begins — including every repeat when repeatCount > 1, not just the
    // section's first occurrence (buildSectionBoundaries merges repeats into one
    // span, so this keys off isSectionRepeatStart instead). For a whole-song-scoped
    // range, restart once at the very top, including on song-level loop restarts
    // (currentSegmentIndex resets to 0 there too). Mute state stays in sync with
    // live transposition changes every segment tick regardless of scope.
    if (audioTrack) {
      if (audioTrack.wholeRange) {
        if (currentSegmentIndex === 0) {
          stopVocalClip();
          startVocalClip(audioTrack.wholeRange, segmentStartTime);
        }
      } else if (audioTrack.sectionRanges && segment.isSectionRepeatStart) {
        stopVocalClip();
        const range = audioTrack.sectionRanges[sectionId];
        if (range) {
          const spanEnd = findRepeatSpanEnd(chordSegments, currentSegmentIndex);
          const sectionBeats = chordSegments
            .slice(currentSegmentIndex, spanEnd)
            .reduce((sum, seg) => sum + seg.slotCount / 4, 0);
          const sectionDurationSec = sectionBeats * (60 / getCurrentBpm());
          const clipDurationSec = range.endSec - range.startSec;
          const hardStopTime = segmentStartTime + Math.min(clipDurationSec, sectionDurationSec);
          startVocalClip(range, segmentStartTime, hardStopTime);
        }
      }
      applyVocalMute(transposition !== 0, segmentStartTime);
    }

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

    if (guitarSound?.sf2Instrument) ensureGuitarSoundfont(guitarSoundId, guitarSound.sf2Instrument)
    
    const midiNotes = chordToMidiNotes(chord).map(note => note + transposition);
    
    // Schedule chord change — track in schedule array for rAF-based visual sync. slotCount/
    // slotDuration are already resolved above (one chord === one segment, see
    // buildChordSegments), so this is the chord's real total duration, not an estimate.
    if (globalChordIndex !== lastChordIndex) {
      lastChordIndex = globalChordIndex;
      _chordSchedule.push({ audioTime: segmentStartTime, chordIndex: globalChordIndex, durationSec: slotCount * slotDuration });
      if (_chordSchedule.length > 500) _chordSchedule = _chordSchedule.slice(-250);
    }
    
    // Calculate segment duration for scheduling
    const segmentDuration = slotCount * slotDuration;
    
    // NO cache - always regenerate pattern to pick up live edits immediately
    const getPatternForBar = (barNum: number) => {
      return generateBarPattern(currentStyle, barNum, phraseLength, false, forceFill);
    };
    
    // Schedule each slot in this chord segment
    for (let i = 0; i < slotCount; i++) {
      // CRITICAL: patternSlot is based on GLOBAL position, not chord position
      // The rhythm pattern runs continuously regardless of chord changes
      const currentGlobalSlot = globalSlotIndex + i;
      const patternSlot = currentGlobalSlot % slotsPerBar;
      const slotTime = segmentStartTime + (i * slotDuration) + getSwingOffset(currentStyle, patternSlot, slotDuration);

      // Calculate bar number for fill logic based on GLOBAL slot position
      // This ensures fills happen at musically correct times (every 4 bars)
      // Bar changes every slotsPerBar slots (16 for 4/4, 12 for 6/8, etc.)
      const barNumber = Math.floor(currentGlobalSlot / slotsPerBar) + 1;
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
      
      // Schedule metronome on beat boundaries — one click per denominator unit
      // (every 4 slots/quarter in 4/4, every 2 slots/eighth in 6/8, etc.)
      const clickInterval = getMetronomeClickInterval(currentStyle);
      if (metronomeOn && masterGain && patternSlot % clickInterval === 0) {
        const beatInBar = Math.floor(patternSlot / clickInterval);
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
      
      // Piano - scale pattern (custom) or style pattern (fallback)
      const pianoScaleData = getPianoScale?.(sectionId);
      if (pianoScaleData && pianoState && isInstrumentAudible(pianoState, instruments) && pianoSound) {
        const { pattern: scalePattern, chordHit: pChordHit, loopBars: pLoopBars, octaveOffsets: pOctaveOffsets } = pianoScaleData;
        const slotInLoop = currentGlobalSlot % (pLoopBars * slotsPerBar);
        const scale = getBassScale_getScale(chord.quality);
        const noteDuration = slotDuration * 3;
        // Full chord hit — plays all chord tones (7th, 9th, etc. included)
        const chordHitVelocity = pChordHit?.[slotInLoop] ?? 0;
        if (chordHitVelocity > 0) {
          midiNotes.forEach(noteMidi => {
            playPianoNote(ctx, masterGain!, midiToFrequency(noteMidi), slotTime, noteDuration,
              pianoSound, pianoState.volume * currentStyle.volumes.piano * chordHitVelocity, noteMidi);
          });
        }
        for (const degStr of Object.keys(scalePattern)) {
          const deg = Number(degStr) as 1|2|3|4|5|6|7;
          const velocity = (scalePattern[deg]?.[slotInLoop] ?? 0);
          if (velocity <= 0) continue;
          const noteMidi = midiNotes[0] + scale[deg - 1] + (pOctaveOffsets?.[deg] ?? 0) * 12;
          playPianoNote(ctx, masterGain!, midiToFrequency(noteMidi), slotTime, noteDuration,
            pianoSound, pianoState.volume * currentStyle.volumes.piano * velocity, noteMidi);
        }
      } else {
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
      } // end piano scale else

      // Bass - scale pattern (custom) or style pattern (fallback)
      const bassScaleData = getBassScale?.(sectionId);
      if (bassScaleData && bassState && isInstrumentAudible(bassState, instruments) && bassSound) {
        const { pattern: scalePattern, loopBars, octaveOffsets: bOctaveOffsets } = bassScaleData;
        const loopSlots = loopBars * slotsPerBar;
        const slotInLoop = currentGlobalSlot % loopSlots;
        const scale = getBassScale_getScale(chord.quality);
        const noteDuration = slotDuration * 3;
        for (const degStr of Object.keys(scalePattern)) {
          const deg = Number(degStr) as 1|2|3|4|5|6|7;
          const degSlots = scalePattern[deg];
          if (!degSlots) continue;
          const velocity = degSlots[slotInLoop] ?? 0;
          if (velocity <= 0) continue;
          const noteMidi = midiNotes[0] + scale[deg - 1] + (bOctaveOffsets?.[deg] ?? 0) * 12;
          const bassVol = bassState.volume * currentStyle.volumes.bass * velocity;
          if (bassSound.useSamples && bassSound.samplePath) {
            scheduleSampledNoteByDir(ctx, masterGain!, bassSound.samplePath, noteMidi + (bassSound.octaveOffset ?? 0) * 12, slotTime, noteDuration, bassVol);
          } else {
            playBassNote(ctx, masterGain!, midiToFrequency(noteMidi), slotTime, noteDuration, bassSound, bassVol);
          }
        }
      } else {
        const bassVelocity = pattern.bass[patternSlot];
        if (bassState && isInstrumentAudible(bassState, instruments) && bassSound && bassVelocity > 0) {
          const bassNote = midiNotes[0];
          const noteDuration = slotDuration * 2;
          const bassVol = bassState.volume * currentStyle.volumes.bass * bassVelocity;
          if (bassSound.useSamples && bassSound.samplePath) {
            const adjustedMidi = bassNote + bassSound.octaveOffset * 12;
            scheduleSampledNoteByDir(ctx, masterGain!, bassSound.samplePath, adjustedMidi, slotTime, noteDuration, bassVol);
          } else {
            const frequency = midiToFrequency(bassNote);
            playBassNote(ctx, masterGain!, frequency, slotTime, noteDuration, bassSound, bassVol);
          }
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
      
      // Guitar - scale pattern (custom) or style pattern (fallback)
      const guitarScaleData = getGuitarScale?.(sectionId);
      if (guitarScaleData && guitarState && isInstrumentAudible(guitarState, instruments) && guitarSound) {
        const { pattern: scalePattern, chordHit: gChordHit, loopBars: gLoopBars, octaveOffsets: gOctaveOffsets } = guitarScaleData;
        const slotInLoop = currentGlobalSlot % (gLoopBars * slotsPerBar);
        const scale = getBassScale_getScale(chord.quality);
        const noteDuration = slotDuration * 3;
        // Full chord hit — plays all chord tones (7th, 9th, etc. included)
        const chordHitVelocity = gChordHit?.[slotInLoop] ?? 0;
        if (chordHitVelocity > 0) {
          midiNotes.forEach(noteMidi => {
            const vol = guitarState.volume * (currentStyle.volumes.guitar ?? currentStyle.volumes.piano) * chordHitVelocity;
            playGuitarNote(ctx, masterGain!, midiToFrequency(noteMidi), slotTime, noteDuration, guitarSound, vol, noteMidi);
          });
        }
        for (const degStr of Object.keys(scalePattern)) {
          const deg = Number(degStr) as 1|2|3|4|5|6|7;
          const velocity = (scalePattern[deg]?.[slotInLoop] ?? 0);
          if (velocity <= 0) continue;
          const noteMidi = midiNotes[0] + scale[deg - 1] + (gOctaveOffsets?.[deg] ?? 0) * 12;
          const vol = guitarState.volume * (currentStyle.volumes.guitar ?? currentStyle.volumes.piano) * velocity;
          playGuitarNote(ctx, masterGain!, midiToFrequency(noteMidi), slotTime, noteDuration, guitarSound, vol, noteMidi);
        }
      } else {
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
      } // end guitar scale else
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
      stopVocalClip();
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

  const slotsPerBar = getSlotsPerBar(style);
  const offlineTotalBars = Math.floor((totalBeats * 4) / slotsPerBar);
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
    const melodicBass   = style.melodic ? resolveVariation(style.melodic.bass,   section.bassVariationId)   : null;
    const melodicPiano  = style.melodic ? resolveVariation(style.melodic.piano,  section.pianoVariationId)  : null;
    const melodicGuitar = style.melodic ? resolveVariation(style.melodic.guitar, section.guitarVariationId) : null;

    for (let repeat = 0; repeat < section.repeatCount; repeat++) {
      section.chords.forEach(chord => {
        const midiNotes = chordToMidiNotes(chord).map(note => note + transposition);
        const chordStartTime = currentTime;
        
        // Calculate exact slot count based on chord duration
        const slotCount = chord.duration * 4; // 4 slots per beat
        
        // Process each slot in this chord
        for (let i = 0; i < slotCount; i++) {
          // CRITICAL: patternSlot and barNumber are based on GLOBAL position
          // The rhythm pattern runs continuously regardless of chord changes
          const currentGlobalSlot = globalSlotIndex + i;
          const patternSlot = currentGlobalSlot % slotsPerBar;
          const slotTime = chordStartTime + (i * slotDuration) + getSwingOffset(style, patternSlot, slotDuration);

          // Bar changes every slotsPerBar slots (16 for 4/4, 12 for 6/8, etc.)
          const barNumber = Math.floor(currentGlobalSlot / slotsPerBar) + 1;
          
          // Get cached pattern for this bar
          const pattern = getPatternForBar(barNumber);
          
          // Piano - melodic scale or style pattern (fallback)
          const pianoVelocity = pattern.piano[patternSlot];
          const playOfflinePianoNote = (midiNote: number, noteTime: number, noteDuration: number, noteVolume?: number) => {
            if (!pianoState || !pianoSound) return;
            const frequency = midiToFrequency(midiNote);
            const volume = noteVolume ?? pianoState.volume * style.volumes.piano * pianoVelocity;
              
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

          if (melodicPiano && pianoState && !pianoState.muted && pianoSound) {
            const { pattern: scalePattern, loopBars: pLoopBars, octaveOffsets: pOctaveOffsets } = melodicPiano;
            const slotInLoop = currentGlobalSlot % (pLoopBars * slotsPerBar);
            const scale = getBassScale_getScale(chord.quality);
            const noteDuration = slotDuration * 3;
            for (const degStr of Object.keys(scalePattern)) {
              const deg = Number(degStr) as 1|2|3|4|5|6|7;
              const velocity = scalePattern[deg]?.[slotInLoop] ?? 0;
              if (velocity <= 0) continue;
              const noteMidi = midiNotes[0] + scale[deg - 1] + (pOctaveOffsets?.[deg] ?? 0) * 12;
              playOfflinePianoNote(noteMidi, slotTime, noteDuration, pianoState.volume * style.volumes.piano * velocity);
            }
          } else if (pianoState && !pianoState.muted && pianoSound && pianoVelocity > 0) {
            const pianoArpeggio = style.arpeggios?.piano?.[patternSlot] ?? null;
            if (pianoArpeggio && midiNotes.length > 1) {
              const orderedNotes = applyArpeggioOrder(midiNotes, pianoArpeggio.type);
              const notesPerSlot = getArpeggioNotesPerSlot(pianoArpeggio.speed);
              const arpeggioNoteDuration = slotDuration / notesPerSlot;
              for (let j = 0; j < notesPerSlot; j++) {
                const noteTime = slotTime + (j * arpeggioNoteDuration);
                playOfflinePianoNote(orderedNotes[j % orderedNotes.length], noteTime, arpeggioNoteDuration * 1.5);
              }
            } else {
              midiNotes.forEach(midiNote => playOfflinePianoNote(midiNote, slotTime, slotDuration * 3));
            }
          }

          // Bass - melodic scale or style pattern (fallback)
          const bassVelocity = pattern.bass[patternSlot];
          if (melodicBass && bassState && !bassState.muted && bassSound) {
            const { pattern: scalePattern, loopBars: bLoopBars, octaveOffsets: bOctaveOffsets } = melodicBass;
            const slotInLoop = currentGlobalSlot % (bLoopBars * slotsPerBar);
            const scale = getBassScale_getScale(chord.quality);
            const noteDuration = slotDuration * 3;
            for (const degStr of Object.keys(scalePattern)) {
              const deg = Number(degStr) as 1|2|3|4|5|6|7;
              const velocity = scalePattern[deg]?.[slotInLoop] ?? 0;
              if (velocity <= 0) continue;
              const noteMidi = midiNotes[0] + scale[deg - 1] + (bOctaveOffsets?.[deg] ?? 0) * 12;
              const vol = bassState.volume * style.volumes.bass * velocity;
              if (bassSound.useSamples && bassSound.samplePath) {
                offlineBassPromises.push(
                  scheduleSampledNoteByDirAsync(offlineCtx, offlineMasterGain, bassSound.samplePath, noteMidi + (bassSound.octaveOffset ?? 0) * 12, slotTime, noteDuration, vol)
                );
              } else {
                const baseFreq = midiToFrequency(noteMidi) * Math.pow(2, bassSound.octaveOffset);
                const bassGain = offlineCtx.createGain();
                const filter = offlineCtx.createBiquadFilter();
                filter.type = 'lowpass'; filter.frequency.value = 800;
                filter.connect(bassGain); bassGain.connect(offlineMasterGain);
                const mainOsc = offlineCtx.createOscillator();
                mainOsc.type = bassSound.oscillatorType; mainOsc.frequency.value = baseFreq;
                const mainOscGain = offlineCtx.createGain(); mainOscGain.gain.value = 0.2 * vol;
                mainOsc.connect(mainOscGain); mainOscGain.connect(filter);
                const subOsc = offlineCtx.createOscillator();
                subOsc.type = 'sine'; subOsc.frequency.value = baseFreq / 2;
                const subOscGain = offlineCtx.createGain(); subOscGain.gain.value = 0.15 * vol;
                subOsc.connect(subOscGain); subOscGain.connect(filter);
                bassGain.gain.setValueAtTime(0, slotTime);
                bassGain.gain.linearRampToValueAtTime(1, slotTime + bassSound.attackTime);
                bassGain.gain.linearRampToValueAtTime(bassSound.sustainLevel, slotTime + bassSound.attackTime + bassSound.decayTime);
                bassGain.gain.linearRampToValueAtTime(0, slotTime + noteDuration);
                mainOsc.start(slotTime); subOsc.start(slotTime);
                mainOsc.stop(slotTime + noteDuration + 0.1); subOsc.stop(slotTime + noteDuration + 0.1);
              }
            }
          } else if (bassState && !bassState.muted && bassSound && bassVelocity > 0) {
            const bassNote = midiNotes[0];
            const volume = bassState.volume * style.volumes.bass * bassVelocity;
            const noteDuration = slotDuration * 2;
            if (bassSound.useSamples && bassSound.samplePath) {
              offlineBassPromises.push(
                scheduleSampledNoteByDirAsync(offlineCtx, offlineMasterGain, bassSound.samplePath, bassNote + bassSound.octaveOffset * 12, slotTime, noteDuration, volume)
              );
            } else {
              const baseFreq = midiToFrequency(bassNote) * Math.pow(2, bassSound.octaveOffset);
              const bassGain = offlineCtx.createGain();
              const filter = offlineCtx.createBiquadFilter();
              filter.type = 'lowpass'; filter.frequency.value = 800;
              filter.connect(bassGain); bassGain.connect(offlineMasterGain);
              const mainOsc = offlineCtx.createOscillator();
              mainOsc.type = bassSound.oscillatorType; mainOsc.frequency.value = baseFreq;
              const mainOscGain = offlineCtx.createGain(); mainOscGain.gain.value = 0.2 * volume;
              mainOsc.connect(mainOscGain); mainOscGain.connect(filter);
              const subOsc = offlineCtx.createOscillator();
              subOsc.type = 'sine'; subOsc.frequency.value = baseFreq / 2;
              const subOscGain = offlineCtx.createGain(); subOscGain.gain.value = 0.15 * volume;
              subOsc.connect(subOscGain); subOscGain.connect(filter);
              bassGain.gain.setValueAtTime(0, slotTime);
              bassGain.gain.linearRampToValueAtTime(1, slotTime + bassSound.attackTime);
              bassGain.gain.linearRampToValueAtTime(bassSound.sustainLevel, slotTime + bassSound.attackTime + bassSound.decayTime);
              bassGain.gain.linearRampToValueAtTime(0, slotTime + noteDuration);
              mainOsc.start(slotTime); subOsc.start(slotTime);
              mainOsc.stop(slotTime + noteDuration + 0.1); subOsc.stop(slotTime + noteDuration + 0.1);
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
          
          // Guitar - melodic scale or style pattern (fallback)
          const guitarVelocity = (pattern as any).guitar?.[patternSlot] ?? 0;
          if (melodicGuitar && guitarState && !guitarState.muted && guitarSound) {
            const { pattern: scalePattern, loopBars: gLoopBars, octaveOffsets: gOctaveOffsets } = melodicGuitar;
            const slotInLoop = currentGlobalSlot % (gLoopBars * slotsPerBar);
            const scale = getBassScale_getScale(chord.quality);
            const noteDuration = slotDuration * 3;
            for (const degStr of Object.keys(scalePattern)) {
              const deg = Number(degStr) as 1|2|3|4|5|6|7;
              const velocity = scalePattern[deg]?.[slotInLoop] ?? 0;
              if (velocity <= 0) continue;
              const noteMidi = midiNotes[0] + scale[deg - 1] + (gOctaveOffsets?.[deg] ?? 0) * 12;
              const guitarVolume = guitarState.volume * (style.volumes.guitar ?? style.volumes.piano) * velocity;
              const samplePath = guitarSound.samplePath;
              if (guitarSound.useSamples && samplePath && guitarSamples[samplePath]) {
                const match = findClosestGuitarSample(samplePath, noteMidi);
                if (match && guitarSamples[samplePath][match.noteKey]) {
                  const sample = guitarSamples[samplePath][match.noteKey]!;
                  const source = offlineCtx.createBufferSource();
                  const gainNode = offlineCtx.createGain();
                  source.buffer = sample;
                  if (match.pitchAdjust !== 0) source.playbackRate.value = Math.pow(2, match.pitchAdjust / 12);
                  source.connect(gainNode); gainNode.connect(offlineMasterGain);
                  gainNode.gain.setValueAtTime(guitarVolume * 0.8, slotTime);
                  const releaseStart = slotTime + Math.max(0, noteDuration - 0.15);
                  gainNode.gain.setValueAtTime(guitarVolume * 0.8, releaseStart);
                  gainNode.gain.linearRampToValueAtTime(0, slotTime + noteDuration + 0.2);
                  source.start(slotTime);
                  source.stop(slotTime + Math.max(noteDuration + 0.3, sample.duration / (source.playbackRate.value || 1)));
                }
              } else {
                const gainNode = offlineCtx.createGain();
                gainNode.connect(offlineMasterGain);
                [{ freq: 1, amp: 1.0 }, { freq: 2, amp: 0.5 }, { freq: 3, amp: 0.3 }].forEach(({ freq, amp }) => {
                  const osc = offlineCtx.createOscillator();
                  const oscGain = offlineCtx.createGain();
                  osc.type = freq === 1 ? 'triangle' : 'sine';
                  osc.frequency.value = midiToFrequency(noteMidi) * freq;
                  oscGain.gain.value = amp * 0.12 * guitarVolume;
                  osc.connect(oscGain); oscGain.connect(gainNode);
                  osc.start(slotTime); osc.stop(slotTime + noteDuration + 0.1);
                });
                gainNode.gain.setValueAtTime(0, slotTime);
                gainNode.gain.linearRampToValueAtTime(1, slotTime + 0.01);
                gainNode.gain.linearRampToValueAtTime(0.6, slotTime + 0.1);
                gainNode.gain.setValueAtTime(0.6, slotTime + noteDuration - 0.1);
                gainNode.gain.linearRampToValueAtTime(0, slotTime + noteDuration);
              }
            }
          } else if (guitarState && !guitarState.muted && guitarSound && guitarVelocity > 0) {
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
  clearChordSchedule();
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
    // Soundfont players/loading promises are bound to the AudioContext we just closed —
    // reusing them on the next play() would silently produce no sound. Drop the cache so
    // ensureGuitarSoundfont() re-creates fresh players against the next context.
    sfGuitarPlayers.clear();
    sfGuitarLoadings.clear();
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
