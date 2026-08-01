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
    rollupOptions: {
      output: {
        // three dominates the bundle; splitting it lets the menu paint while
        // the heavier 3D chunk is still arriving.
        manualChunks: {
          three: ['three', '@react-three/fiber'],
          charts: ['recharts'],
        },
      },
    },
  },
});
