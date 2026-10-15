import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { beforeEach, expect, it } from 'vitest';
import { auditDist } from '../../../scripts/audit-dist.mjs';

const manifest = JSON.parse(
  readFileSync(join(import.meta.dirname, '../../manifest.json'), 'utf8'),
) as Record<string, unknown>;

let dir: string;
const put = (path: string, content: string) => {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), content);
};
const writeManifest = (value: Record<string, unknown>) =>
  put('manifest.json', JSON.stringify(value));

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'correctly-audit-'));
  writeManifest(manifest);
  put('service-worker.js', 'console;');
  put('icons/icon-16.png', 'png');
  put('icons/icon-48.png', 'png');
  put('icons/icon-128.png', 'png');
  put(
    'src/options/options.html',
    '<link rel="icon" href="/icons/icon-48.png"><script type="module" src="/options.js"></script><a href="https://aistudio.google.com/apikey">x</a>',
  );
  put('options.js', 'export {};');
});

it('B01: the real source manifest passes on a well-formed dist', () => {
  expect(auditDist(dir).errors).toEqual([]);
});

it('B01: extra permissions, broad hosts and missing assets fail', () => {
  writeManifest({
    ...manifest,
    permissions: ['storage', 'tabs'],
    host_permissions: ['<all_urls>'],
    options_page: 'missing.html',
  });
  const { errors } = auditDist(dir);
  expect(errors.join('\n')).toMatch(/permissions must be exactly/);
  expect(errors.join('\n')).toMatch(/host_permissions/);
  expect(errors.join('\n')).toMatch(/options page missing/);
});

it('B04: any content script or page-facing surface fails', () => {
  writeManifest({
    ...manifest,
    content_scripts: [{ matches: ['<all_urls>'], js: ['content-script.js'] }],
    web_accessible_resources: [],
  });
  const text = auditDist(dir).errors.join('\n');
  expect(text).toMatch(/content_scripts/);
  expect(text).toMatch(/web_accessible_resources/);
});

it('B02: key-shaped strings and the test sentinel are detected', () => {
  put('chunks/a.js', 'const k="AIza' + 'B'.repeat(35) + '";');
  put('chunks/b.js', 'const k="CORRECTLY_TEST_SENTINEL_KEY_1";');
  put('.env', 'GEMINI_API_KEY=x');
  const text = auditDist(dir).errors.join('\n');
  expect(text).toMatch(
    /a\.js: contains something shaped like a Google API key/,
  );
  expect(text).toMatch(/b\.js: contains test key sentinel/);
  expect(text).toMatch(/forbidden file type in dist: \.env/);
});

it('B03: legacy localhost/LanguageTool/Java and binaries are detected', () => {
  put('chunks/old.js', 'fetch("http://127.0.0.1:8081/v2/check")');
  put('chunks/lt.js', 'const engine = "LanguageTool";');
  put('runtime/bin/javaw.exe', 'MZ');
  put('server.jar', 'PK');
  const text = auditDist(dir).errors.join('\n');
  expect(text).toMatch(/127\.0\.0\.1/);
  expect(text).toMatch(/8081/);
  expect(text).toMatch(/LanguageTool/);
  expect(text).toMatch(/javaw\.exe/);
  expect(text).toMatch(/server\.jar/);
});

it('rejects eval and permissive CSP', () => {
  put('chunks/e.js', 'eval("1")');
  writeManifest({
    ...manifest,
    content_security_policy: {
      extension_pages: "script-src 'self' 'unsafe-eval'; object-src 'self'",
    },
  });
  const text = auditDist(dir).errors.join('\n');
  expect(text).toMatch(/eval\(\)/);
  expect(text).toMatch(/CSP/);
});
