import {
  LANGUAGE_TOOL_BASE_URL,
  MAX_TEXT_LENGTH,
  REQUEST_TIMEOUT_MS,
  RETRY_DELAY_MS,
} from '../shared/constants';
import { logger } from '../shared/logger';
import { CorrectionCache } from './correction-cache';
import type { CorrectionMatch, CheckResult } from './correction-types';
import {
  autoPreferredLanguages,
  isSupportedLanguageCode,
  preferredAutoLanguage,
  type Language,
} from './language';
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
  private unavailableReason = '';
  private pending = new Map<string, Promise<CheckResult>>();
  constructor(private fetcher: typeof fetch = fetch) {}
  async checkText(text: string, language: Language): Promise<CheckResult> {
    if (text.length > MAX_TEXT_LENGTH)
      return { status: 'too-long', matches: [] };
    if (!text.trim()) return { status: 'ready', matches: [] };
    const cached = this.cache.get(text, language);
    if (cached) return { status: 'ready', matches: cached };
    if (Date.now() < this.unavailableUntil)
      return {
        status: 'unavailable',
        matches: [],
        reason: this.unavailableReason,
      };
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
    let reason = 'Impossible de joindre LanguageTool sur le port 8081.';
    try {
      // Call as a plain function: native WorkerGlobalScope.fetch rejects a client receiver.
      const fetcher = this.fetcher;
      const check = async (requestedLanguage: Language): Promise<unknown> => {
        reason = 'Impossible de joindre LanguageTool sur le port 8081.';
        const body = new URLSearchParams({
          text,
          language: requestedLanguage,
          enabledOnly: 'false',
        });
        if (requestedLanguage === 'auto') {
          body.set('preferredVariants', 'en-US');
          body.set('preferredLanguages', autoPreferredLanguages(text));
          body.set('forcePreferredLanguages', 'true');
        }
        const response = await fetcher(LANGUAGE_TOOL_BASE_URL + '/v2/check', {
          method: 'POST',
          body,
          signal: controller.signal,
          credentials: 'omit',
          redirect: 'error',
        });
        if (!response.ok) {
          reason =
            'LanguageTool a refusé l’analyse (HTTP ' + response.status + ').';
          throw new Error('Server unavailable');
        }
        reason = 'Réponse LanguageTool invalide.';
        return (await response.json()) as unknown;
      };
      let payload = await check(language);
      const responseCode = (value: unknown): unknown => {
        const detected = record(value).language;
        return detected && typeof detected === 'object'
          ? record(detected).code
          : undefined;
      };
      const code = responseCode(payload);
      if (
        language === 'auto' &&
        typeof code === 'string' &&
        !isSupportedLanguageCode(code)
      ) {
        payload = await check(preferredAutoLanguage(text));
      }
      const finalCode = responseCode(payload);
      if (
        typeof finalCode === 'string' &&
        !isSupportedLanguageCode(finalCode)
      ) {
        reason =
          'LanguageTool a renvoyé une langue non prise en charge. Seuls le français et l’anglais sont acceptés.';
        throw new Error('Unsupported language');
      }
      const matches = normalizeMatches(payload, text);
      this.cache.set(text, language, matches);
      this.unavailableUntil = 0;
      return { status: 'ready', matches };
    } catch {
      this.unavailableUntil = Date.now() + RETRY_DELAY_MS;
      this.unavailableReason = controller.signal.aborted
        ? 'LanguageTool n’a pas répondu dans le délai prévu.'
        : reason;
      logger.warn(this.unavailableReason);
      return {
        status: 'unavailable',
        matches: [],
        reason: this.unavailableReason,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
