/**
 * The /lab/app-engine/ page: the app's engine through the same AppEngine class the player
 * will use, with the measures that tell whether it is healthy on a given device.
 */
import { AppEngine, type EngineState } from './host';
import { demoSong } from './demoSongs';
import { sampledDrum, type EngineCommand } from './commands';
import { songToEngine } from './fromSong';
import { SONGS } from '@/data/songs';
import { MUSICAL_STYLES, getStyleById } from '../styles';
import { editorSectionsToSections, songToEditorSections } from '../editorLink';
import { formatChord } from '../musicTheory';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

let engine: AppEngine | null = null;
/** What the lab plays: one of its two test songs, or a web song through fromSong. */
interface LabSong {
  name: string;
  bpm: number;
  commands: EngineCommand[];
  sections: { name: string; chords: string[]; rounds: number }[];
  steps: number;
  drumSlots: number[];
  notes: string[];
}

let song: LabSong | null = null;
let reverb = 0.22;
let playing = false;
let stressTimer: number | null = null;
const muted = [false, false, false, false];
const TRACKS = ['drums', 'piano', 'guitar', 'bass'] as const;
const STICK = sampledDrum(2);

function showError(message: string) {
  $('error').hidden = false;
  $('error').textContent = message;
}

function onState(s: EngineState) {
  if (s.playing !== playing) {
    playing = s.playing;
    $('playIcon').innerHTML = playing ? '<rect x="6" y="6" width="12" height="12" rx="2"/>' : '<path d="M8 5v14l11-7z"/>';
    ($('measure') as HTMLButtonElement).disabled = playing;
  }
  $('drops').textContent = s.dropMs > 0 ? `${Math.round(s.dropMs)} ms (${Math.round(s.dropLongestMs)})` : '0 ms';
  if (!playing) {
    $('where').textContent = 'Parado';
    $('chord').textContent = '—';
    for (const d of Array.from($('dots').children)) d.classList.remove('on');
    return;
  }
  if (s.countInBeats > 0) {
    $('where').textContent = `Cuenta atrás · ${s.countInBeats}`;
    return;
  }
  const section = song?.sections[s.section];
  $('where').textContent = `${section?.name ?? '—'} · vuelta ${s.round + 1} de ${section?.rounds ?? 1} · compás ${s.bar + 1}`;
  $('chord').textContent = section?.chords[s.chord] ?? '—';
  const beat = Math.floor((s.step % 16) / 4);
  Array.from($('dots').children).forEach((d, i) => d.classList.toggle('on', i === beat));
  const notes = s.sounding.flat().length;
  $('notes').textContent = String(notes);
}

async function load() {
  const button = $('load') as HTMLButtonElement;
  button.disabled = true;
  button.textContent = 'Cargando…';
  const began = performance.now();
  try {
    engine = await AppEngine.start();
    engine.subscribe(onState);
    await selectSong();
    $('startup').textContent = `${Math.round(performance.now() - began)} ms`;
    $('rate').textContent = `${(engine.rate / 1000).toFixed(1)} kHz`;
    if (engine.rate !== 48000) showError(`El navegador abrió el audio a ${engine.rate} Hz, no a 48 kHz: la batería puede sonar desafinada.`);
    const latency = (engine.ctx.outputLatency || 0) + (engine.ctx.baseLatency || 0);
    $('latency').textContent = latency ? `${Math.round(latency * 1000)} ms` : '—';
    $('loadCard').hidden = true;
    for (const id of ['player', 'nowCard', 'stressCard', 'statsCard', 'exportCard']) $(id).hidden = false;
  } catch (error) {
    showError(`No se pudo cargar: ${(error as Error).message}`);
    button.disabled = false;
    button.textContent = 'Reintentar';
  }
}

function buildSong(choice: string, styleId: string): LabSong {
  if (choice.startsWith('demo:')) {
    const demo = demoSong(Number(choice.slice(5)) as 0 | 1);
    return { ...demo, sections: demo.sections.map((x) => ({ ...x, rounds: 2 })), drumSlots: [], notes: [] };
  }
  const web = SONGS[Number(choice.slice(5))];
  const style = getStyleById(styleId) ?? MUSICAL_STYLES[0];
  const sections = editorSectionsToSections(songToEditorSections(web));
  const result = songToEngine({ sections, bpm: web.bpm }, style, (id) => getStyleById(id), engine!.kits);
  return {
    name: web.title,
    bpm: web.bpm,
    commands: result.commands,
    sections: sections.map((x) => ({ name: x.name, chords: x.chords.map(formatChord), rounds: Math.max(1, x.repeatCount) })),
    steps: result.steps,
    drumSlots: result.drumSlots,
    notes: result.notes,
  };
}

async function selectSong() {
  if (!engine) return;
  const wasPlaying = playing;
  const choice = ($('song') as HTMLSelectElement).value;
  ($('style') as HTMLSelectElement).disabled = choice.startsWith('demo:');
  song = buildSong(choice, ($('style') as HTMLSelectElement).value);
  if (wasPlaying) engine.stop();
  await engine.ensureSlots(song.drumSlots);
  engine.load(song.commands);
  const metro = $('metro').classList.contains('on');
  engine.send([['reverb', 0.5, reverb], ['metronome', metro, 0.7, STICK, true, 1]]);
  muted.fill(false);
  document.querySelectorAll('[data-mute]').forEach((x) => x.classList.remove('on'));
  ($('bpm') as HTMLInputElement).value = String(song.bpm);
  $('bpmLabel').textContent = String(song.bpm);
  $('songNotes').hidden = !song.notes.length;
  $('songNotes').textContent = song.notes.join(' · ');
  renderLoops();
  (window as unknown as { __song: unknown }).__song = song;
  if (wasPlaying) engine.play();
}

function renderLoops() {
  const row = $('loops');
  row.querySelectorAll('button').forEach((b) => b.remove());
  const add = (label: string, index: number) => {
    const b = document.createElement('button');
    b.className = `cap${index < 0 ? ' on' : ''}`;
    b.textContent = label;
    b.addEventListener('click', () => {
      row.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      engine?.send([['loopOnly', index]]);
    });
    row.appendChild(b);
  };
  add('Todo', -1);
  song?.sections.forEach((x, i) => add(x.name, i));
}

function fillPickers() {
  const songs = $('song') as HTMLSelectElement;
  const web = document.createElement('optgroup');
  web.label = 'Canciones de la web';
  SONGS.forEach((x, i) => web.appendChild(new Option(`${x.title} · ${x.artist}`, `song:${i}`)));
  const demos = document.createElement('optgroup');
  demos.label = 'Pruebas del laboratorio';
  demos.append(new Option('Pop (a mano)', 'demo:0'), new Option('Reggaeton (a mano)', 'demo:1'));
  songs.append(web, demos);
  const styles = $('style') as HTMLSelectElement;
  MUSICAL_STYLES.forEach((x) => styles.appendChild(new Option(x.name, x.id)));
  styles.value = 'reggaeton';
}

async function exportWav() {
  if (!engine) return;
  const button = $('export') as HTMLButtonElement;
  button.disabled = true;
  $('exportInfo').textContent = 'Renderizando…';
  try {
    const began = performance.now();
    if (!song) return;
    const result = await engine.exportWav(song.steps, 3);
    const total = performance.now() - began;
    const seconds = result.frames / 48000;
    $('exportInfo').textContent = `${seconds.toFixed(1)} s de canción en ${(result.ms / 1000).toFixed(2)} s de render (${(total / 1000).toFixed(2)} s en total, ${(seconds / (result.ms / 1000)).toFixed(0)}× tiempo real) · ${(result.blob.size / 1048576).toFixed(1)} MB`;
    const link = $('download') as HTMLAnchorElement;
    if (link.href) URL.revokeObjectURL(link.href);
    link.href = URL.createObjectURL(result.blob);
    link.download = `motor-app-${song.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.wav`;
    link.hidden = false;
    (window as unknown as { __lastExport: unknown }).__lastExport = { ...result, size: result.blob.size, total };
  } catch (error) {
    $('exportInfo').textContent = `Error: ${(error as Error).message}`;
  } finally {
    button.disabled = false;
  }
}

$('load').addEventListener('click', load);
$('play').addEventListener('click', () => {
  if (!engine) return;
  if (playing) engine.stop();
  else engine.play();
});
$('bpm').addEventListener('input', (e) => {
  const value = Number((e.target as HTMLInputElement).value);
  $('bpmLabel').textContent = String(value);
  engine?.send([['setBpm', value]]);
});
$('reverb').addEventListener('input', (e) => {
  reverb = Number((e.target as HTMLInputElement).value) / 100;
  engine?.send([['reverb', 0.5, reverb]]);
});
$('metro').addEventListener('click', (e) => {
  const button = e.currentTarget as HTMLElement;
  const on = !button.classList.contains('on');
  button.classList.toggle('on', on);
  engine?.send([['metronome', on, 0.7, STICK, true, 1]]);
});
fillPickers();
$('song').addEventListener('change', () => void selectSong());
$('style').addEventListener('change', () => void selectSong());
document.querySelectorAll<HTMLElement>('[data-mute]').forEach((b) => b.addEventListener('click', () => {
  const track = Number(b.dataset.mute);
  muted[track] = !muted[track];
  b.classList.toggle('on', muted[track]);
  engine?.send([['mixer', TRACKS[track], 0.9, muted[track]]]);
}));
$('stress').addEventListener('click', (e) => {
  const button = e.currentTarget as HTMLElement;
  if (stressTimer !== null) {
    clearInterval(stressTimer);
    stressTimer = null;
    button.classList.remove('on');
    button.textContent = 'Activar';
    return;
  }
  // 400 ms of every second the page does nothing but spin: no paint, no input, no timers.
  stressTimer = window.setInterval(() => {
    const until = performance.now() + 400;
    while (performance.now() < until) { /* busy */ }
  }, 1000);
  button.classList.add('on');
  button.textContent = 'Parar';
});
$('resetStats').addEventListener('click', () => engine?.resetDrops());
$('measure').addEventListener('click', async () => {
  if (!engine || playing) return;
  $('loadPct').textContent = 'midiendo…';
  const r = await engine.bench(3000);
  $('loadPct').textContent = `${(r.load * 100).toFixed(1)} %`;
});
$('export').addEventListener('click', exportWav);

// For the phone scripts in lab/app-engine/phone/: the context, the node, and the flight recorder.
(window as unknown as { __lab: unknown }).__lab = {
  get ctx() { return engine?.ctx; },
  get node() { return engine?.node; },
  get engine() { return engine; },
  dump: () => engine?.history(),
};
