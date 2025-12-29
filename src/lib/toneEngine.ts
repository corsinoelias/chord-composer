/**
 * Tone.js Engine
 * 
 * Provides realistic sampled instruments using Tone.js
 * with Salamander Grand Piano and other high-quality samples
 */

import * as Tone from 'tone';

// Sampler instances
let pianoSampler: Tone.Sampler | null = null;
let bassSampler: Tone.Sampler | null = null;
let isLoading = false;
let isLoaded = false;
let loadPromise: Promise<void> | null = null;

// Salamander Piano sample URLs (hosted on GitHub)
const SALAMANDER_BASE_URL = 'https://tonejs.github.io/audio/salamander/';

// Piano notes to load (subset for faster loading)
const PIANO_NOTES: Record<string, string> = {
  'A0': 'A0.mp3',
  'C1': 'C1.mp3',
  'D#1': 'Ds1.mp3',
  'F#1': 'Fs1.mp3',
  'A1': 'A1.mp3',
  'C2': 'C2.mp3',
  'D#2': 'Ds2.mp3',
  'F#2': 'Fs2.mp3',
  'A2': 'A2.mp3',
  'C3': 'C3.mp3',
  'D#3': 'Ds3.mp3',
  'F#3': 'Fs3.mp3',
  'A3': 'A3.mp3',
  'C4': 'C4.mp3',
  'D#4': 'Ds4.mp3',
  'F#4': 'Fs4.mp3',
  'A4': 'A4.mp3',
  'C5': 'C5.mp3',
  'D#5': 'Ds5.mp3',
  'F#5': 'Fs5.mp3',
  'A5': 'A5.mp3',
  'C6': 'C6.mp3',
  'D#6': 'Ds6.mp3',
  'F#6': 'Fs6.mp3',
  'A6': 'A6.mp3',
  'C7': 'C7.mp3',
  'D#7': 'Ds7.mp3',
  'F#7': 'Fs7.mp3',
  'A7': 'A7.mp3',
  'C8': 'C8.mp3',
};

/**
 * Initialize and load all Tone.js samplers
 */
export async function loadToneSamplers(): Promise<void> {
  if (isLoaded) return;
  if (loadPromise) return loadPromise;

  isLoading = true;

  loadPromise = new Promise<void>((resolve, reject) => {
    // Create URLs object for Sampler
    const urls: Record<string, string> = {};
    for (const [note, file] of Object.entries(PIANO_NOTES)) {
      urls[note] = file;
    }

    pianoSampler = new Tone.Sampler({
      urls,
      baseUrl: SALAMANDER_BASE_URL,
      release: 1,
      onload: () => {
        console.log('Salamander Piano loaded');
        isLoaded = true;
        isLoading = false;
        resolve();
      },
      onerror: (err) => {
        console.error('Failed to load piano samples:', err);
        isLoading = false;
        reject(err);
      },
    }).toDestination();

    // Create a simple synth bass as fallback (could add real bass samples later)
    bassSampler = new Tone.Sampler({
      urls: {
        'C2': 'C2.mp3',
        'C3': 'C3.mp3',
        'C4': 'C4.mp3',
      },
      baseUrl: SALAMANDER_BASE_URL,
      release: 0.5,
    }).toDestination();
  });

  return loadPromise;
}

/**
 * Check if Tone.js samplers are ready
 */
export function isToneReady(): boolean {
  return isLoaded && pianoSampler !== null;
}

/**
 * Check if Tone.js is currently loading
 */
export function isToneLoading(): boolean {
  return isLoading;
}

/**
 * Start the Tone.js audio context (required for user gesture)
 */
export async function startTone(): Promise<void> {
  await Tone.start();
}

/**
 * Play a piano note using the Salamander sampler
 */
export function playTonePianoNote(
  midiNote: number,
  duration: number,
  time: number,
  velocity: number = 0.7
): void {
  if (!pianoSampler || !isLoaded) return;

  const note = Tone.Frequency(midiNote, 'midi').toNote();
  const durationStr = `${duration}`;

  pianoSampler.triggerAttackRelease(note, durationStr, time, velocity);
}

/**
 * Play a bass note using the sampler (uses piano samples pitched down for now)
 */
export function playToneBassNote(
  midiNote: number,
  duration: number,
  time: number,
  velocity: number = 0.7
): void {
  if (!bassSampler || !isLoaded) return;

  // Bass typically plays 2 octaves lower
  const bassNote = midiNote - 24;
  const note = Tone.Frequency(bassNote, 'midi').toNote();
  const durationStr = `${duration}`;

  bassSampler.triggerAttackRelease(note, durationStr, time, velocity);
}

/**
 * Schedule a piano chord at a specific time
 */
export function scheduleTonePianoChord(
  midiNotes: number[],
  duration: number,
  time: number,
  velocity: number = 0.7
): void {
  if (!pianoSampler || !isLoaded) return;

  const notes = midiNotes.map(midi => Tone.Frequency(midi, 'midi').toNote());
  const durationStr = `${duration}`;

  pianoSampler.triggerAttackRelease(notes, durationStr, time, velocity);
}

/**
 * Get the Tone.js transport time
 */
export function getToneTime(): number {
  return Tone.now();
}

/**
 * Set Tone.js BPM
 */
export function setToneBpm(bpm: number): void {
  Tone.getTransport().bpm.value = bpm;
}

/**
 * Dispose of all samplers
 */
export function disposeTone(): void {
  if (pianoSampler) {
    pianoSampler.dispose();
    pianoSampler = null;
  }
  if (bassSampler) {
    bassSampler.dispose();
    bassSampler = null;
  }
  isLoaded = false;
  loadPromise = null;
}
