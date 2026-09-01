import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import path from 'path';
import { fileURLToPath } from 'url';
import { readdirSync, readFileSync } from 'fs';

import netlify from '@astrojs/netlify';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Real per-article lastmod for /learn/*, read from MDX frontmatter (updatedDate,
// fallback pubDate). Everything else gets no <lastmod> — a missing lastmod is neutral
// to Google, a fabricated one is the exact bug already fixed for the songs sitemap.
const learnDir = path.resolve(__dirname, 'src/content/learn');
const learnLastmodBySlug = new Map(
  readdirSync(learnDir)
    .filter((f) => f.endsWith('.mdx'))
    .map((file) => {
      const raw = readFileSync(path.join(learnDir, file), 'utf-8');
      const updated = raw.match(/^updatedDate:\s*(\S+)/m)?.[1];
      const pub = raw.match(/^pubDate:\s*(\S+)/m)?.[1];
      return [file.replace(/\.mdx$/, ''), updated ?? pub];
    })
    .filter(([, date]) => Boolean(date)),
);


// Routes kept out of the sitemap. Matched against the pathname, not the raw URL string,
// and split by shape on purpose: a naive `page.includes('/guitar-tab/')` would also drop
// the real landing page at /tools/guitar-tab/, so alias shells are matched exactly.
//
// - /app, /songs/new, /admin: app/auth shells. /admin/songs/ 302s to login and was
//   shipping to Google as a 302 with an empty <title> and no H1.
// - /bass-tab/, /guitar-tab/: `client:only` editor shells that render zero server HTML
//   (no H1, no headings, no internal links). They're the CTA target of the /tools/*
//   landing pages and canonicalize to them — see the canonicalUrl in each .astro file.
//   The routes stay live and linked; they're just not search destinations.
// - /chord-sheet-maker/editor: same client:only shape as /bass-tab, plus it's mid-build
//   (see the "Construir Chord Sheet Maker" plan) — noIndex on the page covers the meta
//   tag, this keeps it out of the sitemap file too until both come off together.
const SITEMAP_EXCLUDED_PREFIXES = ['/app', '/songs/new', '/admin'];
const SITEMAP_EXCLUDED_PATHS = new Set(['/bass-tab/', '/guitar-tab/', '/chord-sheet-maker/editor/']);

export default defineConfig({
  site: 'https://chordsequence.com',
  trailingSlash: 'always',

  integrations: [
    react(),
    mdx(),
    sitemap({
      filter: (page) => {
        const { pathname } = new URL(page);
        return (
          !SITEMAP_EXCLUDED_PATHS.has(pathname) &&
          !SITEMAP_EXCLUDED_PREFIXES.some((prefix) => pathname.startsWith(prefix))
        );
      },
      customPages: [
        'https://chordsequence.com/songs/',
      ],
      serialize(item) {
        const match = item.url.match(/\/learn\/([^/]+)\/$/);
        const slug = match?.[1];
        const lastmod = slug ? learnLastmodBySlug.get(slug) : undefined;
        return lastmod ? { ...item, lastmod } : item;
      },
    }),
  ],

  output: 'server',

  vite: {
    optimizeDeps: {
      include: ['vexflow'],
    },
    server: {
      historyApiFallback: {
        rewrites: [
          { from: /^\/chord-player\/.*$/, to: '/chord-player/' },
        ],
      },
      headers: {
        // Override the global block so /tuner/ can use the microphone in dev
        // Production equivalent is the [[headers]] override in netlify.toml
        'Permissions-Policy': 'microphone=(self)',
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom'],
            'vendor-dnd': ['@dnd-kit/core', '@dnd-kit/sortable'],
            'vendor-ui': ['@radix-ui/react-dialog', '@radix-ui/react-select', '@radix-ui/react-tooltip'],
          },
        },
      },
    },
  },

  // edgeFunctions disabled in the dev emulator only — netlify/edge-functions/chord-player-deeplink.ts
  // still deploys and runs for real on Netlify. Emulating it locally needs Deno, which
  // isn't installed here, so every dev request was failing a `fetch` to the (never
  // started) Deno subprocess and logging an unhandled rejection — see the "DEV ONLY"
  // comment in src/middleware.ts: the deep-link rewrite it exists for is already
  // handled there for `astro dev`, so dev never needed the edge function anyway.
  adapter: netlify({ edgeFunctions: { enabled: false } }),
});