import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The repository name doubles as the GitHub Pages sub-path. Override with
// BASE_PATH=/ when serving from a custom domain or the user/org root site.
const base = process.env.BASE_PATH ?? '/podracer/';

export default defineConfig({
  base,
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1200,
    // No manualChunks. Forcing `three` and `recharts` into named chunks pushed
    // their shared vendor code (React) into those chunks, which made the entry
    // import from them statically — so both were module-preloaded on first
    // paint even though the views that use them are lazily imported. Letting
    // Rollup split automatically keeps them in the lazy graph where they belong.
  },
});
