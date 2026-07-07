import { useState, useRef, useCallback, useEffect } from 'react';
import { previewNote } from '@/lib/guitarTab/guitarAudio';
import type { GuitarSound } from '@/lib/guitarTab/types';

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

// Matches STRING_MIDI_BASE in lib/guitarTab/guitarAudio.ts (standard tuning),
// so NotePosition.stringIndex/fret can be fed straight into previewNote().
const TUNING = [64, 59, 55, 50, 45, 40]; // E4 B3 G3 D3 A2 E2
const ROMAN  = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

// ── Scale builders ─────────────────────────────────────────────────────────────

/** Build notes array from an explicit root MIDI pitch. Produces 1 octave + octave root. */
function buildScaleNotesAtBase(rootMidi: number, intervals: number[]): number[] {
  return [...intervals.map(i => rootMidi + i), rootMidi + 12];
}

/** 1 octave starting at C3 register (rootPitchClass 0 → MIDI 48). */
export function buildScaleNotes(rootPitchClass: number, intervals: number[]): number[] {
  return buildScaleNotesAtBase(48 + rootPitchClass, intervals);
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
 * A shape is comfortable if no single string requires a stretch > maxSpan frets.
 * Open strings (fret 0) are excluded — they don't require a finger position.
 */
function isComfortableShape(path: NotePosition[], maxSpan = 3): boolean {
  const byString = new Map<number, number[]>();
  for (const p of path) {
    if (!byString.has(p.stringIndex)) byString.set(p.stringIndex, []);
    byString.get(p.stringIndex)!.push(p.fret);
  }
  for (const frets of byString.values()) {
    const fretted = frets.filter(f => f > 0);
    if (fretted.length > 1 && Math.max(...fretted) - Math.min(...fretted) > maxSpan) return false;
  }
  return true;
}

/**
 * Find all distinct, comfortable positions for a scale in standard tuning.
 * Tries two octave registers and two comfort levels to cover the full neck
 * while always producing shapes where the octave moves "forward" on the neck.
 *
 * Strategy:
 *  Pass 1 — strict comfort (span ≤ 3 per string) + octave ≥ root fret
 *  Pass 2 — relaxed comfort (span ≤ 4) + octave ≥ root fret  (if pass 1 empty)
 *  Fallback — any comfortable shape, pick the one with smallest backward distance
 */
export function findScalePositions(rootPitchClass: number, intervals: number[]): ScalePosition[] {
  const results: ScalePosition[] = [];
  const sigsSeen = new Set<string>();

  function tryPass(maxSpan: number) {
    for (const rootMidi of [48 + rootPitchClass, 60 + rootPitchClass]) {
      const notes = buildScaleNotesAtBase(rootMidi, intervals);

      for (let anchor = 0; anchor <= 11; anchor++) {
        const allFit = notes.every(midi =>
          TUNING.some(open => { const f = midi - open; return f >= anchor && f <= anchor + 4; })
        );
        if (!allFit) continue;

        const path = buildScalePathAtAnchor(notes, anchor);
        if (!isComfortableShape(path, maxSpan)) continue;

        // Octave must land at an equal or higher fret than the root
        if (path[path.length - 1].fret < path[0].fret) continue;

        if (path.some(p => p.fret > 15)) continue;

        const sig = path.map(p => `${p.stringIndex}-${p.fret}`).join(',');
        if (sigsSeen.has(sig)) continue;
        sigsSeen.add(sig);

        const noteSet = new Set(sig.split(','));
        const tooSimilar = results.some(r => {
          const rSet = new Set(r.path.map(p => `${p.stringIndex}-${p.fret}`));
          return [...noteSet].filter(s => rSet.has(s)).length >= path.length - 1;
        });
        if (tooSimilar) continue;

        const minFret = Math.min(...path.map(p => p.fret));
        const label   = minFret === 0 ? 'Open' : (ROMAN[minFret] ?? `${minFret}`);
        results.push({ anchor, label, path });
      }
    }
  }

  tryPass(3); // prefer strict comfort shapes
  if (!results.length) tryPass(4); // fall back to slightly wider stretch

  results.sort((a, b) =>
    Math.min(...a.path.map(p => p.fret)) - Math.min(...b.path.map(p => p.fret))
  );

  // Final fallback: some scale+root combos have no forward-moving shape at all.
  // Show the most comfortable (span ≤ 4) shape with minimum backward distance.
  if (!results.length) {
    let bestPath: NotePosition[] | null = null;
    let bestBackward = Infinity;
    let bestAnchor = 0;

    for (let anchor = 0; anchor <= 11; anchor++) {
      const notes = buildScaleNotesAtBase(48 + rootPitchClass, intervals);
      const allFit = notes.every(midi =>
        TUNING.some(open => { const f = midi - open; return f >= anchor && f <= anchor + 4; })
      );
      if (!allFit) continue;
      const path = buildScalePathAtAnchor(notes, anchor);
      if (!isComfortableShape(path, 4)) continue;
      if (path.some(p => p.fret > 15)) continue;
      const backward = path[0].fret - path[path.length - 1].fret;
      if (backward < bestBackward) {
        bestBackward = backward;
        bestPath = path;
        bestAnchor = anchor;
      }
    }

    if (!bestPath) {
      const notes = buildScaleNotesAtBase(48 + rootPitchClass, intervals);
      bestPath = buildScalePathAtAnchor(notes, 0);
      bestAnchor = 0;
    }

    const minFret = Math.min(...bestPath.map(p => p.fret));
    results.push({
      anchor: bestAnchor,
      label: minFret === 0 ? 'Open' : (ROMAN[minFret] ?? `${minFret}`),
      path: bestPath,
    });
  }

  return results;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

interface UseScalePlaybackReturn {
  isPlaying: boolean;
  activePosition: NotePosition | null;
  currentNoteIndex: number;
  play: (direction: PlayDirection, path: NotePosition[], loop?: boolean) => void;
  stop: () => void;
}

export function useScalePlayback({ bpm, sound }: { bpm: number; sound: GuitarSound }): UseScalePlaybackReturn {
  const [isPlaying, setIsPlaying]      = useState(false);
  const [activePosition, setActivePos] = useState<NotePosition | null>(null);
  const [currentNoteIndex, setNoteIdx] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopFlag   = useRef(false);
  const bpmRef     = useRef(bpm);
  const soundRef   = useRef(sound);
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);
  useEffect(() => { soundRef.current = sound; }, [sound]);

  const stop = useCallback(() => {
    stopFlag.current = true;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsPlaying(false);
    setActivePos(null);
    setNoteIdx(0);
  }, []);

  const play = useCallback((direction: PlayDirection, path: NotePosition[], loop = false) => {
    stop();
    stopFlag.current = false;

    const sequence = direction === 'desc' ? [...path].reverse() : path;

    setIsPlaying(true);

    let idx = 0;
    const tick = () => {
      if (stopFlag.current) {
        setIsPlaying(false);
        setActivePos(null);
        setNoteIdx(0);
        return;
      }
      if (idx >= sequence.length) {
        if (loop) { idx = 0; tick(); return; }
        setIsPlaying(false);
        setActivePos(null);
        setNoteIdx(0);
        return;
      }
      const ms = Math.round(60_000 / bpmRef.current);
      setActivePos(sequence[idx]);
      setNoteIdx(idx);
      previewNote(sequence[idx].stringIndex, sequence[idx].fret, soundRef.current);
      idx++;
      timeoutRef.current = setTimeout(tick, ms);
    };

    tick();
  }, [stop]);

  useEffect(() => () => { stop(); }, [stop]);

  return { isPlaying, activePosition, currentNoteIndex, play, stop };
}
