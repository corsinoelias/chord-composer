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
  // sample-player's `notes.js` wrapper remaps buffers to be keyed by MIDI note number
  // (string) — see playGuitarSampleSF2 below, which reads these directly to bypass
  // sample-player/adsr's heavier per-note node graph.
  buffers?: Record<string, AudioBuffer>
}
const SF2_GAIN = 4.0 // soundfont MP3s are recorded at ~-18dBFS; boost to match local sample levels

// soundfont-player (guitar SF2 playback) uses the `sample-player` + `adsr` packages under the
// hood. `adsr`'s envelope generator creates a fresh 2-sample "voltage" AudioBuffer via
// `context.createBuffer(1, 2, sampleRate)` on EVERY single note — even though its content is
// always the same constant [1, 1] signal (see node_modules/adsr/index.js's getVoltage()). A
// real-device measurement attributed ~70% of scheduleSegment's per-call cost to guitar note
// creation specifically because of this pattern (guitar goes through this heavier node-creation
// path; piano/bass use hand-rolled envelopes that just automate a GainNode's AudioParam
// directly, no extra buffer/source per note). This patch intercepts exactly that one call
// signature — (channels=1, length=2) — and returns a per-context cached buffer instead of
// allocating+copying a new one each time. Narrowly scoped by exact argument match so it can't
// affect any other legitimate `createBuffer` call in the app or its dependencies.
const _voltageBufferCache = new WeakMap<AudioContext, AudioBuffer>();
function patchAudioContextVoltageBufferCaching(): void {
  if (typeof AudioContext === 'undefined') return;
  const proto = AudioContext.prototype as AudioContext & { __voltageBufferPatched?: boolean };
  if (proto.__voltageBufferPatched) return;
  proto.__voltageBufferPatched = true;
  const origCreateBuffer = AudioContext.prototype.createBuffer;
  AudioContext.prototype.createBuffer = function (this: AudioContext, numberOfChannels: number, length: number, sampleRate: number) {
    if (numberOfChannels === 1 && length === 2) {
      const cached = _voltageBufferCache.get(this);
      if (cached) return cached;
      const buffer = origCreateBuffer.call(this, 1, 2, sampleRate);
      buffer.getChannelData(0).set([1, 1]);
      _voltageBufferCache.set(this, buffer);
      return buffer;
    }
    return origCreateBuffer.call(this, numberOfChannels, length, sampleRate);
  };
}
patchAudioContextVoltageBufferCaching();

/**
 * Cuánto antes del primer sonido arranca la reproducción. El scheduler ya no se re-agenda
 * con setTimeout: lo mueve un reloj de ticks de 25 ms (engine/clock.ts), que es donde vive
 * ahora la ventana de lookahead. Esta constante solo fija el desfase inicial, para que el
 * primer acorde tenga margen de programarse antes de sonar.
 *
 * Vale lo mismo (300 ms) y por la misma razón histórica: una traza real bajo throttling de
 * CPU ×4 midió callbacks de setTimeout llegando hasta 2,85 s tarde durante re-renders de
 * React provocados por interacción normal. El modo de fallo es el de "A Tale of Two Clocks":
 * si el callback llega después del instante previsto, Web Audio reproduce mal la nota o la
 * descarta. Ver el clamp en enterSegment, que se auto-recupera si aun así pasa.
 */
const SCHEDULE_LOOKAHEAD_SEC = 0.3;
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
    // Onto the guitar bus, so the mixer's guitar fader applies to SF2 sounds too.
    const dest = getBus(audioContext!, 'guitar') ?? masterGain
    if (dest) player.connect(dest)
    sfGuitarPlayers.set(soundTypeId, player)
  })()
  // A failed load must not stay in the map: the guard at the top treats any entry as "already
  // loading", so one bad network moment would leave this sound on the synth fallback for the
  // rest of the session with no way back. Dropping it lets the next play() try again.
  loading.catch(() => sfGuitarLoadings.delete(soundTypeId))
  sfGuitarLoadings.set(soundTypeId, loading)
}

// Kicks off (or reuses) the soundfont load and waits for it to fully finish before returning.
// Callers should await this BEFORE flipping any "now playing" state — nothing (audio or the
// chord-duration dots) should start until the real sample is ready; there's no early bailout
// here on purpose.
//
// The 2.5s timeout used to be load-bearing: stop() closed the AudioContext, so every section
// change re-decoded this soundfont from scratch and a long timeout read as "it just
// stopped". Stop no longer closes the context (see stopPlayback), so a loaded soundfont now
// survives for the session and this is back to being what it says on the tin — a guard
// against a genuinely stuck network request, on the first load only.
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
import { type InstrumentState, type InstrumentType, getSoundType, type SoundType, isInstrumentAudible } from './instruments';
import { scheduleSampledNoteByDir, scheduleSampledNoteByDirAsync, preloadSampleDir, stopAllSampledNodes, isSampleDirUnavailable } from './bassTab/sampleEngine';
import { type StylePattern, generateBarPattern, getSlotsPerBar, getMetronomeClickInterval, getSwingOffset } from './styles';
import { type Section } from './sections';
import { buildEffectsChain } from './audioEffects';
import { createMixer, getBus, setBusLevel } from './engine/mixer';
import { buildSlotEvents } from './engine/eventBuilder';
import { setLiveContext, trackVoice, stopAllVoices, activeVoiceCount } from './engine/voiceManager';
import { startClock } from './engine/clock';
import { type MusicalEvent } from './engine/types';
import { resolveVariation } from './bassScale';

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

// 16th-note playhead schedule, same rAF-read contract as _chordSchedule above: the
// scheduler publishes when each slot lands, the UI derives "which step is lit" from
// ctx.currentTime. Capped because it grows one entry per 16th note for as long as
// playback runs — only the entries around `now` are ever read.
let _stepSchedule: { audioTime: number; patternSlot: number }[] = [];

export function getStepSchedule(): { audioTime: number; patternSlot: number }[] {
  return _stepSchedule;
}

/**
 * Pushes each instrument's level onto its mixer bus. Notes carry only velocity, so this is
 * what a fader, a mute or a solo actually changes.
 *
 * The scheduler calls this once per segment so it stays correct on its own, but that alone
 * would leave a fader move waiting up to a whole chord to be heard — which is the delay
 * this phase exists to remove. So the UI calls it too, the moment the user changes
 * something (see updatePlaybackOptions in PlaybackContext). Cheap and idempotent: it is a
 * short AudioParam ramp per bus, and re-applying the same value is inaudible.
 *
 * A muted instrument gets level 0 here AND stops being scheduled by the scheduler, so
 * muting is instant while unmuting still waits for the next segment. See the note at the
 * mixer block in scheduleProgression.
 */
export function applyMixerLevels(instruments: InstrumentState[], style: StylePattern): void {
  if (!audioContext) return;
  const levelFor = (id: InstrumentType, styleVolume: number): number => {
    const state = instruments.find(i => i.id === id);
    if (!state || !isInstrumentAudible(state, instruments)) return 0;
    return state.volume * styleVolume;
  };
  setBusLevel(audioContext, 'piano', levelFor('piano', style.volumes.piano));
  setBusLevel(audioContext, 'bass', levelFor('bass', style.volumes.bass));
  setBusLevel(audioContext, 'drums', levelFor('drums', style.volumes.drums));
  // Guitar has no style volume of its own in older styles — it borrows piano's.
  setBusLevel(audioContext, 'guitar', levelFor('guitar', style.volumes.guitar ?? style.volumes.piano));
}

export function clearChordSchedule(): void {
  _chordSchedule = [];
  _stepSchedule = [];
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

    // Per-instrument buses feed masterGain, so instrument level is an AudioParam on the
    // graph rather than a number baked into each note. See engine/mixer.ts.
    createMixer(audioContext, masterGain);

    // From here on every source this engine creates gets registered, so Stop can silence
    // them individually instead of destroying the context they live in.
    setLiveContext(audioContext);

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
      const source = newSource(ctx);
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
      const osc = newOscillator(ctx);
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
 * Fuentes sonoras registradas en el voiceManager al crearse, para que stopPlayback() pueda
 * pararlas sin cerrar el AudioContext. trackVoice ignora las de contextos que no sean el
 * vivo, asi que los renders offline pasan por aqui sin quedar registrados.
 */
function newSource(ctx: BaseAudioContext): AudioBufferSourceNode {
  const node = ctx.createBufferSource();
  trackVoice(ctx, node);
  return node;
}

function newOscillator(ctx: BaseAudioContext): OscillatorNode {
  const node = ctx.createOscillator();
  trackVoice(ctx, node);
  return node;
}

/**
 * Plays a piano sample with envelope
 */
function playPianoSample(
  ctx: BaseAudioContext,
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
  
  const source = newSource(ctx);
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
  ctx: BaseAudioContext,
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
    const osc = newOscillator(ctx);
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
  ctx: BaseAudioContext,
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
  ctx: BaseAudioContext,
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
  
  const source = newSource(ctx);
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
  ctx: BaseAudioContext,
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
    const osc = newOscillator(ctx);
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
 * Plays the SAME sample buffers soundfont-player already decoded (sfPlayer.buffers, keyed
 * by MIDI note — see sample-player's notes.js) through a minimal 2-node graph (BufferSource
 * -> Gain, direct AudioParam automation), instead of routing through sample-player/adsr's
 * ~8-node-per-note voltage-controlled envelope. A real-device measurement attributed ~70%
 * of scheduleSegment's per-call cost to guitar note creation specifically because of that
 * heavier path (see the voltage-buffer-cache patch above, which helps but doesn't eliminate
 * it — this bypasses it entirely). Measured ~70-77% lower guitar cost on real-device traces
 * after switching to this path; approximates soundfont-player's default envelope (attack
 * 0.01s, decay 0.1s to sustain 0.9, release 0.3s) with direct ramps — verified by ear to
 * sound equivalent, not just by the timing numbers.
 */
function playGuitarSampleSF2(
  ctx: BaseAudioContext,
  destination: AudioNode,
  sfPlayer: SfPlayer,
  midiNote: number,
  startTime: number,
  duration: number,
  volume: number
): void {
  const buffers = sfPlayer.buffers
  if (!buffers) return
  let sample = buffers[String(midiNote)]
  let semitoneShift = 0
  if (!sample) {
    for (let offset = 1; offset <= 12 && !sample; offset++) {
      const down = buffers[String(midiNote - offset)]
      if (down) { sample = down; semitoneShift = offset; break }
      const up = buffers[String(midiNote + offset)]
      if (up) { sample = up; semitoneShift = -offset; break }
    }
  }
  if (!sample) return

  const source = newSource(ctx)
  source.buffer = sample
  if (semitoneShift !== 0) source.playbackRate.value = Math.pow(2, semitoneShift / 12)

  const gain = ctx.createGain()
  source.connect(gain)
  gain.connect(destination)

  const attack = 0.01, release = 0.3, peak = volume * 0.8 * SF2_GAIN
  gain.gain.setValueAtTime(0, startTime)
  gain.gain.linearRampToValueAtTime(peak, startTime + attack)
  const releaseStart = Math.max(startTime + attack, startTime + duration - release)
  gain.gain.setValueAtTime(peak * 0.9, releaseStart) // ~sustain level (0.9, matching soundfont-player's default)
  gain.gain.linearRampToValueAtTime(0, releaseStart + release)

  source.start(startTime)
  source.stop(releaseStart + release + 0.05)
}

/**
 * Main guitar note function - uses samples or synthesis based on sound type
 */
function playGuitarNote(
  ctx: BaseAudioContext,
  destination: AudioNode,
  frequency: number,
  startTime: number,
  duration: number,
  soundType: SoundType,
  volume: number,
  midiNote?: number
): void {
  if (soundType.sf2Instrument && midiNote !== undefined) {
    // Works offline too. The SF2 *player* is bound to the context it was built with, but
    // playGuitarSampleSF2 never calls into it — it reads player.buffers and builds its own
    // nodes. AudioBuffers are plain decoded data, usable from any context (the browser
    // resamples if the rates differ), so an offline render can borrow the live player's
    // buffers. Until this, the export silently substituted a synth tone for all eight
    // sf2-* guitars: what you exported was not what you heard.
    const sfPlayer = sfGuitarPlayers.get(soundType.id)
    if (sfPlayer?.buffers) {
      playGuitarSampleSF2(ctx, destination, sfPlayer, midiNote, startTime, duration, volume)
    } else {
      // Only the live context can kick off a load; an offline render is synchronous from
      // here on, so it must have been preloaded (renderProgressionOffline awaits it).
      if (ctx === audioContext) ensureGuitarSoundfont(soundType.id, soundType.sf2Instrument)
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
  ctx: BaseAudioContext,
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
  const mainOsc = newOscillator(ctx);
  mainOsc.type = soundType.oscillatorType;
  mainOsc.frequency.value = baseFreq;
  
  // Sub oscillator (one octave down)
  const subOsc = newOscillator(ctx);
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
  ctx: BaseAudioContext,
  destination: AudioNode,
  buffer: AudioBuffer,
  startTime: number,
  volume: number
): void {
  const source = newSource(ctx);
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
  ctx: BaseAudioContext,
  destination: AudioNode,
  startTime: number,
  soundType: SoundType,
  volume: number,
  drumType: 'kick' | 'snare' | 'snareStick' | 'hihat' | 'hihatOpen' | 'hihatFoot' | 'tom1' | 'tom2' | 'floorTom' | 'ride' | 'crash',
  // Which decoded kit to pull samples from. The live path uses the module-level
  // kit; an offline render passes its own, decoded into the offline context.
  kit: Partial<AcousticKitSamples> = acousticKit
): void {
  const gainNode = ctx.createGain();
  gainNode.connect(destination);
  const useAcousticSamples = soundType.id === 'standard';
  
  if (drumType === 'kick') {
    if (useAcousticSamples && kit.kick) {
      playSample(ctx, gainNode, kit.kick, startTime, volume * 1.1);
    } else {
      // Synthesized kick
      const osc = newOscillator(ctx);
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
      
      const click = newOscillator(ctx);
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
    if (useAcousticSamples && kit.snare) {
      playSample(ctx, gainNode, kit.snare, startTime, volume * 1.0);
    } else {
      // Synthesized snare
      const bufferSize = ctx.sampleRate * 0.2;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = newSource(ctx);
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
      
      const osc = newOscillator(ctx);
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
    if (useAcousticSamples && kit.snareStick) {
      playSample(ctx, gainNode, kit.snareStick, startTime, volume * 0.7);
    } else {
      // Synthesized rim click
      const osc = newOscillator(ctx);
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
    if (useAcousticSamples && kit.hihat) {
      playSample(ctx, gainNode, kit.hihat, startTime, volume * 0.7);
    } else {
      // Synthesized hi-hat
      const bufferSize = ctx.sampleRate * 0.1;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = newSource(ctx);
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
      const openSamples = [kit.hihatOpen, kit.hihatOpen2, kit.hihatOpen3].filter(s => s !== null);
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
      const noise = newSource(ctx);
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
    if (useAcousticSamples && kit.hihatFoot2) {
      playSample(ctx, gainNode, kit.hihatFoot2, startTime, volume * 0.6);
    } else if (useAcousticSamples && kit.hihatFoot) {
      playSample(ctx, gainNode, kit.hihatFoot, startTime, volume * 0.6);
    } else {
      // Synthesized foot hi-hat (shorter, more muffled)
      const bufferSize = ctx.sampleRate * 0.08;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = newSource(ctx);
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
    if (useAcousticSamples && kit.tom1) {
      playSample(ctx, gainNode, kit.tom1, startTime, volume * 1.0);
    } else {
      // Synthesized high tom
      const osc = newOscillator(ctx);
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
    if (useAcousticSamples && kit.tom2) {
      playSample(ctx, gainNode, kit.tom2, startTime, volume * 1.0);
    } else {
      // Synthesized mid tom
      const osc = newOscillator(ctx);
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
    if (useAcousticSamples && kit.floorTom) {
      playSample(ctx, gainNode, kit.floorTom, startTime, volume * 1.0);
    } else {
      // Synthesized floor tom
      const osc = newOscillator(ctx);
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
    if (useAcousticSamples && kit.ride) {
      playSample(ctx, gainNode, kit.ride, startTime, volume * 0.75);
    } else {
      // Synthesized ride
      const bufferSize = ctx.sampleRate * 0.3;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = newSource(ctx);
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
    if (useAcousticSamples && kit.crash) {
      playSample(ctx, gainNode, kit.crash, startTime, volume * 0.9);
    } else {
      // Synthesized crash
      const bufferSize = ctx.sampleRate * 0.8;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = newSource(ctx);
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
  ctx: BaseAudioContext,
  destination: AudioNode,
  startTime: number,
  isDownbeat: boolean = false
): void {
  const osc = newOscillator(ctx);
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
 * Where a batch of events should be rendered. The two callers differ only in these
 * details, which is the whole reason the split between building and dispatching exists.
 */
interface DispatchTargets {
  buses: Record<'piano' | 'bass' | 'drums' | 'guitar', AudioNode>;
  sounds: {
    piano: SoundType | null;
    bass: SoundType | null;
    drums: SoundType | null;
    guitar: SoundType | null;
  };
  /** Drum samples decoded for this context. Defaults to the live acousticKit. */
  kit?: Partial<AcousticKitSamples>;
  /**
   * When present, sampled bass is scheduled through the async loader and its promises are
   * collected here. An offline render MUST await them before startRendering(); the live
   * path has no such barrier and uses the synchronous variant.
   */
  pending?: Promise<void>[];
}

/**
 * Renders events into Web Audio nodes. The only place that knows how an event becomes
 * sound — shared by live playback and the offline render so the two cannot drift.
 */
function dispatchEvents(ctx: BaseAudioContext, events: MusicalEvent[], t: DispatchTargets): void {
  for (const ev of events) {
    if (ev.kind === 'drum') {
      if (!t.sounds.drums) continue;
      playDrumHit(ctx, t.buses.drums, ev.time, t.sounds.drums, ev.velocity, ev.piece, t.kit ?? acousticKit);
      continue;
    }

    switch (ev.instrument) {
      case 'piano': {
        const sound = t.sounds.piano;
        if (!sound) break;
        playPianoNote(ctx, t.buses.piano, midiToFrequency(ev.midi), ev.time, ev.durationSec, sound, ev.velocity, ev.midi);
        break;
      }
      case 'guitar': {
        const sound = t.sounds.guitar;
        if (!sound) break;
        playGuitarNote(ctx, t.buses.guitar, midiToFrequency(ev.midi), ev.time, ev.durationSec, sound, ev.velocity, ev.midi);
        break;
      }
      case 'bass': {
        const sound = t.sounds.bass;
        if (!sound) break;
        // Si ya sabemos que el banco no está disponible (red caída, servidor reiniciando),
        // se usa el sintetizador. Antes el bajo simplemente enmudecía: es el único
        // instrumento sin fallback, porque su ruta sampleada vive en sampleEngine y no sabe
        // nada de síntesis. El piano y la guitarra sí caen a síntesis por su cuenta.
        if (sound.useSamples && sound.samplePath && !isSampleDirUnavailable(sound.samplePath)) {
          // Octave offset is a property of the sound, not of the note, so it is applied
          // here rather than in the builder. The synth path below does the same thing
          // inside playBassNote, via soundType.octaveOffset.
          const midi = ev.midi + (sound.octaveOffset ?? 0) * 12;
          if (t.pending) {
            t.pending.push(
              scheduleSampledNoteByDirAsync(ctx, t.buses.bass, sound.samplePath, midi, ev.time, ev.durationSec, ev.velocity)
            );
          } else {
            scheduleSampledNoteByDir(ctx, t.buses.bass, sound.samplePath, midi, ev.time, ev.durationSec, ev.velocity);
          }
        } else {
          playBassNote(ctx, t.buses.bass, midiToFrequency(ev.midi), ev.time, ev.durationSec, sound, ev.velocity);
        }
        break;
      }
    }
  }
}

export interface PlaybackOptions {
  loop?: boolean;
  metronome?: boolean;
  instruments: InstrumentState[];
  style: StylePattern;
  transposition?: number;
  onLoopEnd?: () => void;
  // Called once when a NON-looping schedule (loop: false) reaches its natural end, so a
  // caller that deliberately opted out of looping (e.g. "play this section once") can react
  // — the engine itself just stops scheduling further segments and otherwise goes silent.
  onEnded?: () => void;
  // The playhead is NOT a callback: read getStepSchedule() from a rAF loop instead. A
  // per-slot callback means a per-slot timer, which is what starved the scheduler.
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
  // Manual mute/volume for the vocal track (mixer's "Voz" channel), OR'd with/independent of
  // the automatic transpose-based mute above — see isVocalEffectivelyMuted below.
  getVocalMuted?: () => boolean;
  getVocalVolume?: () => number;
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
    onLoopEnd,
    onEnded,
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
    getVocalMuted,
    getVocalVolume,
  } = options;

  const ctx = getAudioContext();
  const startTime = ctx.currentTime + SCHEDULE_LOOKAHEAD_SEC;
  const beatDuration = 60 / bpm;
  const slotDuration = beatDuration / 4; // 16th note duration — used only for totalDuration estimate
  const getCurrentBpm = () => getBpmGetter ? getBpmGetter() : bpm;
  
  let cancelled = false;
  
  // Get sound types for each instrument (initial values, will be read dynamically in enterSegment)
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
  // Effective mute = forced (transposed, can't follow the pitch shift) OR the mixer's manual
  // "Voz" mute — either one alone is enough to silence it, so this is always an OR, never a
  // replacement of the other.
  const isVocalForcedMuted = () => getCurrentTransposition() !== 0;
  const getUserVocalMuted = () => getVocalMuted ? getVocalMuted() : false;
  const getUserVocalVolume = () => getVocalVolume ? getVocalVolume() : 1;
  const isVocalEffectivelyMuted = () => isVocalForcedMuted() || getUserVocalMuted();
  let vocalMuted = isVocalEffectivelyMuted();

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
    const source = newSource(ctx);
    source.buffer = audioTrack.buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vocalMuted ? 0 : getUserVocalVolume(), when);
    source.connect(gain).connect(ctx.destination);
    source.start(when, range.startSec, clipDuration);
    if (hardStopTime !== undefined && hardStopTime < when + clipDuration - 0.001) {
      source.stop(Math.max(when, hardStopTime));
    }
    vocalSource = source;
    vocalGain = gain;
  };

  // Ramps (not hard-cuts) the currently playing clip's gain when the effective mute (forced-
  // by-transposition OR user's manual Voz mute) flips, so toggling either doesn't click/pop.
  const applyVocalMute = (muted: boolean, when: number) => {
    if (muted === vocalMuted) return;
    vocalMuted = muted;
    if (!vocalGain) return;
    vocalGain.gain.cancelScheduledValues(when);
    vocalGain.gain.setValueAtTime(vocalGain.gain.value, when);
    vocalGain.gain.linearRampToValueAtTime(muted ? 0 : getUserVocalVolume(), when + 0.05);
  };

  // Ramps the currently playing clip's gain toward a new fader level while unmuted — a
  // separate function from applyVocalMute because a volume drag shouldn't flip vocalMuted or
  // fight the mute ramp; muted always wins (volume applies once unmuted again).
  const applyVocalVolume = (volume: number, when: number) => {
    if (!vocalGain || vocalMuted) return;
    vocalGain.gain.cancelScheduledValues(when);
    vocalGain.gain.setValueAtTime(vocalGain.gain.value, when);
    vocalGain.gain.linearRampToValueAtTime(volume, when + 0.05);
  };

  // Reference used to detect section changes between chord boundaries
  let lastKnownSections: Section[] | null = getSections ? getSections() : null;

  // Schedule a batch of slots (one chord segment at a time for efficiency)
  /**
   * Estado del acorde en curso. `null` significa "hay que entrar en el siguiente".
   * Es el puntero del loop: avanzar es mover índices, no reconstruir nada.
   */
  let active: {
    segmentStartTime: number; slotCount: number; slotDuration: number; slotsPerBar: number;
    currentStyle: StylePattern; instruments: InstrumentState[]; transposition: number;
    metronomeOn: boolean; midiNotes: number[]; sectionId: string; chord: Chord;
    getPatternForBar: (barNum: number) => ReturnType<typeof generateBarPattern>;
    pianoSound: SoundType | null; bassSound: SoundType | null;
    drumsSound: SoundType | null; guitarSound: SoundType | null;
    pianoAudible: boolean; bassAudible: boolean; drumsAudible: boolean; guitarAudible: boolean;
    pianoBus: AudioNode; bassBus: AudioNode; drumsBus: AudioNode; guitarBus: AudioNode;
  } | null = null;
  let slotInSegment = 0;
  let nextSegmentTime = 0;

  /**
   * Prepara el siguiente acorde: relee estilo/BPM/instrumentos, recoge cambios de sección,
   * resuelve buses y sonidos. Devuelve false si no hay nada que programar.
   */
  const enterSegment = (segmentStartTime: number): boolean => {
    if (cancelled) return false;
    // Auto-recuperación: si el tick llegó tan tarde que el acorde ya debería haber empezado,
    // programarlo en el pasado lo reproduce mal o lo descarta en silencio. Se adelanta a
    // "ahora". Con ticks de 25 ms esto salta mucho menos que con un setTimeout por acorde,
    // porque el margen que hay que perder para llegar tarde es el mismo pero las
    // oportunidades de recuperarse son 12 veces más frecuentes.
    if (segmentStartTime < ctx.currentTime) {
      segmentStartTime = ctx.currentTime + 0.01;
    }
    // Context-consistency guard: stopPlayback() closes the AudioContext and nulls
    // masterGain, and the next play() builds a fresh context. A segment already queued
    // via setTimeout from this (now-stale) scheduler would otherwise create nodes on the
    // old `ctx` and connect them to the new module-level `masterGain` — an
    // InvalidAccessError ("connect to a node belonging to a different audio context").
    // If the live context is no longer the one we captured, this scheduler is dead: bail.
    if (ctx !== audioContext || !masterGain) return false;

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
        // Antes esto reprogramaba un setTimeout para reanudar tras el hueco. Ahora el reloj
        // sigue latiendo, así que basta con caer al setup normal de abajo: el propio
        // `segmentStartTime` ya es el instante correcto de reinicio, sin salto ni pausa.
      } else {
        onEnded?.();
        return false;
      }
    }
    
    const segment = chordSegments[currentSegmentIndex];
    const { chord, slotCount, globalChordIndex, sectionId } = segment;
    
    // Get current style and dynamic parameters
    const currentStyle = getStyle ? getStyle() : style;
    const slotsPerBar = getSlotsPerBar(currentStyle);
    // Re-read BPM each segment so live changes take effect on the next chord
    const slotDuration = (60 / getCurrentBpm()) / 4;
    if (currentSegmentIndex === 0) {
      console.log(`[AUDIO] enterSegment bar#0 — currentStyle.id: "${currentStyle.id}", bpm: ${getCurrentBpm()}`);
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
      applyVocalMute(isVocalEffectivelyMuted(), segmentStartTime);
      applyVocalVolume(getUserVocalVolume(), segmentStartTime);
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

    // ── Mixer ────────────────────────────────────────────────────────────────
    // Push each instrument's level onto its bus, so notes below carry only their velocity.
    // Re-applied every segment because volume/mute/solo are read from live getters; the
    // ramp inside setBusLevel makes a repeated identical value a no-op in practice.
    //
    // Mute/solo lands in two places on purpose. The bus gain going to 0 silences whatever
    // is ALREADY scheduled, so muting is audible immediately instead of at the next chord.
    // The `audible` flag below still gates scheduling, so a muted instrument doesn't build
    // Web Audio nodes nobody will hear. The cost of that pairing is that UNmuting still
    // waits for the next segment — same as before this change, since the notes were never
    // scheduled. Phase 4's voice manager is what makes instant unmute cheap.
    const pianoAudible = !!pianoState && isInstrumentAudible(pianoState, instruments);
    const bassAudible = !!bassState && isInstrumentAudible(bassState, instruments);
    const drumsAudible = !!drumsState && isInstrumentAudible(drumsState, instruments);
    const guitarAudible = !!guitarState && isInstrumentAudible(guitarState, instruments);

    applyMixerLevels(instruments, currentStyle);

    // A null bus means the mixer belongs to a different (stale) context — same failure the
    // masterGain guard above catches, so bail rather than connect across contexts.
    const pianoBus = getBus(ctx, 'piano');
    const bassBus = getBus(ctx, 'bass');
    const drumsBus = getBus(ctx, 'drums');
    const guitarBus = getBus(ctx, 'guitar');
    if (!pianoBus || !bassBus || !drumsBus || !guitarBus) return false;

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
    
    // Cached for the lifetime of THIS segment only, so live edits are still picked up on
    // the next chord — same freshness the rest of the loop has (style, BPM and instruments
    // are all re-read once per segment too). Without the cache this ran once per 16th-note
    // slot, and generateBarPattern builds 14 fresh arrays per call: 224 allocations per bar
    // instead of 14, on the main thread, while audio is playing. The offline renderer has
    // always cached this (see renderProgressionOffline) — only the live path did not.
    const patternCache = new Map<number, ReturnType<typeof generateBarPattern>>();
    const getPatternForBar = (barNum: number) => {
      let pattern = patternCache.get(barNum);
      if (!pattern) {
        pattern = generateBarPattern(currentStyle, barNum, phraseLength, false, forceFill);
        patternCache.set(barNum, pattern);
      }
      return pattern;
    };

    // Everything above is per-chord setup and stays a single burst — measured at ~6ms, well
    // under the 50ms long-task threshold. The per-slot work below is what used to run as one
    // 44ms block per chord and is now spread across clock ticks.
    active = {
      segmentStartTime, slotCount, slotDuration, slotsPerBar, currentStyle, instruments,
      transposition, metronomeOn, midiNotes, sectionId, chord, getPatternForBar,
      pianoSound, bassSound, drumsSound, guitarSound,
      pianoAudible, bassAudible, drumsAudible, guitarAudible,
      pianoBus, bassBus, drumsBus, guitarBus,
    };
    return true;
  };

  /** Programa un único slot del acorde en curso. El reloj decide cuántos caben por tick. */
  const scheduleSlot = (i: number) => {
    const {
      segmentStartTime, slotDuration, slotsPerBar, currentStyle,
      metronomeOn, midiNotes, sectionId, chord, getPatternForBar,
      pianoSound, bassSound, drumsSound, guitarSound,
      pianoAudible, bassAudible, drumsAudible, guitarAudible,
      pianoBus, bassBus, drumsBus, guitarBus,
    } = active!;
    {
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

      // Playhead sync: publish when this slot lands and let the UI read it from a rAF
      // loop (getStepSchedule / PlaybackContext), same as _chordSchedule above.
      //
      // This used to be a window.setTimeout PER SLOT, pushed into an array that was only
      // cleared by cancel() — so the timers accumulated for as long as playback ran.
      // Measured over 10s of real playback (120 BPM, 4/4, one bar per chord): 86 timers
      // registered vs 6 now, i.e. 8.6/sec vs 0.6/sec, ~2.6k accumulated over a 5-minute
      // session. That main-thread pressure feeds the scheduler starvation
      // SCHEDULE_LOOKAHEAD_SEC exists to absorb: the engine was competing with its own
      // playhead timers for the event loop it needs to schedule the next bar. Deriving the
      // playhead from ctx.currentTime costs zero timers, and is what RhythmEditor's
      // updatePlayhead has always done.
      _stepSchedule.push({ audioTime: slotTime, patternSlot });
      if (_stepSchedule.length > 500) _stepSchedule = _stepSchedule.slice(-250);

      // Schedule metronome on beat boundaries — one click per denominator unit
      // (every 4 slots/quarter in 4/4, every 2 slots/eighth in 6/8, etc.)
      const clickInterval = getMetronomeClickInterval(currentStyle);
      if (metronomeOn && masterGain && patternSlot % clickInterval === 0) {
        const isDownbeat = patternSlot === 0;
        playClick(ctx, masterGain, slotTime, isDownbeat);
      }

      // Everything musical for this slot comes from the pure builder; everything
      // audible from the shared dispatcher. Same two calls as the offline render.
      const events = buildSlotEvents({
        slotTime,
        slotDuration,
        currentGlobalSlot,
        patternSlot,
        slotsPerBar,
        midiNotes,
        chordQuality: chord.quality,
        pattern,
        style: currentStyle,
        melodic: {
          piano: getPianoScale?.(sectionId) ?? null,
          bass: getBassScale?.(sectionId) ?? null,
          guitar: getGuitarScale?.(sectionId) ?? null,
        },
        audible: { piano: pianoAudible, bass: bassAudible, drums: drumsAudible, guitar: guitarAudible },
      });
      dispatchEvents(ctx, events, {
        buses: { piano: pianoBus, bass: bassBus, drums: drumsBus, guitar: guitarBus },
        sounds: { piano: pianoSound, bass: bassSound, drums: drumsSound, guitar: guitarSound },
      });
    }
  };

  // Cuántos slots como máximo se programan en un mismo tick. Sin tope, salir de un parón
  // largo volvería a producir exactamente la ráfaga que este diseño elimina: el clamp de
  // scheduleSlot ya reparte el desfase, así que es preferible ir recuperando por tandas.
  const MAX_SLOTS_PER_TICK = 8;

  /**
   * Un tick del reloj: programar todo lo que caiga antes del horizonte y devolver el control.
   * Sustituye a la cadena de setTimeout por acorde — ver engine/clock.ts para los números.
   */
  const onTick = (horizon: number) => {
    if (cancelled) return;
    // Guard de consistencia de contexto: si el contexto vivo ya no es el que capturó este
    // scheduler, está muerto y no debe crear nodos.
    if (ctx !== audioContext || !masterGain) return;

    let scheduled = 0;
    while (scheduled < MAX_SLOTS_PER_TICK) {
      if (!active) {
        // Entre acordes: entrar en el siguiente. Devuelve false cuando la progresión acabó
        // sin loop, o cuando no hay nada que programar todavía.
        if (!enterSegment(nextSegmentTime)) return;
        slotInSegment = 0;
      }
      const { slotCount, slotDuration, segmentStartTime } = active!;
      // El tiempo del slot se compara con el horizonte, no con "ahora": así siempre hay
      // ~300 ms programados por delante.
      if (segmentStartTime + slotInSegment * slotDuration >= horizon) return;

      scheduleSlot(slotInSegment);
      slotInSegment++;
      scheduled++;

      if (slotInSegment >= slotCount) {
        globalSlotIndex += slotCount;
        currentSegmentIndex++;
        nextSegmentTime = segmentStartTime + slotCount * slotDuration;
        active = null;
      }
    }
  };

  // Calculate total duration for return value
  const totalDuration = totalSlots * slotDuration;

  nextSegmentTime = startTime;
  const clock = startClock(ctx, onTick);

  return {
    duration: totalDuration,
    cancel: () => {
      cancelled = true;
      clock.stop();
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
  // Misma cadena que la reproducción: EQ, reverb, compresor y limitador. Antes el export
  // iba directo a destination, asi que ni llevaba los efectos del MixingConsole ni tenia
  // nada que impidiera recortar.  es obligatorio —  es estado de
  // modulo y registrar esta cadena dejaria los mandos del usuario apuntando a nodos de un
  // contexto offline ya terminado.
  buildEffectsChain(offlineCtx, offlineMasterGain, offlineCtx.destination, false);

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

  // The SF2 guitars are the one bank that is not loaded eagerly anywhere, so an export
  // started without ever having played that sound would find no buffers and silently fall
  // back to a synth tone. Awaiting it here is what makes the WAV match what you hear.
  // Decoded into the live context and borrowed from here — see playGuitarNote.
  if (guitarSound?.sf2Instrument) {
    await ensureGuitarSoundfontLoaded(guitarState!.soundTypeId, guitarSound.sf2Instrument)
  }
  // The MP3 guitar sets load on demand too, and only the default one is fetched at startup.
  if (guitarSound?.useSamples && guitarSound.samplePath) {
    ensureGuitarSampleType(guitarSound.samplePath)
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
  
  // Mixer buses, mirroring the live path so instrument level is a graph parameter rather
  // than a number baked into every note. Offline levels are static (nothing can move a
  // fader mid-render), so they are set once here instead of per segment.
  const offlineBuses = {
    piano: offlineCtx.createGain(),
    bass: offlineCtx.createGain(),
    drums: offlineCtx.createGain(),
    guitar: offlineCtx.createGain(),
  };
  for (const bus of Object.values(offlineBuses)) bus.connect(offlineMasterGain);

  // isInstrumentAudible, not `!muted` — the offline path used to ignore solo entirely, so
  // soloing an instrument and exporting gave you a WAV with everything still in it.
  const audible = {
    piano: !!pianoState && isInstrumentAudible(pianoState, instruments),
    bass: !!bassState && isInstrumentAudible(bassState, instruments),
    drums: !!drumsState && isInstrumentAudible(drumsState, instruments),
    guitar: !!guitarState && isInstrumentAudible(guitarState, instruments),
  };
  offlineBuses.piano.gain.value = audible.piano ? pianoState!.volume * style.volumes.piano : 0;
  offlineBuses.bass.gain.value = audible.bass ? bassState!.volume * style.volumes.bass : 0;
  offlineBuses.drums.gain.value = audible.drums ? drumsState!.volume * style.volumes.drums : 0;
  // Guitar has no style volume of its own in older styles — it borrows piano's.
  offlineBuses.guitar.gain.value = audible.guitar
    ? guitarState!.volume * (style.volumes.guitar ?? style.volumes.piano)
    : 0;

  sections.forEach(section => {
    const melodicBass   = style.melodic ? resolveVariation(style.melodic.bass,   section.bassVariationId)   : null;
    const melodicPiano  = style.melodic ? resolveVariation(style.melodic.piano,  section.pianoVariationId)  : null;
    const melodicGuitar = style.melodic ? resolveVariation(style.melodic.guitar, section.guitarVariationId) : null;

    for (let repeat = 0; repeat < section.repeatCount; repeat++) {
      section.chords.forEach(chord => {
        const midiNotes = chordToMidiNotes(chord).map(note => note + transposition);
        const chordStartTime = currentTime;
        const slotCount = chord.duration * 4; // 4 slots per beat

        for (let i = 0; i < slotCount; i++) {
          // CRITICAL: patternSlot and barNumber are based on GLOBAL position — the rhythm
          // pattern runs continuously regardless of chord changes.
          const currentGlobalSlot = globalSlotIndex + i;
          const patternSlot = currentGlobalSlot % slotsPerBar;
          const slotTime = chordStartTime + (i * slotDuration) + getSwingOffset(style, patternSlot, slotDuration);
          const barNumber = Math.floor(currentGlobalSlot / slotsPerBar) + 1;
          const pattern = getPatternForBar(barNumber);

          // Mismas dos llamadas que el scheduler en vivo: construir y despachar.
          const events = buildSlotEvents({
            slotTime,
            slotDuration,
            currentGlobalSlot,
            patternSlot,
            slotsPerBar,
            midiNotes,
            chordQuality: chord.quality,
            pattern,
            style,
            melodic: { piano: melodicPiano, bass: melodicBass, guitar: melodicGuitar },
            audible,
          });
          dispatchEvents(offlineCtx, events, {
            buses: offlineBuses,
            sounds: { piano: pianoSound, bass: bassSound, drums: drumsSound, guitar: guitarSound },
            kit: offlineKit,
            pending: offlineBassPromises,
          });
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

  // This used to close the AudioContext. Closing it was the most reliable way to kill
  // already-queued WebAudio events — the scheduler runs ~300ms ahead, so at Stop there are
  // notes whose start() is still in the future and cancel() does not undo those. But it
  // also destroyed every cache keyed to that context (guitar soundfont, bass samples, mixer
  // buses, effects chain), which is what made a Stop cost a full redecode on the next Play
  // and forced stopPlaybackKeepContext() into existence.
  //
  // Now the voice manager knows every source that is playing, so they can be stopped
  // individually and the context survives. The gain ramp is not optional: cutting a source
  // mid-waveform is a discontinuity, and a discontinuity is an audible click.
  if (audioContext && masterGain) {
    const now = audioContext.currentTime;
    const FADE_SEC = 0.015;
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setValueAtTime(masterGain.gain.value, now);
    masterGain.gain.linearRampToValueAtTime(0, now + FADE_SEC);
    stopAllVoices(now + FADE_SEC + 0.005);
    // Bass samples are scheduled by sampleEngine, which keeps its own node set — the chord
    // editor never stopped those before, only the context close did.
    stopAllSampledNodes();
    // Restore the master for the next Play, after everything has been cut.
    masterGain.gain.setValueAtTime(0, now + FADE_SEC + 0.005);
    masterGain.gain.setValueAtTime(1, now + FADE_SEC + 0.01);
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

/**
 * Lightweight variant of stopPlayback() for a caller about to immediately start a NEW play()
 * as a continuation of the same listening session — a song section finishing on its own
 * (loop: false) and the UI chaining into the next one. Releases the mutex and clears the
 * schedule, without silencing anything.
 *
 * This existed because stopPlayback() closed the AudioContext, which invalidated every cache
 * keyed to it and turned a section change into a redecode. That reason is gone: Stop keeps
 * the context now. What remains is a narrower and still real distinction — stopPlayback()
 * fades the master out and cuts every live voice, which is right when the user asks for
 * silence but wrong when the next section should follow seamlessly. A natural end-of-array
 * completion has nothing queued past it, so there is nothing to cut.
 *
 * Kept rather than removed for that reason, but it is now a small difference rather than two
 * incompatible stop semantics.
 */
export function stopPlaybackKeepContext(): void {
  clearChordSchedule();
  releasePlaybackMutex();
}

/** Live voices being tracked. Diagnostic — see tests/audio/run-transport.mjs. */
export { activeVoiceCount };
