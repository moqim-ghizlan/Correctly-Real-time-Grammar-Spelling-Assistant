// V5.9 Statistics: pure calculations over the V5.8 request journal (one
// record per request, counted when it was sent) and the Apply/Undo events.
// Every figure is computed from unique operations, never by adding the
// overlapping limit counters. Unknown is never shown as zero.
import { PROVIDERS, type ProviderId } from './models';
import { costOf, priceAt, usdString, type PriceEntry } from './prices';
import {
  QUOTA_TASKS,
  TASK_LABELS,
  civilDate,
  startOfDay,
  windowsAt,
  type QuotaTask,
} from './quota';
import type { EditEvent, Operation } from './quota-store';

export const MAX_RANGE_DAYS = 366;
export type Preset = 'today' | 'week' | 'month' | 'custom';

export interface StatsRange {
  preset: Preset;
  timezone: string;
  /** Inclusive local dates (YYYY-MM-DD). */
  from: string;
  to: string;
  /** Half-open instant interval [start, end). */
  start: number;
  end: number;
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
type Civil = { year: number; month: number; day: number };

function parseDate(text: string): Civil | null {
  const match = DATE.exec(text);
  if (!match) return null;
  const [year, month, day] = [match[1], match[2], match[3]].map(Number) as [
    number,
    number,
    number,
  ];
  const check = new Date(Date.UTC(year, month - 1, day));
  return check.getUTCFullYear() === year &&
    check.getUTCMonth() === month - 1 &&
    check.getUTCDate() === day
    ? { year, month, day }
    : null;
}

const label = ({ year, month, day }: Civil) =>
  `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

const nextDay = ({ year, month, day }: Civil): Civil => {
  const date = new Date(Date.UTC(year, month - 1, day + 1));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
};

const dayIndex = ({ year, month, day }: Civil) =>
  Date.UTC(year, month - 1, day) / 86_400_000;

/**
 * Today / this ISO week / this month (the V5.8 windows) or a custom
 * inclusive range of local dates, at most 366 days. Returns an error text
 * instead of guessing.
 */
export function resolveRange(
  preset: Preset,
  now: number,
  timezone: string,
  from = '',
  to = '',
): StatsRange | { error: RangeError; max?: number } {
  if (preset !== 'custom') {
    const window = windowsAt(now, timezone)[
      preset === 'today' ? 'daily' : preset === 'week' ? 'weekly' : 'monthly'
    ];
    const last = civilDate(window.end - 1, timezone);
    return {
      preset,
      timezone,
      from: window.label,
      to: label(last),
      start: window.start,
      end: window.end,
    };
  }
  const first = parseDate(from);
  const lastDay = parseDate(to);
  if (!first || !lastDay) return { error: 'missing' };
  const days = dayIndex(lastDay) - dayIndex(first) + 1;
  if (days < 1) return { error: 'order' };
  if (days > MAX_RANGE_DAYS) return { error: 'tooLong', max: MAX_RANGE_DAYS };
  return {
    preset,
    timezone,
    from: label(first),
    to: label(lastDay),
    start: startOfDay(first, timezone),
    // The day after the end date, at its real local midnight (DST-safe).
    end: startOfDay(nextDay(lastDay), timezone),
  };
}

// ---------------------------------------------------------------- filters

export interface StatsFilter {
  task: QuotaTask | 'all';
  provider: ProviderId | 'all';
  /** Exact model ID, or 'all'. */
  modelId: string;
  /** Profile ID, or 'all'. */
  credentialId: string;
}

export const NO_FILTER: StatsFilter = {
  task: 'all',
  provider: 'all',
  modelId: 'all',
  credentialId: 'all',
};

const matches = (
  item: Pick<Operation, 'task' | 'provider' | 'modelId' | 'credentialId'>,
  filter: StatsFilter,
) =>
  (filter.task === 'all' || item.task === filter.task) &&
  (filter.provider === 'all' || item.provider === filter.provider) &&
  (filter.modelId === 'all' || item.modelId === filter.modelId) &&
  (filter.credentialId === 'all' || item.credentialId === filter.credentialId);

// ----------------------------------------------------------------- totals

export type CostState = 'none' | 'complete' | 'partial' | 'unknown';

export interface Totals {
  /** Requests sent or possibly sent (= counted by the usage limits). */
  attempts: number;
  /** Validated results (a correction with no error found included). */
  successful: number;
  failed: number;
  /** Sent, answer lost (timeout, network, stopped worker): billing unknown. */
  unknown: number;
  /** Sent, answer not back yet. */
  pending: number;
  inputTokens: number;
  /** Requests whose input tokens were reported. */
  inputReported: number;
  outputTokens: number;
  outputReported: number;
  /** Estimate of the priced requests only, in pico-dollars. */
  costPico: bigint;
  priced: number;
  /** Sent without input and output token counts. */
  missingTokens: number;
  /** Tokens known, but no price reference for that model and date. */
  missingPrice: number;
  costState: CostState;
}

const emptyTotals = (): Totals => ({
  attempts: 0,
  successful: 0,
  failed: 0,
  unknown: 0,
  pending: 0,
  inputTokens: 0,
  inputReported: 0,
  outputTokens: 0,
  outputReported: 0,
  costPico: 0n,
  priced: 0,
  missingTokens: 0,
  missingPrice: 0,
  costState: 'none',
});

function add(
  totals: Totals,
  operation: Operation,
  prices: readonly PriceEntry[],
) {
  totals.attempts += 1;
  if (operation.state === 'completed') totals.successful += 1;
  else if (operation.state === 'failed-after-send') totals.failed += 1;
  else if (operation.state === 'unknown') totals.unknown += 1;
  else totals.pending += 1;
  const input = operation.inputTokens ?? null;
  const output = operation.outputTokens ?? null;
  if (input !== null) {
    totals.inputTokens += input;
    totals.inputReported += 1;
  }
  if (output !== null) {
    totals.outputTokens += output;
    totals.outputReported += 1;
  }
  const cost = costOf(
    {
      inputTokens: input,
      outputTokens: output,
      cachedInputTokens: operation.cachedInputTokens ?? null,
    },
    priceAt(
      prices,
      operation.provider,
      operation.modelId,
      operation.dispatchAt ?? operation.createdAt,
    ),
  );
  if (cost.state === 'priced') {
    totals.costPico += cost.pico;
    totals.priced += 1;
  } else if (cost.state === 'no-tokens') totals.missingTokens += 1;
  else totals.missingPrice += 1;
}

const finish = (totals: Totals): Totals => ({
  ...totals,
  costState:
    totals.attempts === 0
      ? 'none'
      : totals.priced === totals.attempts
        ? 'complete'
        : totals.priced === 0
          ? 'unknown'
          : 'partial',
});

export function totalsOf(
  operations: readonly Operation[],
  prices: readonly PriceEntry[],
): Totals {
  const totals = emptyTotals();
  for (const operation of operations) add(totals, operation, prices);
  return finish(totals);
}

// ------------------------------------------------------------- summaries

export interface Summary {
  range: StatsRange;
  filter: StatsFilter;
  totals: Totals;
  /** Successful results per action. */
  byTaskSuccess: Record<QuotaTask, number>;
  applied: number;
  undone: number;
  appliedByTask: Record<QuotaTask, number>;
  days: DayRow[];
  groups: Record<GroupKey, GroupRow[]>;
  /** Observed values for the filter lists. */
  seen: {
    models: { provider: ProviderId; modelId: string }[];
    credentials: string[];
  };
}

export type GroupKey = 'task' | 'provider' | 'model' | 'credential';
export interface GroupRow {
  key: string;
  provider: ProviderId | null;
  totals: Totals;
}
export interface DayRow {
  date: string;
  attempts: number;
  successful: number;
}

const zeroTasks = () =>
  Object.fromEntries(QUOTA_TASKS.map((task) => [task, 0])) as Record<
    QuotaTask,
    number
  >;

const groupKey = (operation: Operation, key: GroupKey) =>
  key === 'task'
    ? operation.task
    : key === 'provider'
      ? operation.provider
      : key === 'model'
        ? `${operation.provider}/${operation.modelId}`
        : operation.credentialId;

/** One pass over the unique operations of the range; groups are disjoint. */
export function summarize(
  range: StatsRange,
  operations: readonly Operation[],
  events: readonly EditEvent[],
  prices: readonly PriceEntry[],
  filter: StatsFilter = NO_FILTER,
): Summary {
  const unique = new Map<string, Operation>();
  for (const operation of operations)
    if (
      operation.dispatchAt !== null &&
      operation.dispatchAt >= range.start &&
      operation.dispatchAt < range.end
    )
      unique.set(operation.id, operation);
  const all = [...unique.values()];
  const seenModels = new Map<
    string,
    { provider: ProviderId; modelId: string }
  >();
  const seenCredentials = new Set<string>();
  for (const operation of all) {
    seenModels.set(`${operation.provider}/${operation.modelId}`, {
      provider: operation.provider,
      modelId: operation.modelId,
    });
    seenCredentials.add(operation.credentialId);
  }
  const chosen = all.filter((operation) => matches(operation, filter));
  const byTaskSuccess = zeroTasks();
  for (const operation of chosen)
    if (operation.state === 'completed') byTaskSuccess[operation.task] += 1;
  const appliedByTask = zeroTasks();
  let applied = 0,
    undone = 0;
  const seenEvents = new Set<string>();
  for (const event of events) {
    if (
      seenEvents.has(event.id) ||
      event.at < range.start ||
      event.at >= range.end ||
      !matches(event, filter)
    )
      continue;
    seenEvents.add(event.id);
    if (event.action === 'applied') {
      applied += 1;
      appliedByTask[event.task] += 1;
    } else undone += 1;
  }
  const groups = {} as Record<GroupKey, GroupRow[]>;
  for (const key of ['task', 'provider', 'model', 'credential'] as const) {
    const buckets = new Map<string, Operation[]>();
    for (const operation of chosen) {
      const id = groupKey(operation, key);
      const bucket = buckets.get(id);
      if (bucket) bucket.push(operation);
      else buckets.set(id, [operation]);
    }
    groups[key] = [...buckets.entries()]
      .map(([id, items]) => ({
        key: id,
        provider: key === 'task' ? null : (items[0]?.provider ?? null),
        totals: totalsOf(items, prices),
      }))
      .sort(
        (a, b) =>
          b.totals.attempts - a.totals.attempts || a.key.localeCompare(b.key),
      );
  }
  return {
    range,
    filter,
    totals: totalsOf(chosen, prices),
    byTaskSuccess,
    applied,
    undone,
    appliedByTask,
    days: daySeries(range, chosen),
    groups,
    seen: {
      models: [...seenModels.values()].sort((a, b) =>
        `${a.provider}/${a.modelId}`.localeCompare(
          `${b.provider}/${b.modelId}`,
        ),
      ),
      credentials: [...seenCredentials].sort(),
    },
  };
}

/** Requests per local day, every day of the range (zero days included). */
export function daySeries(
  range: StatsRange,
  operations: readonly Operation[],
): DayRow[] {
  const rows: DayRow[] = [];
  // Local midnights of every day (DST-exact), then one binary search per
  // request instead of formatting each date.
  const starts: number[] = [];
  let day = parseDate(range.from);
  const last = parseDate(range.to);
  while (day && last && dayIndex(day) <= dayIndex(last)) {
    rows.push({ date: label(day), attempts: 0, successful: 0 });
    starts.push(startOfDay(day, range.timezone));
    day = nextDay(day);
  }
  for (const operation of operations) {
    const at = operation.dispatchAt;
    if (at === null || at < range.start || at >= range.end) continue;
    let low = 0,
      high = starts.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (starts[middle]! <= at) low = middle;
      else high = middle - 1;
    }
    const row = rows[low];
    if (!row) continue;
    row.attempts += 1;
    if (operation.state === 'completed') row.successful += 1;
  }
  return rows;
}

// ----------------------------------------------------------------- labels

export const groupLabel = (
  key: GroupKey,
  row: GroupRow,
  credentialLabel: (id: string) => string,
): string => {
  if (key === 'task') return TASK_LABELS[row.key as QuotaTask] ?? row.key;
  if (key === 'provider')
    return row.provider ? PROVIDERS[row.provider].label : row.key;
  if (key === 'model') return row.key.slice(row.key.indexOf('/') + 1);
  return credentialLabel(row.key);
};

// ----------------------------------------------------------------- export

/** Cells that a spreadsheet could run as a formula are made plain text. */
export function csvCell(value: string | number): string {
  let text = String(value).replace(/\r\n?/g, '\n');
  if (/^[\s]*[=+\-@\t\r|%]/.test(text) && typeof value === 'string')
    text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

const costCell = (totals: Totals) =>
  totals.priced ? usdString(totals.costPico) : '';

/** In the JSON export (data, English); the page shows its own wording. */
export const COST_NOTE =
  'Local estimate from provider-reported tokens and the price references shown in Correctly; not an invoice.';

/** 5.13: why a custom range is refused (worded by the settings page). */
export type RangeError = 'missing' | 'order' | 'tooLong';

export function toCsv(
  summary: Summary,
  credentialLabel: (id: string) => string,
): string {
  const lines: string[][] = [
    [
      'group',
      'name',
      'provider',
      'requests',
      'successful',
      'failed',
      'unknown',
      'pending',
      'input_tokens_reported',
      'requests_with_input_tokens',
      'output_tokens_reported',
      'requests_with_output_tokens',
      'estimated_usd_priced_requests',
      'priced_requests',
      'cost_coverage',
    ],
  ];
  const row = (group: string, name: string, provider: string, t: Totals) =>
    lines.push([
      group,
      name,
      provider,
      ...[
        t.attempts,
        t.successful,
        t.failed,
        t.unknown,
        t.pending,
        t.inputTokens,
        t.inputReported,
        t.outputTokens,
        t.outputReported,
      ].map(String),
      costCell(t),
      String(t.priced),
      t.costState,
    ]);
  row('total', 'All requests', '', summary.totals);
  for (const key of ['task', 'provider', 'model', 'credential'] as const)
    for (const group of summary.groups[key])
      row(
        key,
        groupLabel(key, group, credentialLabel),
        group.provider ?? '',
        group.totals,
      );
  for (const day of summary.days)
    lines.push([
      'day',
      day.date,
      '',
      String(day.attempts),
      String(day.successful),
      ...Array<string>(10).fill(''),
    ]);
  return (
    lines.map((cells) => cells.map(csvCell).join(',')).join('\r\n') + '\r\n'
  );
}

const totalsJson = (t: Totals) => ({
  requests: t.attempts,
  successful: t.successful,
  failed: t.failed,
  unknown: t.unknown,
  pending: t.pending,
  inputTokensReported: t.inputTokens,
  requestsWithInputTokens: t.inputReported,
  outputTokensReported: t.outputTokens,
  requestsWithOutputTokens: t.outputReported,
  estimatedUsd: t.priced ? usdString(t.costPico) : null,
  pricedRequests: t.priced,
  requestsWithoutTokens: t.missingTokens,
  requestsWithoutPrice: t.missingPrice,
  costCoverage: t.costState,
});

export function toJson(
  summary: Summary,
  generatedAt: number,
  credentialLabel: (id: string) => string,
  coverageNote: string,
): string {
  const groups = Object.fromEntries(
    (['task', 'provider', 'model', 'credential'] as const).map((key) => [
      key,
      summary.groups[key].map((group) => ({
        name: groupLabel(key, group, credentialLabel),
        ...(group.provider ? { provider: group.provider } : {}),
        ...totalsJson(group.totals),
      })),
    ]),
  );
  return (
    JSON.stringify(
      {
        schemaVersion: 1,
        exportType: 'correctly-statistics-aggregates',
        generatedAt: new Date(generatedAt).toISOString(),
        timezone: summary.range.timezone,
        range: { startDate: summary.range.from, endDate: summary.range.to },
        filter: summary.filter,
        currency: 'USD',
        costKind: 'estimated-not-invoice',
        costNote: COST_NOTE,
        coverage: coverageNote,
        totals: {
          ...totalsJson(summary.totals),
          aiEditsApplied: summary.applied,
          undosRecordedByCorrectly: summary.undone,
        },
        groups,
        days: summary.days,
      },
      null,
      2,
    ) + '\n'
  );
}
