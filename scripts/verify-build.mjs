import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, sep } from 'node:path';
import assert from 'node:assert/strict';
import console from 'node:console';
const root = resolve('dist');
const manifest = JSON.parse(
  readFileSync(resolve(root, 'manifest.json'), 'utf8'),
);
function checkFile(path) {
  const full = resolve(root, path);
  assert(full.startsWith(root + sep), 'Asset hors de dist');
  assert(
    existsSync(full) && statSync(full).isFile(),
    'Asset manquant : ' + path,
  );
  return full;
}
assert.equal(manifest.manifest_version, 3);
checkFile(manifest.background.service_worker);
for (const path of Object.values(manifest.icons)) checkFile(path);
for (const content of manifest.content_scripts)
  for (const path of content.js) {
    const code = readFileSync(checkFile(path), 'utf8');
    assert(
      !/(^|\n)\s*(?:import|export)\s/m.test(code),
      'Le content script doit être autonome',
    );
  }
for (const path of [manifest.action.default_popup, manifest.options_page]) {
  const full = checkFile(path),
    html = readFileSync(full, 'utf8');
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const asset = match[1];
    if (asset.startsWith('/') && !asset.startsWith('//'))
      checkFile(asset.slice(1));
    else if (!asset.includes(':')) {
      const fullAsset = resolve(dirname(full), asset);
      assert(
        fullAsset.startsWith(root + sep) && existsSync(fullAsset),
        'Asset HTML manquant : ' + asset,
      );
    }
  }
}
console.info('Manifest et assets de l’extension vérifiés.');
