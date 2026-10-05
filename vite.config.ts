import { defineConfig } from 'vite';
import { copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
export default defineConfig({
  plugins: [
    {
      name: 'manifest',
      closeBundle() {
        copyFileSync('manifest.json', 'dist/manifest.json');
      },
    },
  ],
  build: {
    rollupOptions: {
      input: {
        'service-worker': resolve('src/background/service-worker.ts'),
        popup: resolve('src/popup/popup.html'),
        options: resolve('src/options/options.html'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name].js',
      },
    },
  },
});
