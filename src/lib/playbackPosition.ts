import { useEffect, useRef } from 'react';
import { type Section } from './sections';

const chordBeats = (s: Section, i: number) => s.chords[i]?.duration ?? 4;
const passBeats = (s: Section) => s.chords.reduce((sum, c) => sum + (c.duration ?? 4), 0);

/** Where the chord under the playhead sits, measured in beats rather than in chords. */
export interface ChordPosition {
  sectionIndex: number;
  /** Beats of the whole section, every repeat included. */
  sectionBeats: number;
  /** Beats into the section at which the current chord starts. */
  chordStartInSection: number;
  /** Beats of the song before this section starts (0 while looping one section). */
  sectionStartInSong: number;
  /** Beats of everything that is playing: the whole song, or the looped section. */
  totalBeats: number;
  chordBeats: number;
}

/**
 * Translates `currentChordIndex` — a count of chords, repeats unrolled — into beats.
 *
 * Progress used to be `chords played / chords total`, so a two-beat chord and an
 * eight-beat one moved the bar by the same amount, and nothing moved at all in between.
 * Beats are what the ear follows; this is the arithmetic both progress displays share.
 */
export function chordPosition(
  sections: Section[],
  currentChordIndex: number,
  loopingSectionIndex: number | null,
): ChordPosition | null {
  if (currentChordIndex < 0) return null;

  let remaining = currentChordIndex;
  let beatsBefore = 0;
  let found = -1;
  for (let i = 0; i < sections.length; i++) {
    const span = sections[i].chords.length * sections[i].repeatCount;
    if (loopingSectionIndex !== null ? i === loopingSectionIndex : span > 0 && remaining < span) {
      found = i;
      break;
    }
    remaining -= span;
    beatsBefore += passBeats(sections[i]) * sections[i].repeatCount;
  }
  const section = sections[found];
  if (!section || section.chords.length === 0) return null;

  const span = section.chords.length * section.repeatCount;
  const local = ((remaining % span) + span) % span;
  const pass = Math.floor(local / section.chords.length);
  const idx = local % section.chords.length;
  let start = pass * passBeats(section);
  for (let i = 0; i < idx; i++) start += chordBeats(section, i);

  const sectionBeats = passBeats(section) * section.repeatCount;
  const songBeats = sections.reduce((sum, s) => sum + passBeats(s) * s.repeatCount, 0);
  const looping = loopingSectionIndex !== null;
  return {
    sectionIndex: found,
    sectionBeats,
    chordStartInSection: start,
    sectionStartInSong: looping ? 0 : beatsBefore,
    totalBeats: looping ? sectionBeats : songBeats,
    chordBeats: chordBeats(section, idx),
  };
}

/**
 * Glides a value from `from` to `to` over `ms`, restarting whenever `key` changes, and
 * hands every frame's value to `apply` — which writes straight to the DOM.
 *
 * Deliberately not React state: the position moves 60 times a second, and re-rendering
 * anything near the editor at that rate is what made the audio crackle (see the note on
 * currentStep in Index.tsx). `apply` is read through a ref, so it may be an inline arrow.
 */
export function useGlide(
  tween: { key: string | number; from: number; to: number; ms: number } | null,
  apply: (value: number) => void,
): void {
  const applyRef = useRef(apply);
  applyRef.current = apply;

  const key = tween?.key;
  const from = tween?.from ?? 0;
  const to = tween?.to ?? 0;
  const ms = tween?.ms ?? 0;

  useEffect(() => {
    if (key === undefined) {
      applyRef.current(0);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = ms > 0 ? Math.min(1, (now - start) / ms) : 1;
      applyRef.current(from + (to - from) * t);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // `from`/`to`/`ms` belong to the chord `key` names; a new chord brings a new key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
