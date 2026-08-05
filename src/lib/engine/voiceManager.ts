/**
 * Rastrea las fuentes sonoras vivas para poder pararlas de verdad.
 *
 * Por qué existe: `stopPlayback()` cerraba el AudioContext entero en cada Stop. Era la
 * forma más fiable de matar lo ya encolado — el scheduler programa ~300 ms por delante, así
 * que al parar hay notas con su `start()` en el futuro que `cancel()` no deshace. Pero
 * cerrar el contexto invalida de paso todas las cachés atadas a él: el soundfont de
 * guitarra, los samples de bajo, los buses del mixer y la cadena de efectos. De ahí salieron
 * tres parches (`stopPlaybackKeepContext`, el timeout de 2,5 s del soundfont y el guard
 * `ctx !== audioContext`) que existían solo para tapar ese efecto secundario.
 *
 * Con un registro de voces, Stop puede parar exactamente lo que suena y el contexto vive.
 *
 * El patrón no es nuevo aquí: `bassTab/sampleEngine.ts` lleva desde siempre un
 * `activeSources` con `stopAllSampledNodes()`. Esto es lo mismo para el motor de acordes.
 *
 * Solo se rastrean fuentes (`AudioBufferSourceNode` y `OscillatorNode`). Las ganancias y
 * los filtros no generan señal por sí mismos: parando las fuentes se calla todo.
 */

/** Lo que sabe empezar y parar por sí solo. */
type Voice = AudioScheduledSourceNode;

let liveContext: BaseAudioContext | null = null;
const voices = new Set<Voice>();

/**
 * Declara cuál es el contexto en vivo. Las voces de cualquier otro contexto se ignoran, que
 * es lo que mantiene los renders offline fuera de esto: un `OfflineAudioContext` no se para
 * nunca, se renderiza entero, y meterlo aquí sería una fuga garantizada.
 */
export function setLiveContext(ctx: BaseAudioContext | null): void {
  if (liveContext !== ctx) voices.clear();
  liveContext = ctx;
}

/**
 * Registra una fuente. Se da de baja sola al terminar, así que el Set solo contiene lo que
 * de verdad está sonando o pendiente de sonar.
 */
export function trackVoice(ctx: BaseAudioContext, node: Voice): void {
  if (ctx !== liveContext) return;
  voices.add(node);
  node.addEventListener('ended', () => voices.delete(node), { once: true });
}

/** Cuántas voces vivas hay. Para diagnóstico y para la prueba de transporte. */
export function activeVoiceCount(): number {
  return voices.size;
}

/**
 * Para todas las voces vivas.
 *
 * `when` debe ir ligeramente por delante de `currentTime` y el llamante debe haber bajado ya
 * la ganancia maestra: cortar una fuente en mitad de su onda es una discontinuidad, y una
 * discontinuidad es un clic. Ver `stopPlayback()`.
 */
export function stopAllVoices(when: number): void {
  for (const node of voices) {
    try {
      node.stop(when);
    } catch {
      // stop() lanza si la fuente nunca llegó a arrancar o ya se paró. Ninguno de los dos
      // casos importa aquí: el objetivo es que no suene.
    }
  }
  // No se vacía el Set: cada nodo se da de baja en su propio evento 'ended', que sigue
  // llegando después del stop() programado. Vaciarlo ahora dejaría escuchadores huérfanos
  // borrando de un Set que ya no los contiene.
}
