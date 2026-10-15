// V5.9 local price references and the exact cost engine. Estimates only:
// never an invoice (no taxes, credits, tiers beyond those listed, FX).
//
// Units: a rate is stored as a decimal string in USD per 1M tokens and
// parsed to an integer number of micro-dollars per 1M tokens. A cost is then
// tokens × rate in pico-dollars (1e-12 USD), summed exactly with BigInt and
// rounded only for display.
import { isModelId, isProviderId, type ProviderId } from './models';

const PRICE_ID = /^[A-Za-z0-9._-]{8,80}$/;

export interface PriceEntry {
  /** Immutable: a change is a new entry with a later effective date. */
  id: string;
  provider: ProviderId;
  /** Exact provider model ID (no alias). */
  modelId: string;
  inputPerMillion: string;
  /** Rate of cached input tokens (a subset of input), when the provider has one. */
  cachedInputPerMillion: string | null;
  outputPerMillion: string;
  /** Applies to requests sent at or after this instant (UTC ms). */
  effectiveFrom: number;
  source: 'official' | 'owner';
  /** Short label (e.g. a page title) — shown as text, never fetched. */
  sourceLabel: string;
  verifiedAt: number;
}

const VERIFIED = Date.UTC(2026, 9, 15);
const GOOGLE = 'ai.google.dev/gemini-api/docs/pricing (Standard, paid tier)';
const OPENAI =
  'developers.openai.com/api/docs/pricing (Standard, short context ≤ 272K)';

/**
 * Official list prices checked on 2026-10-15 for the reviewed catalog
 * (models.ts). Correctly's prompts are a few thousand tokens at most, far
 * below the long-context tiers. Prices change: the owner can add newer
 * references in Statistics → Price references.
 */
export const OFFICIAL_PRICES: readonly PriceEntry[] = [
  ['gemini', 'gemini-3.1-flash-lite', '0.25', '0.025', '1.50', GOOGLE],
  ['gemini', 'gemini-3.5-flash-lite', '0.30', '0.03', '2.50', GOOGLE],
  ['openai', 'gpt-5.6-luna', '0.20', '0.02', '1.20', OPENAI],
  ['openai', 'gpt-6-luna', '0.10', '0.01', '0.50', OPENAI],
  ['openai', 'gpt-5-nano', '0.05', '0.005', '0.40', OPENAI],
].map(([provider, modelId, input, cached, output, label]) => ({
  id: `official-${modelId}-2026-10-15`,
  provider: provider as ProviderId,
  modelId: modelId!,
  inputPerMillion: input!,
  cachedInputPerMillion: cached!,
  outputPerMillion: output!,
  effectiveFrom: 0,
  source: 'official' as const,
  sourceLabel: label!,
  verifiedAt: VERIFIED,
}));

export const MAX_RATE_PER_MILLION = 10_000;
const RATE = /^(\d{1,5})(?:\.(\d{1,6}))?$/;

/** "0.025" → 25 000 micro-dollars per 1M tokens; anything else → null. */
export function parseRate(text: unknown): bigint | null {
  if (typeof text !== 'string') return null;
  const match = RATE.exec(text.trim());
  if (!match) return null;
  const micro =
    BigInt(match[1]!) * 1_000_000n + BigInt((match[2] ?? '').padEnd(6, '0'));
  return micro <= BigInt(MAX_RATE_PER_MILLION) * 1_000_000n ? micro : null;
}

const isPlain = (value: unknown): value is Record<string, unknown> =>
  !!value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;

/** Strict check of a stored or typed price entry. */
export function parsePriceEntry(value: unknown): PriceEntry | null {
  if (!isPlain(value)) return null;
  const v = value;
  const cached =
    v.cachedInputPerMillion === null ? null : v.cachedInputPerMillion;
  if (
    typeof v.id !== 'string' ||
    !PRICE_ID.test(v.id) ||
    !isProviderId(v.provider) ||
    !isModelId(v.modelId) ||
    parseRate(v.inputPerMillion) === null ||
    parseRate(v.outputPerMillion) === null ||
    (cached !== null && parseRate(cached) === null) ||
    typeof v.effectiveFrom !== 'number' ||
    !Number.isSafeInteger(v.effectiveFrom) ||
    v.effectiveFrom < 0 ||
    (v.source !== 'official' && v.source !== 'owner') ||
    typeof v.sourceLabel !== 'string' ||
    v.sourceLabel.length > 120 ||
    typeof v.verifiedAt !== 'number' ||
    !Number.isSafeInteger(v.verifiedAt)
  )
    return null;
  return {
    id: v.id,
    provider: v.provider,
    modelId: v.modelId,
    inputPerMillion: (v.inputPerMillion as string).trim(),
    cachedInputPerMillion: cached === null ? null : (cached as string).trim(),
    outputPerMillion: (v.outputPerMillion as string).trim(),
    effectiveFrom: v.effectiveFrom,
    source: v.source,
    sourceLabel: v.sourceLabel,
    verifiedAt: v.verifiedAt,
  };
}

/**
 * The price in force for a request sent at `at`: the latest entry whose
 * effective date is not after it (an owner entry wins a tie). A later
 * entry never reprices older requests.
 */
export function priceAt(
  prices: readonly PriceEntry[],
  provider: ProviderId,
  modelId: string,
  at: number,
): PriceEntry | null {
  const newer = (a: PriceEntry, b: PriceEntry) =>
    a.effectiveFrom !== b.effectiveFrom
      ? a.effectiveFrom > b.effectiveFrom
      : a.source !== b.source
        ? a.source === 'owner'
        : a.verifiedAt > b.verifiedAt;
  let best: PriceEntry | null = null;
  for (const entry of prices)
    if (
      entry.provider === provider &&
      entry.modelId === modelId &&
      entry.effectiveFrom <= at &&
      (!best || newer(entry, best))
    )
      best = entry;
  return best;
}

export interface Tokens {
  inputTokens: number | null;
  outputTokens: number | null;
  cachedInputTokens: number | null;
}

export type Cost =
  | { state: 'priced'; pico: bigint }
  | { state: 'no-tokens' }
  | { state: 'no-price' };

/**
 * One request's estimate. Input and output must both be reported (a total
 * alone cannot be split). Cached input is a subset of input: it is priced at
 * the cached rate only when both are known, otherwise all input is priced at
 * the normal input rate (the provider never charges more than that).
 * Reasoning/thinking tokens are already part of the reported output.
 */
export function costOf(tokens: Tokens, entry: PriceEntry | null): Cost {
  const { inputTokens: input, outputTokens: output } = tokens;
  if (input === null || output === null) return { state: 'no-tokens' };
  if (!entry) return { state: 'no-price' };
  const inputRate = parseRate(entry.inputPerMillion);
  const outputRate = parseRate(entry.outputPerMillion);
  const cachedRate = parseRate(entry.cachedInputPerMillion);
  if (inputRate === null || outputRate === null) return { state: 'no-price' };
  const cached = tokens.cachedInputTokens;
  const useCached =
    cachedRate !== null && cached !== null && cached >= 0 && cached <= input;
  const pico = useCached
    ? BigInt(input - cached) * inputRate +
      BigInt(cached) * cachedRate +
      BigInt(output) * outputRate
    : BigInt(input) * inputRate + BigInt(output) * outputRate;
  return { state: 'priced', pico };
}

const PICO = 1_000_000_000_000n;

/**
 * Display only: "$0.00" for an exact zero, cents from $0.01, and the first
 * significant digits below a cent (never a false "$0.00").
 */
export function formatUsd(pico: bigint): string {
  if (pico === 0n) return '$0.00';
  if (pico >= PICO / 100n) {
    const cents = (pico + PICO / 200n) / (PICO / 100n);
    return `$${(cents / 100n).toLocaleString('en-US')}.${(cents % 100n)
      .toString()
      .padStart(2, '0')}`;
  }
  // Below one cent: two significant digits, never a false "$0.00".
  const fraction = pico.toString().padStart(12, '0');
  const first = fraction.search(/[1-9]/);
  return `$0.${fraction
    .slice(0, first + 2)
    .replace(/0+$/, '')
    .padEnd(2, '0')}`;
}

/** Exact decimal string for exports (USD, 12 decimals, no rounding). */
export function usdString(pico: bigint): string {
  return `${pico / PICO}.${(pico % PICO).toString().padStart(12, '0')}`;
}
