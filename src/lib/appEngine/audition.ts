/**
 * The sound audition (/lab/sounds/, docs/sonidos-comunes.md): every candidate for the shared
 * sound list playing the same few bars, alone, on the app's engine, to mark yes or no by ear.
 *
 * Two engines: one on the app's SoundFont programs (public/lab/sounds/audition.sf2, from
 * `npm run lab:audition`) and the app's synthesised timbres and drum kits, and one on the web's
 * own recordings (public/audio/), turned into a SoundFont here in the browser at the pitch they
 * really sound — so both go through the same voices, envelopes and mix.
 */
import { AppEngine } from './host';
import { DEGREE, DRUM_ROWS, SAMPLED_FIRST, TIMBRE, packStep, type EngineCommand, type MelodicTrack } from './commands';
import { writeSf2, type Sf2Preset, type Sf2Sample } from './sf2Writer';

type Track = MelodicTrack | 'drums';
type Source = 'SoundFont' | 'Grabación web' | 'Sintetizado' | 'Kit grabado' | 'Kit sintetizado';

interface Candidate {
  id: string;
  track: Track;
  name: string;
  source: Source;
  /** Megabytes it adds to what a page downloads, where that is known. */
  mb?: number;
  engine: 'gm' | 'web';
  timbre?: number;
  program?: number;
  kit?: number;
  /** What the study proposes (docs/sonidos-comunes.md), shown as a hint. */
  proposal: 'sí' | 'no' | 'opcional';
}

const gm = (track: MelodicTrack, name: string, program: number, mb: number, proposal: Candidate['proposal']): Candidate =>
  ({ id: `gm-${program}`, track, name, source: 'SoundFont', mb, engine: 'gm', timbre: TIMBRE.sampled, program, proposal });
const synth = (track: MelodicTrack, name: string, timbre: number, proposal: Candidate['proposal']): Candidate =>
  ({ id: `syn-${track}-${timbre}`, track, name, source: 'Sintetizado', engine: 'gm', timbre, proposal });
const web = (track: MelodicTrack, name: string, program: number, mb: number): Candidate =>
  ({ id: `web-${program}`, track, name, source: 'Grabación web', mb, engine: 'web', timbre: TIMBRE.sampled, program, proposal: 'opcional' });

export const CANDIDATES: Candidate[] = [
  gm('piano', 'Grand Piano', 0, 2.08, 'sí'),
  gm('piano', 'Bright Piano', 1, 0, 'sí'),
  gm('piano', 'E-Piano (Tine)', 4, 0.36, 'sí'),
  gm('piano', 'Rhodes', 5, 0.36, 'sí'),
  gm('piano', 'Órgano (Drawbar)', 16, 0.04, 'sí'),
  gm('piano', 'Honky-Tonk', 3, 2.28, 'no'),
  gm('piano', 'Cuerdas', 48, 2.34, 'opcional'),
  gm('piano', 'Pad cálido', 89, 2.34, 'opcional'),
  synth('piano', 'Organ (sint.)', 3, 'no'),
  synth('piano', 'Pad (sint.)', 4, 'no'),
  synth('piano', 'Sine', 0, 'no'),
  synth('piano', 'FM', 1, 'no'),
  web('piano', 'Piano de la web', 0, 2.5),

  gm('guitar', 'Steel (acústica)', 25, 0.39, 'sí'),
  gm('guitar', 'Nylon', 24, 0.40, 'sí'),
  gm('guitar', 'Clean (eléctrica)', 27, 0.52, 'sí'),
  gm('guitar', 'Jazz', 26, 0.28, 'sí'),
  gm('guitar', 'Muted', 28, 0.05, 'sí'),
  gm('guitar', 'Overdrive', 29, 0.85, 'sí'),
  gm('guitar', 'Distortion', 30, 0.80, 'no'),
  gm('guitar', 'Harmonics', 31, 0.04, 'no'),
  synth('guitar', 'Overdrive (sint.)', 9, 'no'),
  synth('guitar', 'Muted (sint.)', 7, 'no'),
  synth('guitar', 'Pluck', 6, 'no'),
  synth('guitar', 'Saw', 5, 'no'),
  web('guitar', 'Acústica de la web', 5, 4.8),
  web('guitar', 'Eléctrica de la web', 6, 1.8),
  web('guitar', 'Nylon de la web', 7, 2.3),

  gm('bass', 'Finger', 33, 0.10, 'sí'),
  gm('bass', 'Pick', 34, 0.15, 'sí'),
  gm('bass', 'Slap', 36, 0.09, 'sí'),
  gm('bass', 'Upright (contrabajo)', 32, 0.07, 'sí'),
  gm('bass', 'Fretless', 35, 0.13, 'sí'),
  synth('bass', 'Sub', 10, 'sí'),
  synth('bass', 'Reese', 11, 'no'),
  synth('bass', 'Square', 12, 'no'),
  web('bass', 'Fender de la web', 1, 1.4),
  web('bass', 'Finger de la web', 2, 1.4),
  web('bass', 'Slap de la web', 3, 1.4),
  web('bass', 'Muted de la web', 4, 1.4),

  ...['Synth', '808'].map((name, kit): Candidate => ({ id: `kit-${kit}`, track: 'drums', name, source: 'Kit sintetizado', engine: 'gm', kit, proposal: 'no' })),
  ...['Acoustic', 'Acoustic 2', 'Electronic', 'AP1', 'Brutalist', 'Chase', 'Run It'].map((name, i): Candidate =>
    ({ id: `kit-${i + 2}`, track: 'drums', name, source: 'Kit grabado', engine: 'gm', kit: i + 2, proposal: 'sí' })),
];

// ── The fragment: C – Am – F – G, one bar each, at 92 BPM ──

const CHORDS: [string, string][] = [['C', 'maj'], ['A', 'min'], ['F', 'maj'], ['G', 'maj']];
/** Where each track sits, the app's defaults (defaultVoicings in audio_engine.dart). */
const LOW: Record<MelodicTrack, number> = { piano: 60, guitar: 55, bass: 40 };

function fragment(c: Candidate, e: AppEngine): EngineCommand[] {
  const cmds: EngineCommand[] = [
    ['setBpm', 92], ['setMeter', 16, 4], ['setSwing', 1],
    ['beginArrangement', 1], ['section', 0, 1, false, CHORDS.length],
    ...CHORDS.map(([root, q], i): EngineCommand => ['chord', 0, i, root, q, 8, -1]),
    ['commitArrangement'],
  ];
  for (const t of ['drums', 'piano', 'guitar', 'bass'] as const) {
    cmds.push(['clearTrack', 0, t], ['setPatternBars', 0, t, 1], ['setSilence', 0, t, t !== c.track]);
    cmds.push(['mixer', t, t === c.track ? 0.85 : 0, t !== c.track], ['pan', t, 0]);
  }
  cmds.push(['mixer', 'master', 1, false], ['reverb', 0.7, 0], ['metronome', false, 0.7, SAMPLED_FIRST + 36, true, 1]);
  const step = (track: Track, at: number, v: number, degree: number = DEGREE.chord, row = '') => cmds.push(['setStep', 0, track, row, at, packStep(v, degree)]);

  if (c.track === 'drums') {
    const kit = e.kits[c.kit ?? 2];
    for (const row of DRUM_ROWS) if (kit?.rows[row] !== undefined) cmds.push(['setDrumSound', 0, row, kit.rows[row]]);
    for (const at of [0, 8, 10]) step('drums', at, at === 10 ? 150 : 230, DEGREE.chord, 'kick');
    for (const at of [4, 12]) step('drums', at, 220, DEGREE.chord, 'snare');
    for (let at = 0; at < 16; at += 2) step('drums', at, at % 4 === 0 ? 170 : 110, DEGREE.chord, at === 14 ? 'hihatOpen' : 'hihat');
    // A tom fill into each fourth bar, so the toms and the crash after it are heard too.
    const fill = new Array(DRUM_ROWS.length * 20).fill(0);
    const put = (row: string, at: number, v: number) => { fill[DRUM_ROWS.indexOf(row as never) * 20 + at] = packStep(v); };
    put('tom1', 12, 220); put('tom1', 13, 200); put('tom2', 14, 210); put('floorTom', 15, 230);
    const mask = ['tom1', 'tom2', 'floorTom', 'snare', 'hihat', 'hihatOpen'].reduce((m, r) => m | (1 << DRUM_ROWS.indexOf(r as never)), 0);
    cmds.push(['setFill', 0, 12, mask, fill]);
    return cmds;
  }

  cmds.push(['setFill', 0, 0, 0, []]);
  const t = c.track;
  cmds.push(['setTimbre', 0, t, c.timbre ?? TIMBRE.sampled]);
  if (c.program !== undefined) cmds.push(['setProgram', 0, t, c.program]);
  cmds.push(['voicing', 0, t, LOW[t], LOW[t] + 23]);
  if (t === 'piano') {
    cmds.push(['setNoteLength', 0, t, 0]);
    step(t, 0, 200); step(t, 8, 160); step(t, 14, 120);
  } else if (t === 'guitar') {
    cmds.push(['setNoteLength', 0, t, 2]);
    for (let at = 0; at < 16; at += 2) step(t, at, at % 4 === 0 ? 200 : 135);
  } else {
    cmds.push(['setNoteLength', 0, t, 3]);
    step(t, 0, 230, DEGREE.root); step(t, 6, 150, DEGREE.root); step(t, 8, 200, DEGREE.fifth);
    step(t, 12, 180, DEGREE.octave); step(t, 14, 140, DEGREE.fifth);
  }
  return cmds;
}

// ── The web's recordings as a SoundFont ──

const LETTER: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** "Cs3" / "A2" → MIDI. */
const noteMidi = (name: string) => {
  const m = name.match(/^([A-G])(s?)(\d)$/);
  return m ? (Number(m[3]) + 1) * 12 + LETTER[m[1]] + (m[2] ? 1 : 0) : NaN;
};
const GUITAR_FILES: Record<string, string[]> = {
  acoustic: ['A2', 'A3', 'A4', 'As2', 'As3', 'As4', 'B2', 'B3', 'B4', 'C3', 'C4', 'C5', 'Cs3', 'Cs4', 'D3', 'D4', 'Ds3', 'Ds4', 'E2', 'E3', 'E4', 'F3', 'F4', 'Fs3', 'Fs4', 'G3', 'G4', 'Gs3', 'Gs4'],
  electric: ['A2', 'A3', 'A4', 'A5', 'C3', 'C4', 'C5', 'C6', 'Cs2', 'Ds3', 'Ds4', 'Ds5', 'E2', 'Fs2', 'Fs3', 'Fs4', 'Fs5'],
  nylon: ['A2', 'A3', 'A4', 'A5', 'As5', 'B1', 'B2', 'B3', 'B4', 'Cs3', 'Cs4', 'Cs5', 'D2', 'D3', 'D5', 'E2', 'E3', 'E4', 'E5', 'Fs2', 'Fs3', 'Fs4', 'Fs5', 'G3', 'G5', 'Gs2', 'Gs4', 'Gs5'],
};
/** Longer is a sustain nobody holds in a few bars, and the file would weigh tens of MB. */
const MAX_SECONDS = 4;
/** The peak every converted recording set is brought to. */
const NORMALISED_PEAK = 0.9;

async function decode(ctx: BaseAudioContext, url: string, midi: number): Promise<Sf2Sample | null> {
  try {
    const buf = await ctx.decodeAudioData(await (await fetch(url)).arrayBuffer());
    const frames = Math.min(buf.length, Math.round(MAX_SECONDS * buf.sampleRate));
    const pcm = new Float32Array(frames);
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < frames; i++) pcm[i] += data[i] / buf.numberOfChannels;
    }
    const fade = Math.min(frames, Math.round(0.05 * buf.sampleRate));
    for (let i = 0; i < fade; i++) pcm[frames - 1 - i] *= i / fade;
    return { midi, pcm, rate: buf.sampleRate };
  } catch {
    return null;
  }
}

export async function buildWebFont(onProgress: (text: string) => void): Promise<ArrayBuffer> {
  const ctx = new OfflineAudioContext(1, 1, 48000);
  const presets: Sf2Preset[] = [];
  const take = async (name: string, program: number, jobs: Promise<Sf2Sample | null>[]) => {
    onProgress(`Convirtiendo ${name}…`);
    const samples = (await Promise.all(jobs)).filter((s): s is Sf2Sample => !!s);
    // Each set to the same peak: the recordings were made at their own levels (the piano about a
    // third of the SoundFont's), and louder always sounds better when comparing.
    const peak = Math.max(1e-6, ...samples.map((x) => x.pcm.reduce((m, v) => Math.max(m, Math.abs(v)), 0)));
    for (const x of samples) for (let i = 0; i < x.pcm.length; i++) x.pcm[i] *= NORMALISED_PEAK / peak;
    presets.push({ name, program, releaseSeconds: 0.12, samples });
  };
  // Piano: /audio/piano/1..88 = MIDI 21..108, every second one (the rest are a semitone away).
  await take('Web piano', 0, Array.from({ length: 44 }, (_, k) => decode(ctx, `/audio/piano/${1 + 2 * k}.mp3`, 21 + 2 * k)));
  // Basses: their files are named an octave above the note they sound (measured 2026-09-22).
  for (const [program, dir] of [[1, 'modo'], [2, 'finger'], [3, 'slap'], [4, 'muted']] as const) {
    const manifest = await (await fetch(`/audio/bass/${dir}/manifest.json`)).json() as { notes?: Record<string, { file: string }> } & Record<string, { file: string }>;
    const notes = manifest.notes ?? manifest;
    await take(`Web bass ${dir}`, program, Object.entries(notes).map(([label, n]) => decode(ctx, `/audio/bass/${dir}/${n.file}`, Number(label) - 12)));
  }
  for (const [program, dir] of [[5, 'acoustic'], [6, 'electric'], [7, 'nylon']] as const) {
    await take(`Web guitar ${dir}`, program, GUITAR_FILES[dir].map((f) => decode(ctx, `/audio/guitar/${dir}/${f}.mp3`, noteMidi(f))));
  }
  onProgress('Montando el SoundFont…');
  return writeSf2(presets, 'Web recordings');
}

// ── Playing ──

export class Audition {
  private constructor(readonly gmEngine: AppEngine, readonly webEngine: AppEngine | null) {}
  playing: string | null = null;

  static async open(onProgress: (text: string) => void): Promise<Audition> {
    onProgress('Cargando los sonidos del SoundFont…');
    const res = await fetch('/lab/sounds/audition.sf2');
    if (!res.ok) throw new Error('Falta public/lab/sounds/audition.sf2: ejecuta npm run lab:audition');
    const gmEngine = await AppEngine.start({ sf2: await res.arrayBuffer(), slots: Array.from({ length: 46 }, (_, i) => i) });
    let webEngine: AppEngine | null = null;
    try {
      webEngine = await AppEngine.start({ sf2: await buildWebFont(onProgress) });
    } catch (error) {
      console.warn('[audition] web recordings unavailable', error);
    }
    return new Audition(gmEngine, webEngine);
  }

  get hasWeb(): boolean { return !!this.webEngine; }

  async play(c: Candidate): Promise<void> {
    this.stop();
    const e = c.engine === 'web' ? this.webEngine : this.gmEngine;
    if (!e) return;
    if (c.track === 'drums') {
      const kit = e.kits[c.kit ?? 2];
      await e.ensureSlots(Object.values(kit?.rows ?? {}).filter((s) => s >= SAMPLED_FIRST).map((s) => s - SAMPLED_FIRST));
    }
    e.load(fragment(c, e));
    await e.play();
    this.playing = c.id;
  }

  stop(): void {
    this.gmEngine.stop();
    this.webEngine?.stop();
    this.playing = null;
  }
}
