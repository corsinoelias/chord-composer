import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath, pathToFileURL } from 'url';
import { readdirSync, readFileSync } from 'fs';

import netlify from '@astrojs/netlify';

/**
 * `astro dev` without Netlify's edge-function emulation.
 *
 * The adapter puts @netlify/vite-plugin into the dev server and passes it only its image and
 * environment-variable options, so the plugin's edge-function emulation is always on — the
 * adapter's own `edgeFunctions: { enabled: false }` below does not reach it. Once the Netlify
 * CLI had installed Deno (AppData/Roaming/netlify/Config/deno-cli), that emulation started a
 * `deno` server for netlify/edge-functions/ with every `astro dev`, and it grew to 12-47 GB over
 * a day of editing (measured 2026-09-22), starving the machine. Dev never needed it: the deep
 * link that edge function serves is handled for `astro dev` by src/middleware.ts.
 *
 * So the dev hook of the adapter's plugin is swapped for one built with the same options plus
 * `edgeFunctions: { enabled: false }`. Loaded from where the adapter loads it, so it is always
 * the same copy; production builds are untouched (the build hooks are not replaced).
 */
const requireFromAdapter = createRequire(fileURLToPath(import.meta.resolve('@astrojs/netlify')));
const { default: netlifyVitePlugin } = await import(pathToFileURL(requireFromAdapter.resolve('@netlify/vite-plugin')).href);
function netlifyDevWithoutEdgeFunctions() {
  const [ours] = netlifyVitePlugin({
    // What the adapter passes (no remote image domains or patterns are configured here).
    images: { enabled: true, remoteURLPatterns: [] },
    environmentVariables: { enabled: false },
    edgeFunctions: { enabled: false },
  });
  return {
    name: 'netlify-dev-without-edge-functions',
    apply: 'serve',
    configResolved(config) {
      const theirs = config.plugins.find((p) => p.name === 'vite-plugin-netlify');
      if (theirs && ours?.configureServer) theirs.configureServer = ours.configureServer;
    },
  };
}

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
// - /chord-sheet-maker/editor: same client:only shape as /bass-tab — and excluded for
//   the same permanent reason, not because the product is mid-build. It renders zero
//   server HTML, so indexing it would hand Google a blank page; the landing at
//   /chord-sheet-maker/ is the search destination and is indexed normally. The page's
//   own noIndex and this exclusion stay on together, and neither is waiting on a launch.
// - /account/, /auth/reset/: noIndex={true} pages that were still shipping to Google in
//   the sitemap, contradicting their own meta tag (GSC caught it and excluded them, but
//   fixing the sitemap directly is the correct source of truth) — confirmed 2026-09-02.
const SITEMAP_EXCLUDED_PREFIXES = ['/app', '/songs/new', '/admin'];
const SITEMAP_EXCLUDED_PATHS = new Set([
  '/bass-tab/',
  '/guitar-tab/',
  '/chord-sheet-maker/editor/',
  '/account/',
  '/auth/reset/',
]);

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
    plugins: [netlifyDevWithoutEdgeFunctions()],
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

  // netlify/edge-functions/chord-player-deeplink.ts deploys and runs for real on Netlify. This
  // option does NOT switch off its emulation under `astro dev` —
  // netlifyDevWithoutEdgeFunctions() above does; see why there.
  adapter: netlify({ edgeFunctions: { enabled: false } }),
});