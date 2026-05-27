export interface Progression {
  title: string;
  chords: string;
  bpm: number;
  style: string;
  description: string;
}

export interface Genre {
  slug: string;
  name: string;
  description: string;
  metaDescription: string;
  progressions: Progression[];
  learnLink?: { href: string; label: string };
}

export const GENRES: Genre[] = [
  {
    slug: 'pop',
    name: 'Pop',
    description: 'The most widely used chord progressions in modern pop music.',
    metaDescription: 'Explore the most common pop chord progressions: I–V–vi–IV, vi–IV–I–V, and more. Play them instantly in your browser with Chord Sequence.',
    progressions: [
      { title: 'I–V–vi–IV (The Axis)', chords: 'C G Am F', bpm: 110, style: 'pop_basic', description: 'The most recorded progression in modern pop. Heard in hundreds of hits.' },
      { title: 'vi–IV–I–V', chords: 'Am F C G', bpm: 100, style: 'pop_basic', description: 'Same chords as the Axis, but starting on vi gives a more melancholic feel.' },
      { title: 'I–IV–V', chords: 'C F G', bpm: 120, style: 'pop_basic', description: 'Three-chord foundation of pop, rock, and folk.' },
      { title: 'I–V–vi–iii–IV', chords: 'C G Am Em F', bpm: 105, style: 'pop_basic', description: 'Five-chord variation adding the iii for extra harmonic color.' },
      { title: 'I–IV–vi–V', chords: 'C F Am G', bpm: 108, style: 'pop_basic', description: 'Builds tension through the IV before resolving on V.' },
      { title: 'I–vi–IV–V (50s Progression)', chords: 'C Am F G', bpm: 115, style: 'pop_basic', description: 'Classic doo-wop and early rock staple. Romantic and timeless.' },
    ],
  },
  {
    slug: 'jazz',
    name: 'Jazz',
    description: 'Essential jazz chord progressions — from the ii–V–I cornerstone to bossa nova, jazz blues, and modal harmony.',
    metaDescription: 'Play and learn essential jazz chord progressions: ii–V–I, jazz turnarounds, bossa nova, jazz blues, modal jazz, and more. Interactive players — no signup required.',
    learnLink: { href: '/learn/jazz-chord-progressions', label: 'Read the complete jazz chord progressions guide →' },
    progressions: [
      { title: 'ii–V–I', chords: 'Dm7 G7 Cmaj7', bpm: 120, style: 'pop_basic', description: 'The cornerstone of jazz harmony. Used in virtually every jazz standard ever written.' },
      { title: 'I–VI–ii–V (Turnaround)', chords: 'Cmaj7 A7 Dm7 G7', bpm: 130, style: 'pop_basic', description: 'Classic jazz turnaround used to loop back to the top of any standard.' },
      { title: 'ii–V–I–VI (Extended)', chords: 'Dm7 G7 Cmaj7 A7', bpm: 120, style: 'pop_basic', description: 'Extends the ii–V–I with a VI7 that pulls the ear back to the beginning.' },
      { title: 'iii–VI–ii–V (Cycle)', chords: 'Em7 A7 Dm7 G7', bpm: 140, style: 'pop_basic', description: 'A cycle-of-fifths chain of dominants. The backbone of bebop harmony.' },
      { title: 'Jazz Blues', chords: 'C7 F7 C7 G7 F7 C7', bpm: 120, style: 'pop_basic', description: 'The 12-bar blues with jazz seventh chords. Parker, Rollins, Coltrane all started here.' },
      { title: 'Bossa Nova Loop', chords: 'Cmaj7 Am7 Dm7 G7', bpm: 80, style: 'pop_basic', description: 'Jobim-style major seventh harmony at a relaxed bossa nova tempo.' },
      { title: 'Descending Bossa Nova', chords: 'Fmaj7 Em7 Am7 Dm7 G7 Cmaj7', bpm: 75, style: 'pop_basic', description: 'Flowing cycle-of-fifths movement — the classic Jobim sound.' },
      { title: 'Minor ii–V–i', chords: 'Dm7 G7 Cm7', bpm: 120, style: 'pop_basic', description: 'The minor key ii–V–I. Essential for Autumn Leaves, Summertime, and minor standards.' },
      { title: 'Dorian Modal Vamp', chords: 'Dm7 Em7 Fmaj7 Em7', bpm: 110, style: 'pop_basic', description: 'Miles Davis "So What" style modal jazz. Two chords, infinite space.' },
      { title: 'Cycle of Fifths', chords: 'Em7 A7 Dm7 G7 Cmaj7', bpm: 130, style: 'pop_basic', description: 'Descending through the circle of fifths. The skeleton of Autumn Leaves.' },
      { title: 'I–IV–iii–VI (Bird Blues)', chords: 'Cmaj7 Fmaj7 Em7 A7', bpm: 130, style: 'pop_basic', description: 'Charlie Parker style reharmonization — Bird Blues opening changes.' },
      { title: 'Neo Soul Jazz', chords: 'Dm9 G13 Cmaj9 Am9', bpm: 88, style: 'pop_basic', description: 'Extended ninth and thirteenth chords for a modern jazz-R&B crossover feel.' },
    ],
  },
  {
    slug: 'lo-fi',
    name: 'Lo-fi',
    description: 'Chill, jazzy progressions for lo-fi hip-hop, study beats, and bedroom pop.',
    metaDescription: 'Lo-fi chord progressions for study beats and chill music. Cmaj7, Am7, Fmaj7 and more — play them instantly in your browser.',
    progressions: [
      { title: 'Lo-fi Jazz Loop', chords: 'Cmaj7 Am7 Fmaj7 G7', bpm: 75, style: 'pop_basic', description: 'Warm extended chords at a relaxed tempo. Perfect for study beats.' },
      { title: 'Chill Minor', chords: 'Am7 Dm7 G7 Cmaj7', bpm: 80, style: 'pop_basic', description: 'Smooth minor-to-major journey. Melancholic but calming.' },
      { title: 'Study Vibes', chords: 'Fmaj7 Em7 Am7 Dm7', bpm: 70, style: 'pop_basic', description: 'Four flowing major seventh chords. Great for focus and concentration.' },
      { title: 'Rainy Day', chords: 'Cmaj7 Bm7 Em7 Am7', bpm: 72, style: 'pop_basic', description: 'Descending motion with rich seventh harmony.' },
    ],
  },
  {
    slug: 'sad',
    name: 'Sad',
    description: 'Melancholic progressions that evoke depth, longing, and emotion.',
    metaDescription: 'Sad chord progressions for emotional music. Minor keys, descending lines, and melancholic harmony — play and export instantly.',
    progressions: [
      { title: 'Minor I–VI–III–VII', chords: 'Am F C G', bpm: 70, style: 'pop_basic', description: 'Classic melancholic pop. Starts in minor, resolves to relative major.' },
      { title: 'i–iv–v', chords: 'Am Dm Em', bpm: 65, style: 'pop_basic', description: 'Pure minor three-chord sadness. Raw and exposed.' },
      { title: 'i–VI–iv–V', chords: 'Am F Dm E', bpm: 75, style: 'pop_basic', description: 'Deep emotional pull with the iv chord adding extra weight.' },
      { title: 'Descending Minor', chords: 'Am G F E', bpm: 72, style: 'pop_basic', description: 'Falling bass line creates mounting tension and sadness.' },
      { title: 'i–VII–VI–v', chords: 'Am G F Em', bpm: 68, style: 'pop_basic', description: 'Slow descending line. Works well at half tempo for ballads.' },
    ],
  },
  {
    slug: 'happy',
    name: 'Happy',
    description: 'Uplifting, bright, and energetic chord progressions full of joy.',
    metaDescription: 'Happy chord progressions for upbeat music. Major keys, bright harmony, and energetic rhythm — build and play instantly.',
    progressions: [
      { title: 'I–IV–V–I', chords: 'C F G C', bpm: 130, style: 'pop_basic', description: 'Classic uplifting major progression. Instantly recognizable.' },
      { title: 'I–ii–IV–I', chords: 'C Dm F C', bpm: 125, style: 'pop_basic', description: 'Bright and bouncy with a soft ii chord in the middle.' },
      { title: 'I–V–IV–V', chords: 'G D C D', bpm: 135, style: 'pop_basic', description: 'High energy shuffle feel. Great for anthems and feel-good pop.' },
      { title: 'I–iii–IV–V', chords: 'C Em F G', bpm: 120, style: 'pop_basic', description: 'The iii chord adds warmth before the IV resolution.' },
    ],
  },
  {
    slug: 'neo-soul',
    name: 'Neo Soul',
    description: 'Rich extended harmony inspired by R&B, jazz, and neo soul.',
    metaDescription: 'Neo soul chord progressions with maj7, m9, and 13th chords. Build smooth R&B harmony and play it instantly with Chord Sequence.',
    progressions: [
      { title: 'Neo Soul Loop', chords: 'Fmaj7 Em7 Am7 Dm7', bpm: 85, style: 'pop_basic', description: 'Smooth flowing major sevenths. Pure neo soul texture.' },
      { title: 'Soulful IV–I', chords: 'Fmaj7 Cmaj7 Am7 G7', bpm: 90, style: 'pop_basic', description: 'R&B flavor with major sevenths and a dominant push.' },
      { title: 'Erykah Badu Vibe', chords: 'Dm9 G13 Cmaj9 Fmaj7', bpm: 88, style: 'pop_basic', description: 'Rich ninths and thirteenths for deep neo soul color.' },
      { title: 'Late Night Soul', chords: 'Am9 Dm9 Gmaj7 Cmaj7', bpm: 82, style: 'pop_basic', description: 'Extended minor ninths leading to major resolution.' },
    ],
  },
  {
    slug: 'worship',
    name: 'Worship',
    description: 'Soaring, spacious chord progressions used in contemporary worship music.',
    metaDescription: 'Contemporary worship chord progressions in G major and C major. Play and export instantly with Chord Sequence.',
    progressions: [
      { title: 'Worship I–V–vi–IV', chords: 'G D Em C', bpm: 72, style: 'pop_basic', description: 'The most common worship key progression. Soaring and open.' },
      { title: 'Anthem Build', chords: 'C G Am F', bpm: 68, style: 'pop_basic', description: 'Wide, spacious anthem feel. Works at any tempo.' },
      { title: 'Slow Worship', chords: 'G Em C D', bpm: 60, style: 'pop_basic', description: 'Intimate and reverent. Perfect for ballad verses.' },
      { title: 'Triumphant', chords: 'D A Bm G', bpm: 78, style: 'pop_basic', description: 'Brighter D major with uplifting resolution.' },
    ],
  },
  {
    slug: 'edm',
    name: 'EDM',
    description: 'High-energy chord progressions built for electronic dance music.',
    metaDescription: 'EDM chord progressions for house, trance, and electronic music. Play at 128–140 BPM and export your progression instantly.',
    progressions: [
      { title: 'Club Classic', chords: 'Am F C G', bpm: 128, style: 'pop_basic', description: 'The universal EDM minor progression. Works in every subgenre.' },
      { title: 'Trance Loop', chords: 'Am G F E', bpm: 140, style: 'pop_basic', description: 'Descending bass line with mounting intensity.' },
      { title: 'Progressive House', chords: 'C G Am F', bpm: 130, style: 'pop_basic', description: 'Classic build-and-drop structure for progressive tracks.' },
      { title: 'Euphoric Rave', chords: 'F C G Am', bpm: 138, style: 'pop_basic', description: 'Starts on IV for an instant emotional lift.' },
    ],
  },
];

export function getGenre(slug: string): Genre | undefined {
  return GENRES.find((g) => g.slug === slug);
}
