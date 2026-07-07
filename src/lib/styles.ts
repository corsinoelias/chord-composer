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

// Arpeggio types and settings
export type ArpeggioType = 'up' | 'down' | 'updown' | 'random';
export type ArpeggioSpeed = 'slow' | 'normal' | 'fast' | 'veryfast';

export interface ArpeggioCell {
  type: ArpeggioType;
  speed: ArpeggioSpeed;
}

// Instrument sound configuration for a style
export interface InstrumentSounds {
  piano?: string;   // Sound type ID (e.g., 'sampled', 'acoustic', 'bright')
  bass?: string;    // Sound type ID (e.g., 'electric', 'synth', 'picked')
  drums?: string;   // Sound type ID (e.g., 'standard', 'rock', 'electronic')
  guitar?: string;  // Sound type ID (e.g., 'acoustic', 'electric', 'nylon')
}

export interface StylePattern {
  id: string;
  name: string;
  category: 'Pop' | 'Rock' | 'Funk' | 'Reggae' | 'HipHop' | 'Disco' | 'Blues' | 'Latin' | 'Metal' | 'Folk' | 'Country' | 'Jazz' | 'Soul' | 'Indie' | 'LoFi' | 'Gospel';
  bpm: number;
  bpmRange: [number, number];
  description: string;
  // Time signature this style's rhythm arrays are written for. Defaults to 4/4 (16 slots
  // per bar) when omitted — every style predating this field keeps behaving identically.
  // Rhythm array length must equal getSlotsPerBar(style) for the given signature.
  timeSignature?: { numerator: number; denominator: number };
  // Number of bars the base rhythm (drums/bass/piano/guitar arrays below) cycles
  // over before repeating — lets bar 2 differ from bar 1 (e.g. a snare variation
  // every other bar). Defaults to 1 (every existing style keeps behaving
  // identically). When >1, each rhythm array below must be
  // getSlotsPerBar(style) * loopBars long. Independent from each melodic
  // variation's own per-instrument `loopBars` (bassScale.ts) — this one applies
  // to the plain drum-grid arrays in `rhythm` below.
  loopBars?: number;
  // Rhythm patterns: 16 slots with velocity values (0 = silence, 0.5 = ghost, 1 = accent)
  rhythm: {
    piano: number[];        // Piano/keys pattern
    bass: number[];         // Bass pattern
    kick: number[];         // Kick drum pattern
    snare: number[];        // Snare center pattern
    snareStick?: number[];  // Snare rim/edge pattern (borde)
    hihat: number[];        // Hi-hat closed pattern (mano)
    hihatOpen?: number[];   // Hi-hat open pattern
    hihatFoot?: number[];   // Hi-hat foot pattern (pie)
    tom1?: number[];        // Tom 1 (high)
    tom2?: number[];        // Tom 2 (mid)
    floorTom?: number[];    // Floor tom (low)
    ride?: number[];        // Ride cymbal
    crash?: number[];       // Crash cymbal
    guitar?: number[];      // Guitar pattern (optional)
  };
  // Arpeggio settings per slot
  arpeggios?: {
    piano?: (ArpeggioCell | null)[];   // 16 slots, null = no arpeggio
    guitar?: (ArpeggioCell | null)[];  // 16 slots, null = no arpeggio
  };
  // Fill pattern (played on bar 4 or 8)
  fill: {
    position: number;     // Starting slot (usually 12 for last beat)
    pattern: {
      kick?: number[];
      snare?: number[];
      snareStick?: number[];
      hihat?: number[];
      hihatOpen?: number[];
      hihatFoot?: number[];
      tom1?: number[];
      tom2?: number[];
      floorTom?: number[];
      ride?: number[];
      crash?: number[];
      guitar?: number[];
    };
    arpeggios?: {
      piano?: (ArpeggioCell | null)[];
      guitar?: (ArpeggioCell | null)[];
    };
  };
  // Default volumes (0-1)
  volumes: {
    piano: number;
    bass: number;
    drums: number;
    guitar?: number;
  };
  // Instrument sound types for this style
  instrumentSounds?: InstrumentSounds;
  // Melodic scale patterns for bass, piano, guitar (per-style variations)
  melodic?: import('./bassScale').MelodicData;
}

// Convert slot (0-15) to beat position (0-3.9375)
export function slotToBeat(slot: number): number {
  return slot / 4;
}

/**
 * Number of 16th-note-resolution slots in one bar of a style's time signature.
 * 4/4 (the default when `timeSignature` is omitted) = 16 slots, matching every
 * existing style. A different signature scales the bar length proportionally —
 * e.g. 6/8 (six eighth notes = three quarter notes) = 12 slots, 3/4 = 12 slots.
 * Same formula TuxGuitar uses for measure length in ticks (numerator * denominator time),
 * just expressed in our fixed 4-slots-per-quarter-note resolution instead of MIDI PPQ.
 */
export function getSlotsPerBar(style: StylePattern): number {
  if (!style.timeSignature) return 16;
  const { numerator, denominator } = style.timeSignature;
  return Math.round((numerator * 16) / denominator);
}

/**
 * Total length the base rhythm arrays (kick/snare/hihat/bass/piano/guitar in
 * `style.rhythm`) must have: one bar's worth of slots times `style.loopBars`
 * (default 1). This is the array length to edit/resize in the rhythm-grid UI —
 * `getSlotsPerBar` alone is still what generateBarPattern uses per individual
 * bar (it slices the correct loopBars-th segment out of these longer arrays).
 */
export function getStyleTotalSlots(style: StylePattern): number {
  return getSlotsPerBar(style) * (style.loopBars ?? 1);
}

/**
 * Slots per raw pulse — one denominator-unit (one eighth note in 6/8, one
 * quarter note in 4/4). This is the finest counted subdivision (1,2,3,4,5,6
 * in 6/8), used for step-numbering in the rhythm grid.
 */
export function getPulseInterval(style: StylePattern): number {
  const denominator = style.timeSignature?.denominator ?? 4;
  return Math.round(16 / denominator);
}

/**
 * Slots between metronome clicks — always one quarter note (4 slots),
 * regardless of time signature. So 4/4 clicks 4 times/bar, 6/8 clicks
 * 3 times/bar (one per quarter note, i.e. 6/8's numerator/2 — NOT
 * TuxGuitar's addMetronome() convention of `numerator` raw-pulse clicks
 * per bar, which would be 6 clicks/bar in 6/8). We deliberately diverge
 * from TuxGuitar here: verified against a real reference MIDI click
 * track (90 BPM, quarter-note spacing throughout, confirmed correct by
 * ear) that a musician expects the metronome to tick in quarter notes
 * — the same unit `bpm` is expressed in — not in the raw denominator
 * subdivision. `style` is unused today but kept in the signature in case
 * we ever want a per-style override.
 *
 * NOTE on BPM: `bpm` is always plain quarter-note tempo, uniformly across
 * every time signature — no compound-meter conversion is applied anywhere.
 * We tried making BPM mean "the felt dotted-quarter beat" for compound meters
 * (mirroring TuxGuitar's TGTempo `dotted`/`base` fields), but `bpm` is a
 * single global value that's preserved as-is when the user switches styles
 * (see Index.tsx's onStyleChange) — so the same displayed number silently
 * meant a 1.5x-different actual tempo depending on which style was selected,
 * with zero visual indication. That's worse than the theoretical inaccuracy
 * of always reading BPM as raw quarter notes. If a compound-meter style needs
 * to feel like "76 dotted-quarter beats/min", its `bpm` field should just be
 * set to the equivalent raw value directly (76 * 1.5 = 114) — see Pop 6/8.
 */
export function getMetronomeClickInterval(style: StylePattern): number {
  return 4;
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
  piano: number[],
  guitar?: number[]
): { kick: number[]; snare: number[]; hihat: number[]; bass: number[]; piano: number[]; guitar?: number[] } {
  const newHihat = [...hihat];
  
  // When snare hits, soften hi-hat
  for (let i = 0; i < 16; i++) {
    if (snare[i] > 0 && hihat[i] > 0) {
      newHihat[i] *= INTERACTION_RULES.hihatSoftensOnSnare;
    }
  }
  
  return { kick, snare, hihat: newHihat, bass, piano, guitar };
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
  // 3. BALADA DINÁMICA (Con hi-hat abierto y crash) - 85 BPM (POP)
  // ============================================
  // Característica: Más impulso con hi-hat abierto para énfasis.
  // Bombo en 1, 3 y push en "&" del 4. Crash como acento final del fill.
  {
    id: 'pop_1',
    name: 'Pop 1',
    category: 'Pop',
    bpm: 85,
    bpmRange: [75, 100],
    description: 'Dinámica con hi-hat abierto y crash. Bombo con push en "&" del 4.',
    rhythm: {
      // Bombo: 1, 3 y push en "&" del 4 (slot 14)
      kick:       [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0.8, 0],
      // Caja centro: tiempos 2 y 4 con ghost notes
      snare:      [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      // Hi-hat mano: corcheas con abierto en "&" del 2 (slot 6)
      hihat:      [0.8, 0, 0.6, 0, 0.8, 0, 0.7, 0, 0.8, 0, 0.9, 0, 0.8, 0, 1, 0],
      // Hi-hat abierto: acentos
      hihatOpen:  [0, 0, 0, 0, 0, 0, 0.6, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      // Hi-hat pie: corcheas constantes
      // hihatFoot:  [0.5, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0.5, 0],
      // Bajo: walking bass con sostenido
      bass:       [1, 0, 0.8, 0, 1, 0, 0.8, 0, 1, 0, 0.7, 0, 0.9, 0, 0.7, 0],
      // Piano: acordes largos con variación
      guitar:      [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      piano:      [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    },
    fill: {
      position: 6, // Fill más largo, empieza en "&" del 2
      pattern: {
        // Fill: S S S S - FT - T2 - T1 T1 - C
        snare:      [0, 0, 0, 0, 0, 0, 0, 0, 0.7, 0, 0.6, 0, 0.5, 0, 0.4, 0],
        floorTom:   [0, 0, 0, 0, 0, 0, 0.6, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        tom2:       [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.6, 0, 0, 0],
        tom1:       [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.7, 0.6, 0],
        crash:      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.8, 0, 0, 0],
        hihat:      [0.8, 0, 0.6, 0, 0.8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        hihatFoot:  [0.5, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0.5, 0],
      },
    },
    volumes: { piano: 0.7, bass: 1.0, drums: 1.0 },
    instrumentSounds: { piano: 'sampled', bass: 'fender', drums: 'standard', guitar: 'acoustic' },
  },

  // ============================================
  // 4. BALADA MINIMALISTA (Con borde de caja y hi-hat pie) - 75 BPM (POP)
  // ============================================
  // Característica: Minimalista y atmosférico. Bombo solo en tiempo 1.
  // Borde de caja en corcheas, hi-hat con el pie constante.
  {
    id: 'Pop 2',
    name: 'Pop 2',
    category: 'Pop',
    bpm: 75,
    bpmRange: [65, 85],
    description: 'Pop con kick en 1, 3 y "&" del 3. Snare en 2 y 4, hi-hat en corcheas.',
    rhythm: {
      kick:       [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0],
      snare:      [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      hihat:      [0.8, 0, 0.8, 0, 0.8, 0, 0.8, 0, 0.8, 0, 0.8, 0, 0.8, 0, 0.8, 0],
      // Bajo: nota sostenida con movimiento
      bass:       [1, 0, 0.2, 0, 0.3, 0, 0.1, 0, 0.8, 0, 0.2, 0, 0.3, 0, 0.1, 0],
      // Piano: arpegios suaves
      piano:      [0.6, 0.2, 0.4, 0.1, 0.3, 0.2, 0.5, 0.1, 0.6, 0.2, 0.4, 0.1, 0.3, 0.2, 0.5, 0.1],
    },
    fill: {
      position: 10, // Fill empieza en "&" del tiempo 3
      pattern: {
        // Fill: FT - T2 - T1 - o (borde) en semicorcheas
        snareStick: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.6, 0, 0, 0],
        floorTom:   [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0, 0, 0, 0],
        tom2:       [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0, 0, 0],
        tom1:       [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.6, 0, 0],
        hihatFoot:  [0.4, 0, 0.4, 0, 0.4, 0, 0.4, 0, 0.4, 0, 0, 0, 0, 0, 0, 0],
      },
    },
    volumes: { piano: 0.7, bass: 1.0, drums: 1.0 },
    instrumentSounds: { piano: 'sampled', bass: 'fender', drums: 'standard', guitar: 'acoustic' },
  },

  // ============================================
  // POP 3 - 90 BPM
  // ============================================
  {
    id: 'pop_3',
    name: 'Pop 3',
    category: 'Pop',
    bpm: 90,
    bpmRange: [80, 100],
    description: 'Pop con kick sincopado en "&" del 2 y en el 3. Hi-hat constante.',
    rhythm: {
      kick:   [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0],
      snare:  [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      hihat:  [0.8, 0, 0.8, 0, 0.8, 0, 0.8, 0, 0.8, 0, 0.8, 0, 0.8, 0, 0.8, 0],
      bass:   [1, 0, 0.8, 0, 1, 0, 0.8, 0, 1, 0, 0.7, 0, 0.9, 0, 0.7, 0],
      guitar: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      piano:  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    },
    fill: {
      position: 12,
      pattern: {
        snare: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.7, 0.6, 0.8, 0.9],
        crash: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.8, 0, 0, 0],
      },
    },
    volumes: { piano: 0.7, bass: 1.0, drums: 1.0, guitar: 0.7 },
    instrumentSounds: { piano: 'sampled', bass: 'fender', drums: 'standard', guitar: 'acoustic' },
  },

  // ============================================
  // POP 6/8 (Compás compuesto real) - 76 BPM
  // ============================================
  // Característica: Balada en 6/8 de verdad — timeSignature:{6,8} da
  // slotsPerBar=12 (getSlotsPerBar), así los 6 pulsos de corchea caen
  // exactos en los slots pares (0,2,4,6,8,10), sin aproximaciones.
  // Groove recalibrado a mano en el editor de ritmo contra referencias MIDI
  // reales y sobrescrito aquí: bombo en 1 y 6 (pickup), caja en el "4"
  // (slot 6), hi-hat en las 6 corcheas. Bajo y guitarra pasaron al sistema
  // melódico (antes eran arrays de rhythm.bass/guitar planos).
  {
    id: 'pop_6_8',
    name: 'Pop 6/8',
    category: 'Pop',
    // 114 raw quarter-notes/min = 76 felt dotted-quarter pulses/min (114/1.5) —
    // bpm is always plain quarter-note tempo (no hidden conversion), so this
    // number is picked to *sound* like a 76 bpm ballad, not to display as one.
    bpm: 114,
    bpmRange: [98, 143],
    timeSignature: { numerator: 6, denominator: 8 },
    description: 'Balada pop en 6/8. Bombo en el 1 y pickup en el 6, caja en el "4", hi-hat en las 6 corcheas.',
    rhythm: {
      // B: pulso 1 (slot 0) y pickup en la última corchea (slot 10)
      kick:  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0],
      // C: en el "4" (slot 6), sin ghost
      snare: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0],
      // H: las 6 corcheas, todas a volumen parejo
      hihat: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
      // Fallback plano — no se usa mientras melodic.bass esté habilitado (ver abajo)
      bass:  [1, 0, 0, 0, 0, 0, 0.8, 0, 0, 0, 0.3, 0],
      // P: acorde en los dos pulsos principales, notas suaves en las corcheas intermedias
      piano: [1, 0, 0.3, 0, 0.3, 0, 1, 0, 0.3, 0, 0.3, 0],
      // Fallback plano — no se usa mientras melodic.guitar esté habilitado (ver abajo)
      guitar: [1, 0, 0.5, 0, 0.6, 0, 0.9, 0, 0.5, 0, 0.6, 0],
    },
    fill: {
      position: 6, // Fill en el segundo pulso del compás (segunda mitad)
      pattern: {
        snare:    [0, 0, 0, 0, 0, 0, 0.5, 0, 0.7, 0, 0.9, 0],
        floorTom: [0, 0, 0, 0, 0, 0, 0, 0, 0.6, 0, 0, 0],
        tom1:     [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.6, 0],
      },
    },
    volumes: { piano: 0.75, bass: 1.0, drums: 0.9, guitar: 0.7 },
    instrumentSounds: { piano: 'sampled', bass: 'fender', drums: 'standard', guitar: 'acoustic' },
    melodic: {
      bass: {
        enabled: true,
        variations: [
          {
            id: 'pop68_bass_1', name: 'Default', loopBars: 1,
            // Solo la fundamental (grado 1), en el pulso 1 y el pickup del pulso 6
            pattern: { 1: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0] },
            octaveOffsets: { 1: 0 },
          },
        ],
      },
      guitar: {
        enabled: true,
        variations: [
          {
            id: 'pop68_guitar_1', name: 'Default', loopBars: 1,
            // Un solo golpe de acorde completo en el "4" (slot 6)
            pattern: {},
            chordHit: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0],
          },
        ],
      },
      // Piano queda sin melodic (deshabilitado) — sigue usando rhythm.piano tal cual.
      piano: { enabled: false, variations: [] },
    },
  },

  // ============================================
  // 5. ROCK BÁSICO (Backbeat) - 120 BPM
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
      kick:  [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0],
      // C: - - - - | X - - - | - - - - | X - - - (caja en 2 y 4)
      snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      // H: x x x x | x x x x | x x x x | x x x x (semicorcheas)
      hihatOpen: [0.8, 0, 0.8, 0, 0.8, 0, 0.8, 0, 0.8, 0, 0.8, 0, 0.8, 0, 0.8, 0,],
      // B: X - - - | - - X - | X - - - | - - X - (fundamental y quinta)
      bass:  [1, 0, 0.8, 0, 1, 0, 0.8, 0, 1, 0, 0.8, 0, 1, 0, 0.8, 0],
      // P: - - - - | X - - - | - - - - | X - - - (acordes en backbeat)
      piano:  [0.8, 0, 1, 0, 0.8, 0, 1, 0, 0.8, 0, 1, 0, 0.8, 0,1, 0],
      hihat:[]
      // G: X - - - | X - - - | X - - - | X - - - (power chords en cada tiempo)
      // guitar: [1, 0, 0.2, 0, 1, 0, 0.2, 0, 1, 0, 0.2, 0, 1, 0, 0.2, 0],
    },
    fill: {
      position: 12,
      pattern: {
        // Fill 2: Con Bombo (Rock) - Patrón alternado Bombo-Caja
        kick:  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0],
        snare: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1],
        crash: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        ride: [0.8, 0, 0.8, 0, 0.8, 0, 0.8, 0, 0.8, 0, 0.8, 0, 0.8, 1, 0.8, 1,],
      },
    },
    volumes: { piano: 0.7, bass: 1.0, drums: 1.0, guitar: 1.0 },
    instrumentSounds: { piano: 'sampled', bass: 'fender', drums: 'standard', guitar: 'sf2-muted' },
    melodic: {
      // bass/piano intentionally left without variations — RhythmEditor's
      // migrateRhythmToMelodic() regenerates a real "Default" variation from
      // rhythm.bass/rhythm.piano above whenever this style is opened for editing.
      bass: { enabled: false, variations: [] },
      piano: { enabled: false, variations: [] },
      guitar: {
        enabled: true,
        variations: [
          {
            id: 'sv_1783428504172_d2js5', name: 'Var 1', loopBars: 1,
            pattern: {
              1: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
              3: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
              5: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
              8: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            },
            chordHit: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
          },
        ],
      },
    },
  },

  // ============================================
  // 8. HIP-HOP/TRAP (Hi-hats rápidos) - 95 BPM
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
      kick:  [1, 0, 0, 1, 0, 0, 1,0, 0, 1, 1, 0, 0, 0, 0, 0],
      // C: - - - - | X - - - | - - - - | X - - - (caja/clap en 2 y 4)
      snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      // H: x x x x | x x x x | x x x x | x x x x (semicorcheas constantes)
      hihat: [0.8, 0.6, 0.8, 0.6, 0.8, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6],
      // B: X - - - | - - X X | X - - - | - - X - (sub-bass = bombo)
      bass:  [1, 0, 0, 1, 0, 0, 1,0, 0, 1, 1, 0, 0, 0, 0, 0],
      // P: X - - - | - - - - | - - X - | - - - - (melodías espaciadas)
      piano: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
      guitar: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    },
    fill: {
      position: 8,
      pattern: {
        // Hi-hat roll típico de trap
        hihat: [0, 0, 0, 0, 0, 0, 0, 0, 0.7, 0.8, 0.9, 1, 0.9, 0.8, 0.7, 0.6],
        snare: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.8, 0],
      },
    },
    volumes: { piano: 0.7, bass: 1.0, drums: 1.0, guitar: 0.7 },
    instrumentSounds: { piano: 'synth', bass: 'fender', drums: 'standard', guitar: 'electric' },
  },

  // ============================================
  // HIP-HOP 2 (Boom Bap) - 90 BPM
  // ============================================
  {
    id: 'hiphop_2',
    name: 'Hip-Hop 2',
    category: 'HipHop',
    bpm: 90,
    bpmRange: [80, 105],
    description: 'Boom bap. Kick sincopado denso, open hihat en "&" del 4.',
    rhythm: {
      kick:      [1, 0, 1, 1, 0, 1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0],
      snare:     [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      hihat:     [0.8, 0, 0.8, 0, 0.8, 0, 0.8, 0, 0.8, 0, 0.8, 0, 0.8, 0, 0, 0],
      hihatOpen: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.8, 0],
      bass:      [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0],
      piano:     [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
      guitar:    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    },
    fill: {
      position: 8,
      pattern: {
        hihat: [0, 0, 0, 0, 0, 0, 0, 0, 0.7, 0.8, 0.9, 1, 0.9, 0.8, 0.7, 0.6],
        snare: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.8, 0],
      },
    },
    volumes: { piano: 0.7, bass: 1.0, drums: 1.0, guitar: 0.7 },
    instrumentSounds: { piano: 'synth', bass: 'fender', drums: 'standard', guitar: 'electric' },
  },

  // ============================================
  // 9. DISCO (Four-on-the-floor) - 120 BPM
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
      // H: cerrado en tiempos, abierto en upbeats (&)
      hihat: [0.8, 0, 0, 0, 0.8, 0, 0, 0, 0.8, 0, 0, 0, 0.8, 0, 0, 0],
      // H abierto: en "&" de cada tiempo (classic disco feel)
      hihatOpen: [0, 0, 0.8, 0, 0, 0, 0.8, 0, 0, 0, 0.8, 0, 0, 0, 0.8, 0],
      // B: X - X - | - X - X | X - - X | - X - - (octavas sincopadas)
      bass:  [1, 0, 0.8, 0, 0, 0.7, 0, 0.6, 1, 0, 0, 0.7, 0, 0.6, 0, 0],
      // P: - - X - | - - X - | - - X - | - - X - (acordes "chic" en "&")
      piano: [0, 0, 0.8, 0, 0, 0, 0.8, 0, 0, 0, 0.8, 0, 0, 0, 0.8, 0],
    },
    fill: {
      position: 8,
      pattern: {
        // Fill disco con redoble
        snare: [0, 0, 0, 0, 0, 0, 0, 0, 0.8, 0.9, 1, 0.9, 0, 0, 0, 0],
        hihatOpen: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.7, 0, 0, 0],
        crash: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.8, 0, 0, 0],
      },
    },
    volumes: { piano: 0.7, bass: 1.0, drums: 1.0, guitar: 0.7 },
    instrumentSounds: { piano: 'synth', bass: 'fender', drums: 'standard', guitar: 'electric' },
  },

  // ============================================
  // 10. SHUFFLE/BLUES (Patrón en tríolos) - 100 BPM
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
      hihat: [],
      // B: X - x | X - x | X - x | X - x (walking bass con swing)
      bass:  [1, 0, 0.3, 0, 0.8, 0, 0.3, 0, 1, 0, 0.3, 0, 0.8, 0, 0.3, 0],
      // P: - - x | X - x | - - x | X - x (comping estilo boogie)
      piano: [0, 0, 0.4, 0, 1, 0, 0.4, 0, 0, 0, 0.4, 0, 1, 0, 0.4, 0],
      // G: X - x - | X - x - | X - x - | X - x - (shuffle blues licks)
      guitar: [0.9, 0, 0.5, 0, 0.9, 0, 0.5, 0, 0.9, 0, 0.5, 0, 0.9, 0, 0.5, 0],
      // R: ride en cada tiempo (swing)
      ride:  [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    },
    fill: {
      position: 8,
      pattern: {
        // Fill con swing
        snare: [0, 0, 0, 0, 0, 0, 0, 0, 0.8, 0, 0.7, 0, 0.6, 0, 0.5, 0],
        hihat: [0.8, 0, 0.4, 0, 0.8, 0, 0.4, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        crash: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      },
    },
    volumes: { piano: 0.7, bass: 1.0, drums: 1.0, guitar: 0.7 },
    instrumentSounds: { piano: 'sampled', bass: 'fender', drums: 'standard', guitar: 'electric' },
    melodic: {
      bass: {
        enabled: true,
        variations: [
          {
            id: 'sv_1783430580560_0sfrj', name: 'Var 1', loopBars: 1,
            pattern: { 1: [1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1] },
            octaveOffsets: { 1: 0, 2: -1, 3: -1, 4: -1, 5: -1, 6: -1, 7: -1, 8: -1 },
          },
        ],
      },
      piano: {
        enabled: true,
        variations: [
          {
            id: 'sv_1783430684015_egxxl', name: 'Var 1', loopBars: 1,
            pattern: {},
            chordHit: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
          },
        ],
      },
      guitar: { enabled: false, variations: [] },
    },
  },

  // ============================================
  // 12. BOSSA NOVA - 130 BPM
  // ============================================
  // Característica: Sensación suave y sofisticada.
  // Patrón de clave en el hi-hat ("bossa nova ride").
  // Bajo: Líneas que alternan la fundamental y la 5ta o 7ma.
  // Piano: Acordes complejos (jazz) con ritmo sincopado.
  {
    id: 'merengue',
    name: 'Merengue',
    category: 'Latin',
    bpm: 130,
    bpmRange: [115, 145],
    description: 'Feel suave y sofisticado. Patrón de clave 3-2, bajo anticipatorio.',
    rhythm: {
      // B: X - - - | - - X - | X - - - | - - - - (ligero)
      kick:  [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
      // C: - - - - | X - x - | - - - - | X - x - (golpe + ghost)
      snare: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      hihat: [0, 0, 0.8, 0.8,0, 0, 0.8, 0.8, 0, 0, 0.8, 0.8, 0, 0, 0.8, 0.8],
      // B: X - - - | - - X - | - - X - | - - - - (fundamental y 5ta)
      bass:  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      guitar:  [0, 0, 0, 0, 0, 0, 0.7, 0, 0, 0, 0.5, 0, 0, 0, 0.5, 0],
      // P: - X - X | - - X - | - X - X | X - - - (comping sincopado)
      piano: [0, 0.8, 0, 0.8, 0, 0, 0.8, 0, 0, 0, 0.7, 0, 0, 0, 0.9, 0],
    },
    fill: {
      position: 12,
      pattern: {
        // Fill suave bossa
        snare: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0.6, 0],
        floorTom: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0],
      },
    },
    volumes: { piano: 0.7, bass: 1.0, drums: 1.0, guitar: 0.7 },
    instrumentSounds: { piano: 'sampled', bass: 'fender', drums: 'standard', guitar: 'nylon' },
    melodic: {
      bass: {
        enabled: true,
        variations: [
          {
            id: 'mer_bass_1', name: 'Var 1', loopBars: 1,
            pattern: { 1: [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0] },
          },
          {
            id: 'mer_bass_2', name: 'Var 2', loopBars: 1,
            pattern: {
              1: [1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0],
              5: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
            },
            octaveOffsets: { 1: -1, 5: -2 },
          },
          {
            id: 'mer_bass_3', name: 'Var 3', loopBars: 1,
            pattern: { 1: [0,0,0,0,1,0,1,0,0,0,0,0,1,0,1,0] },
          },
          {
            id: 'mer_bass_4', name: 'Var 4', loopBars: 1,
            pattern: { 1: [1,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0] },
          },
          {
            id: 'mer_bass_5', name: 'Var 5', loopBars: 1,
            pattern: {
              1: [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
              3: [0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0],
            },
          },
          {
            id: 'mer_bass_6', name: 'Var 6', loopBars: 1,
            pattern: {
              1: [0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0],
              3: [0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0],
              5: [0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0],
            },
          },
          {
            id: 'mer_bass_7', name: 'Var 7', loopBars: 1,
            pattern: { 1: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0] },
          },
          {
            id: 'mer_bass_8', name: 'Var 8', loopBars: 1,
            pattern: { 1: [0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0] },
          },
          {
            id: 'mer_bass_all', name: 'All together', loopBars: 1,
            pattern: { 1: [0,0,0,0,0,0,0,0,1,0,1,0,1,0,0,0] },
          },
        ],
      },
      piano: {
        enabled: true,
        variations: [
          {
            id: 'mer_piano_1', name: 'Var 1', loopBars: 1,
            pattern: {
              1: [1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0],
              3: [0,0,0,0,1,0,0,0,0,0,1,0,1,0,0,1],
              5: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
            },
          },
          {
            id: 'mer_piano_2', name: 'Var 2', loopBars: 1,
            pattern: {
              1: [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
              3: [1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0],
              5: [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
            },
          },
          {
            id: 'mer_piano_3', name: 'Var 3', loopBars: 1,
            pattern: {
              1: [1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0],
              3: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
              5: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
            },
          },
          {
            id: 'mer_piano_4', name: 'Var 4', loopBars: 1,
            pattern: {
              1: [0,1,0,1,0,0,1,0,0,0,1,0,0,0,1,0],
              3: [0,1,0,1,0,0,1,0,0,0,1,0,0,0,1,0],
              5: [0,1,0,1,0,0,1,0,0,0,1,0,0,0,1,0],
            },
          },
          {
            id: 'mer_piano_5', name: 'Var 5', loopBars: 1,
            pattern: {
              1: [1,0,0,1,0,1,0,0,1,0,0,1,0,0,1,0],
              3: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
              5: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
            },
          },
          {
            id: 'mer_piano_all', name: 'All together', loopBars: 1,
            pattern: {
              1: [0,0,0,0,0,0,0,0,1,0,1,0,1,0,0,0],
              3: [0,0,0,0,0,0,0,0,1,0,1,0,1,0,0,0],
              5: [0,0,0,0,0,0,0,0,1,0,1,0,1,0,0,0],
            },
          },
        ],
      },
      guitar: {
        enabled: true,
        variations: [
          {
            id: 'mer_guitar_1', name: 'Var 1', loopBars: 1,
            pattern: {
              1: [0,1,0,1,0,0,1,0,0,0,1,0,0,0,1,0],
              3: [0,1,0,1,0,0,1,0,0,0,1,0,0,0,1,0],
              5: [0,1,0,1,0,0,1,0,0,0,1,0,0,0,1,0],
            },
            chordHit: [0,1,0,1,0,0,1,0,0,0,1,0,0,0,1,0],
            octaveOffsets: { 3: -1 },
          },
          {
            id: 'mer_guitar_2', name: 'Var 2', loopBars: 1,
            pattern: {
              1: [1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0],
              3: [0,1,0,0,1,0,1,0,1,0,1,0,1,0,1,0],
              5: [1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0],
            },
          },
        ],
      },
    },
  },

  // ============================================
  // 13. METAL (Doble bombo) - 140 BPM
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
      // Kick sincopado: 1 &a 2 &a 3e _ _ _ a
      kick:  [1, 0, 1, 1, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1],
      // Caja en 2 y 4, push en "&" del 4
      snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0],
      // Hi-hat: corcheas constantes
      hihat: [0.8, 0, 0.8, 0, 0.8, 0, 0.8, 0, 0.8, 0, 0.8, 0, 0.8, 0, 0.8, 0],
      // Crash: acento en tiempo 1
      crash: [0.7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      // B: X - X - | X - X - | X - X - | X - X - (unísono con riff)
      bass:  [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
      // P: X - - - | - - - - | - - - - | - - - - (power chords/pads)
      piano: [0.8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      // G: X - X - | X - X - | X - X - | X - X - (palm mute riffs)
      guitar: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
    },
    fill: {
      position: 8,
      pattern: {
        // Fill de doble bombo
        kick:  [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1],
        snare: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        crash: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      },
    },
    volumes: { piano: 0.7, bass: 1.0, drums: 1.0, guitar: 0.7 },
    instrumentSounds: { piano: 'synth', bass: 'fender', drums: 'standard', guitar: 'electric' },
  },

  // ============================================
  // METAL 2 (Kick en grupos) - 140 BPM
  // ============================================
  {
    id: 'metal_2',
    name: 'Metal 2',
    category: 'Metal',
    bpm: 140,
    bpmRange: [120, 180],
    description: 'Kick en ráfagas agrupadas, hi-hat en corcheas.',
    rhythm: {
      kick:   [1, 1, 1, 0, 0, 0, 1, 1, 1, 0, 0, 1, 0, 0, 1, 1],
      snare:  [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      hihat:  [0.8, 0, 0.8, 0, 0.8, 0, 0.8, 0, 0.8, 0, 0.8, 0, 0.8, 0, 0.8, 0],
      crash:  [0.7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      bass:   [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
      piano:  [0.8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      guitar: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
    },
    fill: {
      position: 8,
      pattern: {
        kick:  [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1],
        snare: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        crash: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      },
    },
    volumes: { piano: 0.7, bass: 1.0, drums: 1.0, guitar: 0.7 },
    instrumentSounds: { piano: 'synth', bass: 'fender', drums: 'standard', guitar: 'electric' },
  },

  // ============================================
  // 15. FOLK / INDIE FOLK - 90 BPM
  // ============================================
  // Caja con brush, bombo suave. Guitarra fingerpicking.
  {
    id: 'folk_indie',
    name: 'Folk / Indie',
    category: 'Folk',
    bpm: 90,
    bpmRange: [75, 105],
    description: 'Escobillas suaves. Guitarra fingerpicking, arpegios.',
    rhythm: {
      kick:  [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
      // Snare con brush effect
      snare: [0, 0, 0.3, 0, 0.3, 0, 0.3, 0, 0, 0, 0.3, 0, 0.3, 0, 0.3, 0],
      // Hi-hat suave
      hihat: [0.4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      bass:  [1, 0, 0, 0, 0, 0, 0.8, 0, 1, 0, 0, 0, 0, 0, 0, 0],
      // Piano arpegiado
      piano: [0.6, 0.2, 0.4, 0.1, 0.3, 0.2, 0.5, 0.1, 0.6, 0.2, 0.4, 0.1, 0.3, 0.2, 0.5, 0.1],
      // G: X - - x | - x - x (Fingerpicking: bajo en 1, agudos intercalados)
      guitar: [0.8, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0.8, 0, 0, 0.5, 0, 0.5, 0, 0.5],
    },
    fill: {
      position: 12,
      pattern: {
        snare: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.3, 0.4, 0.5, 0.6],
        hihat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.4],
      },
    },
    volumes: { piano: 0.7, bass: 1.0, drums: 1.0, guitar: 0.7 },
    instrumentSounds: { piano: 'sampled', bass: 'fender', drums: 'standard', guitar: 'acoustic' },
  },


  // ============================================
  // 17. BOSSA NOVA LIGERA - 125 BPM
  // ============================================
  // Patrón de bossa suave. Guitarra violão brasileño.
  {
    id: 'bossa_light',
    name: 'Reggae',
    category: 'Reggae',
    bpm: 125,
    bpmRange: [115, 140],
    description: 'Reggae suave',
    rhythm: {
      kick:  [1, 0, 0, 0, 0, 0, 0.8, 0, 1, 0, 0, 0, 0, 0, 0, 0],
      snare: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      // H: clave 3-2 bossa
      hihat: [0.7, 0, 0.7, 0.7, 0, 0.7, 0.7, 0, 0.7, 0, 0.7, 0.7, 0, 0.7, 0.7, 0],
      bass:  [1, 0, 0, 0, 0, 0, 0.8, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      piano: [0, 0, 0, 0, 0.5, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0, 0],
      // G: X - - - | - - x - (Rasgueo espaciado: abajo en 1, arriba en "&" del 2)
      guitar: [],
    },
    fill: {
      position: 12,
      pattern: {
        hihat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0.6, 0.7, 0.8],
        snare: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.4, 0],
      },
    },
    volumes: { piano: 0.7, bass: 1.0, drums: 1.0, guitar: 0.7 },
    instrumentSounds: { piano: 'sampled', bass: 'fender', drums: 'standard', guitar: 'acoustic' },
  },

  // ============================================
  // 18. SOUL / R&B (60s) - 70 BPM
  // ============================================
  // Sparse one-drop kick, steady off-beat hihat, melodic bass/piano/guitar
  // variations layered on top (tuned live in the Rhythm Editor).
  {
    id: 'soul_rnb',
    name: 'R&B',
    category: 'Soul',
    bpm: 70,
    bpmRange: [85, 105],
    description: 'Soul clásico 60s. Guitarra chicken scratch suave.',
    rhythm: {
      kick:  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      hihat: [0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
      bass:  [1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0],
      piano: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0],
      // Chicken scratch: muted upstroke stabs on the off-beat 8ths, between the kick/bass hits
      guitar: [0, 0, 0.4, 0, 0, 0, 0.5, 0, 0, 0, 0.4, 0, 0, 0, 0.5, 0],
    },
    fill: {
      position: 12,
      pattern: {
        snare: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.6, 0.7, 0.8, 1],
        hihat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.6],
      },
    },
    volumes: { piano: 0.7, bass: 1.0, drums: 1.0, guitar: 1.0 },
    instrumentSounds: { piano: 'sampled', bass: 'fender', drums: 'standard', guitar: 'electric' },
    melodic: {
      bass: {
        variations: [{
          id: 'sv_soul_rnb_bass_1',
          name: 'Var 1',
          // Root only, one octave down, on beat 1 — lets the bass rhythm pattern above carry the groove
          pattern: { 1: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
          loopBars: 1,
          octaveOffsets: { 1: -1, 2: -1, 3: -1, 4: -1, 5: -1, 6: -1, 7: -1, 8: -1 },
          chordHit: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        }],
        enabled: true,
      },
      piano: {
        variations: [{
          id: 'sv_soul_rnb_piano_1',
          name: 'Var 1',
          pattern: {
            1: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            5: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            8: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          },
          loopBars: 1,
          // Full chord stab on beat 1 only
          chordHit: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        }],
        enabled: true,
      },
      guitar: {
        variations: [{
          id: 'sv_soul_rnb_guitar_1',
          name: 'Var 1',
          // Quick ascending pickup (root-3rd-5th-octave) on the first four 16ths
          pattern: {
            1: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            3: [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            5: [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            7: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            8: [0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          },
          loopBars: 1,
          // Full chord stab on the "&" of beat 2 and on beat 4
          chordHit: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0],
        }],
        enabled: true,
      },
    },
  },

  // ============================================
  // 19. COUNTRY / TWO-STEP - 110 BPM
  // ============================================
  // Two-step relajado. Guitarra boom-chick con palm mute.
  {
    id: 'Reggae_twostep',
    name: 'Reggae Two-Step',
    category: 'Reggae',
    bpm: 110,
    bpmRange: [100, 125],
    description: 'Reggae relajado. Guitarra boom-chick con acento en upstroke.',
    rhythm: {
      kick:  [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
      snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      hihat: [0.7, 0, 0.7, 0, 0.7, 0, 0.7, 0, 0.7, 0, 0.7, 0, 0.7, 0, 0.7, 0],
      bass:  [1, 0, 0, 0, 0, 0, 0.8, 0, 1, 0, 0, 0, 0, 0, 0.8, 0],
      piano: [0, 0, 0.5, 0, 0, 0, 0.5, 0, 0, 0, 0.5, 0, 0, 0, 0.5, 0],
      // G: x - X - | x - X - (Abajo suave, arriba acentuado)
    },
    fill: {
      position: 12,
      pattern: {
        snare: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.9, 0.7, 0.9, 0.7],
        hihat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.6],
      },
    },
    volumes: { piano: 0.7, bass: 1.0, drums: 1.0, guitar: 0.7 },
    instrumentSounds: { piano: 'sampled', bass: 'fender', drums: 'standard', guitar: 'acoustic' },
  },
  // ============================================
  // 21. JAZZ LIGERO (Medium Swing) - 130 BPM
  // ============================================
  // Swing en ride. Guitarra Freddie Green (chop percusivo).
  {
    id: 'jazz_light',
    name: 'Jazz Ligero',
    category: 'Jazz',
    bpm: 130,
    bpmRange: [115, 150],
    description: 'Medium swing. Guitarra chop estilo big band.',
    rhythm: {
      kick:  [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
      snare: [0, 0, 0.4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.4, 0, 0, 0],
      hihat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      hihatFoot: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      ride:  [0.8, 0, 0.8, 0, 0.8, 0, 0.8, 0, 0.8, 0, 0.8, 0, 0.8, 0, 0.8, 0],
      bass:  [1, 0, 0.3, 0, 0.8, 0, 0.3, 0, 1, 0, 0.3, 0, 0.8, 0, 0.3, 0],
      piano: [0, 0, 0.4, 0, 0.8, 0, 0.4, 0, 0, 0, 0.4, 0, 0.8, 0, 0.4, 0],
      // G: X - - | X - - | X - - | X - - (Chop percusivo en cada tiempo)
      guitar: [0.7, 0, 0, 0, 0.7, 0, 0, 0, 0.7, 0, 0, 0, 0.7, 0, 0, 0],
    },
    fill: {
      position: 8,
      pattern: {
        snare: [0, 0, 0, 0, 0, 0, 0, 0, 0.7, 0, 0.6, 0, 0.5, 0, 0.4, 0],
        hihat: [0.8, 0, 0.4, 0.7, 0, 0.4, 0.8, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      },
    },
    volumes: { piano: 0.7, bass: 1.0, drums: 1.0, guitar: 0.7 },
    instrumentSounds: { piano: 'sampled', bass: 'fender', drums: 'standard', guitar: 'nylon' },
  },

  // ============================================
  // 22. CORITOS (Gospel Latinoamericano) - 151 BPM
  // ============================================
  // Ride sincopado, caja+hihat en tiempos 2 y 4. Bajo I-V.
  {
    id: 'coritos',
    name: 'Coritos',
    category: 'Gospel',
    bpm: 151,
    bpmRange: [100, 180],
    description: 'Gospel evangélico latinoamericano. Ride sincopado, bajo I–V.',
    rhythm: {
      kick:  [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
      snare: [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0],
      hihat: [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0],
      bass:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      piano: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      ride:  [1,0,1,0, 0,1,1,1, 1,0,1,0, 1,1,1,0],
    },
    fill: {
      position: 0,
      pattern: {
        kick:     [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
        snare:    [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
        hihat:    [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0],
        ride:     [1,0,1,0, 0,1,1,0, 1,0,1,0, 0,1,1,0],
        crash:    [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
        tom1:     [0,0,0,0, 0,0,0,0, 1,0,1,0, 1,0,1,0],
        floorTom: [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,1,0],
      },
    },
    volumes: { piano: 1, bass: 1, drums: 0.75 },
    instrumentSounds: { piano: 'sampled', bass: 'fender', drums: 'standard', guitar: 'electric' },
    melodic: {
      bass: {
        enabled: true,
        variations: [
          {
            id: 'cor_bass_1', name: 'Var 1', loopBars: 1,
            pattern: {
              1: [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
              5: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
            },
            octaveOffsets: { 1: 0, 2: -1, 3: -1, 4: -1, 5: -1, 6: -1, 7: -1, 8: -1 },
          },
          {
            id: 'cor_bass_2', name: 'Var 2', loopBars: 1,
            pattern: {
              1: [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
              5: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
              7: [0,0,0,0, 0,0,1,0, 0,0,0,0, 0,0,1,0],
            },
            octaveOffsets: { 1: 0, 5: -1, 7: -1, 8: -1 },
          },
          {
            id: 'cor_bass_3', name: 'Var 3', loopBars: 1,
            pattern: {
              1: [1,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
              2: [0,0,0,0, 1,0,0,0, 0,0,0,0, 0,0,0,0],
              3: [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
              5: [0,0,0,0, 0,0,0,0, 0,0,0,0, 1,0,0,0],
            },
          },
          {
            id: 'cor_bass_4', name: 'Var 4', loopBars: 1,
            pattern: {
              1: [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
            },
          },
        ],
      },
      piano: {
        enabled: true,
        variations: [
          {
            id: 'cor_piano_1', name: 'Var 1', loopBars: 1,
            pattern: {},
            chordHit: [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0],
          },
        ],
      },
      guitar: {
        enabled: true,
        variations: [
          {
            id: 'cor_guitar_1', name: 'Var 1', loopBars: 1,
            pattern: {
              5: [0,0,0,0, 0,0,0,0, 1,0,0,0, 1,0,0,0],
              8: [0,0,0,0, 0,0,1,0, 0,0,0,0, 0,0,0,0],
            },
            chordHit: [1,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
          },
          {
            id: 'cor_guitar_2', name: 'Var 2', loopBars: 1,
            pattern: {},
          },
        ],
      },
    },
  },
];

/**
 * Get style by ID
 * Optionally pass custom styles to also search in them
 */
export function getStyleById(id: string, customStyles: StylePattern[] = []): StylePattern | undefined {
  // First check custom styles, then built-in
  return customStyles.find(s => s.id === id) || MUSICAL_STYLES.find(s => s.id === id);
}

/**
 * Get style by ID with override support
 * This version checks for overrides of built-in styles
 */
export function getStyleByIdWithOverrides(
  id: string,
  customStyles: StylePattern[] = [],
  overrideGetter: (id: string) => StylePattern | null
): StylePattern | undefined {
  const override = overrideGetter(id);
  if (override) return override;
  return customStyles.find(s => s.id === id) || MUSICAL_STYLES.find(s => s.id === id);
}

/**
 * Single source of truth for resolving the active playback style.
 * Used in both Index.tsx (currentStyle useMemo) and PlaybackContext (getStyle getter)
 * so both always compute the same result from the same inputs.
 */
export function resolveActiveStyle(
  selectedStyleId: string,
  liveEditedStyle: StylePattern | null | undefined,
  customStyles: StylePattern[],
  overrideGetter: (id: string) => StylePattern | null,
): StylePattern {
  if (liveEditedStyle) return liveEditedStyle;
  return getStyleByIdWithOverrides(selectedStyleId, customStyles, overrideGetter) ?? MUSICAL_STYLES[0];
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
  humanize: boolean = false,
  strictFill: boolean = false
): {
  kick: number[];
  snare: number[];
  snareStick: number[];
  hihat: number[];
  hihatOpen: number[];
  hihatFoot: number[];
  tom1: number[];
  tom2: number[];
  floorTom: number[];
  ride: number[];
  crash: number[];
  bass: number[];
  piano: number[];
  guitar?: number[];
} {
  const slotsPerBar = getSlotsPerBar(style);

  // When the style's rhythm cycles over more than 1 bar (loopBars > 1), each
  // rhythm array is loopBars*slotsPerBar long — pick out the slotsPerBar-long
  // slice for whichever bar of the loop we're currently on. For loopBars=1
  // (the default, every pre-existing style), barOffset is always 0 and this
  // is a no-op slice of the whole array.
  const loopBars = style.loopBars ?? 1;
  const barOffset = ((barNumber - 1) % loopBars) * slotsPerBar;
  const sliceBar = (arr?: number[]): number[] | undefined =>
    arr ? arr.slice(barOffset, barOffset + slotsPerBar) : undefined;

  // Start with base patterns
  let kick = sliceBar(style.rhythm.kick)!;
  let snare = sliceBar(style.rhythm.snare)!;
  let snareStick = sliceBar(style.rhythm.snareStick) ?? new Array(slotsPerBar).fill(0);
  let hihat = sliceBar(style.rhythm.hihat)!;
  let hihatOpen = sliceBar(style.rhythm.hihatOpen) ?? new Array(slotsPerBar).fill(0);
  let hihatFoot = sliceBar(style.rhythm.hihatFoot) ?? new Array(slotsPerBar).fill(0);
  let tom1 = sliceBar(style.rhythm.tom1) ?? new Array(slotsPerBar).fill(0);
  let tom2 = sliceBar(style.rhythm.tom2) ?? new Array(slotsPerBar).fill(0);
  let floorTom = sliceBar(style.rhythm.floorTom) ?? new Array(slotsPerBar).fill(0);
  let ride = sliceBar(style.rhythm.ride) ?? new Array(slotsPerBar).fill(0);
  let crash = sliceBar(style.rhythm.crash) ?? new Array(slotsPerBar).fill(0);
  let bass = sliceBar(style.rhythm.bass)!;
  let piano = sliceBar(style.rhythm.piano)!;
  let guitar = sliceBar(style.rhythm.guitar);

  // Apply fill on phrase endings
  if (shouldApplyFill(barNumber, phraseLength)) {
    const fillPos = style.fill.position;

    const applyFill = (base: number[], fillPattern?: number[]) => {
      // In strictFill mode (Fill editor preview): ALWAYS apply the fill pattern.
      // Missing fill patterns become silence (all zeros).
      // In normal mode: only apply if there's an explicit fill pattern.
      if (!strictFill && !fillPattern) return;

      for (let i = fillPos; i < slotsPerBar; i++) {
        base[i] = fillPattern?.[i] ?? 0;
      }
    };
    
    // Fill patterns are sliced per-bar exactly like the base rhythm arrays
    // above, so a fill can differ between bar 1 and bar 2 of a multi-bar loop
    // instead of the same fill repeating identically in every bar.
    applyFill(kick, sliceBar(style.fill.pattern.kick));
    applyFill(snare, sliceBar(style.fill.pattern.snare));
    applyFill(snareStick, sliceBar(style.fill.pattern.snareStick));
    applyFill(hihat, sliceBar(style.fill.pattern.hihat));
    applyFill(hihatOpen, sliceBar(style.fill.pattern.hihatOpen));
    applyFill(hihatFoot, sliceBar(style.fill.pattern.hihatFoot));
    applyFill(tom1, sliceBar(style.fill.pattern.tom1));
    applyFill(tom2, sliceBar(style.fill.pattern.tom2));
    applyFill(floorTom, sliceBar(style.fill.pattern.floorTom));
    applyFill(ride, sliceBar(style.fill.pattern.ride));
    applyFill(crash, sliceBar(style.fill.pattern.crash));
    if (guitar) {
      applyFill(guitar, sliceBar(style.fill.pattern.guitar));
    }
  }

  // Apply humanization (slight velocity variations)
  if (humanize) {
    const humanizeVelocity = (arr: number[]) => 
      arr.map(v => v > 0 ? Math.max(0.2, v * (0.85 + Math.random() * 0.3)) : 0);
    
    kick = humanizeVelocity(kick);
    snare = humanizeVelocity(snare);
    snareStick = humanizeVelocity(snareStick);
    hihat = humanizeVelocity(hihat);
    hihatOpen = humanizeVelocity(hihatOpen);
    hihatFoot = humanizeVelocity(hihatFoot);
    tom1 = humanizeVelocity(tom1);
    tom2 = humanizeVelocity(tom2);
    floorTom = humanizeVelocity(floorTom);
    ride = humanizeVelocity(ride);
    crash = humanizeVelocity(crash);
  }

  // Apply interaction rules
  const result = applyInteractionRules(kick, snare, hihat, bass, piano, guitar);
  return {
    ...result,
    snareStick,
    hihatOpen,
    hihatFoot,
    tom1,
    tom2,
    floorTom,
    ride,
    crash,
  };
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