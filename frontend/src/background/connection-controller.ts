import type {
  ConnectionResult,
  CorrectionResult,
  FailureResult,
} from '../shared/contracts';
import type {
  CandidatesResult,
  RewriteResult,
  RewriteStyleId,
} from '../shared/rewrite';
import {
  translationKeys,
  type TranslateTextRequest,
  type TranslationKey,
} from '../shared/translate';
import {
  CorrectlyError,
  errorMessage,
  isRetryable,
  type ErrorCode,
} from '../shared/errors';
import { isAllowedModelId } from '../shared/models';
import { shield, type Shield } from '../shared/protection';
import type { Candidate } from '../shared/rewrite';
import { loadShortcuts } from '../shared/shortcuts';
import {
  loadConnection,
  loadSettings,
  saveConnection,
  type StorageArea,
} from '../shared/storage';
import {
  CORRECTION_TIMEOUT_MS,
  correctionBody,
  parseCorrection,
  splitEdges,
} from './correction';
import {
  candidateText,
  postGemini,
  testGemini,
  type GeminiReply,
  type GeminiResult,
} from './gemini-client';
import { REWRITE_TIMEOUT_MS, parseRewrite, rewriteBody } from './rewrite';
import { parseTranslation, translationBody } from './translate';
import { UsageGuard } from './usage-guard';

export interface ControllerDeps {
  area: StorageArea;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => Date;
  today?: () => string;
  isOnline?: () => boolean;
  /** Tests only: deterministic placeholder namespace. */
  placeholderTag?: () => string;
}

const failure = (code: ErrorCode, httpStatus?: number): FailureResult => ({
  ok: false,
  code,
  message: errorMessage(code),
  retryable: isRetryable(code),
  ...(httpStatus === undefined ? {} : { httpStatus }),
});

type Ready = {
  ok: true;
  apiKey: string;
  modelId: string;
  keyRevision: number;
  localDate: string;
};

/**
 * Handles TEST_CONNECTION, CORRECT_TEXT, REWRITE_TEXT and TRANSLATE_TEXT. Requests run one at a time; each
 * one is reserved in the usage ledger before the network is touched and is
 * never retried.
 */
export class ConnectionController {
  private readonly guard: UsageGuard;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly now: () => Date;
  private readonly isOnline: () => boolean;

  constructor(private readonly deps: ControllerDeps) {
    this.guard = new UsageGuard(deps.area, deps.today);
    this.now = deps.now ?? (() => new Date());
    this.isOnline = deps.isOnline ?? (() => navigator.onLine !== false);
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T | FailureResult> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run.catch((error: unknown) =>
      failure(error instanceof CorrectlyError ? error.code : 'UNKNOWN_ERROR'),
    );
  }

  testConnection(): Promise<ConnectionResult> {
    return this.enqueue(() => this.run());
  }

  /** One Gemini request that both detects and corrects errors in `text`. */
  correct(text: string): Promise<CorrectionResult> {
    return this.enqueue(() => this.runCorrection(text));
  }

  /** One Gemini request returning one rewrite per requested style. */
  rewrite(
    text: string,
    styleIds: readonly RewriteStyleId[],
  ): Promise<RewriteResult> {
    return this.enqueue(() => this.runRewrite(text, styleIds));
  }

  /** One Gemini request: detection, translation and any styles together. */
  translate(
    request: TranslateTextRequest,
  ): Promise<CandidatesResult<TranslationKey>> {
    return this.enqueue(() => this.runTranslate(request));
  }

  /** Guards that must not consume an attempt, then the reservation. */
  private async begin(needsConsent: boolean): Promise<Ready | FailureResult> {
    const settings = await loadSettings(this.deps.area);
    const { apiKey, modelId, keyRevision } = settings.gemini;
    if (!apiKey) return failure('NOT_CONFIGURED');
    if (needsConsent && !settings.correction.consent)
      return failure('CONSENT_REQUIRED');
    if (!isAllowedModelId(modelId)) return failure('MODEL_UNAVAILABLE');
    if (!this.isOnline()) return failure('NETWORK_ERROR');
    const reservation = await this.guard.reserve(
      settings.safety.dailyTestAttemptLimit,
    );
    if (!reservation.ok) return failure('LOCAL_DAILY_LIMIT');
    return {
      ok: true,
      apiKey,
      modelId,
      keyRevision,
      localDate: reservation.localDate,
    };
  }

  private async run(): Promise<ConnectionResult> {
    const start = await this.begin(false);
    if (!start.ok) return start;
    const { apiKey, modelId, keyRevision } = start;

    let result: GeminiResult;
    try {
      result = await testGemini({
        apiKey,
        modelId,
        fetchImpl: this.deps.fetchImpl,
        timeoutMs: this.deps.timeoutMs,
      });
    } catch {
      result = { ok: false, code: 'UNKNOWN_ERROR' };
    }
    const checkedAt = this.now().toISOString();
    // The attempt is already counted; failing to store the outcome must not
    // hide the real provider result from the user.
    await this.guard.complete(start.localDate, result).catch(() => undefined);
    await this.record(result, modelId, keyRevision, checkedAt).catch(
      () => undefined,
    );

    if (!result.ok) return failure(result.code, result.httpStatus);
    return {
      ok: true,
      provider: 'gemini',
      model: modelId,
      checkedAt,
      sample: result.sample,
      ...(result.usage ? { usage: result.usage } : {}),
    };
  }

  /**
   * The shared text path: consent and quota checks, exactly ONE Gemini call,
   * strict parsing, usage settled once. Edge whitespace never reaches the
   * model and is put back by the caller.
   */
  private async generate<T>(
    core: string,
    body: string,
    timeoutMs: number,
    parse: (raw: string) => T | null,
  ): Promise<{ ok: true; parsed: T } | FailureResult> {
    if (!core) return failure('UNKNOWN_ERROR');
    const start = await this.begin(true);
    if (!start.ok) return start;

    let reply: GeminiReply;
    try {
      reply = await postGemini(
        {
          apiKey: start.apiKey,
          modelId: start.modelId,
          fetchImpl: this.deps.fetchImpl,
          timeoutMs: this.deps.timeoutMs ?? timeoutMs,
        },
        body,
      );
    } catch {
      reply = { ok: false, code: 'UNKNOWN_ERROR' };
    }
    const candidate = reply.ok ? candidateText(reply.body) : null;
    // A truncated (MAX_TOKENS) or refused (SAFETY…) answer is never parsed.
    const parsed =
      candidate && (candidate.finishReason ?? 'STOP') === 'STOP'
        ? parse(candidate.text)
        : null;
    await this.guard
      .complete(start.localDate, {
        ok: parsed !== null,
        usage: candidate?.usage,
      })
      .catch(() => undefined);

    if (!reply.ok) return failure(reply.code, reply.httpStatus);
    if (parsed === null) return failure('INVALID_RESPONSE');
    return { ok: true, parsed };
  }

  /**
   * V5.6: masks protected shortcut text in the request copy only. Uses the
   * dictionary as it is now; the map lives for this one request.
   */
  private async protect(core: string): Promise<Shield> {
    const loaded = await loadShortcuts(this.deps.area).catch(() => null);
    return shield(
      core,
      loaded && !loaded.damaged ? loaded.store.shortcuts : [],
      this.deps.placeholderTag,
    );
  }

  /** Restores each candidate; ones that lost or altered a placeholder become missing. */
  private static restoreAll<K extends string>(
    parsed: { candidates: Candidate<K>[]; missing: K[] },
    guard: Shield,
  ): { candidates: Candidate<K>[]; missing: K[] } | null {
    const candidates: Candidate<K>[] = [];
    const missing = [...parsed.missing];
    for (const candidate of parsed.candidates) {
      const text = guard.restore(candidate.text);
      if (text === null) missing.push(candidate.styleId);
      else candidates.push({ ...candidate, text });
    }
    return candidates.length ? { candidates, missing } : null;
  }

  private async runCorrection(text: string): Promise<CorrectionResult> {
    const [lead, core, trail] = splitEdges(text);
    const guard = await this.protect(core);
    const result = await this.generate(
      core,
      correctionBody(guard.text, guard.note),
      CORRECTION_TIMEOUT_MS,
      (raw) => {
        const parsed = parseCorrection(raw, guard.text);
        if (!parsed?.hasErrors) return parsed;
        const restored = guard.restore(parsed.correctedText);
        return restored === null
          ? null
          : { ...parsed, correctedText: restored };
      },
    );
    if (!result.ok) return result;
    const { parsed } = result;
    return parsed.hasErrors
      ? {
          ok: true,
          hasErrors: true,
          correctedText: lead + parsed.correctedText + trail,
          suspicious: parsed.suspicious,
        }
      : { ok: true, hasErrors: false };
  }

  private async runRewrite(
    text: string,
    styleIds: readonly RewriteStyleId[],
  ): Promise<RewriteResult> {
    const [lead, core, trail] = splitEdges(text);
    const guard = await this.protect(core);
    const result = await this.generate(
      core,
      rewriteBody(guard.text, styleIds, guard.note),
      REWRITE_TIMEOUT_MS,
      (raw) => {
        const parsed = parseRewrite(raw, guard.text, styleIds);
        return parsed && ConnectionController.restoreAll(parsed, guard);
      },
    );
    if (!result.ok) return result;
    return {
      ok: true,
      candidates: result.parsed.candidates.map((candidate) => ({
        ...candidate,
        text: lead + candidate.text + trail,
      })),
      missing: result.parsed.missing,
    };
  }

  private async record(
    result: GeminiResult,
    modelId: string,
    keyRevision: number,
    checkedAt: string,
  ): Promise<void> {
    const { area } = this.deps;
    // The key may have been replaced or removed while the request was in
    // flight; never attach this outcome to a different key.
    const current = await loadSettings(area);
    if (!current.gemini.apiKey || current.gemini.keyRevision !== keyRevision)
      return;
    const previous = await loadConnection(area);
    await saveConnection(area, {
      ...previous,
      lastCheckAt: checkedAt,
      lastCheckOk: result.ok,
      lastCheckModelId: modelId,
      lastCheckKeyRevision: keyRevision,
      lastErrorCode: result.ok ? null : result.code,
      ...(result.ok
        ? { lastSuccessfulCheckAt: checkedAt, lastSuccessfulModelId: modelId }
        : {}),
    });
  }

  private async runTranslate({
    text,
    ...options
  }: TranslateTextRequest): Promise<CandidatesResult<TranslationKey>> {
    const [lead, core, trail] = splitEdges(text);
    const keys = translationKeys(options.styleIds);
    const guard = await this.protect(core);
    const result = await this.generate(
      core,
      translationBody(guard.text, options, guard.note),
      REWRITE_TIMEOUT_MS,
      (raw) => {
        const parsed = parseTranslation(raw, guard.text, keys);
        if (!parsed || parsed.sameLanguage) return parsed;
        const restored = ConnectionController.restoreAll(parsed, guard);
        return restored && { sameLanguage: false as const, ...restored };
      },
    );
    if (!result.ok) return result;
    const { parsed } = result;
    if (parsed.sameLanguage)
      return { ok: true, candidates: [], missing: [], sameLanguage: true };
    return {
      ok: true,
      candidates: parsed.candidates.map((candidate) => ({
        ...candidate,
        text: lead + candidate.text + trail,
      })),
      missing: parsed.missing,
    };
  }
}
