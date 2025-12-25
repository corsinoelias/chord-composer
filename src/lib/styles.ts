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
  category: 'Rock' | 'Funk' | 'Pop' | 'Reggae' | 'HipHop' | 'Disco' | 'Blues' | 'Latin' | 'Metal';
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
  // ============================================
  // 1. ROCK BÁSICO (Backbeat) - 120 BPM
  // ============================================
  // Característica: Backbeat fuerte, impulso constante.
  // Bombo en 1 y 3, Caja en 2 y 4. Hi-hat en semicorcheas constantes.
  // Bajo: Notas en tiempos fuertes (1 y 3) o siguiendo el bombo.
  // Piano: Acordes en tiempos 2 y 4 ("upbeats") o acentuando el backbeat.
  {
    id: 'rock_basic',
    name: 'Rock Básico',
    category: 'Rock',
    bpm: 120,
    bpmRange: [110, 140],
    description: 'Backbeat fuerte, impulso constante. Bombo en 1 y 3, caja en 2 y 4.',
    rhythm: {
      // B: X - - - | X - - - | X - - - | X - - - (bombo en cada beat)
      kick:  [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
      // C: - - - - | X - - - | - - - - | X - - - (caja en 2 y 4)
      snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      // H: x x x x | x x x x | x x x x | x x x x (semicorcheas)
      hihat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      // B: X - - - | - - X - | X - - - | - - X - (fundamental y quinta)
      bass:  [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0],
      // P: - - - - | X - - - | - - - - | X - - - (acordes en backbeat)
      piano: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    },
    fill: {
      position: 12,
      pattern: {
        // Fill 2: Con Bombo (Rock) - Patrón alternado Bombo-Caja
        kick:  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0],
        snare: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1],
      },
    },
    volumes: { piano: 0.6, bass: 0.8, drums: 0.75 },
  },

  // ============================================
  // 2. FUNK BÁSICO (Groove en 16avos) - 100 BPM
  // ============================================
  // Característica: Síncopa, énfasis en el "&" (and).
  // Groove sincopado, con el bombo "hablando".
  // Bajo: Riffs sincopados, a menudo "slap".
  // Piano: Acordes "staccato" (cortos) y rasgueados en semicorcheas.
  {
    id: 'funk_basic',
    name: 'Funk Básico',
    category: 'Funk',
    bpm: 100,
    bpmRange: [90, 115],
    description: 'Groove sincopado, énfasis en el "&". Bajo con slap y piano staccato.',
    rhythm: {
      // B: X - - X | - - X - | X - - - | - X - - (sincopado)
      kick:  [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0],
      // C: - - - - | X - - - | - - - - | X - - - (2 y 4)
      snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      // H: x x x x | x x o x | x x x x | x x o x (cerrado y abierto)
      hihat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      // B: X - - X | - X - - | X - X - | - - X - (riff sincopado)
      bass:  [1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0],
      // P: - X - X | - X - X | - X - X | - X - X (staccato en "e" y "a")
      piano: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
    },
    fill: {
      position: 8,
      pattern: {
        // Fill sincopado para funk
        snare: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1, 1, 1, 1],
        kick:  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0],
      },
    },
    volumes: { piano: 0.55, bass: 0.85, drums: 0.7 },
  },

  // ============================================
  // 3. POP/BALADA (Con "Side Stick") - 85 BPM
  // ============================================
  // Característica: Más atmosférico, usa el aro de la caja (side stick).
  // Bombo en 1 y 3. Side stick en 2 y 4. Hi-hat en corcheas (8avos).
  // Bajo: Notas largas (whole notes o half notes).
  // Piano: Arpegios suaves o acordes sostenidos.
  {
    id: 'pop_ballad',
    name: 'Pop/Balada',
    category: 'Pop',
    bpm: 85,
    bpmRange: [70, 100],
    description: 'Atmosférico con side stick. Arpegios de piano y bajo sostenido.',
    rhythm: {
      // B: X - - - | - - - - | X - - - | - - - - (bombo en 1 y 3)
      kick:  [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
      // C: - - - - | X - - - | - - - - | X - - - (side stick en 2 y 4)
      snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      // H: x - x - | x - x - | x - x - | x - x - (corcheas)
      hihat: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
      // B: X - - - | - - - - | - - - - | - - - - (nota sostenida)
      bass:  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      // P: X - - - | - - - - | X - - - | - - - - (acordes largos/arpegios)
      piano: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
    },
    fill: {
      position: 12,
      pattern: {
        // Fill suave para balada
        snare: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5],
        hihat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], // crash
      },
    },
    bassSustain: true,
    volumes: { piano: 0.75, bass: 0.6, drums: 0.45 },
  },

  // ============================================
  // 4. REGGAE (Acento en el "&" del 3er tiempo) - 80 BPM
  // ============================================
  // Característica: El anti-backbeat. El acento rítmico (skank) está en la semicorchea débil.
  // Caja (rimshot) en el 3er tiempo. Bombo sutil en 1 y 3.
  // Bajo: Líneas melódicas prominentes y con muchos silencios.
  // Piano/Guitarra: Acorde staccato en el "&" de cada tiempo (skank).
  {
    id: 'reggae',
    name: 'Reggae',
    category: 'Reggae',
    bpm: 80,
    bpmRange: [70, 95],
    description: 'El skank en el "&". Bajo melódico prominente, acordes staccato.',
    rhythm: {
      // B: X - - - | - - - - | X - - - | - - - - (bombo sutil)
      kick:  [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
      // C: - - - - | - - - - | - - X - | - - - - (rimshot en "&" del 3)
      snare: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0],
      // H: x x x x | x x x x | x x x x | x x x x (semicorcheas o abierto en upbeats)
      hihat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      // B: X - - - | - X - - | - - X - | - - - X (línea melódica)
      bass:  [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      // P: - - X - | - - X - | - - X - | - - X - (skank en cada "&")
      piano: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
    },
    fill: {
      position: 12,
      pattern: {
        // Fill estilo reggae con rimshot
        snare: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1],
      },
    },
    bassSustain: true,
    volumes: { piano: 0.5, bass: 0.9, drums: 0.55 },
  },

  // ============================================
  // 5. HIP-HOP/TRAP (Hi-hats rápidos) - 95 BPM
  // ============================================
  // Característica: Bombo pesado, hi-hats rápidos en semicorcheas o tríolos.
  // Sensación de "flow" y arrastre.
  // Bajo: Sub-bass siguiendo el patrón del bombo.
  // Piano: Melodías simples, acordes espaciados o samples.
  {
    id: 'hiphop_trap',
    name: 'Hip-Hop/Trap',
    category: 'HipHop',
    bpm: 95,
    bpmRange: [85, 110],
    description: 'Bombo pesado 808, hi-hats rápidos. Sub-bass y melodías minimalistas.',
    rhythm: {
      // B: X - - - | - - X X | X - - - | - - X - (patrón 808)
      kick:  [1, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 1, 0],
      // C: - - - - | X - - - | - - - - | X - - - (caja/clap en 2 y 4)
      snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      // H: x x x x | x x x x | x x x x | x x x x (semicorcheas constantes)
      hihat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      // B: X - - - | - - X X | X - - - | - - X - (sub-bass = bombo)
      bass:  [1, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 1, 0],
      // P: X - - - | - - - - | - - X - | - - - - (melodías espaciadas)
      piano: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0],
    },
    fill: {
      position: 8,
      pattern: {
        // Hi-hat roll típico de trap
        hihat: [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1],
      },
    },
    bassSustain: true,
    volumes: { piano: 0.5, bass: 0.95, drums: 0.8 },
  },

  // ============================================
  // 6. DISCO (Four-on-the-floor) - 120 BPM
  // ============================================
  // Característica: Bombo en las 4 negras (four-on-the-floor).
  // Caja en 2 y 4. Hi-hat en semicorcheas (abierto en "&").
  // Bajo: Líneas de octavas sincopadas, muy activas.
  // Piano: Acordes "chic" en los tiempos débiles.
  {
    id: 'disco',
    name: 'Disco',
    category: 'Disco',
    bpm: 120,
    bpmRange: [115, 130],
    description: 'Four-on-the-floor. Bajo en octavas sincopadas, piano en upbeats.',
    rhythm: {
      // B: X - - - | X - - - | X - - - | X - - - (bombo en 4 negras)
      kick:  [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
      // C: - - - - | X - - - | - - - - | X - - - (caja en 2 y 4)
      snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      // H: x x x x | x x x x | x x x x | x x x x (semicorcheas)
      hihat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      // B: X - X - | - X - X | X - - X | - X - - (octavas sincopadas)
      bass:  [1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0],
      // P: - - X - | - - X - | - - X - | - - X - (acordes "chic" en "&")
      piano: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
    },
    fill: {
      position: 8,
      pattern: {
        // Fill disco con redoble
        snare: [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0],
        hihat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], // Crash
      },
    },
    volumes: { piano: 0.65, bass: 0.8, drums: 0.75 },
  },

  // ============================================
  // 7. SHUFFLE/BLUES (Patrón en tríolos) - 100 BPM
  // ============================================
  // Característica: Sensación de balanceo ("swing").
  // Patrón de hi-hat en "ching-chick-a" (feel de tríolos).
  // Bajo: Walking bass (notas que "caminan" en negras con swing).
  // Piano: Comping sincopado estilo boogie-woogie.
  {
    id: 'shuffle_blues',
    name: 'Shuffle/Blues',
    category: 'Blues',
    bpm: 100,
    bpmRange: [85, 120],
    description: 'Feel de swing/shuffle. Walking bass y comping estilo boogie.',
    rhythm: {
      // B: X - - - | - - X - | X - - - | - - X - (bombo con swing)
      kick:  [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0],
      // C: - - - - | X - - - | - - - - | X - - - (caja en 2 y 4)
      snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      // H: X - x | X - x | (aproximación de shuffle en 16avos)
      hihat: [1, 0, 0.5, 0, 1, 0, 0.5, 0, 1, 0, 0.5, 0, 1, 0, 0.5, 0],
      // B: X - - | X - - | X - - | X - - (walking bass en negras)
      bass:  [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
      // P: - - - - | X - - - | - - - - | X - - - (comping en backbeat)
      piano: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    },
    fill: {
      position: 8,
      pattern: {
        // Fill con swing
        snare: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1, 0],
      },
    },
    volumes: { piano: 0.7, bass: 0.75, drums: 0.6 },
  },

  // ============================================
  // 8. SAMBA - 110 BPM
  // ============================================
  // Característica: Polirritmia y sensación de movimiento constante.
  // Surdo (bombo) en 1 y 3. Mucha actividad en caja/tamborim.
  // Bajo: Líneas simples que marcan el bajo del surdo.
  // Piano: Ritmos sincopados en bloque (como el cavaquinho).
  {
    id: 'samba',
    name: 'Samba',
    category: 'Latin',
    bpm: 110,
    bpmRange: [100, 125],
    description: 'Polirritmia brasileña. Surdo en 1 y 3, tamborim activo.',
    rhythm: {
      // B (Surdo): X - - - | - - - - | X - - - | - - - - (en 1 y 3)
      kick:  [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
      // C (Tamborim): x x X x | x X x x | x x X x | x X x x (patrón típico)
      snare: [0.5, 0.5, 1, 0.5, 0.5, 1, 0.5, 0.5, 0.5, 0.5, 1, 0.5, 0.5, 1, 0.5, 0.5],
      // H: x x x x | x x x x | x x x x | x x x x
      hihat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      // B: X - - - | - - - - | X - - - | - - - - (sigue el surdo)
      bass:  [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
      // P: x x X x | x X x x | x x X x | x X x x (cavaquinho style)
      piano: [0.5, 0.5, 1, 0.5, 0.5, 1, 0.5, 0.5, 0.5, 0.5, 1, 0.5, 0.5, 1, 0.5, 0.5],
    },
    fill: {
      position: 0,
      pattern: {
        // Repique pattern
        snare: [1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0],
      },
    },
    volumes: { piano: 0.6, bass: 0.7, drums: 0.7 },
  },

  // ============================================
  // 9. BOSSA NOVA - 130 BPM
  // ============================================
  // Característica: Sensación suave y sofisticada.
  // Patrón de clave en el hi-hat ("bossa nova ride").
  // Bajo: Líneas que alternan la fundamental y la 5ta o 7ma.
  // Piano: Acordes complejos (jazz) con ritmo sincopado.
  {
    id: 'bossa_nova',
    name: 'Bossa Nova',
    category: 'Latin',
    bpm: 130,
    bpmRange: [115, 145],
    description: 'Feel suave y sofisticado. Patrón de clave 3-2, bajo anticipatorio.',
    rhythm: {
      // B: X - - - | - - X - | X - - - | - - - - (ligero)
      kick:  [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0],
      // C: - - - - | X - x - | - - - - | X - x - (golpe + ghost)
      snare: [0, 0, 0, 0, 1, 0, 0.5, 0, 0, 0, 0, 0, 1, 0, 0.5, 0],
      // H: x - x x | - x x - | x - x x | - x x - (clave 3-2)
      hihat: [1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0],
      // B: X - - - | - - X - | - - X - | - - - - (fundamental y 5ta)
      bass:  [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0],
      // P: - X - X | - - X - | - X - X | X - - - (comping sincopado)
      piano: [0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 0, 0],
    },
    fill: {
      position: 12,
      pattern: {
        // Fill suave bossa
        snare: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0.7, 0.5, 0.7],
      },
    },
    volumes: { piano: 0.75, bass: 0.65, drums: 0.45 },
  },

  // ============================================
  // 10. METAL (Doble bombo) - 140 BPM
  // ============================================
  // Característica: Potencia y velocidad.
  // Doble bombo en corcheas constantes. Caja en 2 y 4.
  // Bajo: Siguiendo las líneas del riff, en unísono.
  // Piano/Guitarra: Power chords o riffs palm-muted en corcheas.
  {
    id: 'metal',
    name: 'Metal',
    category: 'Metal',
    bpm: 140,
    bpmRange: [120, 180],
    description: 'Doble bombo en corcheas, potencia total. Bajo y guitarra en unísono.',
    rhythm: {
      // B: X-X-X-X-|X-X-X-X-|X-X-X-X-|X-X-X-X- (doble bombo en corcheas)
      kick:  [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
      // C: - - - - | X - - - | - - - - | X - - - (caja en 2 y 4)
      snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      // H: x-x-x-x-|x-x-x-x-|x-x-x-x-|x-x-x-x- (corcheas)
      hihat: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
      // B: X - X - | X - X - | X - X - | X - X - (unísono con riff)
      bass:  [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
      // P: X - - - | - - - - | - - - - | - - - - (power chords/pads)
      piano: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    },
    fill: {
      position: 8,
      pattern: {
        // Fill de doble bombo
        kick:  [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1],
        snare: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      },
    },
    volumes: { piano: 0.5, bass: 0.9, drums: 0.85 },
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
 * @deprecated Use individual kick/snare/hihat patterns instead
 */
export function getDrumPattern(style: StylePattern): number[] {
  return style.rhythm.kick.map((k, i) => 
    Math.max(k, style.rhythm.snare[i], style.rhythm.hihat[i])
  );
}
