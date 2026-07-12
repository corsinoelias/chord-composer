export type InstrumentStatus = 'available' | 'coming-soon'

export interface InstrumentListing {
  id: string
  name: string
  slug: string
  tagline: string
  description: string
  imagePath: string
  imageAlt: string
  status: InstrumentStatus
  url: string
  tags: string[]
  featureHighlights: string[]
  emoji: string
  image?: string
}

export const INSTRUMENTS_LIST: InstrumentListing[] = [
  {
    id: 'bass-guitar',
    name: 'Bass Guitar',
    slug: 'bass-guitar',
    tagline: 'Play a virtual 4-string bass in your browser — free, no install',
    description:
      'A full virtual bass guitar with real sampled tones. Choose from Fender Pick, Finger, Slap, or Muted sounds. Load preset songs or draw your own bass lines with the tab editor.',
    imagePath: '/images/instruments/bass-guitar.webp',
    imageAlt: 'Virtual bass guitar interface showing 4-string fretboard and tab editor',
    status: 'available',
    url: '/bass-guitar/',
    tags: ['4 sounds', 'Tab editor', 'Real samples'],
    featureHighlights: [
      'Fender Pick, Finger, Slap and Muted sample banks',
      'Draw bass lines in Grid or Tab notation view',
      '10+ preset songs (Billie Jean, Beat It, Le Freak…)',
      'Export to ASCII tab or MIDI — no account needed',
    ],
    emoji: '🎸',
    image: '/images/instruments/bass-guitar.webp',
  },
  {
    id: 'guitar',
    name: 'Guitar',
    slug: 'guitar',
    tagline: 'Play a virtual 6-string guitar in your browser — 8 sampled sounds',
    description: 'A full virtual guitar with 8 real sampled tones: Steel, Nylon, Clean, Jazz, Muted, Distorted, Overdrive, and Harmonics. Includes a tab editor with chord helper, capo support, and MIDI export.',
    imagePath: '/images/instruments/guitar.webp',
    imageAlt: 'Virtual guitar interface showing 6-string fretboard and tab editor',
    status: 'available',
    url: '/guitar/',
    tags: ['8 sounds', 'Tab editor', 'Real samples'],
    featureHighlights: [
      'Steel, Nylon, Clean, Jazz, Muted, Distorted, Overdrive and Harmonics sample banks',
      'Draw guitar tabs in Grid or Tab notation view',
      'Chord helper — insert full chords in one click',
      'Export to ASCII tab or MIDI — no account needed',
    ],
    emoji: '🎸',
    image: '/images/instruments/guitar.webp',
  },
  {
    id: 'drums',
    name: 'Drums',
    slug: 'drums',
    tagline: 'Play a real drum kit live in your browser — mouse, tap, keyboard, or MIDI',
    description: 'A playable 15-piece virtual drum kit — kick, snare, hi-hat, toms, crash and ride with edge/body/bell zones. The Acoustic kit uses real sampled sounds; Electronic is synthesized live. Record grooves and jam over 6 built-in beats.',
    imagePath: '/images/instruments/drums.webp',
    imageAlt: 'Virtual drum kit with playable pads',
    status: 'available',
    url: '/drums/',
    tags: ['Real Samples', 'MIDI', '15 Pieces'],
    featureHighlights: [
      'Kick, snare, hi-hat (closed/open/foot), toms, crash and ride with edge/body/bell zones',
      'Acoustic kit uses real sampled sounds; Electronic kit is synthesized live',
      'Play with mouse, touchscreen, keyboard, or MIDI',
      'Record with count-in, plus 6 built-in beat loops',
    ],
    emoji: '🥁',
    image: '/images/instruments/drums.webp',
  },
  {
    id: 'piano',
    name: 'Piano',
    slug: 'piano',
    tagline: 'Virtual grand piano — coming soon',
    description: 'A sampled grand piano you can play in the browser. Coming soon to Chord Sequence.',
    imagePath: '/images/instruments/piano.webp',
    imageAlt: 'Virtual piano keyboard',
    status: 'coming-soon',
    url: '/instruments/',
    tags: ['Grand Piano', 'Real samples', 'Coming soon'],
    featureHighlights: [],
    emoji: '🎹',
    image: '/images/instruments/piano.webp',
  },
]
