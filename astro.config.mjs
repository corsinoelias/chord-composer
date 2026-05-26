import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  site: 'https://chordsequence.com',
  integrations: [
    react(),
    mdx(),
    sitemap(),
  ],
  output: 'static',
  vite: {
    server: {
      // Serves /editor/ for any /editor/* URL in dev — mirrors the Netlify _redirects in production
      historyApiFallback: {
        rewrites: [{ from: /^\/editor\/.*$/, to: '/editor/' }],
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
});
