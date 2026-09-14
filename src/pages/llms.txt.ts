// Dynamic llms.txt — built from the same sources as the sitemaps (SONGS + Supabase
// community songs + the learn content collection) so it can never drift from the actual
// catalog again. The old public/llms.txt was hand-maintained and went stale after every
// content addition (listed 8/12 songs, 7/9 learn articles at the time it was audited).
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getPublishedSongs } from '@/lib/publicSongs';
import { SONGS, parseLyricLine, type Song, type SongSection } from '@/data/songs';
import { GENRES } from '@/data/progressions';

const SITE = 'https://chordsequence.com';

function uniqueChords(sections: SongSection[]): string {
  const seen = new Set<string>();
  for (const section of sections) {
    for (const line of section.lines) {
      for (const token of parseLyricLine(line)) {
        if (token.chord) seen.add(token.chord);
      }
    }
  }
  return [...seen].join(', ');
}

function songLine(song: Pick<Song, 'slug' | 'title' | 'artist' | 'key' | 'capo' | 'sections'>): string {
  const capo = song.capo ? `, Capo ${song.capo}` : '';
  return `- [${song.title} — ${song.artist}](${SITE}/songs/${song.slug}/): Key of ${song.key}${capo}. Chords: ${uniqueChords(song.sections)}.`;
}

export const GET: APIRoute = async () => {
  const staticSlugs = new Set(SONGS.map((s) => s.slug));
  const communitySongs = (await getPublishedSongs()).filter((s) => !staticSlugs.has(s.slug));

  const learnEntries = (await getCollection('learn')).sort(
    (a, b) => new Date(b.data.pubDate).getTime() - new Date(a.data.pubDate).getTime(),
  );

  const learnLines = learnEntries
    .map((e) => `- [${e.data.title}](${SITE}/learn/${e.slug}/): ${e.data.description}`)
    .join('\n');

  const progressionLines = GENRES
    .map((g) => `- [${g.name} Progressions](${SITE}/progressions/${g.slug}/): ${g.description}`)
    .join('\n');

  const songLines = [...SONGS, ...communitySongs].map(songLine).join('\n');

  const body = `# Chord Sequence

> Chord Sequence (chordsequence.com) is a free online chord progression builder for songwriters, producers, and music students. Build progressions with drag-and-drop, hear them with real-time playback across 13+ rhythm styles, export as WAV, and explore ready-made genre libraries — no account or DAW required.

## Core Tool
- [Chord Progression Builder](${SITE}/): The main app. Drag-and-drop chord editor with real-time playback, 37 chord types, key transposer, and WAV export. Free, no account required, works in any browser.

## Learn: Music Theory & Chord Progressions
${learnLines}

## Ready-Made Progression Libraries
${progressionLines}

## Song Chord Charts
Interactive chord charts with synchronized lyrics — press Play and follow each chord in real time.
- [All Song Chord Charts](${SITE}/songs/): Full catalog of interactive chord charts for popular songs.
${songLines}

## Tools
- [Chord Finder](${SITE}/chord-lookup/): Free chord finder for guitar, piano, and ukulele. Pick any of 12 root notes and 30 chord types, see the exact fingering or keys to press, hear every note, and switch between C-D-E and Do-Re-Mi note names. Dedicated pages: [Guitar](${SITE}/guitar-chord-lookup/), [Piano](${SITE}/piano-chord-lookup/), [Ukulele](${SITE}/ukulele-chord-lookup/).
- [Chord Transposer](${SITE}/tools/chord-transposer/): Instantly transpose any chord or progression to a different key. Includes semitone reference chart and worked examples.
- [Circle of Fifths](${SITE}/tools/circle-of-fifths/): Interactive circle of fifths for navigating key relationships.
- [Key Detector](${SITE}/tools/key-detector/): Detect the key of any chord progression.
- [Bass Tab Player](${SITE}/tools/bass-guitar-tab/): Free online 4-string bass tablature editor. Draw notes on any string and fret, real-time playback, Pick/Synth/Slap sounds, WAV export. No account required.
- [Guitar Tab Player](${SITE}/tools/guitar-tab/): Free online 6-string guitar tablature editor. Draw and drag notes, Chord Helper for one-click chord insertion, capo support, ASCII/MIDI export. No account required.
- [Chord Player for Android](${SITE}/chord-player-app/): Free native Android app of the Chord Player. Builds songs section by section, plays them with drums, bass, piano and guitar in 11 styles, works offline without an account, and exports M4A, WAV or MIDI.

## About
- [About Chord Sequence](${SITE}/about/): About the tool and its creator.
- [Elías Corsino Saldaña](${SITE}/about/elias-corsino/): Creator of Chord Sequence — Musician & Software Developer from the Dominican Republic. Plays piano, bass, guitar, and drums. Started learning music at age 12.
- [CodiFlash](https://codiflash.com): Enterprise SharePoint and Microsoft 365 consulting company also founded by Elías Corsino Saldaña. Custom intranet development for mid-market and enterprise clients.

## Comparisons
- [Best Chord Progression Generators 2026](${SITE}/best-chord-progression-generators/): Ranked comparison of Chord Sequence, ChordSeq AI, DBDone AI Chords, OneMotion, Mario Nieto Chord Generator, and Xfer Cthulhu — features, pricing, YouTube demos, and verdict.
- [Best Guitar Tab Software 2026](${SITE}/best-guitar-tab-software/): Ranked comparison of Chord Sequence, TuxGuitar, Tabby.pro, Dorico, Songsterr, and Guitar Pro 8 — features, pricing, platforms, and verdict.
- [Best Bass Tab Software 2026](${SITE}/best-bass-tab-software/): Ranked comparison of Chord Sequence, Guitar Pro 8, Songsterr, Ultimate Guitar Pro, and MuseScore Studio — library, playback, editing power, and verdict.

## Licensing
Content on this site (music theory articles, chord charts, tool descriptions) is available for AI citation and summarization for informational, educational, and search purposes. Training use is restricted — see /robots.txt.

## Key Facts
- 100% free, no account required
- Works in-browser, no download or DAW needed
- 37 chord types supported (major, minor, 7th, maj7, min7, diminished, augmented, suspended, and more)
- 13+ rhythm styles with real audio samples (pop, rock, jazz, lo-fi, worship, Latin, and more)
- WAV export for use in any DAW (Ableton, Logic, GarageBand, FL Studio)
- Chord progressions stored in browser — private, no server uploads
- Works offline after first load
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
