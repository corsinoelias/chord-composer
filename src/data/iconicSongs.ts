/**
 * Well-known songs reduced to their harmonic skeleton, for the home page's
 * "Iconic Song Chord Progressions" section.
 *
 * Separate from `SONGS` in songs.ts on purpose. That dataset is the full chart —
 * sections, lyrics and per-syllable chord tokens — and it drives the /songs/<slug>/
 * pages. This one is a listening exercise: the loop that defines the song, with its
 * roman numerals, playable and exportable in one press. A few titles appear in both;
 * they answer different questions, so neither is derived from the other.
 */

export interface IconicSong {
  id: string;
  title: string;
  artist: string;
  genre: string;
  key: string;
  progression: string[];
  romanNumerals: string[];
  bpm: number;
  /** Rhythm style id from MUSICAL_STYLES, used for the WAV render and the editor link. */
  style: string;
}

export const ICONIC_SONGS: IconicSong[] = [
  {
    id: 'holy-forever',
    title: 'Holy Forever',
    artist: 'Chris Tomlin / Bethel',
    genre: 'Worship',
    key: 'Db',
    progression: ['Db', 'Gb', 'Bbm', 'Ab'],
    romanNumerals: ['I', 'IV', 'VI', 'V'],
    bpm: 72,
    style: 'pop_1',
  },
  // The two gospel standards, ported from the landing prototype as written there.
  // Between them they demonstrate the whole palette on /progressions/gospel/: Total
  // Praise for the passing diminished and the 4-over-5 church resolution, Never Would
  // Have Made It for the 7-3-6 into a full circle-of-fifths descent.
  {
    id: 'total-praise',
    title: 'Total Praise',
    artist: 'Richard Smallwood',
    genre: 'Gospel',
    key: 'Db',
    progression: ['Dbmaj7', 'Ab/C', 'Bbm7', 'Db7', 'Gbmaj7', 'Gdim7', 'Db/Ab', 'Ab7'],
    romanNumerals: ['Imaj7', 'V/3', 'VI7', 'I7', 'IVmaj7', '#IV°7', 'I/5', 'V7'],
    bpm: 58,
    style: 'soul_rnb',
  },
  {
    id: 'never-would-have-made-it',
    title: 'Never Would Have Made It',
    artist: 'Marvin Sapp',
    genre: 'Gospel',
    key: 'Ab',
    progression: ['Gm7b5', 'C7#9', 'Fm9', 'Bbm9', 'Eb13', 'Abmaj7'],
    romanNumerals: ['VIIø7', 'III7#9', 'VI9', 'II9', 'V13', 'Imaj7'],
    bpm: 64,
    style: 'soul_rnb',
  },
  {
    id: 'autumn-leaves',
    title: 'Autumn Leaves',
    artist: 'Jazz Standard (Joseph Kosma)',
    genre: 'Jazz',
    key: 'Gm',
    progression: ['Cm7', 'F7', 'Bbmaj7', 'Ebmaj7', 'Am7b5', 'D7', 'Gm7'],
    romanNumerals: ['IV7', 'VII7', 'IIImaj7', 'VImaj7', 'IIø7', 'V7', 'I7'],
    bpm: 118,
    style: 'jazz_light',
  },
  {
    id: 'hallelujah',
    title: 'Hallelujah',
    artist: 'Leonard Cohen / Jeff Buckley',
    genre: 'Ballad',
    key: 'C',
    progression: ['C', 'Am', 'C', 'Am', 'F', 'G', 'C', 'G'],
    romanNumerals: ['I', 'VI', 'I', 'VI', 'IV', 'V', 'I', 'V'],
    bpm: 56,
    style: 'pop_6_8',
  },
  {
    id: 'wonderwall',
    title: 'Wonderwall',
    artist: 'Oasis',
    genre: 'Britpop / Rock',
    key: 'Em',
    progression: ['Em7', 'G', 'Dsus4', 'A7sus4'],
    romanNumerals: ['I7', 'III', 'VII4', 'IV7sus'],
    bpm: 87,
    style: 'folk_indie',
  },
  {
    id: 'goodness-of-god',
    title: 'Goodness of God',
    artist: 'Bethel Music / Jenn Johnson',
    genre: 'Worship',
    key: 'Ab',
    progression: ['Ab', 'Db', 'Ab', 'Eb', 'Fm', 'Db', 'Eb'],
    romanNumerals: ['I', 'IV', 'I', 'V', 'VI', 'IV', 'V'],
    bpm: 70,
    style: 'pop_1',
  },
  {
    id: 'oceans',
    title: 'Oceans (Where Feet May Fail)',
    artist: 'Hillsong United',
    genre: 'Worship',
    key: 'D',
    progression: ['Bm', 'A/C#', 'D', 'A', 'G'],
    romanNumerals: ['VI', 'V/3', 'I', 'V', 'IV'],
    bpm: 64,
    style: 'pop_1',
  },
];
