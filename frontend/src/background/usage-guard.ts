import type { TokenUsage } from '../shared/contracts';
import { localDate } from '../shared/local-date';
import {
  MAX_ROUTE_ENTRIES,
  emptyRouteUsage,
  type DailyUsageRecord,
  type RouteUsage,
} from '../shared/settings';
import { loadUsage, saveUsage, type StorageArea } from '../shared/storage';

export type Reservation =
  | { ok: true; localDate: string; usage: DailyUsageRecord }
  | { ok: false; usage: DailyUsageRecord };

/** completed = parsed answer; failed = provider answered with an error or an unusable body; unknown = sent, answer lost. */
export type Outcome = {
  state: 'completed' | 'failed' | 'unknown';
  usage?: TokenUsage;
};

const bump = (
  usage: DailyUsageRecord,
  key: string | undefined,
  change: (route: RouteUsage) => RouteUsage,
): Record<string, RouteUsage> => {
  if (!key) return usage.routes;
  const known = usage.routes[key];
  // Beyond the bound a new route is still counted in the totals.
  if (!known && Object.keys(usage.routes).length >= MAX_ROUTE_ENTRIES)
    return usage.routes;
  return { ...usage.routes, [key]: change(known ?? emptyRouteUsage()) };
};

const without = (pending: Record<string, string>, id: string) => {
  const rest = { ...pending };
  delete rest[id];
  return rest;
};

/**
 * The single authority over the daily usage ledger. Every read-modify-write
 * goes through one promise chain, so concurrent messages (double clicks,
 * several tabs, both providers) can never reserve more than the remaining
 * capacity: one limit for all providers and keys. This is a best-effort local
 * safety limit, not a billing control.
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

  /**
   * Counts one attempt for this route and persists it, marked pending, BEFORE
   * any network dispatch.
   */
  reserve(
    limit: number,
    routeKey?: string,
    operationId?: string,
  ): Promise<Reservation> {
    return this.serial(async () => {
      const date = this.today();
      const usage = await loadUsage(this.area, date);
      if (usage.testAttempts >= limit) return { ok: false, usage };
      const next: DailyUsageRecord = {
        ...usage,
        testAttempts: usage.testAttempts + 1,
        routes: bump(usage, routeKey, (r) => ({
          ...r,
          attempts: r.attempts + 1,
        })),
        pending:
          routeKey && operationId
            ? { ...usage.pending, [operationId]: routeKey }
            : usage.pending,
      };
      await saveUsage(this.area, next);
      return { ok: true, localDate: date, usage: next };
    });
  }

  /** Nothing was sent (the route changed after the reservation): give the slot back. */
  release(reservedDate: string, operationId: string): Promise<void> {
    return this.serial(async () => {
      if (this.today() !== reservedDate) return;
      const usage = await loadUsage(this.area, reservedDate);
      const key = usage.pending[operationId];
      await saveUsage(this.area, {
        ...usage,
        testAttempts: Math.max(0, usage.testAttempts - 1),
        routes: bump(usage, key, (r) => ({
          ...r,
          attempts: Math.max(0, r.attempts - 1),
        })),
        pending: without(usage.pending, operationId),
      });
    });
  }

  /** Records the outcome once, on the day the attempt was reserved. */
  complete(
    reservedDate: string,
    outcome: Outcome,
    operationId?: string,
  ): Promise<void> {
    return this.serial(async () => {
      // If the local day rolled over mid-request, the old record is gone and
      // the new day's counters must not be charged with this outcome.
      if (this.today() !== reservedDate) return;
      const usage = await loadUsage(this.area, reservedDate);
      // Already reconciled as interrupted: never count it twice.
      if (operationId && !(operationId in usage.pending)) return;
      const key = operationId ? usage.pending[operationId] : undefined;
      const input = outcome.usage?.inputTokens ?? 0;
      const output = outcome.usage?.outputTokens ?? 0;
      const one = (state: Outcome['state']) =>
        outcome.state === state ? 1 : 0;
      await saveUsage(this.area, {
        ...usage,
        completed: usage.completed + one('completed'),
        failed: usage.failed + one('failed'),
        unknown: usage.unknown + one('unknown'),
        inputTokensObserved: usage.inputTokensObserved + input,
        outputTokensObserved: usage.outputTokensObserved + output,
        routes: bump(usage, key, (r) => ({
          ...r,
          completed: r.completed + one('completed'),
          failed: r.failed + one('failed'),
          unknown: r.unknown + one('unknown'),
          inputTokens: r.inputTokens + input,
          outputTokens: r.outputTokens + output,
        })),
        pending: operationId
          ? without(usage.pending, operationId)
          : usage.pending,
      });
    });
  }

  /**
   * At worker start: requests left pending by a stopped worker may have been
   * sent. They are never replayed; they are settled as billing unknown.
   */
  reconcile(): Promise<void> {
    return this.serial(async () => {
      const usage = await loadUsage(this.area, this.today());
      const ids = Object.keys(usage.pending);
      if (!ids.length) return;
      let routes = usage.routes;
      for (const id of ids)
        routes = bump({ ...usage, routes }, usage.pending[id], (r) => ({
          ...r,
          unknown: r.unknown + 1,
        }));
      await saveUsage(this.area, {
        ...usage,
        unknown: usage.unknown + ids.length,
        routes,
        pending: {},
      });
    });
  }
}
