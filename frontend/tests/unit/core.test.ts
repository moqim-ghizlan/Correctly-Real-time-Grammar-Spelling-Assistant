import { afterEach, describe, expect, it, vi } from 'vitest';
import { findFields, isEditableField } from '../../src/content/field-detector';
import { getTextFromField } from '../../src/content/text-extractor';
import { debounce } from '../../src/shared/debounce';
import { CorrectionCache } from '../../src/correction/correction-cache';
import {
  LanguageToolClient,
  normalizeMatches,
} from '../../src/correction/languagetool-client';
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  enabledOnSite,
} from '../../src/shared/storage';
import { isLanguage } from '../../src/correction/language';
import {
  createFieldState,
  visibleMatches,
} from '../../src/content/field-state';
import { CorrectionController } from '../../src/content/correction-controller';
import type { CheckResult } from '../../src/correction/correction-types';
import { observeFields } from '../../src/content/observers';
const payload = {
  matches: [
    {
      offset: 3,
      length: 3,
      message: 'Orthographe',
      replacements: [{ value: 'suis' }],
      rule: {
        id: 'SPELL',
        issueType: 'misspelling',
        category: { id: 'TYPOS' },
      },
    },
  ],
};
const matches = normalizeMatches(payload, 'je sui ici');
afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});
describe('field detection', () => {
  it.each([
    ['textarea', true],
    ['input', true],
    ['input type="text"', true],
    ['input type="search"', true],
    ['input type="password"', false],
    ['input type="number"', false],
    ['input type="email"', true],
    ['div', false],
    ['div contenteditable="true"', true],
    ['div contenteditable="true" role="textbox"', true],
    ['textarea readonly', false],
    ['input disabled', false],
  ])('%s → %s', (tag, expected) => {
    document.body.innerHTML = '<' + tag + '>';
    expect(isEditableField(document.body.firstElementChild!)).toBe(expected);
  });
  it('does not register nested editors or explicitly non-editable islands', () => {
    document.body.innerHTML =
      '<div contenteditable="true"><div contenteditable="true"></div><div contenteditable="false"><input></div></div>';
    expect(findFields(document.body)).toHaveLength(1);
  });
  it('extracts input values and editable line breaks', () => {
    const field = document.createElement('textarea');
    field.value = 'é 😊';
    expect(getTextFromField(field)).toBe('é 😊');
    const editor = document.createElement('div');
    editor.innerHTML = '<div>un</div><div>deux<br>trois</div>';
    expect(getTextFromField(editor)).toBe('un\ndeux\ntrois');
  });
  it('detects dynamic containers and cleans up removal', async () => {
    const register = vi.fn(),
      prune = vi.fn();
    const stop = observeFields(document.body, prune);
    const container = document.createElement('div');
    container.innerHTML = '<textarea></textarea><input>';
    document.body.append(container);
    await Promise.resolve();
    expect(register).not.toHaveBeenCalled();
    container.remove();
    await Promise.resolve();
    expect(prune).toHaveBeenCalled();
    stop();
  });
});
it('debounces ten calls and cancels pending work', () => {
  vi.useFakeTimers();
  const callback = vi.fn(),
    timer = debounce(callback, 400);
  for (let i = 0; i < 10; i++) timer.schedule();
  vi.advanceTimersByTime(399);
  expect(callback).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(callback).toHaveBeenCalledTimes(1);
  timer.schedule();
  timer.cancel();
  vi.advanceTimersByTime(400);
  expect(callback).toHaveBeenCalledTimes(1);
});
it('bounds the cache and separates languages', () => {
  const cache = new CorrectionCache();
  cache.set('same', 'fr', matches);
  expect(cache.get('same', 'en')).toBeUndefined();
  for (let i = 0; i < 101; i++) cache.set(String(i), 'fr', []);
  expect(cache.size).toBe(100);
  expect(cache.get('0', 'fr')).toBeUndefined();
  expect(cache.get('100', 'fr')).toEqual([]);
});
describe('LanguageTool', () => {
  it.each([0, 1, 2])('normalizes %i errors', (count) => {
    expect(
      normalizeMatches(
        { matches: Array.from({ length: count }, () => payload.matches[0]) },
        'je sui ici',
      ),
    ).toHaveLength(count);
  });
  it('accepts an error without a suggestion', () => {
    expect(
      normalizeMatches(
        { matches: [{ ...payload.matches[0], replacements: [] }] },
        'je sui ici',
      )[0]?.replacements,
    ).toEqual([]);
  });
  it('caches successful requests without persisting text', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(payload)));
    const client = new LanguageToolClient(fetcher);
    expect((await client.checkText('je sui ici', 'fr')).status).toBe('ready');
    await client.checkText('je sui ici', 'fr');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe('http://127.0.0.1:8081/v2/check');
    expect(
      (fetcher.mock.calls[0]?.[1]?.body as URLSearchParams).toString(),
    ).toContain('language=fr');
  });
  it.each(['http', 'json', 'rejected', 'malformed'])(
    'handles %s failure with cooldown',
    async (mode) => {
      const fetcher = vi.fn<typeof fetch>();
      if (mode === 'rejected') fetcher.mockRejectedValue(new Error('offline'));
      else
        fetcher.mockResolvedValue(
          new Response(
            mode === 'json' ? '{' : mode === 'malformed' ? '{}' : '',
            { status: mode === 'http' ? 500 : 200 },
          ),
        );
      const client = new LanguageToolClient(fetcher);
      expect((await client.checkText('one', 'en')).status).toBe('unavailable');
      await client.checkText('two', 'en');
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it('aborts after timeout then retries only after cooldown', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new Error('aborted')),
          );
        }),
    );
    const client = new LanguageToolClient(fetcher);
    const request = client.checkText('test', 'auto');
    await vi.advanceTimersByTimeAsync(8000);
    expect((await request).status).toBe('unavailable');
    await client.checkText('test2', 'auto');
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10000);
    const retry = client.checkText('test2', 'auto');
    await vi.advanceTimersByTimeAsync(8000);
    await retry;
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('skips blank and overlong input', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const client = new LanguageToolClient(fetcher);
    expect((await client.checkText('', 'fr')).status).toBe('ready');
    expect((await client.checkText('a'.repeat(5001), 'fr')).status).toBe(
      'too-long',
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects out-of-bounds offsets', () => {
    expect(() => normalizeMatches(payload, 'a')).toThrow();
  });
});
describe('controller', () => {
  function setup() {
    const field = document.createElement('textarea');
    field.value = 'je sui ici';
    document.body.append(field);
    const state = createFieldState(field, '1');
    return { field, state };
  }
  it('ignores stale responses, including during the debounce gap', async () => {
    const { field, state } = setup();
    let resolveA!: (value: CheckResult) => void;
    const check = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<CheckResult>((resolve) => {
            resolveA = resolve;
          }),
      )
      .mockResolvedValue({ status: 'ready', matches: [] });
    const controller = new CorrectionController(
      state,
      DEFAULT_SETTINGS,
      check,
      vi.fn(),
    );
    const a = controller.analyze();
    field.value = 'correct text';
    controller.changed();
    await controller.analyze();
    resolveA({ status: 'ready', matches });
    await a;
    expect(state.sourceText).toBe('correct text');
    expect(state.matches).toEqual([]);
    controller.dispose();
  });
  it('keeps ignore for the occurrence and resets after edits', async () => {
    const { state, field } = setup();
    const controller = new CorrectionController(
      state,
      DEFAULT_SETTINGS,
      () => Promise.resolve({ status: 'ready', matches }),
      vi.fn(),
    );
    await controller.analyze();
    controller.ignore(matches[0]!.id);
    expect(visibleMatches(state)).toEqual([]);
    await controller.analyze();
    expect(visibleMatches(state)).toEqual([]);
    field.value += '!';
    controller.changed();
    expect(state.ignoredMatches.size).toBe(0);
    controller.dispose();
  });
  it('optimistically shifts remaining matches and triggers immediate analysis on replacement', () => {
    const { state, field } = setup();
    field.value = 'je sui venut';
    state.currentText = 'je sui venut';
    state.sourceText = 'je sui venut';
    const match1 = {
      id: 'm1',
      offset: 3,
      length: 3,
      originalFragment: 'sui',
      sourceText: 'je sui venut',
      category: 'spelling' as const,
      replacements: ['suis'],
      message: 'Faute',
      ruleId: 'RULE1',
    };
    const match2 = {
      id: 'm2',
      offset: 7,
      length: 5,
      originalFragment: 'venut',
      sourceText: 'je sui venut',
      category: 'spelling' as const,
      replacements: ['venu'],
      message: 'Faute',
      ruleId: 'RULE2',
    };
    state.matches = [match1, match2];
    const render = vi.fn();
    const check = vi.fn().mockResolvedValue({
      status: 'ready',
      matches: [{ ...match2, offset: 8, sourceText: 'je suis venut' }],
    });
    const controller = new CorrectionController(
      state,
      DEFAULT_SETTINGS,
      check,
      render,
    );
    const success = controller.replaceMatch(match1, 'suis');
    expect(success).toBe(true);
    expect(field.value).toBe('je suis venut');
    expect(state.currentText).toBe('je suis venut');
    expect(state.matches).toHaveLength(1);
    expect(state.matches[0]?.offset).toBe(8);
    expect(render).toHaveBeenCalled();
    expect(check).toHaveBeenCalledTimes(1);
    controller.dispose();
  });
  it('keeps fields independent and handles rejected checks', async () => {
    const a = setup(),
      b = setup();
    const controller = new CorrectionController(
      a.state,
      DEFAULT_SETTINGS,
      () => Promise.reject(new Error()),
      vi.fn(),
    );
    await controller.analyze();
    expect(a.state.status).toBe('unavailable');
    expect(b.state.status).toBe('idle');
    controller.dispose();
  });
});
it('validates language and settings', () => {
  expect(['auto', 'fr', 'en'].every(isLanguage)).toBe(true);
  expect(isLanguage('de')).toBe(false);
  expect(
    normalizeSettings({ language: 'invalid', debounceMs: -4, enabled: 'no' }),
  ).toMatchObject({ language: 'auto', debounceMs: 0, enabled: true });
  expect(
    enabledOnSite(
      { ...DEFAULT_SETTINGS, disabledSites: ['example.com'] },
      'example.com',
    ),
  ).toBe(false);
});
