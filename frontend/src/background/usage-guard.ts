import type { TokenUsage } from '../shared/contracts';
import { localDate } from '../shared/local-date';
import type { DailyUsageRecord } from '../shared/settings';
import { loadUsage, saveUsage, type StorageArea } from '../shared/storage';

export type Reservation =
  | { ok: true; localDate: string; usage: DailyUsageRecord }
  | { ok: false; usage: DailyUsageRecord };

/**
 * The single authority over the daily usage ledger. Every read-modify-write
 * goes through one promise chain, so concurrent messages (double clicks,
 * several options tabs) can never reserve more than the remaining capacity.
 * This is a best-effort local safety limit, not a billing control.
 */
export class UsageGuard {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly area: StorageArea,
    private readonly today: () => string = () => localDate(),
  ) {}

  private serial<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** Counts one attempt and persists it BEFORE any network dispatch. */
  reserve(limit: number): Promise<Reservation> {
    return this.serial(async () => {
      const date = this.today();
      const usage = await loadUsage(this.area, date);
      if (usage.testAttempts >= limit) return { ok: false, usage };
      const next = { ...usage, testAttempts: usage.testAttempts + 1 };
      await saveUsage(this.area, next);
      return { ok: true, localDate: date, usage: next };
    });
  }

  /** Records the outcome on the day the attempt was reserved. */
  complete(
    reservedDate: string,
    outcome: { ok: boolean; usage?: TokenUsage },
  ): Promise<void> {
    return this.serial(async () => {
      // If the local day rolled over mid-request, the old record is gone and
      // the new day's counters must not be charged with this outcome.
      if (this.today() !== reservedDate) return;
      const usage = await loadUsage(this.area, reservedDate);
      await saveUsage(this.area, {
        ...usage,
        completed: usage.completed + (outcome.ok ? 1 : 0),
        failed: usage.failed + (outcome.ok ? 0 : 1),
        inputTokensObserved:
          usage.inputTokensObserved + (outcome.usage?.inputTokens ?? 0),
        outputTokensObserved:
          usage.outputTokensObserved + (outcome.usage?.outputTokens ?? 0),
      });
    });
  }
}
