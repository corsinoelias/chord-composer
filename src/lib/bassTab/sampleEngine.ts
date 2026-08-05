import { type BassSound } from './types'
import { loadSample, isBankUnavailable } from '../engine/sampleLibrary'

interface SampleEntry { file: string; freq: number; name: string }
interface SampleManifest {
  mode: string
  sampleRate: number
  noteDuration: number
  notes: Record<string, SampleEntry>
}

const SAMPLE_DIR: Partial<Record<BassSound, string>> = {
  fender: 'modo',
  slap:   'slap',
  finger: 'finger',
  muted:  'muted',
}

export function isSampledSound(sound: BassSound): boolean {
  return sound in SAMPLE_DIR
}

const manifestCache = new Map<string, Promise<SampleManifest | null>>()


/**
 * Reexportado desde engine/sampleLibrary: quien programa una nota necesita saber
 * SINCRONAMENTE si el banco responde, porque la carga es asincrona y para cuando falla ya es
 * tarde para sonar a tiempo.
 */
export function isSampleDirUnavailable(dir: string): boolean {
  return isBankUnavailable(dir)
}
const activeSources = new Set<AudioBufferSourceNode>()

/**
 * Se incrementa en cada parada. Programar una nota sampleada es asíncrono (hay que esperar
 * al fetch y al decode), así que una nota puede estar a medio programar cuando llega el
 * Stop: sin esta guarda, su fuente se crea DESPUÉS de haber parado todo y suena igual.
 * Quien programa captura la generación antes de esperar y se rinde si cambió.
 */
let stopGeneration = 0

export function stopAllSampledNodes(): void {
  stopGeneration++
  for (const src of activeSources) {
    try { src.stop() } catch { /* already stopped */ }
  }
  activeSources.clear()
}

// Caching the fetch promise dedupes concurrent callers, which is the point. But caching a
// FAILED one poisons the directory for the rest of the session: a single bad moment — a
// dropped connection, a dev server restarting, a phone switching networks — and the bass is
// silent until the page is reloaded, with no way back. So a rejection is dropped from the
// cache and the next note retries.
async function getManifest(dir: string): Promise<SampleManifest | null> {
  const cached = manifestCache.get(dir)
  if (cached) return cached
  const pending = fetch(`/samples/${dir}/manifest.json`)
    .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json() })
    .then((m: SampleManifest) => m)
    .catch(() => {
      manifestCache.delete(dir)
      return null
    })
  manifestCache.set(dir, pending)
  return pending
}

/**
 * Delega en engine/sampleLibrary, que es donde viven ahora la caché de bytes, la de buffers
 * por contexto, la deduplicación de peticiones en vuelo y la política de reintento. Este
 * módulo se queda solo con lo propio del bajo: manifests y elegir la muestra más cercana.
 *
 * Antes esta función tenía su propia copia de todo eso, y era la más completa de las tres
 * implementaciones que había — de ahí que los arreglos de robustez llegaran aquí primero y
 * tardaran en llegar al piano y a la guitarra.
 */
async function getAudioBuffer(ctx: BaseAudioContext, dir: string, entry: SampleEntry): Promise<AudioBuffer | null> {
  return loadSample(ctx, `/samples/${dir}/${entry.file}`, dir)
}

function findNearest(midi: number, notes: Record<string, SampleEntry>): SampleEntry | null {
  let best: SampleEntry | null = null
  let bestDist = Infinity
  for (const [k, e] of Object.entries(notes)) {
    const d = Math.abs(Number(k) - midi)
    if (d < bestDist) { bestDist = d; best = e }
  }
  return best
}

export async function preloadSamples(ctx: BaseAudioContext, sound: BassSound): Promise<void> {
  const dir = SAMPLE_DIR[sound]
  if (!dir) return
  const m = await getManifest(dir)
  if (!m) return
  await Promise.all(Object.values(m.notes).map(e => getAudioBuffer(ctx, dir, e).catch(() => {})))
}

// Only fetch the samples actually needed for the given MIDI notes — much faster than full preload
export async function preloadSamplesForMidis(
  ctx: BaseAudioContext,
  sound: BassSound,
  midiNotes: number[],
): Promise<void> {
  const dir = SAMPLE_DIR[sound]
  if (!dir) return
  const m = await getManifest(dir)
  if (!m) return
  const seen = new Set<string>()
  const needed: SampleEntry[] = []
  for (const midi of midiNotes) {
    const entry = findNearest(midi, m.notes)
    if (entry && !seen.has(entry.file)) {
      seen.add(entry.file)
      needed.push(entry)
    }
  }
  await Promise.all(needed.map(e => getAudioBuffer(ctx, dir, e).catch(() => {})))
}

export async function preloadAllSampledSounds(ctx: BaseAudioContext): Promise<void> {
  await Promise.all(
    (Object.keys(SAMPLE_DIR) as BassSound[]).map(s => preloadSamples(ctx, s))
  )
}

export async function warmOfflineContext(ctx: BaseAudioContext, sound: BassSound): Promise<void> {
  await preloadSamples(ctx, sound)
}

export function scheduleSampledNote(
  ctx: BaseAudioContext, dest: AudioNode,
  sound: BassSound, midi: number, startTime: number, durationSec: number, velocity: number,
): void {
  const dir = SAMPLE_DIR[sound]
  if (dir) doScheduleByDir(ctx, dest, dir, midi, startTime, durationSec, velocity).catch(() => {})
}

export async function scheduleSampledNoteAsync(
  ctx: BaseAudioContext, dest: AudioNode,
  sound: BassSound, midi: number, startTime: number, durationSec: number, velocity: number,
): Promise<void> {
  const dir = SAMPLE_DIR[sound]
  if (dir) await doScheduleByDir(ctx, dest, dir, midi, startTime, durationSec, velocity)
}

// Used by the chord-progression audio engine (dir = 'modo' | 'slap' | 'finger' | 'muted')
export function scheduleSampledNoteByDir(
  ctx: BaseAudioContext, dest: AudioNode,
  dir: string, midi: number, startTime: number, durationSec: number, velocity: number,
): void {
  doScheduleByDir(ctx, dest, dir, midi, startTime, durationSec, velocity).catch(() => {})
}

export async function scheduleSampledNoteByDirAsync(
  ctx: BaseAudioContext, dest: AudioNode,
  dir: string, midi: number, startTime: number, durationSec: number, velocity: number,
): Promise<void> {
  await doScheduleByDir(ctx, dest, dir, midi, startTime, durationSec, velocity)
}

/**
 * Precarga SOLO las muestras necesarias para unas notas MIDI concretas.
 *
 * Es el equivalente por directorio de preloadSamplesForMidis, que ya usaba el bass tab
 * player. El motor de acordes usaba preloadSampleDir, que se traga el banco entero: 30 notas
 * y unos 20 MB antes de la primera nota. Ver engine/preloadPlan.ts.
 *
 * Se mapea cada nota a su muestra más cercana con la misma funcion que usa la reproduccion,
 * asi que el conjunto descargado es exactamente el que se va a tocar.
 */
export async function preloadSampleDirForMidis(
  ctx: BaseAudioContext, dir: string, midiNotes: number[],
): Promise<void> {
  const m = await getManifest(dir)
  if (!m) return
  const wanted = new Map<string, SampleEntry>()
  for (const midi of midiNotes) {
    const entry = findNearest(midi, m.notes)
    if (entry) wanted.set(entry.file, entry)
  }
  await Promise.all([...wanted.values()].map(e => getAudioBuffer(ctx, dir, e).catch(() => {})))
}

export async function preloadSampleDir(ctx: BaseAudioContext, dir: string): Promise<void> {
  const m = await getManifest(dir)
  if (!m) return
  await Promise.all(Object.values(m.notes).map(e => getAudioBuffer(ctx, dir, e).catch(() => {})))
}

async function doScheduleByDir(
  ctx: BaseAudioContext, dest: AudioNode,
  dir: string, targetMidi: number, startTime: number, durationSec: number, velocity: number,
): Promise<void> {
  // Cada await de aquí abajo es una ventana en la que puede llegar un Stop. Si llega, esta
  // nota ya no debe sonar: crear su fuente ahora sería crearla después de haberlo parado
  // todo. Solo aplica al contexto en vivo — un render offline no se para nunca.
  const generation = stopGeneration
  const aborted = () => stopGeneration !== generation

  const m = await getManifest(dir)
  if (!m || aborted()) return
  const entry = findNearest(targetMidi, m.notes)
  if (!entry) return
  const buf = await getAudioBuffer(ctx, dir, entry)
  if (!buf || aborted()) return

  const source = ctx.createBufferSource()
  source.buffer = buf
  source.playbackRate.value = (440 * 2 ** ((targetMidi - 69) / 12)) / entry.freq

  const gain      = ctx.createGain()
  const attackSec = 0.006
  const endTime   = startTime + durationSec
  // Short release so staccato notes cut cleanly; max 40ms
  const relSec    = Math.min(0.04, durationSec * 0.15)
  const relStart  = Math.max(startTime + attackSec, endTime - relSec)

  gain.gain.setValueAtTime(0, startTime)
  gain.gain.linearRampToValueAtTime(velocity, startTime + attackSec)
  gain.gain.setValueAtTime(velocity, relStart)
  gain.gain.linearRampToValueAtTime(0, endTime)

  source.connect(gain)
  gain.connect(dest)

  activeSources.add(source)
  source.addEventListener('ended', () => activeSources.delete(source))

  source.start(startTime)
  source.stop(endTime + 0.005)
}
