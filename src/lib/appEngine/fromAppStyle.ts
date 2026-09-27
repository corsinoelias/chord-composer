/**
 * A rhythm of the app's (appStyles.ts) as engine commands, and its intro and ending as sections
 * of a song.
 *
 * The app sends a section the same way (audio_engine.dart: _sendSectionPatterns, _fillArguments,
 * the sounds): every row of every track, variation A in bank 0 and B in bank 1, each with its
 * fill; the kit's sounds per row; each track's register and note length. The steps are the
 * app's own packed values, so nothing is interpreted on the way.
 */
import { type AppFill, type AppPart, type AppPatterns, type AppStyle, type AppVariation, appStepsPerBar } from '../appStyles';
import { type Chord, type ChordQuality, type RootNote, type Accidental, createChord } from '../musicTheory';
import { type Section, generateSectionId } from '../sections';
import { DRUM_ROWS, GM_PERC_FIRST, SAMPLED_FIRST, type EngineCommand, type MelodicTrack, type Track } from './commands';

const ENGINE_TRACKS: Track[] = ['drums', 'piano', 'guitar', 'bass', 'synth'];
const MELODIC: MelodicTrack[] = ['piano', 'guitar', 'bass', 'synth'];
/** kMaxStepsPerBar: a fill row's width. */
const FILL_WIDTH = 20;
/** The fill's rows after the kit's (kFillRows): one per melodic track. */
const FILL_LANES = [...DRUM_ROWS, ...MELODIC];

const bars = (n: number | undefined) => ((n ?? 1) >= 4 ? 4 : (n ?? 1) >= 2 ? 2 : 1);

function writePatterns(c: EngineCommand[], s: number, patterns: AppPatterns, patternBars: Record<string, number>, bank: number) {
  for (const track of ENGINE_TRACKS) {
    c.push(['clearTrack', s, track, bank], ['setPatternBars', s, track, bars(patternBars[track]), bank]);
    for (const [row, lane] of Object.entries(patterns[track] ?? {})) {
      lane.forEach((value, step) => {
        if (value) c.push(['setStep', s, track, row, step, value, bank]);
      });
    }
  }
}

export function appFillCommand(s: number, fill: AppFill | undefined, bank: number): EngineCommand {
  const steps = new Array<number>(FILL_LANES.length * FILL_WIDTH).fill(0);
  let mask = 0;
  if (fill) {
    FILL_LANES.forEach((lane, row) => {
      const values = fill.lanes[lane];
      if (!values) return;
      mask |= 1 << row;
      for (let i = 0; i < FILL_WIDTH && i < values.length; i++) steps[row * FILL_WIDTH + i] = values[i];
    });
  }
  return ['setFill', s, fill?.from ?? 0, mask, steps, bank];
}

function writeVariation(c: EngineCommand[], s: number, variation: AppVariation | undefined, bank: number) {
  writePatterns(c, s, variation?.patterns ?? {}, variation?.patternBars ?? {}, bank);
  c.push(appFillCommand(s, variation?.fill, bank));
}

/** A web section's bank B emptied, so nothing a rhythm of these left there ever sounds under a web style. */
export function clearVariationB(c: EngineCommand[], s: number) {
  writeVariation(c, s, undefined, 1);
  c.push(['setVariation', s, 0]);
}

/**
 * The kit's sounds for a section playing [style]: every row, the style's where it names one.
 * [slots] collects the recordings that have to be loaded.
 */
function writeDrumSounds(c: EngineCommand[], s: number, style: AppStyle, kitRows: Record<string, number> | undefined, slots: Set<number>) {
  for (const row of DRUM_ROWS) {
    const sound = style.drumSounds[row] ?? kitRows?.[row];
    if (sound === undefined) continue;
    c.push(['setDrumSound', s, row, sound]);
    if (sound >= SAMPLED_FIRST && sound < GM_PERC_FIRST) slots.add(sound - SAMPLED_FIRST);
  }
}

/** Register and note length per melodic track, as the style has them. */
function writeTrackFeel(c: EngineCommand[], s: number, style: AppStyle) {
  for (const track of MELODIC) {
    const low = style.voicings[track];
    if (low !== undefined) c.push(['voicing', s, track, low, low + 23]);
    const length = style.noteLengths[track];
    if (length !== undefined) c.push(['setNoteLength', s, track, length]);
  }
}

/**
 * A section playing [style]: A in bank 0, B (or nothing) in bank 1, both fills, the kit's
 * sounds, the tracks' register and note length, and which variation it starts on.
 */
export function writeAppStyle(
  c: EngineCommand[], s: number, style: AppStyle, variation: 0 | 1, kitRows: Record<string, number> | undefined, slots: Set<number>,
) {
  writeVariation(c, s, style.a, 0);
  writeVariation(c, s, style.b, 1);
  c.push(['setVariation', s, style.b && variation === 1 ? 1 : 0]);
  writeDrumSounds(c, s, style, kitRows, slots);
  writeTrackFeel(c, s, style);
}

/** A section that is one part of [style]'s intro or ending: that part's patterns, no fill, no B. */
export function writeAppPart(
  c: EngineCommand[], s: number, style: AppStyle, part: AppPart, kitRows: Record<string, number> | undefined, slots: Set<number>,
) {
  writePatterns(c, s, part.patterns, part.patternBars, 0);
  c.push(appFillCommand(s, undefined, 0));
  clearVariationB(c, s);
  writeDrumSounds(c, s, style, kitRows, slots);
  writeTrackFeel(c, s, style);
}

/** The part a section stands for, when it is an intro or ending a rhythm of these added. */
export function partOf(style: AppStyle | undefined, section: Pick<Section, 'stylePart'>): AppPart | undefined {
  const part = section.stylePart;
  if (!style || !part || part.styleId !== style.id) return undefined;
  return (part.kind === 'intro' ? style.intro : style.ending)?.[part.index];
}

// ── Intro and ending as sections ──

const SHARP_NAMES: [RootNote, Accidental][] = [
  ['C', ''], ['C', '#'], ['D', ''], ['D', '#'], ['E', ''], ['F', ''], ['F', '#'], ['G', ''], ['G', '#'], ['A', ''], ['A', '#'], ['B', ''],
];
const FLAT_NAMES: [RootNote, Accidental][] = [
  ['C', ''], ['D', 'b'], ['D', ''], ['E', 'b'], ['E', ''], ['F', ''], ['G', 'b'], ['G', ''], ['A', 'b'], ['A', ''], ['B', 'b'], ['B', ''],
];
/** The app's chord types the web spells otherwise. */
const WEB_QUALITY: Record<string, string> = { m9: 'min9', m11: 'min11' };

/**
 * [style]'s intro or ending as sections of a song in the key whose tonic is [tonic] (a pitch
 * class): the parts are written from C major, so a minor key takes them on its relative major,
 * where the same chords belong — as the app does.
 */
export function appPartSections(style: AppStyle, kind: 'intro' | 'ending', tonic: number, minor: boolean, flats: boolean): Section[] {
  const root = (tonic + (minor ? 3 : 0)) % 12;
  const names = flats ? FLAT_NAMES : SHARP_NAMES;
  // A chord's beats are the meter's; the web counts a chord in quarter notes.
  const quarters = 4 / style.meter.unit;
  return (kind === 'intro' ? style.intro : style.ending)?.map((part, index): Section => ({
    id: generateSectionId(),
    name: part.name,
    repeatCount: 1,
    chords: part.chords.map((ch): Chord => {
      const [letter, accidental] = names[(root + ch.interval) % 12];
      return createChord(letter, accidental, (WEB_QUALITY[ch.type] ?? ch.type) as ChordQuality, ch.beats * quarters);
    }),
    stylePart: { styleId: style.id, kind, index },
  })) ?? [];
}

export { appStepsPerBar };
