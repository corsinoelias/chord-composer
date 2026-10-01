/**
 * The web's MIDI export writes the notes the app's does. The app writes reference files
 * (its test/midi_reference_test.dart, into build/midi_ref/): a few library rhythms over
 * the same chords, each with a description of the song. This rebuilds every song here,
 * exports it, and compares the two files note for note — on and off, tick, channel, pitch
 * and velocity. Program changes are left out: the web picks its own sounds.
 *
 *   npm run test:midi        (after `flutter test test/midi_reference_test.dart` in the app)
 */
import fs from 'node:fs';
import path from 'node:path';
import { songToEngine } from '../../src/lib/appEngine/fromSong';
import { midiFromEngine } from '../../src/lib/appEngine/midiFromEngine';
import { appStylePattern, type AppStyle } from '../../src/lib/appStyles';
import { createChord, type ChordQuality, type RootNote } from '../../src/lib/musicTheory';
import { type Section } from '../../src/lib/sections';

const app = process.env.CHORD_APP || 'C:/Users/Eliascorsino/Projects/chord_sequencer';
const refs = path.join(app, 'build/midi_ref');
const root = path.resolve(import.meta.dirname, '../..');
const library: AppStyle[] = JSON.parse(fs.readFileSync(path.join(root, 'public/rhythms/library.json'), 'utf8'))
  .rhythms.map((r: { n: number; name: string; style: AppStyle }) => ({ ...r.style, id: `lib-${r.n}`, name: r.name, genre: 'x' }));

/** Every note event of a MIDI file, as text, in file order per track. */
function notes(bytes: Uint8Array): string[] {
  const out: string[] = [];
  let p = 14;
  const u32 = (i: number) => (bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3];
  while (p < bytes.length) {
    const end = p + 8 + u32(p + 4);
    let i = p + 8;
    let tick = 0;
    let status = 0;
    while (i < end) {
      let delta = 0;
      for (;;) { const b = bytes[i++]; delta = (delta << 7) | (b & 0x7f); if (!(b & 0x80)) break; }
      tick += delta;
      if (bytes[i] === 0xff) {
        i += 2;
        let len = 0;
        for (;;) { const b = bytes[i++]; len = (len << 7) | (b & 0x7f); if (!(b & 0x80)) break; }
        i += len;
        continue;
      }
      if (bytes[i] & 0x80) status = bytes[i++];
      const kind = status & 0xf0;
      const channel = status & 0x0f;
      if (kind === 0xc0) { i += 1; continue; }
      const note = bytes[i++];
      const velocity = bytes[i++];
      const on = kind === 0x90 && velocity > 0;
      out.push(`${tick} ch${channel} ${on ? 'on' : 'off'} ${note}${on ? ` v${velocity}` : ''}`);
    }
    p = end;
  }
  return out.sort();
}

if (!fs.existsSync(refs)) {
  console.log(`No reference files in ${refs}: run "flutter test test/midi_reference_test.dart" in the app first.`);
  process.exit(1);
}
let failed = 0;
let checked = 0;
for (const file of fs.readdirSync(refs).filter((f) => f.endsWith('.json'))) {
  const song = JSON.parse(fs.readFileSync(path.join(refs, file), 'utf8'));
  const style = library.find((s) => s.id === `lib-${song.rhythm}`);
  if (!style) { console.log(`FAIL ${file}: no rhythm ${song.rhythm} in the web's library`); failed++; continue; }
  const section: Section = {
    id: 's1', name: 'Verse', repeatCount: song.loop,
    chords: song.chords.map((c: { root: string; type: string; beats: number; bass: string | null }) => {
      // The app counts a chord in beats of the meter (eighths in 6/8), the web in quarters.
      const quarters = (c.beats * (16 / (style.meter?.unit ?? 4))) / 4;
      const chord = createChord(c.root[0] as RootNote, (c.root[1] ?? '') as '' | '#' | 'b', c.type as ChordQuality, quarters);
      return c.bass ? { ...chord, bassNote: c.bass } : chord;
    }),
    ...(song.playing === 'b' ? { variation: 1 as const } : {}),
    ...(song.playing === 'intro' || song.playing === 'ending' ? { part: song.playing } : {}),
  };
  const built = songToEngine({ sections: [section], bpm: song.bpm, swing: song.swing }, appStylePattern(style), () => undefined, []);
  const web = notes(midiFromEngine(built.commands, 'Reference'));
  const ref = notes(new Uint8Array(fs.readFileSync(path.join(refs, file.replace('.json', '.mid')))));
  checked++;
  const missing = ref.filter((e) => !web.includes(e));
  const extra = web.filter((e) => !ref.includes(e));
  if (missing.length || extra.length) {
    failed++;
    console.log(`FAIL ${file} (${style.name}): ${ref.length} in the app, ${web.length} here; missing ${missing.length}, extra ${extra.length}`);
    console.log('  missing:', missing.slice(0, 6).join(' | '));
    console.log('  extra:  ', extra.slice(0, 6).join(' | '));
  }
}
console.log(`${checked - failed}/${checked} songs export the same notes as the app`);
if (failed) process.exit(1);
