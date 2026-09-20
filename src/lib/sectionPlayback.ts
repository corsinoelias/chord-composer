/**
 * What one section plays differently from the song: its own rhythm (a style, one style per
 * track, or grooves edited by hand), tracks it silences and sounds it swaps.
 *
 * Pure. Both the live scheduler and the offline render ask this once per section, and a
 * section that changes nothing gets null back, which is what keeps every existing song on
 * exactly the code path it had before (docs/plan-paridad-web-app.md, rule 0).
 *
 * Design rules (docs/ritmo-por-seccion.md):
 * - A section's rhythm brings pattern, arpeggios, fill, swing and melodic variations; it
 *   does NOT bring sounds or volumes — the mixer stays the song's.
 * - One meter per song: a style whose bar has a different number of slots is ignored for
 *   that track (resolved on read, stored data never mutated).
 * - Swing comes from whoever plays the drums.
 */

import { type StylePattern, getSlotsPerBar, getStyleByIdWithOverrides } from './styles';
import { type BassScaleData, resolveVariation } from './bassScale';
import { type Section, type TrackId, type TrackPattern, sectionHasArrangement } from './sections';
import { getSoundType, type InstrumentType } from './instruments';

export interface SectionPlayback {
  /** The rhythm this section plays, or undefined to keep the song's. */
  style?: StylePattern;
  /** Resolved melodic variations, or undefined to keep the song's (the live getters). */
  melodic?: { piano: BassScaleData | null; bass: BassScaleData | null; guitar: BassScaleData | null };
  silenced: Partial<Record<TrackId, boolean>>;
  /** Only sound ids that exist for that instrument. */
  sounds: Partial<Record<TrackId, string>>;
}

export type StyleLookup = (id: string) => StylePattern | undefined;

const DRUM_ROWS = [
  'kick', 'snare', 'snareStick', 'hihat', 'hihatOpen', 'hihatFoot',
  'tom1', 'tom2', 'floorTom', 'ride', 'crash',
] as const;

const ROWS: Record<TrackId, readonly string[]> = {
  drums: DRUM_ROWS,
  bass: ['bass'],
  piano: ['piano'],
  guitar: ['guitar'],
};

/** Repeats a pattern row written for `fromBars` bars until it covers `toBars`. */
function tile(row: number[] | undefined, slotsPerBar: number, fromBars: number, toBars: number): number[] | undefined {
  if (!row || fromBars === toBars) return row;
  const out: number[] = [];
  for (let bar = 0; bar < toBars; bar++) {
    const from = (bar % fromBars) * slotsPerBar;
    for (let s = 0; s < slotsPerBar; s++) out.push(row[from + s] ?? 0);
  }
  return out;
}

/** Everything a track contributes to a composed style, taken from one style. */
interface TrackSource {
  style: StylePattern;
  pattern?: TrackPattern;
}

/**
 * Builds the style one section plays from a source per track. Rows are tiled to the
 * longest loop among the four, so a two-bar bass can sit under a one-bar kit.
 */
export function composeSectionStyle(song: StylePattern, sources: Record<TrackId, TrackSource>): StylePattern {
  const slotsPerBar = getSlotsPerBar(song);
  const loopOf = (t: TrackId) => sources[t].pattern?.loopBars ?? sources[t].style.loopBars ?? 1;
  const loopBars = Math.min(4, Math.max(...(['drums', 'bass', 'piano', 'guitar'] as TrackId[]).map(loopOf)));

  const rhythm = { ...song.rhythm } as StylePattern['rhythm'];
  const r = rhythm as unknown as Record<string, number[] | undefined>;
  for (const track of ['drums', 'bass', 'piano', 'guitar'] as TrackId[]) {
    const { style, pattern } = sources[track];
    const from = loopOf(track);
    const own = style.rhythm as unknown as Record<string, number[] | undefined>;
    const edited = (pattern?.rhythm ?? {}) as Record<string, number[] | undefined>;
    for (const row of ROWS[track]) {
      r[row] = tile(edited[row] ?? own[row], slotsPerBar, from, loopBars);
    }
  }
  // Required rows must stay arrays: generateBarPattern slices them unconditionally.
  for (const row of ['piano', 'bass', 'kick', 'snare', 'hihat'] as const) {
    if (!rhythm[row]) rhythm[row] = new Array(slotsPerBar * loopBars).fill(0);
  }

  const drums = sources.drums;
  const melodicOf = (t: 'bass' | 'piano' | 'guitar') => sources[t].style.melodic?.[t];
  const melodic = song.melodic || sources.bass.style.melodic || sources.piano.style.melodic || sources.guitar.style.melodic
    ? {
        bass: melodicOf('bass') ?? { variations: [], enabled: false },
        piano: melodicOf('piano') ?? { variations: [], enabled: false },
        guitar: melodicOf('guitar') ?? { variations: [], enabled: false },
      }
    : undefined;

  return {
    ...song,
    id: `section:${(['drums', 'bass', 'piano', 'guitar'] as TrackId[]).map((t) => sources[t].style.id).join('+')}`,
    loopBars,
    swing: drums.style.swing,
    rhythm,
    arpeggios: {
      piano: sources.piano.pattern?.arpeggios ?? sources.piano.style.arpeggios?.piano,
      guitar: sources.guitar.pattern?.arpeggios ?? sources.guitar.style.arpeggios?.guitar,
    },
    fill: drums.pattern?.fill ?? drums.style.fill,
    melodic,
    // Rule 2: the section brings no sounds and no volumes.
    volumes: song.volumes,
    instrumentSounds: song.instrumentSounds,
  };
}

/**
 * Null when the section changes nothing — the caller then plays it exactly as before.
 * `songStyle` is the song's resolved style (live edits included).
 */
export function resolveSectionPlayback(
  section: Section | undefined,
  songStyle: StylePattern,
  lookup: StyleLookup,
): SectionPlayback | null {
  if (!section || !sectionHasArrangement(section)) return null;

  const slotsPerBar = getSlotsPerBar(songStyle);
  const sameMeter = (s: StylePattern | undefined) => (s && getSlotsPerBar(s) === slotsPerBar ? s : undefined);
  const sectionStyle = section.styleId ? sameMeter(lookup(section.styleId)) : undefined;

  const tracks: TrackId[] = ['drums', 'bass', 'piano', 'guitar'];
  const sources = {} as Record<TrackId, TrackSource>;
  let changesRhythm = false;
  for (const track of tracks) {
    const byTrack = section.trackStyles?.[track] ? sameMeter(lookup(section.trackStyles[track]!)) : undefined;
    const style = byTrack ?? sectionStyle ?? songStyle;
    const pattern = section.patterns?.[track];
    if (style !== songStyle || pattern) changesRhythm = true;
    sources[track] = { style, pattern };
  }

  let style: StylePattern | undefined;
  let melodic: SectionPlayback['melodic'];
  if (changesRhythm) {
    // A section on one whole other style plays that style as is — no composition, so it
    // sounds exactly like picking that style for the song.
    const whole = tracks.every((t) => sources[t].style === sources.drums.style && !sources[t].pattern);
    style = whole ? sources.drums.style : composeSectionStyle(songStyle, sources);
    const variation = (t: 'bass' | 'piano' | 'guitar', id: string | undefined): BassScaleData | null => {
      const edited = sources[t].pattern?.melodic;
      if (edited) {
        return { pattern: edited.pattern, chordHit: edited.chordHit, loopBars: edited.loopBars, octaveOffsets: edited.octaveOffsets };
      }
      const m = sources[t].style.melodic?.[t];
      return m ? resolveVariation(m, id) : null;
    };
    melodic = {
      bass: variation('bass', section.bassVariationId),
      piano: variation('piano', section.pianoVariationId),
      guitar: variation('guitar', section.guitarVariationId),
    };
  }

  const sounds: Partial<Record<TrackId, string>> = {};
  for (const [track, id] of Object.entries(section.sounds ?? {}) as [TrackId, string][]) {
    if (id && getSoundType(track as InstrumentType, id)) sounds[track] = id;
  }

  return { style, melodic, silenced: { ...(section.silenced ?? {}) }, sounds };
}

/**
 * The style lookup every caller uses: the style being edited live wins for its own id, then
 * the user's retouch of a built-in style, then "Mis ritmos", then the built-in list. Same
 * order as resolveActiveStyle, so a section on "pop_1" hears the same pop_1 the song would.
 */
export function makeStyleLookup(
  customStyles: StylePattern[],
  overrideGetter: (id: string) => StylePattern | null,
  liveEditedStyle?: StylePattern | null,
): StyleLookup {
  return (id) => (liveEditedStyle && liveEditedStyle.id === id ? liveEditedStyle : undefined)
    ?? getStyleByIdWithOverrides(id, customStyles, overrideGetter);
}

/** The resolver renderProgressionOffline takes, for a fixed set of styles. */
export function makeOfflineSectionResolver(lookup: StyleLookup) {
  return (section: Section, songStyle: StylePattern) => resolveSectionPlayback(section, songStyle, lookup);
}

/**
 * The effective style a section plays, for UI (variation pickers, "edit this section's
 * rhythm"). The song's style when the section changes no rhythm.
 */
export function effectiveSectionStyle(section: Section, songStyle: StylePattern, lookup: StyleLookup): StylePattern {
  return resolveSectionPlayback(section, songStyle, lookup)?.style ?? songStyle;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Turns a rhythm edited in the Rhythm Editor for one section into that section's `patterns`:
 * only the tracks that differ from what the section already plays (D1: a section copies a
 * track only once it is edited by hand).
 */
export function sectionPatternsFromStyle(
  edited: StylePattern,
  base: StylePattern,
  section: Section,
): Section['patterns'] {
  const out: NonNullable<Section['patterns']> = { ...(section.patterns ?? {}) };
  const loopBars = edited.loopBars ?? 1;
  const r = edited.rhythm as unknown as Record<string, number[] | undefined>;
  const b = base.rhythm as unknown as Record<string, number[] | undefined>;

  const drumRows = Object.fromEntries(DRUM_ROWS.map((row) => [row, r[row]]).filter(([, v]) => v)) as Partial<StylePattern['rhythm']>;
  if (DRUM_ROWS.some((row) => !same(r[row], b[row])) || !same(edited.fill, base.fill) || (edited.loopBars ?? 1) !== (base.loopBars ?? 1)) {
    out.drums = { rhythm: drumRows, fill: edited.fill, loopBars };
  }

  const variationId = { bass: section.bassVariationId, piano: section.pianoVariationId, guitar: section.guitarVariationId };
  for (const t of ['bass', 'piano', 'guitar'] as const) {
    const em = edited.melodic?.[t];
    const bm = base.melodic?.[t];
    const arps = t === 'bass' ? undefined : edited.arpeggios?.[t];
    const baseArps = t === 'bass' ? undefined : base.arpeggios?.[t];
    if (same(r[t], b[t]) && same(em, bm) && same(arps, baseArps)) continue;
    const v = em?.enabled && em.variations.length
      ? em.variations.find((x) => x.id === variationId[t]) ?? em.variations[0]
      : undefined;
    out[t] = {
      rhythm: { [t]: r[t] } as Partial<StylePattern['rhythm']>,
      ...(arps ? { arpeggios: arps } : {}),
      ...(v ? { melodic: v } : {}),
      loopBars,
    };
  }
  return Object.keys(out).length ? out : undefined;
}
