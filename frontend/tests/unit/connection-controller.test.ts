import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectionController } from '../../src/background/connection-controller';
import { normalizeSettings } from '../../src/shared/settings';
import {
  CHECKS_KEY,
  loadProviders,
  migrateLegacyKey,
} from '../../src/shared/providers';
import {
  loadUsage,
  saveSettings,
  STORAGE_KEYS,
} from '../../src/shared/storage';
import {
  FakeStorage,
  FAKE_KEY,
  geminiOk,
  jsonResponse,
} from '../helpers/fake-storage';

let area: FakeStorage;
let today: string;
let fetchImpl: ReturnType<typeof vi.fn<typeof fetch>>;
// A V5.1-style key: the controller migrates it to a profile + default route.
const configure = (limit = 20, apiKey: string | null = FAKE_KEY) =>
  saveSettings(
    area,
    normalizeSettings({
      gemini: { apiKey, keyRevision: 1 },
      safety: { dailyTestAttemptLimit: limit },
    }),
  );
const controller = () =>
  new ConnectionController({
    area,
    fetchImpl,
    today: () => today,
    isOnline: () => true,
  });

beforeEach(() => {
  area = new FakeStorage();
  today = '2026-10-15';
  fetchImpl = vi.fn<typeof fetch>(() =>
    Promise.resolve(
      jsonResponse(
        200,
        geminiOk('OK', { promptTokenCount: 5, candidatesTokenCount: 1 }),
      ),
    ),
  );
});

describe('guards before dispatch', () => {
  it('Q06: no key → NOT_CONFIGURED, no attempt, no fetch', async () => {
    await configure(20, null);
    expect(await controller().testConnection('default')).toMatchObject({
      ok: false,
      code: 'NOT_CONFIGURED',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect((await loadUsage(area, today)).testAttempts).toBe(0);
  });

  it('offline → NETWORK_ERROR without consuming an attempt', async () => {
    await configure();
    const offline = new ConnectionController({
      area,
      fetchImpl,
      today: () => today,
      isOnline: () => false,
    });
    expect(await offline.testConnection('default')).toMatchObject({
      code: 'NETWORK_ERROR',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect((await loadUsage(area, today)).testAttempts).toBe(0);
  });

  it('S06: storage failure → STORAGE_ERROR, no fetch', async () => {
    await configure();
    area.failGet = true;
    expect(await controller().testConnection('default')).toMatchObject({
      ok: false,
      code: 'STORAGE_ERROR',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('S09: a tampered stored model ID is replaced by the allowlisted default', async () => {
    area.data.set(STORAGE_KEYS.settings, {
      gemini: { apiKey: FAKE_KEY, modelId: '../../upload/v1beta/files' },
    });
    await controller().testConnection('default');
    expect(fetchImpl.mock.calls[0]![0] as string).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent',
    );
  });
});

describe('daily cap', () => {
  it('Q01–Q03: 20 attempts pass, the 21st is refused with zero fetch', async () => {
    await configure(20);
    const c = controller();
    for (let i = 1; i <= 20; i++)
      expect(await c.testConnection('default')).toMatchObject({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(20);
    expect(await c.testConnection('default')).toMatchObject({
      ok: false,
      code: 'LOCAL_DAILY_LIMIT',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(20);
    const usage = await loadUsage(area, today);
    expect(usage).toMatchObject({
      testAttempts: 20,
      completed: 20,
      failed: 0,
      inputTokensObserved: 100,
      outputTokensObserved: 20,
    });
  });

  it('Q04: two rapid clicks at 19/20 dispatch at most once', async () => {
    await configure(20);
    area.data.set(STORAGE_KEYS.usage, {
      schemaVersion: 1,
      localDate: today,
      testAttempts: 19,
      completed: 19,
      failed: 0,
      inputTokensObserved: 0,
      outputTokensObserved: 0,
    });
    const c = controller();
    const results = await Promise.all([
      c.testConnection('default'),
      c.testConnection('default'),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(
      results.filter((r) => !r.ok && r.code === 'LOCAL_DAILY_LIMIT'),
    ).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('Q11: a burst from several tabs never over-dispatches', async () => {
    await configure(5);
    const c = controller();
    const results = await Promise.all(
      Array.from({ length: 12 }, () => c.testConnection('default')),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(5);
    expect(fetchImpl).toHaveBeenCalledTimes(5);
    expect((await loadUsage(area, today)).testAttempts).toBe(5);
  });

  it('Q05: the count survives a new worker/controller instance', async () => {
    await configure(2);
    await controller().testConnection('default');
    await controller().testConnection('default');
    expect(await controller().testConnection('default')).toMatchObject({
      code: 'LOCAL_DAILY_LIMIT',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('Q07: 429 and lost answers count as attempts and are not retried', async () => {
    await configure(20);
    fetchImpl.mockResolvedValueOnce(jsonResponse(429, {}));
    fetchImpl.mockRejectedValueOnce(new TypeError('network'));
    const c = controller();
    expect(await c.testConnection('default')).toMatchObject({
      code: 'RATE_LIMITED',
      retryable: true,
    });
    expect(await c.testConnection('default')).toMatchObject({
      code: 'NETWORK_ERROR',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    // 429 = the provider answered (failed); a network error = billing unknown.
    expect(await loadUsage(area, today)).toMatchObject({
      testAttempts: 2,
      failed: 1,
      unknown: 1,
      completed: 0,
      pending: {},
    });
  });

  it('Q08: local midnight rollover gives a full new cap', async () => {
    await configure(1);
    const c = controller();
    expect(await c.testConnection('default')).toMatchObject({ ok: true });
    expect(await c.testConnection('default')).toMatchObject({
      code: 'LOCAL_DAILY_LIMIT',
    });
    today = '2026-10-16';
    expect(await c.testConnection('default')).toMatchObject({ ok: true });
    expect((await loadUsage(area, today)).testAttempts).toBe(1);
  });

  it('Q10: lowering the cap below current usage blocks immediately', async () => {
    await configure(10);
    const c = controller();
    for (let i = 0; i < 3; i++) await c.testConnection('default');
    await configure(2);
    expect(await c.testConnection('default')).toMatchObject({
      code: 'LOCAL_DAILY_LIMIT',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('counts the attempt even when the outcome cannot be recorded', async () => {
    await configure(20);
    fetchImpl.mockImplementationOnce(() => {
      area.failSet = true;
      return Promise.resolve(jsonResponse(200, geminiOk()));
    });
    expect(await controller().testConnection('default')).toMatchObject({
      ok: true,
    });
    area.failSet = false;
    expect((await loadUsage(area, today)).testAttempts).toBe(1);
  });
});

describe('V5.1 key migration and key checks', () => {
  it('MIG-02: the test runs on the migrated profile, same key and model', async () => {
    await configure();
    const result = await controller().testConnection('default');
    expect(result).toMatchObject({
      ok: true,
      provider: 'gemini',
      model: 'gemini-3.1-flash-lite',
      sample: 'OK',
      usage: { inputTokens: 5, outputTokens: 1 },
    });
    const [, init] = fetchImpl.mock.calls[0]!;
    expect((init?.headers as Record<string, string>)['x-goog-api-key']).toBe(
      FAKE_KEY,
    );
    // MIG-08: the key exists exactly once, in the secrets store.
    expect(area.dump().match(new RegExp(FAKE_KEY, 'g'))).toHaveLength(1);
    const usage = await loadUsage(area, today);
    expect(Object.keys(usage.routes)).toEqual([
      expect.stringMatching(
        /^gemini\|[0-9a-f-]+\|1\|gemini-3\.1-flash-lite\|test$/,
      ),
    ]);
  });

  it('Q-05: a key check lists models, is stored, and is never counted', async () => {
    await configure();
    const c = controller();
    await migrateLegacyKey(area);
    fetchImpl.mockResolvedValueOnce(
      jsonResponse(200, {
        models: [
          {
            name: 'models/gemini-3.1-flash-lite',
            supportedGenerationMethods: ['generateContent'],
          },
          {
            name: 'models/text-embedding-004',
            supportedGenerationMethods: ['embedContent'],
          },
        ],
      }),
    );
    const { store } = await loadProviders(area);
    const id = store.profiles[0]!.id;
    const before = (await loadUsage(area, today)).testAttempts;
    expect(await c.testKey(id)).toEqual({ ok: true, models: 1 });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url as string).toMatch(
      /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\?pageSize=1000$/,
    );
    expect(url as string).not.toContain(FAKE_KEY);
    expect(init?.method).toBe('GET');
    expect((await loadUsage(area, today)).testAttempts).toBe(before);
    const checks = area.data.get(CHECKS_KEY) as {
      profiles: Record<string, { ok: boolean; models: string[] }>;
    };
    expect(checks.profiles[id]).toMatchObject({
      ok: true,
      models: ['gemini-3.1-flash-lite'],
    });
  });

  it('Q-18: a refused key check is recorded as failed, never as valid', async () => {
    await configure();
    const c = controller();
    await c.testConnection('default');
    const { store } = await loadProviders(area);
    fetchImpl.mockResolvedValueOnce(jsonResponse(401, {}));
    expect(await c.testKey(store.profiles[0]!.id)).toMatchObject({
      ok: false,
      code: 'INVALID_KEY',
    });
    expect(
      (area.data.get(CHECKS_KEY) as { profiles: Record<string, unknown> })
        .profiles[store.profiles[0]!.id],
    ).toMatchObject({ ok: false, errorCode: 'INVALID_KEY' });
  });

  it('an unknown profile ID sends nothing', async () => {
    await configure();
    expect(await controller().testKey('missing-profile')).toMatchObject({
      code: 'ROUTE_BROKEN',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
