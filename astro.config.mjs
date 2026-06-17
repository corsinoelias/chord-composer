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
      filter: (page) => !page.includes('/app') && !page.includes('/editor') && !page.includes('/songs/new') && !page.includes('/privacy') && !page.includes('/terms'),
      customPages: [
        'https://chordsequence.com/songs/',
      ],
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