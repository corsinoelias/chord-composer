// Custom sitemap index that references both the static sitemap (sitemap-0.xml)
// and the dynamic songs sitemap (sitemap-songs.xml).
// Served at /sitemap-index.xml via netlify.toml rewrite (force=true).
import type { APIRoute } from 'astro';

const SITE = 'https://chordsequence.com';

export const GET: APIRoute = async () => {
  const today = new Date().toISOString().split('T')[0];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${SITE}/sitemap-0.xml</loc>
    <lastmod>${today}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${SITE}/sitemap-songs.xml</loc>
    <lastmod>${today}</lastmod>
  </sitemap>
</sitemapindex>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  });
};
