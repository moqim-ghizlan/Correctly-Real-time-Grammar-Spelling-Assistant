import {
  LANGUAGE_TOOL_BASE_URL,
  MAX_TEXT_LENGTH,
  REQUEST_TIMEOUT_MS,
  RETRY_DELAY_MS,
} from '../shared/constants';
import { CorrectionCache } from './correction-cache';
import type { CorrectionMatch, CheckResult } from './correction-types';
import type { Language } from './language';
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') throw new Error('Invalid response');
  return value as Record<string, unknown>;
}
export function normalizeMatches(
  payload: unknown,
  text: string,
): CorrectionMatch[] {
  const raw = record(payload).matches;
  if (!Array.isArray(raw)) throw new Error('Invalid matches');
  return raw.map((value: unknown) => {
    const match = record(value),
      rule = record(match.rule);
    const offset = match.offset,
      length = match.length;
    if (
      typeof offset !== 'number' ||
      typeof length !== 'number' ||
      !Number.isInteger(offset) ||
      !Number.isInteger(length) ||
      offset < 0 ||
      length < 0 ||
      offset + length > text.length ||
      typeof match.message !== 'string' ||
      typeof rule.id !== 'string' ||
      !Array.isArray(match.replacements)
    )
      throw new Error('Invalid match');
    const replacements = match.replacements.map((value: unknown) => {
      const replacement = record(value).value;
      if (typeof replacement !== 'string')
        throw new Error('Invalid replacement');
      return replacement;
    });
    const categoryId = record(rule.category).id;
    const category =
      rule.issueType === 'misspelling' || categoryId === 'TYPOS'
        ? 'spelling'
        : rule.issueType === 'style'
          ? 'style'
          : 'grammar';
    const originalFragment = text.slice(offset, offset + length);
    return {
      id: JSON.stringify([rule.id, offset, length, originalFragment]),
      offset,
      length,
      message: match.message,
      replacements,
      category,
      ruleId: rule.id,
      sourceText: text,
      originalFragment,
    };
  });
}
export class LanguageToolClient {
  private cache = new CorrectionCache();
  private unavailableUntil = 0;
  private pending = new Map<string, Promise<CheckResult>>();
  constructor(private fetcher: typeof fetch = fetch) {}
  async checkText(text: string, language: Language): Promise<CheckResult> {
    if (text.length > MAX_TEXT_LENGTH)
      return { status: 'too-long', matches: [] };
    if (!text.trim()) return { status: 'ready', matches: [] };
    const cached = this.cache.get(text, language);
    if (cached) return { status: 'ready', matches: cached };
    if (Date.now() < this.unavailableUntil)
      return { status: 'unavailable', matches: [] };
    const key = JSON.stringify([language, text]);
    const existing = this.pending.get(key);
    if (existing) return existing;
    const promise = this.request(text, language);
    this.pending.set(key, promise);
    try {
      return await promise;
    } finally {
      this.pending.delete(key);
    }
  }
  private async request(
    text: string,
    language: Language,
  ): Promise<CheckResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await this.fetcher(
        LANGUAGE_TOOL_BASE_URL + '/v2/check',
        {
          method: 'POST',
          body: new URLSearchParams({
            text,
            language,
            preferredVariants: 'en-US',
            enabledOnly: 'false',
          }),
          signal: controller.signal,
          credentials: 'omit',
          redirect: 'error',
        },
      );
      if (!response.ok) throw new Error('Server unavailable');
      const payload: unknown = await response.json();
      const matches = normalizeMatches(payload, text);
      this.cache.set(text, language, matches);
      this.unavailableUntil = 0;
      return { status: 'ready', matches };
    } catch {
      this.unavailableUntil = Date.now() + RETRY_DELAY_MS;
      return { status: 'unavailable', matches: [] };
    } finally {
      clearTimeout(timer);
    }
  }
}
