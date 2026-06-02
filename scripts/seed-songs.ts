/**
 * Seed curated songs from src/data/songs.ts into Supabase public_songs table.
 *
 * Uses ON CONFLICT (slug) DO NOTHING — so songs already in Supabase (e.g. Holy Forever)
 * are left untouched. Only missing songs are inserted.
 *
 * Requires the service role key to bypass RLS.
 *
 * Run:
 *   npx tsx scripts/seed-songs.ts
 *
 * Required env vars (can be in .env or set inline):
 *   SUPABASE_URL             → Project URL (same as PUBLIC_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY → Service role key from Supabase dashboard → Settings → API
 */

import { createClient } from '@supabase/supabase-js';
import { SONGS } from '../src/data/songs.ts';

const url = process.env.SUPABASE_URL ?? process.env.PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('❌  Missing env vars.');
  console.error('   SUPABASE_URL            (or PUBLIC_SUPABASE_URL)');
  console.error('   SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false },
});

async function seed() {
  console.log(`Seeding ${SONGS.length} curated songs…\n`);

  for (const song of SONGS) {
    const row = {
      slug: song.slug,
      title: song.title,
      artist: song.artist,
      album: song.album ?? null,
      year: song.year ?? null,
      genre: song.genre,
      key: song.key,
      capo: song.capo ?? null,
      bpm: song.bpm,
      style: song.style,
      description: song.description,
      tags: song.tags,
      related_progressions: song.relatedProgressions,
      sections: song.sections,
      is_published: true,
      // created_by intentionally null for curated songs (no user owner)
    };

    const { error } = await supabase
      .from('public_songs')
      .upsert(row, { onConflict: 'slug', ignoreDuplicates: true });

    if (error) {
      console.error(`  ❌  ${song.title} — ${error.message}`);
    } else {
      console.log(`  ✅  ${song.title} (${song.slug})`);
    }
  }

  console.log('\nDone.');
}

seed().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
