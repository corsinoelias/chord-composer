// Dynamic sitemap for all songs — always reflects current Supabase state.
// Googlebot discovers new songs without needing a rebuild.
// Referenced in robots.txt alongside sitemap-index.xml.
import type { APIRoute } from 'astro';
import { getPublishedSongs } from '@/lib/publicSongs';

const SITE = 'https://chordsequence.com';
const TODAY = new Date().toISOString().split('T')[0];

export const GET: APIRoute = async () => {
  const songs = await getPublishedSongs();

  const urls = songs
    .map(s => {
      const lastmod = s.updated_at?.split('T')[0] ?? TODAY;
      return `  <url>
    <loc>${SITE}/songs/${s.slug}/</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
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
