import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import path from 'path';
import { fileURLToPath } from 'url';

import netlify from '@astrojs/netlify';

const __dirname = path.dirname(fileURLToPath(import.meta.url));


export default defineConfig({
  site: 'https://chordsequence.com',
  trailingSlash: 'always',

  integrations: [
    react(),
    mdx(),
    sitemap({
      filter: (page) => !page.includes('/app') && !page.includes('/editor') && !page.includes('/songs/c/') && !page.includes('/songs/new'),
      customPages: [
        'https://chordsequence.com/songs/holy-forever-chris-tomlin/',
        'https://chordsequence.com/songs/autumn-leaves-jazz-standard/',
        'https://chordsequence.com/songs/hallelujah-leonard-cohen/',
        'https://chordsequence.com/songs/wonderwall-oasis/',
      ],
      serialize(item) {
        const lastmodMap = {
          'https://chordsequence.com/': '2026-05-29',
          'https://chordsequence.com/learn/': '2026-05-29',
          'https://chordsequence.com/learn/what-is-a-chord-progression/': '2026-05-29',
          'https://chordsequence.com/learn/chord-progressions-for-beginners/': '2026-05-29',
          'https://chordsequence.com/learn/jazz-chord-progressions/': '2026-05-29',
          'https://chordsequence.com/learn/circle-of-fifths-explained/': '2026-05-01',
          'https://chordsequence.com/learn/how-to-transpose-chords/': '2026-05-01',
          'https://chordsequence.com/learn/music-theory-basics-for-songwriters/': '2026-05-01',
          'https://chordsequence.com/progressions/': '2026-05-29',
          'https://chordsequence.com/progressions/pop/': '2026-05-29',
          'https://chordsequence.com/progressions/jazz/': '2026-05-29',
          'https://chordsequence.com/progressions/lo-fi/': '2026-05-01',
          'https://chordsequence.com/progressions/sad/': '2026-05-01',
          'https://chordsequence.com/progressions/happy/': '2026-05-01',
          'https://chordsequence.com/progressions/neo-soul/': '2026-05-01',
          'https://chordsequence.com/progressions/worship/': '2026-05-01',
          'https://chordsequence.com/progressions/edm/': '2026-05-01',
          'https://chordsequence.com/progressions/rock/': '2026-06-01',
          'https://chordsequence.com/progressions/blues/': '2026-06-01',
          'https://chordsequence.com/progressions/12-bar-blues/': '2026-06-01',
          'https://chordsequence.com/progressions/ii-v-i/': '2026-06-01',
          'https://chordsequence.com/songs/': '2026-06-01',
          'https://chordsequence.com/songs/holy-forever-chris-tomlin/': '2026-06-01',
          'https://chordsequence.com/songs/autumn-leaves-jazz-standard/': '2026-06-01',
          'https://chordsequence.com/songs/hallelujah-leonard-cohen/': '2026-06-01',
          'https://chordsequence.com/songs/wonderwall-oasis/': '2026-06-01',
          'https://chordsequence.com/tools/': '2026-05-29',
          'https://chordsequence.com/tools/chord-transposer/': '2026-05-29',
          'https://chordsequence.com/tools/circle-of-fifths/': '2026-05-01',
          'https://chordsequence.com/tools/key-detector/': '2026-05-01',
          'https://chordsequence.com/about/': '2026-05-29',
          'https://chordsequence.com/about/elias-corsino/': '2026-05-29',
          'https://chordsequence.com/contact/': '2026-01-01',
          'https://chordsequence.com/privacy/': '2026-01-01',
        };
        const url = item.url.endsWith('/') ? item.url : item.url + '/';
        if (lastmodMap[url]) item.lastmod = lastmodMap[url];
        return item;
      },
    }),
  ],

  output: 'server',

  vite: {
    server: {
      historyApiFallback: {
        rewrites: [
          { from: /^\/editor\/.*$/, to: '/editor/' },
        ],
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