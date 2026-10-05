import { expect, it } from 'vitest';
import { lines, siteNames } from '../../src/shared/settings-ui';
it('deduplicates dictionary words without changing case', () => {
  expect(lines(' OpenAI\r\nMoqim\nOpenAI\n')).toEqual(['OpenAI', 'Moqim']);
});
it('normalizes exact hostnames and URLs', () => {
  expect(siteNames('EXAMPLE.com\nhttps://example.org/page')).toEqual([
    'example.com',
    'example.org',
  ]);
});
it.each([
  '*.example.com',
  'ftp://example.com',
  'https://user:pass@example.com',
  'example.com/path',
  'example.com?q=test',
])('rejects invalid site %s', (site) => {
  expect(() => siteNames(site)).toThrow();
});
