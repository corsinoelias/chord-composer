/**
 * What a sound change sounds like, heard: each song is rendered by the engine itself
 * (public/engine/export-worker.js, run here with a stand-in for the worker's `self`) and
 * compared with the same song before the change. A sound the editor's pill picks must
 * change what is heard in the part it was picked for, and nothing else.
 *
 *   - the part's own sound, on A and on B, on an app rhythm, a library one and a web one;
 *   - an intro or ending a section plays (section.part) and one the rhythm added (stylePart);
 *   - a kit on a rhythm that plays kit pieces.
 *
 *   npm run test:groove
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { songToEngine } from '../../src/lib/appEngine/fromSong';
import { appPartSections } from '../../src/lib/appEngine/fromAppStyle';
import { appStylePattern, categoryGenre, type AppStyle } from '../../src/lib/appStyles';
import { getStyleById, type StylePattern } from '../../src/lib/styles';
import { createChord } from '../../src/lib/musicTheory';
import { foldSectionSounds, type Section } from '../../src/lib/sections';
import { getDefaultInstrumentStates } from '../../src/lib/instruments';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const pub = (f: string) => path.join(root, 'public', f);
const read = (f: string) => JSON.parse(fs.readFileSync(pub(f), 'utf8'));
const kitFile = read('engine/kit.json');
const library: AppStyle[] = read('rhythms/library.json').rhythms.map((r: { n: number; name: string; style: AppStyle }) => ({ ...r.style, id: `lib-${r.n}`, name: r.name, genre: 'x' }));
const own: AppStyle[] = read('rhythms/app-styles.json').styles.map((s: AppStyle & { category: string }) => ({ ...s, genre: categoryGenre(s.category) }));
const lookup = (id: string): StylePattern | undefined => {
  const app = [...own, ...library].find((s) => s.id === id);
  return app ? appStylePattern(app) : getStyleById(id);
};

// The worker, in this process: it answers through self.postMessage.
let answer: (data: { wav?: Uint8Array; error?: string }) => void = () => {};
// self is the global, as in a worker: tools that look for it expect the real one.
const scope = globalThis as unknown as { self: unknown; postMessage: unknown };
scope.self = globalThis;
scope.postMessage = (data: { wav?: Uint8Array; error?: string }) => answer(data);
await import(pathToUrl(pub('engine/export-worker.js')));
const worker = (globalThis as unknown as { self: { onmessage: (e: { data: object }) => Promise<void> } }).self;
function pathToUrl(p: string) { return new URL(`file:///${p.replace(/\\/g, '/')}`).href; }

const wasm = fs.readFileSync(pub('engine/engine.wasm'));
const sf2 = fs.readFileSync(pub('engine/sounds.sf2'));
const kit = kitFile.samples.map((k: { slot: number; name: string; gain: number }) => {
  const b = fs.readFileSync(pub(`engine/drums/${k.name}.pcm`));
  return { slot: k.slot, gain: k.gain, pcm: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
});

async function render(sections: Section[], style: StylePattern): Promise<Int16Array> {
  const built = songToEngine({ sections, bpm: 120, instrumentSettings: getDefaultInstrumentStates() }, style, lookup, kitFile.kits);
  const data = await new Promise<{ wav?: Uint8Array; error?: string }>((resolve) => {
    answer = resolve;
    void worker.onmessage({ data: { id: 1, wasm: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength), sf2: sf2.buffer.slice(sf2.byteOffset, sf2.byteOffset + sf2.byteLength), kit, commands: built.commands, steps: built.steps, tailSeconds: 0.2 } });
  });
  if (!data.wav) throw new Error(data.error ?? 'nothing rendered');
  return new Int16Array(data.wav.buffer.slice(data.wav.byteOffset + 44, data.wav.byteOffset + data.wav.byteLength));
}
/** How far apart two renders are, per sample; 0 is the same sound. */
function distance(a: Int16Array, b: Int16Array) {
  let d = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) d += Math.abs(a[i] - b[i]);
  return d / n;
}

let failed = 0;
let checks = 0;
const check = (name: string, ok: boolean, detail = '') => { checks++; if (!ok) { failed++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ''}`); } };
const HEARD = 20;

const chords = () => [createChord('C', '', 'maj', 4), createChord('A', '', 'min', 4)];
const section = (extra: Partial<Section> = {}): Section => ({ id: 's1', name: 'Verse', repeatCount: 1, chords: chords(), ...extra });
/** Whether giving [sounds] to [part] of the section changes what it sounds like. */
async function heard(style: StylePattern, base: Section, part: string, sounds: Record<string, string>) {
  const before = await render([base], style);
  const after = await render([{ ...base, partSounds: { [part]: sounds } }], style);
  return distance(before, after);
}

const salsa = own.find((s) => s.id === 'app-salsa')!;
const worship = own.find((s) => s.id === 'app-worship')!;
const withParts = library.find((s) => s.intro?.length && s.ending?.length && s.b && s.meter.beats === 4)!;
const merengue = getStyleById('merengue')!;

const bass = { bass: 'slap' };
// An intro may leave an instrument out: every one of them changes, so one that plays is heard.
const band = { piano: 'rhodes', guitar: 'nylon', bass: 'slap', synth: 'square' };
const cases: [string, StylePattern, Section, string, Record<string, string>, boolean][] = [
  ['app rhythm, A plays A\'s bass', appStylePattern(salsa), section(), 'a', bass, true],
  ['app rhythm, A leaves B\'s bass alone', appStylePattern(salsa), section(), 'b', bass, false],
  ['app rhythm, B plays B\'s bass', appStylePattern(salsa), section({ variation: 1 }), 'b', bass, true],
  ['library rhythm, A\'s bass', appStylePattern(withParts), section(), 'a', bass, true],
  ['library rhythm, the section\'s intro', appStylePattern(withParts), section({ part: 'intro' }), 'intro', band, true],
  ['library rhythm, the section\'s ending', appStylePattern(withParts), section({ part: 'ending' }), 'ending', band, true],
  ['web rhythm, A\'s bass', merengue, section(), 'a', bass, true],
  ['a kit on a rhythm that plays kit pieces', appStylePattern(worship), section(), 'a', { drums: 'electronic' }, true],
];
for (const [name, style, base, part, sounds, expect] of cases) {
  const d = await heard(style, base, part, sounds);
  check(name, expect ? d > HEARD : d === 0, `distance ${d.toFixed(1)}`);
}

// An intro the rhythm added is its own section, edited as its one variation: A.
{
  const added = appPartSections(withParts, 'intro', 0, false, false)[0];
  const d = await heard(appStylePattern(withParts), added, 'a', band);
  check('an intro the rhythm added', d > HEARD, `distance ${d.toFixed(1)}`);
}

// A section's own sounds (the old section menu's) moved to its parts sound the same, A and B.
for (const variation of [0, 1] as const) {
  const old = section({ variation, sounds: { bass: 'slap', drums: 'ap1' } });
  const style = appStylePattern(salsa);
  const d = distance(await render([old], style), await render([foldSectionSounds(old)], style));
  check(`a section's own sounds, moved to its parts, on ${variation ? 'B' : 'A'}`, d === 0, `distance ${d.toFixed(1)}`);
}

console.log(`${checks - failed}/${checks} listening checks passed`);
if (failed) process.exit(1);
