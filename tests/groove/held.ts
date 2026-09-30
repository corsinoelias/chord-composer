/**
 * A held note on a sound that sustains — strings, a pad — goes on through the loop. The lane
 * coming round to the one cell that struck it used to strike it again, and the note dipped
 * and swelled back in on every bar: the "cut" a worship pad made each time the pattern
 * wrapped (app c2d65ae). Heard here at each bar line: how far the chord falls just after it.
 * The synth's own pad comes in fast enough that it barely dipped; it is checked all the same.
 *
 *   npm run test:groove
 */
import { appStylePattern, type AppStyle } from '../../src/lib/appStyles';
import { createChord } from '../../src/lib/musicTheory';
import { type Section } from '../../src/lib/sections';
import { own, render } from './engineRender';

let failed = 0;
let checks = 0;
const check = (name: string, ok: boolean, detail = '') => { checks++; if (!ok) { failed++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ''}`); } };

const worship = own.find((s) => s.id === 'app-worship')!;
const empty = (n: number) => new Array<number>(n).fill(0);
/** One chord cell on the first step of a one-bar synth lane, held; nothing else plays. */
function held(): AppStyle {
  const length = worship.a.patterns.synth.lane.length;
  const lane = empty(length);
  lane[0] = worship.a.patterns.synth.lane[0];
  return {
    ...worship,
    id: 'held',
    b: undefined,
    intro: undefined,
    ending: undefined,
    a: { patterns: { synth: { lane } }, patternBars: { drums: 1, piano: 1, guitar: 1, bass: 1, synth: 1 } },
    noteLengths: { ...worship.noteLengths, synth: 0 },
  };
}

const bpm = 120;
const rate = 44100;
const bar = (60 / bpm) * 4;
/** Loudness in 20 ms windows, stereo samples folded. */
function levels(samples: Int16Array, from: number, to: number) {
  const size = Math.round(0.02 * rate) * 2;
  const out: number[] = [];
  for (let at = Math.round(from * rate) * 2; at + size <= Math.round(to * rate) * 2; at += size) {
    let sum = 0;
    for (let i = at; i < at + size; i++) sum += samples[i] * samples[i];
    out.push(Math.sqrt(sum / size));
  }
  return out;
}

// The sound as the section picks it: the SoundFont's strings and pad, and the synth's own pad.
// Howling Winds (1530, the 11th bank's Seashore) is in the whole font only, and holds where
// the General MIDI number alone said it would not.
for (const name of ['strings', 'pad', 'pad-syn', 'gm:1530']) {
  const section: Section = {
    id: 's1', name: 'Pad', repeatCount: 1, chords: [createChord('C', '', 'maj', 16)],
    partSounds: { a: { synth: name } },
  };
  const samples = await render([section], appStylePattern(held()), { bpm });
  // Each bar line the lane comes round on: the quietest moment of the 0.6 s after it against
  // the average of the 0.6 s before. These sounds swell and shimmer on their own, so it is
  // the fall at the bar line that is measured — struck again, strings fell to a fifth there
  // and the pad to a twentieth, then took a second to swell back. Held, the warm pad's own
  // shimmer takes it to 0.39 at its lowest.
  for (let line = 1; line <= 3; line++) {
    const before = levels(samples, line * bar - 0.6, line * bar);
    const after = levels(samples, line * bar, line * bar + 0.6);
    const level = before.reduce((a, b) => a + b, 0) / before.length;
    const quietest = Math.min(...after);
    check(`a held ${name} goes on through bar line ${line}`, level > 200 && quietest > level * 0.3,
      `quietest ${quietest.toFixed(0)} after, ${level.toFixed(0)} before`);
  }
}

console.log(`${checks - failed}/${checks} held-note checks passed`);
if (failed) process.exit(1);
