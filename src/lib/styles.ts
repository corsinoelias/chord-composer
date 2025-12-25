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
    name: 'Pop 1',
    category: 'Pop',
    bpmRange: [100, 130],
    description: 'Classic pop with steady rhythm',
    rhythm: {
      piano: [0, 2],
      bass: [0, 2],
      drums: [0, 1, 2, 3],
    },
    volumes: { piano: 0.7, bass: 0.6, drums: 0.5 },
  },
  {
    id: 'pop2',
    name: 'Pop 2',
    category: 'Pop',
    bpmRange: [110, 140],
    description: 'Upbeat pop with syncopation',
    rhythm: {
      piano: [0, 1, 2, 3],
      bass: [0, 2],
      drums: [0, 1, 2, 3],
    },
    volumes: { piano: 0.6, bass: 0.7, drums: 0.6 },
  },
  {
    id: 'pop3',
    name: 'Pop 3',
    category: 'Pop',
    bpmRange: [90, 120],
    description: 'Soft pop ballad style',
    rhythm: {
      piano: [0],
      bass: [0, 2],
      drums: [0, 2],
    },
    volumes: { piano: 0.8, bass: 0.5, drums: 0.4 },
  },
  // Rock styles
  {
    id: 'rock1',
    name: 'Rock 1',
    category: 'Rock',
    bpmRange: [120, 150],
    description: 'Driving rock beat',
    rhythm: {
      piano: [0, 2],
      bass: [0, 1, 2, 3],
      drums: [0, 1, 2, 3],
    },
    volumes: { piano: 0.5, bass: 0.8, drums: 0.8 },
  },
  {
    id: 'rock2',
    name: 'Rock 2',
    category: 'Rock',
    bpmRange: [100, 130],
    description: 'Heavy rock with power chords feel',
    rhythm: {
      piano: [0],
      bass: [0, 2],
      drums: [0, 1, 2, 3],
    },
    volumes: { piano: 0.6, bass: 0.9, drums: 0.9 },
  },
  {
    id: 'rock3',
    name: 'Rock 3',
    category: 'Rock',
    bpmRange: [80, 110],
    description: 'Slow rock ballad',
    rhythm: {
      piano: [0, 2],
      bass: [0],
      drums: [0, 2],
    },
    volumes: { piano: 0.7, bass: 0.6, drums: 0.5 },
  },
  // Jazz styles
  {
    id: 'jazz1',
    name: 'Jazz 1',
    category: 'Jazz',
    bpmRange: [100, 140],
    description: 'Swing jazz feel',
    rhythm: {
      piano: [0, 1.5, 3],
      bass: [0, 1, 2, 3],
      drums: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],
    },
    volumes: { piano: 0.7, bass: 0.7, drums: 0.4 },
  },
  {
    id: 'jazz2',
    name: 'Jazz 2',
    category: 'Jazz',
    bpmRange: [60, 90],
    description: 'Slow jazz ballad',
    rhythm: {
      piano: [0, 2],
      bass: [0, 1, 2, 3],
      drums: [0, 2],
    },
    volumes: { piano: 0.8, bass: 0.6, drums: 0.3 },
  },
  {
    id: 'jazz3',
    name: 'Jazz 3',
    category: 'Jazz',
    bpmRange: [140, 180],
    description: 'Bebop jazz',
    rhythm: {
      piano: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],
      bass: [0, 1, 2, 3],
      drums: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],
    },
    volumes: { piano: 0.6, bass: 0.8, drums: 0.5 },
  },
  // Blues styles
  {
    id: 'blues1',
    name: 'Blues 1',
    category: 'Blues',
    bpmRange: [70, 100],
    description: 'Classic 12-bar blues',
    rhythm: {
      piano: [0, 1.5, 3],
      bass: [0, 2],
      drums: [0, 1, 2, 3],
    },
    volumes: { piano: 0.7, bass: 0.7, drums: 0.6 },
  },
  {
    id: 'blues2',
    name: 'Blues 2',
    category: 'Blues',
    bpmRange: [90, 120],
    description: 'Shuffle blues',
    rhythm: {
      piano: [0, 0.66, 1, 1.66, 2, 2.66, 3, 3.66],
      bass: [0, 1, 2, 3],
      drums: [0, 0.66, 1, 1.66, 2, 2.66, 3, 3.66],
    },
    volumes: { piano: 0.6, bass: 0.7, drums: 0.6 },
  },
  {
    id: 'blues3',
    name: 'Blues 3',
    category: 'Blues',
    bpmRange: [50, 70],
    description: 'Slow blues',
    rhythm: {
      piano: [0, 2],
      bass: [0, 2],
      drums: [0, 2],
    },
    volumes: { piano: 0.8, bass: 0.6, drums: 0.4 },
  },
  // Ballad styles
  {
    id: 'ballad1',
    name: 'Ballad 1',
    category: 'Ballad',
    bpmRange: [60, 80],
    description: 'Gentle ballad',
    rhythm: {
      piano: [0],
      bass: [0],
      drums: [0, 2],
    },
    volumes: { piano: 0.9, bass: 0.4, drums: 0.3 },
  },
  {
    id: 'ballad2',
    name: 'Ballad 2',
    category: 'Ballad',
    bpmRange: [70, 90],
    description: 'Romantic ballad',
    rhythm: {
      piano: [0, 2],
      bass: [0],
      drums: [0, 1, 2, 3],
    },
    volumes: { piano: 0.8, bass: 0.5, drums: 0.4 },
  },
  {
    id: 'ballad3',
    name: 'Ballad 3',
    category: 'Ballad',
    bpmRange: [80, 100],
    description: 'Power ballad',
    rhythm: {
      piano: [0, 2],
      bass: [0, 2],
      drums: [0, 1, 2, 3],
    },
    volumes: { piano: 0.7, bass: 0.7, drums: 0.6 },
  },
];

export function getStyleById(id: string): StylePattern | undefined {
  return MUSICAL_STYLES.find(s => s.id === id);
}
