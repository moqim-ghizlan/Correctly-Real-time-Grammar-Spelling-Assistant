import { describe, expect, it } from 'vitest';
import { MODEL_CATALOG } from '../../src/shared/models';
import {
  OFFICIAL_PRICES,
  costOf,
  formatUsd,
  parsePriceEntry,
  parseRate,
  priceAt,
  usdString,
  type PriceEntry,
} from '../../src/shared/prices';

// V5.9 cost engine: exact integer arithmetic (pico-dollars), estimates only.

const entry = (over: Partial<PriceEntry> = {}): PriceEntry => ({
  id: 'owner-fixture-1',
  provider: 'gemini',
  modelId: 'gemini-3.1-flash-lite',
  inputPerMillion: '0.10',
  cachedInputPerMillion: null,
  outputPerMillion: '0.40',
  effectiveFrom: 0,
  source: 'owner',
  sourceLabel: 'fixture',
  verifiedAt: 0,
  ...over,
});
const tokens = (
  inputTokens: number | null,
  outputTokens: number | null,
  cachedInputTokens: number | null = null,
) => ({ inputTokens, outputTokens, cachedInputTokens });
const usd = (cost: ReturnType<typeof costOf>) =>
  cost.state === 'priced' ? usdString(cost.pico) : cost.state;

describe('cost fixtures (USD N-01…N-10)', () => {
  it('N-01: 1,000 in + 200 out at $0.10 / $0.40 per 1M = $0.00018', () => {
    const cost = costOf(tokens(1000, 200), entry());
    expect(usd(cost)).toBe('0.000180000000');
    expect(cost.state === 'priced' && formatUsd(cost.pico)).toBe('$0.00018');
  });

  it('N-02: 1,000 such requests = $0.18 exactly (no per-request rounding)', () => {
    let total = 0n;
    for (let i = 0; i < 1000; i++) {
      const cost = costOf(tokens(1000, 200), entry());
      if (cost.state === 'priced') total += cost.pico;
    }
    expect(usdString(total)).toBe('0.180000000000');
    expect(formatUsd(total)).toBe('$0.18');
  });

  it('N-03: cached input is a subset priced at its own rate', () => {
    const cost = costOf(
      tokens(1000, 100, 400),
      entry({
        inputPerMillion: '1',
        cachedInputPerMillion: '0.25',
        outputPerMillion: '2',
      }),
    );
    // 600 × 1 + 400 × 0.25 + 100 × 2 per million = $0.0009
    expect(usd(cost)).toBe('0.000900000000');
  });

  it('N-04: reasoning tokens are already in output and never added twice', () => {
    // The adapters report output including reasoning: 200, not 250.
    expect(usd(costOf(tokens(0, 200), entry({ outputPerMillion: '2' })))).toBe(
      '0.000400000000',
    );
  });

  it('N-05/N-06: a missing direction is unknown, never zero', () => {
    expect(costOf(tokens(100, null), entry()).state).toBe('no-tokens');
    expect(costOf(tokens(null, 50), entry()).state).toBe('no-tokens');
    expect(costOf(tokens(null, null), entry()).state).toBe('no-tokens');
  });

  it('a model without a price reference is unknown, never free', () => {
    expect(costOf(tokens(100, 50), null).state).toBe('no-price');
  });

  it('cached count unknown, or no cached rate → all input at the normal rate', () => {
    const rates = { inputPerMillion: '1', cachedInputPerMillion: '0.25' };
    expect(usd(costOf(tokens(1000, 0), entry(rates)))).toBe('0.001000000000');
    expect(
      usd(costOf(tokens(1000, 0, 400), entry({ inputPerMillion: '1' }))),
    ).toBe('0.001000000000');
    // An impossible cached count (above input) is ignored.
    expect(usd(costOf(tokens(1000, 0, 2000), entry(rates)))).toBe(
      '0.001000000000',
    );
  });

  it('N-08/N-09: a price applies from its date; a newer one never reprices older requests', () => {
    const day = 86_400_000;
    const old = entry({ id: 'owner-old-0001', effectiveFrom: 10 * day });
    const newer = entry({
      id: 'owner-new-0001',
      effectiveFrom: 20 * day,
      inputPerMillion: '9',
    });
    expect(
      priceAt([old, newer], 'gemini', 'gemini-3.1-flash-lite', 5 * day),
    ).toBe(null);
    expect(
      priceAt([old, newer], 'gemini', 'gemini-3.1-flash-lite', 15 * day),
    ).toBe(old);
    expect(
      priceAt([old, newer], 'gemini', 'gemini-3.1-flash-lite', 20 * day),
    ).toBe(newer);
    expect(priceAt([old], 'openai', 'gemini-3.1-flash-lite', 15 * day)).toBe(
      null,
    );
    expect(priceAt([old], 'gemini', 'gemini-3.5-flash-lite', 15 * day)).toBe(
      null,
    );
  });

  it('an owner entry wins over the official one with the same date', () => {
    const official = OFFICIAL_PRICES[0]!;
    const mine = entry({
      provider: official.provider,
      modelId: official.modelId,
    });
    expect(priceAt([official, mine], mine.provider, mine.modelId, 1)).toBe(
      mine,
    );
  });

  it('N-10: malformed rates are refused', () => {
    for (const bad of [
      'NaN',
      'Infinity',
      '-1',
      '1e3',
      '0,25',
      '',
      '0.1234567',
      '1'.repeat(10_000),
      '10001',
      ' ',
      42,
      null,
    ])
      expect(parseRate(bad)).toBeNull();
    expect(parseRate('0.025')).toBe(25_000n);
    expect(parseRate('10000')).toBe(10_000_000_000n);
  });
});

describe('display and registry', () => {
  it('never rounds a small estimate to a false $0.00', () => {
    expect(formatUsd(0n)).toBe('$0.00');
    expect(formatUsd(1n)).toBe('$0.000000000001');
    expect(formatUsd(900_000_000n)).toBe('$0.0009');
    expect(formatUsd(9_990_000_000n)).toBe('$0.0099');
    expect(formatUsd(10_000_000_000n)).toBe('$0.01');
    expect(formatUsd(1_234_565_000_000_000n)).toBe('$1,234.57');
  });

  it('every reviewed model has a dated official reference', () => {
    for (const model of MODEL_CATALOG)
      expect(
        OFFICIAL_PRICES.some(
          (price) =>
            price.provider === model.provider && price.modelId === model.id,
        ),
      ).toBe(true);
    for (const price of OFFICIAL_PRICES) {
      expect(parseRate(price.inputPerMillion)).not.toBeNull();
      expect(parseRate(price.outputPerMillion)).not.toBeNull();
      expect(price.verifiedAt).toBe(Date.UTC(2026, 9, 15));
    }
  });

  it('stored entries are strictly validated (SEC: no prototype tricks, no script)', () => {
    expect(parsePriceEntry(entry())).toEqual(entry());
    for (const bad of [
      { ...entry(), modelId: '<img src=x>' },
      { ...entry(), provider: 'anthropic' },
      { ...entry(), inputPerMillion: '-1' },
      { ...entry(), effectiveFrom: -5 },
      { ...entry(), sourceLabel: 'x'.repeat(121) },
      { ...entry(), id: '../../x' },
      JSON.parse('{"__proto__":{"x":1}}') as unknown,
      [],
    ])
      expect(parsePriceEntry(bad)).toBeNull();
  });
});
