// Loads the browser data scripts (classic scripts that fill
// window.CorrectlyData) into Node, for the build and the checks.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

export function loadData() {
  const window = {};
  for (const file of ['fr.js', 'en.js', 'demo.js']) {
    const path = fileURLToPath(new URL(`../src/data/${file}`, import.meta.url));
    vm.runInNewContext(
      readFileSync(path, 'utf8'),
      { window },
      { filename: path },
    );
  }
  return window.CorrectlyData;
}
