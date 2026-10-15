import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const frontend = fileURLToPath(new URL('.', import.meta.url));
// chrome.scripting injects and registers classic scripts only, so each content
// script is bundled alone (no shared module chunks) after the main build:
// content.js by default, smart.js with --mode smart.
export default defineConfig(({ mode }) => ({
  root: frontend,
  cacheDir: resolve(frontend, '../node_modules/.vite'),
  publicDir: false,
  build: {
    emptyOutDir: false,
    outDir: resolve(frontend, '../dist'),
    sourcemap: false,
    lib: {
      entry: resolve(
        frontend,
        mode === 'smart' ? 'src/content/smart.ts' : 'src/content/index.ts',
      ),
      formats: ['iife'],
      name: 'correctlyContent',
      fileName: () => (mode === 'smart' ? 'smart.js' : 'content.js'),
    },
  },
}));
