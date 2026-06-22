import { useState, useRef, useCallback, useEffect } from 'react';

export type PlayDirection = 'asc' | 'desc';

export interface NotePosition {
  stringIndex: number; // 0 = high-e, 5 = low-E
  fret: number;
  midi: number;
}

const TUNING = [64, 59, 55, 50, 45, 40]; // E4 B3 G3 D3 A2 E2

// ── Audio ─────────────────────────────────────────────────────────────────────

let sharedCtx: AudioContext | null = null;
function getAudioContext(): AudioContext {
  if (!sharedCtx || sharedCtx.state === 'closed') sharedCtx = new AudioContext();
  return sharedCtx;
}

function playGuitarNote(midi: number, durationMs: number) {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') ctx.resume();

  const freq = 440 * Math.pow(2, (midi - 69) / 12);
  const now  = ctx.currentTime;
  const dur  = Math.max(durationMs / 1000, 0.08);

  const osc    = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const gain   = ctx.createGain();

  osc.type = 'sawtooth';
  osc.frequency.value = freq;
  filter.type = 'lowpass';
  filter.frequency.value = Math.min(freq * 3.5, 7000);
  filter.Q.value = 0.6;

  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.2, now + 0.003);
  gain.gain.exponentialRampToValueAtTime(0.001, now + dur * 1.1);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + dur * 1.2);
}

// ── Scale builders ─────────────────────────────────────────────────────────────

/** 1 octave: root + intervals + octave-root */
export function buildScaleNotes(rootPitchClass: number, intervals: number[]): number[] {
  const base = 48 + rootPitchClass;
  return [...intervals.map(i => base + i), base + 12];
}

/**
 * Greedy position algorithm.
 * anchor = max(0, first_fret − 1)  →  hand position
 * zone   = [anchor, anchor + 4]    →  comfortable 4-fret span
 * Ascending  → prefer thinner strings (lower stringIndex)
 * Descending → prefer thicker strings (higher stringIndex)
 */
export function buildScalePath(notes: number[], direction: PlayDirection): NotePosition[] {
  const path: NotePosition[] = [];
  let anchor = 0;

  for (let i = 0; i < notes.length; i++) {
    const midi = notes[i];
    const all: NotePosition[] = TUNING
      .map((openMidi, si) => ({ stringIndex: si, fret: midi - openMidi, midi }))
      .filter(c => c.fret >= 0 && c.fret <= 12);

    if (!all.length) continue;

    if (i === 0) {
      const candidates = all.filter(c => c.fret <= (direction === 'asc' ? 9 : 7));
      const pool = candidates.length ? candidates : all;
      const start = direction === 'asc'
        ? pool.reduce((b, c) => c.stringIndex > b.stringIndex ? c : b)
        : pool.reduce((b, c) => c.stringIndex < b.stringIndex ? c : b);
      anchor = Math.max(0, start.fret - 1);
      path.push(start);
      continue;
    }

    const prev = path[path.length - 1];
    const inDir = (c: NotePosition) =>
      direction === 'asc' ? c.stringIndex <= prev.stringIndex
                           : c.stringIndex >= prev.stringIndex;

    let pool = all.filter(c => c.fret >= anchor && c.fret <= anchor + 4 && inDir(c));
    if (!pool.length) pool = all.filter(c => c.fret >= anchor && c.fret <= anchor + 4);
    if (!pool.length) pool = all.filter(inDir);
    if (!pool.length) pool = all;

    path.push(pool
      .map(c => ({ ...c, score: Math.abs(c.fret - prev.fret) - (c.stringIndex === prev.stringIndex ? 1 : 0) }))
      .reduce((a, b) => a.score < b.score ? a : b));
  }

  return path;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

interface UseScalePlaybackOptions {
  rootPitchClass: number;
  intervals: number[];
  bpm: number;
}

interface UseScalePlaybackReturn {
  isPlaying: boolean;
  activePosition: NotePosition | null;
  currentNoteIndex: number;
  totalNotes: number;
  play: (direction: PlayDirection, loop?: boolean) => void;
  stop: () => void;
}

export function useScalePlayback({
  rootPitchClass,
  intervals,
  bpm,
}: UseScalePlaybackOptions): UseScalePlaybackReturn {
  const [isPlaying, setIsPlaying]      = useState(false);
  const [activePosition, setActivePos] = useState<NotePosition | null>(null);
  const [currentNoteIndex, setNoteIdx] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopFlag   = useRef(false);
  // Live ref so BPM changes take effect on the next note without stopping playback
  const bpmRef     = useRef(bpm);
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);

  const totalNotes = intervals.length + 1;

  const stop = useCallback(() => {
    stopFlag.current = true;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsPlaying(false);
    setActivePos(null);
    setNoteIdx(0);
  }, []);

  // Stop when the scale itself changes
  useEffect(() => { stop(); }, [rootPitchClass, intervals, stop]);

  const play = useCallback((direction: PlayDirection, loop = false) => {
    stop();
    stopFlag.current = false;

    const notes    = buildScaleNotes(rootPitchClass, intervals);
    const sequence = direction === 'desc' ? [...notes].reverse() : notes;
    const path     = buildScalePath(sequence, direction);

    setIsPlaying(true);

    let idx = 0;
    const tick = () => {
      if (stopFlag.current) {
        setIsPlaying(false);
        setActivePos(null);
        setNoteIdx(0);
        return;
      }
      if (idx >= path.length) {
        if (loop) { idx = 0; tick(); return; }
        setIsPlaying(false);
        setActivePos(null);
        setNoteIdx(0);
        return;
      }
      const ms = Math.round(60_000 / bpmRef.current);
      setActivePos(path[idx]);
      setNoteIdx(idx);
      playGuitarNote(path[idx].midi, ms * 0.88);
      idx++;
      timeoutRef.current = setTimeout(tick, ms);
    };

    tick();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootPitchClass, intervals, stop]);

  useEffect(() => () => { stop(); }, [stop]);

  return { isPlaying, activePosition, currentNoteIndex, totalNotes, play, stop };
}
