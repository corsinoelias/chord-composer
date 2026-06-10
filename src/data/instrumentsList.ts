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
  },
  {
    id: 'drums',
    name: 'Drums',
    slug: 'drums',
    tagline: 'Virtual drum kit — coming soon',
    description: 'A full acoustic drum kit you can trigger in the browser. Coming soon to Chord Sequence.',
    imagePath: '/images/instruments/drums.webp',
    imageAlt: 'Virtual drum kit',
    status: 'coming-soon',
    url: '/instruments/',
    tags: ['Acoustic Kit', 'Groove patterns', 'Coming soon'],
    featureHighlights: [],
    emoji: '🥁',
  },
  {
    id: 'guitar',
    name: 'Guitar',
    slug: 'guitar',
    tagline: 'Virtual acoustic & electric guitar — coming soon',
    description: 'Acoustic, electric, and nylon guitar sounds playable in the browser. Coming soon.',
    imagePath: '/images/instruments/guitar.webp',
    imageAlt: 'Virtual acoustic guitar',
    status: 'coming-soon',
    url: '/instruments/',
    tags: ['Acoustic', 'Electric', 'Coming soon'],
    featureHighlights: [],
    emoji: '🎸',
  },
]
