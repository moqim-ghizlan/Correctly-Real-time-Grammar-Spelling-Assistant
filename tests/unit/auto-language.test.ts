import { expect, it, vi } from 'vitest';
import { LanguageToolClient } from '../../src/correction/languagetool-client';
import {
  preferredAutoLanguage,
  isSupportedLanguageCode,
} from '../../src/correction/language';
it.each([
  ['i has 300€', 'en'],
  ['I has a car.', 'en'],
  ['She go to school.', 'en'],
  ['hello world', 'en'],
  ['je sui ici', 'fr'],
  ['Il sont parti hier.', 'fr'],
  ['je vais a paris demain', 'fr'],
  ['Bonjour, merci !', 'fr'],
  ['été', 'fr'],
  ['300€', 'fr'],
])('prefers %s → %s on short text', (text, expected) => {
  expect(preferredAutoLanguage(text)).toBe(expected);
});
it.each([
  ['fr', true],
  ['en-US', true],
  ['en-GB', true],
  ['fr-CA', true],
  ['ga-IE', false],
  ['sl-SI', false],
  ['english', false],
  ['auto', false],
])('accepts only French/English response code %s', (code, expected) => {
  expect(isSupportedLanguageCode(code)).toBe(expected);
});
it.each([
  ['i has 300€', 'en,fr'],
  ['je sui ici', 'fr,en'],
])('constrains engine detection for %s', async (text, languages) => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(
      JSON.stringify({
        language: { code: languages.startsWith('en') ? 'en-US' : 'fr' },
        matches: [],
      }),
    ),
  );
  expect(
    (await new LanguageToolClient(fetcher).checkText(text, 'auto')).status,
  ).toBe('ready');
  const body = fetcher.mock.calls[0]?.[1]?.body as URLSearchParams;
  expect(body.get('preferredLanguages')).toBe(languages);
  expect(body.get('forcePreferredLanguages')).toBe('true');
  expect(body.get('preferredVariants')).toBe('en-US');
});
it('rechecks as English if an older server ignores the restriction, and caches only the supported result', async () => {
  const foreign = {
    language: { code: 'ga-IE' },
    matches: [
      {
        offset: 0,
        length: 5,
        message: 'Ba chóir duit',
        replacements: [{ value: 'in as' }],
        rule: { id: 'IRISH', category: { id: 'GRAMMAR' } },
      },
    ],
  };
  const english = {
    language: { code: 'en' },
    matches: [
      {
        offset: 2,
        length: 3,
        message: 'Use the base form here.',
        replacements: [{ value: 'have' }],
        rule: { id: 'ENGLISH', category: { id: 'GRAMMAR' } },
      },
    ],
  };
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(JSON.stringify(foreign)))
    .mockResolvedValueOnce(new Response(JSON.stringify(english)));
  const client = new LanguageToolClient(fetcher);
  const result = await client.checkText('i has 300€', 'auto');
  expect(result.status).toBe('ready');
  expect(result.matches[0]?.replacements).toEqual(['have']);
  const retryBody = fetcher.mock.calls[1]?.[1]?.body as URLSearchParams;
  expect(retryBody.get('language')).toBe('en');
  expect(retryBody.has('preferredLanguages')).toBe(false);
  expect(retryBody.has('preferredVariants')).toBe(false);
  await client.checkText('i has 300€', 'auto');
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('does not display a third-language result if even an explicit retry is ignored', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ language: { code: 'ga-IE' }, matches: [] }),
        ),
      ),
    );
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  expect(
    (await new LanguageToolClient(fetcher).checkText('i has 300€', 'auto'))
      .status,
  ).toBe('unavailable');
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it.each(['fr', 'en'] as const)(
  'keeps explicit %s free of auto-only parameters',
  async (language) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ language: { code: language }, matches: [] }),
        ),
      );
    await new LanguageToolClient(fetcher).checkText('test', language);
    const body = fetcher.mock.calls[0]?.[1]?.body as URLSearchParams;
    expect(body.has('preferredLanguages')).toBe(false);
    expect(body.has('forcePreferredLanguages')).toBe(false);
    expect(body.has('preferredVariants')).toBe(false);
  },
);
