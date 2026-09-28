/**
 * A song rendered by the engine itself, in Node: the export worker (public/engine/
 * export-worker.js) run in this process with the global standing in for its `self`, fed the
 * same wasm, SoundFont and kit the page loads. What the tests hear is what the player plays.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { songToEngine, type SongInput } from '../../src/lib/appEngine/fromSong';
import { appStylePattern, categoryGenre, type AppStyle } from '../../src/lib/appStyles';
import { getStyleById, type StylePattern } from '../../src/lib/styles';
import { type Section } from '../../src/lib/sections';
import { getDefaultInstrumentStates } from '../../src/lib/instruments';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const pub = (f: string) => path.join(root, 'public', f);
const read = (f: string) => JSON.parse(fs.readFileSync(pub(f), 'utf8'));
const kitFile = read('engine/kit.json');
/** The kits the engine plays, as the page loads them. */
export const kits = kitFile.kits;
export const library: AppStyle[] = read('rhythms/library.json').rhythms.map((r: { n: number; name: string; style: AppStyle }) => ({ ...r.style, id: `lib-${r.n}`, name: r.name, genre: 'x' }));
export const own: AppStyle[] = read('rhythms/app-styles.json').styles.map((s: AppStyle & { category: string }) => ({ ...s, genre: categoryGenre(s.category) }));
export const lookup = (id: string): StylePattern | undefined => {
  const app = [...own, ...library].find((s) => s.id === id);
  return app ? appStylePattern(app) : getStyleById(id);
};

// The worker, in this process: it answers through self.postMessage.
let answer: (data: { wav?: Uint8Array; error?: string }) => void = () => {};
// self is the global, as in a worker: tools that look for it expect the real one.
const scope = globalThis as unknown as { self: unknown; postMessage: unknown };
scope.self = globalThis;
scope.postMessage = (data: { wav?: Uint8Array; error?: string }) => answer(data);
await import(new URL(`file:///${pub('engine/export-worker.js').replace(/\\/g, '/')}`).href);
const worker = (globalThis as unknown as { self: { onmessage: (e: { data: object }) => Promise<void> } }).self;

const wasm = fs.readFileSync(pub('engine/engine.wasm'));
const sf2 = fs.readFileSync(pub('engine/sounds.sf2'));
const kit = kitFile.samples.map((k: { slot: number; name: string; gain: number }) => {
  const b = fs.readFileSync(pub(`engine/drums/${k.name}.pcm`));
  return { slot: k.slot, gain: k.gain, pcm: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
});

/** [sections] on [style], rendered: 16-bit samples, the WAV's header taken off. */
export async function render(sections: Section[], style: StylePattern, song: Partial<SongInput> = {}): Promise<Int16Array> {
  const built = songToEngine({ sections, bpm: 120, instrumentSettings: getDefaultInstrumentStates(), ...song }, style, lookup, kitFile.kits);
  const data = await new Promise<{ wav?: Uint8Array; error?: string }>((resolve) => {
    answer = resolve;
    void worker.onmessage({ data: { id: 1, wasm: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength), sf2: sf2.buffer.slice(sf2.byteOffset, sf2.byteOffset + sf2.byteLength), kit, commands: built.commands, steps: built.steps, tailSeconds: 0.2 } });
  });
  if (!data.wav) throw new Error(data.error ?? 'nothing rendered');
  return new Int16Array(data.wav.buffer.slice(data.wav.byteOffset + 44, data.wav.byteOffset + data.wav.byteLength));
}

/** How far apart two renders are, per sample; 0 is the same sound. */
export function distance(a: Int16Array, b: Int16Array) {
  let d = 0;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) d += Math.abs((a[i] ?? 0) - (b[i] ?? 0));
  return d / n;
}
