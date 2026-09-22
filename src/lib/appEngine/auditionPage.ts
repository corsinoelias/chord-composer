/**
 * /lab/sounds/: the page around Audition (audition.ts). One card per track, a row per
 * candidate; the marks stay in this browser, and "Copiar resultado" hands them over as text.
 */
import { Audition, CANDIDATES } from './audition';

type Vote = 'sí' | 'no';
const STORE = 'lab-sounds-votes';
const TRACKS = [['piano', 'Piano y teclados'], ['guitar', 'Guitarra'], ['bass', 'Bajo'], ['drums', 'Batería']] as const;

const $ = (id: string) => document.getElementById(id)!;
let votes: Record<string, Vote> = {};
try { votes = JSON.parse(localStorage.getItem(STORE) ?? '{}'); } catch { /* private window: marks live for this visit */ }
const save = () => { try { localStorage.setItem(STORE, JSON.stringify(votes)); } catch { /* ignore */ } };

let audition: Audition | null = null;

function render() {
  const root = $('cards');
  root.innerHTML = '';
  for (const [track, title] of TRACKS) {
    const card = document.createElement('section');
    card.className = 'card';
    card.innerHTML = `<h2>${title}</h2>`;
    for (const c of CANDIDATES.filter((x) => x.track === track)) {
      const row = document.createElement('div');
      row.className = 'row';
      const unavailable = c.engine === 'web' && audition && !audition.hasWeb;
      row.innerHTML = `
        <button class="play" data-play="${c.id}" aria-label="Escuchar ${c.name}" ${unavailable ? 'disabled' : ''}>${audition?.playing === c.id ? '■' : '▶'}</button>
        <div class="who"><b>${c.name}</b><span>${c.source}${c.mb ? ` · ${c.mb.toString().replace('.', ',')} MB` : ''} · estudio: ${c.proposal}</span></div>
        <div class="vote">
          <button data-vote="${c.id}" data-v="sí" class="${votes[c.id] === 'sí' ? 'on yes' : ''}">Sí</button>
          <button data-vote="${c.id}" data-v="no" class="${votes[c.id] === 'no' ? 'on no' : ''}">No</button>
        </div>`;
      card.appendChild(row);
    }
    root.appendChild(card);
  }
}

$('load').addEventListener('click', async () => {
  const button = $('load') as HTMLButtonElement;
  button.disabled = true;
  try {
    audition = await Audition.open((text) => { $('status').textContent = text; });
    $('status').textContent = audition.hasWeb ? 'Listo. Toca ▶ en cada sonido.' : 'Listo, sin las grabaciones de la web (no se pudieron convertir).';
    $('loadCard').hidden = true;
    (window as unknown as { __audition: Audition }).__audition = audition;
    render();
  } catch (error) {
    $('status').textContent = (error as Error).message;
    button.disabled = false;
  }
});

$('cards').addEventListener('click', async (event) => {
  const target = (event.target as HTMLElement).closest('button');
  if (!target || !audition) return;
  const playId = target.dataset.play;
  if (playId) {
    if (audition.playing === playId) audition.stop();
    else await audition.play(CANDIDATES.find((c) => c.id === playId)!);
    render();
    return;
  }
  const id = target.dataset.vote;
  if (id) {
    const v = target.dataset.v as Vote;
    if (votes[id] === v) delete votes[id]; else votes[id] = v;
    save();
    render();
  }
});

$('stop').addEventListener('click', () => { audition?.stop(); render(); });

$('copy').addEventListener('click', async () => {
  const lines = TRACKS.map(([track, title]) => {
    const of = (v: Vote) => CANDIDATES.filter((c) => c.track === track && votes[c.id] === v).map((c) => c.name).join(', ') || '—';
    return `${title}\n  Sí: ${of('sí')}\n  No: ${of('no')}`;
  });
  const text = `Escucha de sonidos (${new Date().toLocaleDateString('es')})\n${lines.join('\n')}`;
  try { await navigator.clipboard.writeText(text); $('copied').textContent = 'Copiado.'; }
  catch { $('copied').textContent = text; }
});

render();
