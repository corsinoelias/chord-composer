// Page side of the lab: loads the engine into an AudioWorklet and talks to it by message.
// Nothing here is on the audio path — the page could freeze (see "Atascar la interfaz")
// and the worklet would keep playing.

const $ = (id) => document.getElementById(id);
const SONGS = [
  // What wg_demo_song(0/1) arranges, for showing which chord is sounding.
  [['D', 'A', 'Bm', 'G'], ['G', 'A', 'F♯m', 'Bm']],
  [['Am', 'F', 'C', 'G'], ['F', 'G', 'Am', 'Am']],
];
const SECTIONS = ['Verso', 'Coro'];

let ctx = null;
let node = null;
let song = 0;
let playing = false;
let stressTimer = null;
const muted = [false, false, false, false];

function showError(message) {
  $('error').hidden = false;
  $('error').textContent = message;
}

async function load() {
  $('load').disabled = true;
  $('load').textContent = 'Cargando…';
  const began = performance.now();
  try {
    ctx = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
    const [, wasm, sf2, ...drums] = await Promise.all([
      ctx.audioWorklet.addModule('./worklet.js'),
      fetch('./engine.wasm').then((r) => r.arrayBuffer()),
      fetch('./core.sf2').then((r) => r.arrayBuffer()),
      ...['kick', 'snare', 'stick', 'hat', 'hatopen', 'crash'].map((n) =>
        fetch(`./drums/${n}.pcm`).then((r) => r.arrayBuffer()).then((b) => [n, b])),
    ]);
    node = new AudioWorkletNode(ctx, 'app-engine', { numberOfInputs: 0, outputChannelCount: [2] });
    node.connect(ctx.destination);
    const ready = new Promise((resolve, reject) => {
      node.port.onmessage = ({ data }) => {
        if (data.type === 'ready') resolve(data);
        else if (data.type === 'error') reject(new Error(data.message));
        else onStatus(data);
      };
    });
    const drumMap = Object.fromEntries(drums);
    node.port.postMessage({ type: 'init', wasm, sf2, drums: drumMap }, [wasm, sf2, ...Object.values(drumMap)]);
    const info = await ready;
    node.port.onmessage = ({ data }) => (data.type === 'status' ? onStatus(data) : data.type === 'error' && showError(data.message));
    $('startup').textContent = `${Math.round(performance.now() - began)} ms`;
    $('rate').textContent = `${(info.rate / 1000).toFixed(1)} kHz`;
    if (info.rate !== 48000) showError(`El navegador abrió el audio a ${info.rate} Hz, no a 48 kHz: la batería puede sonar desafinada.`);
    const latency = (ctx.outputLatency || 0) + (ctx.baseLatency || 0);
    $('latency').textContent = latency ? `${Math.round(latency * 1000)} ms` : '—';
    $('loadCard').hidden = true;
    for (const id of ['player', 'nowCard', 'stressCard', 'statsCard']) $(id).hidden = false;
  } catch (error) {
    showError(`No se pudo cargar: ${error.message}`);
    $('load').disabled = false;
    $('load').textContent = 'Reintentar';
  }
}

function onStatus(s) {
  if (s.playing !== playing) {
    playing = s.playing;
    $('playIcon').innerHTML = playing ? '<rect x="6" y="6" width="12" height="12" rx="2"/>' : '<path d="M8 5v14l11-7z"/>';
  }
  $('loadPct').textContent = `${(s.load * 100).toFixed(1)} %`;
  $('late').textContent = String(s.engineLate);
  const stats = ctx && ctx.playoutStats;
  if (stats && 'fallbackFramesEvents' in stats) $('glitches').textContent = String(stats.fallbackFramesEvents);
  if (!playing) {
    $('where').textContent = 'Parado';
    $('chord').textContent = '—';
    for (const d of $('dots').children) d.classList.remove('on');
    return;
  }
  const p = s.position;
  const step = p & 0xff;
  const chord = (p >> 8) & 0x1f;
  const round = (p >> 13) & 0x7;
  const section = (p >> 16) & 0xff;
  const bar = (p >> 24) & 0xf;
  const countIn = (p >> 28) & 0x7;
  if (countIn > 0) {
    $('where').textContent = `Cuenta atrás · ${countIn}`;
    return;
  }
  $('where').textContent = `${SECTIONS[section] ?? '—'} · vuelta ${round + 1} de 2 · compás ${bar + 1}`;
  $('chord').textContent = SONGS[song][section]?.[chord] ?? '—';
  const beat = Math.floor((step % 16) / 4);
  [...$('dots').children].forEach((d, i) => d.classList.toggle('on', i === beat));
}

const send = (msg) => node && node.port.postMessage(msg);

$('load').addEventListener('click', load);
$('play').addEventListener('click', async () => {
  if (ctx.state !== 'running') await ctx.resume();
  send({ type: playing ? 'stop' : 'play' });
});
$('bpm').addEventListener('input', (e) => {
  $('bpmLabel').textContent = e.target.value;
  send({ type: 'bpm', value: Number(e.target.value) });
});
$('reverb').addEventListener('input', (e) => send({ type: 'reverb', value: Number(e.target.value) / 100 }));
$('metro').addEventListener('click', (e) => {
  const on = !e.currentTarget.classList.contains('on');
  e.currentTarget.classList.toggle('on', on);
  send({ type: 'metronome', value: on });
});
document.querySelectorAll('[data-song]').forEach((b) => b.addEventListener('click', () => {
  song = Number(b.dataset.song);
  document.querySelectorAll('[data-song]').forEach((x) => x.classList.toggle('on', x === b));
  send({ type: 'song', value: song });
  const bpm = song === 1 ? 92 : 95;
  $('bpm').value = bpm;
  $('bpmLabel').textContent = bpm;
  send({ type: 'bpm', value: bpm });
}));
document.querySelectorAll('[data-loop]').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('[data-loop]').forEach((x) => x.classList.toggle('on', x === b));
  send({ type: 'loop', value: Number(b.dataset.loop) });
}));
document.querySelectorAll('[data-mute]').forEach((b) => b.addEventListener('click', () => {
  const track = Number(b.dataset.mute);
  muted[track] = !muted[track];
  b.classList.toggle('on', muted[track]);
  send({ type: 'mute', track, value: muted[track] });
}));
$('stress').addEventListener('click', (e) => {
  const button = e.currentTarget;
  if (stressTimer) {
    clearInterval(stressTimer);
    stressTimer = null;
    button.classList.remove('on');
    button.textContent = 'Activar';
    return;
  }
  // 400 ms of every second the page does nothing but spin: no paint, no input, no timers.
  stressTimer = setInterval(() => {
    const until = performance.now() + 400;
    while (performance.now() < until) { /* busy */ }
  }, 1000);
  button.classList.add('on');
  button.textContent = 'Parar';
});
$('resetStats').addEventListener('click', () => send({ type: 'resetLoad' }));

// For automated checks: lets a test tap the output and read the context.
window.__lab = { get ctx() { return ctx; }, get node() { return node; } };
