// Dynamic sitemap for all songs.
// Merges the static SONGS array (always current after deploy) with any
// community songs stored in Supabase — so adding a song to songs.ts and
// deploying is enough; no manual seed step required.
import type { APIRoute } from 'astro';
import { getPublishedSongs } from '@/lib/publicSongs';
import { SONGS } from '@/data/songs';

const SITE = 'https://chordsequence.com';
const TODAY = new Date().toISOString().split('T')[0];

export const GET: APIRoute = async () => {
  // Static songs — always present after deploy, no Supabase required
  const staticSlugs = new Set(SONGS.map(s => s.slug));
  const staticEntries = SONGS.map(s => ({ slug: s.slug, lastmod: TODAY }));

  // Community songs from Supabase — filter out any that are also in the static array
  const supabaseSongs = await getPublishedSongs();
  const communityEntries = supabaseSongs
    .filter(s => !staticSlugs.has(s.slug))
    .map(s => ({ slug: s.slug, lastmod: s.updated_at?.split('T')[0] ?? TODAY }));

  const all = [...staticEntries, ...communityEntries];

  const urls = all
    .map(({ slug, lastmod }) => `  <url>
    <loc>${SITE}/songs/${slug}/</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`)
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
