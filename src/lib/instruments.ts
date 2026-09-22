/**
 * The sounds a song can play — the list the app and the web share (docs/sonidos-comunes.md §7e,
 * heard one by one in /lab/sounds/ on 2026-09-22 and voted).
 *
 * Every sound is either a program of the shipped SoundFont (`program`, bank 0) or one of the
 * app's synthesised timbres (`timbre`); a kit is an index into the app's drumKits. Nothing here
 * describes an oscillator any more: the web's own audio engine was removed on 2026-09-22 and
 * everything sounds through the app's engine (src/lib/appEngine/).
 *
 * `npm run shared:export` writes this list to shared/catalog/sounds.json, which the app reads,
 * and `npm run engine:sync` cuts the SoundFont down to exactly the programs named here.
 */

import { TIMBRE } from './appEngine/commands';
import gainTable from './soundGains.json';

export type InstrumentType = 'piano' | 'bass' | 'drums' | 'guitar';

export interface InstrumentConfig {
  id: InstrumentType;
  name: string;
  soundTypes: SoundType[];
  defaultSoundType: string;
}

export interface SoundType {
  id: string;
  name: string;
  /** A General MIDI program of the shipped SoundFont (bank 0). */
  program?: number;
  /** One of the app's synthesised timbres, when the sound is not in the SoundFont. */
  timbre?: number;
  /** Drums only: which of the app's kits (drumKits in the app's constants.dart). */
  kit?: number;
  /** Octaves the sound plays from the web's own window, whose root octave is C4 (60). */
  octaveOffset: number;
  /** One of the web's own recordings (public/audio/), shipped inside the SoundFont. */
  recorded?: boolean;
}

export interface InstrumentState {
  id: InstrumentType;
  muted: boolean;
  solo: boolean;
  volume: number; // 0-1
  soundTypeId: string;
}

/**
 * The programs the web's recordings are written into when the SoundFont is built
 * (scripts/build-recordings.mjs): above General MIDI's 0-127 range of names, so they can never
 * collide with a program of the app's SoundFont.
 */
export const RECORDED_FIRST = 100;

export const INSTRUMENTS: InstrumentConfig[] = [
  {
    id: 'piano',
    name: 'Piano',
    defaultSoundType: 'grand',
    soundTypes: [
      { id: 'grand', name: 'Grand Piano', program: 0, octaveOffset: 0 },
      { id: 'epiano', name: 'Electric Piano', program: 4, octaveOffset: 0 },
      { id: 'rhodes', name: 'Rhodes', program: 5, octaveOffset: 0 },
      { id: 'organ', name: 'Organ', program: 16, octaveOffset: 0 },
      { id: 'honkytonk', name: 'Honky-Tonk', program: 3, octaveOffset: 0 },
      { id: 'strings', name: 'Strings', program: 48, octaveOffset: 0 },
      { id: 'pad', name: 'Warm Pad', program: 89, octaveOffset: 0 },
      { id: 'organ-syn', name: 'Organ (synth)', timbre: 3, octaveOffset: 0 },
      { id: 'pad-syn', name: 'Pad (synth)', timbre: 4, octaveOffset: 0 },
    ],
  },
  {
    id: 'guitar',
    name: 'Guitar',
    defaultSoundType: 'clean',
    soundTypes: [
      { id: 'steel', name: 'Acoustic', program: 25, octaveOffset: 0 },
      { id: 'steel-rec', name: 'Acoustic (recorded)', program: RECORDED_FIRST, octaveOffset: 0, recorded: true },
      { id: 'nylon', name: 'Nylon', program: 24, octaveOffset: 0 },
      { id: 'nylon-rec', name: 'Nylon (recorded)', program: RECORDED_FIRST + 2, octaveOffset: 0, recorded: true },
      { id: 'clean', name: 'Electric Clean', program: 27, octaveOffset: 0 },
      { id: 'clean-rec', name: 'Electric (recorded)', program: RECORDED_FIRST + 1, octaveOffset: 0, recorded: true },
      { id: 'jazz', name: 'Jazz', program: 26, octaveOffset: 0 },
      { id: 'overdrive', name: 'Overdrive', program: 29, octaveOffset: 0 },
      { id: 'distortion', name: 'Distortion', program: 30, octaveOffset: 0 },
    ],
  },
  {
    id: 'bass',
    name: 'Bass',
    // Every bass plays from C2: the window the web has always played its bass in.
    defaultSoundType: 'fender-rec',
    soundTypes: [
      { id: 'finger', name: 'Finger', program: 33, octaveOffset: -2 },
      { id: 'pick', name: 'Pick', program: 34, octaveOffset: -2 },
      { id: 'fender-rec', name: 'Fender (recorded)', program: RECORDED_FIRST + 3, octaveOffset: -2, recorded: true },
      { id: 'slap', name: 'Slap', program: 36, octaveOffset: -2 },
      { id: 'slap-rec', name: 'Slap (recorded)', program: RECORDED_FIRST + 4, octaveOffset: -2, recorded: true },
      { id: 'upright', name: 'Upright', program: 32, octaveOffset: -2 },
      { id: 'fretless', name: 'Fretless', program: 35, octaveOffset: -2 },
      { id: 'reese', name: 'Reese', timbre: 11, octaveOffset: -2 },
      { id: 'square', name: 'Square', timbre: 12, octaveOffset: -2 },
    ],
  },
  {
    id: 'drums',
    name: 'Drums',
    // The kits are all recorded, and already level with each other (the app's drum_gains.dart),
    // so none of them carries a gain of its own.
    defaultSoundType: 'acoustic',
    soundTypes: [
      { id: 'acoustic', name: 'Acoustic', kit: 2, octaveOffset: 0 },
      { id: 'acoustic2', name: 'Acoustic 2', kit: 3, octaveOffset: 0 },
      { id: 'electronic', name: 'Electronic', kit: 4, octaveOffset: 0 },
      { id: 'ap1', name: 'AP1', kit: 5, octaveOffset: 0 },
      { id: 'brutalist', name: 'Brutalist', kit: 6, octaveOffset: 0 },
      { id: 'chase', name: 'Chase', kit: 7, octaveOffset: 0 },
      { id: 'runit', name: 'Run It', kit: 8, octaveOffset: 0 },
    ],
  },
];

/**
 * What a sound id saved before the shared list (2026-09-22) plays now. Some ids kept their
 * name and lost their meaning — the web's `slap` was its own recording, and `slap` is now the
 * SoundFont's — so this is read by song schema version (migrateLegacySong), not by whether the
 * id still exists.
 */
export const LEGACY_SOUND_IDS: Record<InstrumentType, Record<string, string>> = {
  // The web offered the same grand piano four times over; `synth` was never a sound of its
  // own — six rhythms named it and a grand piano is what played.
  piano: {
    sampled: 'grand', acoustic: 'grand', soft: 'grand', upright: 'grand', bright: 'grand',
    electric: 'epiano', synth: 'grand',
  },
  // The recordings keep the songs that used them sounding the same; the `sf2-` ones are the
  // SoundFont's, which now go by their own name.
  guitar: {
    acoustic: 'steel-rec', electric: 'clean-rec', nylon: 'nylon-rec',
    'sf2-steel': 'steel', 'sf2-nylon': 'nylon', 'sf2-clean': 'clean', 'sf2-jazz': 'jazz',
    'sf2-muted': 'clean', 'sf2-overdrive': 'overdrive', 'sf2-distortion': 'distortion',
    'sf2-harmonics': 'overdrive',
  },
  // The web's own Finger and Muted recordings did not make the list; the SoundFont's Finger
  // takes their place. Sub was dropped, and Reese is the synthesised bass nearest to it.
  bass: {
    fender: 'fender-rec', slap: 'slap-rec', finger: 'finger', muted: 'finger',
    synth: 'square', sub: 'reese', electric: 'square', picked: 'pick',
  },
  // `standard` was the app's kit 9, the web's own recordings, which the list drops in favour of
  // the app's seven.
  drums: {
    standard: 'acoustic2', analog: 'acoustic2', lofi: 'acoustic2', punch: 'electronic',
    rock: 'acoustic2', jazz: 'acoustic', electronic: 'electronic',
  },
};

/** The id a sound saved before the shared list plays as; unknown ids fall back to the default. */
export function migrateSoundId(instrumentId: InstrumentType, soundTypeId: string): string {
  const mapped = LEGACY_SOUND_IDS[instrumentId]?.[soundTypeId];
  if (mapped) return mapped;
  const instrument = getInstrumentConfig(instrumentId);
  if (instrument?.soundTypes.some((s) => s.id === soundTypeId)) return soundTypeId;
  return instrument?.defaultSoundType ?? soundTypeId;
}

export function getInstrumentConfig(id: InstrumentType): InstrumentConfig | undefined {
  return INSTRUMENTS.find(i => i.id === id);
}

export function getSoundType(instrumentId: InstrumentType, soundTypeId: string): SoundType | undefined {
  const instrument = getInstrumentConfig(instrumentId);
  return instrument?.soundTypes.find(s => s.id === soundTypeId)
    ?? instrument?.soundTypes.find(s => s.id === LEGACY_SOUND_IDS[instrumentId]?.[soundTypeId]);
}

/**
 * The sound each track's mix was set with (TRACK_TRIM in fromSong.ts, set by ear 2026-09-22):
 * the level every other sound of that track is brought to. It is named here rather than taken
 * from the track's default sound, because changing which sound a track starts on should not
 * make the whole track louder or quieter.
 */
export const REFERENCE_SOUND = gainTable.reference as Record<InstrumentType, string>;

/**
 * Decibels that put a sound at the level of its track's reference sound, measured through the
 * player itself by `npm run lab:gains` (scripts/measure-list-gains.mjs, docs/sonidos-comunes.md
 * §7d). The reference sound is 0.
 */
export function soundGainDb(instrumentId: InstrumentType, soundTypeId: string): number {
  const gains = gainTable.gains as Record<string, number>;
  const id = getSoundType(instrumentId, soundTypeId)?.id ?? soundTypeId;
  return gains[`${instrumentId}.${id}`] ?? 0;
}

/**
 * What a sound is turned up or down by to be heard at the level the track's mix was set at
 * (docs/sonidos-comunes.md §7f). Changing sound then changes the timbre, not the level.
 */
export function relativeSoundGain(instrumentId: InstrumentType, soundTypeId: string): number {
  return 10 ** (soundGainDb(instrumentId, soundTypeId) / 20);
}

/** The engine timbre a sound plays on: the SoundFont, or one of the app's synthesised ones. */
export function soundTimbre(sound: SoundType | undefined): number {
  return sound?.timbre ?? TIMBRE.sampled;
}

export function getDefaultInstrumentStates(): InstrumentState[] {
  return INSTRUMENTS.map(inst => ({
    id: inst.id,
    muted: false,
    solo: false,
    volume: 0.7,
    soundTypeId: inst.defaultSoundType,
  }));
}

/**
 * Calculate effective mute state considering solo
 */
export function isInstrumentAudible(instrument: InstrumentState, allInstruments: InstrumentState[]): boolean {
  if (instrument.muted) return false;

  const anySolo = allInstruments.some(i => i.solo);
  if (anySolo && !instrument.solo) return false;

  return true;
}
