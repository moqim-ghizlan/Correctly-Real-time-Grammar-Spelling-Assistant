import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
const frontend = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({
  root: frontend,
  build: {
    outDir: '../dist',
    emptyOutDir: false,
    lib: {
      entry: fileURLToPath(
        new URL('src/content/content-script.ts', import.meta.url),
      ),
      name: 'Correctly',
      formats: ['iife'],
      fileName: () => 'content-script.js',
    },
  },
});
