/**
 * Descarga y decodificación de samples, en un solo sitio.
 *
 * Antes había tres implementaciones con tres comportamientos distintos:
 *
 *   - `loadAcousticSamples` (batería) — sin caché de bytes, sin reintento
 *   - `loadPianoSamples` / `loadGuitarSampleType` — cachés en objetos de módulo, un fallo
 *     se recordaba para siempre
 *   - `bassTab/sampleEngine` — la más completa: caché de bytes, caché de buffers por
 *     contexto, y reintento tras un fallo
 *
 * Esa dispersión tenía un coste concreto y ya cobrado: el bug de "fallo pegado" (un mal
 * momento de red dejaba un instrumento degradado el resto de la sesión) se arregló primero
 * solo en el bajo, luego en el piano, y seguía vivo en la guitarra. Tres sitios donde
 * arreglar lo mismo es exactamente lo que este módulo elimina.
 *
 * Qué NO hace, a propósito: no sabe de notas, ni de afinación, ni de manifests. Eso es
 * específico de cada instrumento y se queda en su sitio. Aquí solo vive lo que era idéntico
 * en las tres copias — pedir una URL, decodificarla contra un contexto y recordarla.
 */

/**
 * Bytes descargados, independientes del contexto. Sobreviven a que se cierre un
 * AudioContext, así que reabrirlo no vuelve a bajar nada de la red.
 */
const rawCache = new Map<string, ArrayBuffer>();

/**
 * Buffers ya decodificados, por contexto. Es un WeakMap porque un AudioBuffer pertenece al
 * contexto que lo decodificó: si el contexto muere, sus buffers se van con él.
 */
const decodedCache = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();

/** Descargas en curso, para que dos llamadas simultáneas no pidan la misma URL dos veces. */
const inFlight = new Map<string, Promise<AudioBuffer | null>>();

/**
 * Bancos que se sabe que no están disponibles.
 *
 * Sirve para que quien programa una nota pueda decidir SÍNCRONAMENTE usar síntesis en vez de
 * quedarse mudo: la carga es asíncrona, así que para cuando falla ya es tarde para sonar a
 * tiempo. Se limpia en cuanto algo de ese banco vuelve a cargar.
 */
const unavailableBanks = new Set<string>();

/** ¿Sabemos ya que este banco no responde? */
export function isBankUnavailable(bank: string): boolean {
  return unavailableBanks.has(bank);
}

/** El buffer ya decodificado para esta URL, o null si todavía no está. Síncrono. */
export function getSample(ctx: BaseAudioContext, url: string): AudioBuffer | null {
  return decodedCache.get(ctx)?.get(url) ?? null;
}

/**
 * Descarga (si hace falta) y decodifica una URL contra este contexto.
 *
 * Un fallo NO se cachea. Antes, una nota que fallara quedaba marcada como imposible y caía
 * al sintetizador el resto de la sesión, sin forma de recuperarse salvo recargar la página.
 * Ahora el siguiente intento vuelve a probar.
 *
 * `bank` es solo para el registro de disponibilidad; no afecta a la caché, que va por URL.
 */
export async function loadSample(
  ctx: BaseAudioContext,
  url: string,
  bank?: string,
): Promise<AudioBuffer | null> {
  const already = getSample(ctx, url);
  if (already) return already;

  // La clave incluye el contexto porque decodificar es por contexto, aunque los bytes no.
  const key = `${url}`;
  const existing = inFlight.get(key);
  if (existing) return existing;

  const task = (async () => {
    try {
      if (!rawCache.has(url)) {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`${response.status} ${url}`);
        rawCache.set(url, await response.arrayBuffer());
      }
      // slice() porque decodeAudioData consume (detach) el ArrayBuffer que recibe, y estos
      // bytes se reutilizan para decodificar contra otros contextos (p. ej. un render offline).
      const buffer = await ctx.decodeAudioData(rawCache.get(url)!.slice(0));
      let perCtx = decodedCache.get(ctx);
      if (!perCtx) { perCtx = new Map(); decodedCache.set(ctx, perCtx); }
      perCtx.set(url, buffer);
      if (bank) unavailableBanks.delete(bank);
      return buffer;
    } catch {
      if (bank) unavailableBanks.add(bank);
      return null;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, task);
  return task;
}

/** Carga varias URLs a la vez. Las que fallen quedan como null, sin abortar el resto. */
export async function loadSamples(
  ctx: BaseAudioContext,
  urls: string[],
  bank?: string,
): Promise<void> {
  await Promise.all(urls.map((url) => loadSample(ctx, url, bank)));
}
