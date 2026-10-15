import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectionController } from '../../src/background/connection-controller';
import { TRANSLATE_TEXT } from '../../src/shared/contracts';
import {
  PROVIDERS_KEY,
  addProfile,
  deleteProfile,
  loadProviders,
  mutateProviders,
  setRoute,
  type Route,
} from '../../src/shared/providers';
import { normalizeSettings } from '../../src/shared/settings';
import { SHORTCUTS_KEY } from '../../src/shared/shortcuts';
import { saveSettings } from '../../src/shared/storage';
import {
  FAKE_KEY,
  FakeStorage,
  GEMINI_ID,
  OPENAI_ID,
  OPENAI_KEY,
  geminiOk,
  jsonResponse,
  openaiOk,
  profile,
  quotaStore,
  seedProviders,
  usageToday,
} from '../helpers/fake-storage';

// V5.7: the same tasks through either provider, with the same local
// contracts, one call per action, and no fallback of any kind.

const TODAY = '2026-10-15';
const GEMINI_ROUTE: Route = {
  credentialId: GEMINI_ID,
  modelId: 'gemini-3.1-flash-lite',
};
const OPENAI_ROUTE: Route = {
  credentialId: OPENAI_ID,
  modelId: 'gpt-5.6-luna',
};
const GEMINI_HOST = 'https://generativelanguage.googleapis.com/';
const OPENAI_HOST = 'https://api.openai.com/';

let area: FakeStorage;
let fetchImpl: ReturnType<typeof vi.fn<typeof fetch>>;
let ids = 0;

const controller = (online = true) =>
  new ConnectionController({
    area,
    fetchImpl,
    today: () => TODAY,
    isOnline: () => online,
    timeoutMs: 50,
    placeholderTag: () => 'TAG777',
    operationId: () => `operation-${++ids}`,
  });

/** Answers in the envelope of whichever provider was called. */
const answer = (value: unknown) =>
  fetchImpl.mockImplementationOnce((url) =>
    Promise.resolve(
      jsonResponse(
        200,
        (url as string).startsWith(OPENAI_HOST)
          ? openaiOk(JSON.stringify(value), {
              input_tokens: 30,
              output_tokens: 12,
            })
          : geminiOk(JSON.stringify(value), {
              promptTokenCount: 30,
              candidatesTokenCount: 12,
            }),
      ),
    ),
  );
const hosts = () =>
  fetchImpl.mock.calls.map(([url]) =>
    (url as string).startsWith(OPENAI_HOST)
      ? 'openai'
      : (url as string).startsWith(GEMINI_HOST)
        ? 'gemini'
        : (url as string),
  );
/** The text the model received, whatever the provider. */
const sentText = (call = 0) => {
  const body = JSON.parse(fetchImpl.mock.calls[call]![1]!.body as string) as {
    input?: { role: string; content: string }[];
    contents?: { parts: { text: string }[] }[];
  };
  return body.input
    ? body.input.find((m) => m.role === 'user')!.content
    : body.contents![0]!.parts[0]!.text;
};

const routes = (value: Parameters<typeof seedProviders>[2]) =>
  seedProviders(
    area,
    [profile(GEMINI_ID, 'gemini'), profile(OPENAI_ID, 'openai')],
    value,
  );

beforeEach(async () => {
  area = new FakeStorage();
  fetchImpl = vi.fn<typeof fetch>();
  await saveSettings(
    area,
    normalizeSettings({
      correction: { consent: true },
      safety: { dailyTestAttemptLimit: 20 },
    }),
  );
});

describe('TASK: same contracts on both providers', () => {
  it.each([
    ['gemini', GEMINI_ROUTE],
    ['openai', OPENAI_ROUTE],
  ] as const)(
    'TASK-01/02 (%s): one detection+correction call, same result',
    async (provider, route) => {
      routes({ default: route });
      answer({ hasErrors: true, correctedText: 'Je suis allé à Lyon hier.' });
      expect(
        await controller().correct(' Je suis aller a Lyon hier. '),
      ).toEqual({
        ok: true,
        hasErrors: true,
        correctedText: ' Je suis allé à Lyon hier. ',
        suspicious: false,
      });
      expect(hosts()).toEqual([provider]);
    },
  );

  it.each([
    ['gemini', GEMINI_ROUTE],
    ['openai', OPENAI_ROUTE],
  ] as const)(
    'TASK-03 (%s): “no errors” stays no errors',
    async (_provider, route) => {
      routes({ default: route });
      answer({ hasErrors: false, correctedText: 'All good here.' });
      expect(await controller().correct('All good here.')).toEqual({
        ok: true,
        hasErrors: false,
      });
    },
  );

  it.each([
    ['gemini', GEMINI_ROUTE],
    ['openai', OPENAI_ROUTE],
  ] as const)(
    'TASK-09/10 (%s): two styles, one call, only the requested styles',
    async (provider, route) => {
      routes({ rewrite: route });
      answer({
        candidates: [
          { styleId: 'friendly', text: 'Hey, can we meet at 10?' },
          { styleId: 'formal', text: 'Could we meet at 10?' },
        ],
      });
      expect(
        await controller().rewrite('can we meet at 10', ['formal', 'friendly']),
      ).toEqual({
        ok: true,
        candidates: [
          {
            styleId: 'formal',
            text: 'Could we meet at 10?',
            suspicious: false,
          },
          {
            styleId: 'friendly',
            text: 'Hey, can we meet at 10?',
            suspicious: false,
          },
        ],
        missing: [],
      });
      expect(hosts()).toEqual([provider]);
    },
  );

  it.each([
    ['gemini', GEMINI_ROUTE],
    ['openai', OPENAI_ROUTE],
  ] as const)(
    'TASK-13 (%s): French → Syrian Arabic, one call',
    async (provider, route) => {
      routes({ translation: route });
      answer({
        status: 'translated',
        candidates: [{ styleId: 'neutral', text: 'مرحبا، كيفك؟' }],
      });
      const result = await controller().translate({
        type: TRANSLATE_TEXT,
        text: 'Salut, ça va ?',
        source: 'fr',
        target: 'ar',
        variant: 'syrian',
        styleIds: [],
      });
      expect(result).toEqual({
        ok: true,
        candidates: [
          { styleId: 'neutral', text: 'مرحبا، كيفك؟', suspicious: false },
        ],
        missing: [],
      });
      expect(hosts()).toEqual([provider]);
      const body = fetchImpl.mock.calls[0]![1]!.body as string;
      expect(body).toMatch(/Syrian/);
    },
  );

  it('TASK-15/RT-09: Translate & rewrite uses its own route, Translate uses the other', async () => {
    routes({ translation: GEMINI_ROUTE, translateRewrite: OPENAI_ROUTE });
    answer({
      status: 'translated',
      candidates: [{ styleId: 'formal', text: 'Hello.' }],
    });
    await controller().translate({
      type: TRANSLATE_TEXT,
      text: 'Salut.',
      source: 'auto',
      target: 'en',
      variant: null,
      styleIds: ['formal'],
    });
    answer({
      status: 'translated',
      candidates: [{ styleId: 'neutral', text: 'Hi.' }],
    });
    await controller().translate({
      type: TRANSLATE_TEXT,
      text: 'Salut.',
      source: 'auto',
      target: 'en',
      variant: null,
      styleIds: [],
    });
    expect(hosts()).toEqual(['openai', 'gemini']);
  });

  it('TASK-11/OA-11: a malformed answer is rejected without a second request', async () => {
    routes({ default: OPENAI_ROUTE });
    fetchImpl.mockResolvedValueOnce(
      jsonResponse(200, openaiOk('{"hasErrors": tru')),
    );
    expect(await controller().correct('Fixd text')).toMatchObject({
      code: 'INVALID_RESPONSE',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(await usageToday()).toMatchObject({
      attempts: 1,
      failed: 1,
      unknown: 0,
    });
  });

  it('OA-25: script-like answers are plain data (validated, never interpreted)', async () => {
    routes({ default: OPENAI_ROUTE });
    answer({
      hasErrors: true,
      correctedText: '<img src=x onerror=alert(1)> Fixed',
    });
    const result = await controller().correct(
      '<img src=x onerror=alert(1)> Fixd',
    );
    expect(result).toMatchObject({
      ok: true,
      correctedText: '<img src=x onerror=alert(1)> Fixed',
    });
  });
});

describe('TASK-16..20: V5.6 protection on OpenAI', () => {
  beforeEach(() => {
    routes({ default: OPENAI_ROUTE });
    area.data.set(SHORTCUTS_KEY, {
      schemaVersion: 2,
      revision: 1,
      enabled: false,
      shortcuts: [
        {
          id: 's1',
          trigger: 'cbj',
          replacement: 'business confidential text',
          enabled: true,
          protectTriggerInAi: true,
          protectReplacementInAi: false,
        },
      ],
    });
  });

  it('TASK-16/17: masked in the one request, dictionary never sent, restored', async () => {
    answer({
      hasErrors: true,
      correctedText: 'Please keep [[TAG777_1]] unchanged.',
    });
    const result = await controller().correct('Plese keep cbj unchanged.');
    expect(sentText()).toBe('Plese keep [[TAG777_1]] unchanged.');
    const body = fetchImpl.mock.calls[0]![1]!.body as string;
    expect(body).not.toContain('business');
    expect(body).toMatch(/\[\[TAG777_1\]\] are protected/);
    expect(result).toMatchObject({
      correctedText: 'Please keep cbj unchanged.',
    });
  });

  it('TASK-19/20: altered or duplicated markers are rejected', async () => {
    for (const correctedText of [
      'Please keep [[TAG777_2]] unchanged.',
      'Please keep [[TAG777_1]] [[TAG777_1]].',
      'Please keep it unchanged.',
    ]) {
      answer({ hasErrors: true, correctedText });
      expect(
        await controller().correct('Plese keep cbj unchanged.'),
      ).toMatchObject({
        code: 'INVALID_RESPONSE',
      });
    }
  });
});

describe('RT/Q: routing, limits and lifecycle', () => {
  it('RT-15/Q-12: a route changed mid-request does not reroute it; the next request uses the new route', async () => {
    routes({ default: GEMINI_ROUTE });
    fetchImpl.mockImplementationOnce(async () => {
      await mutateProviders(area, setRoute('default', OPENAI_ROUTE));
      return jsonResponse(
        200,
        geminiOk(JSON.stringify({ hasErrors: false, correctedText: 'Fine.' })),
      );
    });
    const c = controller();
    expect(await c.correct('Fine.')).toEqual({ ok: true, hasErrors: false });
    answer({ hasErrors: false, correctedText: 'Fine.' });
    await c.correct('Fine.');
    expect(hosts()).toEqual(['gemini', 'openai']);
  });

  it('Q-13/RACE-016: a key deleted after the reservation is never called; the slot is given back', async () => {
    routes({ default: OPENAI_ROUTE });
    const quota = quotaStore();
    // Delete the profile right after the reservation is committed.
    const admit = quota.admit.bind(quota);
    quota.admit = async (draft, now) => {
      const admission = await admit(draft, now);
      const { store } = await loadProviders(area);
      await mutateProviders(
        area,
        deleteProfile(store.profiles.find((p) => p.id === OPENAI_ID)!),
      );
      return admission;
    };
    const c = new ConnectionController({
      area,
      fetchImpl,
      quota,
      today: () => TODAY,
      isOnline: () => true,
      operationId: () => 'operation-q13',
    });
    expect(await c.correct('Fixd text')).toMatchObject({
      code: 'ROUTE_BROKEN',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await usageToday()).toMatchObject({
      attempts: 0,
      reserved: 0,
      inProgress: 0,
    });
  });

  it('Q-02/Q-03/Q-04: one limit for every provider and key — the last slot goes to one request', async () => {
    seedProviders(
      area,
      [
        profile(GEMINI_ID, 'gemini'),
        profile('gemini-backup-1', 'gemini'),
        profile(OPENAI_ID, 'openai'),
      ],
      {
        correction: OPENAI_ROUTE,
        rewrite: GEMINI_ROUTE,
        translation: {
          credentialId: 'gemini-backup-1',
          modelId: 'gemini-3.1-flash-lite',
        },
      },
    );
    await saveSettings(
      area,
      normalizeSettings({
        correction: { consent: true },
        safety: { dailyTestAttemptLimit: 2 },
      }),
    );
    fetchImpl.mockImplementation((url) =>
      Promise.resolve(
        jsonResponse(
          200,
          (url as string).startsWith(OPENAI_HOST)
            ? openaiOk(
                JSON.stringify({ hasErrors: false, correctedText: 'A.' }),
              )
            : geminiOk(
                JSON.stringify({
                  candidates: [{ styleId: 'formal', text: 'A.' }],
                }),
              ),
        ),
      ),
    );
    // Several tabs, one worker: three actions race for the last two slots.
    const worker = controller();
    const results = await Promise.all([
      worker.correct('A.'),
      worker.rewrite('A.', ['formal']),
      worker.translate({
        type: TRANSLATE_TEXT,
        text: 'A.',
        source: 'auto',
        target: 'fr',
        variant: null,
        styleIds: [],
      }),
    ]);
    expect(
      results.filter((r) => !r.ok && r.code === 'QUOTA_EXCEEDED'),
    ).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect((await usageToday()).attempts).toBe(2);
  });

  it('Q-01/Q-09: usage is attributed per provider, key, model and task; a timeout is billing-unknown', async () => {
    routes({ correction: OPENAI_ROUTE, rewrite: GEMINI_ROUTE });
    answer({ hasErrors: false, correctedText: 'Fine.' });
    await controller().correct('Fine.');
    fetchImpl.mockImplementationOnce(
      (_url, init) =>
        new Promise((_, reject) =>
          init!.signal!.addEventListener('abort', () =>
            reject(new DOMException('x', 'AbortError')),
          ),
        ),
    );
    expect(await controller().rewrite('Fine.', ['formal'])).toMatchObject({
      code: 'TIMEOUT',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const usage = await usageToday();
    expect(usage).toMatchObject({
      attempts: 2,
      completed: 1,
      unknown: 1,
      failed: 0,
      reserved: 0,
    });
    expect(
      [...usage.rows].sort((a, b) => a.task.localeCompare(b.task)),
    ).toEqual([
      {
        task: 'correction',
        provider: 'openai',
        credentialId: OPENAI_ID,
        modelId: 'gpt-5.6-luna',
        attempts: 1,
        completed: 1,
        failed: 0,
        unknown: 0,
        inputTokens: 30,
        outputTokens: 12,
      },
      {
        task: 'rewrite',
        provider: 'gemini',
        credentialId: GEMINI_ID,
        modelId: 'gemini-3.1-flash-lite',
        attempts: 1,
        completed: 0,
        failed: 0,
        unknown: 1,
        inputTokens: 0,
        outputTokens: 0,
      },
    ]);
    expect(usage.snapshot.usage).toMatchObject({
      'provider:openai|daily': { counted: 1 },
      'provider:gemini|monthly': { counted: 1 },
      'task:correction|weekly': { counted: 1 },
    });
    expect(JSON.stringify(usage)).not.toMatch(/Fine|SENTINEL/);
  });

  it('Q-11/RACE-009/010: after a worker restart, sent requests become unknown and are never replayed', async () => {
    routes({ default: OPENAI_ROUTE });
    // A previous worker reserved two requests, marked one sent, then died.
    const quota = quotaStore();
    const now = Date.now();
    await controller().reconcile();
    const draft = {
      bootId: 'previous-worker',
      task: 'correction' as const,
      provider: 'openai' as const,
      credentialId: OPENAI_ID,
      revision: 1,
      modelId: 'gpt-5.6-luna',
    };
    await quota.admit({ ...draft, id: 'operation-sent' }, now);
    await quota.dispatch('operation-sent', now);
    await quota.admit({ ...draft, id: 'operation-unsent' }, now);
    expect(await usageToday()).toMatchObject({
      attempts: 1,
      reserved: 1,
      inProgress: 2,
    });
    await controller().reconcile();
    // Sent: counted for good, billing unknown. Never sent: given back.
    expect(await usageToday()).toMatchObject({
      attempts: 1,
      reserved: 0,
      unknown: 1,
      inProgress: 0,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('Q-14/OA-28: double clicks are two serialized single calls, never a burst or a retry', async () => {
    routes({ default: OPENAI_ROUTE });
    fetchImpl.mockResolvedValue(
      jsonResponse(429, { error: { code: 'rate_limit_exceeded' } }),
    );
    const c = controller();
    const results = await Promise.all([c.correct('A b.'), c.correct('A b.')]);
    expect(results.every((r) => !r.ok && r.code === 'RATE_LIMITED')).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(hosts()).toEqual(['openai', 'openai']);
  });

  it('T14/Q-19: errors on one provider never touch the other key or provider', async () => {
    routes({ default: OPENAI_ROUTE });
    for (const status of [401, 403, 404, 429, 500, 503]) {
      fetchImpl.mockResolvedValueOnce(jsonResponse(status, {}));
      expect(await controller().correct('A b.')).toMatchObject({ ok: false });
    }
    expect(new Set(hosts())).toEqual(new Set(['openai']));
    const sentKeys = fetchImpl.mock.calls.map(
      ([, init]) => (init!.headers as Record<string, string>).Authorization,
    );
    expect(new Set(sentKeys)).toEqual(new Set([`Bearer ${OPENAI_KEY}`]));
  });

  it('INV-02: no consent, no route or offline → no request and no attempt', async () => {
    routes({ default: OPENAI_ROUTE });
    expect(await controller(false).correct('A.')).toMatchObject({
      code: 'NETWORK_ERROR',
    });
    await saveSettings(
      area,
      normalizeSettings({ correction: { consent: false } }),
    );
    expect(await controller().correct('A.')).toMatchObject({
      code: 'CONSENT_REQUIRED',
    });
    area.data.delete(PROVIDERS_KEY);
    await saveSettings(
      area,
      normalizeSettings({ correction: { consent: true } }),
    );
    expect(await controller().correct('A.')).toMatchObject({
      code: 'NOT_CONFIGURED',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect((await usageToday()).attempts).toBe(0);
  });

  it('KEY-02 → RT-05: a key added in the settings works only once routed', async () => {
    await mutateProviders(
      area,
      addProfile({
        provider: 'openai',
        label: 'OpenAI Personal',
        key: OPENAI_KEY,
      }),
    );
    expect(await controller().correct('A.')).toMatchObject({
      code: 'NOT_CONFIGURED',
    });
    const { store } = await loadProviders(area);
    await mutateProviders(
      area,
      setRoute('default', {
        credentialId: store.profiles[0]!.id,
        modelId: 'gpt-5-nano',
      }),
    );
    answer({ hasErrors: false, correctedText: 'A.' });
    expect(await controller().correct('A.')).toEqual({
      ok: true,
      hasErrors: false,
    });
    expect(hosts()).toEqual(['openai']);
    expect(
      JSON.parse(fetchImpl.mock.calls[0]![1]!.body as string),
    ).toMatchObject({
      model: 'gpt-5-nano',
      reasoning: { effort: 'minimal' },
    });
    expect(area.dump()).not.toContain(FAKE_KEY);
  });
});
