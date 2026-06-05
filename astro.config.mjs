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
      filter: (page) => !page.includes('/app') && !page.includes('/editor') && !page.includes('/songs/new'),
      customPages: [
        'https://chordsequence.com/songs/',
      ],
      serialize: (item) => {
        const LASTMOD: Record<string, string> = {
          'https://chordsequence.com/': '2026-06-05',
          'https://chordsequence.com/about/': '2026-06-05',
          'https://chordsequence.com/about/elias-corsino/': '2026-01-01',
          'https://chordsequence.com/contact/': '2025-04-01',
          'https://chordsequence.com/learn/': '2026-06-05',
          'https://chordsequence.com/learn/what-is-a-chord-progression/': '2025-05-10',
          'https://chordsequence.com/learn/chord-progressions-for-beginners/': '2025-05-01',
          'https://chordsequence.com/learn/jazz-chord-progressions/': '2026-06-01',
          'https://chordsequence.com/learn/how-to-transpose-chords/': '2025-05-15',
          'https://chordsequence.com/learn/music-theory-basics-for-songwriters/': '2025-05-25',
          'https://chordsequence.com/learn/circle-of-fifths-explained/': '2025-05-20',
          'https://chordsequence.com/learn/beginner-guitar-chords/': '2026-06-05',
          'https://chordsequence.com/learn/easy-guitar-songs/': '2026-06-01',
          'https://chordsequence.com/learn/chord-inversions/': '2026-06-05',
          'https://chordsequence.com/progressions/': '2026-01-01',
          'https://chordsequence.com/songs/': '2026-06-05',
          'https://chordsequence.com/tools/': '2026-05-01',
          'https://chordsequence.com/tools/chord-transposer/': '2026-05-01',
          'https://chordsequence.com/tools/circle-of-fifths/': '2026-05-01',
          'https://chordsequence.com/tools/key-detector/': '2026-05-01',
        };
        const lastmod = LASTMOD[item.url];
        return lastmod ? { ...item, lastmod } : item;
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