import recommendedList from '@/data/recommendedSounds.json';
import { rememberPresetNames } from '@/lib/instruments';

/**
 * How the sounds are sorted and which come first, as the app sorts them (soundFamilies,
 * soundFamilyOf, soundFamiliesFor, soundSuitsTrack, isKitProgram and recommendedSounds in its
 * constants.dart). A program is the General MIDI number plus 128 × the bank.
 */

/** The sounds the app recommends, [program, name], in the order it offers them (engine:sync). */
export const RECOMMENDED: readonly (readonly [number, string])[] = recommendedList as [number, string][];
const recommendedRank = new Map(RECOMMENDED.map(([program], i) => [program, i]));
// Named from the start: the short lists offer them before the SoundFont's list has been read.
rememberPresetNames(RECOMMENDED as [number, string][]);
export const isRecommended = (program: number) => recommendedRank.has(program);
/** Where a recommended sound comes among them, or Infinity for one that is not. */
export const recommendedOrder = (program: number) => recommendedRank.get(program) ?? Infinity;

/** The families, in General MIDI order: families of eight, a few neighbours joined. */
export const SOUND_FAMILIES = [
  'pianos', 'mallets', 'organs', 'guitars', 'basses', 'strings',
  'brass', 'winds', 'synths', 'effects', 'world', 'percussion',
] as const;
export type SoundFamily = (typeof SOUND_FAMILIES)[number];

export const SOUND_FAMILY_LABEL: Record<SoundFamily, string> = {
  pianos: 'Pianos', mallets: 'Mallets & bells', organs: 'Organs & accordions', guitars: 'Guitars',
  basses: 'Basses', strings: 'Strings & choirs', brass: 'Brass', winds: 'Saxes & winds',
  synths: 'Synths & pads', effects: 'Effects', world: 'World', percussion: 'Percussion',
};

/** A drum kit rather than an instrument: GeneralUser keeps its kits in banks 120 and 128. */
export const isKitProgram = (program: number) => program >> 7 >= 120;

/** The family a program is in; a variation (a bank above 0) is in its sound's. */
export function soundFamilyOf(program: number): SoundFamily {
  const p = program % 128;
  if (p < 8) return 'pianos';
  if (p < 16) return 'mallets';
  if (p < 24) return 'organs';
  if (p < 32) return 'guitars';
  if (p < 40) return 'basses';
  if (p < 56) return 'strings';
  if (p < 64) return 'brass';
  if (p < 80) return 'winds';
  if (p < 96) return 'synths';
  if (p < 104) return 'effects';
  if (p < 112) return 'world';
  if (p < 120) return 'percussion';
  return 'effects';
}

/** The families a track is looked for in first. */
export function soundFamiliesFor(track: string): readonly SoundFamily[] {
  switch (track) {
    case 'bass': return ['basses'];
    case 'piano': return ['pianos', 'organs', 'mallets'];
    case 'guitar': return ['guitars'];
    case 'synth': return ['synths', 'strings', 'brass', 'winds'];
    default: return [];
  }
}

/**
 * Whether [program] is a sound for [track]: one of its families, or an instrument of the world
 * by how it is played — plucked on the guitar, struck on the piano, bowed and blown on the
 * synth, which also takes the synth effects' pads.
 */
export function soundSuitsTrack(track: string, program: number): boolean {
  if (isKitProgram(program)) return false;
  const p = program % 128;
  let played: string | null = null;
  if (p >= 104 && p <= 107) played = 'guitar';
  else if (p === 108 || p === 112 || p === 113 || p === 114) played = 'piano';
  else if (p >= 109 && p <= 111) played = 'synth';
  else if (p >= 96 && p < 104) played = 'synth';
  return played !== null ? played === track : soundFamiliesFor(track).includes(soundFamilyOf(program));
}

/** The families in the order a track's list shows them: its own first. */
export function familiesInOrder(track: string): SoundFamily[] {
  const own = soundFamiliesFor(track);
  return [...own, ...SOUND_FAMILIES.filter((f) => !own.includes(f))];
}
