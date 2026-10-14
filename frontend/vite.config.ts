import { defineConfig } from 'vite';
import { copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const frontend = fileURLToPath(new URL('.', import.meta.url));
const dist = resolve(frontend, '../dist');
export default defineConfig({
  root: frontend,
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
    rollupOptions: {
      input: {
        'service-worker': resolve(frontend, 'src/background/service-worker.ts'),
        popup: resolve(frontend, 'src/popup/popup.html'),
        options: resolve(frontend, 'src/options/options.html'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name].js',
      },
    },
  },
});
