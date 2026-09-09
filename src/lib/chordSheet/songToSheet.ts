// Converts a song from the Songs catalogue (/songs/[slug]) into a Chord Sheet Maker
// document, so a visitor can fork a curated chart into their own editable copy.
//
// The two formats are already almost the same notation: songs store `[Am:4]lyrics`
// (chord + duration in beats), Chord Sheet Maker stores `[Am]lyrics`. Durations are
// dropped rather than approximated — a printed chart has no tempo, so a beat count has
// nowhere to go. Everything else survives verbatim.
//
// The copy is a SNAPSHOT, not a live link: fixing a chord on the catalogue song later
// does not reach charts already forked from it. That's deliberate — it's the visitor's
// own copy to change at will (see /songs/[slug].astro's "Make my own chord sheet" CTA).
//
// Structural input on purpose (not `Song` or `PublicSong`): both of those satisfy it,
// and taking neither keeps this module free of any import that would drag the 833-line
// src/data/songs.ts into the Chord Sheet Maker's client bundle.

export interface SheetSourceSection {
  name: string;
  lines: string[];
}

export interface SheetSourceSong {
  title: string;
  artist: string;
  key: string;
  capo?: number;
  sections: SheetSourceSection[];
}

/** Fields of a ChordSheetDoc a song can actually fill in. The caller merges these over a
 *  blank doc so presentation (layout, instrument, chart notation) keeps its own defaults. */
export interface SongSheetSeed {
  title: string;
  artist: string;
  baseKey: string;
  capo: number;
  text: string;
}

// `[Am:4]` → `[Am]`, `[F/A:2]` → `[F/A]`. Chords with no duration pass through untouched.
const DURATION_RE = /\[([^:\]]+)(?::\d+(?:\.\d+)?)?\]/g;

export function stripDurations(line: string): string {
  return line.replace(DURATION_RE, '[$1]');
}

/** A song's sections as ChordPro-ish source: a bare section name per header, then its
 *  lines, then a blank line. parseSheet() reads that back into the same structure —
 *  provided the name is one it recognises as a header (see the caveat below). */
export function songSectionsToSheetText(sections: SheetSourceSection[]): string {
  const out: string[] = [];
  for (const section of sections) {
    const lines = section.lines.map(stripDurations).filter((l) => l.trim() !== '');
    if (!lines.length && !section.name.trim()) continue;
    if (out.length) out.push('');
    if (section.name.trim()) out.push(section.name.trim());
    out.push(...lines);
  }
  return out.join('\n');
}

export function songToSheetSeed(song: SheetSourceSong): SongSheetSeed {
  return {
    title: song.title,
    artist: song.artist,
    baseKey: song.key,
    capo: song.capo ?? 0,
    text: songSectionsToSheetText(song.sections),
  };
}
