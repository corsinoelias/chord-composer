/**
 * What putting one of the app's rhythms on a song changes besides its rhythm, as the app's
 * applyUserStyle does: the band's sounds, and — when asked — its intro and ending as sections.
 */
import { type AppStyle } from './appStyles';
import { appPartSections } from './appEngine/fromAppStyle';
import { RHYTHM_KIT, completeInstrumentStates, soundIdForProgram, type InstrumentState, type InstrumentType } from './instruments';
import { type Section } from './sections';

const MELODIC: InstrumentType[] = ['piano', 'guitar', 'bass', 'synth'];
/** The engine's SoundFont timbre (TIMBRE.sampled): a rhythm names a program only for it. */
const SAMPLED = 13;

/** The song's tracks playing the rhythm's sounds, its kit included; level, mute and solo stay as they were. */
export function appStyleInstruments(states: InstrumentState[], style: AppStyle): InstrumentState[] {
  return completeInstrumentStates(states).map((state) => {
    if (state.id === 'drums') return { ...state, soundTypeId: RHYTHM_KIT };
    if (!MELODIC.includes(state.id)) return state;
    const program = style.programs[state.id];
    const timbre = style.timbres?.[state.id] ?? SAMPLED;
    if (program === undefined || timbre !== SAMPLED) return state;
    return { ...state, soundTypeId: soundIdForProgram(state.id, program) };
  });
}

/** Section names that say which part of a rhythm they are, in Spanish and English — as the app reads them. */
const INTRO_NAME = /^(intro|entrada|introducci)/i;
const ENDING_NAME = /^(final|fin\b|outro|ending|coda|cierre)/i;
const CHORUS_NAME = /^(coro|estribillo|chorus|refr)/i;

/**
 * [sections] with the part each name suggests, as the app does on applying a rhythm: a chorus
 * plays B when the rhythm has one, and — unless the rhythm's own intro and ending were added —
 * an "Intro" or "Final" plays the rhythm's. Only sections that have not chosen one already;
 * suggested once, on applying, never behind your back afterwards.
 */
export function withPartsByName(sections: Section[], style: AppStyle, addedIntroAndEnding: boolean): Section[] {
  return sections.map((s) => {
    if (s.stylePart || s.part || s.variation === 1) return s;
    const name = s.name.trim();
    if (!addedIntroAndEnding && style.intro?.length && INTRO_NAME.test(name)) return { ...s, part: 'intro' };
    if (!addedIntroAndEnding && style.ending?.length && ENDING_NAME.test(name)) return { ...s, part: 'ending' };
    if (style.b && CHORUS_NAME.test(name)) return { ...s, variation: 1 };
    return s;
  });
}

/**
 * [sections] with the intro and ending an earlier rhythm added taken out, and [style]'s put in
 * when [add] — the app replaces them rather than piling up another pair. [key] is the song's:
 * its tonic (a pitch class), whether it is minor and whether it is spelled with flats.
 */
export function withAppStyleParts(
  sections: Section[], style: AppStyle, add: boolean, key: { tonic: number; minor: boolean; flats: boolean },
): Section[] {
  const own = sections.filter((s) => !s.stylePart);
  if (!add) return own;
  return [
    ...appPartSections(style, 'intro', key.tonic, key.minor, key.flats),
    ...own,
    ...appPartSections(style, 'ending', key.tonic, key.minor, key.flats),
  ];
}
