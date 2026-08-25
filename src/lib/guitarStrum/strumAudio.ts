import type { GuitarVoicing } from '@/data/guitarChords';
import { STRING_MIDI } from './strumTheory';
import type { StrumVisualEvent } from './types';

// Self-contained pluck-synthesis engine for the strumming/arpeggio tool — deliberately
// separate from src/lib/guitarTab/guitarAudio.ts (same precedent as the Bass Tab Player
// having its own engine distinct from the chord editor's). That engine's Karplus-Strong
// internals aren't exported, its note model is per-tab-note rather than per-strum, it has
// no "choke" (silencing still-ringing strings when a new strum lands on them — essential
// here or fast patterns turn into a wash of overlapping chords), and its string index
// order is reversed (high e first) relative to GuitarVoicing.frets (low E first), which
// this module's STRING_MIDI matches directly.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let seqGain: GainNode | null = null;
let sustainSeconds = 1.3;
const bufferCache = new Map<number, AudioBuffer>();

interface LiveNote {
  gain: GainNode;
  source: AudioBufferSourceNode;
  end: number;
  stringIndex: number;
}
let liveNotes: LiveNote[] = [];

function ensureCtx(): AudioContext {
  if (!ctx || ctx.state === 'closed') {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.5;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.ratio.value = 4;
    master.connect(compressor);
    compressor.connect(ctx.destination);
    seqGain = ctx.createGain();
    seqGain.connect(master);
    bufferCache.clear();
    liveNotes = [];
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function getAudioContext(): AudioContext {
  return ensureCtx();
}

export function hasAudioContext(): boolean {
  return ctx !== null;
}

export function currentAudioTime(): number {
  return ctx ? ctx.currentTime : 0;
}

export function closeAudioContext(): void {
  if (ctx && ctx.state !== 'closed') ctx.close();
  ctx = null;
  master = null;
  seqGain = null;
  liveNotes = [];
  bufferCache.clear();
}

export function setSustain(seconds: number): void {
  sustainSeconds = Math.max(0.45, Math.min(3, seconds));
  bufferCache.clear();
}

export function getSustain(): number {
  return sustainSeconds;
}

/** Noise-through-a-decaying-comb-filter pluck, cached per MIDI note (cache clears when sustain changes). */
function pluckBuffer(midi: number): AudioBuffer {
  const cached = bufferCache.get(midi);
  if (cached) return cached;
  const audioCtx = ensureCtx();
  const sampleRate = audioCtx.sampleRate;
  const freq = 440 * Math.pow(2, (midi - 69) / 12);
  const period = Math.max(2, Math.round(sampleRate / freq));
  const decaySeconds = sustainSeconds;
  const length = Math.floor(sampleRate * decaySeconds);
  const ring = new Float32Array(period);
  let last = 0;
  for (let i = 0; i < period; i++) {
    const white = Math.random() * 2 - 1;
    last = 0.55 * last + 0.45 * white;
    ring[i] = last;
  }
  const buffer = audioCtx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  const damping = Math.exp(-3 / (decaySeconds * 0.9 * sampleRate));
  let idx = 0;
  for (let i = 0; i < length; i++) {
    const cur = ring[idx];
    const next = ring[(idx + 1) % period];
    data[i] = cur;
    ring[idx] = damping * (0.5 * cur + 0.5 * next);
    idx = (idx + 1) % period;
  }
  const fade = Math.floor(sampleRate * Math.min(0.3, decaySeconds * 0.35));
  for (let i = 0; i < fade; i++) data[length - fade + i] *= 1 - i / fade;
  bufferCache.set(midi, buffer);
  return buffer;
}

function playNote(midi: number, time: number, gain: number, sequenced: boolean, muted: boolean, stringIndex: number): void {
  const audioCtx = ensureCtx();
  if (!master || !seqGain) return;
  const source = audioCtx.createBufferSource();
  source.buffer = pluckBuffer(midi);
  const noteGain = audioCtx.createGain();
  const lowpass = audioCtx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = muted ? 1400 : 5200;
  noteGain.gain.setValueAtTime(0.0001, time);
  noteGain.gain.linearRampToValueAtTime(gain, time + 0.005);
  if (muted) noteGain.gain.exponentialRampToValueAtTime(0.0008, time + 0.13);
  source.connect(lowpass);
  lowpass.connect(noteGain);
  noteGain.connect(sequenced ? seqGain : master);
  source.start(time);
  const end = time + (muted ? 0.22 : sustainSeconds);
  source.stop(end);
  liveNotes.push({ gain: noteGain, source, end, stringIndex });
  if (liveNotes.length > 90) {
    const now = audioCtx.currentTime;
    liveNotes = liveNotes.filter(n => n.end > now - 0.1);
  }
}

/** Silences still-ringing notes on the given strings before a new strum lands on them. */
function choke(time: number, strings: number[], fade: number): void {
  if (!liveNotes.length) return;
  const keep: LiveNote[] = [];
  liveNotes.forEach(n => {
    if (n.end <= time || !strings.includes(n.stringIndex)) {
      keep.push(n);
      return;
    }
    try {
      n.gain.gain.cancelScheduledValues(time);
      n.gain.gain.setTargetAtTime(0.0001, time, fade);
      n.source.stop(time + fade * 5);
    } catch {
      // already stopped
    }
  });
  liveNotes = keep;
}

export function scheduleClick(time: number, accent: boolean): void {
  const audioCtx = ensureCtx();
  if (!master) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.frequency.value = accent ? 1500 : 1000;
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.linearRampToValueAtTime(accent ? 0.3 : 0.18, time + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0005, time + 0.06);
  osc.connect(gain);
  gain.connect(master);
  osc.start(time);
  osc.stop(time + 0.08);
}

/** Resets and unmutes the sequenced-note bus — call once when playback starts. */
export function primeSequencer(time: number): void {
  ensureCtx();
  if (!seqGain) return;
  seqGain.gain.cancelScheduledValues(time);
  seqGain.gain.setValueAtTime(1, time);
}

/** Fades out the sequenced-note bus — call when playback stops, so ringing chords decay instead of clicking off. */
export function fadeOutSequencer(time: number): void {
  if (!seqGain) return;
  seqGain.gain.cancelScheduledValues(time);
  seqGain.gain.setTargetAtTime(0, time, 0.04);
}

function stringOrder(voicing: GuitarVoicing): number[] {
  return STRING_MIDI.map((_, i) => i).filter(i => voicing.frets[i] >= 0);
}

export function scheduleStrum(
  voicing: GuitarVoicing,
  direction: 'down' | 'up',
  time: number,
  sequenced: boolean,
  muted: boolean,
): StrumVisualEvent {
  const order = stringOrder(voicing);
  if (direction === 'up') order.reverse();
  const spread = muted ? 0.008 : 0.016;
  choke(time, order, 0.022);
  order.forEach((stringIndex, k) => {
    const velocity = (0.5 + 0.5 * Math.random() * 0.4) * (muted ? 0.6 : 1) * (direction === 'up' ? 0.8 : 1);
    const midi = STRING_MIDI[stringIndex] + voicing.frets[stringIndex];
    playNote(midi, time + k * spread, velocity * 0.7, sequenced, muted, stringIndex);
  });
  return { time, strings: order, spread, amp: muted ? 4 : 9 };
}

export function schedulePluck(voicing: GuitarVoicing, stringIndex: number): StrumVisualEvent | null {
  if (voicing.frets[stringIndex] < 0) return null;
  const audioCtx = ensureCtx();
  const time = audioCtx.currentTime + 0.005;
  choke(time, [stringIndex], 0.018);
  playNote(STRING_MIDI[stringIndex] + voicing.frets[stringIndex], time, 0.8, false, false, stringIndex);
  return { time, strings: [stringIndex], spread: 0, amp: 12 };
}

export function scheduleArpStep(voicing: GuitarVoicing, strings: number[], time: number): StrumVisualEvent | null {
  if (!strings.length) return null;
  choke(time, strings, 0.02);
  strings.forEach(stringIndex => {
    playNote(STRING_MIDI[stringIndex] + voicing.frets[stringIndex], time, 0.62, true, false, stringIndex);
  });
  return { time, strings, spread: 0, amp: 8 };
}
