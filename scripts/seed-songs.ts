import { createClient } from '@supabase/supabase-js';
import { SONGS } from '../src/data/songs.js';

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function seed() {
  console.log(`Seeding ${SONGS.length} songs…\n`);
  let ok = 0, errors = 0;

  for (const song of SONGS) {
    const { relatedProgressions, ...rest } = song;
    const row = {
      ...rest,
      related_progressions: relatedProgressions,
      is_published: true,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('public_songs')
      .upsert(row, { onConflict: 'slug', ignoreDuplicates: false });

    if (error) {
      console.error(`  ❌  ${song.slug} — ${error.message}`);
      errors++;
    } else {
      console.log(`  ✅  ${song.slug}`);
      ok++;
    }
  }

  console.log(`\nDone: ${ok} upserted, ${errors} errors`);
}

seed().catch((e) => { console.error(e); process.exit(1); });
