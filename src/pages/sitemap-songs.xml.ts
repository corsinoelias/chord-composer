// Dynamic sitemap for community songs — always reflects current Supabase state.
// Googlebot discovers new songs without needing a rebuild.
// Referenced in robots.txt and the main sitemap via <sitemapindex>.
import type { APIRoute } from 'astro';
import { getPublishedSongs } from '@/lib/publicSongs';
import { SONGS } from '@/data/songs';

const SITE = 'https://chordsequence.com';
const TODAY = new Date().toISOString().split('T')[0];

export const GET: APIRoute = async () => {
  const community = await getPublishedSongs();
  const staticSlugs = new Set(SONGS.map(s => s.slug));

  const urls = community
    .filter(s => !staticSlugs.has(s.slug))
    .map(s => {
      const lastmod = s.updated_at?.split('T')[0] ?? TODAY;
      return `  <url>
    <loc>${SITE}/songs/${s.slug}/</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`;
    })
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
