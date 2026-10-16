import {
  MODEL_CATALOG,
  PROVIDERS,
  PROVIDER_IDS,
  isProviderId,
  type ProviderId,
} from '../shared/models';
import {
  OFFICIAL_PRICES,
  formatUsd,
  parseRate,
  type PriceEntry,
} from '../shared/prices';
import { loadProfiles, type ProviderProfile } from '../shared/providers';
import {
  QUOTA_TASKS,
  detectTimeZone,
  isTimeZone,
  startOfDay,
} from '../shared/quota';
import {
  OPERATION_RETENTION_MS,
  legacySeed,
  type History,
  type QuotaStore,
} from '../shared/quota-store';
import {
  NO_FILTER,
  groupLabel,
  resolveRange,
  summarize,
  toCsv,
  toJson,
  type Preset,
  type StatsFilter,
  type StatsRange,
  type Summary,
  type Totals,
} from '../shared/stats';
import type { StorageArea } from '../shared/storage';
import { COMMON, type CommonMessages } from '../shared/i18n';
import type { Locale } from '../shared/locale';
import { OPTIONS, type OptionsMessages } from './messages';
import type { Tone } from './settings-ui';

// V5.9 "Statistics": read-only views of the local request journal. Opening,
// filtering, refreshing or exporting never sends anything to a provider and
// never changes a usage limit.

export interface StatsDeps {
  area: StorageArea;
  quota: QuotaStore;
  confirm: (question: string) => boolean;
  download: (filename: string, text: string, type: string) => void;
  now?: () => number;
  newId?: () => string;
  /** 5.13: language of this page (French when absent). */
  locale?: Locale;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class StatsSection {
  private preset: Preset = 'today';
  private filter: StatsFilter = { ...NO_FILTER };
  private history: History | null = null;
  private summary: Summary | null = null;
  private range: StatsRange | null = null;
  private profiles: ProviderProfile[] = [];
  private readonly now: () => number;

  private readonly m: OptionsMessages;
  private readonly c: CommonMessages;

  constructor(
    private readonly doc: Document,
    private readonly deps: StatsDeps,
  ) {
    this.now = deps.now ?? (() => Date.now());
    this.m = OPTIONS[deps.locale ?? 'fr'];
    this.c = COMMON[deps.locale ?? 'fr'];
  }

  private get TASK_LABELS() {
    return this.c.task;
  }

  private el<T extends HTMLElement>(id: string): T {
    const node = this.doc.getElementById(id);
    if (!node) throw new Error('Missing element #' + id);
    return node as T;
  }

  private message(id: string, text: string, tone: Tone = 'neutral') {
    const node = this.el(id);
    node.textContent = text;
    node.dataset.tone = tone;
  }

  private setState(label: string, tone: Tone) {
    const state = this.el('stats-state');
    state.replaceChildren(
      Object.assign(this.doc.createElement('span'), { className: 'dot' }),
      label,
    );
    state.dataset.tone = tone;
  }

  async init(): Promise<void> {
    this.bind();
    await this.refresh();
  }

  private get timezone(): string {
    return this.history?.timezone ?? detectTimeZone() ?? 'UTC';
  }

  private bind() {
    for (const button of this.doc.querySelectorAll<HTMLButtonElement>(
      '[data-stats-preset]',
    ))
      button.addEventListener('click', () => {
        this.preset = button.dataset.statsPreset as Preset;
        this.el('stats-custom').hidden = this.preset !== 'custom';
        if (this.preset !== 'custom') void this.refresh();
        else this.el<HTMLInputElement>('stats-from').focus();
      });
    this.el('stats-custom').addEventListener('submit', (event) => {
      event.preventDefault();
      void this.refresh();
    });
    for (const [id, field] of [
      ['stats-task', 'task'],
      ['stats-provider', 'provider'],
      ['stats-model', 'modelId'],
      ['stats-key', 'credentialId'],
    ] as const)
      this.el<HTMLSelectElement>(id).addEventListener('change', (event) => {
        this.filter = {
          ...this.filter,
          [field]: (event.target as HTMLSelectElement).value,
        };
        this.recompute();
      });
    this.el('stats-refresh').addEventListener('click', () => {
      void this.refresh();
    });
    this.el('stats-csv').addEventListener('click', () => this.export('csv'));
    this.el('stats-json').addEventListener('click', () => this.export('json'));
    this.el('price-form').addEventListener('submit', (event) => {
      event.preventDefault();
      void this.addPrice();
    });
    this.el('stats-delete-form').addEventListener('submit', (event) => {
      event.preventDefault();
      void this.deleteHistory();
    });
  }

  /** Re-reads the local journal (another tab, the worker, a new day). */
  async refresh(): Promise<void> {
    this.setState(this.m.loading, 'info');
    try {
      const loaded = await loadProfiles(this.deps.area);
      if (!loaded.damaged) this.profiles = loaded.store.profiles;
    } catch {
      // Keep the last known labels.
    }
    try {
      await this.deps.quota
        .ensureReady(() => legacySeed(this.deps.area), this.now())
        .catch(() => undefined);
      // Days, weeks and months follow the usage limits' time zone.
      const zone =
        (await this.deps.quota.timezone()) ?? detectTimeZone() ?? 'UTC';
      const range = this.resolve(zone);
      if ('error' in range) {
        this.message(
          'stats-message',
          this.m.rangeError(range.error, range.max),
          'error',
        );
        this.setState(this.m.chooseDates, 'error');
        return;
      }
      // Clears only a previous error (keeps e.g. an export confirmation).
      if (this.el('stats-message').dataset.tone === 'error')
        this.message('stats-message', '');
      this.range = range;
      this.history = await this.deps.quota.history(
        range.start,
        range.end,
        this.now(),
      );
    } catch {
      this.history = null;
      this.summary = null;
      this.setState(this.m.state.unavailable, 'error');
      this.message('stats-message', this.m.statsUnavailable, 'error');
      this.render();
      return;
    }
    this.recompute();
  }

  private resolve(zone: string) {
    return resolveRange(
      this.preset,
      this.now(),
      isTimeZone(zone) ? zone : 'UTC',
      this.el<HTMLInputElement>('stats-from').value,
      this.el<HTMLInputElement>('stats-to').value,
    );
  }

  private get prices(): PriceEntry[] {
    return [...OFFICIAL_PRICES, ...(this.history?.prices ?? [])];
  }

  private recompute() {
    if (!this.history || !this.range) return this.render();
    this.summary = summarize(
      this.range,
      this.history.operations,
      this.history.events,
      this.prices,
      this.filter,
    );
    this.setState(
      this.summary.totals.attempts ? this.m.statsReady : this.m.statsNone,
      this.summary.totals.attempts ? 'ok' : 'neutral',
    );
    this.render();
  }

  private credentialLabel = (id: string): string => {
    const profile = this.profiles.find((p) => p.id === id);
    return profile ? profile.label : this.m.deletedKeyShort(id.slice(-4));
  };

  // ------------------------------------------------------------ rendering

  private date(ms: number): string {
    return new Intl.DateTimeFormat(this.c.locale === 'fr' ? 'fr-FR' : 'en-GB', {
      timeZone: this.timezone,
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(ms));
  }

  render(): void {
    for (const button of this.doc.querySelectorAll<HTMLButtonElement>(
      '[data-stats-preset]',
    ))
      button.setAttribute(
        'aria-pressed',
        String(button.dataset.statsPreset === this.preset),
      );
    const summary = this.summary;
    const ready = !!summary && !!this.history;
    for (const id of ['stats-csv', 'stats-json'])
      this.el<HTMLButtonElement>(id).disabled = !ready;
    this.el('stats-range').textContent = this.range
      ? this.m.rangeLine(this.range.from, this.range.to, this.range.timezone)
      : '';
    this.renderFilters();
    this.renderCoverage();
    this.renderCards();
    this.renderChart();
    this.renderTables();
    this.renderPrices();
  }

  private renderFilters() {
    const summary = this.summary;
    const fill = (id: string, options: [string, string][], value: string) => {
      const select = this.el<HTMLSelectElement>(id);
      select.replaceChildren(
        ...options.map(([v, text]) =>
          Object.assign(this.doc.createElement('option'), {
            value: v,
            textContent: text,
          }),
        ),
      );
      select.value = options.some(([v]) => v === value) ? value : 'all';
      select.disabled = !summary;
    };
    fill(
      'stats-task',
      [
        ['all', this.m.allActions],
        ...QUOTA_TASKS.map((task): [string, string] => [
          task,
          this.TASK_LABELS[task],
        ]),
      ],
      this.filter.task,
    );
    fill(
      'stats-provider',
      [
        ['all', this.m.allProviders],
        ...PROVIDER_IDS.map((id): [string, string] => [
          id,
          PROVIDERS[id].label,
        ]),
      ],
      this.filter.provider,
    );
    fill(
      'stats-model',
      [
        ['all', this.m.allModels],
        ...(summary?.seen.models ?? []).map(({ modelId }): [string, string] => [
          modelId,
          modelId,
        ]),
      ],
      this.filter.modelId,
    );
    fill(
      'stats-key',
      [
        ['all', this.m.allKeys],
        ...(summary?.seen.credentials ?? []).map((id): [string, string] => [
          id,
          this.credentialLabel(id),
        ]),
      ],
      this.filter.credentialId,
    );
  }

  /** What these numbers cannot show (never hidden behind a zero). */
  private coverageNotes(): string[] {
    const history = this.history;
    const range = this.range;
    if (!history || !range) return [];
    const notes: string[] = [];
    const since = history.migration?.at;
    if (since !== undefined && since > range.start)
      notes.push(this.m.coverageStart(this.date(since)));
    if (history.deletedBefore !== null && history.deletedBefore > range.start)
      notes.push(this.m.coverageDeleted(this.date(history.deletedBefore)));
    if (range.start < this.now() - OPERATION_RETENTION_MS)
      notes.push(this.m.coverageRetention);
    if (history.clockBack) notes.push(this.m.coverageClock);
    return notes;
  }

  private renderCoverage() {
    const notes = this.coverageNotes();
    const node = this.el('stats-coverage');
    node.hidden = notes.length === 0;
    node.textContent = notes.join(' ');
  }

  private card(id: string, value: string, detail: string) {
    this.el(`${id}-value`).textContent = value;
    this.el(`${id}-detail`).textContent = detail;
  }

  private costText(totals: Totals): [string, string] {
    switch (totals.costState) {
      case 'none':
        return ['$0.00', this.m.costNone];
      case 'complete':
        return this.m.costComplete(
          formatUsd(totals.costPico),
          this.c.number(totals.attempts),
        );
      case 'partial':
        return this.m.costPartial(
          formatUsd(totals.costPico),
          this.c.number(totals.priced),
          this.c.number(totals.attempts),
          this.missing(totals),
        );
      case 'unknown':
        return this.m.costUnknown(this.missing(totals));
    }
  }

  private missing(totals: Totals) {
    return [
      totals.missingTokens
        ? this.m.missingTokens(this.c.number(totals.missingTokens))
        : '',
      totals.missingPrice
        ? this.m.missingPrice(this.c.number(totals.missingPrice))
        : '',
    ]
      .filter(Boolean)
      .join(', ');
  }

  private renderCards() {
    const summary = this.summary;
    const history = this.history;
    if (!summary || !history) {
      for (const id of [
        'stats-requests',
        'stats-success',
        'stats-applied',
        'stats-tokens',
        'stats-cost',
      ])
        this.card(id, '—', this.m.notAvailable);
      return;
    }
    const t = summary.totals;
    this.card(
      'stats-requests',
      this.c.number(t.attempts),
      this.m.requestsDetail(
        history.inProgress ? this.c.number(history.inProgress) : '',
      ),
    );
    const tasks = QUOTA_TASKS.filter((task) => summary.byTaskSuccess[task])
      .map(
        (task) =>
          `${this.TASK_LABELS[task].toLowerCase()} ${this.c.number(summary.byTaskSuccess[task])}`,
      )
      .join(', ');
    this.card(
      'stats-success',
      this.c.number(t.successful),
      this.m.successDetail(
        tasks,
        this.c.number(t.failed),
        this.c.number(t.unknown),
        t.pending ? this.c.number(t.pending) : '',
      ),
    );
    this.card(
      'stats-applied',
      this.c.number(summary.applied),
      this.m.appliedDetail(this.c.number(summary.undone)),
    );
    this.card(
      'stats-tokens',
      // Unknown is never shown as zero.
      t.inputReported || t.outputReported
        ? this.m.tokensValue(
            t.inputReported
              ? this.c.number(t.inputTokens)
              : this.m.unknownLower,
            t.outputReported
              ? this.c.number(t.outputTokens)
              : this.m.unknownLower,
          )
        : t.attempts
          ? this.m.notReported
          : this.m.zeroTokens,
      t.attempts
        ? this.m.tokensDetail(
            this.c.number(t.inputReported),
            this.c.number(t.outputReported),
            this.c.number(t.attempts),
            t.inputReported < t.attempts || t.outputReported < t.attempts,
          )
        : this.m.noRequest,
    );
    const [value, detail] = this.costText(t);
    this.card('stats-cost', value, detail);
  }

  private renderChart() {
    const days = this.summary?.days ?? [];
    const chart = this.el('stats-chart');
    const max = Math.max(1, ...days.map((day) => day.attempts));
    chart.replaceChildren(
      ...days.map((day) => {
        const bar = this.doc.createElement('div');
        bar.className = 'bar';
        const fill = this.doc.createElement('span');
        fill.style.height = `${Math.round((day.attempts / max) * 100)}%`;
        bar.title = this.m.dayBar(day.date, day.attempts);
        bar.append(fill);
        return bar;
      }),
    );
    const total = days.reduce((sum, day) => sum + day.attempts, 0);
    chart.setAttribute(
      'aria-label',
      days.length
        ? this.m.chartLabel(
            days[0]!.date,
            days.at(-1)!.date,
            total,
            max === 1 && total === 0 ? 0 : max,
          )
        : this.m.noData,
    );
    this.fillTable(
      'stats-days',
      days.map((day) => [
        day.date,
        this.c.number(day.attempts),
        this.c.number(day.successful),
      ]),
    );
  }

  private fillTable(id: string, rows: string[][]) {
    const body = this.el(id).querySelector('tbody')!;
    body.replaceChildren(
      ...rows.map((cells) => {
        const row = this.doc.createElement('tr');
        row.append(
          ...cells.map((text, index) => {
            const cell = this.doc.createElement(index ? 'td' : 'th');
            if (!index) cell.setAttribute('scope', 'row');
            cell.textContent = text;
            return cell;
          }),
        );
        return row;
      }),
    );
  }

  private groupCells(totals: Totals, name: string): string[] {
    return [
      name,
      this.c.number(totals.attempts),
      this.c.number(totals.successful),
      totals.inputReported || totals.outputReported
        ? `${totals.inputReported ? this.c.number(totals.inputTokens) : '?'} / ${totals.outputReported ? this.c.number(totals.outputTokens) : '?'}`
        : this.m.notReported,
      this.m.ofTotal(
        this.c.number(totals.inputReported),
        this.c.number(totals.attempts),
      ),
      totals.priced ? formatUsd(totals.costPico) : this.m.unknownCost,
      totals.costState === 'complete'
        ? this.m.coverage.complete
        : totals.costState === 'partial'
          ? this.m.partialCoverage(
              this.c.number(totals.priced),
              this.c.number(totals.attempts),
            )
          : this.m.coverage.unknown,
    ];
  }

  private renderTables() {
    const summary = this.summary;
    for (const [id, key] of [
      ['stats-by-task', 'task'],
      ['stats-by-model', 'model'],
      ['stats-by-key', 'credential'],
    ] as const)
      this.fillTable(
        id,
        (summary?.groups[key] ?? []).map((row) => {
          const name =
            key === 'task'
              ? (this.TASK_LABELS[row.key as keyof CommonMessages['task']] ??
                row.key)
              : groupLabel(key, row, this.credentialLabel);
          return this.groupCells(
            row.totals,
            key === 'model' && row.provider
              ? `${PROVIDERS[row.provider].label} • ${name}`
              : name,
          );
        }),
      );
    const applied = summary
      ? QUOTA_TASKS.filter((task) => summary.appliedByTask[task]).map(
          (task) =>
            `${this.TASK_LABELS[task]}: ${this.c.number(summary.appliedByTask[task])}`,
        )
      : [];
    this.el('stats-applied-by-task').textContent = applied.length
      ? this.m.appliedByTask(applied.join(', '))
      : '';
  }

  private renderPrices() {
    const rows = [...this.prices].sort(
      (a, b) =>
        a.provider.localeCompare(b.provider) ||
        a.modelId.localeCompare(b.modelId) ||
        a.effectiveFrom - b.effectiveFrom,
    );
    this.fillTable(
      'price-table',
      rows.map((entry) => [
        `${PROVIDERS[entry.provider].label} • ${entry.modelId}`,
        `$${entry.inputPerMillion}`,
        entry.cachedInputPerMillion === null
          ? '—'
          : `$${entry.cachedInputPerMillion}`,
        `$${entry.outputPerMillion}`,
        entry.effectiveFrom === 0
          ? this.m.allRequests
          : this.m.fromDate(this.date(entry.effectiveFrom)),
        this.m.priceSource(
          entry.source === 'official',
          entry.sourceLabel,
          new Date(entry.verifiedAt).toISOString().slice(0, 10),
        ),
      ]),
    );
    const models = this.el('price-models');
    if (!models.childElementCount)
      models.replaceChildren(
        ...MODEL_CATALOG.map((model) =>
          Object.assign(this.doc.createElement('option'), { value: model.id }),
        ),
      );
  }

  // -------------------------------------------------------------- actions

  private coverageText(): string {
    return this.coverageNotes().join(' ') || this.m.completeCoverage;
  }

  export(kind: 'csv' | 'json'): void {
    const summary = this.summary;
    if (!summary) return;
    const name = `correctly-statistics-${summary.range.from}-to-${summary.range.to}.${kind}`;
    if (kind === 'csv')
      this.deps.download(
        name,
        toCsv(summary, this.credentialLabel),
        'text/csv;charset=utf-8',
      );
    else
      this.deps.download(
        name,
        toJson(summary, this.now(), this.credentialLabel, this.coverageText()),
        'application/json',
      );
    this.message('stats-message', this.m.exported(name), 'ok');
  }

  /** Adds an owner price reference (a new version; nothing is overwritten). */
  async addPrice(): Promise<void> {
    const value = (id: string) =>
      this.el<HTMLInputElement | HTMLSelectElement>(id).value.trim();
    const provider = value('price-provider');
    const modelId = value('price-model');
    const input = value('price-input');
    const cached = value('price-cached');
    const output = value('price-output');
    const from = value('price-from');
    const label = value('price-label') || this.m.enteredByMe;
    const errors = [
      isProviderId(provider) ? '' : this.m.priceErrors.provider,
      /^[a-z0-9][a-z0-9._-]{0,79}$/.test(modelId)
        ? ''
        : this.m.priceErrors.model,
      parseRate(input) === null ? this.m.priceErrors.input : '',
      parseRate(output) === null ? this.m.priceErrors.output : '',
      cached && parseRate(cached) === null ? this.m.priceErrors.cached : '',
      DATE.test(from) ? '' : this.m.priceErrors.date,
      label.length > 120 ? this.m.priceErrors.label : '',
    ].filter(Boolean);
    if (errors.length) {
      this.message('price-message', errors.join(' '), 'error');
      return;
    }
    const [year, month, day] = from.split('-').map(Number) as [
      number,
      number,
      number,
    ];
    const effectiveFrom = startOfDay({ year, month, day }, this.timezone);
    if (
      effectiveFrom < this.now() &&
      !this.deps.confirm(this.m.confirmPrice(from))
    )
      return;
    try {
      const result = await this.deps.quota.addPrice({
        id: `owner-${(this.deps.newId ?? (() => crypto.randomUUID()))()}`,
        provider: provider as ProviderId,
        modelId,
        inputPerMillion: input,
        cachedInputPerMillion: cached || null,
        outputPerMillion: output,
        effectiveFrom,
        source: 'owner',
        sourceLabel: label,
        verifiedAt: this.now(),
      });
      this.message(
        'price-message',
        result === 'saved'
          ? this.m.priceAdded(modelId, from)
          : this.m.priceInvalid,
        result === 'saved' ? 'ok' : 'error',
      );
    } catch {
      this.message('price-message', this.c.error('STORAGE_ERROR'), 'error');
    }
    await this.refresh();
  }

  /** Deletes statistics before the chosen date; usage limits are kept. */
  async deleteHistory(): Promise<void> {
    const before = this.el<HTMLInputElement>('stats-delete-before').value;
    if (!DATE.test(before)) {
      this.message('stats-delete-message', this.m.chooseDate, 'error');
      return;
    }
    const [year, month, day] = before.split('-').map(Number) as [
      number,
      number,
      number,
    ];
    const cutoff = Math.min(
      startOfDay({ year, month, day }, this.timezone),
      this.now(),
    );
    if (!this.deps.confirm(this.m.confirmDeleteStats(before))) return;
    try {
      const count = await this.deps.quota.deleteHistory(cutoff, this.now());
      this.message(
        'stats-delete-message',
        this.m.statsDeleted(this.c.number(count)),
        'ok',
      );
    } catch {
      this.message(
        'stats-delete-message',
        this.c.error('STORAGE_ERROR'),
        'error',
      );
    }
    await this.refresh();
  }
}
