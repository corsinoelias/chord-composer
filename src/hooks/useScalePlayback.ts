import { useState, useRef, useCallback, useEffect } from 'react';

export type PlayDirection = 'asc' | 'desc';

export interface NotePosition {
  stringIndex: number; // 0 = high-e, 5 = low-E
  fret: number;
  midi: number;
}

export interface ScalePosition {
  anchor: number;
  label: string;   // 'Open' | 'II' | 'V' …
  path: NotePosition[];
}

const TUNING = [64, 59, 55, 50, 45, 40]; // E4 B3 G3 D3 A2 E2
const ROMAN  = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

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

/** 1 octave: intervals + octave root */
export function buildScaleNotes(rootPitchClass: number, intervals: number[]): number[] {
  const base = 48 + rootPitchClass;
  return [...intervals.map(i => base + i), base + 12];
}

/**
 * Build an ascending path starting at a given anchor fret.
 * anchor = the lowest fret the left hand sits on (index finger position).
 * All notes are placed within [anchor, anchor+4] when possible.
 */
export function buildScalePathAtAnchor(notes: number[], anchor: number): NotePosition[] {
  const path: NotePosition[] = [];

  for (let i = 0; i < notes.length; i++) {
    const midi = notes[i];
    const all: NotePosition[] = TUNING
      .map((open, si) => ({ stringIndex: si, fret: midi - open, midi }))
      .filter(c => c.fret >= 0 && c.fret <= 12);

    if (!all.length) continue;

    if (i === 0) {
      // First note: thickest string available in the zone
      let pool = all.filter(c => c.fret >= anchor && c.fret <= anchor + 4);
      if (!pool.length) pool = all;
      path.push(pool.reduce((b, c) => c.stringIndex > b.stringIndex ? c : b));
      continue;
    }

    const prev = path[path.length - 1];
    // Ascending: move toward thinner strings (lower stringIndex)
    const inAsc = (c: NotePosition) => c.stringIndex <= prev.stringIndex;

    let pool = all.filter(c => c.fret >= anchor && c.fret <= anchor + 4 && inAsc(c));
    if (!pool.length) pool = all.filter(c => c.fret >= anchor && c.fret <= anchor + 4);
    if (!pool.length) pool = all.filter(inAsc);
    if (!pool.length) pool = all;

    path.push(pool
      .map(c => ({ ...c, score: Math.abs(c.fret - prev.fret) - (c.stringIndex === prev.stringIndex ? 1 : 0) }))
      .reduce((a, b) => a.score < b.score ? a : b));
  }

  return path;
}

/**
 * Find all distinct playable positions for a scale in standard tuning.
 * Returns 3-6 positions, ordered from low to high on the neck.
 */
export function findScalePositions(rootPitchClass: number, intervals: number[]): ScalePosition[] {
  const notes   = buildScaleNotes(rootPitchClass, intervals);
  const results: ScalePosition[] = [];
  const seen    = new Set<string>();

  for (let anchor = 0; anchor <= 11; anchor++) {
    // All notes must be reachable within the 4-fret span on at least one string
    const allFit = notes.every(midi =>
      TUNING.some(open => {
        const fret = midi - open;
        return fret >= anchor && fret <= anchor + 4;
      })
    );
    if (!allFit) continue;

    const path = buildScalePathAtAnchor(notes, anchor);
    const sig  = path.map(p => `${p.stringIndex}-${p.fret}`).join(',');
    if (seen.has(sig)) continue;
    seen.add(sig);

    const minFret = Math.min(...path.map(p => p.fret));
    const label   = minFret === 0 ? 'Open' : (ROMAN[minFret] ?? `${minFret}`);
    results.push({ anchor, label, path });
  }

  // Fallback: should never be empty for standard scales
  if (!results.length) {
    const path = buildScalePathAtAnchor(notes, 0);
    results.push({ anchor: 0, label: 'Open', path });
  }

  return results;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

interface UseScalePlaybackOptions {
  rootPitchClass: number;
  intervals: number[];
  bpm: number;
  anchorFret: number;
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
  anchorFret,
}: UseScalePlaybackOptions): UseScalePlaybackReturn {
  const [isPlaying, setIsPlaying]      = useState(false);
  const [activePosition, setActivePos] = useState<NotePosition | null>(null);
  const [currentNoteIndex, setNoteIdx] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopFlag   = useRef(false);
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

  // Stop on scale or position change
  useEffect(() => { stop(); }, [rootPitchClass, intervals, anchorFret, stop]);

  const play = useCallback((direction: PlayDirection, loop = false) => {
    stop();
    stopFlag.current = false;

    // Always build an ascending path at the selected anchor;
    // descending just reverses the same shape.
    const notes   = buildScaleNotes(rootPitchClass, intervals);
    const ascPath = buildScalePathAtAnchor(notes, anchorFret);
    const path    = direction === 'desc' ? [...ascPath].reverse() : ascPath;

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
  }, [rootPitchClass, intervals, anchorFret, stop]);

  useEffect(() => () => { stop(); }, [stop]);

  return { isPlaying, activePosition, currentNoteIndex, totalNotes, play, stop };
}
