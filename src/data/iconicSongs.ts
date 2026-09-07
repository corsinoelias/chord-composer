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
