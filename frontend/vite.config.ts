import { defineConfig } from 'vite';
import { copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const frontend = fileURLToPath(new URL('.', import.meta.url));
const dist = resolve(frontend, '../dist');
export default defineConfig({
  root: frontend,
  // Keep caches in the root node_modules instead of creating frontend/node_modules.
  cacheDir: resolve(frontend, '../node_modules/.vite'),
  plugins: [
    {
      name: 'manifest',
      closeBundle() {
        copyFileSync(
          resolve(frontend, 'manifest.json'),
          resolve(dist, 'manifest.json'),
        );
      },
    },
  ],
  build: {
    emptyOutDir: true,
    outDir: dist,
    sourcemap: false,
    // The polyfill would fetch() preloads; extension pages do not need it.
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: {
        'service-worker': resolve(frontend, 'src/background/service-worker.ts'),
        options: resolve(frontend, 'src/options/options.html'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
