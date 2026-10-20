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

  protected tick() {
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

// ---- 5.14 storage.sync stand-in -------------------------------------------

const utf8 = (text: string) => new TextEncoder().encode(text).length;

/** FakeStorage that yields with setImmediate: same races, much faster. */
export class FastFakeStorage extends FakeStorage {
  protected override tick() {
    return new Promise<void>((resolve) => setImmediate(resolve));
  }
}

interface SyncOp {
  seq: number;
  key: string;
  value: unknown;
  removed: boolean;
}
let opSeq = 0;

/**
 * chrome.storage.sync for one computer: Chrome's quotas (a failing set()
 * writes nothing), get(null), remove, getBytesInUse and change listeners.
 * Two computers are two instances; `deliverTo` plays the browser's sync by
 * replaying this computer's own writes (last arrival wins, item by item).
 */
export class FakeSyncArea {
  data = new Map<string, unknown>();
  writes = 0;
  gets = 0;
  failSet: Error | null = null;
  maxWritesPerMinute = 120;
  private listeners: ((keys: string[]) => void)[] = [];
  private log: SyncOp[] = [];
  private delivered = new Map<FakeSyncArea, Set<number>>();

  onChanged(listener: (keys: string[]) => void) {
    this.listeners.push(listener);
  }

  private emit(keys: string[]) {
    if (keys.length) for (const listener of this.listeners) listener(keys);
  }

  /** Yields to the event loop (setTimeout(0) costs ~15 ms on Windows). */
  private tick() {
    return new Promise<void>((resolve) => setImmediate(resolve));
  }

  bytes(): number {
    let total = 0;
    for (const [key, value] of this.data)
      total += utf8(key) + utf8(JSON.stringify(value));
    return total;
  }

  async get(keys: string[] | null): Promise<Record<string, unknown>> {
    await this.tick();
    this.gets++;
    const result: Record<string, unknown> = {};
    for (const [key, value] of this.data)
      if (!keys || keys.includes(key)) result[key] = structuredClone(value);
    return result;
  }

  async set(items: Record<string, unknown>): Promise<void> {
    await this.tick();
    if (this.failSet) throw this.failSet;
    if (++this.writes > this.maxWritesPerMinute)
      throw new Error(
        'This request exceeds the MAX_WRITE_OPERATIONS_PER_MINUTE quota.',
      );
    const next = new Map(this.data);
    for (const [key, value] of Object.entries(items)) {
      if (utf8(key) + utf8(JSON.stringify(value)) > 8192)
        throw new Error('QUOTA_BYTES_PER_ITEM quota exceeded.');
      next.set(key, structuredClone(value));
    }
    if (next.size > 512) throw new Error('MAX_ITEMS quota exceeded.');
    const before = this.data;
    this.data = next;
    if (this.bytes() > 102400) {
      this.data = before;
      throw new Error('QUOTA_BYTES quota exceeded.');
    }
    for (const [key, value] of Object.entries(items))
      this.log.push({
        seq: opSeq++,
        key,
        value: structuredClone(value),
        removed: false,
      });
    this.emit(Object.keys(items));
  }

  async remove(keys: string[]): Promise<void> {
    await this.tick();
    this.writes++;
    const removed = keys.filter((key) => this.data.delete(key));
    for (const key of removed)
      this.log.push({ seq: opSeq++, key, value: undefined, removed: true });
    this.emit(removed);
  }

  async getBytesInUse(keys: string[] | null): Promise<number> {
    await this.tick();
    if (!keys) return this.bytes();
    let total = 0;
    for (const key of keys)
      if (this.data.has(key))
        total += utf8(key) + utf8(JSON.stringify(this.data.get(key)));
    return total;
  }

  /**
   * The browser's sync: replays this computer's writes not yet delivered to
   * `other` (only those on `keys` when given, to deliver a batch partly or
   * out of order), then fires the other computer's listeners.
   */
  deliverTo(other: FakeSyncArea, keys?: string[]): number {
    const done = this.delivered.get(other) ?? new Set<number>();
    this.delivered.set(other, done);
    const changed = new Set<string>();
    for (const op of this.log) {
      if (done.has(op.seq) || (keys && !keys.includes(op.key))) continue;
      done.add(op.seq);
      if (op.removed) {
        if (other.data.delete(op.key)) changed.add(op.key);
      } else {
        other.data.set(op.key, structuredClone(op.value));
        changed.add(op.key);
      }
    }
    other.emit([...changed]);
    return changed.size;
  }

  dump(): string {
    return JSON.stringify([...this.data.entries()]);
  }
}
