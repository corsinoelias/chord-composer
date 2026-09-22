/**
 * Lightweight progression auditioning for the marketing pages.
 *
 * The home page has dozens of independent play buttons (hero presets, explorer cards,
 * diatonic formulas). Mounting the full `PlaybackContext` + `scheduleProgression` stack
 * for each of them is the wrong shape: that engine exists to run one song with drums,
 * styles, sections and live parameter changes, and it loads drum samples on init.
 *
 * So this is a thin sequencer on top of the SAME audio primitives the editor uses --
 * `playChordHold` plays the app engine's piano (src/lib/appEngine/preview.ts). It is not a
 * second audio engine: there is no synthesis, mixing or scheduling logic here, only a
 * setTimeout loop deciding when to start and release chords that engine renders.
 *
 * Playback is a module-level singleton on purpose. Only one thing on the page should be
 * audible at a time, and every caller stopping "whatever is playing" without knowing who
 * started it is exactly what the UI needs.
 */
import { parseChordString } from './chordParser';
import { playChordHold, readyPreviews } from './appEngine/preview';
import { getTransposedChordName } from './chordNotes';
import type { Chord } from './musicTheory';

/** Beats each chord is held for. Matches the two-beat feel of the editor's pop styles. */
const BEATS_PER_CHORD = 2;

/** Fraction of the slot the chord actually sounds for, leaving a small gap before the next. */
const SUSTAIN_RATIO = 0.92;

type StepListener = (step: number) => void;

let timerId: number | null = null;
let releaseCurrent: (() => void) | null = null;
let playing = false;
/** Bumped by every start and stop, so a start still waiting on the engine knows it was superseded. */
let generation = 0;

/** Identifies the owner of the current playback so a card can ask "am I the one playing?". */
let currentOwner: string | null = null;

function releaseHeldChord(): void {
  if (releaseCurrent) {
    releaseCurrent();
    releaseCurrent = null;
  }
}

/** Stops whatever is currently sounding. Safe to call when nothing is playing. */
export function stopProgression(): void {
  playing = false;
  generation += 1;
  currentOwner = null;
  if (timerId !== null) {
    window.clearTimeout(timerId);
    timerId = null;
  }
  releaseHeldChord();
}

export function getPlayingOwner(): string | null {
  return currentOwner;
}

/**
 * Parses chord names, then loops them at `bpm` until `stopProgression` is called.
 *
 * Unparseable names are dropped rather than throwing -- the catalogs are hand-written
 * data, and one bad symbol should cost that chord, not the whole progression.
 */
export function playProgression(
  chordNames: string[],
  bpm: number,
  options: { owner?: string; onStep?: StepListener } = {},
): void {
  stopProgression();

  const parsed = chordNames
    .map((name) => parseChordString(name)[0])
    .filter((chord): chord is Chord => Boolean(chord));

  if (parsed.length === 0) return;

  playing = true;
  currentOwner = options.owner ?? null;

  const slotMs = (60 / bpm) * 1000 * BEATS_PER_CHORD;
  let step = 0;

  const advance = () => {
    if (!playing) return;

    const index = step % parsed.length;
    options.onStep?.(index);

    releaseHeldChord();
    releaseCurrent = playChordHold(parsed[index], 0.45);

    // Release just before the next chord starts so voices don't pile up across the loop.
    window.setTimeout(() => {
      if (playing) releaseHeldChord();
    }, slotMs * SUSTAIN_RATIO);

    step += 1;
    timerId = window.setTimeout(advance, slotMs);
  };

  // The first chord waits for the engine: the first time it has to download, and a sequence
  // timed from the tap released every chord before the engine could sound one (the first
  // Play on the home was silent). Called here, inside the tap, so the audio may start.
  const started = generation;
  readyPreviews().then(() => { if (playing && generation === started) advance(); }).catch(() => {});
}

/** One-shot audition of a single chord, for click-a-chord-tile interactions. */
export function playSingleChord(chordName: string, holdMs = 900): void {
  const chord = parseChordString(chordName)[0];
  if (!chord) return;

  // Held from when the engine can sound, not from the tap (see playProgression).
  readyPreviews().then(() => {
    const release = playChordHold(chord, 0.45);
    window.setTimeout(release, holdMs);
  }).catch(() => {});
}

/**
 * Compact suffixes for the marketing pages.
 *
 * The editor displays a chord using its canonical ChordQuality string, so a transposed
 * Dm7 comes back as "D♯min7". That is correct in the editor, but on a page whose catalogs
 * are hand-written as "Dm7" / "Cmaj7" / "Bbmaj9" it means the notation visibly changes
 * style the moment someone presses transpose. Rather than leave two conventions on screen,
 * EVERY chord name on these pages goes through `transposeChordName` -- including at zero
 * semitones -- so the spelling is identical before and after transposing.
 *
 * Only qualities whose canonical name differs from the common shorthand need an entry;
 * anything missing falls through to the canonical name unchanged.
 */
const COMPACT_QUALITY: Partial<Record<string, string>> = {
  maj: '', min: 'm', min6: 'm6', min7: 'm7', min9: 'm9', min11: 'm11', min13: 'm13',
  minMaj7: 'mMaj7', minadd9: 'madd9', dim: 'dim', aug: 'aug',
};

/** Sharp spelling (as the engine returns it) to the enharmonic flat, in ASCII. */
const SHARP_TO_FLAT: Record<string, string> = {
  'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb',
};

/**
 * Transposes a chord NAME by semitones, round-tripping through the editor's own parser so
 * the home page and the editor agree on which chord this is. Returns the input untouched
 * when it cannot be parsed.
 *
 * The result is ASCII ("D#m7", "Bbmaj9"), NOT the ♯/♭ typography shown on screen. That
 * distinction is load-bearing: this string is fed back into parseChordString for playback
 * and MIDI/WAV export, and into the editor's `?chords=` deep link. parseChordString only
 * recognises '#' and 'b', and it fails SILENTLY -- "D♯m7" parses as plain D major, so a
 * Unicode name here would play and export the wrong chord with nothing to show for it.
 * Anything user-visible goes through displayChordName instead.
 *
 * Sharp-vs-flat spelling follows the SOURCE chord: the engine always hands back sharps, so
 * "Bbmaj9" would come back as "A#maj9" without this. Correct spelling really depends on the
 * key, which nothing in the app tracks, and guessing from the pitch class alone is worse
 * than useless -- it would rewrite the C#m of an E major progression as Dbm. Inheriting the
 * source's own accidental keeps every catalog entry spelled the way it was written, and
 * keeps a transposed flat-key progression in flats.
 */
export function transposeChordName(chordName: string, semitones: number): string {
  const chord = parseChordString(chordName)[0];
  if (!chord) return chordName;

  // getTransposedChordName returns "<root><♯ accidental><canonical quality>[/bass]".
  const engineName = getTransposedChordName(chord, semitones).replace(/♯/g, '#');

  const match = engineName.match(/^([A-G]#?)(.*)$/);
  if (!match) return engineName;

  const [, root, rest] = match;
  const [quality, bass] = rest.split('/');
  const flatten = (note: string) => (chord.accidental === 'b' ? SHARP_TO_FLAT[note] ?? note : note);

  return `${flatten(root)}${COMPACT_QUALITY[quality] ?? quality}${bass ? `/${flatten(bass)}` : ''}`;
}

/**
 * Typographic form of a chord name, for rendering only. Never feed the result back into
 * anything that parses chords -- see transposeChordName.
 *
 * Rewrites the accidental attached to the ROOT and, for a slash chord, the one on the
 * BASS note ("A/C#" -> "A/C♯"): both are note names, so styling one and not the other
 * looked like a bug on the Oceans card. The 'b' in an altered quality ("7b5", "7b9")
 * stays ASCII -- it reads fine, and telling those apart would mean re-implementing
 * quality parsing here just to know which 'b' is which.
 */
const prettyAccidental = (root: string, accidental: string) =>
  `${root}${accidental === '#' ? '♯' : '♭'}`;

export function displayChordName(chordName: string): string {
  const [chord, bass] = chordName.split('/');
  const prettyChord = chord.replace(/^([A-G])([#b])/, (_, r: string, a: string) => prettyAccidental(r, a));
  if (bass === undefined) return prettyChord;
  return `${prettyChord}/${bass.replace(/^([A-G])([#b])$/, (_, r: string, a: string) => prettyAccidental(r, a))}`;
}

/** Chords as the `?chords=` deep-link parameter the editor expects. */
export function toEditorChordParam(chordNames: string[]): string {
  return chordNames.join('-');
}
