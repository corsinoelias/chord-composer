/**
 * What the MIDI file takes from the song beyond the rhythm: a piece muted in the part it
 * plays is not in it, a section's own note length is, and the file is format 1 with a tempo
 * track, the drums and one track per instrument.
 *
 *   npm run test:midi
 */
import fs from 'node:fs';
import path from 'node:path';
import { songToEngine } from '../../src/lib/appEngine/fromSong';
import { midiFromEngine } from '../../src/lib/appEngine/midiFromEngine';
import { appStylePattern, type AppStyle } from '../../src/lib/appStyles';
import { createChord } from '../../src/lib/musicTheory';
import { type Section } from '../../src/lib/sections';

const root = path.resolve(import.meta.dirname, '../..');
const library: AppStyle[] = JSON.parse(fs.readFileSync(path.join(root, 'public/rhythms/library.json'), 'utf8'))
  .rhythms.map((r: { n: number; name: string; style: AppStyle }) => ({ ...r.style, id: `lib-${r.n}`, name: r.name, genre: 'x' }));
const style = appStylePattern(library.find((s) => s.id === 'lib-2')!);

let failed = 0;
let checks = 0;
const check = (name: string, ok: boolean, detail = '') => { checks++; if (!ok) { failed++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ''}`); } };

/** [tick, channel, note, duration] of every note in a file. */
function notes(bytes: Uint8Array): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  let p = 14;
  const u32 = (i: number) => (bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3];
  while (p < bytes.length) {
    const end = p + 8 + u32(p + 4);
    let i = p + 8;
    let tick = 0;
    const open = new Map<string, number>();
    while (i < end) {
      let delta = 0;
      for (;;) { const b = bytes[i++]; delta = (delta << 7) | (b & 0x7f); if (!(b & 0x80)) break; }
      tick += delta;
      if (bytes[i] === 0xff) { i += 2; let len = 0; for (;;) { const b = bytes[i++]; len = (len << 7) | (b & 0x7f); if (!(b & 0x80)) break; } i += len; continue; }
      const status = bytes[i++];
      if ((status & 0xf0) === 0xc0) { i++; continue; }
      const note = bytes[i++];
      const velocity = bytes[i++];
      const key = `${status & 0x0f}|${note}`;
      if ((status & 0xf0) === 0x90 && velocity > 0) open.set(key, tick);
      else if (open.has(key)) { out.push([open.get(key)!, status & 0x0f, note, tick - open.get(key)!]); open.delete(key); }
    }
    p = end;
  }
  return out;
}
const section = (extra: Partial<Section> = {}): Section => ({
  id: 's1', name: 'Verse', repeatCount: 1, chords: [createChord('C', '', 'maj', 4), createChord('G', '', 'maj', 4)], ...extra,
});
const exportOf = (s: Section, song: Record<string, unknown> = {}) =>
  midiFromEngine(songToEngine({ sections: [s], bpm: 100, ...song }, style, () => undefined, []).commands, 'Test');

{
  const bytes = exportOf(section());
  check('a MIDI file', String.fromCharCode(...bytes.slice(0, 4)) === 'MThd');
  check('format 1, six tracks', bytes[9] === 1 && bytes[11] === 6, `${bytes[9]} ${bytes[11]}`);
  const all = notes(bytes);
  check('drums on channel 10', all.some((n) => n[1] === 9));
  check('instruments on their own channels', all.some((n) => n[1] !== 9));
  check('the snare is in it', all.some((n) => n[1] === 9 && n[2] === 38));
  const muted = notes(exportOf(section({ partMuted: { a: ['snare'] } })));
  check('a snare muted in the part is not', !muted.some((n) => n[1] === 9 && n[2] === 38));
  check('and the rest of the kit still is', muted.some((n) => n[1] === 9 && n[2] === 36));
}
{
  // A sixteenth on the piano in this section, though the song plays it long.
  const short = notes(exportOf(section({ noteLengths: { piano: 1 } }), { noteLengths: { piano: 4 } })).filter((n) => n[1] === 0);
  check('the section\'s own length is written', short.length > 0 && short.every((n) => n[3] <= 120), JSON.stringify(short.slice(0, 3)));
}

console.log(`${checks - failed}/${checks} MIDI checks passed`);
if (failed) process.exit(1);
