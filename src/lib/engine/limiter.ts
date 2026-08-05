/**
 * Limitador de salida.
 *
 * El motor satura. Medido sobre los fixtures del arnés, la mezcla llega a picos de 1,4-1,7
 * con `masterGain` a 1.0 y nada detrás. En reproducción el navegador recorta en el destino;
 * en el export, escribir eso en un WAV es distorsión grabada.
 *
 * Va en la ruta compartida, no solo en el export, por dos razones:
 *
 *   - La reproducción satura igual (picos de 1,19-1,47 medidos en el analyser). Arreglar solo
 *     el export dejaría el bug donde más se oye.
 *   - La Fase 3 costó unificar las dos rutas hasta dejarlas a 0,06 dB una de otra. Meter el
 *     limitador en una sola las volvería a separar.
 *
 * No es un compresor de mezcla: el ratio es alto y el umbral está cerca de fondo de escala,
 * así que solo actúa sobre los picos que iban a recortar de todos modos.
 */

/**
 * −3 dBFS, elegido midiendo y no a ojo. Un DynamicsCompressorNode no es un muro perfecto:
 * su ataque deja pasar el transitorio inicial, así que el pico de salida queda por encima del
 * umbral. Medido sobre el fixture más fuerte (eight-bar-phrase, pico original 1,743):
 *
 *   umbral −1 dB → pico 1,094   seguía recortando
 *   umbral −2 dB → pico 1,021   seguía recortando
 *   umbral −3 dB → pico 0,988   por debajo de fondo de escala
 *
 * OJO: MAKEUP_COMPENSATION está medida A ESTE UMBRAL. El makeup interno del nodo depende de
 * los parámetros, así que cambiar el umbral sin volver a medir la compensación descuadra el
 * nivel — comprobado: con −1 dB y esta misma constante, el material flojo sale 1,2 dB por
 * debajo del original.
 *
 * Resultado final, ya compensado:
 *
 *   el más fuerte  pico 1,743 → 0,815, RMS −1,7 dB   (limitando de verdad, que es el objetivo)
 *   el más flojo   RMS 0,065294 → 0,065300           (intacto, no lo toca)
 */
const THRESHOLD_DB = -3;

/** Suficientemente alto para ser un muro, no una compresión. */
const RATIO = 20;

/**
 * Ataque mínimo: el transitorio es justamente lo que satura (bombo, caja, púa de guitarra).
 * Medido a 0 s da el mismo pico que a 1 ms, así que se deja el valor convencional.
 */
const ATTACK_SEC = 0.001;

/** Release cómodo, para que no "bombee" en pasajes densos. */
const RELEASE_SEC = 0.1;

/** Codo duro: un codo suave empezaría a tocar material que no iba a recortar. */
const KNEE_DB = 0;

/**
 * Compensación del makeup gain interno.
 *
 * `DynamicsCompressorNode` de Chromium NO es transparente por debajo del umbral: aplica una
 * ganancia de compensación interna, algo que la especificación no menciona y que viene del
 * compresor original de WebKit. Se midió con un fixture cuyo pico es 0,291 — muy por debajo
 * del umbral, o sea que el limitador no llega a actuar — y aun así subió de RMS 0,065294 a
 * 0,079220: **+1,68 dB de ganancia regalada**.
 *
 * Sin compensar, esto no sería un limitador sino un subidón de volumen global, y rompería de
 * paso la paridad entre reproducción y export que costó la Fase 3.
 */
const MAKEUP_COMPENSATION = 0.065294 / 0.079220;

/**
 * Crea el limitador y lo deja conectado a `output`. El llamante conecta su cadena al nodo
 * devuelto, que es la entrada.
 */
export function createLimiter(ctx: BaseAudioContext, output: AudioNode): DynamicsCompressorNode {
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = THRESHOLD_DB;
  limiter.ratio.value = RATIO;
  limiter.attack.value = ATTACK_SEC;
  limiter.release.value = RELEASE_SEC;
  limiter.knee.value = KNEE_DB;

  const compensation = ctx.createGain();
  compensation.gain.value = MAKEUP_COMPENSATION;
  limiter.connect(compensation);
  compensation.connect(output);
  return limiter;
}
