import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  // Keep caches in the root node_modules instead of creating frontend/node_modules.
  cacheDir: fileURLToPath(new URL('../node_modules/.vite', import.meta.url)),
  test: {
    environment: 'jsdom',
    restoreMocks: true,
    clearMocks: true,
    setupFiles: ['tests/helpers/setup.ts'],
  },
});
