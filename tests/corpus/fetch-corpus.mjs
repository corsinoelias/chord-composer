/**
 * Downloads the real corpus the audio engine plays today: every public song and every
 * saved progression, plus the style settings of each progression's owner (a retouched
 * style changes how that owner's songs sound). See docs/plan-paridad-web-app.md, phase 0.
 *
 *   npm run corpus:fetch
 *
 * Writes to tests/corpus/data/, which is gitignored: this is user data and never goes
 * into git. Needs SUPABASE_SERVICE_ROLE_KEY in .env (RLS hides other users' rows).
 *
 * The snapshot is what the baseline is measured against, so re-fetching is a deliberate
 * act: new songs saved since the last fetch simply have no baseline yet, and a song an
 * owner edited since then would show up as a "change" that is not the engine's fault.
 */

import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'data');

const url = process.env.PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Faltan PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY (¿.env?).');
  process.exit(2);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

/** PostgREST caps a response at 1000 rows; page through so the corpus is never silently cut. */
async function fetchAll(table, columns) {
  const rows = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
}

const [publicSongs, progressions, settings] = await Promise.all([
  fetchAll('public_songs', 'id, slug, title, bpm, style, sections, is_published, updated_at'),
  fetchAll('progressions', 'id, user_id, is_public, data, updated_at'),
  fetchAll('user_settings', 'user_id, custom_styles, style_overrides'),
]);

// Only the settings of users who own a progression: nothing else is needed to play them.
const owners = new Set(progressions.map((p) => p.user_id));
const ownerSettings = Object.fromEntries(
  settings
    .filter((s) => owners.has(s.user_id))
    .map((s) => [s.user_id, { customStyles: s.custom_styles ?? [], styleOverrides: s.style_overrides ?? {} }]),
);

mkdirSync(OUT, { recursive: true });
const write = (name, value) => writeFileSync(join(OUT, name), JSON.stringify(value, null, 1) + '\n');
write('public-songs.json', publicSongs);
write('progressions.json', progressions);
write('owner-settings.json', ownerSettings);
write('meta.json', { fetchedAt: new Date().toISOString() });

console.log(`public_songs:   ${publicSongs.length} (${publicSongs.filter((s) => s.is_published).length} publicadas)`);
console.log(`progressions:   ${progressions.length} de ${owners.size} usuarios`);
console.log(`user_settings:  ${Object.keys(ownerSettings).length} dueños con ajustes de estilo`);
console.log(`Guardado en ${OUT}`);
