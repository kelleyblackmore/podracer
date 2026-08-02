import { defineConfig } from 'vitest/config';

// Kept separate from vite.config.ts so the app build and the test run cannot
// affect one another. The simulation is DOM-free, so these run in plain Node.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Full-race integration tests step thousands of frames across 11 circuits.
    testTimeout: 60_000,
  },
});
