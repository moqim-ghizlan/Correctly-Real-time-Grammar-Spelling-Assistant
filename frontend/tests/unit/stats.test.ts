import { describe, expect, it } from 'vitest';
import { OFFICIAL_PRICES, type PriceEntry } from '../../src/shared/prices';
import type { EditEvent, Operation } from '../../src/shared/quota-store';
import {
  csvCell,
  daySeries,
  resolveRange,
  summarize,
  toCsv,
  toJson,
  totalsOf,
  type StatsRange,
} from '../../src/shared/stats';

// V5.9 statistics over unique operations (Appendix A fixtures).

const PARIS = 'Europe/Paris';
const at = (iso: string) => Date.parse(iso);
const NOW = at('2026-10-15T10:00:00Z'); // Thursday noon in Paris
let n = 0;

const op = (over: Partial<Operation> = {}): Operation => ({
  id: `operation-${++n}`,
  bootId: 'boot-1',
  task: 'correction',
  provider: 'gemini',
  credentialId: 'gemini-profile-1',
  revision: 1,
  modelId: 'gemini-3.1-flash-lite',
  state: 'completed',
  createdAt: NOW,
  dispatchAt: NOW,
  settledAt: NOW,
  policyRevision: 1,
  keys: [],
  inputTokens: 100,
  outputTokens: 50,
  cachedInputTokens: 0,
  ...over,
});
const event = (
  operation: Operation,
  action: 'applied' | 'undone',
  when = NOW,
): EditEvent => ({
  id: `${operation.id}|${action}`,
  operationId: operation.id,
  action,
  task: operation.task,
  provider: operation.provider,
  credentialId: operation.credentialId,
  modelId: operation.modelId,
  at: when,
});
const range = (preset: 'today' | 'week' | 'month' = 'today', now = NOW) =>
  resolveRange(preset, now, PARIS) as StatsRange;
const PRICES: PriceEntry[] = [...OFFICIAL_PRICES];

describe('periods (CAL)', () => {
  it('today, ISO week and month follow the V5.8 calendar in the limits time zone', () => {
    expect(range('today')).toMatchObject({
      from: '2026-10-15',
      to: '2026-10-15',
      start: at('2026-10-14T22:00:00Z'),
      end: at('2026-10-15T22:00:00Z'),
    });
    expect(range('week')).toMatchObject({
      from: '2026-10-12',
      to: '2026-10-18',
    });
    expect(range('month')).toMatchObject({
      from: '2026-10-01',
      to: '2026-10-31',
      end: at('2026-10-31T23:00:00Z'),
    });
  });

  it('a custom range is inclusive by date; DST days keep their real length', () => {
    const one = resolveRange('custom', NOW, PARIS, '2026-10-15', '2026-10-15');
    expect(one).toMatchObject({
      start: at('2026-10-14T22:00:00Z'),
      end: at('2026-10-15T22:00:00Z'),
    });
    const autumn = resolveRange(
      'custom',
      NOW,
      PARIS,
      '2026-10-25',
      '2026-10-25',
    );
    expect(autumn).toMatchObject({
      start: at('2026-10-24T22:00:00Z'),
      end: at('2026-10-25T23:00:00Z'),
    });
  });

  it('invalid, reversed or too long ranges are refused before any read', () => {
    for (const [from, to] of [
      ['', ''],
      ['2026-02-30', '2026-03-01'],
      ['2026-10-16', '2026-10-15'],
      ['2025-10-15', '2026-10-16'],
      ['15/10/2026', '2026-10-16'],
    ])
      expect(resolveRange('custom', NOW, PARIS, from, to)).toHaveProperty(
        'error',
      );
    expect(
      resolveRange('custom', NOW, PARIS, '2025-10-16', '2026-10-16'),
    ).not.toHaveProperty('error');
  });

  it('a request sent exactly at the end of a range belongs to the next one', () => {
    const today = range('today');
    const inside = op({ dispatchAt: today.start });
    const next = op({ dispatchAt: today.end });
    expect(summarize(today, [inside, next], [], PRICES).totals.attempts).toBe(
      1,
    );
  });

  it('A.3: sent Sunday 23:59, answered Monday, applied Monday 00:03', () => {
    const sunday = resolveRange(
      'custom',
      NOW,
      PARIS,
      '2026-10-18',
      '2026-10-18',
    ) as StatsRange;
    const monday = resolveRange(
      'custom',
      NOW,
      PARIS,
      '2026-10-19',
      '2026-10-19',
    ) as StatsRange;
    const request = op({
      dispatchAt: at('2026-10-18T21:59:00Z'),
      settledAt: at('2026-10-18T22:02:00Z'),
    });
    const applied = event(request, 'applied', at('2026-10-18T22:03:00Z'));
    expect(summarize(sunday, [request], [applied], PRICES)).toMatchObject({
      totals: { attempts: 1, successful: 1 },
      applied: 0,
    });
    expect(summarize(monday, [request], [applied], PRICES)).toMatchObject({
      totals: { attempts: 0 },
      applied: 1,
    });
  });
});

describe('counting (ACT, TOK)', () => {
  it('A.1: correction + four-style rewrite + timeout → 3 requests, 2 results, partial tokens and cost', () => {
    const correction = op({ inputTokens: 100, outputTokens: 50 });
    const rewrite = op({ task: 'rewrite', inputTokens: 250, outputTokens: 25 });
    const timeout = op({
      task: 'translation',
      state: 'unknown',
      inputTokens: null,
      outputTokens: null,
      cachedInputTokens: null,
    });
    const summary = summarize(
      range(),
      [correction, rewrite, timeout],
      [],
      PRICES,
    );
    expect(summary.totals).toMatchObject({
      attempts: 3,
      successful: 2,
      unknown: 1,
      inputTokens: 350,
      inputReported: 2,
      outputTokens: 75,
      outputReported: 2,
      priced: 2,
      missingTokens: 1,
      costState: 'partial',
    });
    // 350 × 0.25 + 75 × 1.50 per million = $0.00020
    expect(summary.totals.costPico).toBe(200_000_000n);
    expect(summary.byTaskSuccess).toMatchObject({ correction: 1, rewrite: 1 });
  });

  it('INV-09: unknown never shows as zero; no request at all is $0.00', () => {
    expect(totalsOf([], PRICES).costState).toBe('none');
    const unpriced = op({ modelId: 'gemini-9-ultra' });
    expect(totalsOf([unpriced], PRICES)).toMatchObject({
      costState: 'unknown',
      missingPrice: 1,
      costPico: 0n,
    });
    const lost = op({
      state: 'unknown',
      inputTokens: null,
      outputTokens: null,
    });
    expect(totalsOf([lost], PRICES)).toMatchObject({
      costState: 'unknown',
      missingTokens: 1,
    });
  });

  it('INV-03/16: an operation listed twice counts once; failures and waiting requests stay counted', () => {
    const one = op();
    const failed = op({ state: 'failed-after-send' });
    const waiting = op({
      state: 'dispatching',
      inputTokens: null,
      outputTokens: null,
    });
    const summary = summarize(range(), [one, one, failed, waiting], [], PRICES);
    expect(summary.totals).toMatchObject({
      attempts: 3,
      successful: 1,
      failed: 1,
      pending: 1,
    });
  });

  it('INV-07/08: applied edits come only from recorded events; undo never removes requests or cost', () => {
    const correction = op();
    const rewrite = op({ task: 'rewrite' });
    const summary = summarize(
      range(),
      [correction, rewrite],
      [
        event(correction, 'applied'),
        event(correction, 'applied'),
        event(correction, 'undone'),
      ],
      PRICES,
    );
    expect(summary).toMatchObject({ applied: 1, undone: 1 });
    expect(summary.appliedByTask).toMatchObject({ correction: 1, rewrite: 0 });
    expect(summary.totals.attempts).toBe(2);
  });

  it('GRP: groups are disjoint and add up to the total; filters narrow everything', () => {
    const operations = [
      op(),
      op({ task: 'rewrite' }),
      op({
        provider: 'openai',
        modelId: 'gpt-5-nano',
        credentialId: 'openai-profile-1',
      }),
      op({ task: 'test', credentialId: 'gemini-profile-2' }),
    ];
    const summary = summarize(range(), operations, [], PRICES);
    for (const key of ['task', 'provider', 'model', 'credential'] as const)
      expect(
        summary.groups[key].reduce((sum, row) => sum + row.totals.attempts, 0),
      ).toBe(4);
    expect(
      summary.groups.provider.map((row) => [row.key, row.totals.attempts]),
    ).toEqual([
      ['gemini', 3],
      ['openai', 1],
    ]);
    const openai = summarize(range(), operations, [], PRICES, {
      task: 'all',
      provider: 'openai',
      modelId: 'all',
      credentialId: 'all',
    });
    expect(openai.totals.attempts).toBe(1);
    // Filter lists still show everything seen in the period.
    expect(openai.seen.credentials).toHaveLength(3);
  });

  it('every day of the range is listed, zero days included', () => {
    const week = range('week');
    const rows = daySeries(week, [
      op({ dispatchAt: at('2026-10-12T08:00:00Z') }),
      op({ dispatchAt: at('2026-10-15T08:00:00Z'), state: 'unknown' }),
    ]);
    expect(rows.map((row) => row.date)).toEqual([
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
      '2026-10-17',
      '2026-10-18',
    ]);
    expect(rows.map((row) => row.attempts)).toEqual([1, 0, 0, 1, 0, 0, 0]);
    expect(rows[3]!.successful).toBe(0);
  });
});

describe('export (CSV, SEC)', () => {
  const evil = '=HYPERLINK("http://invalid","x")';

  it('INV-22/T15: formula-like labels are written as plain text', () => {
    expect(csvCell(evil)).toBe(`"'=HYPERLINK(""http://invalid"",""x"")"`);
    for (const start of ['+1', '-1', '@x', '\t=1', ' =1', '|x', '%x'])
      expect(csvCell(start).startsWith(`"'`)).toBe(true);
    expect(csvCell('line\r\nbreak')).toBe('"line\nbreak"');
    expect(csvCell(12)).toBe('"12"');
  });

  it('CSV and JSON carry the same aggregates, no text, no key, cost marked as estimate', () => {
    const summary = summarize(
      range(),
      [
        op(),
        op({
          credentialId: 'openai-profile-1',
          provider: 'openai',
          modelId: 'gpt-5-nano',
        }),
      ],
      [],
      PRICES,
    );
    const label = (id: string) =>
      id === 'openai-profile-1' ? evil : 'Gemini personal';
    const csv = toCsv(summary, label);
    expect(csv.split('\r\n')[0]).toMatch(
      /^"group","name","provider","requests"/,
    );
    expect(csv).toContain(`"'=HYPERLINK`);
    expect(csv).not.toMatch(/(^|,)"=/m);
    const json = JSON.parse(toJson(summary, NOW, label, 'Complete.')) as {
      costKind: string;
      totals: { requests: number; estimatedUsd: string };
      groups: { credential: { name: string }[] };
    };
    expect(json.costKind).toBe('estimated-not-invoice');
    expect(json.totals.requests).toBe(2);
    expect(json.totals.estimatedUsd).toMatch(/^0\.\d{12}$/);
    for (const text of [csv, JSON.stringify(json)])
      expect(text).not.toMatch(/SENTINEL|Bearer|apiKey|prompt|correctedText/i);
  });
});
