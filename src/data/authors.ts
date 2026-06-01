export const AUTHORS = {
  'elias-corsino': {
    name: 'Elías Corsino Saldaña',
    slug: 'elias-corsino',
    role: 'Musician & Software Developer',
    bio: `Elías Corsino Saldaña is a musician and software developer from the Dominican Republic. He started learning music at age 12 and plays piano, bass, guitar, and drums. He built Chord Sequence to combine his passion for music theory with his background in software engineering — making harmony tools accessible to every musician, regardless of experience.`,
    linkedin: 'https://www.linkedin.com/in/elias-corsino-salda%C3%B1a-945138182/',
    instagram: 'https://www.instagram.com/corsinoeliaas/',
    url: 'https://chordsequence.com/about/elias-corsino/',
    avatar: '/images/elias-corsino.jpg',
  },
} as const;

export type AuthorSlug = keyof typeof AUTHORS;
