/**
 * Every number the site states about the Chord Player — the web editor and the Android app —
 * in one place. They used to be typed into each page, and by September 2026 the site said
 * 13+, 20+ and 100+ rhythms on different pages, 37 chord types after the editor had 39, and
 * "works offline" for a web editor that has no service worker.
 *
 * Plain numbers rather than counts taken at import time, so a React page can use them without
 * bundling the rhythm files. tests/facts/facts.ts checks each one against its source (the
 * rhythm files, CHORD_QUALITIES, the app's own code) and fails when one drifts.
 */

/** The web editor at /chord-player/. */
export const WEB = {
  /** CHORD_QUALITIES in src/lib/musicTheory.ts. */
  chordTypes: 39,
  /** The editor's own styles (MUSICAL_STYLES) plus the app's styles and library it plays. */
  rhythms: 204,
  instruments: ['drums', 'bass', 'piano', 'guitar', 'synth'] as const,
  exports: ['WAV', 'MIDI'] as const,
} as const;

/** The Android app, com.eliascorsino.chord_sequencer, as published on Google Play. */
export const APP = {
  version: '1.2.0',
  /** chordTypes in lib/core/music/constants.dart. */
  chordTypes: 39,
  /** The app's 24 styles and the 177 of its rhythm library, in one list. */
  rhythms: 201,
  instruments: ['drums', 'bass', 'piano', 'guitar', 'synth'] as const,
  /** Rows of hand percussion under the kit: congas, bongos, güiro, claves and more. */
  percussionRows: 12,
  drumKits: 9,
  /** Songs to start from (song_seeds.dart) and progressions (progression_library.dart). */
  exampleSongs: 11,
  progressions: 8,
  exports: ['M4A', 'WAV', 'MIDI'] as const,
  /** The tempo slider's range (transport_bar.dart). */
  tempo: { min: 40, max: 200 },
  /** The chosen sounds across the melodic tracks (timbreOptions in constants.dart). */
  sounds: 35,
  languages: ['English', 'Spanish'] as const,
  minAndroid: '8.0',
} as const;

/** "drums, bass, piano, guitar and synth" — a list of instruments as a sentence. */
export function instrumentList(list: readonly string[]): string {
  return list.length < 2 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}
