/**
 * The app's rhythms, played on the web exactly as the app plays them.
 *
 * Two sets, both copied from the app by `npm run rhythms:sync` into public/rhythms/:
 *   - the rhythm library: 177 keyboard rhythms converted to styles of the app's own, each with
 *     variations A and B, their fills, and often an intro and an ending;
 *   - the app's own styles the web did not have (Salsa, Bachata, Bolero, Norteño, Modern Worship,
 *     Afrobeat, Trap).
 *
 * They are written for the app's engine — step values packed the engine's way, on its 24 kit
 * rows and four melodic tracks, with hand percussion from the SoundFont — so they are not
 * translated into the web's StylePattern, which could hold none of that. fromSong.ts sends them
 * to the engine as they are (writeAppStyle). To the rest of the web a rhythm of these is still a
 * StylePattern (appStylePattern): a name, a genre, a tempo and a meter, with the rhythm itself
 * under `engine`.
 *
 * Ids: `lib-<n>` for the library's (the app's own id for them) and `app-<id>` for the app's styles.
 */
import type { StylePattern } from './styles';

/** A step grid per track and row, as the engine takes it: track → row → packed steps. */
export type AppPatterns = Record<string, Record<string, number[]>>;

/** The fill a variation plays: from which step, and one lane per kit row or melodic track. */
export interface AppFill {
  from: number;
  lanes: Record<string, number[]>;
}

export interface AppVariation {
  patterns: AppPatterns;
  /** Bars each track's pattern runs for: 1, 2 or 4. */
  patternBars: Record<string, number>;
  fill?: AppFill;
}

/** A part of an intro or an ending: its own chords (semitones above the key) and what plays over them. */
export interface AppPart {
  name: string;
  chords: { interval: number; type: string; beats: number }[];
  patterns: AppPatterns;
  patternBars: Record<string, number>;
}

export interface AppStyle {
  id: string;
  name: string;
  /** The genre it is listed under (GENRES). */
  genre: string;
  bpm: number;
  meter: { beats: number; unit: number };
  /** The engine's swing ratio, 1 straight. */
  swing?: number;
  a: AppVariation;
  b?: AppVariation;
  intro?: AppPart[];
  ending?: AppPart[];
  /** General MIDI program per melodic track (number + 128 × bank). */
  programs: Record<string, number>;
  /** The engine timbre per melodic track; absent, the SoundFont (13). */
  timbres?: Record<string, number>;
  /** The drum sound id per kit row: a recording (9…) or a General MIDI percussion note (100…). */
  drumSounds: Record<string, number>;
  /** Where each melodic track's register starts (MIDI note). */
  voicings: Record<string, number>;
  /** How long each melodic track's notes ring, in steps; 0 holds. */
  noteLengths: Record<string, number>;
  volumes: Record<string, number>;
  pans: Record<string, number>;
}

/**
 * The genres of the list, in its order: the library's, which are the wider set. A rhythm of
 * the library says its genre (by the ids of GENRE_IDS, as the app's rhythmGenres); the
 * Casio rhythms, which were numbered by genre, may leave it to their number.
 */
export const GENRES = [
  'Pop', 'Rock & Blues', 'Soul, Funk & R&B', 'Dance & Hip-Hop', 'Jazz & Swing', 'Europe',
  'Latin & Caribbean', 'Gospel', 'World', 'Country & Christmas', 'Orchestra & Film', 'Ballads', 'Piano',
] as const;

/** The genre ids the library stores, as the app names them (lib/core/data/rhythm_library.dart). */
const GENRE_IDS: Record<string, string> = {
  pop: 'Pop', rock: 'Rock & Blues', soul: 'Soul, Funk & R&B', dance: 'Dance & Hip-Hop',
  jazz: 'Jazz & Swing', europe: 'Europe', latin: 'Latin & Caribbean', gospel: 'Gospel',
  world: 'World', country: 'Country & Christmas', orchestra: 'Orchestra & Film', ballads: 'Ballads',
  piano: 'Piano',
};

export function libraryGenre(n: number, genre?: string): string {
  if (genre && GENRE_IDS[genre]) return GENRE_IDS[genre];
  if (n <= 17) return 'Pop';
  if (n <= 29) return 'Rock & Blues';
  if (n <= 38) return 'Dance & Hip-Hop';
  if (n <= 48) return 'Jazz & Swing';
  if (n <= 58) return 'Europe';
  if (n <= 92) return 'Latin & Caribbean';
  if (n <= 94) return 'Gospel';
  if (n <= 139) return 'World';
  if (n <= 147) return 'Country & Christmas';
  if (n <= 149) return 'Orchestra & Film';
  if (n <= 160) return 'Ballads';
  return 'Piano';
}

/** The genre a style's own category is listed under, for the web's and the app's styles. */
export function categoryGenre(category: string): string {
  switch (category) {
    case 'Latin': case 'Reggae': return 'Latin & Caribbean';
    case 'Rock': case 'Blues': case 'Metal': return 'Rock & Blues';
    case 'Funk': case 'Soul': return 'Soul, Funk & R&B';
    case 'Disco': case 'HipHop': case 'Dance': case 'LoFi': return 'Dance & Hip-Hop';
    case 'Jazz': return 'Jazz & Swing';
    case 'Gospel': return 'Gospel';
    case 'Country': return 'Country & Christmas';
    case 'World': return 'World';
    default: return 'Pop';
  }
}

export const isAppStyleId = (id: string | undefined): boolean => !!id && (id.startsWith('lib-') || id.startsWith('app-'));

const registry = new Map<string, AppStyle>();
let loading: Promise<AppStyle[]> | null = null;

/** A rhythm of these by id, once they have been loaded (ensureAppStyles). */
export const getAppStyle = (id: string): AppStyle | undefined => registry.get(id);

/** Every rhythm of these, loaded once: the app's styles first, then the library in its order. */
export function ensureAppStyles(): Promise<AppStyle[]> {
  loading ??= (async () => {
    const [library, own] = await Promise.all([
      fetch('/rhythms/library.json').then((r) => r.json()),
      fetch('/rhythms/app-styles.json').then((r) => r.json()),
    ]);
    const list: AppStyle[] = [];
    for (const s of (own?.styles ?? []) as (Omit<AppStyle, 'genre'> & { category: string })[]) {
      list.push({ ...s, genre: categoryGenre(s.category) });
    }
    for (const r of (library?.rhythms ?? []) as { n: number; name: string; genre?: string; style: Omit<AppStyle, 'id' | 'name' | 'genre'> }[]) {
      list.push({
        ...r.style,
        id: `lib-${r.n}`,
        name: r.name,
        genre: libraryGenre(r.n, r.genre),
        // The endings were named in Spanish when the library was built.
        ending: r.style.ending?.map((part, i) => ({ ...part, name: i === 0 ? 'Ending' : `Ending ${i + 1}` })),
      });
    }
    for (const style of list) registry.set(style.id, style);
    return list;
  })();
  loading.catch(() => { loading = null; });
  return loading;
}

/** The meter's steps: a step is a sixteenth, so 4/4 has 16 and 6/8 has 12. */
export const appStepsPerBar = (style: AppStyle) => Math.round((style.meter.beats * 16) / style.meter.unit);

/**
 * One of these as the rest of the web sees a style: its name, genre, tempo and meter, with the
 * rhythm itself under `engine`. The web's own grids are left empty — nothing but the engine
 * plays it.
 */
export function appStylePattern(style: AppStyle): StylePattern {
  const empty = () => Array(appStepsPerBar(style)).fill(0);
  return {
    id: style.id,
    name: style.name,
    category: style.genre as StylePattern['category'],
    bpm: style.bpm,
    bpmRange: [Math.max(40, style.bpm - 20), Math.min(240, style.bpm + 20)],
    description: '',
    timeSignature: { numerator: style.meter.beats, denominator: style.meter.unit },
    rhythm: { piano: empty(), bass: empty(), kick: empty(), snare: empty(), hihat: empty() },
    fill: { position: 0, pattern: {} },
    volumes: { piano: 1, bass: 1, drums: 1, guitar: 1 },
    engine: style,
  };
}

/** What a rhythm of these brings, for the sheet that shows it before it is put on a song. */
export function appStyleFacts(style: AppStyle): { hasB: boolean; introBars: number; endingBars: number } {
  const bars = (parts?: AppPart[]) =>
    Math.round((parts ?? []).reduce((n, p) => n + p.chords.reduce((m, c) => m + c.beats, 0), 0) / style.meter.beats);
  return { hasB: !!style.b, introBars: bars(style.intro), endingBars: bars(style.ending) };
}

/** Whether a song plays any of these: as its rhythm, a section's, or an intro or ending part. */
export function songUsesAppStyles(sections: { styleId?: string; stylePart?: unknown }[], styleId: string | undefined): boolean {
  return isAppStyleId(styleId) || sections.some((s) => isAppStyleId(s.styleId) || !!s.stylePart);
}
