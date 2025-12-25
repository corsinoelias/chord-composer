/**
 * Musical Styles System
 * 
 * Each style defines rhythm patterns using 16th note resolution (16 slots per bar).
 * Slot 0 = beat 1, slot 4 = beat 2, slot 8 = beat 3, slot 12 = beat 4
 */

export interface StylePattern {
  id: string;
  name: string;
  category: 'Pop' | 'Rock' | 'Jazz' | 'Blues' | 'Ballad' | 'Funk' | 'HipHop';
  bpmRange: [number, number];
  description: string;
  // Rhythm pattern: 16th note slots (0-15) where instruments play
  rhythm: {
    piano: number[];      // Piano/keys hits
    bass: number[];       // Bass notes (with sustain info)
    kick: number[];       // Kick drum hits
    snare: number[];      // Snare/clap hits
    hihat: number[];      // Hi-hat hits
  };
  // Fill pattern for variation (played every 4th or 8th bar)
  fill?: {
    snare?: number[];
    kick?: number[];
    hihat?: number[];
  };
  // Default volumes (0-1)
  volumes: {
    piano: number;
    bass: number;
    drums: number;
  };
  // Bass sustain: if true, bass notes sustain until next note
  bassSustain?: boolean;
}

// Convert slot (0-15) to beat position (0-3.9375)
export function slotToBeat(slot: number): number {
  return slot / 4;
}

export const MUSICAL_STYLES: StylePattern[] = [
  // Pop/Rock - "Motor" pattern
  {
    id: 'pop1',
    name: 'Pop Classic',
    category: 'Pop',
    bpmRange: [100, 130],
    description: 'Classic pop with steady four-on-the-floor',
    rhythm: {
      piano: [0, 8],                           // Beats 1 and 3
      bass: [0, 4, 8, 12],                     // Quarter notes
      kick: [0, 8],                            // Beats 1 and 3
      snare: [4, 12],                          // Beats 2 and 4
      hihat: [0, 2, 4, 6, 8, 10, 12, 14],      // 8th notes
    },
    fill: {
      snare: [12, 13, 14, 15],                 // Roll at end of bar
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
      piano: [0, 2, 6, 8, 12],
      bass: [0, 6, 8, 14],
      kick: [0, 6, 8],
      snare: [4, 12],
      hihat: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], // 16ths
    },
    volumes: { piano: 0.6, bass: 0.7, drums: 0.6 },
  },
  {
    id: 'rock1',
    name: 'Rock Driving',
    category: 'Rock',
    bpmRange: [120, 150],
    description: 'Powerful driving rock beat',
    rhythm: {
      piano: [0, 8],
      bass: [0, 2, 4, 8, 10, 12],
      kick: [0, 8],
      snare: [4, 12],
      hihat: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    },
    fill: {
      snare: [12, 13, 14, 15],
      kick: [10],
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
      piano: [0, 8],
      bass: [0, 4, 8, 12],
      kick: [0, 4, 8, 12],
      snare: [4, 12],
      hihat: [0, 2, 4, 6, 8, 10, 12, 14],
    },
    volumes: { piano: 0.6, bass: 0.9, drums: 0.9 },
  },
  // Funk - "Broken" pattern
  {
    id: 'funk1',
    name: 'Funk Groove',
    category: 'Funk',
    bpmRange: [95, 115],
    description: 'Classic funk with syncopated bass',
    rhythm: {
      piano: [0, 3, 6, 10, 14],                // Syncopated chords
      bass: [0, 2, 4, 8, 10, 12, 14],          // Follows kick + adds notes
      kick: [0, 4, 10],                        // Syncopated kick
      snare: [4, 12],                          // Backbeat
      hihat: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    },
    fill: {
      kick: [12, 13, 14],
      snare: [13, 14, 15],
    },
    volumes: { piano: 0.55, bass: 0.8, drums: 0.7 },
  },
  {
    id: 'funk2',
    name: 'Disco Funk',
    category: 'Funk',
    bpmRange: [110, 130],
    description: 'Upbeat disco-influenced funk',
    rhythm: {
      piano: [0, 2, 4, 6, 8, 10, 12, 14],      // Driving chords
      bass: [0, 3, 4, 7, 8, 11, 12, 15],       // Octave pattern
      kick: [0, 4, 8, 12],                     // Four on the floor
      snare: [4, 12],
      hihat: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    },
    volumes: { piano: 0.6, bass: 0.75, drums: 0.7 },
  },
  // Ballad - "Spacious" pattern
  {
    id: 'ballad1',
    name: 'Gentle Ballad',
    category: 'Ballad',
    bpmRange: [55, 75],
    description: 'Soft intimate ballad with sustained bass',
    rhythm: {
      piano: [0, 4, 8, 12],                    // Quarter notes
      bass: [0, 8],                            // Sustained notes on 1 and 3
      kick: [0, 8],
      snare: [4, 12],
      hihat: [0, 4, 8, 12],                    // Quarter notes only
    },
    fill: {
      hihat: [12],                             // Crash
      snare: [14, 15],                         // Soft roll
    },
    bassSustain: true,
    volumes: { piano: 0.9, bass: 0.4, drums: 0.25 },
  },
  {
    id: 'ballad2',
    name: 'Romantic Ballad',
    category: 'Ballad',
    bpmRange: [65, 85],
    description: 'Emotional love song feel',
    rhythm: {
      piano: [0, 2, 4, 6, 8, 10, 12, 14],      // Arpeggiated feel
      bass: [0, 8],
      kick: [0, 8],
      snare: [4, 12],
      hihat: [0, 2, 4, 6, 8, 10, 12, 14],
    },
    bassSustain: true,
    volumes: { piano: 0.85, bass: 0.5, drums: 0.35 },
  },
  {
    id: 'ballad3',
    name: 'Power Ballad',
    category: 'Ballad',
    bpmRange: [75, 95],
    description: 'Building emotional power ballad',
    rhythm: {
      piano: [0, 4, 8, 12],
      bass: [0, 4, 8, 12],
      kick: [0, 8],
      snare: [4, 12],
      hihat: [0, 2, 4, 6, 8, 10, 12, 14],
    },
    volumes: { piano: 0.75, bass: 0.7, drums: 0.6 },
  },
  // Hip Hop/Trap - "Displaced" pattern
  {
    id: 'hiphop1',
    name: 'Hip Hop Classic',
    category: 'HipHop',
    bpmRange: [85, 100],
    description: 'Classic boom bap hip hop',
    rhythm: {
      piano: [0, 8],                           // Sparse chords
      bass: [0],                               // Sustained sub-bass
      kick: [0, 4, 6, 10],                     // Syncopated 808
      snare: [4, 12],                          // Backbeat clap
      hihat: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    },
    bassSustain: true,
    volumes: { piano: 0.5, bass: 0.9, drums: 0.75 },
  },
  {
    id: 'hiphop2',
    name: 'Trap',
    category: 'HipHop',
    bpmRange: [130, 160],
    description: 'Modern trap with rolling hi-hats',
    rhythm: {
      piano: [0, 12],                          // Minimal chords
      bass: [0],                               // Sub-bass drone
      kick: [0, 3, 6, 10],                     // Displaced kick
      snare: [8],                              // Snare on 3
      hihat: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    },
    fill: {
      hihat: [12, 13, 13, 14, 14, 15, 15, 15], // Hi-hat roll
    },
    bassSustain: true,
    volumes: { piano: 0.4, bass: 0.95, drums: 0.8 },
  },
  // Jazz styles
  {
    id: 'jazz1',
    name: 'Jazz Swing',
    category: 'Jazz',
    bpmRange: [100, 140],
    description: 'Classic swing jazz feel',
    rhythm: {
      piano: [0, 5, 8, 13],                    // Swing comping
      bass: [0, 4, 8, 12],                     // Walking bass
      kick: [0, 8],                            // Light kick
      snare: [4, 12],                          // Brush hits
      hihat: [0, 2, 5, 6, 8, 10, 13, 14],      // Swing pattern
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
      piano: [0, 4, 8, 12],
      bass: [0, 8],
      kick: [0, 8],
      snare: [4, 12],
      hihat: [0, 4, 8, 12],
    },
    bassSustain: true,
    volumes: { piano: 0.8, bass: 0.55, drums: 0.3 },
  },
  {
    id: 'jazz3',
    name: 'Bossa Nova',
    category: 'Jazz',
    bpmRange: [120, 145],
    description: 'Brazilian bossa nova groove',
    rhythm: {
      piano: [0, 3, 6, 9, 12],                 // Bossa pattern
      bass: [0, 6, 8, 14],                     // Syncopated bass
      kick: [0, 6, 8, 14],
      snare: [4, 10],
      hihat: [0, 2, 4, 6, 8, 10, 12, 14],
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
      piano: [0, 2, 5, 8, 10, 13],             // Shuffle pattern
      bass: [0, 4, 8, 12],
      kick: [0, 8],
      snare: [4, 12],
      hihat: [0, 2, 5, 6, 8, 10, 13, 14],      // Shuffle hi-hat
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
      piano: [0, 6, 8, 14],
      bass: [0, 8],
      kick: [0, 8],
      snare: [4, 12],
      hihat: [0, 4, 8, 12],
    },
    bassSustain: true,
    volumes: { piano: 0.8, bass: 0.6, drums: 0.4 },
  },
];

export function getStyleById(id: string): StylePattern | undefined {
  return MUSICAL_STYLES.find(s => s.id === id);
}

// Get drum pattern for a style (kick, snare, hihat combined)
export function getDrumPattern(style: StylePattern): number[] {
  const allHits = new Set([
    ...style.rhythm.kick,
    ...style.rhythm.snare,
    ...style.rhythm.hihat
  ]);
  return Array.from(allHits).sort((a, b) => a - b);
}

// Legacy compatibility: convert new pattern to old beat format
export function getBeatsFromSlots(slots: number[]): number[] {
  return slots.map(slot => slotToBeat(slot));
}
