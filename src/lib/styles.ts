/**
 * Musical Styles System - Automatic Rhythm Pattern Generator
 * 
 * Each style defines rhythm patterns using 16th note resolution (16 slots per bar in 4/4).
 * Slot mapping: 
 *   0-3 = Beat 1 (1, e, &, a)
 *   4-7 = Beat 2 (2, e, &, a)
 *   8-11 = Beat 3 (3, e, &, a)
 *   12-15 = Beat 4 (4, e, &, a)
 * 
 * X = Strong hit (1.0), x = Ghost note (0.5), - = Silence (0)
 */

export interface StylePattern {
  id: string;
  name: string;
  category: 'Rock' | 'Pop' | 'Funk' | 'HipHop' | 'Reggaeton' | 'Jazz' | 'Ballad' | 'Disco' | 'Trap' | 'Latin';
  bpm: number;
  bpmRange: [number, number];
  description: string;
  // Rhythm patterns: 16 slots with velocity values (0 = silence, 0.5 = ghost, 1 = accent)
  rhythm: {
    piano: number[];      // Piano/keys pattern
    bass: number[];       // Bass pattern
    kick: number[];       // Kick drum pattern
    snare: number[];      // Snare/clap pattern
    hihat: number[];      // Hi-hat pattern
  };
  // Fill pattern (played on bar 4 or 8)
  fill: {
    position: number;     // Starting slot (usually 12 for last beat)
    pattern: {
      kick?: number[];
      snare?: number[];
      hihat?: number[];
    };
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

/**
 * Interaction rules for natural-sounding patterns
 */
export const INTERACTION_RULES = {
  // Bass follows kick 70% of the time
  bassFollowsKick: 0.7,
  // Hi-hat softens when snare hits
  hihatSoftensOnSnare: 0.5,
  // Piano fills empty spaces
  pianoFillsGaps: 0.6,
};

/**
 * Apply interaction rules to generate more natural patterns
 */
export function applyInteractionRules(
  kick: number[],
  snare: number[],
  hihat: number[],
  bass: number[],
  piano: number[]
): { kick: number[]; snare: number[]; hihat: number[]; bass: number[]; piano: number[] } {
  const newHihat = [...hihat];
  
  // When snare hits, soften hi-hat
  for (let i = 0; i < 16; i++) {
    if (snare[i] > 0 && hihat[i] > 0) {
      newHihat[i] *= INTERACTION_RULES.hihatSoftensOnSnare;
    }
  }
  
  return { kick, snare, hihat: newHihat, bass, piano };
}

/**
 * Fill types for transitions
 */
export const FILL_TYPES = {
  simple: { length: 4, slots: [12, 13, 14, 15] },       // 4 16ths
  double: { length: 8, slots: [8, 9, 10, 11, 12, 13, 14, 15] },  // 8 16ths
  triple: { length: 12, slots: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] }, // 12 16ths
  syncopated: { length: 6, slots: [8, 10, 12, 13, 14, 15] }, // Broken pattern
};

/**
 * Determine if a fill should be applied
 * @param barNumber Current bar number (1-indexed)
 * @param phraseLength Bars per phrase (typically 4 or 8)
 */
export function shouldApplyFill(barNumber: number, phraseLength: number = 4): boolean {
  return barNumber % phraseLength === 0;
}

/**
 * Get random fill type with weighted probability
 */
export function getRandomFillType(): 'simple' | 'double' | 'triple' | 'syncopated' {
  const rand = Math.random();
  if (rand < 0.3) return 'simple';      // 30%
  if (rand < 0.8) return 'double';      // 50%
  if (rand < 0.95) return 'triple';     // 15%
  return 'syncopated';                   // 5%
}

export const MUSICAL_STYLES: StylePattern[] = [
  // 1. ROCK BÁSICO (120 BPM)
  {
    id: 'rock_basic',
    name: 'Rock Básico',
    category: 'Rock',
    bpm: 120,
    bpmRange: [110, 140],
    description: 'Backbeat fuerte, impulso constante. Clásico patrón de rock con caja en 2 y 4.',
    rhythm: {
      // X - - - - - - - X - - - - - - - (beats 1 and 3)
      kick:  [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
      // - - - - X - - - - - - - X - - - (beats 2 and 4)
      snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      // X X X X X X X X X X X X X X X X (all 16ths)
      hihat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      // X - - - X - - - X - - - X - - - (quarter notes)
      bass:  [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
      // - - X - - - X - - - X - - - X - (off-beat chords)
      piano: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
    },
    fill: {
      position: 8,
      pattern: {
        snare: [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1], // Redoble ascendente
      },
    },
    volumes: { piano: 0.6, bass: 0.8, drums: 0.75 },
  },

  // 2. POP BÁSICO (110 BPM)
  {
    id: 'pop_basic',
    name: 'Pop Básico',
    category: 'Pop',
    bpm: 110,
    bpmRange: [100, 130],
    description: 'Simple, pegadizo, groove constante. Perfecto para canciones pop modernas.',
    rhythm: {
      // X - - - - - X - X - - - - - - - (syncopated)
      kick:  [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0],
      // - - - - X - - - - - - - X - - - (2 and 4)
      snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      // - X - X - X - X - X - X - X - X (off-beat 8ths)
      hihat: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
      // X - - X - - - - X - - X - - - - 
      bass:  [1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0],
      // X - - - - - - - X - - - - - - - (1 and 3)
      piano: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
    },
    fill: {
      position: 12,
      pattern: {
        snare: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1], // 4 16ths
      },
    },
    volumes: { piano: 0.7, bass: 0.7, drums: 0.65 },
  },

  // 3. FUNK BÁSICO (100 BPM)
  {
    id: 'funk_basic',
    name: 'Funk Básico',
    category: 'Funk',
    bpm: 100,
    bpmRange: [90, 115],
    description: 'Síncopa, énfasis en el "&". Groove funky con bajo sincopado.',
    rhythm: {
      // X - - - - X - - - - - - X - - -
      kick:  [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      // - - - - X - - - - - - - X - - -
      snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      // X - X - X - X - X - X - X - X - (8ths)
      hihat: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
      // X - X - - X - - X - X - - X - - (syncopated)
      bass:  [1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0],
      // - - X - - - X - - - X - - - X - (staccato off-beat)
      piano: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
    },
    fill: {
      position: 8,
      pattern: {
        snare: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1, 1, 1, 1], // Syncopated
        kick:  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0],
      },
    },
    volumes: { piano: 0.55, bass: 0.85, drums: 0.7 },
  },

  // 4. HIP HOP BÁSICO (95 BPM)
  {
    id: 'hiphop_basic',
    name: 'Hip Hop Básico',
    category: 'HipHop',
    bpm: 95,
    bpmRange: [85, 105],
    description: 'Bombo pesado, hi-hats rápidos. Boom bap clásico.',
    rhythm: {
      // X - - - - - - - - - X - - - - X
      kick:  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      // - - - - - - - - X - - - - - - -
      snare: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
      // X X X X X X X X X X X X X X X X (16ths)
      hihat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      // X - - - - - - - - - - - - - - - (sustained)
      bass:  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      // - - - - X - - - - - - - X - - -
      piano: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    },
    fill: {
      position: 8,
      pattern: {
        hihat: [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1], // Hi-hat roll
      },
    },
    bassSustain: true,
    volumes: { piano: 0.5, bass: 0.9, drums: 0.75 },
  },

  // 5. REGGAETÓN/DEMBOW (90 BPM)
  {
    id: 'reggaeton',
    name: 'Reggaetón',
    category: 'Reggaeton',
    bpm: 90,
    bpmRange: [85, 100],
    description: 'Ritmo "boom-ch-boom-chick". El clásico dembow latino.',
    rhythm: {
      // X - - - - - - - X - - - - - - -
      kick:  [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
      // - - - - X - - - - - - - X - - -
      snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      // - - X - - - X - - - X - - - X - (syncopated)
      hihat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
      // X - - - - - - - X - - - - - - - (follows kick)
      bass:  [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
      // - - - - - - X - - - - - - - X - (stabs)
      piano: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0],
    },
    fill: {
      position: 8,
      pattern: {
        snare: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 1], // Timbal pattern
      },
    },
    volumes: { piano: 0.6, bass: 0.85, drums: 0.8 },
  },

  // 6. JAZZ SWING (140 BPM)
  {
    id: 'jazz_swing',
    name: 'Jazz Swing',
    category: 'Jazz',
    bpm: 140,
    bpmRange: [120, 160],
    description: 'Triplet feel, ride pattern. El groove del jazz clásico.',
    rhythm: {
      // X - - - - - - - X - - - - - - - (light kick)
      kick:  [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
      // - - - - X - X - - - - - X - X - (comping snare)
      snare: [0, 0, 0, 0, 1, 0, 0.5, 0, 0, 0, 0, 0, 1, 0, 0.5, 0],
      // X - X X - X X - X X - X X - X X (swing ride pattern)
      hihat: [1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1],
      // X - - X - - X - X - - X - - X - (walking bass)
      bass:  [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0],
      // - X - - X - - X - X - - X - - X (syncopated comping)
      piano: [0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1],
    },
    fill: {
      position: 8,
      pattern: {
        snare: [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 1, 1, 1, 0], // Swing fill on toms
      },
    },
    volumes: { piano: 0.7, bass: 0.7, drums: 0.5 },
  },

  // 7. BALADA (70 BPM)
  {
    id: 'ballad',
    name: 'Balada',
    category: 'Ballad',
    bpm: 70,
    bpmRange: [55, 85],
    description: 'Espaciado, énfasis en dinámicas. Suave y emotivo.',
    rhythm: {
      // X - - - - - - - X - - - - - - -
      kick:  [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
      // - - - - X - - - - - - - X - - -
      snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      // X - - - X - - - X - - - X - - - (quarter notes)
      hihat: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
      // X - - - - - - - - - - - - - - - (sustained whole note)
      bass:  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      // X - - - - - - - X - - - - - - - (long chords)
      piano: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
    },
    fill: {
      position: 12,
      pattern: {
        snare: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5], // Soft roll
        hihat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], // Crash
      },
    },
    bassSustain: true,
    volumes: { piano: 0.85, bass: 0.5, drums: 0.35 },
  },

  // 8. DISCO (120 BPM)
  {
    id: 'disco',
    name: 'Disco',
    category: 'Disco',
    bpm: 120,
    bpmRange: [115, 130],
    description: 'Bombo 4/4 "four on the floor", hi-hat abierto. Pura energía disco.',
    rhythm: {
      // X - - - X - - - X - - - X - - - (four on the floor)
      kick:  [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
      // - - - - X - - - - - - - X - - -
      snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      // - X - X - X - X - X - X - X - X (open on "&")
      hihat: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
      // X - - X - - - - X - - X - - - - (octaves)
      bass:  [1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0],
      // - - X X - - X X - - X X - - X X (staccato chords)
      piano: [0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1],
    },
    fill: {
      position: 8,
      pattern: {
        snare: [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0], // Roll + crash
        hihat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], // Crash
      },
    },
    volumes: { piano: 0.65, bass: 0.75, drums: 0.75 },
  },

  // 9. TRAP MODERNO (140 BPM)
  {
    id: 'trap_modern',
    name: 'Trap Moderno',
    category: 'Trap',
    bpm: 140,
    bpmRange: [130, 160],
    description: 'Bombo desplazado, hi-hats rápidos con rolls. El sonido del trap actual.',
    rhythm: {
      // X - - - - - X - - X - - - - - X (displaced)
      kick:  [1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1],
      // - - - - - - - - X - - - - - - -
      snare: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
      // X x X x X x X x X x X x X x X x (fast with ghosts)
      hihat: [1, 0.5, 1, 0.5, 1, 0.5, 1, 0.5, 1, 0.5, 1, 0.5, 1, 0.5, 1, 0.5],
      // X - - - - - - - - - - - - - - - (sub sustained)
      bass:  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      // - - - - X - - - - - - - - - - - (minimal melody)
      piano: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    },
    fill: {
      position: 8,
      pattern: {
        hihat: [0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0.5, 0.7, 0.7, 0.8, 0.9, 1, 1], // Crescendo roll
        kick:  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1],
      },
    },
    bassSustain: true,
    volumes: { piano: 0.45, bass: 0.95, drums: 0.8 },
  },

  // 10. SAMBA BÁSICO (110 BPM)
  {
    id: 'samba_basic',
    name: 'Samba Básico',
    category: 'Latin',
    bpm: 110,
    bpmRange: [100, 120],
    description: 'Polirritmia, percusión compleja. El groove brasileño clásico.',
    rhythm: {
      // X - - X - X - - X - - X - X - - (surdo pattern)
      kick:  [1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0],
      // - X - - X - X - - X - - X - X - (tamborim feel)
      snare: [0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0],
      // X - X - X - X - X - X - X - X - (8ths - agogo feel)
      hihat: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
      // X - - - X - - - X - - - X - - -
      bass:  [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
      // X - X - X - X - X - X - X - X - (syncopated chords)
      piano: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
    },
    fill: {
      position: 0,
      pattern: {
        snare: [1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0], // Repique pattern
      },
    },
    volumes: { piano: 0.6, bass: 0.7, drums: 0.7 },
  },
];

/**
 * Get style by ID
 */
export function getStyleById(id: string): StylePattern | undefined {
  return MUSICAL_STYLES.find(s => s.id === id);
}

/**
 * Generate a complete arrangement pattern for a bar
 * @param style The musical style
 * @param barNumber Current bar number (1-indexed)
 * @param phraseLength Bars per phrase for fill calculation
 * @param humanize Add slight timing/velocity variations
 */
export function generateBarPattern(
  style: StylePattern,
  barNumber: number,
  phraseLength: number = 4,
  humanize: boolean = true
): {
  kick: number[];
  snare: number[];
  hihat: number[];
  bass: number[];
  piano: number[];
} {
  // Start with base patterns
  let kick = [...style.rhythm.kick];
  let snare = [...style.rhythm.snare];
  let hihat = [...style.rhythm.hihat];
  let bass = [...style.rhythm.bass];
  let piano = [...style.rhythm.piano];

  // Apply fill on phrase endings
  if (shouldApplyFill(barNumber, phraseLength)) {
    const fillPos = style.fill.position;
    
    if (style.fill.pattern.kick) {
      for (let i = fillPos; i < 16; i++) {
        if (style.fill.pattern.kick[i] !== undefined) {
          kick[i] = style.fill.pattern.kick[i];
        }
      }
    }
    if (style.fill.pattern.snare) {
      for (let i = fillPos; i < 16; i++) {
        if (style.fill.pattern.snare[i] !== undefined) {
          snare[i] = style.fill.pattern.snare[i];
        }
      }
    }
    if (style.fill.pattern.hihat) {
      for (let i = fillPos; i < 16; i++) {
        if (style.fill.pattern.hihat[i] !== undefined) {
          hihat[i] = style.fill.pattern.hihat[i];
        }
      }
    }
  }

  // Apply humanization (slight velocity variations)
  if (humanize) {
    const humanizeVelocity = (arr: number[]) => 
      arr.map(v => v > 0 ? Math.max(0.2, v * (0.85 + Math.random() * 0.3)) : 0);
    
    kick = humanizeVelocity(kick);
    snare = humanizeVelocity(snare);
    hihat = humanizeVelocity(hihat);
  }

  // Apply interaction rules
  return applyInteractionRules(kick, snare, hihat, bass, piano);
}

/**
 * Get all slots where a specific instrument plays
 */
export function getInstrumentSlots(pattern: number[]): number[] {
  return pattern
    .map((v, i) => v > 0 ? i : -1)
    .filter(i => i >= 0);
}

/**
 * Legacy: Get drum pattern combining all drum hits
 */
export function getDrumPattern(style: StylePattern): number[] {
  const allHits = new Set<number>();
  style.rhythm.kick.forEach((v, i) => v > 0 && allHits.add(i));
  style.rhythm.snare.forEach((v, i) => v > 0 && allHits.add(i));
  style.rhythm.hihat.forEach((v, i) => v > 0 && allHits.add(i));
  return Array.from(allHits).sort((a, b) => a - b);
}

/**
 * Legacy: Convert slots to beats
 */
export function getBeatsFromSlots(slots: number[]): number[] {
  return slots.map(slot => slotToBeat(slot));
}
