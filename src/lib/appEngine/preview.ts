/**
 * Previews on the app's engine: a chord tapped or held, a single note, one piece of the kit,
 * and the analyser the mixer's meters read. The same functions, names and arguments the
 * web engine offered (src/lib/audioEngine.ts, removed 2026-09-22), so a caller only changes
 * where it imports them from.
 *
 * Previews sound on engine section 31, which no song uses (fromSong.ts keeps songs to
 * 0-29 and a single pass's silent bar to 30): its piano is the grand, one octave from C4,
 * and its kit the app's acoustic one. They share the engine's piano channel with a song,
 * so one struck while a song plays lets go of the song's piano notes — as tapping a key on
 * a real piano would.
 */
import { type Chord } from '../musicTheory';
import soundCatalog from '../../../shared/catalog/sounds.json';
import { DRUM_ROWS, SAMPLED_FIRST, type DrumRow, type EngineCommand } from './commands';
import { engineChord } from './fromSong';
import { type AppEngine } from './host';
import { getAppEngine, startedAppEngine } from './player';

const PREVIEW = 31;
const DEFAULT_KIT = 2;
/** How long a tapped chord and a tapped note ring, as the web engine's previews did. */
const CHORD_SECONDS = 1.2;
const NOTE_SECONDS = 0.45;

/** The web's drum piece names, where they differ from the engine's rows. */
const ROW_OF: Record<string, DrumRow> = { snareStick: 'rim' };

let prepared: Promise<AppEngine> | null = null;
/** The engine, with the preview section's sounds in place. From a tap: it may open the audio. */
function ready(): Promise<AppEngine> {
  prepared ??= getAppEngine().then(async (e) => {
    e.send([
      ['setTimbre', PREVIEW, 'piano', 13], ['setProgram', PREVIEW, 'piano', 0],
      ['voicing', PREVIEW, 'piano', 60, 83], ['setNoteLength', PREVIEW, 'piano', 0],
    ]);
    await setKit(e, DEFAULT_KIT);
    return e;
  }).catch((error) => {
    prepared = null;
    throw error;
  });
  return prepared;
}

let kitOnPreview = -1;
async function setKit(e: AppEngine, index: number): Promise<void> {
  if (index === kitOnPreview) return;
  const kit = e.kits[index] ?? e.kits[DEFAULT_KIT];
  if (!kit) return;
  kitOnPreview = index;
  const commands: EngineCommand[] = [];
  const slots: number[] = [];
  for (const row of DRUM_ROWS) {
    const sound = kit.rows[row];
    if (sound === undefined) continue;
    commands.push(['setDrumSound', PREVIEW, row, sound]);
    if (sound >= SAMPLED_FIRST) slots.push(sound - SAMPLED_FIRST);
  }
  await e.ensureSlots(slots);
  e.send(commands);
}

/** With nothing playing, the preview sets the piano's level; a playing song keeps its mix. */
function level(e: AppEngine, volume: number): EngineCommand[] {
  if (e.state?.playing) return [];
  return [['mixer', 'piano', Math.max(0, Math.min(1, volume * 1.6)), false]];
}

let releaseTimer: ReturnType<typeof setTimeout> | null = null;
function releaseAfter(e: AppEngine, seconds: number): void {
  if (releaseTimer) clearTimeout(releaseTimer);
  releaseTimer = setTimeout(() => { releaseTimer = null; e.send([['previewOff', 'piano']]); }, seconds * 1000);
}

function strike(e: AppEngine, chord: Chord, volume: number): void {
  const { root, quality, bass } = engineChord(chord);
  if (e.ctx.state !== 'running') void e.ctx.resume();
  e.send([...level(e, volume), ['previewChord', PREVIEW, root, quality, bass, 'piano']]);
}

/** A chord, rung briefly: a tap on a chord name. */
export function playChordPreview(chord: Chord, volume = 0.5): void {
  ready().then((e) => { strike(e, chord, volume); releaseAfter(e, CHORD_SECONDS); }).catch(() => {});
}

/** A chord held until the returned function is called: press-and-hold. */
export function playChordHold(chord: Chord, volume = 0.5): () => void {
  let released = false;
  let engine: AppEngine | null = null;
  ready().then((e) => {
    engine = e;
    if (released) return;
    if (releaseTimer) { clearTimeout(releaseTimer); releaseTimer = null; }
    strike(e, chord, volume);
  }).catch(() => {});
  return () => {
    released = true;
    engine?.send([['previewOff', 'piano']]);
  };
}

/** One piano note (MIDI): a cell of the melodic grid. */
export function previewNote(midi: number, volume = 0.5): void {
  ready().then((e) => {
    if (e.ctx.state !== 'running') void e.ctx.resume();
    e.send([...level(e, volume), ['previewNote', PREVIEW, 'piano', midi, 1]]);
    releaseAfter(e, NOTE_SECONDS);
  }).catch(() => {});
}

type CatalogDrums = { sounds: { id: string; app?: { kit?: number } }[]; legacy?: Record<string, { kit?: number }> };
const drumCatalog = (soundCatalog as unknown as { drums: CatalogDrums }).drums;

/** One piece of the kit, on the kit a drum sound maps to: a cell of the rhythm grid. */
export function previewDrumHit(drumType: string, soundTypeId = 'standard', volume = 0.8): void {
  const row = (ROW_OF[drumType] ?? drumType) as DrumRow;
  if (!DRUM_ROWS.includes(row)) return;
  ready().then(async (e) => {
    const kit = drumCatalog.sounds.find((s) => s.id === soundTypeId)?.app?.kit ?? drumCatalog.legacy?.[soundTypeId]?.kit ?? DEFAULT_KIT;
    await setKit(e, e.kits[kit] ? kit : DEFAULT_KIT);
    if (e.ctx.state !== 'running') void e.ctx.resume();
    const mix: EngineCommand[] = e.state?.playing ? [] : [['mixer', 'drums', Math.max(0, Math.min(1, volume)), false]];
    e.send([...mix, ['previewDrum', PREVIEW, row]]);
  }).catch(() => {});
}

let analyser: AnalyserNode | null = null;
/** An analyser on the engine's output, for meters and the waveform; null until it has started. */
export function getAnalyserNode(): AnalyserNode | null {
  const e = startedAppEngine();
  if (!e) return null;
  if (!analyser || analyser.context !== e.ctx) {
    analyser = e.ctx.createAnalyser();
    analyser.fftSize = 2048;
    e.node.connect(analyser);
  }
  return analyser;
}

/** Opens the engine ahead of a first preview, from a tap. */
export function warmPreviews(): void {
  ready().catch(() => {});
}
