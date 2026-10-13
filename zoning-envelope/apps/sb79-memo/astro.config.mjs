// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';

export default defineConfig({
  integrations: [mdx(), react()],
  vite: {
    build: {
      // esbuild keeps media queries as written; lightningcss rewrites them to
      // range syntax, which Paged.js (the print version) cannot parse.
      cssMinify: 'esbuild',
    },
  },
});
