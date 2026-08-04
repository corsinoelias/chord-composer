/**
 * Golden-render fixtures for the audio engine regression harness.
 *
 * Each fixture is plain JSON-serializable data — it gets passed into the browser via
 * page.evaluate(), so it cannot contain functions or imported objects. Styles are
 * referenced by id (resolved against MUSICAL_STYLES inside the page); `styleOverrides`
 * is shallow-merged on top to reach code paths no built-in style exercises.
 *
 * Coverage goal: every musically-distinct branch of renderProgressionOffline. See
 * README.md for what the offline path does NOT cover.
 */

const chord = (root, quality, duration, accidental = '') => ({
  id: `${root}${accidental}${quality}-${duration}`,
  root,
  accidental,
  quality,
  duration,
});

const section = (id, chords, extra = {}) => ({
  id,
  name: id,
  chords,
  repeatCount: 1,
  ...extra,
});

/** All four instruments audible, sample-based sounds where they exist. */
const allInstruments = [
  { id: 'piano', muted: false, solo: false, volume: 0.8, soundTypeId: 'sampled' },
  { id: 'bass', muted: false, solo: false, volume: 0.8, soundTypeId: 'fender' },
  { id: 'drums', muted: false, solo: false, volume: 0.8, soundTypeId: 'standard' },
  { id: 'guitar', muted: false, solo: false, volume: 0.7, soundTypeId: 'acoustic' },
];

const withInstruments = (overrides) =>
  allInstruments.map((i) => ({ ...i, ...(overrides[i.id] ?? {}) }));

/** I-V-vi-IV in C, one bar each. */
const popProgression = [
  chord('C', 'maj', 4),
  chord('G', 'maj', 4),
  chord('A', 'min', 4),
  chord('F', 'maj', 4),
];

const arpCell = (type, speed) => ({ type, speed });
const arpRow = (cells) => {
  const row = new Array(16).fill(null);
  for (const [slot, cell] of cells) row[slot] = cell;
  return row;
};

export const fixtures = [
  {
    name: 'baseline-pop1',
    description: 'Cuatro compases 4/4, los cuatro instrumentos, sin variaciones. Caso de control.',
    styleId: 'pop_1',
    bpm: 100,
    transposition: 0,
    instruments: allInstruments,
    sections: [section('A', popProgression)],
  },
  {
    name: 'six-eight',
    description: 'Compás 6/8 (12 slots por barra) + variaciones melódicas de bajo y guitarra.',
    styleId: 'pop_6_8',
    bpm: 96,
    transposition: 0,
    instruments: allInstruments,
    sections: [section('A', popProgression)],
  },
  {
    name: 'swing-jazz',
    description: 'swing=1 — el único estilo que desplaza los contratiempos vía getSwingOffset.',
    styleId: 'jazz_light',
    bpm: 120,
    transposition: 0,
    instruments: allInstruments,
    sections: [section('A', [chord('D', 'min7', 4), chord('G', '7', 4), chord('C', 'maj7', 8)])],
  },
  {
    name: 'melodic-variations',
    description: 'Variaciones melódicas NO por defecto en los tres instrumentos (resolveVariation).',
    styleId: 'merengue',
    bpm: 130,
    transposition: 0,
    instruments: allInstruments,
    sections: [
      section('A', popProgression, {
        bassVariationId: 'mer_bass_5',
        pianoVariationId: 'mer_piano_3',
        guitarVariationId: 'mer_guitar_2',
      }),
    ],
  },
  {
    name: 'melodic-fallback-id',
    description: 'variationId inexistente — resolveVariation debe caer en la primera variación.',
    styleId: 'merengue',
    bpm: 130,
    transposition: 0,
    instruments: allInstruments,
    sections: [
      section('A', popProgression, {
        bassVariationId: 'no-existe-esta-variacion',
        pianoVariationId: 'tampoco-esta',
      }),
    ],
  },
  {
    name: 'reggaeton-default',
    description: 'Estilo por defecto de una canción nueva (getInitialStyleId).',
    styleId: 'reggaeton',
    bpm: 95,
    transposition: 0,
    instruments: allInstruments,
    sections: [section('A', popProgression)],
  },
  {
    name: 'arpeggios',
    description:
      'Arpegios de piano y guitarra. NINGÚN estilo built-in los define, así que sin este ' +
      'fixture applyArpeggioOrder/getArpeggioNotesPerSlot quedan sin cobertura. ' +
      'Se evita el tipo "random" a propósito: es el único no determinista aun con PRNG sembrado ' +
      'porque el número de llamadas depende del orden de evaluación.',
    styleId: 'pop_1',
    styleOverrides: {
      arpeggios: {
        piano: arpRow([
          [0, arpCell('up', 'normal')],
          [4, arpCell('down', 'fast')],
          [8, arpCell('updown', 'slow')],
          [12, arpCell('up', 'veryfast')],
        ]),
        guitar: arpRow([
          [2, arpCell('down', 'normal')],
          [10, arpCell('updown', 'fast')],
        ]),
      },
    },
    bpm: 100,
    transposition: 0,
    instruments: allInstruments,
    sections: [section('A', popProgression)],
  },
  {
    name: 'eight-bar-phrase',
    description: 'Ocho barras — fuerza offlinePhraseLength=8, el fill cae al final de la frase.',
    styleId: 'rock_basic',
    bpm: 120,
    transposition: 0,
    instruments: allInstruments,
    sections: [section('A', [...popProgression, ...popProgression])],
  },
  {
    name: 'four-bar-phrase',
    description: 'Cuatro barras — offlinePhraseLength=4, fill en la barra 4.',
    styleId: 'rock_basic',
    bpm: 120,
    transposition: 0,
    instruments: allInstruments,
    sections: [section('A', popProgression)],
  },
  {
    name: 'repeats-multisection',
    description: 'Dos secciones con repeatCount>1 y variaciones distintas por sección.',
    styleId: 'soul_rnb',
    bpm: 88,
    transposition: 0,
    instruments: allInstruments,
    sections: [
      section('verse', [chord('A', 'min7', 4), chord('D', 'min7', 4)], { repeatCount: 2 }),
      section('chorus', [chord('F', 'maj7', 4), chord('G', '7', 4)], { repeatCount: 3 }),
    ],
  },
  {
    name: 'transposed',
    description: 'transposition=+5 — desplaza midiNotes antes de resolver samples.',
    styleId: 'pop_1',
    bpm: 100,
    transposition: 5,
    instruments: allInstruments,
    sections: [section('A', popProgression)],
  },
  {
    name: 'chord-qualities',
    description:
      'Duraciones fraccionarias y cualidades extendidas — chordToMidiNotes + slotCount no entero.',
    styleId: 'bossa_light',
    bpm: 110,
    transposition: 0,
    instruments: allInstruments,
    sections: [
      section('A', [
        chord('C', 'maj9', 2),
        chord('E', 'm7b5', 1, 'b'),
        chord('A', '7b9', 1),
        chord('D', 'min11', 3),
        chord('G', '13', 1),
        chord('C', '6/9', 4),
      ]),
    ],
  },
  {
    name: 'synth-drums',
    description:
      'Kit "rock" — síntesis pura con buffers de ruido (Math.random). Verifica que el PRNG ' +
      'sembrado hace determinista la ruta sintetizada, no solo la de samples.',
    styleId: 'metal',
    bpm: 140,
    transposition: 0,
    instruments: withInstruments({ drums: { soundTypeId: 'rock' } }),
    sections: [section('A', [chord('E', '5', 4), chord('C', '5', 4)])],
  },
  {
    name: 'guitar-nylon-samples',
    description: 'Set de samples de guitarra distinto (nylon) — findClosestGuitarSample + pitch shift.',
    styleId: 'folk_indie',
    bpm: 105,
    transposition: 0,
    instruments: withInstruments({ guitar: { soundTypeId: 'nylon' } }),
    sections: [section('A', popProgression)],
  },
  {
    name: 'synth-fallbacks',
    description:
      'Sonidos sin samples en los cuatro instrumentos — ejercita las rutas de síntesis ' +
      '(playPianoNoteSynth, playBassNote, playGuitarSynth).',
    styleId: 'disco',
    bpm: 120,
    transposition: 0,
    instruments: [
      { id: 'piano', muted: false, solo: false, volume: 0.8, soundTypeId: 'bright' },
      { id: 'bass', muted: false, solo: false, volume: 0.8, soundTypeId: 'synth' },
      { id: 'drums', muted: false, solo: false, volume: 0.8, soundTypeId: 'electronic' },
      { id: 'guitar', muted: false, solo: false, volume: 0.7, soundTypeId: 'sf2-steel' },
    ],
    sections: [section('A', popProgression)],
  },
  {
    name: 'muted-and-solo',
    description:
      'Un instrumento en solo y otro muteado. OJO: congela el comportamiento ACTUAL, que ' +
      'es incorrecto — la ruta offline filtra por !muted en vez de isInstrumentAudible, así ' +
      'que ignora el solo y exporta todo. Al arreglarlo este fixture debe fallar; se ' +
      'regenera la línea base en el mismo commit. Ver README.md.',
    styleId: 'pop_1',
    bpm: 100,
    transposition: 0,
    instruments: withInstruments({
      bass: { solo: true },
      guitar: { muted: true },
    }),
    sections: [section('A', popProgression)],
  },
];
