import { afterEach, expect, it, vi } from 'vitest';
import { LanguageToolClient } from '../../src/correction/languagetool-client';
afterEach(() => vi.unstubAllGlobals());
it('calls fetch without binding the correction client as its receiver', async () => {
  const fetcher = vi.fn(function (this: unknown) {
    if (this !== undefined) throw new TypeError('Illegal invocation');
    return Promise.resolve(new Response(JSON.stringify({ matches: [] })));
  });
  const client = new LanguageToolClient(fetcher);
  expect((await client.checkText('je sui ici', 'auto')).status).toBe('ready');
  expect(fetcher.mock.contexts[0]).toBeUndefined();
});
it.each(['auto', 'fr', 'en'] as const)(
  'sends supported LanguageTool parameters for %s',
  async (language) => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation((_input, init) => {
      const body = init?.body as URLSearchParams;
      if (language !== 'auto' && body.has('preferredVariants'))
        return Promise.resolve(
          new Response('Invalid parameters', { status: 400 }),
        );
      return Promise.resolve(new Response(JSON.stringify({ matches: [] })));
    });
    expect(
      (await new LanguageToolClient(fetcher).checkText('test text', language))
        .status,
    ).toBe('ready');
    const body = fetcher.mock.calls[0]?.[1]?.body as URLSearchParams;
    expect(body.get('language')).toBe(language);
    expect(body.has('preferredVariants')).toBe(language === 'auto');
  },
);
it('returns a safe HTTP diagnostic without logging response bodies or user text', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response('private server details', { status: 400 }));
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const client = new LanguageToolClient(fetcher);
  const result = await client.checkText('private user text', 'fr');
  expect(result.status).toBe('unavailable');
  expect(result.status === 'unavailable' ? result.reason : '').toContain(
    'HTTP 400',
  );
  await client.checkText('different private text', 'fr');
  expect(warn).toHaveBeenCalledTimes(1);
  expect(warn.mock.calls.flat().join(' ')).not.toContain('private');
});
