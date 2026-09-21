/**
 * Turns one 16th-note slot into the notes that should sound in it.
 *
 * Pure: no Web Audio, no module state, no clock. Given the same slot context it returns the
 * same events, which is what lets live playback and the offline WAV render share it — they
 * differ only in what they do with the events afterwards.
 *
 * Everything musical lives here: rhythm patterns, melodic variations, arpeggios, chord
 * hits, the kit's internal balance. Everything about *sound* stays out: no sound types, no
 * octave offsets, no envelopes, no frequencies.
 */

import { type StylePattern, type generateBarPattern, type ArpeggioType, type ArpeggioSpeed } from '../styles';
import { type BassScaleData, type Degree, getScale } from '../bassScale';
import { type MusicalEvent, type EventInstrument, type DrumPiece } from './types';

export type BarPattern = ReturnType<typeof generateBarPattern>;

/**
 * How long each track's notes ring, in slots — the Android app's "note length", stored
 * with the song as app.noteLengths. 0 holds a note until the track strikes again or the
 * chord changes (the app's "Hold"). A track left out keeps the web's own length: 3 slots,
 * 2 for a plain root-note bass.
 */
export type NoteLengths = Partial<Record<EventInstrument, number>>;

export interface SlotContext {
  /** Absolute start time of this slot, swing already applied. */
  slotTime: number;
  slotDuration: number;
  /** Continuous slot counter since playback started — melodic loops key off this. */
  currentGlobalSlot: number;
  /** Position within the bar (0..slotsPerBar-1). */
  patternSlot: number;
  slotsPerBar: number;
  /** Chord tones in MIDI, transposition already applied. */
  midiNotes: number[];
  chordQuality: string;
  pattern: BarPattern;
  style: StylePattern;
  /** Resolved variation per instrument, or null to fall back to the style's rhythm. */
  melodic: {
    piano: BassScaleData | null;
    bass: BassScaleData | null;
    guitar: BassScaleData | null;
  };
  /** The song's note lengths; absent, every track keeps the web's own. */
  noteLengths?: NoteLengths;
  /** Slots from this one to the end of the sounding chord, this one included. */
  slotsLeftInChord?: number;
  /** Muted or non-solo instruments produce no events at all. */
  audible: {
    piano: boolean;
    bass: boolean;
    drums: boolean;
    guitar: boolean;
  };
}

/**
 * The kit's internal balance. Not a mixer level — these are what makes a hi-hat sit under
 * a snare within the same kit, so they belong with the pattern, not with the fader.
 */
const DRUM_TRIM: Partial<Record<DrumPiece, number>> = {
  hihat: 0.7,
  hihatOpen: 0.8,
  hihatFoot: 0.6,
  ride: 0.7,
};

const DRUM_PIECES: DrumPiece[] = [
  'kick', 'snare', 'snareStick', 'hihat', 'hihatOpen', 'hihatFoot',
  'tom1', 'tom2', 'floorTom', 'ride', 'crash',
];

/**
 * Reorders a chord's notes for an arpeggio. Moved verbatim from audioEngine.ts — this is
 * musical logic, so it belongs with the builder rather than with the audio code.
 */
export function applyArpeggioOrder(midiNotes: number[], type: ArpeggioType): number[] {
  const sorted = [...midiNotes].sort((a, b) => a - b); // Low to high

  switch (type) {
    case 'up':
      return sorted;
    case 'down':
      return sorted.reverse();
    case 'updown': {
      // Up then down, without repeating the top note
      if (sorted.length <= 2) return sorted;
      const down = sorted.slice(0, -1).reverse();
      return [...sorted, ...down];
    }
    case 'random': {
      // Fisher-Yates shuffle
      const shuffled = [...sorted];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
    }
    default:
      return sorted;
  }
}

/** Gets the number of notes to play per slot based on arpeggio speed. */
export function getArpeggioNotesPerSlot(speed: ArpeggioSpeed): number {
  switch (speed) {
    case 'slow': return 2;
    case 'normal': return 4;
    case 'fast': return 8;
    case 'veryfast': return 16;
    default: return 4;
  }
}

/** A note's length in seconds: the song's for this track, or the web's own [ownSlots]. */
function noteSeconds(cx: SlotContext, instrument: EventInstrument, ownSlots: number, nextHit: () => number): number {
  const set = cx.noteLengths?.[instrument];
  if (set === undefined) return cx.slotDuration * ownSlots;
  if (set > 0) return cx.slotDuration * set;
  // Held: until the track strikes again in this bar, or the chord ends, whichever is first.
  const left = cx.slotsLeftInChord ?? cx.slotsPerBar;
  return cx.slotDuration * Math.max(1, Math.min(left, nextHit()));
}

/** Slots to the lane's next hit in this bar, or Infinity if it has none. */
function nextInLane(lane: number[] | undefined, cx: SlotContext): number {
  for (let j = cx.patternSlot + 1; j < cx.slotsPerBar; j++) if ((lane?.[j] ?? 0) > 0) return j - cx.patternSlot;
  return Number.POSITIVE_INFINITY;
}

/** Slots to a variation's next note, round its loop, or Infinity if it plays only this one. */
function nextInVariation(data: BassScaleData, cx: SlotContext): number {
  const length = data.loopBars * cx.slotsPerBar;
  const at = cx.currentGlobalSlot % length;
  for (let k = 1; k < length; k++) {
    const i = (at + k) % length;
    if ((data.chordHit?.[i] ?? 0) > 0) return k;
    if (Object.values(data.pattern).some((lane) => (lane?.[i] ?? 0) > 0)) return k;
  }
  return Number.POSITIVE_INFINITY;
}

/**
 * Melodic variations address notes by scale degree rather than by chord tone, so a
 * variation written once works over any chord quality.
 */
function pushMelodicNotes(
  out: MusicalEvent[],
  instrument: EventInstrument,
  data: BassScaleData,
  cx: SlotContext,
  durationSec: number,
): void {
  const slotInLoop = cx.currentGlobalSlot % (data.loopBars * cx.slotsPerBar);
  const scale = getScale(cx.chordQuality);

  // A chord hit sounds every tone of the actual chord (7ths, 9ths and all), which no
  // single scale degree can express.
  const chordHitVelocity = data.chordHit?.[slotInLoop] ?? 0;
  if (chordHitVelocity > 0) {
    for (const midi of cx.midiNotes) {
      out.push({ kind: 'note', instrument, time: cx.slotTime, midi, durationSec, velocity: chordHitVelocity });
    }
  }

  for (const degStr of Object.keys(data.pattern)) {
    const deg = Number(degStr) as Degree;
    const velocity = data.pattern[deg]?.[slotInLoop] ?? 0;
    if (velocity <= 0) continue;
    const midi = cx.midiNotes[0] + scale[deg - 1] + (data.octaveOffsets?.[deg] ?? 0) * 12;
    out.push({ kind: 'note', instrument, time: cx.slotTime, midi, durationSec, velocity });
  }
}

/**
 * The style's own rhythm row for a chordal instrument: either an arpeggio spread across the
 * slot, or every chord tone struck together.
 */
function pushChordalNotes(
  out: MusicalEvent[],
  instrument: EventInstrument,
  velocity: number,
  cx: SlotContext,
  durationSec: number,
): void {
  const arpeggio = instrument === 'piano'
    ? cx.style.arpeggios?.piano?.[cx.patternSlot] ?? null
    : cx.style.arpeggios?.guitar?.[cx.patternSlot] ?? null;

  if (arpeggio && cx.midiNotes.length > 1) {
    const ordered = applyArpeggioOrder(cx.midiNotes, arpeggio.type);
    const notesPerSlot = getArpeggioNotesPerSlot(arpeggio.speed);
    const noteDuration = cx.slotDuration / notesPerSlot;
    for (let i = 0; i < notesPerSlot; i++) {
      out.push({
        kind: 'note',
        instrument,
        time: cx.slotTime + i * noteDuration,
        midi: ordered[i % ordered.length],
        // Overlap the next note slightly so a fast arpeggio doesn't machine-gun.
        durationSec: noteDuration * 1.5,
        velocity,
      });
    }
    return;
  }

  for (const midi of cx.midiNotes) {
    out.push({ kind: 'note', instrument, time: cx.slotTime, midi, durationSec, velocity });
  }
}

/**
 * Every note that should sound in this slot, across all four instruments.
 * Returns an empty array for a silent slot.
 */
export function buildSlotEvents(cx: SlotContext): MusicalEvent[] {
  const out: MusicalEvent[] = [];
  const { pattern, patternSlot } = cx;

  // ── Piano ──────────────────────────────────────────────────────────────────
  if (cx.audible.piano) {
    if (cx.melodic.piano) {
      const data = cx.melodic.piano;
      pushMelodicNotes(out, 'piano', data, cx, noteSeconds(cx, 'piano', 3, () => nextInVariation(data, cx)));
    } else {
      const velocity = pattern.piano[patternSlot];
      if (velocity > 0) pushChordalNotes(out, 'piano', velocity, cx, noteSeconds(cx, 'piano', 3, () => nextInLane(pattern.piano, cx)));
    }
  }

  // ── Bass ───────────────────────────────────────────────────────────────────
  if (cx.audible.bass) {
    if (cx.melodic.bass) {
      const data = cx.melodic.bass;
      pushMelodicNotes(out, 'bass', data, cx, noteSeconds(cx, 'bass', 3, () => nextInVariation(data, cx)));
    } else {
      const velocity = pattern.bass[patternSlot];
      if (velocity > 0) {
        // Root only, and shorter than the melodic case — that is the style's plain
        // root-note bass, not a line.
        out.push({
          kind: 'note',
          instrument: 'bass',
          time: cx.slotTime,
          midi: cx.midiNotes[0],
          durationSec: noteSeconds(cx, 'bass', 2, () => nextInLane(pattern.bass, cx)),
          velocity,
        });
      }
    }
  }

  // ── Drums ──────────────────────────────────────────────────────────────────
  if (cx.audible.drums) {
    for (const piece of DRUM_PIECES) {
      const raw = pattern[piece]?.[patternSlot] ?? 0;
      if (raw <= 0) continue;
      out.push({ kind: 'drum', time: cx.slotTime, piece, velocity: raw * (DRUM_TRIM[piece] ?? 1) });
    }
  }

  // ── Guitar ─────────────────────────────────────────────────────────────────
  if (cx.audible.guitar) {
    if (cx.melodic.guitar) {
      const data = cx.melodic.guitar;
      pushMelodicNotes(out, 'guitar', data, cx, noteSeconds(cx, 'guitar', 3, () => nextInVariation(data, cx)));
    } else {
      const velocity = pattern.guitar?.[patternSlot] ?? 0;
      if (velocity > 0) pushChordalNotes(out, 'guitar', velocity, cx, noteSeconds(cx, 'guitar', 3, () => nextInLane(pattern.guitar, cx)));
    }
  }

  return out;
}
