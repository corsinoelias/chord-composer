/**
 * Musical Styles System
 * 
 * Each style defines rhythm patterns and instrument volumes
 * that adapt the sound while keeping the chord progression.
 */

export interface StylePattern {
  id: string;
  name: string;
  category: 'Pop' | 'Rock' | 'Jazz' | 'Blues' | 'Ballad';
  bpmRange: [number, number];
  description: string;
  // Rhythm pattern: beats per chord where instruments play
  rhythm: {
    piano: number[];      // Which beats piano plays (0-indexed within chord duration)
    bass: number[];       // Which beats bass plays
    drums: number[];      // Which beats drums play
  };
  // Default volumes (0-1)
  volumes: {
    piano: number;
    bass: number;
    drums: number;
  };
}

export const MUSICAL_STYLES: StylePattern[] = [
  // Pop styles
  {
    id: 'pop1',
    name: 'Pop Classic',
    category: 'Pop',
    bpmRange: [100, 130],
    description: 'Classic pop with steady four-on-the-floor',
    rhythm: {
      piano: [0, 2],
      bass: [0, 0.5, 2, 2.5],
      drums: [0, 1, 2, 3],
    },
    volumes: { piano: 0.7, bass: 0.65, drums: 0.55 },
  },
  {
    id: 'pop2',
    name: 'Pop Syncopated',
    category: 'Pop',
    bpmRange: [110, 140],
    description: 'Upbeat pop with off-beat accents',
    rhythm: {
      piano: [0, 0.5, 1.5, 2, 3],
      bass: [0, 1.5, 2, 3.5],
      drums: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],
    },
    volumes: { piano: 0.6, bass: 0.7, drums: 0.6 },
  },
  {
    id: 'pop3',
    name: 'Pop Ballad',
    category: 'Pop',
    bpmRange: [70, 100],
    description: 'Gentle pop ballad feel',
    rhythm: {
      piano: [0, 1, 2, 3],
      bass: [0, 2],
      drums: [0, 2],
    },
    volumes: { piano: 0.8, bass: 0.5, drums: 0.4 },
  },
  {
    id: 'pop4',
    name: 'Dance Pop',
    category: 'Pop',
    bpmRange: [120, 135],
    description: 'Energetic dance-oriented pop',
    rhythm: {
      piano: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],
      bass: [0, 1, 2, 3],
      drums: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],
    },
    volumes: { piano: 0.55, bass: 0.75, drums: 0.7 },
  },
  // Rock styles
  {
    id: 'rock1',
    name: 'Rock Driving',
    category: 'Rock',
    bpmRange: [120, 150],
    description: 'Powerful driving rock beat',
    rhythm: {
      piano: [0, 2],
      bass: [0, 0.5, 1, 2, 2.5, 3],
      drums: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],
    },
    volumes: { piano: 0.5, bass: 0.85, drums: 0.8 },
  },
  {
    id: 'rock2',
    name: 'Hard Rock',
    category: 'Rock',
    bpmRange: [100, 130],
    description: 'Heavy rock with power chord feel',
    rhythm: {
      piano: [0, 2],
      bass: [0, 1, 2, 3],
      drums: [0, 1, 2, 3],
    },
    volumes: { piano: 0.6, bass: 0.9, drums: 0.9 },
  },
  {
    id: 'rock3',
    name: 'Rock Ballad',
    category: 'Rock',
    bpmRange: [70, 100],
    description: 'Emotional slow rock',
    rhythm: {
      piano: [0, 1, 2, 3],
      bass: [0, 2],
      drums: [0, 2, 3],
    },
    volumes: { piano: 0.75, bass: 0.6, drums: 0.5 },
  },
  {
    id: 'rock4',
    name: 'Punk Rock',
    category: 'Rock',
    bpmRange: [160, 200],
    description: 'Fast aggressive punk style',
    rhythm: {
      piano: [0, 1, 2, 3],
      bass: [0, 1, 2, 3],
      drums: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],
    },
    volumes: { piano: 0.5, bass: 0.85, drums: 0.85 },
  },
  // Jazz styles
  {
    id: 'jazz1',
    name: 'Jazz Swing',
    category: 'Jazz',
    bpmRange: [100, 140],
    description: 'Classic swing jazz feel',
    rhythm: {
      piano: [0, 1.66, 2, 3.66],
      bass: [0, 1, 2, 3],
      drums: [0, 0.66, 1, 1.66, 2, 2.66, 3, 3.66],
    },
    volumes: { piano: 0.7, bass: 0.7, drums: 0.45 },
  },
  {
    id: 'jazz2',
    name: 'Jazz Ballad',
    category: 'Jazz',
    bpmRange: [50, 80],
    description: 'Slow romantic jazz',
    rhythm: {
      piano: [0, 1, 2, 3],
      bass: [0, 2],
      drums: [0, 2],
    },
    volumes: { piano: 0.8, bass: 0.55, drums: 0.3 },
  },
  {
    id: 'jazz3',
    name: 'Bebop',
    category: 'Jazz',
    bpmRange: [160, 220],
    description: 'Fast complex bebop jazz',
    rhythm: {
      piano: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],
      bass: [0, 1, 2, 3],
      drums: [0, 0.33, 0.66, 1, 1.33, 1.66, 2, 2.33, 2.66, 3, 3.33, 3.66],
    },
    volumes: { piano: 0.6, bass: 0.75, drums: 0.5 },
  },
  {
    id: 'jazz4',
    name: 'Bossa Nova',
    category: 'Jazz',
    bpmRange: [120, 145],
    description: 'Brazilian bossa nova groove',
    rhythm: {
      piano: [0, 0.75, 1.5, 2.25, 3],
      bass: [0, 1.5, 2, 3.5],
      drums: [0, 0.5, 1.5, 2, 2.5, 3.5],
    },
    volumes: { piano: 0.7, bass: 0.65, drums: 0.4 },
  },
  // Blues styles
  {
    id: 'blues1',
    name: 'Blues Shuffle',
    category: 'Blues',
    bpmRange: [80, 120],
    description: 'Classic 12-bar blues shuffle',
    rhythm: {
      piano: [0, 0.66, 1, 1.66, 2, 2.66, 3, 3.66],
      bass: [0, 1, 2, 3],
      drums: [0, 0.66, 1, 1.66, 2, 2.66, 3, 3.66],
    },
    volumes: { piano: 0.7, bass: 0.7, drums: 0.6 },
  },
  {
    id: 'blues2',
    name: 'Slow Blues',
    category: 'Blues',
    bpmRange: [50, 75],
    description: 'Deep emotional slow blues',
    rhythm: {
      piano: [0, 1.5, 2, 3.5],
      bass: [0, 2],
      drums: [0, 2],
    },
    volumes: { piano: 0.8, bass: 0.6, drums: 0.4 },
  },
  {
    id: 'blues3',
    name: 'Chicago Blues',
    category: 'Blues',
    bpmRange: [100, 130],
    description: 'Urban electric blues style',
    rhythm: {
      piano: [0, 0.5, 1.5, 2, 3, 3.5],
      bass: [0, 1, 2, 3],
      drums: [0, 1, 2, 3],
    },
    volumes: { piano: 0.65, bass: 0.75, drums: 0.65 },
  },
  // Ballad styles
  {
    id: 'ballad1',
    name: 'Gentle Ballad',
    category: 'Ballad',
    bpmRange: [55, 75],
    description: 'Soft intimate ballad',
    rhythm: {
      piano: [0, 1, 2, 3],
      bass: [0, 2],
      drums: [2],
    },
    volumes: { piano: 0.9, bass: 0.4, drums: 0.25 },
  },
  {
    id: 'ballad2',
    name: 'Romantic Ballad',
    category: 'Ballad',
    bpmRange: [65, 85],
    description: 'Emotional love song feel',
    rhythm: {
      piano: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],
      bass: [0, 2],
      drums: [0, 2],
    },
    volumes: { piano: 0.85, bass: 0.5, drums: 0.35 },
  },
  {
    id: 'ballad3',
    name: 'Power Ballad',
    category: 'Ballad',
    bpmRange: [75, 95],
    description: 'Building emotional power ballad',
    rhythm: {
      piano: [0, 1, 2, 3],
      bass: [0, 1, 2, 3],
      drums: [0, 1, 2, 3],
    },
    volumes: { piano: 0.75, bass: 0.7, drums: 0.6 },
  },
  {
    id: 'ballad4',
    name: 'Cinematic',
    category: 'Ballad',
    bpmRange: [60, 80],
    description: 'Epic cinematic feel',
    rhythm: {
      piano: [0, 2],
      bass: [0],
      drums: [0, 2],
    },
    volumes: { piano: 0.9, bass: 0.55, drums: 0.45 },
  },
];

export function getStyleById(id: string): StylePattern | undefined {
  return MUSICAL_STYLES.find(s => s.id === id);
}
