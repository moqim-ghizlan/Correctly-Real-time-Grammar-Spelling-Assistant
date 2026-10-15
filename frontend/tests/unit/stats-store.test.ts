import { beforeEach, describe, expect, it } from 'vitest';
import { defaultPolicy } from '../../src/shared/quota';
import {
  QUOTA_DB,
  QuotaStore,
  type LegacySeed,
  type OperationDraft,
} from '../../src/shared/quota-store';

// V5.9 additions to the V5.8 IndexedDB ledger (fake-indexeddb, real
// transactions): schema v2, edit events, history reads, deletion, prices.

const TZ = 'Europe/Paris';
const at = (iso: string) => Date.parse(iso);
const NOW = at('2026-10-15T10:00:00Z');
const DAY = 86_400_000;
const seed: LegacySeed = { timezone: TZ, dailyLimit: 20, usage: null };
let store: QuotaStore;
let n = 0;

const draft = (over: Partial<OperationDraft> = {}): OperationDraft => ({
  id: `operation-${++n}`,
  bootId: 'boot-1',
  task: 'correction',
  provider: 'gemini',
  credentialId: 'gemini-profile-1',
  revision: 1,
  modelId: 'gemini-3.1-flash-lite',
  originTabId: 7,
  originFrameId: 0,
  ...over,
});

async function sendOnce(
  over: Partial<OperationDraft> = {},
  now = NOW,
  state: 'completed' | 'failed-after-send' | 'unknown' | null = 'completed',
) {
  const d = draft(over);
  const admission = await store.admit(d, now);
  if (!admission.allowed) return { draft: d, allowed: false };
  await store.dispatch(d.id, now);
  if (state)
    await store.settle(
      d.id,
      { state, inputTokens: 100, outputTokens: 40, cachedInputTokens: 30 },
      now,
    );
  return { draft: d, allowed: true };
}

const day = () =>
  store.history(at('2026-10-14T22:00:00Z'), at('2026-10-15T22:00:00Z'), NOW);

beforeEach(async () => {
  store = new QuotaStore(globalThis.indexedDB);
  await store.ensureReady(() => Promise.resolve(seed), NOW);
});

describe('schema v2 upgrade (DB, MIG)', () => {
  it('a V5.8 (v1) database keeps its limits, counters and requests and gains the new indexes', async () => {
    globalThis.indexedDB = new (
      globalThis.indexedDB.constructor as new () => IDBFactory
    )();
    const v1 = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = globalThis.indexedDB.open(QUOTA_DB, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore('policy');
        db.createObjectStore('meta');
        db.createObjectStore('counters', {
          keyPath: ['kind', 'id', 'period', 'timezone', 'start'],
        });
        const operations = db.createObjectStore('operations', {
          keyPath: 'id',
        });
        operations.createIndex('state', 'state');
        operations.createIndex('createdAt', 'createdAt');
        db.createObjectStore('alerts', { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('open'));
    });
    await new Promise<void>((resolve) => {
      const tx = v1.transaction(['policy', 'operations', 'meta'], 'readwrite');
      tx.objectStore('policy').put(defaultPolicy(TZ, 3, NOW), 'active');
      tx.objectStore('meta').put({ lastSeen: NOW }, 'clock');
      // A V5.8 record: no cached tokens, no origin.
      tx.objectStore('operations').put({
        id: 'operation-v58',
        bootId: 'old',
        task: 'rewrite',
        provider: 'openai',
        credentialId: 'openai-profile-1',
        revision: 1,
        modelId: 'gpt-5-nano',
        state: 'completed',
        createdAt: NOW - 1000,
        dispatchAt: NOW - 1000,
        settledAt: NOW,
        policyRevision: 1,
        keys: [],
        inputTokens: 10,
        outputTokens: 5,
      });
      tx.oncomplete = () => resolve();
    });
    v1.close();
    store = new QuotaStore(globalThis.indexedDB);
    await store.ensureReady(() => Promise.resolve(seed), NOW);
    const history = await day();
    expect(history.operations.map((o) => o.id)).toEqual(['operation-v58']);
    expect(history.timezone).toBe(TZ);
    const { policy } = await store.snapshot(NOW, []);
    expect(policy!.global.daily.max).toBe(3);
  });
});

describe('history reads', () => {
  it('lists sent requests by send time only; reservations are "in progress", not history', async () => {
    await sendOnce();
    await sendOnce({}, NOW, null); // sent, still waiting
    await store.admit(draft(), NOW); // reserved, never sent
    await sendOnce({}, at('2026-10-16T08:00:00Z')); // another day
    const history = await day();
    expect(history.operations.map((o) => o.state).sort()).toEqual([
      'completed',
      'dispatching',
    ]);
    expect(history.inProgress).toBe(2);
    expect(history.operations[0]).toMatchObject({
      inputTokens: 100,
      outputTokens: 40,
      cachedInputTokens: 30,
    });
  });

  it('TOK: a cached count above the input count is not kept', async () => {
    const d = draft();
    await store.admit(d, NOW);
    await store.dispatch(d.id, NOW);
    await store.settle(
      d.id,
      {
        state: 'completed',
        inputTokens: 10,
        outputTokens: 1,
        cachedInputTokens: 50,
      },
      NOW,
    );
    expect((await day()).operations[0]!.cachedInputTokens).toBeNull();
  });
});

describe('edit events (AP)', () => {
  it('INV-07: only a completed request of the same tab and frame, once per action, undo after apply', async () => {
    const { draft: ok } = await sendOnce();
    const edit = (over: object = {}) =>
      store.recordEdit(
        {
          operationId: ok.id,
          action: 'applied',
          tabId: 7,
          frameId: 0,
          ...over,
        },
        NOW + 1000,
      );
    expect(await edit({ action: 'undone' })).toBe(false); // no apply yet
    expect(await edit({ tabId: 8 })).toBe(false); // another tab
    expect(await edit({ frameId: 3 })).toBe(false); // another frame
    expect(await edit({ operationId: 'operation-unknown' })).toBe(false);
    expect(await edit()).toBe(true);
    expect(await edit()).toBe(false); // click spam
    expect(await edit({ action: 'undone' })).toBe(true);
    expect(await edit({ action: 'undone' })).toBe(false);
    const { draft: failed } = await sendOnce({}, NOW, 'failed-after-send');
    expect(
      await store.recordEdit(
        { operationId: failed.id, action: 'applied', tabId: 7, frameId: 0 },
        NOW,
      ),
    ).toBe(false);
    const { draft: test } = await sendOnce({ task: 'test' });
    expect(
      await store.recordEdit(
        { operationId: test.id, action: 'applied', tabId: 7, frameId: 0 },
        NOW,
      ),
    ).toBe(false);
    const events = (await day()).events;
    expect(events.map((e) => e.action).sort()).toEqual(['applied', 'undone']);
    expect(JSON.stringify(events)).not.toMatch(/text|SENTINEL/i);
  });
});

describe('deletion and retention (CSV-D, INV-15)', () => {
  it('deleting statistics keeps limits enforced, counters, and requests in progress', async () => {
    const { policy } = await store.snapshot(NOW, []);
    await store.savePolicy(
      {
        ...policy!,
        global: { ...policy!.global, daily: { enabled: true, max: 2 } },
      },
      policy!.revision,
      NOW,
    );
    const { draft: done } = await sendOnce();
    await store.recordEdit(
      { operationId: done.id, action: 'applied', tabId: 7, frameId: 0 },
      NOW,
    );
    await sendOnce({}, NOW, null); // still waiting
    expect(await store.deleteHistory(NOW + 1, NOW + 2)).toBe(1);
    const history = await day();
    expect(history.operations.map((o) => o.state)).toEqual(['dispatching']);
    expect(history.events).toEqual([]);
    expect(history.deletedBefore).toBe(NOW + 1);
    // The limit (2/2 used) still refuses the next request.
    expect((await sendOnce({}, NOW + 3)).allowed).toBe(false);
    expect(
      (await store.snapshot(NOW + 3, [])).usage['global:all|daily'],
    ).toEqual({
      counted: 2,
      reserved: 0,
    });
    // A new request after deletion is recorded normally (next day).
    expect((await sendOnce({}, NOW + DAY)).allowed).toBe(true);
  });

  it('requests are kept 400 days (not 90), then pruned with their events', async () => {
    const { draft: old } = await sendOnce();
    await store.recordEdit(
      { operationId: old.id, action: 'applied', tabId: 7, frameId: 0 },
      NOW,
    );
    await store.recover('boot-2', NOW + 100 * DAY);
    expect((await day()).operations).toHaveLength(1);
    await store.recover('boot-3', NOW + 401 * DAY);
    const history = await day();
    expect(history.operations).toEqual([]);
    expect(history.events).toEqual([]);
  });
});

describe('price references (USD)', () => {
  const price = {
    id: 'owner-price-0001',
    provider: 'gemini' as const,
    modelId: 'gemini-3.1-flash-lite',
    inputPerMillion: '0.30',
    cachedInputPerMillion: null,
    outputPerMillion: '2',
    effectiveFrom: NOW,
    source: 'owner' as const,
    sourceLabel: 'My contract',
    verifiedAt: NOW,
  };

  it('owner entries are validated and never overwritten', async () => {
    expect(await store.addPrice(price)).toBe('saved');
    expect(await store.addPrice({ ...price, inputPerMillion: '9' })).toBe(
      'exists',
    );
    expect(
      await store.addPrice({
        ...price,
        id: 'owner-price-0002',
        outputPerMillion: '-1',
      }),
    ).toBe('invalid');
    expect(
      await store.addPrice({
        ...price,
        id: 'owner-price-0003',
        source: 'official',
      }),
    ).toBe('invalid');
    expect((await day()).prices).toEqual([price]);
  });
});
