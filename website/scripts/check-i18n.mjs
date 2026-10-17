// Static checks run before every build (and by `npm run check`):
//  - fr.js and en.js have exactly the same keys, none empty;
//  - every key used by index.html and the scripts exists, and every key in
//    the dictionaries is used;
//  - demo samples have the same shape in both languages.
// Exits with code 1 and a list of problems on failure.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { loadData } from './load-data.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const { fr, en, DEMO, FORMATS, LENGTHS, STYLE_IDS, TARGETS } = loadData();
const KINDS = ['correction', 'rewrite', 'translation', 'summary'];

/** Keys built at runtime from templates in the scripts. */
function dynamicKeys() {
  const keys = [];
  for (const kind of KINDS)
    for (const prefix of [
      'demo.go',
      'demo.wait',
      'demo.applied',
      'demo.undo',
      'demo.undone',
    ])
      keys.push(`${prefix}.${kind}`);
  for (const id of STYLE_IDS) keys.push(`st.${id}`);
  for (let level = 1; level <= 5; level++) keys.push(`fl.${level}`);
  for (const id of TARGETS) keys.push(`ln.${id}`);
  keys.push(
    'v.msa',
    'v.syrian',
    'theme.system',
    'theme.light',
    'theme.dark',
    'nav.menuOpen',
    'nav.menuClose',
    // film.js labels its buttons by state.
    'film.play',
    'film.pause',
    'film.mute',
    'film.unmute',
    'film.full',
    'film.exitFull',
    // demo.js picks one of these with a ternary.
    'demo.copied',
    'demo.copyFailed',
  );
  return keys;
}

export async function check() {
  const problems = [];
  const frKeys = Object.keys(fr);
  const enKeys = new Set(Object.keys(en));
  for (const key of frKeys)
    if (!enKeys.has(key)) problems.push(`en.js is missing "${key}"`);
  for (const key of enKeys)
    if (!(key in fr)) problems.push(`fr.js is missing "${key}"`);
  for (const [name, dict] of [
    ['fr', fr],
    ['en', en],
  ])
    for (const [key, value] of Object.entries(dict))
      if (typeof value !== 'string' || value === '')
        problems.push(`${name}.js: "${key}" is empty`);

  const html = await readFile(join(ROOT, 'index.html'), 'utf8');
  const used = new Set(dynamicKeys());
  for (const [, key] of html.matchAll(/data-i18n="([^"]+)"/g)) used.add(key);
  for (const [, pairs] of html.matchAll(/data-i18n-attr="([^"]+)"/g))
    for (const pair of pairs.split(';')) used.add(pair.split(':')[1].trim());
  const scripts = [
    'demo.js',
    'i18n.js',
    'nav.js',
    'page.js',
    'copy.js',
    'theme.js',
    'motion.js',
    'film.js',
  ];
  for (const file of scripts) {
    const source = await readFile(
      new URL(`../src/js/${file}`, import.meta.url),
      'utf8',
    );
    for (const [, key] of source.matchAll(
      /\b(?:t|keyed\('[a-z]+',)\s*\(?\s*'([a-zA-Z0-9_.]+)'/g,
    ))
      used.add(key);
  }
  for (const [, key] of html.matchAll(/data-copy-(?:ok|fail)="([^"]+)"/g))
    used.add(key);
  for (const key of used)
    if (!(key in fr))
      problems.push(`key "${key}" is used but missing from the dictionaries`);
  for (const key of frKeys)
    if (!used.has(key)) problems.push(`key "${key}" is never used: remove it`);

  for (const lang of ['fr', 'en']) {
    const samples = DEMO[lang];
    if (!samples?.length) problems.push(`demo.js: no samples for ${lang}`);
    for (const [index, s] of (samples ?? []).entries()) {
      const where = `demo.js ${lang}[${index}]`;
      if (s.lang !== lang) problems.push(`${where}: lang should be ${lang}`);
      for (const field of ['text', 'correction'])
        if (!s[field]) problems.push(`${where}: missing ${field}`);
      for (const id of STYLE_IDS.filter((id) => id !== 'custom'))
        if (!s.rewrite?.[id]) problems.push(`${where}: missing rewrite.${id}`);
      if (s.rewrite?.custom?.length !== 5)
        problems.push(`${where}: rewrite.custom needs 5 levels`);
      for (const id of TARGETS.filter((id) => id !== s.lang)) {
        const keys = id === 'ar' ? ['ar_msa', 'ar_syrian'] : [id];
        for (const key of keys)
          if (!s.translation?.[key])
            problems.push(`${where}: missing translation.${key}`);
      }
      for (const length of LENGTHS)
        for (const format of FORMATS) {
          const value = s.summary?.[length]?.[format];
          if (
            !(format === 'points'
              ? Array.isArray(value) && value.length
              : value)
          )
            problems.push(`${where}: missing summary.${length}.${format}`);
        }
    }
  }
  if (DEMO.fr.length !== DEMO.en.length)
    problems.push('demo.js: fr and en need the same number of samples');
  return problems;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const problems = await check();
  if (problems.length) {
    console.error(
      `i18n check: ${problems.length} problem(s)\n- ${problems.join('\n- ')}`,
    );
    process.exit(1);
  }
  console.log(
    `i18n check: OK (${Object.keys(fr).length} keys in fr and en, ${DEMO.fr.length + DEMO.en.length} demo samples)`,
  );
}
