export interface PageMeta {
  title: string
  tagline: string
  tags: string[]
}

export const PAGES_REGISTRY: Record<string, PageMeta> = {
  home: {
    title: 'Free Online Music Tools',
    tagline: 'Chord editor, virtual instruments, metronome, tuner and more — all in your browser.',
    tags: ['Free', 'No Install', 'No Account'],
  },
  editor: {
    title: 'Chord Progression Editor',
    tagline: 'Build progressions with piano, bass, drums and guitar. Export to WAV.',
    tags: ['Piano', 'Bass', 'Guitar', 'Drums'],
  },
  'bass-guitar': {
    title: 'Virtual Bass Guitar',
    tagline: 'Play a 4-string bass with real samples — tab editor, presets, WAV export.',
    tags: ['4 Sounds', 'Tab Editor', 'Real Samples'],
  },
  guitar: {
    title: 'Virtual Guitar',
    tagline: '8 sampled sounds: Steel, Nylon, Clean, Jazz, Muted, Distorted, Overdrive, Harmonics.',
    tags: ['8 Sounds', 'Tab Editor', 'Real Samples'],
  },
  instruments: {
    title: 'Virtual Instruments',
    tagline: 'Free instruments you can play in your browser. No install, no account.',
    tags: ['Bass Guitar', 'Guitar', 'More coming'],
  },
  songs: {
    title: 'Chord Charts & Songs',
    tagline: 'Find chord charts for thousands of songs — key, BPM, capo, and play-along.',
    tags: ['Key & BPM', 'Capo', 'Play Along'],
  },
  learn: {
    title: 'Learn Music Theory',
    tagline: 'Guides on chords, progressions, scales and intervals — for all levels.',
    tags: ['Beginner Friendly', 'Free Guides'],
  },
  tools: {
    title: 'Free Music Tools',
    tagline: 'Metronome, tuner, circle of fifths, key detector, chord transposer and more.',
    tags: ['Metronome', 'Tuner', 'Circle of Fifths'],
  },
  metronome: {
    title: 'Online Metronome',
    tagline: 'Free browser metronome. Set BPM, tap tempo, and practice with subdivisions.',
    tags: ['Free', 'Tap Tempo', 'No Install'],
  },
  'drum-machine': {
    title: 'Online Drum Machine',
    tagline: 'Free 16-step drum machine. 3 kits, 12 genre presets, no signup.',
    tags: ['16-Step', '3 Kits', 'Presets'],
  },
  drums: {
    title: 'Virtual Drums',
    tagline: 'Real sampled acoustic kit or synth electronic. Free, no signup.',
    tags: ['Real Samples', 'MIDI', '15 Pieces'],
  },
  piano: {
    title: 'Virtual Piano',
    tagline: 'Real sampled acoustic piano, MIDI support, song library. Free, no signup.',
    tags: ['Real Samples', 'MIDI', 'Song Library'],
  },
  tuner: {
    title: 'Online Instrument Tuner',
    tagline: 'Tune bass, guitar, or ukulele with real instrument sounds and alternate tunings.',
    tags: ['Real Samples', 'Guitar', 'Bass'],
  },
  'bass-tab': {
    title: 'Bass Tab Player',
    tagline: 'Draw, play and export bass lines. Pick, Finger, Slap and Synth sounds.',
    tags: ['Tab Editor', 'Real Samples', 'WAV Export'],
  },
  progressions: {
    title: 'Chord Progressions',
    tagline: 'Explore progressions by genre — pop, rock, jazz, blues, worship and more.',
    tags: ['Pop', 'Rock', 'Jazz', 'Blues'],
  },
  'chord-progression-generator': {
    title: 'Chord Progression Generator',
    tagline: 'Generate chord progressions in any key and style. Listen instantly in your browser.',
    tags: ['AI Assisted', 'All Keys', 'Free'],
  },
}
