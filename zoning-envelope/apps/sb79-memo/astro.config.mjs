// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';

export default defineConfig({
  // The site's path: "/" locally, "/<repo>/" on GitHub Pages (set by
  // .github/workflows/pages.yml). Keep the trailing slash: code joins
  // import.meta.env.BASE_URL straight onto file names.
  base: process.env.BASE_PATH ?? '/',
  integrations: [mdx(), react()],
  vite: {
    build: {
      // esbuild keeps media queries as written; lightningcss rewrites them to
      // range syntax, which Paged.js (the print version) cannot parse.
      cssMinify: 'esbuild',
    },
  },
});
