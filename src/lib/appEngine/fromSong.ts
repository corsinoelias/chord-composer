/**
 * A web song as commands for the app's engine (phase 4 of docs/motor-unico-wasm.md).
 *
 * The web's own functions decide what the song is — generateBarPattern renders each bar of
 * a style, resolveSectionPlayback composes a section's own arrangement, resolveVariation
 * picks its melodic lines — and this writes the result in the engine's terms: a step grid
 * per section and track, chords spelled for it, sounds mapped to the app's programs and kits
 * through the shared catalog (shared/catalog/sounds.json).
 *
 * Decided 2026-09-21 (option A): the app's engine and sounds are the reference. So where the
 * two differ in *how* they play — when fills fall, how loud a single chord tone is against a
 * block chord — the engine's way stands. What the song *is* (its chords, grooves, lines,
 * sounds, register and note lengths) comes across as the web wrote it.
 */
import soundCatalog from '../../../shared/catalog/sounds.json';
import { type Chord } from '../musicTheory';
import { type Section, type TrackId } from '../sections';
import {
  type StylePattern,
  generateBarPattern,
  getSlotsPerBar,
} from '../styles';
import { resolveSectionPlayback, type StyleLookup } from '../sectionPlayback';
import { resolveVariation, type BassScaleData } from '../bassScale';
import { getSoundType, isInstrumentAudible, type InstrumentState, type InstrumentType } from '../instruments';
import {
  DEGREE,
  DRUM_ROWS,
  NOTE_NAMES,
  SAMPLED_FIRST,
  TIMBRE,
  packStep,
  sampledDrum,
  type DrumRow,
  type EngineCommand,
  type MelodicTrack,
} from './commands';
import { type DrumKit } from './host';
import { type NoteLengths } from '../noteLengths';
import { styleSwingRatio } from '../swing';

/** The first of the engine's scale-degree step values (enum Degree, kScale1). */
const SCALE_DEGREE_1 = 8;
/**
 * A song gets sections 0-29 of the engine's 32: a single pass adds its silent bar after the
 * last (player.ts), and 31 is where previews keep their sounds (preview.ts).
 */
const MAX_SECTIONS = 30;
const MAX_CHORDS = 32;
const MAX_BARS = 4;
const MAX_STEPS_PER_BAR = 20; // kMaxStepsPerBar: a fill row's width
/** The kit when the catalog names one the app does not have: the app's own default. */
const DEFAULT_KIT = 2;
/**
 * The click: the app's cowbell (its count-in sound, and one of its metronome choices — the app's
 * own default is the stick, the web's is the cowbell, decided 2026-09-22).
 */
const CLICK_SLOT = 36;

/** The kit's internal balance, as the web engine had it: part of how a style is written. */
const DRUM_TRIM: Record<string, number> = { hihat: 0.7, hihatOpen: 0.8, hihatFoot: 0.6, ride: 0.7 };
/** The web's pieces, and the engine row each one plays on. */
const WEB_DRUMS: [web: string, row: DrumRow][] = [
  ['kick', 'kick'], ['snare', 'snare'], ['snareStick', 'rim'], ['hihat', 'hihat'], ['hihatOpen', 'hihatOpen'],
  ['hihatFoot', 'hihatFoot'], ['tom1', 'tom1'], ['tom2', 'tom2'], ['floorTom', 'floorTom'], ['ride', 'ride'], ['crash', 'crash'],
];
/**
 * The web's balance between instruments, kept. The same song through both engines, one
 * instrument at a time (reggaeton, default sounds, 2026-09-22), came out on the app's at
 * drums -0.5 dB, piano -4.5, guitar -2.9 and bass +2.3 against the web's: the guitar
 * disappeared under the kit. A fader stops at 1, so the loud ones come down to the piano
 * and the master makes up the difference (its default is 0.7).
 *
 * The guitar then goes 6 dB above that (2026-09-22, heard: "barely audible, not level with
 * the rest"). It sat about 10 dB under the piano on the web engine too, and the app's
 * guitars strike softer, so matching the web was matching a guitar nobody could hear. Now
 * it sits about 2 dB under the piano.
 */
const MIX_TRIM: Record<TrackId, number> = { drums: 0.6, piano: 1, guitar: 1.66, bass: 0.46 };
const MASTER = 1;
const MELODIC: MelodicTrack[] = ['piano', 'guitar', 'bass'];
const TRACKS: TrackId[] = ['drums', 'piano', 'guitar', 'bass'];

/** The two qualities the engine spells differently from the web (it names them like the app). */
const ENGINE_QUALITY: Record<string, string> = { min9: 'm9', min11: 'm11' };

export interface SongInput {
  sections: Section[];
  bpm: number;
  transposition?: number;
  instrumentSettings?: InstrumentState[];
  metronomeEnabled?: boolean;
  /** How long each track's notes ring, in steps (0 holds); absent, the web's own length. */
  noteLengths?: NoteLengths;
  /** The song's own swing ratio (app.swing), or absent for the rhythm's feel. */
  swing?: number;
  /** The fill on every bar, as the rhythm editor's Fill switch previews it; the engine adds none of its own. */
  fillEveryBar?: boolean;
}

export interface EngineSong {
  commands: EngineCommand[];
  /** Sixteenths the song lasts, for a file export. */
  steps: number;
  /** How many steps each chord of each section lasts in the engine, for the playhead. */
  chordSteps: number[][];
  /** Kit recordings the song plays (slots in kit.json): load them before playing. */
  drumSlots: number[];
  /** What could not be carried across, for the lab to show. */
  notes: string[];
}

type SoundEntry = { id: string; octaveOffset?: number; app?: { timbre?: number; program?: number; kit?: number } };
type CatalogTrack = { default: string; sounds: SoundEntry[]; legacy?: Record<string, SoundEntry['app']> };
const catalog = soundCatalog as unknown as Record<InstrumentType, CatalogTrack>;

function appSound(track: InstrumentType, id: string): SoundEntry['app'] | undefined {
  const block = catalog[track];
  return block.sounds.find((s) => s.id === id)?.app ?? block.legacy?.[id] ?? undefined;
}

function octaveOffsetOf(track: InstrumentType, id: string): number {
  return getSoundType(track, id)?.octaveOffset ?? catalog[track].sounds.find((s) => s.id === id)?.octaveOffset ?? 0;
}

const LETTER: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const mod12 = (n: number) => ((n % 12) + 12) % 12;
const pitchClass = (root: string, accidental: string) => mod12(LETTER[root] + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0));
function bassPitchClass(bass: string | undefined): number {
  if (!bass) return -1;
  const letter = bass[0]?.toUpperCase();
  if (!(letter in LETTER)) return -1;
  return pitchClass(letter, bass[1] === '#' ? '#' : bass[1] === 'b' ? 'b' : '');
}

/** A chord as the engine names it: root and slash bass as pitch classes (-1: none), and its quality. */
export function engineChord(chord: Pick<Chord, 'root' | 'accidental' | 'quality' | 'bassNote'>, transposition = 0): { root: number; quality: string; bass: number } {
  const bass = bassPitchClass(chord.bassNote);
  return {
    root: mod12(pitchClass(chord.root, chord.accidental) + transposition),
    quality: ENGINE_QUALITY[chord.quality] ?? chord.quality,
    bass: bass < 0 ? -1 : mod12(bass + transposition),
  };
}

/** Bars a lane may loop over: the engine plays patterns of 1, 2 or 4. */
function engineBars(bars: number): number {
  return bars >= 4 ? 4 : bars >= 2 ? 2 : 1;
}

/**
 * Everything [song] plays, as engine commands. [songStyle] is the song's resolved style
 * (overrides and live edits applied); [lookup] finds the styles sections name.
 */
export function songToEngine(song: SongInput, songStyle: StylePattern, lookup: StyleLookup, kits: DrumKit[]): EngineSong {
  const noted = new Set<string>();
  const notes = { push: (note: string) => noted.add(note) };
  const c: EngineCommand[] = [];
  const slotsPerBar = getSlotsPerBar(songStyle);
  const denominator = songStyle.timeSignature?.denominator ?? 4;
  const stepsPerBeat = Math.max(1, Math.round(16 / denominator));
  const transposition = song.transposition ?? 0;
  const instruments = song.instrumentSettings ?? [];
  const sections = song.sections.slice(0, MAX_SECTIONS);
  if (song.sections.length > MAX_SECTIONS) notes.push(`${song.sections.length - MAX_SECTIONS} sections past the engine's ${MAX_SECTIONS} left out`);

  // ── Time and the arrangement ──
  c.push(['setBpm', song.bpm], ['setMeter', slotsPerBar, stepsPerBeat]);
  // The song's own swing if it has one (the app's Straight/Light/Shuffle chip), else its
  // rhythm's feel — both as the engine's ratio between the two halves of the beat.
  c.push(['setSwing', song.swing ?? styleSwingRatio(songStyle)]);

  let steps = 0;
  const chordSteps: number[][] = [];
  c.push(['beginArrangement', sections.length]);
  sections.forEach((section, s) => {
    const chords: Chord[] = section.chords.slice(0, MAX_CHORDS);
    if (section.chords.length > MAX_CHORDS) notes.push(`${section.name}: ${section.chords.length - MAX_CHORDS} chords past ${MAX_CHORDS} left out`);
    c.push(['section', s, Math.max(1, section.repeatCount), false, chords.length]);
    let sectionSteps = 0;
    const lengths: number[] = [];
    chordSteps.push(lengths);
    chords.forEach((chord, i) => {
      const root = NOTE_NAMES[mod12(pitchClass(chord.root, chord.accidental) + transposition)];
      const bass = bassPitchClass(chord.bassNote);
      // A chord's length reaches the engine in half beats of the meter's beat — a quarter in
      // 4/4 and 3/4, an eighth in 6/8 — and the web counts it in quarters.
      const halfBeats = Math.max(1, Math.round((chord.duration * 8) / stepsPerBeat));
      c.push(['chord', s, i, root, ENGINE_QUALITY[chord.quality] ?? chord.quality, halfBeats, bass < 0 ? -1 : mod12(bass + transposition)]);
      const length = Math.max(1, Math.floor((halfBeats * stepsPerBeat) / 2));
      lengths.push(length);
      sectionSteps += length;
    });
    steps += sectionSteps * Math.max(1, section.repeatCount);
  });
  c.push(['commitArrangement']);

  // ── Each section's grooves, lines and sounds ──
  const drumSlots = new Set<number>([CLICK_SLOT]);
  const arpeggioTracks = new Set<string>();
  sections.forEach((section, s) => {
    const playback = resolveSectionPlayback(section, songStyle, lookup);
    const style = playback?.style ?? songStyle;
    const loopBars = engineBars(style.loopBars ?? 1);
    if ((style.loopBars ?? 1) === 3) notes.push(`${section.name}: a 3-bar groove plays as 4 bars in the engine`);
    // The bars exactly as the web renders them, fills aside (the engine plays those itself).
    const bars = Array.from({ length: loopBars }, (_, b) => generateBarPattern(style, b + 1, song.fillEveryBar ? 1 : Number.POSITIVE_INFINITY));

    // Drums.
    c.push(['clearTrack', s, 'drums'], ['setPatternBars', s, 'drums', loopBars]);
    bars.forEach((bar, b) => {
      for (const [web, row] of WEB_DRUMS) {
        const lane = (bar as unknown as Record<string, number[] | undefined>)[web];
        lane?.forEach((v, i) => {
          if (v > 0 && i < slotsPerBar) c.push(['setStep', s, 'drums', row, b * slotsPerBar + i, packStep(v * (DRUM_TRIM[web] ?? 1) * 255)]);
        });
      }
    });
    c.push(song.fillEveryBar ? ['setFill', s, 0, 0, []] : fillCommand(s, style, slotsPerBar));

    // Piano, guitar, bass.
    for (const track of MELODIC) {
      c.push(['clearTrack', s, track]);
      const variation = playback?.melodic
        ? playback.melodic[track]
        : songStyle.melodic?.[track]
          ? resolveVariation(songStyle.melodic[track], section[`${track}VariationId` as const])
          : null;
      if (variation) {
        writeVariation(c, s, track, variation, slotsPerBar, song.noteLengths?.[track] ?? 3);
      } else {
        c.push(['setPatternBars', s, track, loopBars], ['setNoteLength', s, track, song.noteLengths?.[track] ?? (track === 'bass' ? 2 : 3)]);
        bars.forEach((bar, b) => {
          const lane = (bar as unknown as Record<string, number[] | undefined>)[track];
          lane?.forEach((v, i) => {
            if (v <= 0 || i >= slotsPerBar) return;
            // Plain rhythm rows: the whole chord on piano and guitar, the root (the slash
            // bass when there is one) on the bass — eventBuilder.buildSlotEvents.
            if (track !== 'bass' && style.arpeggios?.[track]?.[i]) arpeggioTracks.add(track);
            c.push(['setStep', s, track, '', b * slotsPerBar + i, packStep(v * 255, track === 'bass' ? DEGREE.root : DEGREE.chord)]);
          });
        });
      }
    }

    // Sounds, register and silence.
    for (const track of TRACKS) {
      const setting = instruments.find((inst) => inst.id === track);
      const soundId = playback?.sounds?.[track] ?? setting?.soundTypeId ?? catalog[track].default;
      c.push(['setSilence', s, track, !!playback?.silenced?.[track]]);
      if (track === 'drums') {
        const kitIndex = appSound('drums', soundId)?.kit ?? DEFAULT_KIT;
        const kit = kits[kitIndex] ?? kits[DEFAULT_KIT];
        // The web's default kit ("standard") names a kit the app does not have; the app's own
        // default is the same acoustic kit, so only other sounds are worth a note.
        if (!kits[kitIndex] && soundId !== catalog.drums.default) notes.push(`drum sound "${soundId}" has no kit in the app; it plays ${kit?.name ?? 'the default kit'}`);
        for (const row of DRUM_ROWS) {
          const sound = kit?.rows[row];
          if (sound === undefined) continue;
          c.push(['setDrumSound', s, row, sound]);
          if (sound >= SAMPLED_FIRST) drumSlots.add(sound - SAMPLED_FIRST);
        }
        continue;
      }
      const app = appSound(track, soundId) ?? appSound(track, catalog[track].default);
      if (!appSound(track, soundId)) notes.push(`${track} sound "${soundId}" is not in the catalog; it plays the default`);
      c.push(['setTimbre', s, track, app?.timbre ?? TIMBRE.sampled]);
      if (app?.program !== undefined) c.push(['setProgram', s, track, app.program]);
      // The web writes every chord with its root in the octave from C4, then moves the
      // sound by its octaveOffset (a bass sits one to three octaves down). The engine puts
      // the root at the bottom of the track's window, so the window starts there.
      //
      // Except that the web's recorded basses (public/audio/bass/*) sound an octave below
      // the note their files are named for — "A2" is an A1, its partials at 110 and 165 Hz
      // — so every sampled bass on the web has always played an octave under its MIDI note,
      // and that is the bass people know. The app's basses are in tune, so they go down one.
      const recordedBass = track === 'bass' && !!getSoundType('bass', soundId)?.useSamples;
      const low = 60 + 12 * octaveOffsetOf(track, soundId) - (recordedBass ? 12 : 0);
      c.push(['voicing', s, track, low, low + 23]);
    }
  });
  if (arpeggioTracks.size) notes.push(`arpeggios on ${[...arpeggioTracks].join(' and ')} play as block chords (no built-in style arpeggiates; only a custom one can)`);

  // ── The mix ──
  const volumes = songStyle.volumes as Record<string, number | undefined>;
  for (const track of TRACKS) {
    const setting = instruments.find((inst) => inst.id === track);
    const styleVolume = volumes[track] ?? (track === 'guitar' ? volumes.piano : undefined) ?? 1;
    const volume = Math.max(0, Math.min(1, (setting?.volume ?? 1) * styleVolume * MIX_TRIM[track]));
    const audible = setting ? isInstrumentAudible(setting, instruments) : true;
    c.push(['mixer', track, volume, !audible]);
  }
  c.push(['mixer', 'master', MASTER, false]);
  c.push(['metronome', !!song.metronomeEnabled, 0.7, sampledDrum(CLICK_SLOT), true, 1]);
  // Dry, as the web always played (the mixer's reverb starts off, effects.ts), where the
  // engine's own default is a large room: left on, every note rang on for half a second.
  c.push(['reverb', 0.7, 0]);

  return { commands: c, steps, chordSteps, drumSlots: [...drumSlots].sort((a, b) => a - b), notes: [...noted] };
}

/**
 * A melodic variation: scale degrees counted from the chord's lowest note, as the web
 * plays them (bassScale.getScale). The engine holds two tones per step, so a slot the web
 * writes with more keeps the lowest two; a chord hit (every tone of the chord) wins.
 */
function writeVariation(c: EngineCommand[], s: number, track: MelodicTrack, variation: BassScaleData, slotsPerBar: number, noteLength: number) {
  const loop = engineBars(variation.loopBars ?? 1);
  const length = loop * slotsPerBar;
  c.push(['setPatternBars', s, track, loop], ['setNoteLength', s, track, noteLength]);
  const degrees = Object.keys(variation.pattern).map(Number).filter((d) => d >= 1 && d <= 8).sort((a, b) => a - b);
  const octave = (d: number) => variation.octaveOffsets?.[d as 1] ?? 0;
  for (let i = 0; i < length; i++) {
    const hit = variation.chordHit?.[i] ?? 0;
    if (hit > 0) {
      c.push(['setStep', s, track, '', i, packStep(hit * 255, DEGREE.chord)]);
      continue;
    }
    const playing = degrees.filter((d) => (variation.pattern[d as 1]?.[i] ?? 0) > 0);
    if (!playing.length) continue;
    const velocity = Math.max(...playing.map((d) => variation.pattern[d as 1]![i]));
    const [first, second] = playing;
    c.push(['setStep', s, track, '', i, packStep(
      velocity * 255,
      SCALE_DEGREE_1 + first - 1, octave(first),
      second ? SCALE_DEGREE_1 + second - 1 : 0, second ? octave(second) : 0,
    )]);
  }
}

/**
 * The style's fill: from its position to the end of the bar, each row it writes replaces the
 * groove's (silences included) and the rest keep playing — the same rule on both sides. When
 * it plays is the engine's: the end of every eighth bar of a section and of its last pass.
 */
function fillCommand(s: number, style: StylePattern, slotsPerBar: number): EngineCommand {
  const fill = style.fill;
  const steps = new Int32Array(DRUM_ROWS.length * MAX_STEPS_PER_BAR);
  let mask = 0;
  const pattern = (fill?.pattern ?? {}) as Record<string, number[] | undefined>;
  for (const [web, row] of WEB_DRUMS) {
    const lane = pattern[web]?.slice(0, slotsPerBar);
    if (!lane) continue;
    const index = DRUM_ROWS.indexOf(row);
    mask |= 1 << index;
    lane.forEach((v, i) => {
      if (v > 0 && i < MAX_STEPS_PER_BAR) steps[index * MAX_STEPS_PER_BAR + i] = packStep(v * (DRUM_TRIM[web] ?? 1) * 255);
    });
  }
  return ['setFill', s, mask ? Math.max(0, Math.min(slotsPerBar - 1, fill.position)) : 0, mask, Array.from(steps)];
}
