/**
 * Flat, filterable catalog of chord progressions for the home page explorer.
 *
 * This is deliberately NOT the same shape as `GENRES` in progressions.ts. That one is
 * editorial: long-form intros, FAQs and related articles, grouped by genre, and it drives
 * the /progressions/<genre>/ pages. This one is a browse surface -- every progression is a
 * standalone row carrying the facets the explorer filters on (genre, mood, key) plus the
 * roman numerals and reference tracks a card needs to be readable at a glance.
 *
 * `genreSlug` is the bridge between the two: it points a card at the editorial page for
 * its genre, so the home page feeds /progressions/ instead of competing with it.
 *
 * `style` must be a real id from MUSICAL_STYLES (src/lib/styles.ts). It is passed straight
 * through to the editor as `?style=`, and getInitialStyleId silently falls back to
 * reggaeton when the id doesn't exist -- which reads as a bug, not a fallback.
 */

export type ProgressionGenre =
  | 'Pop'
  | 'Jazz'
  | 'Neo Soul'
  | 'Lo-fi'
  | 'Worship'
  | 'Blues'
  | 'Rock'
  | 'R&B'
  | 'Classical'
  | 'EDM';

export type ProgressionMood =
  | 'Uplifting'
  | 'Melancholic'
  | 'Dreamy'
  | 'Sophisticated'
  | 'Soulful'
  | 'Nostalgic'
  | 'Energetic';

export interface FeaturedProgression {
  id: string;
  name: string;
  romanNumerals: string[];
  /** Tonal centre used by the Key filter — includes the mode ("Am", not "A"). */
  defaultKey: string;
  chords: string[];
  genre: ProgressionGenre;
  mood: ProgressionMood;
  bpm: number;
  description: string;
  /** Well-known tracks built on this progression. Chord progressions are not copyrightable. */
  popularExamples: string[];
  /** Slug of the matching editorial page under /progressions/. */
  genreSlug: string;
  /** Rhythm style id passed to the editor deep link. */
  style: string;
}

export const FEATURED_PROGRESSIONS: FeaturedProgression[] = [
  {
    id: 'pop-axis',
    name: 'The Pop Axis Progression',
    romanNumerals: ['I', 'V', 'VI', 'IV'],
    defaultKey: 'C',
    chords: ['C', 'G', 'Am', 'F'],
    genre: 'Pop',
    mood: 'Uplifting',
    bpm: 110,
    description: 'The most popular harmonic sequence in modern music history. Driving, catchy, and instantly satisfying.',
    popularExamples: ['Let It Be (The Beatles)', "Don't Stop Believin' (Journey)", 'Someone Like You (Adele)'],
    genreSlug: 'pop',
    style: 'pop_1',
  },
  {
    id: 'jazz-ii-v-i',
    name: 'Major II–V–I Cadence',
    romanNumerals: ['II7', 'V7', 'Imaj7', 'Imaj7'],
    defaultKey: 'C',
    chords: ['Dm7', 'G7', 'Cmaj7', 'Cmaj7'],
    genre: 'Jazz',
    mood: 'Sophisticated',
    bpm: 92,
    description: 'The cornerstone of jazz harmony. Creates smooth chromatic guide-tone voice leading and harmonic resolution.',
    popularExamples: ['Autumn Leaves', 'Tune Up (Miles Davis)', 'Satin Doll (Duke Ellington)'],
    genreSlug: 'ii-v-i',
    style: 'jazz_light',
  },
  {
    id: 'neo-soul-dream',
    name: 'Neo Soul Butter Groove',
    romanNumerals: ['IVmaj9', 'III7', 'VI9', 'V9'],
    defaultKey: 'F',
    chords: ['Bbmaj9', 'Am7', 'Dm9', 'C9'],
    genre: 'Neo Soul',
    mood: 'Soulful',
    bpm: 78,
    description: 'Lush, floating harmony with extended 9th and 7th voicings typical of D’Angelo, Erykah Badu, and Robert Glasper.',
    popularExamples: ['Untitled (How Does It Feel)', "Didn't Cha Know", 'Afro Blue'],
    genreSlug: 'neo-soul',
    style: 'soul_rnb',
  },
  {
    id: 'lofi-nostalgia',
    name: 'Lo-Fi Chillhop Loop',
    romanNumerals: ['II7', 'V7', 'III7', 'VI7'],
    defaultKey: 'C',
    chords: ['Dm7', 'G7', 'Em7', 'Am7'],
    genre: 'Lo-fi',
    mood: 'Dreamy',
    bpm: 82,
    description: 'Mellow cycle with warm minor 7th colors designed for study beats, cozy rainy vibes, and relaxed head nodding.',
    popularExamples: ['Coffee shop lo-fi playlists', 'Jinsang beats', 'Nujabes-style loops'],
    genreSlug: 'lo-fi',
    style: 'soul_rnb',
  },
  {
    id: 'worship-elevation',
    name: 'Contemporary Worship Elevation',
    romanNumerals: ['I', 'VI', 'IV', 'V'],
    defaultKey: 'D',
    chords: ['D', 'Bm', 'G', 'A'],
    genre: 'Worship',
    mood: 'Uplifting',
    bpm: 72,
    description: 'Dynamic anthem foundation for buildup from intimate acoustic verse into powerful, expansive choruses.',
    popularExamples: ['Goodness of God (Bethel)', 'Holy Forever (Chris Tomlin)', 'What A Beautiful Name (Hillsong)'],
    genreSlug: 'worship',
    style: 'pop_1',
  },
  {
    id: 'sad-minor-epic',
    name: 'The Dramatic Minor Descent',
    romanNumerals: ['I', 'VI', 'III', 'VII'],
    defaultKey: 'Am',
    chords: ['Am', 'F', 'C', 'G'],
    genre: 'Pop',
    mood: 'Melancholic',
    bpm: 96,
    description: 'Dark, cinematic, and full of emotional tension. Used across acoustic ballads and epic stadium anthems.',
    popularExamples: ['Radioactive (Imagine Dragons)', 'Save Tonight (Eagle-Eye Cherry)', 'Pumped Up Kicks (Foster The People)'],
    genreSlug: 'sad',
    style: 'pop_1',
  },
  {
    id: '12-bar-blues',
    name: 'Standard 12-Bar Blues',
    romanNumerals: ['I7', 'IV7', 'I7', 'V7'],
    defaultKey: 'E',
    chords: ['E7', 'A7', 'E7', 'B7'],
    genre: 'Blues',
    mood: 'Soulful',
    bpm: 104,
    description: 'The foundation of rock ‘n’ roll, blues, and electric guitar improvisation with dominant 7th grit.',
    popularExamples: ['Sweet Home Chicago', 'Johnny B. Goode (Chuck Berry)', 'Cross Road Blues (Robert Johnson)'],
    genreSlug: '12-bar-blues',
    style: 'shuffle_blues',
  },
  {
    id: '50s-doo-wop',
    name: 'The 50s Doo-Wop Progression',
    romanNumerals: ['I', 'VI', 'IV', 'V'],
    defaultKey: 'C',
    chords: ['C', 'Am', 'F', 'G'],
    genre: 'Rock',
    mood: 'Nostalgic',
    bpm: 88,
    description: 'Golden age harmonic cycle with comforting circular resolution that defined classic 50s rock and ballads.',
    popularExamples: ['Stand By Me (Ben E. King)', 'Earth Angel (The Penguins)', 'Every Breath You Take (The Police)'],
    genreSlug: 'rock',
    style: 'pop_1',
  },
  {
    id: 'rnb-sensual',
    name: 'Sensual R&B Smooth Flow',
    romanNumerals: ['IVmaj7', 'III7', 'II7', 'Imaj7'],
    defaultKey: 'Eb',
    chords: ['Abmaj7', 'Gm7', 'Fm7', 'Ebmaj7'],
    genre: 'R&B',
    mood: 'Soulful',
    bpm: 85,
    description: 'Descending stepwise motion creating buttery romantic warmth with rich jazz extensions.',
    popularExamples: ['Redbone (Childish Gambino)', 'Get You (Daniel Caesar)', 'Best Part (H.E.R.)'],
    genreSlug: 'neo-soul',
    style: 'soul_rnb',
  },
  {
    id: 'pachelbel-canon',
    name: 'Canon Harmonic Sequence',
    romanNumerals: ['I', 'V', 'VI', 'III', 'IV', 'I', 'IV', 'V'],
    defaultKey: 'D',
    chords: ['D', 'A', 'Bm', 'F#m', 'G', 'D', 'G', 'A'],
    genre: 'Classical',
    mood: 'Uplifting',
    bpm: 75,
    description: 'Pachelbel’s celebrated descending bass pattern reused in hundreds of modern hit melodies.',
    popularExamples: ['Canon in D (Pachelbel)', 'Memories (Maroon 5)', 'Basket Case (Green Day)'],
    genreSlug: 'pop',
    style: 'folk_indie',
  },
  {
    id: 'edm-anthem',
    name: 'Euphoric Festival Progression',
    romanNumerals: ['VI', 'IV', 'I', 'V'],
    defaultKey: 'Am',
    chords: ['Am', 'F', 'C', 'G'],
    genre: 'EDM',
    mood: 'Energetic',
    bpm: 128,
    description: 'High-energy, festival-ready foundation ideal for soaring synth leads and massive drop build-ups.',
    popularExamples: ['Wake Me Up (Avicii)', 'Faded (Alan Walker)', "Don't You Worry Child (Swedish House Mafia)"],
    genreSlug: 'edm',
    style: 'disco',
  },
  {
    id: 'minor-ii-v-i',
    name: 'Minor II–V–i Bossa Cadence',
    romanNumerals: ['IIø7', 'V7', 'Imin7', 'Imin7'],
    defaultKey: 'Cm',
    chords: ['Dm7b5', 'G7', 'Cm7', 'Cm7'],
    genre: 'Jazz',
    mood: 'Sophisticated',
    bpm: 116,
    description: 'The dramatic minor equivalent to the jazz II–V–I with half-diminished tension and minor resolution.',
    popularExamples: ['Blue Bossa (Kenny Dorham)', 'Black Orpheus', 'Alone Together'],
    genreSlug: 'jazz',
    style: 'jazz_light',
  },

  // ── Added so every genre filter returns more than a single card ──────────────
  // Drawn from the editorial catalog in progressions.ts so the two stay consistent.
  {
    id: 'pop-three-chord',
    name: 'I–IV–V Three-Chord Foundation',
    romanNumerals: ['I', 'IV', 'V'],
    defaultKey: 'C',
    chords: ['C', 'F', 'G'],
    genre: 'Pop',
    mood: 'Uplifting',
    bpm: 120,
    description: 'The three-chord skeleton of pop, rock and folk. If you only learn one progression, learn this one.',
    popularExamples: ['Twist and Shout (The Beatles)', 'La Bamba (Ritchie Valens)', 'Louie Louie (The Kingsmen)'],
    genreSlug: 'pop',
    style: 'pop_1',
  },
  {
    id: 'jazz-turnaround',
    name: 'I–VI–II–V Turnaround',
    romanNumerals: ['Imaj7', 'VI7', 'II7', 'V7'],
    defaultKey: 'C',
    chords: ['Cmaj7', 'A7', 'Dm7', 'G7'],
    genre: 'Jazz',
    mood: 'Sophisticated',
    bpm: 130,
    description: 'The classic turnaround that loops you back to the top of any standard. Bebop harmony in four chords.',
    popularExamples: ['I Got Rhythm', 'Blue Moon', 'Heart and Soul'],
    genreSlug: 'jazz',
    style: 'jazz_light',
  },
  {
    id: 'lofi-bossa-loop',
    name: 'Bossa Nova Study Loop',
    romanNumerals: ['Imaj7', 'VI7', 'II7', 'V7'],
    defaultKey: 'C',
    chords: ['Cmaj7', 'Am7', 'Dm7', 'G7'],
    genre: 'Lo-fi',
    mood: 'Dreamy',
    bpm: 75,
    description: 'Jobim-style major seventh harmony at a relaxed tempo. The backbone of thousands of study-beat tracks.',
    popularExamples: ['The Girl from Ipanema', 'Corcovado', 'Lo-fi hip-hop radio staples'],
    genreSlug: 'lo-fi',
    style: 'bossa_light',
  },
  {
    id: 'rock-power-drive',
    name: 'Classic Rock Drive',
    romanNumerals: ['I', 'IV', 'V', 'IV'],
    defaultKey: 'A',
    chords: ['A', 'D', 'E', 'D'],
    genre: 'Rock',
    mood: 'Energetic',
    bpm: 132,
    description: 'Open-string power and forward motion. The IV on the way back keeps the loop from ever fully resting.',
    popularExamples: ['Wild Thing (The Troggs)', 'Gloria (Them)', 'Rockin’ in the Free World (Neil Young)'],
    genreSlug: 'rock',
    style: 'rock_basic',
  },
  {
    id: 'worship-acoustic-build',
    name: 'Worship Acoustic Build',
    romanNumerals: ['I', 'V', 'VI', 'IV'],
    defaultKey: 'G',
    chords: ['G', 'D', 'Em', 'C'],
    genre: 'Worship',
    mood: 'Uplifting',
    bpm: 76,
    description: 'The most-played worship shape on acoustic guitar. Sits comfortably under most congregational vocal ranges.',
    popularExamples: ['10,000 Reasons (Matt Redman)', 'Great Are You Lord', 'Oceans (Hillsong United)'],
    genreSlug: 'worship',
    style: 'pop_6_8',
  },
  {
    id: 'blues-minor-slow',
    name: 'Slow Minor Blues',
    romanNumerals: ['Imin7', 'IVmin7', 'Imin7', 'V7'],
    defaultKey: 'Am',
    chords: ['Am7', 'Dm7', 'Am7', 'E7'],
    genre: 'Blues',
    mood: 'Melancholic',
    bpm: 68,
    description: 'The minor blues at a crawl — space between the chords is the whole point. Built for bending notes.',
    popularExamples: ['The Thrill Is Gone (B.B. King)', 'Since I’ve Been Loving You (Led Zeppelin)', 'Black Magic Woman'],
    genreSlug: 'blues',
    style: 'shuffle_blues',
  },
];

export const PROGRESSION_GENRES: readonly ('All' | ProgressionGenre)[] = [
  'All', 'Pop', 'Jazz', 'Neo Soul', 'Lo-fi', 'Worship', 'Blues', 'Rock', 'R&B', 'Classical', 'EDM',
] as const;

export const PROGRESSION_MOODS: readonly ('All' | ProgressionMood)[] = [
  'All', 'Uplifting', 'Melancholic', 'Dreamy', 'Sophisticated', 'Soulful', 'Nostalgic', 'Energetic',
] as const;

/** Keys offered by the Key filter, in the order they appear in the UI. */
export const PROGRESSION_KEYS: readonly string[] = [
  'All', 'C', 'D', 'E', 'F', 'G', 'A', 'Eb', 'Am', 'Cm',
] as const;
