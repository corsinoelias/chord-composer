/**
 * The lab's two test songs, written the way any song reaches the engine: an arrangement,
 * then each section's patterns and sounds. Phase 4 (docs/motor-unico-wasm.md) builds these
 * commands from a real web song instead.
 */
import { DEGREE, TIMBRE, packStep, sampledDrum, songSteps, type EngineCommand } from './commands';

export interface DemoSong {
  name: string;
  bpm: number;
  commands: EngineCommand[];
  /** For the page: chord names per section. */
  sections: { name: string; chords: string[] }[];
  steps: number;
}

type Chords = [root: string, type: string, label: string][];

const POP: Chords[] = [
  [['D', 'maj', 'D'], ['A', 'maj', 'A'], ['B', 'min', 'Bm'], ['G', 'maj', 'G']],
  [['G', 'maj', 'G'], ['A', 'maj', 'A'], ['F#', 'min', 'F♯m'], ['B', 'min', 'Bm']],
];
const REGGAETON: Chords[] = [
  [['A', 'min', 'Am'], ['F', 'maj', 'F'], ['C', 'maj', 'C'], ['G', 'maj', 'G']],
  [['F', 'maj', 'F'], ['G', 'maj', 'G'], ['A', 'min', 'Am'], ['A', 'min', 'Am']],
];
// Slots in public/engine/kit.json (the app's sampledDrumAssets).
const KIT = { kick: 0, snare: 1, stick: 2, hat: 3, hatopen: 4, crash: 11 };
const LOOPS = 2;
const HALF_BEATS = 8; // every chord lasts a bar of 4/4

export function demoSong(style: 0 | 1): DemoSong {
  const song = style === 1 ? REGGAETON : POP;
  const bpm = style === 1 ? 92 : 95;
  const c: EngineCommand[] = [['setBpm', bpm], ['setMeter', 16, 4], ['beginArrangement', 2]];
  song.forEach((chords, s) => {
    c.push(['section', s, LOOPS, false, chords.length]);
    chords.forEach(([root, type], i) => c.push(['chord', s, i, root, type, HALF_BEATS, -1]));
  });
  c.push(['commitArrangement']);

  for (let s = 0; s < 2; s++) {
    c.push(['clearTrack', s, 'drums']);
    for (const t of ['piano', 'guitar', 'bass'] as const) c.push(['clearTrack', s, t], ['setTimbre', s, t, TIMBRE.sampled]);
    c.push(
      ['setDrumSound', s, 'kick', sampledDrum(KIT.kick)],
      ['setDrumSound', s, 'snare', sampledDrum(KIT.snare)],
      ['setDrumSound', s, 'rim', sampledDrum(KIT.stick)],
      ['setDrumSound', s, 'hihat', sampledDrum(KIT.hat)],
      ['setDrumSound', s, 'hihatOpen', sampledDrum(KIT.hatopen)],
      ['setDrumSound', s, 'crash', sampledDrum(KIT.crash)],
    );
    const chorus = s === 1;
    for (let step = 0; step < 16; step++) {
      if (style === 1) {
        // Dembow: four on the floor, the snare on the "3 . . 6" of each half bar.
        if (step % 4 === 0) c.push(['setStep', s, 'drums', 'kick', step, packStep(230)]);
        if ([3, 6, 11, 14].includes(step)) c.push(['setStep', s, 'drums', 'snare', step, packStep(210)]);
        if (step % 2 === 0) c.push(['setStep', s, 'drums', 'hihat', step, packStep(chorus ? 170 : 120)]);
        // Tresillo stabs on the piano, the bass on the same 3-3-2.
        if ([0, 3, 6, 8, 11, 14].includes(step)) c.push(['setStep', s, 'piano', '', step, packStep(step % 8 === 0 ? 200 : 150, DEGREE.chord)]);
        if ([0, 6, 8, 14].includes(step)) c.push(['setStep', s, 'bass', '', step, packStep(220, step === 14 ? DEGREE.fifth : DEGREE.root)]);
        if (chorus && step % 4 === 2) c.push(['setStep', s, 'guitar', '', step, packStep(120, DEGREE.chord)]);
      } else {
        c.push(['setStep', s, 'drums', 'hihat', step, packStep(step % 2 === 0 ? 180 : 90)]);
        if (step % 8 === 0) c.push(['setStep', s, 'drums', 'kick', step, packStep(230)]);
        if (step % 8 === 4) c.push(['setStep', s, 'drums', 'snare', step, packStep(220)]);
        if (chorus && step === 0) c.push(['setStep', s, 'drums', 'crash', step, packStep(150)]);
        if (step % 4 === 0) c.push(['setStep', s, 'piano', '', step, packStep(200, DEGREE.chord)]);
        if (step % 4 === 2) c.push(['setStep', s, 'piano', '', step, packStep(120, DEGREE.fifth)]);
        if (step % 2 === 0) c.push(['setStep', s, 'guitar', '', step, packStep(chorus ? 150 : 110, DEGREE.chord)]);
        if (step % 8 === 0) c.push(['setStep', s, 'bass', '', step, packStep(220, DEGREE.root)]);
        if (step === 14) c.push(['setStep', s, 'bass', '', step, packStep(160, DEGREE.fifth)]);
      }
    }
  }
  c.push(['reverb', 0.5, 0.22]);

  return {
    name: style === 1 ? 'Reggaeton' : 'Pop',
    bpm,
    commands: c,
    sections: song.map((chords, s) => ({ name: s === 0 ? 'Verso' : 'Coro', chords: chords.map(([, , label]) => label) })),
    steps: songSteps(song.map((chords) => ({ loop: LOOPS, chords: chords.map(() => ({ halfBeats: HALF_BEATS })) }))),
  };
}
