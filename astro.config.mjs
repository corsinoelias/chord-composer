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


export default defineConfig({
  site: 'https://chordsequence.com',
  trailingSlash: 'always',

  integrations: [
    react(),
    mdx(),
    sitemap({
      filter: (page) => !page.includes('/app') && !page.includes('/songs/new'),
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
          { from: /^\/editor\/.*$/, to: '/editor/' },
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

  adapter: netlify(),
});