import { DEFAULT_MODEL_ID, isAllowedModelId } from './models';
import { isErrorCode, type ErrorCode } from './errors';
import { isLocalDate } from './local-date';
import {
  DEFAULT_REWRITE_STYLES,
  normalizeStyleIds,
  type RewriteStyleId,
} from './rewrite';

export const DAILY_LIMIT_DEFAULT = 20;
export const DAILY_LIMIT_MIN = 1;
export const DAILY_LIMIT_MAX = 100;

/** Written only by the options page. */
export interface V51Settings {
  schemaVersion: 1;
  gemini: {
    apiKey: string | null;
    modelId: string;
    // Incremented on every key save/removal so a test result can be tied to
    // the key it was made with, without storing any key-derived value.
    keyRevision: number;
  };
  // Counts every Gemini request (connection tests and corrections).
  safety: { dailyTestAttemptLimit: number };
  // V5.2: no selected text is ever sent before the user opts in.
  correction: { consent: boolean };
  // V5.3 entry points. The smart button needs optional all-sites access, so
  // it is off until the user enables it (and grants that access).
  triggers: { keyboard: boolean; contextMenu: boolean; smartButton: boolean };
  // V5.4: styles pre-selected in the rewrite picker (stable IDs only).
  rewrite: { enabled: boolean; defaultStyles: RewriteStyleId[] };
}

/** Written only by the service worker (cleared by the options page on key change). */
export interface ConnectionRecord {
  schemaVersion: 1;
  lastCheckAt: string | null;
  lastCheckOk: boolean | null;
  lastCheckModelId: string | null;
  lastCheckKeyRevision: number | null;
  lastErrorCode: ErrorCode | null;
  lastSuccessfulCheckAt: string | null;
  lastSuccessfulModelId: string | null;
}

/** Written only by the service worker's serialized usage guard. */
export interface DailyUsageRecord {
  schemaVersion: 1;
  localDate: string;
  testAttempts: number;
  completed: number;
  failed: number;
  inputTokensObserved: number;
  outputTokensObserved: number;
}

export const defaultSettings = (): V51Settings => ({
  schemaVersion: 1,
  gemini: { apiKey: null, modelId: DEFAULT_MODEL_ID, keyRevision: 0 },
  safety: { dailyTestAttemptLimit: DAILY_LIMIT_DEFAULT },
  correction: { consent: false },
  triggers: { keyboard: true, contextMenu: true, smartButton: false },
  rewrite: { enabled: true, defaultStyles: [...DEFAULT_REWRITE_STYLES] },
});

export const emptyConnection = (): ConnectionRecord => ({
  schemaVersion: 1,
  lastCheckAt: null,
  lastCheckOk: null,
  lastCheckModelId: null,
  lastCheckKeyRevision: null,
  lastErrorCode: null,
  lastSuccessfulCheckAt: null,
  lastSuccessfulModelId: null,
});

export const emptyUsage = (date: string): DailyUsageRecord => ({
  schemaVersion: 1,
  localDate: date,
  testAttempts: 0,
  completed: 0,
  failed: 0,
  inputTokensObserved: 0,
  outputTokensObserved: 0,
});

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const count = (value: unknown): number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : 0;

const isoOrNull = (value: unknown): string | null =>
  typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : null;

// Structural check only: proves nothing about validity at Google.
const API_KEY_PATTERN = /^[A-Za-z0-9_.-]{20,200}$/;

export type KeyValidation =
  { ok: true; key: string } | { ok: false; reason: string };

export function validateApiKey(input: string): KeyValidation {
  const key = input.trim();
  if (!key) return { ok: false, reason: 'Paste a key before saving.' };
  if (/\s/.test(key))
    return { ok: false, reason: 'The key must not contain spaces.' };
  if (!API_KEY_PATTERN.test(key))
    return {
      ok: false,
      reason:
        'This does not look like a Gemini API key (20–200 letters, digits, "-", "_" or ".").',
    };
  return { ok: true, key };
}

export function isApiKeyShaped(value: unknown): value is string {
  return typeof value === 'string' && API_KEY_PATTERN.test(value);
}

/** Returns the limit, or null when the input is not an integer in range. */
export function parseDailyLimit(value: unknown): number | null {
  const number =
    typeof value === 'string' && /^\s*\d+\s*$/.test(value)
      ? Number(value)
      : value;
  return typeof number === 'number' &&
    Number.isInteger(number) &&
    number >= DAILY_LIMIT_MIN &&
    number <= DAILY_LIMIT_MAX
    ? number
    : null;
}

export function normalizeSettings(value: unknown): V51Settings {
  const data = record(value),
    gemini = record(data.gemini),
    safety = record(data.safety),
    triggers = record(data.triggers),
    rewrite = record(data.rewrite);
  return {
    schemaVersion: 1,
    gemini: {
      apiKey: isApiKeyShaped(gemini.apiKey) ? gemini.apiKey : null,
      // A corrupt or unknown model falls back to the cheapest allowlisted one.
      modelId: isAllowedModelId(gemini.modelId)
        ? gemini.modelId
        : DEFAULT_MODEL_ID,
      keyRevision: count(gemini.keyRevision),
    },
    safety: {
      dailyTestAttemptLimit:
        parseDailyLimit(safety.dailyTestAttemptLimit) ?? DAILY_LIMIT_DEFAULT,
    },
    correction: { consent: record(data.correction).consent === true },
    triggers: {
      keyboard: triggers.keyboard !== false,
      contextMenu: triggers.contextMenu !== false,
      smartButton: triggers.smartButton === true,
    },
    rewrite: {
      enabled: rewrite.enabled !== false,
      defaultStyles: normalizeStyleIds(rewrite.defaultStyles).length
        ? normalizeStyleIds(rewrite.defaultStyles)
        : [...DEFAULT_REWRITE_STYLES],
    },
  };
}

export function normalizeConnection(value: unknown): ConnectionRecord {
  const data = record(value);
  const modelOrNull = (item: unknown) => (isAllowedModelId(item) ? item : null);
  return {
    schemaVersion: 1,
    lastCheckAt: isoOrNull(data.lastCheckAt),
    lastCheckOk:
      typeof data.lastCheckOk === 'boolean' ? data.lastCheckOk : null,
    lastCheckModelId: modelOrNull(data.lastCheckModelId),
    lastCheckKeyRevision:
      typeof data.lastCheckKeyRevision === 'number'
        ? count(data.lastCheckKeyRevision)
        : null,
    lastErrorCode: isErrorCode(data.lastErrorCode) ? data.lastErrorCode : null,
    lastSuccessfulCheckAt: isoOrNull(data.lastSuccessfulCheckAt),
    lastSuccessfulModelId: modelOrNull(data.lastSuccessfulModelId),
  };
}

/** A record for another day (or a corrupt one) becomes a fresh record for `today`. */
export function normalizeUsage(
  value: unknown,
  today: string,
): DailyUsageRecord {
  const data = record(value);
  if (!isLocalDate(data.localDate) || data.localDate !== today)
    return emptyUsage(today);
  return {
    schemaVersion: 1,
    localDate: today,
    testAttempts: count(data.testAttempts),
    completed: count(data.completed),
    failed: count(data.failed),
    inputTokensObserved: count(data.inputTokensObserved),
    outputTokensObserved: count(data.outputTokensObserved),
  };
}
