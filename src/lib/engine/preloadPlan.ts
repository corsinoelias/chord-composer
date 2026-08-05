/**
 * Qué muestras hace falta descargar para tocar una canción.
 *
 * El bajo sampleado se precargaba entero: 30 notas, 692 KB cada una en WAV sin comprimir,
 * unos 20 MB antes de la primera nota. Medido en una song page real con red 4G emulada, eso
 * eran **25 segundos** hasta oír algo, y en 3G no llegaba a sonar.
 *
 * Casi todo ese banco sobra. Una canción usa un puñado de notas de bajo, no 30.
 *
 * Saber CUÁLES no es adivinable desde los acordes: el bajo no toca solo fundamentales, sino
 * lo que dicten las variaciones melódicas, sus `octaveOffsets` y la transposición. Pero desde
 * que `buildSlotEvents` es una función pura (sin Web Audio, sin reloj, sin estado), se puede
 * recorrer la canción entera y preguntar exactamente qué notas sonarían — sin sonar.
 */

import { type Section } from '../sections';
import { type StylePattern, generateBarPattern, getSlotsPerBar } from '../styles';
import { type MelodicData, resolveVariation } from '../bassScale';
import { chordToMidiNotes } from '../musicTheory';
import { buildSlotEvents } from './eventBuilder';
import { type EventInstrument } from './types';

export interface PlanInput {
  sections: Section[];
  style: StylePattern;
  /** Fuente de las variaciones melódicas. La reproducción usa la del estilo activo. */
  melodic?: MelodicData | null;
  transposition?: number;
  /**
   * El `octaveOffset` del sonido elegido, en octavas.
   *
   * NO es opcional por capricho: el builder emite la nota musical cruda y es el dispatcher
   * quien le suma el desplazamiento del sonido (`ev.midi + octaveOffset * 12`), porque eso
   * es propiedad del instrumento y no de la composición. Olvidarlo aquí hace que se precarguen
   * muestras de la octava equivocada — se detectó porque el bajo devolvía notas 60-67, que no
   * es rango de bajo. El fallo sería silencioso: sonaría igual, pero descargando el doble.
   */
  octaveOffset?: number;
}

/**
 * Las notas MIDI únicas que un instrumento tocaría en toda la canción.
 *
 * Es una simulación completa, no una estimación: recorre los mismos slots que el scheduler y
 * usa el mismo builder, así que el conjunto es exacto para los parámetros dados.
 *
 * Ojo con lo que NO puede saber: si el usuario transpone o cambia de variación DURANTE la
 * reproducción, aparecerán notas fuera de este conjunto. No es un problema — `getAudioBuffer`
 * las descarga bajo demanda — pero la primera vez puede llegar tarde a su instante.
 */
export function collectMidiNotes(instrument: EventInstrument, input: PlanInput): number[] {
  const { sections, style, melodic, transposition = 0, octaveOffset = 0 } = input;
  const slotsPerBar = getSlotsPerBar(style);
  const source = melodic ?? style.melodic ?? null;
  const notes = new Set<number>();

  // Solo se pide el instrumento en cuestión: el resto no aporta notas y sí coste.
  const audible = {
    piano: instrument === 'piano',
    bass: instrument === 'bass',
    drums: false,
    guitar: instrument === 'guitar',
  };

  // El patrón depende de la barra (fills), así que se cachea igual que en el scheduler.
  const patternCache = new Map<number, ReturnType<typeof generateBarPattern>>();
  const totalBeats = sections.reduce(
    (sum, s) => sum + s.chords.reduce((a, c) => a + c.duration, 0) * s.repeatCount, 0);
  const phraseLength = Math.floor((totalBeats * 4) / slotsPerBar) >= 8 ? 8 : 4;
  const patternFor = (barNum: number) => {
    let p = patternCache.get(barNum);
    if (!p) { p = generateBarPattern(style, barNum, phraseLength, false); patternCache.set(barNum, p); }
    return p;
  };

  let globalSlot = 0;
  for (const section of sections) {
    const variation = source
      ? resolveVariation(source[instrument], section[`${instrument}VariationId` as keyof Section] as string | undefined)
      : null;
    for (let repeat = 0; repeat < section.repeatCount; repeat++) {
      for (const chord of section.chords) {
        const midiNotes = chordToMidiNotes(chord).map(n => n + transposition);
        const slotCount = chord.duration * 4;
        for (let i = 0; i < slotCount; i++) {
          const currentGlobalSlot = globalSlot + i;
          const patternSlot = currentGlobalSlot % slotsPerBar;
          const events = buildSlotEvents({
            slotTime: 0,
            slotDuration: 0.1,
            currentGlobalSlot,
            patternSlot,
            slotsPerBar,
            midiNotes,
            chordQuality: chord.quality,
            pattern: patternFor(Math.floor(currentGlobalSlot / slotsPerBar) + 1),
            style,
            melodic: {
              piano: instrument === 'piano' ? variation : null,
              bass: instrument === 'bass' ? variation : null,
              guitar: instrument === 'guitar' ? variation : null,
            },
            audible,
          });
          for (const ev of events) {
            if (ev.kind === 'note' && ev.instrument === instrument) notes.add(ev.midi + octaveOffset * 12);
          }
        }
        globalSlot += slotCount;
      }
    }
  }

  return [...notes].sort((a, b) => a - b);
}
