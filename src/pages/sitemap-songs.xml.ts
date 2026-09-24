// Dynamic sitemap for all songs.
// Merges the static SONGS array (always current after deploy) with any
// community songs stored in Supabase — so adding a song to songs.ts and
// deploying is enough; no manual seed step required.
import type { APIRoute } from 'astro';
import { getPublishedSongs } from '@/lib/publicSongs';
import { SONGS } from '@/data/songs';

const SITE = 'https://chordsequence.com';

// A song page also changes when [slug].astro changes, not only when the song's own row
// does: its title and meta description are built from a template there. On 2026-09-05 that
// template changed for all 66 songs (f5c81fd dropped "& Lyrics" from every title, ea76684
// rewrote the served HTML) and nothing recorded it -- so this sitemap kept telling Google
// these pages were untouched since June, and Google believed it: center-bethel-music went
// eleven days without a crawl, straight through the change we were trying to measure.
//
// Flooring every entry at the template's own date is the truthful lastmod, not a nudge:
// that IS the day the page last changed. Bump it whenever [slug].astro changes what the
// page renders.
const TEMPLATE_LAST_CHANGED = '2026-09-24';
const lastmodOf = (own?: string): string =>
  !own || own < TEMPLATE_LAST_CHANGED ? TEMPLATE_LAST_CHANGED : own;

export const GET: APIRoute = async () => {
  // Static songs — always present after deploy, no Supabase required
  const staticSlugs = new Set(SONGS.map(s => s.slug));
  const staticEntries = SONGS.map(s => ({ slug: s.slug, lastmod: lastmodOf(s.lastModified) }));

  // Community songs from Supabase — filter out any that are also in the static array
  const supabaseSongs = await getPublishedSongs();
  const communityEntries = supabaseSongs
    .filter(s => !staticSlugs.has(s.slug))
    .map(s => ({ slug: s.slug, lastmod: lastmodOf(s.updated_at?.split('T')[0]) }));

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
