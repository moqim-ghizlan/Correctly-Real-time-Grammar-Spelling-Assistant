import { defineConfig } from 'vite';
export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: 'src/content/content-script.ts',
      name: 'Correctly',
      formats: ['iife'],
      fileName: () => 'content-script.js',
    },
  },
});
