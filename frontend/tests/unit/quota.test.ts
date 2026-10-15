import { describe, expect, it } from 'vitest';
import {
  CAP_MAX,
  crossing,
  defaultPolicy,
  describeNote,
  formatReset,
  hasGlobalCap,
  isTimeZone,
  parseCapInput,
  parsePolicy,
  reached,
  toQuotaNote,
  windowsAt,
  type QuotaNote,
} from '../../src/shared/quota';

// V5.8 pure rules: calendar windows, thresholds, validation and wording.

const PARIS = 'Europe/Paris';
const at = (iso: string) => Date.parse(iso);
const iso = (ms: number) => new Date(ms).toISOString();

describe('calendar windows (CAL)', () => {
  it('CAL-001: a Thursday in Paris → local day, ISO week (Monday) and month', () => {
    const w = windowsAt(at('2026-10-15T10:00:00Z'), PARIS);
    expect(w.daily).toMatchObject({
      label: '2026-10-15',
      start: at('2026-10-14T22:00:00Z'),
      end: at('2026-10-15T22:00:00Z'),
    });
    expect(w.weekly).toMatchObject({
      label: '2026-10-12',
      start: at('2026-10-11T22:00:00Z'),
      end: at('2026-10-18T22:00:00Z'),
    });
    // October ends in winter time (CET): 1 November 00:00 = 23:00 UTC.
    expect(w.monthly).toMatchObject({
      label: '2026-10-01',
      start: at('2026-09-30T22:00:00Z'),
      end: at('2026-10-31T23:00:00Z'),
    });
  });

  it('CAL-002/003/023: Sunday 23:59:59.999 is the old week, Monday 00:00 the new one', () => {
    expect(windowsAt(at('2026-10-18T21:59:59.999Z'), PARIS).weekly.label).toBe(
      '2026-10-12',
    );
    expect(windowsAt(at('2026-10-18T22:00:00Z'), PARIS).weekly.label).toBe(
      '2026-10-19',
    );
  });

  it('CAL-004/005: last millisecond of October vs first of November', () => {
    expect(windowsAt(at('2026-10-31T22:59:59.999Z'), PARIS).monthly.label).toBe(
      '2026-10-01',
    );
    expect(windowsAt(at('2026-10-31T23:00:00Z'), PARIS).monthly.label).toBe(
      '2026-11-01',
    );
  });

  it('CAL-006/007: the ISO week across New Year starts Monday 28 December', () => {
    const eve = windowsAt(at('2026-12-31T12:00:00Z'), PARIS).weekly;
    const day = windowsAt(at('2027-01-01T12:00:00Z'), PARIS).weekly;
    expect(eve).toEqual(day);
    expect(eve.label).toBe('2026-12-28');
    expect(windowsAt(at('2027-01-04T12:00:00Z'), PARIS).weekly.label).toBe(
      '2027-01-04',
    );
  });

  it('CAL-008: leap day 2028-02-29', () => {
    const w = windowsAt(at('2028-02-29T12:00:00Z'), PARIS);
    expect(w.daily.label).toBe('2028-02-29');
    expect(iso(w.daily.end)).toBe('2028-02-29T23:00:00.000Z');
    expect(w.monthly).toMatchObject({
      label: '2028-02-01',
      end: at('2028-02-29T23:00:00Z'),
    });
  });

  it('CAL-009/010: DST days last 23 h (spring) and 25 h (autumn), never a fixed 24 h', () => {
    const spring = windowsAt(at('2027-03-28T12:00:00Z'), PARIS).daily;
    expect(spring.end - spring.start).toBe(23 * 3_600_000);
    const autumn = windowsAt(at('2026-10-25T12:00:00Z'), PARIS).daily;
    expect(autumn).toMatchObject({
      start: at('2026-10-24T22:00:00Z'),
      end: at('2026-10-25T23:00:00Z'),
    });
    expect(autumn.end - autumn.start).toBe(25 * 3_600_000);
  });

  it('CAL-020: half- and quarter-hour offsets', () => {
    expect(
      iso(windowsAt(at('2026-10-15T10:00:00Z'), 'Asia/Kolkata').daily.start),
    ).toBe('2026-10-14T18:30:00.000Z');
    expect(
      iso(windowsAt(at('2026-10-15T10:00:00Z'), 'Asia/Kathmandu').daily.start),
    ).toBe('2026-10-14T18:15:00.000Z');
  });

  it('a day that starts at 01:00 (DST at midnight) starts at its first instant', () => {
    // Chile moves 00:00 → 01:00 on the first Sunday after 2 September.
    const day = windowsAt(at('2026-09-06T15:00:00Z'), 'America/Santiago').daily;
    expect(day.label).toBe('2026-09-06');
    expect(windowsAt(day.start - 1000, 'America/Santiago').daily.label).toBe(
      '2026-09-05',
    );
  });

  it('CAL-016/CAL-019 property: windows are consecutive, contain now, never overlap', () => {
    for (const zone of [PARIS, 'America/New_York', 'Asia/Kolkata', 'UTC'])
      for (
        let now = at('2026-01-01T00:00:00Z');
        now < at('2027-01-01T00:00:00Z');
        now += 7 * 3_600_000 + 13 * 60_000
      ) {
        const w = windowsAt(now, zone);
        for (const period of ['daily', 'weekly', 'monthly'] as const) {
          const window = w[period];
          expect(window.start <= now && now < window.end).toBe(true);
          expect(windowsAt(window.end, zone)[period].start).toBe(window.end);
        }
      }
  });

  it('CAL-011/013: IANA zones are validated, invented ones refused', () => {
    expect(isTimeZone(PARIS)).toBe(true);
    expect(isTimeZone('UTC')).toBe(true);
    for (const bad of ['Mars/Olympus', '', '../x', 'Europe/Paris<script>', 42])
      expect(isTimeZone(bad)).toBe(false);
  });
});

describe('thresholds (NOTE, exact integer math)', () => {
  const LEVELS = [80, 95, 100] as const;
  it.each([
    [5000, 3999, 4000, 80],
    [5000, 4749, 4750, 95],
    [5000, 4999, 5000, 100],
    [5000, 3998, 3999, null],
    [5000, 4000, 4001, null],
    [1, 0, 1, 100],
    [2, 0, 1, null],
    [2, 1, 2, 100],
    [10, 7, 8, 80],
    [10, 9, 10, 100],
    [20, 15, 16, 80],
    [20, 18, 19, 95],
  ])('max %i: %i → %i crosses %s', (max, before, after, expected) => {
    expect(crossing(before, after, max, LEVELS)).toBe(expected);
  });

  it('disabled warning levels are skipped; 100% is always reported', () => {
    expect(crossing(3999, 4000, 5000, [100])).toBeNull();
    expect(crossing(4999, 5000, 5000, [100])).toBe(100);
  });

  it('reached() has no floating-point boundary error', () => {
    expect(reached(4750, 5000, 95)).toBe(true);
    expect(reached(4749, 5000, 95)).toBe(false);
    expect(reached(CAP_MAX, CAP_MAX, 100)).toBe(true);
  });
});

describe('typed maximum (UX-003…008, POL-017…020)', () => {
  it.each([
    ['5000', 5000],
    ['5,000', 5000],
    ['5 000', 5000],
    ['5 000', 5000],
    [' 12 ', 12],
    ['1,000,000', 1_000_000],
  ])('accepts %j as %i', (input, value) => {
    expect(parseCapInput(input)).toBe(value);
  });

  it.each([
    '',
    '   ',
    '0',
    '-5',
    '1.5',
    '5.000',
    '1e3',
    '1e9',
    '1000001',
    '5,00',
    'abc',
    'Infinity',
    'NaN',
    '9007199254740993',
  ])('refuses %j (never 0, 5 or unlimited)', (input) => {
    expect(parseCapInput(input)).toBeNull();
  });
});

describe('policy validation (POL, SEC)', () => {
  const valid = () => defaultPolicy(PARIS, 20, 1);

  it('POL-001: the first policy keeps the V5.1–V5.7 daily limit as the total daily cap', () => {
    const policy = defaultPolicy(PARIS, 7, 1);
    expect(policy.global.daily).toEqual({ enabled: true, max: 7 });
    expect(policy.global.weekly.enabled).toBe(false);
    expect(policy.tasks.correction.daily.enabled).toBe(false);
    expect(policy.pauseAll).toBe(false);
    expect(policy.alerts).toEqual({ at80: true, at95: true });
    expect(parsePolicy(policy)).toEqual(policy);
  });

  it('POL-017…020/SEC-010: unsafe values make the whole policy invalid (fail closed)', () => {
    for (const max of [0, -1, 1.5, Number.NaN, Infinity, CAP_MAX + 1, '20'])
      expect(
        parsePolicy({
          ...valid(),
          global: { ...valid().global, weekly: { enabled: false, max } },
        }),
      ).toBeNull();
  });

  it('AT-029: a policy with every total cap off is invalid (no unlimited paid path)', () => {
    const policy = valid();
    policy.global.daily.enabled = false;
    expect(hasGlobalCap(policy)).toBe(false);
    expect(parsePolicy(policy)).toBeNull();
  });

  it('CAL-013/SEC-009: bad zones, unknown keys and prototype tricks are refused', () => {
    expect(parsePolicy({ ...valid(), timezone: 'Nowhere/City' })).toBeNull();
    expect(parsePolicy({ ...valid(), extra: true })).toBeNull();
    expect(parsePolicy({ ...valid(), tasks: [] })).toBeNull();
    const polluted = JSON.parse(
      JSON.stringify(valid()).replace(
        '"credentials":{}',
        '"credentials":{"__proto__":{"daily":{"enabled":true,"max":1}}}',
      ),
    ) as unknown;
    expect(parsePolicy(polluted)).toBeNull();
    expect(({} as Record<string, unknown>).daily).toBeUndefined();
    expect(parsePolicy(null)).toBeNull();
    expect(parsePolicy({ ...valid(), schemaVersion: 2 })).toBeNull();
  });
});

describe('notes shown in pages (no text, no key)', () => {
  const note: QuotaNote = {
    level: 95,
    blocked: false,
    scope: 'task',
    task: 'correction',
    provider: null,
    period: 'daily',
    used: 4750,
    max: 5000,
    resetAt: at('2026-10-15T22:00:00Z'),
    timezone: PARIS,
  };

  it('CAL-021/022/NOTE-025: the reset is the real local instant with its zone', () => {
    expect(formatReset(at('2026-10-15T22:00:00Z'), PARIS)).toBe(
      'Fri 16 Oct, 00:00 (Europe/Paris)',
    );
    expect(formatReset(at('2026-11-01T23:00:00Z'), PARIS)).toBe(
      'Mon 2 Nov, 00:00 (Europe/Paris)',
    );
  });

  it('wording of 80/95/100 % and of a refusal', () => {
    expect(describeNote(note)).toBe(
      'Correctly: 95% of your daily correction request limit used (4,750 / 5,000). Only 250 remain. Resets Fri 16 Oct, 00:00 (Europe/Paris).',
    );
    expect(describeNote({ ...note, level: 80, used: 4000 })).toContain(
      '80% of your daily correction request limit used (4,000 / 5,000). 1,000 remain.',
    );
    expect(
      describeNote({
        ...note,
        level: 100,
        used: 5000,
        scope: 'global',
        task: null,
        period: 'weekly',
      }),
    ).toMatch(/^Weekly total AI request limit reached \(5,000 \/ 5,000\)\./);
    expect(
      describeNote({
        ...note,
        level: 100,
        blocked: true,
        scope: 'credential',
        task: null,
        period: 'monthly',
        used: 120,
        max: 100,
      }),
    ).toMatch(
      /^Monthly request limit for this API key reached \(120 \/ 100\)\. No request was sent\./,
    );
  });

  it('NOTE-019/SEC-007: a note is strictly validated across the message boundary', () => {
    expect(toQuotaNote(note)).toEqual(note);
    expect(toQuotaNote({ ...note, task: 'shell' })).toBeNull();
    expect(toQuotaNote({ ...note, level: 50 })).toBeNull();
    expect(toQuotaNote({ ...note, timezone: '<img>' })).toBeNull();
    expect(toQuotaNote({ ...note, used: -1 })).toBeNull();
    expect(toQuotaNote({ ...note, scope: 'provider' })).toBeNull();
    expect(toQuotaNote({ ...note, label: '<b>x</b>' })).toEqual(note);
    expect(toQuotaNote('x')).toBeNull();
  });
});
