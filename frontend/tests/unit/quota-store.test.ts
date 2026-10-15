import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  windowsAt,
  type Period,
  type QuotaPolicy,
} from '../../src/shared/quota';
import {
  OPERATION_RETENTION_MS,
  QUOTA_DB,
  QuotaStore,
  QuotaStoreError,
  blockedNote,
  type LegacySeed,
  type OperationDraft,
} from '../../src/shared/quota-store';
import { emptyUsage } from '../../src/shared/settings';

// V5.8 ledger on a spec-complete IndexedDB (fake-indexeddb): real
// transactions, real auto-commit, several connections like several tabs.

const TZ = 'Europe/Paris';
const at = (iso: string) => Date.parse(iso);
const NOW = at('2026-10-15T10:00:00Z'); // Thursday, 12:00 in Paris
const GEMINI = 'profile-gemini-1';
const GEMINI_2 = 'profile-gemini-2';
const OPENAI = 'profile-openai-1';

let store: QuotaStore;
let n = 0;
const fresh = () => new QuotaStore(globalThis.indexedDB);
const seed: LegacySeed = { timezone: TZ, dailyLimit: 20, usage: null };

const draft = (over: Partial<OperationDraft> = {}): OperationDraft => ({
  id: `operation-${++n}`,
  bootId: 'boot-1',
  task: 'correction',
  provider: 'gemini',
  credentialId: GEMINI,
  revision: 1,
  modelId: 'gemini-3.1-flash-lite',
  ...over,
});

/** Admit + mark sent, as the controller does before calling the provider. */
async function send(over: Partial<OperationDraft> = {}, now = NOW) {
  const d = draft(over);
  const admission = await store.admit(d, now);
  if (!admission.allowed) return { draft: d, admission, sent: null };
  return { draft: d, admission, sent: await store.dispatch(d.id, now) };
}

const snap = (now = NOW) => store.snapshot(now, [GEMINI, GEMINI_2, OPENAI]);
const cell = async (key: string, now = NOW) => (await snap(now)).usage[key];

async function setPolicy(change: (policy: QuotaPolicy) => void, now = NOW) {
  const { policy } = await snap(now);
  const next = structuredClone(policy!);
  change(next);
  expect(await store.savePolicy(next, policy!.revision, now)).toBe('saved');
}

const openRaw = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = globalThis.indexedDB.open(QUOTA_DB);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('open'));
  });

async function rawPut(name: string, value: unknown, key?: IDBValidKey) {
  const db = await openRaw();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(name, 'readwrite');
    if (key === undefined) tx.objectStore(name).put(value);
    else tx.objectStore(name).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('put'));
  });
  db.close();
}

async function rawAll(name: string): Promise<unknown[]> {
  const db = await openRaw();
  const all = await new Promise<unknown[]>((resolve, reject) => {
    const request = db.transaction(name).objectStore(name).getAll();
    request.onsuccess = () => resolve(request.result as unknown[]);
    request.onerror = () => reject(request.error ?? new Error('get'));
  });
  db.close();
  return all;
}

/** Sets the counted usage of one scope in the current windows (test fixture). */
async function seedUsage(
  kind: string,
  id: string,
  counted: number,
  periods: Period[] = ['daily', 'weekly', 'monthly'],
  now = NOW,
) {
  const windows = windowsAt(now, TZ);
  for (const period of periods) {
    const w = windows[period];
    await rawPut('counters', {
      kind,
      id,
      period,
      timezone: TZ,
      start: w.start,
      end: w.end,
      label: w.label,
      counted,
      reserved: 0,
      completed: counted,
      failed: 0,
      unknown: 0,
      inputTokens: 0,
      outputTokens: 0,
    });
  }
}

beforeEach(async () => {
  store = fresh();
  await store.ensureReady(() => Promise.resolve(seed), NOW);
});

describe('admission and accounting (AT)', () => {
  it('AT-001/AT-009: one reservation in all twelve counters, then reserved → counted', async () => {
    const d = draft();
    expect(await store.admit(d, NOW)).toEqual({ allowed: true });
    const reserved = await snap();
    for (const scope of [
      'global:all',
      'task:correction',
      'provider:gemini',
      `credential:${GEMINI}`,
    ])
      for (const period of ['daily', 'weekly', 'monthly'])
        expect(reserved.usage[`${scope}|${period}`]).toEqual({
          counted: 0,
          reserved: 1,
        });
    expect(reserved.inProgress).toBe(1);
    expect(await store.dispatch(d.id, NOW)).toEqual({
      allowed: true,
      notice: null,
    });
    const sent = await snap();
    expect(sent.usage['task:correction|monthly']).toEqual({
      counted: 1,
      reserved: 0,
    });
    expect(sent.usage['task:rewrite|daily']).toEqual({
      counted: 0,
      reserved: 0,
    });
    expect(sent.inProgress).toBe(1);
  });

  it('AT-002/AT-010/SEC-004/RACE-007: an operation ID is admitted, sent and settled once, even after a restart', async () => {
    const d = draft();
    await store.admit(d, NOW);
    expect(await store.admit(d, NOW)).toMatchObject({
      allowed: false,
      reason: 'operation-duplicate',
    });
    await store.dispatch(d.id, NOW);
    expect(await store.dispatch(d.id, NOW)).toMatchObject({
      allowed: false,
      reason: 'operation-duplicate',
    });
    await store.settle(d.id, { state: 'completed', inputTokens: 5 }, NOW);
    await store.settle(d.id, { state: 'completed', inputTokens: 5 }, NOW);
    store = fresh(); // a new worker
    expect(await store.admit(d, NOW)).toMatchObject({
      reason: 'operation-duplicate',
    });
    expect(await store.dispatch(d.id, NOW)).toMatchObject({
      allowed: false,
    });
    const { usage, today } = await snap();
    expect(usage['global:all|daily']).toEqual({ counted: 1, reserved: 0 });
    expect(today).toMatchObject([
      { attempts: 1, completed: 1, inputTokens: 5 },
    ]);
  });

  it('AT-007/AT-008/T14: a release before sending gives the slot back exactly once', async () => {
    const d = draft();
    await store.admit(d, NOW);
    await store.release(d.id, NOW);
    await store.release(d.id, NOW);
    expect(await cell('global:all|daily')).toEqual({ counted: 0, reserved: 0 });
    expect(await store.dispatch(d.id, NOW)).toMatchObject({ allowed: false });
    expect((await snap()).inProgress).toBe(0);
  });

  it('AT-013…019/T15: failures, timeouts and aborts after sending stay counted', async () => {
    for (const state of ['failed-after-send', 'unknown'] as const) {
      const { draft: d } = await send();
      await store.settle(d.id, { state }, NOW);
      await store.release(d.id, NOW); // too late: no refund
    }
    const { usage, today } = await snap();
    expect(usage['global:all|daily']).toEqual({ counted: 2, reserved: 0 });
    expect(today).toMatchObject([{ attempts: 2, failed: 1, unknown: 1 }]);
  });

  it('AT-031/AT-032: tokens are stored only when reported (never guessed)', async () => {
    const a = await send();
    await store.settle(a.draft.id, { state: 'completed' }, NOW);
    const b = await send();
    await store.settle(
      b.draft.id,
      { state: 'completed', inputTokens: 40, outputTokens: -3 },
      NOW,
    );
    const operations = (await rawAll('operations')) as {
      inputTokens: number | null;
      outputTokens: number | null;
    }[];
    expect(operations.map((o) => [o.inputTokens, o.outputTokens])).toEqual([
      [null, null],
      [40, null],
    ]);
  });

  it('AT-005/AT-006/RACE-021: a write failing mid-transaction leaves nothing behind', async () => {
    // Fail the 5th write of the admission (after four counters were put).
    const proto = globalThis.IDBObjectStore.prototype;
    // eslint-disable-next-line @typescript-eslint/unbound-method -- re-applied with its own `this` below
    const put = proto.put;
    let count = 0;
    proto.put = function (
      this: IDBObjectStore,
      ...args: Parameters<IDBObjectStore['put']>
    ) {
      if (++count === 5)
        throw new DOMException('disk full', 'QuotaExceededError');
      return put.apply(this, args);
    };
    try {
      await expect(store.admit(draft(), NOW)).rejects.toBeInstanceOf(
        QuotaStoreError,
      );
    } finally {
      proto.put = put;
    }
    const { usage, inProgress } = await snap();
    expect(Object.values(usage).every((c) => c.reserved === 0)).toBe(true);
    expect(inProgress).toBe(0);
    expect(await rawAll('operations')).toEqual([]);
  });
});

describe('limits (POL)', () => {
  it('POL-003/004/005 and the 5,000 example: the 5,000th is allowed, the 5,001st is refused before sending', async () => {
    await setPolicy((p) => {
      p.global.daily = { enabled: true, max: 10_000 };
      p.tasks.correction.daily = { enabled: true, max: 5000 };
    });
    await seedUsage('task', 'correction', 4999, ['daily']);
    const last = await send();
    expect(last.sent).toMatchObject({
      allowed: true,
      notice: { level: 100, scope: 'task', used: 5000, max: 5000 },
    });
    const refused = await send({ provider: 'openai', credentialId: OPENAI });
    expect(refused.admission).toEqual({
      allowed: false,
      reason: 'cap-exhausted',
      blocking: [
        {
          scope: { kind: 'task', id: 'correction' },
          period: 'daily',
          used: 5000,
          reserved: 0,
          max: 5000,
          resetAt: at('2026-10-15T22:00:00Z'),
          timezone: TZ,
        },
      ],
    });
    expect(
      blockedNote(refused.admission.allowed ? [] : refused.admission.blocking, {
        task: 'correction',
        provider: 'openai',
      }),
    ).toMatchObject({ blocked: true, scope: 'task', task: 'correction' });
    // Another action is not coupled to the correction cap.
    expect((await send({ task: 'rewrite' })).sent).toMatchObject({
      allowed: true,
    });
  });

  it('POL-006/007/NOTE-022/023: lowering below usage blocks (6 / 3 shown); raising frees exactly the difference', async () => {
    await setPolicy((p) => (p.global.daily.max = 10));
    for (let i = 0; i < 6; i++) await send();
    await setPolicy((p) => (p.global.daily.max = 3));
    expect((await send()).admission).toMatchObject({
      allowed: false,
      blocking: [{ used: 6, max: 3 }],
    });
    await setPolicy((p) => (p.global.daily.max = 10));
    const results = [];
    for (let i = 0; i < 5; i++) results.push((await send()).admission.allowed);
    expect(results).toEqual([true, true, true, true, false]);
    expect(await cell('global:all|daily')).toEqual({
      counted: 10,
      reserved: 0,
    });
  });

  it('POL-008/009/AT-030/T22: a disabled cap keeps counting and is enforced with that usage once re-enabled', async () => {
    for (let i = 0; i < 6; i++) await send({ task: 'rewrite' });
    expect(await cell('task:rewrite|daily')).toEqual({
      counted: 6,
      reserved: 0,
    });
    await setPolicy((p) => (p.tasks.rewrite.daily = { enabled: true, max: 6 }));
    expect((await send({ task: 'rewrite' })).admission).toMatchObject({
      allowed: false,
      blocking: [{ scope: { kind: 'task', id: 'rewrite' }, used: 6 }],
    });
  });

  it('POL-011/012/013/014: every enabled cap is checked — task, total, week, month', async () => {
    await setPolicy((p) => {
      p.global.daily = { enabled: true, max: 100 };
      p.global.monthly = { enabled: true, max: 3 };
      p.tasks.rewrite.weekly = { enabled: true, max: 1 };
    });
    await send({ task: 'rewrite' });
    // Rewrite blocked by its weekly cap; correction still allowed.
    expect((await send({ task: 'rewrite' })).admission).toMatchObject({
      blocking: [{ scope: { id: 'rewrite' }, period: 'weekly' }],
    });
    await send({ task: 'correction' });
    await send({ task: 'translation' });
    // The total monthly cap now blocks everything, whatever the provider.
    for (const over of [
      { task: 'correction' as const },
      {
        task: 'translateRewrite' as const,
        provider: 'openai' as const,
        credentialId: OPENAI,
      },
    ])
      expect((await send(over)).admission).toMatchObject({
        allowed: false,
        blocking: [{ scope: { kind: 'global' }, period: 'monthly' }],
      });
  });

  it('NOTE-013: several blocking limits are all reported, the one freeing last first', async () => {
    await setPolicy((p) => {
      p.tasks.correction.daily = { enabled: true, max: 1 };
      p.global.monthly = { enabled: true, max: 1 };
    });
    await send();
    const { admission } = await send();
    expect(
      admission.allowed ? [] : admission.blocking.map((b) => b.period),
    ).toEqual(['monthly', 'daily']);
  });

  it('POL-015/016/UX-025: pause blocks every request; resuming keeps the counts', async () => {
    await send();
    await setPolicy((p) => (p.pauseAll = true));
    expect((await send()).admission).toEqual({
      allowed: false,
      reason: 'ai-paused',
      blocking: [],
    });
    await setPolicy((p) => (p.pauseAll = false));
    expect((await send()).admission.allowed).toBe(true);
    expect(await cell('global:all|daily')).toEqual({ counted: 2, reserved: 0 });
  });

  it('POL-025: a confirmed test counts in total, provider and key, never in an action cap', async () => {
    await setPolicy(
      (p) => (p.tasks.correction.daily = { enabled: true, max: 1 }),
    );
    await send({ task: 'test' });
    const { usage } = await snap();
    expect(usage['global:all|daily']).toEqual({ counted: 1, reserved: 0 });
    expect(usage['task:test|daily']).toEqual({ counted: 1, reserved: 0 });
    expect(usage['task:correction|daily']).toEqual({ counted: 0, reserved: 0 });
    expect((await send()).admission.allowed).toBe(true);
  });

  it('S-06/§15.2: provider and key caps only restrict; other providers stay usable by explicit choice', async () => {
    await setPolicy((p) => {
      p.providers.gemini.daily = { enabled: true, max: 1 };
      p.credentials[OPENAI] = {
        daily: { enabled: true, max: 1 },
        weekly: { enabled: false, max: 5 },
        monthly: { enabled: false, max: 5 },
      };
    });
    await send();
    expect((await send({ credentialId: GEMINI_2 })).admission).toMatchObject({
      blocking: [{ scope: { kind: 'provider', id: 'gemini' } }],
    });
    const openai = { provider: 'openai' as const, credentialId: OPENAI };
    expect((await send(openai)).admission.allowed).toBe(true);
    expect((await send(openai)).admission).toMatchObject({
      blocking: [{ scope: { kind: 'credential', id: OPENAI } }],
    });
  });

  it('INV-06/MIG-017/SEC-016: replacing a key (new revision) or switching provider never resets a limit', async () => {
    await setPolicy((p) => {
      p.global.daily.max = 2;
      p.credentials[GEMINI] = {
        daily: { enabled: true, max: 1 },
        weekly: { enabled: false, max: 1 },
        monthly: { enabled: false, max: 1 },
      };
    });
    await send({ revision: 1 });
    expect((await send({ revision: 2 })).admission).toMatchObject({
      blocking: [{ scope: { kind: 'credential', id: GEMINI } }],
    });
    await send({ provider: 'openai', credentialId: OPENAI });
    expect(
      (await send({ provider: 'openai', credentialId: OPENAI })).admission,
    ).toMatchObject({ blocking: [{ scope: { kind: 'global' } }] });
  });
});

describe('re-check before sending (AT-025…028, CAL-015)', () => {
  it('AT-026: pause saved after the reservation → nothing sent, slot given back', async () => {
    const d = draft();
    await store.admit(d, NOW);
    await setPolicy((p) => (p.pauseAll = true));
    expect(await store.dispatch(d.id, NOW)).toMatchObject({
      allowed: false,
      reason: 'ai-paused',
    });
    expect(await cell('global:all|daily')).toEqual({ counted: 0, reserved: 0 });
  });

  it('AT-027/RACE-015: a cap lowered after the reservation is applied before sending', async () => {
    await setPolicy((p) => (p.global.daily.max = 2));
    await send();
    const d = draft();
    await store.admit(d, NOW);
    await setPolicy((p) => (p.global.daily.max = 1));
    expect(await store.dispatch(d.id, NOW)).toMatchObject({
      allowed: false,
      reason: 'cap-exhausted',
    });
    expect(await cell('global:all|daily')).toEqual({ counted: 1, reserved: 0 });
  });

  it('CAL-015/AT-028/RACE-026: midnight between reservation and sending → counted on the new day', async () => {
    const before = at('2026-10-15T21:59:59.900Z'); // Thu 23:59:59.900 Paris
    const after = at('2026-10-15T22:00:00.100Z'); // Fri 00:00:00.100
    const d = draft();
    await store.admit(d, before);
    expect(await store.dispatch(d.id, after)).toMatchObject({ allowed: true });
    expect((await snap(before)).usage['global:all|daily']).toEqual({
      counted: 0,
      reserved: 0,
    });
    const { usage } = await snap(after);
    expect(usage['global:all|daily']).toEqual({ counted: 1, reserved: 0 });
    expect(usage['global:all|weekly']).toEqual({ counted: 1, reserved: 0 });
  });

  it('the new day is checked too: a full new day refuses before sending', async () => {
    const before = at('2026-10-15T21:59:59.900Z');
    const after = at('2026-10-15T22:00:00.100Z');
    await setPolicy((p) => (p.global.daily.max = 1), before);
    await seedUsage('global', 'all', 1, ['daily'], after);
    const d = draft();
    expect(await store.admit(d, before)).toEqual({ allowed: true });
    expect(await store.dispatch(d.id, after)).toMatchObject({
      allowed: false,
      reason: 'cap-exhausted',
    });
    expect((await snap(before)).usage['global:all|daily']!.reserved).toBe(0);
  });
});

describe('clock and time zone (CAL-014, CAL-017, CAL-018)', () => {
  it('CAL-017: a clock moved back more than 5 minutes blocks until confirmed', async () => {
    await send();
    expect((await send({}, NOW - 4 * 60_000)).admission.allowed).toBe(true);
    expect((await send({}, NOW - 60 * 60_000)).admission).toMatchObject({
      allowed: false,
      reason: 'clock-anomaly',
    });
    expect((await snap(NOW - 60 * 60_000)).clockBack).toBe(true);
    await store.confirmClock(NOW - 60 * 60_000);
    expect((await send({}, NOW - 60 * 60_000)).admission.allowed).toBe(true);
    // Usage recorded before is kept.
    expect((await cell('global:all|daily'))!.counted).toBe(3);
  });

  it('CAL-018: a jump forward never replays or refunds a sent request', async () => {
    const { draft: d } = await send();
    const later = at('2026-11-20T10:00:00Z');
    await store.recover('boot-2', later);
    expect((await snap(NOW)).usage['global:all|daily']).toEqual({
      counted: 1,
      reserved: 0,
    });
    expect(
      (await rawAll('operations')) as { id: string; state: string }[],
    ).toEqual([expect.objectContaining({ id: d.id, state: 'unknown' })]);
  });

  it('CAL-014/T19: changing the time zone carries the current counts over (no free reset)', async () => {
    await setPolicy((p) => (p.global.daily.max = 3));
    for (let i = 0; i < 3; i++) await send();
    await setPolicy((p) => (p.timezone = 'America/New_York'));
    const { policy, usage, windows } = await snap();
    expect(policy!.timezone).toBe('America/New_York');
    expect(windows!.daily.timezone).toBe('America/New_York');
    expect(usage['global:all|daily']!.counted).toBe(3);
    expect(usage['task:correction|monthly']!.counted).toBe(3);
    expect((await send()).admission.allowed).toBe(false);
  });
});

describe('alerts (NOTE)', () => {
  it('NOTE-001/002/003: one notice at 80 %, 95 % and 100 %, each once', async () => {
    await setPolicy((p) => (p.global.daily.max = 20));
    const notices = [];
    for (let i = 0; i < 20; i++) notices.push((await send()).sent);
    const levels = notices.flatMap((s, i) =>
      s?.allowed && s.notice ? [[i + 1, s.notice.level]] : [],
    );
    expect(levels).toEqual([
      [16, 80],
      [19, 95],
      [20, 100],
    ]);
    expect((await snap()).alerts.map((a) => a.level)).toEqual([100, 95, 80]);
  });

  it('NOTE-005/006/T09: a cap of 1 gives ONE 100 % notice, not three', async () => {
    await setPolicy((p) => (p.global.daily.max = 1));
    const { sent } = await send();
    expect(sent).toMatchObject({ notice: { level: 100, used: 1, max: 1 } });
    expect((await snap()).alerts).toHaveLength(1);
  });

  it('NOTE-012: total and action limits crossing together → one notice, both recorded', async () => {
    await setPolicy((p) => {
      p.global.daily.max = 20;
      p.tasks.correction.daily = { enabled: true, max: 20 };
    });
    await seedUsage('global', 'all', 18, ['daily']);
    await seedUsage('task', 'correction', 18, ['daily']);
    const { sent } = await send();
    expect(sent).toMatchObject({ notice: { level: 95 } });
    expect(
      (await snap()).alerts.map((a) => `${a.kind}:${a.level}`).sort(),
    ).toEqual(['global:95', 'task:95']);
  });

  it('NOTE-007/008/014/021/RACE-024: a threshold of a window notifies once, even after a raise, a restart or a dismiss', async () => {
    await setPolicy((p) => (p.global.daily.max = 10));
    for (let i = 0; i < 8; i++) await send();
    const [alert] = (await snap()).alerts;
    expect(alert).toMatchObject({ level: 80, used: 8, max: 10 });
    await store.dismissAlert(alert!.id);
    expect((await snap()).alerts).toEqual([]);
    await setPolicy((p) => (p.global.daily.max = 20));
    store = fresh(); // worker restart
    const notices = [];
    for (let i = 0; i < 10; i++) notices.push((await send()).sent);
    // 80 % of 20 is reached again at 16: same window → no second 80 % alert.
    expect(notices.filter((s) => s?.allowed && s.notice)).toHaveLength(0);
    expect((await send()).sent).toMatchObject({
      notice: { level: 95, used: 19, max: 20 },
    });
  });

  it('NOTE-009/011: a new day (or month) gives fresh threshold identities', async () => {
    await setPolicy((p) => (p.global.daily.max = 1));
    expect((await send()).sent).toMatchObject({ notice: { level: 100 } });
    const tomorrow = NOW + 24 * 3_600_000;
    expect((await send({}, tomorrow)).sent).toMatchObject({
      notice: { level: 100, resetAt: at('2026-10-16T22:00:00Z') },
    });
  });

  it('NOTE-020: dismissing a warning never frees a request', async () => {
    await setPolicy((p) => (p.global.daily.max = 1));
    await send();
    for (const alert of (await snap()).alerts)
      await store.dismissAlert(alert.id);
    expect((await send()).admission.allowed).toBe(false);
  });

  it('80/95 % warnings can be turned off; 100 % cannot', async () => {
    await setPolicy((p) => {
      p.global.daily.max = 2;
      p.alerts = { at80: false, at95: false };
    });
    expect((await send()).sent).toMatchObject({ notice: null });
    expect((await send()).sent).toMatchObject({ notice: { level: 100 } });
  });
});

describe('concurrency (RACE)', () => {
  it('RACE-001/AT-004/INV-09: 20 tabs race for the last slot — exactly one wins', async () => {
    await setPolicy((p) => (p.global.daily.max = 1));
    const contexts = [store, fresh(), fresh()];
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        contexts[i % 3]!.admit(draft(), NOW),
      ),
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(1);
    expect(await cell('global:all|daily')).toEqual({ counted: 0, reserved: 1 });
  });

  it('RACE-002: 100 concurrent requests with five slots → five sends, never more', async () => {
    await setPolicy((p) => (p.global.daily.max = 5));
    const contexts = [store, fresh(), fresh(), fresh()];
    const drafts = Array.from({ length: 100 }, (_, i) =>
      draft(i % 2 ? { provider: 'openai', credentialId: OPENAI } : {}),
    );
    const admitted = await Promise.all(
      drafts.map((d, i) => contexts[i % 4]!.admit(d, NOW)),
    );
    const winners = drafts.filter((_, i) => admitted[i]!.allowed);
    expect(winners).toHaveLength(5);
    const sent = await Promise.all(
      winners.map((d, i) => contexts[i % 4]!.dispatch(d.id, NOW)),
    );
    expect(sent.every((s) => s.allowed)).toBe(true);
    const { usage } = await snap();
    expect(usage['global:all|daily']).toEqual({ counted: 5, reserved: 0 });
    expect(
      usage['provider:gemini|daily']!.counted +
        usage['provider:openai|daily']!.counted,
    ).toBe(5);
  });

  it('RACE-014/UX-020/T24: two settings tabs saving the same revision → one wins, the other gets a conflict', async () => {
    const { policy } = await snap();
    const a = structuredClone(policy!);
    a.global.daily.max = 7;
    const b = structuredClone(policy!);
    b.global.daily.max = 9;
    const [first, second] = await Promise.all([
      store.savePolicy(a, policy!.revision, NOW),
      fresh().savePolicy(b, policy!.revision, NOW),
    ]);
    expect([first, second].sort()).toEqual(['conflict', 'saved']);
    expect((await snap()).policy!.revision).toBe(policy!.revision + 1);
  });

  it('RACE-009…013/T21: recovery gives back unsent reservations of a dead worker, keeps its sent ones (unknown), never replays', async () => {
    const reserved = draft({ bootId: 'dead-worker' });
    await store.admit(reserved, NOW);
    const sent = draft({ bootId: 'dead-worker' });
    await store.admit(sent, NOW);
    await store.dispatch(sent.id, NOW);
    const mine = draft({ bootId: 'boot-2' });
    await store.admit(mine, NOW);
    await store.recover('boot-2', NOW + 1000);
    await store.recover('boot-2', NOW + 2000); // idempotent
    const { usage, today, inProgress } = await snap();
    expect(usage['global:all|daily']).toEqual({ counted: 1, reserved: 1 });
    expect(today).toMatchObject([{ attempts: 1, unknown: 1 }]);
    // Only the live worker's own reservation is still in progress.
    expect(inProgress).toBe(1);
    expect(await store.dispatch(reserved.id, NOW)).toMatchObject({
      allowed: false,
    });
    expect(await store.dispatch(mine.id, NOW)).toMatchObject({ allowed: true });
  });
});

describe('fail closed (POL-002, SEC-010, RACE-020/022, MIG-013/014)', () => {
  it('POL-002: damaged limits → no request; repair restores defaults and keeps usage', async () => {
    await send();
    await rawPut('policy', { schemaVersion: 1, revision: 'x' }, 'active');
    expect((await send()).admission).toMatchObject({
      allowed: false,
      reason: 'invalid-policy',
    });
    const damaged = await snap();
    expect(damaged.status).toBe('damaged');
    expect(await store.savePolicy(damagedFix(), 5, NOW)).toBe('conflict');
    expect(await store.savePolicy(damagedFix(), null, NOW)).toBe('saved');
    expect((await snap()).usage['global:all|daily']).toEqual({
      counted: 1,
      reserved: 0,
    });
  });

  it('SEC-010/SEC-011: a negative or impossible counter blocks instead of reading as zero', async () => {
    await seedUsage('global', 'all', -3, ['daily']);
    await expect(store.admit(draft(), NOW)).rejects.toBeInstanceOf(
      QuotaStoreError,
    );
    await expect(snap()).rejects.toBeInstanceOf(QuotaStoreError);
  });

  it('RACE-022/T26: no IndexedDB at all → every call fails (callers send nothing)', async () => {
    const none = new QuotaStore(undefined);
    await expect(none.admit(draft(), NOW)).rejects.toBeInstanceOf(
      QuotaStoreError,
    );
    await expect(
      none.ensureReady(() => Promise.resolve(seed), NOW),
    ).rejects.toBeInstanceOf(QuotaStoreError);
  });

  it('MIG-013/T27: an import marker without limits is inconsistent and blocks', async () => {
    const db = await openRaw();
    await new Promise<void>((resolve) => {
      const tx = db.transaction('policy', 'readwrite');
      tx.objectStore('policy').delete('active');
      tx.oncomplete = () => resolve();
    });
    db.close();
    await expect(
      fresh().ensureReady(() => Promise.resolve(seed), NOW),
    ).rejects.toMatchObject({ reason: 'inconsistent' });
    expect((await snap()).status).toBe('missing');
  });
});

/** A valid policy written from scratch (the repair path). */
const damagedFix = () => {
  const policy = {
    schemaVersion: 1 as const,
    revision: 1,
    timezone: TZ,
    pauseAll: false,
    global: {
      daily: { enabled: true, max: 20 },
      weekly: { enabled: false, max: 140 },
      monthly: { enabled: false, max: 600 },
    },
    tasks: Object.fromEntries(
      ['correction', 'rewrite', 'translation', 'translateRewrite'].map((t) => [
        t,
        {
          daily: { enabled: false, max: 20 },
          weekly: { enabled: false, max: 140 },
          monthly: { enabled: false, max: 600 },
        },
      ]),
    ),
    providers: Object.fromEntries(
      ['gemini', 'openai'].map((t) => [
        t,
        {
          daily: { enabled: false, max: 20 },
          weekly: { enabled: false, max: 140 },
          monthly: { enabled: false, max: 600 },
        },
      ]),
    ),
    credentials: {},
    alerts: { at80: true, at95: true },
    updatedAt: NOW,
  };
  return policy as unknown as QuotaPolicy;
};

describe('migration from V5.1–V5.7 (MIG)', () => {
  const legacy = (): LegacySeed => ({
    timezone: TZ,
    dailyLimit: 7,
    usage: {
      ...emptyUsage('2026-10-15'),
      testAttempts: 5,
      completed: 3,
      failed: 1,
      unknown: 1,
      routes: {
        [`openai|${OPENAI}|2|gpt-5-nano|correction`]: {
          attempts: 2,
          completed: 2,
          failed: 0,
          unknown: 0,
          inputTokens: 10,
          outputTokens: 4,
        },
        [`gemini|${GEMINI}|1|gemini-3.1-flash-lite|rewrite`]: {
          attempts: 1,
          completed: 1,
          failed: 0,
          unknown: 0,
          inputTokens: 0,
          outputTokens: 0,
        },
      },
    },
  });

  it("MIG-002/003/010/011: the old daily limit and today's count are kept; unknown attribution stays in the total only", async () => {
    globalThis.indexedDB = new (
      globalThis.indexedDB.constructor as new () => IDBFactory
    )();
    store = fresh();
    await store.ensureReady(() => Promise.resolve(legacy()), NOW);
    const { policy, usage, migration } = await snap();
    expect(policy!.global.daily).toEqual({ enabled: true, max: 7 });
    expect(usage['global:all|daily']).toEqual({ counted: 5, reserved: 0 });
    expect(usage['global:all|monthly']).toEqual({ counted: 5, reserved: 0 });
    expect(usage['task:correction|daily']).toEqual({ counted: 2, reserved: 0 });
    expect(usage[`credential:${GEMINI}|weekly`]).toEqual({
      counted: 1,
      reserved: 0,
    });
    expect(usage['task:translation|daily']).toEqual({
      counted: 0,
      reserved: 0,
    });
    expect(migration).toMatchObject({
      importedAttempts: 5,
      unattributed: 2,
      trackingSince: at('2026-10-14T22:00:00Z'),
    });
    // 5 of 7 already used today: two more, then refused.
    expect((await send()).admission.allowed).toBe(true);
    expect((await send()).admission.allowed).toBe(true);
    expect((await send()).admission.allowed).toBe(false);
  });

  it('MIG-012/015/016/T13: concurrent or repeated imports never double the counts', async () => {
    globalThis.indexedDB = new (
      globalThis.indexedDB.constructor as new () => IDBFactory
    )();
    const loads = vi.fn(() => Promise.resolve(legacy()));
    await Promise.all([
      fresh().ensureReady(loads, NOW),
      fresh().ensureReady(loads, NOW),
      fresh().ensureReady(loads, NOW),
    ]);
    store = fresh();
    await store.ensureReady(loads, NOW + 60_000);
    expect((await snap()).usage['global:all|daily']).toEqual({
      counted: 5,
      reserved: 0,
    });
  });

  it('a fresh install starts with 20 per day total and nothing used', async () => {
    const { policy, usage, migration } = await snap();
    expect(policy!.global.daily).toEqual({ enabled: true, max: 20 });
    expect(usage['global:all|daily']).toEqual({ counted: 0, reserved: 0 });
    expect(migration).toMatchObject({ importedAttempts: 0, unattributed: 0 });
  });
});

describe('privacy and retention (SEC-014, §23)', () => {
  it('records hold metadata only and old finished operations are pruned; counters stay', async () => {
    const { draft: d } = await send();
    await store.settle(d.id, { state: 'completed', inputTokens: 3 }, NOW);
    const all = JSON.stringify([
      await rawAll('operations'),
      await rawAll('counters'),
      await rawAll('alerts'),
    ]);
    expect(all).not.toMatch(/SENTINEL|text|prompt|Bearer/i);
    await store.recover('boot-9', NOW + OPERATION_RETENTION_MS + 1);
    expect(await rawAll('operations')).toEqual([]);
    expect((await snap()).usage['global:all|daily']!.counted).toBe(1);
  });
});
