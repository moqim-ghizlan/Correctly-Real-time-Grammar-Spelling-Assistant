import type { ProviderId } from '../../src/shared/models';
import {
  PROVIDERS_KEY,
  SECRETS_KEY,
  type ProviderProfile,
  type Route,
  type RouteSlot,
} from '../../src/shared/providers';
import type { QuotaPolicy } from '../../src/shared/quota';
import { QuotaStore } from '../../src/shared/quota-store';
import type { StorageArea } from '../../src/shared/storage';

/**
 * Async in-memory stand-in for chrome.storage.local. Each call yields to the
 * event loop (so read→await→write races are real) and can be made to fail.
 */
export class FakeStorage implements StorageArea {
  data = new Map<string, unknown>();
  failGet = false;
  failSet = false;
  gets = 0;
  sets = 0;

  private tick() {
    return new Promise<void>((resolve) => setTimeout(resolve, 0));
  }

  async get(keys: string[]): Promise<Record<string, unknown>> {
    await this.tick();
    this.gets++;
    if (this.failGet) throw new Error('storage get failed');
    const result: Record<string, unknown> = {};
    for (const key of keys)
      if (this.data.has(key)) result[key] = structuredClone(this.data.get(key));
    return result;
  }

  async set(items: Record<string, unknown>): Promise<void> {
    await this.tick();
    this.sets++;
    if (this.failSet) throw new Error('storage set failed');
    for (const [key, value] of Object.entries(items))
      this.data.set(key, structuredClone(value));
  }

  /** Everything stored, serialized — used to search for leaked secrets. */
  dump(): string {
    return JSON.stringify([...this.data.entries()]);
  }
}

export const FAKE_KEY = 'CORRECTLY_TEST_SENTINEL_KEY_0123456789abcdef';
export const OTHER_KEY = 'CORRECTLY_TEST_SENTINEL_KEY_replacement_99';

export function geminiOk(text = 'OK', usage?: Record<string, number>) {
  return {
    candidates: [
      { content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP' },
    ],
    ...(usage ? { usageMetadata: usage } : {}),
  };
}

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ---- V5.7 provider fixtures (synthetic keys only, never real ones) --------

export const OPENAI_KEY = 'CORRECTLY_TEST_SENTINEL_KEY_openai_456789';
export const GEMINI_ID = 'gemini-profile-1';
export const OPENAI_ID = 'openai-profile-1';
const AT = '2026-10-15T08:00:00.000Z';

export function profile(
  id: string,
  provider: ProviderId,
  extra: Partial<ProviderProfile> = {},
): ProviderProfile {
  return {
    id,
    provider,
    label: id,
    enabled: true,
    revision: 1,
    createdAt: AT,
    updatedAt: AT,
    ...extra,
  };
}

/** Writes profiles, their keys and routes the way the settings page would. */
export function seedProviders(
  area: FakeStorage,
  profiles: ProviderProfile[],
  routes: Partial<Record<RouteSlot, Route | null>>,
  keys: Record<string, string> = {},
): void {
  area.data.set(PROVIDERS_KEY, {
    schemaVersion: 1,
    revision: 1,
    profiles,
    routes: {
      default: null,
      correction: null,
      rewrite: null,
      translation: null,
      translateRewrite: null,
      ...routes,
    },
  });
  area.data.set(SECRETS_KEY, {
    schemaVersion: 1,
    secrets: Object.fromEntries(
      profiles.map((p) => [
        p.id,
        {
          provider: p.provider,
          revision: p.revision,
          key: keys[p.id] ?? (p.provider === 'openai' ? OPENAI_KEY : FAKE_KEY),
        },
      ]),
    ),
  });
}

/** A Responses API body: a reasoning item, then the assistant message. */
export function openaiOk(text = 'OK', usage?: Record<string, unknown>) {
  return {
    id: 'resp_test',
    object: 'response',
    status: 'completed',
    output: [
      { type: 'reasoning', id: 'rs_1', summary: [] },
      {
        type: 'message',
        id: 'msg_1',
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'output_text', text, annotations: [] }],
      },
    ],
    ...(usage ? { usage } : {}),
  };
}

/** The V5.8 store of the current test's IndexedDB (see setup.ts). */
export const quotaStore = () => new QuotaStore(globalThis.indexedDB);

/**
 * Today's usage as the settings page sees it: attempts in the global daily
 * window, and outcomes/tokens of today's sent operations.
 */
export async function usageToday(now = Date.now()) {
  const snapshot = await quotaStore().snapshot(now, []);
  const rows = snapshot.today;
  const sum = (
    field: 'completed' | 'failed' | 'unknown' | 'inputTokens' | 'outputTokens',
  ) => rows.reduce((total, row) => total + row[field], 0);
  const global = snapshot.usage['global:all|daily'];
  return {
    attempts: global?.counted ?? 0,
    reserved: global?.reserved ?? 0,
    completed: sum('completed'),
    failed: sum('failed'),
    unknown: sum('unknown'),
    inputTokens: sum('inputTokens'),
    outputTokens: sum('outputTokens'),
    inProgress: snapshot.inProgress,
    rows,
    snapshot,
  };
}

/** Saves a change to the current limits (as the settings page does). */
export async function changePolicy(
  change: (policy: QuotaPolicy) => QuotaPolicy,
  now = Date.now(),
) {
  const store = quotaStore();
  const { policy } = await store.snapshot(now, []);
  if (!policy) throw new Error('no policy yet');
  return store.savePolicy(
    change(structuredClone(policy)),
    policy.revision,
    now,
  );
}

/** Every record of the V5.8 database, serialized (to search for leaks). */
export async function dumpQuota(): Promise<string> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = globalThis.indexedDB.open('correctly-v5-quota');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('open'));
  });
  const names = [...db.objectStoreNames];
  const all = await Promise.all(
    names.map(
      (name) =>
        new Promise<unknown[]>((resolve, reject) => {
          const request = db.transaction(name).objectStore(name).getAll();
          request.onsuccess = () => resolve(request.result as unknown[]);
          request.onerror = () => reject(request.error ?? new Error('get'));
        }),
    ),
  );
  db.close();
  return JSON.stringify(all);
}
