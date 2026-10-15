import type { ConnectionResult } from '../shared/contracts';
import {
  CorrectlyError,
  errorMessage,
  isRetryable,
  type ErrorCode,
} from '../shared/errors';
import { isAllowedModelId } from '../shared/models';
import {
  loadConnection,
  loadSettings,
  saveConnection,
  type StorageArea,
} from '../shared/storage';
import { testGemini, type GeminiResult } from './gemini-client';
import { UsageGuard } from './usage-guard';

export interface ControllerDeps {
  area: StorageArea;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => Date;
  today?: () => string;
  isOnline?: () => boolean;
}

const failure = (code: ErrorCode, httpStatus?: number): ConnectionResult => ({
  ok: false,
  code,
  message: errorMessage(code),
  retryable: isRetryable(code),
  ...(httpStatus === undefined ? {} : { httpStatus }),
});

/**
 * Handles TEST_CONNECTION. Tests run one at a time; each one is reserved in
 * the usage ledger before the network is touched and is never retried.
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

  testConnection(): Promise<ConnectionResult> {
    const run = this.queue.then(
      () => this.run(),
      () => this.run(),
    );
    this.queue = run.catch(() => undefined);
    return run.catch((error: unknown) =>
      failure(error instanceof CorrectlyError ? error.code : 'UNKNOWN_ERROR'),
    );
  }

  private async run(): Promise<ConnectionResult> {
    const { area } = this.deps;
    const settings = await loadSettings(area);
    const { apiKey, modelId, keyRevision } = settings.gemini;
    // Guards that must not consume an attempt.
    if (!apiKey) return failure('NOT_CONFIGURED');
    if (!isAllowedModelId(modelId)) return failure('MODEL_UNAVAILABLE');
    if (!this.isOnline()) return failure('NETWORK_ERROR');

    const reservation = await this.guard.reserve(
      settings.safety.dailyTestAttemptLimit,
    );
    if (!reservation.ok) return failure('LOCAL_DAILY_LIMIT');

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
    await this.guard
      .complete(reservation.localDate, result)
      .catch(() => undefined);
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
}
