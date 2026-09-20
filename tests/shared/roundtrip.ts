/**
 * The web's half of the shared-song contract (docs/plan-paridad-web-app.md, phase 1): every
 * golden song in shared/fixtures/songs loads and saves back byte-identical, the way the
 * editor does it — known fields from state, everything else from unknownSongFields.
 *
 *   npm run test:shared
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrateLegacySong, unknownSongFields, SONG_SCHEMA_VERSION, type Song } from '../../src/lib/songs';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'shared', 'fixtures', 'songs');
const canon = (v: unknown): string => JSON.stringify(v, (_k, x) =>
  x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x);

let failed = 0;
for (const file of readdirSync(DIR).filter((f) => f.endsWith('.json'))) {
  const raw = JSON.parse(readFileSync(join(DIR, file), 'utf8'));
  const song: Song = migrateLegacySong(structuredClone(raw));
  // What Index.tsx's autosave writes back.
  const saved: Song = {
    ...unknownSongFields(song),
    schemaVersion: SONG_SCHEMA_VERSION,
    id: song.id, title: song.title, createdAt: song.createdAt, updatedAt: song.updatedAt,
    sections: song.sections, bpm: song.bpm, styleId: song.styleId, transposition: song.transposition,
    instrumentSettings: song.instrumentSettings, metronomeEnabled: song.metronomeEnabled,
  };
  const ok = canon(saved) === canon(raw);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${file}`);
}
if (failed) process.exit(1);
