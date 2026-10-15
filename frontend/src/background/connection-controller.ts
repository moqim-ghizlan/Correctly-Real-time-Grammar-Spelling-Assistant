import type {
  ConnectionResult,
  CorrectionResult,
  FailureResult,
  KeyCheckResult,
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
import type { ProviderId } from '../shared/models';
import { shield, type Shield } from '../shared/protection';
import {
  CHECKS_KEY,
  loadProviders,
  migrateLegacyKey,
  parseChecks,
  resolveRoute,
  sameRoute,
  type RouteSlot,
  type RouteSnapshot,
  type TaskKind,
} from '../shared/providers';
import type { Candidate } from '../shared/rewrite';
import { loadShortcuts } from '../shared/shortcuts';
import { loadSettings, type StorageArea } from '../shared/storage';
import {
  CORRECTION_TIMEOUT_MS,
  correctionTask,
  parseCorrection,
  splitEdges,
} from './correction';
import { geminiAdapter, sanitizeSample, smokeTask } from './gemini-client';
import { openaiAdapter } from './openai-client';
import { REWRITE_TIMEOUT_MS, parseRewrite, rewriteTask } from './rewrite';
import { parseTranslation, translationTask } from './translate';
import {
  REQUEST_TIMEOUT_MS,
  type Generation,
  type ProviderAdapter,
  type TaskRequest,
} from './transport';
import { UsageGuard, type Outcome } from './usage-guard';

export const ADAPTERS: Record<ProviderId, ProviderAdapter> = {
  gemini: geminiAdapter,
  openai: openaiAdapter,
};

export interface ControllerDeps {
  area: StorageArea;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => Date;
  today?: () => string;
  isOnline?: () => boolean;
  /** Tests only: deterministic placeholder namespace. */
  placeholderTag?: () => string;
  /** Tests only: deterministic operation IDs. */
  operationId?: () => string;
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
  route: RouteSnapshot;
  key: string;
  operationId: string;
  localDate: string;
};

/** Daily-usage key: provider|profile|revision|model|task. No text, no key. */
export const routeKey = (route: RouteSnapshot, task: TaskKind | 'test') =>
  `${route.provider}|${route.credentialId}|${route.revision}|${route.modelId}|${task}`;

/**
 * Handles TEST_CONNECTION, TEST_KEY, CORRECT_TEXT, REWRITE_TEXT and
 * TRANSLATE_TEXT. Requests run one at a time; each generation is bound to
 * one frozen route (profile, key revision, model), reserved in the usage
 * ledger before the network is touched, sent once and never retried or
 * rerouted to another key, model or provider.
 */
export class ConnectionController {
  private readonly guard: UsageGuard;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly now: () => Date;
  private readonly isOnline: () => boolean;
  /** The one request in flight (requests are serialized). */
  private active: { route: RouteSnapshot; abort: AbortController } | null =
    null;
  private checks: Promise<unknown> = Promise.resolve();

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

  /** At worker start: settle requests a stopped worker left pending. Never replays. */
  reconcile(): Promise<void> {
    return this.guard.reconcile();
  }

  /**
   * Profiles changed: a request whose key was deleted or replaced is stopped
   * locally (it may already have reached the provider). Disabling a key only
   * affects later requests.
   */
  async onProvidersChanged(): Promise<void> {
    const active = this.active;
    if (!active) return;
    const { store, secrets } = await loadProviders(this.deps.area);
    const profile = store.profiles.find(
      (p) => p.id === active.route.credentialId,
    );
    const secret = secrets.secrets[active.route.credentialId];
    if (
      !profile ||
      profile.revision !== active.route.revision ||
      secret?.revision !== active.route.revision
    )
      active.abort.abort();
  }

  /** One tiny, possibly billed generation through the route saved for `slot`. */
  testConnection(slot: RouteSlot): Promise<ConnectionResult> {
    return this.enqueue(() => this.runTest(slot));
  }

  /** Free key check: lists models; never counted as a generation. */
  testKey(credentialId: string): Promise<KeyCheckResult> {
    return this.enqueue(() => this.runKeyCheck(credentialId));
  }

  /** One request that both detects and corrects errors in `text`. */
  correct(text: string): Promise<CorrectionResult> {
    return this.enqueue(() => this.runCorrection(text));
  }

  /** One request returning one rewrite per requested style. */
  rewrite(
    text: string,
    styleIds: readonly RewriteStyleId[],
  ): Promise<RewriteResult> {
    return this.enqueue(() => this.runRewrite(text, styleIds));
  }

  /** One request: detection, translation and any styles together. */
  translate(
    request: TranslateTextRequest,
  ): Promise<CandidatesResult<TranslationKey>> {
    return this.enqueue(() => this.runTranslate(request));
  }

  private async resolve(slot: RouteSlot) {
    const loaded = await loadProviders(this.deps.area);
    if (loaded.damaged)
      return { ok: false as const, code: 'STORAGE_ERROR' as const };
    return resolveRoute(loaded.store, loaded.secrets, slot);
  }

  /**
   * Guards that must not consume an attempt, the reservation, then a final
   * check that the route did not change meanwhile (nothing is sent then).
   */
  private async begin(
    slot: RouteSlot,
    task: TaskKind | 'test',
    needsConsent: boolean,
  ): Promise<Ready | FailureResult> {
    // A V5.1 key is moved to a profile first (local only, idempotent).
    await migrateLegacyKey(this.deps.area).catch(() => undefined);
    const settings = await loadSettings(this.deps.area);
    if (needsConsent && !settings.correction.consent)
      return failure('CONSENT_REQUIRED');
    const resolved = await this.resolve(slot);
    if (!resolved.ok) return failure(resolved.code);
    if (!this.isOnline()) return failure('NETWORK_ERROR');
    const operationId = (
      this.deps.operationId ?? (() => crypto.randomUUID())
    )();
    const reservation = await this.guard.reserve(
      settings.safety.dailyTestAttemptLimit,
      routeKey(resolved.route, task),
      operationId,
    );
    if (!reservation.ok) return failure('LOCAL_DAILY_LIMIT');
    const again = await this.resolve(slot).catch(() => null);
    if (!again?.ok || !sameRoute(again.route, resolved.route)) {
      await this.guard
        .release(reservation.localDate, operationId)
        .catch(() => undefined);
      return failure(again && !again.ok ? again.code : 'ROUTE_CHANGED');
    }
    return {
      ok: true,
      route: resolved.route,
      key: resolved.key,
      operationId,
      localDate: reservation.localDate,
    };
  }

  /** Exactly ONE call to the adapter of the frozen route. */
  private async dispatch(
    start: Ready,
    task: TaskRequest,
    timeoutMs: number,
  ): Promise<Generation> {
    const abort = new AbortController();
    this.active = { route: start.route, abort };
    try {
      return await ADAPTERS[start.route.provider].generate(
        {
          key: start.key,
          modelId: start.route.modelId,
          fetchImpl: this.deps.fetchImpl,
          timeoutMs: this.deps.timeoutMs ?? timeoutMs,
          signal: abort.signal,
        },
        task,
      );
    } catch {
      return { ok: false, code: 'UNKNOWN_ERROR', answered: false };
    } finally {
      this.active = null;
    }
  }

  private settle(start: Ready, outcome: Outcome): Promise<void> {
    return this.guard
      .complete(start.localDate, outcome, start.operationId)
      .catch(() => undefined);
  }

  private async runTest(slot: RouteSlot): Promise<ConnectionResult> {
    const start = await this.begin(slot, 'test', false);
    if (!start.ok) return start;
    const reply = await this.dispatch(start, smokeTask(), REQUEST_TIMEOUT_MS);
    const sample = reply.ok ? sanitizeSample(reply.text, start.key) : '';
    await this.settle(start, {
      state: sample
        ? 'completed'
        : reply.ok || reply.answered
          ? 'failed'
          : 'unknown',
      usage: reply.ok ? reply.usage : undefined,
    });
    if (!reply.ok) return failure(reply.code, reply.httpStatus);
    if (!sample) return failure('INVALID_RESPONSE');
    return {
      ok: true,
      provider: start.route.provider,
      model: start.route.modelId,
      checkedAt: this.now().toISOString(),
      sample,
      ...(reply.usage ? { usage: reply.usage } : {}),
    };
  }

  private async runKeyCheck(credentialId: string): Promise<KeyCheckResult> {
    await migrateLegacyKey(this.deps.area).catch(() => undefined);
    const { store, secrets } = await loadProviders(this.deps.area);
    const profile = store.profiles.find((p) => p.id === credentialId);
    const secret = secrets.secrets[credentialId];
    if (!profile || !secret || secret.revision !== profile.revision)
      return failure('ROUTE_BROKEN');
    if (!this.isOnline()) return failure('NETWORK_ERROR');
    let reply;
    try {
      reply = await ADAPTERS[profile.provider].listModels({
        key: secret.key,
        fetchImpl: this.deps.fetchImpl,
        timeoutMs: this.deps.timeoutMs,
      });
    } catch {
      reply = { ok: false as const, code: 'UNKNOWN_ERROR' as const };
    }
    await this.recordCheck(credentialId, profile.revision, reply).catch(
      () => undefined,
    );
    return reply.ok
      ? { ok: true, models: reply.models.length }
      : failure(reply.code, reply.httpStatus);
  }

  /** The worker is the only writer of key checks; writes are serialized. */
  private recordCheck(
    id: string,
    revision: number,
    reply: { ok: true; models: string[] } | { ok: false; code: ErrorCode },
  ): Promise<void> {
    const run = async () => {
      const { area } = this.deps;
      const checks = parseChecks((await area.get([CHECKS_KEY]))[CHECKS_KEY]);
      // Drop checks of deleted profiles and of replaced keys.
      const { store } = await loadProviders(area);
      const kept = Object.fromEntries(
        Object.entries(checks).filter(([key, check]) =>
          store.profiles.some(
            (p) => p.id === key && p.revision === check.revision,
          ),
        ),
      );
      if (!store.profiles.some((p) => p.id === id && p.revision === revision))
        return;
      kept[id] = {
        revision,
        checkedAt: this.now().toISOString(),
        ok: reply.ok,
        errorCode: reply.ok ? null : reply.code,
        // A failed check keeps the last known list (shown as not verified).
        models: reply.ok ? reply.models : (checks[id]?.models ?? []),
      };
      await area.set({ [CHECKS_KEY]: { schemaVersion: 1, profiles: kept } });
    };
    const next = this.checks.then(run, run);
    this.checks = next.catch(() => undefined);
    return next;
  }

  /**
   * The shared text path for every provider: consent, route and quota
   * checks, exactly ONE call, strict parsing, usage settled once. Edge
   * whitespace never reaches the model and is put back by the caller.
   */
  private async generate<T>(
    core: string,
    slot: TaskKind,
    task: TaskRequest,
    timeoutMs: number,
    parse: (raw: string) => T | null,
  ): Promise<{ ok: true; parsed: T } | FailureResult> {
    if (!core) return failure('UNKNOWN_ERROR');
    const start = await this.begin(slot, slot, true);
    if (!start.ok) return start;
    const reply = await this.dispatch(start, task, timeoutMs);
    const parsed = reply.ok ? parse(reply.text) : null;
    await this.settle(start, {
      state:
        parsed !== null
          ? 'completed'
          : reply.ok || reply.answered
            ? 'failed'
            : 'unknown',
      usage: reply.ok ? reply.usage : undefined,
    });
    if (!reply.ok) return failure(reply.code, reply.httpStatus);
    if (parsed === null) return failure('INVALID_RESPONSE');
    return { ok: true, parsed };
  }

  /**
   * V5.6: masks protected shortcut text in the request copy only, for every
   * provider. Uses the dictionary as it is now; the map lives for this one
   * request.
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
      'correction',
      correctionTask(guard.text, guard.note),
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
      'rewrite',
      rewriteTask(guard.text, styleIds, guard.note),
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

  private async runTranslate({
    text,
    ...options
  }: TranslateTextRequest): Promise<CandidatesResult<TranslationKey>> {
    const [lead, core, trail] = splitEdges(text);
    const keys = translationKeys(options.styleIds);
    const guard = await this.protect(core);
    const result = await this.generate(
      core,
      // Translate & rewrite has its own route (it may inherit the default).
      options.styleIds.length ? 'translateRewrite' : 'translation',
      translationTask(guard.text, options, guard.note),
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
