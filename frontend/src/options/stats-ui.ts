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
  COST_NOTE,
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
import {
  TASK_FR as TASK_LABELS,
  erreur as errorMessage,
  nombre as formatCount,
} from './fr';
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

  constructor(
    private readonly doc: Document,
    private readonly deps: StatsDeps,
  ) {
    this.now = deps.now ?? (() => Date.now());
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
    this.setState('Chargement…', 'info');
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
        this.message('stats-message', range.error, 'error');
        this.setState('Choisir les dates', 'error');
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
      this.setState('Indisponible', 'error');
      this.message(
        'stats-message',
        'Statistiques momentanément indisponibles : les enregistrements locaux ne peuvent pas être lus. Vos limites d’usage ne sont pas affectées.',
        'error',
      );
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
      this.summary.totals.attempts ? 'À jour' : 'Aucune requête',
      this.summary.totals.attempts ? 'ok' : 'neutral',
    );
    this.render();
  }

  private credentialLabel = (id: string): string => {
    const profile = this.profiles.find((p) => p.id === id);
    return profile ? profile.label : `Clé supprimée (…${id.slice(-4)})`;
  };

  // ------------------------------------------------------------ rendering

  private date(ms: number): string {
    return new Intl.DateTimeFormat('fr-FR', {
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
      ? `${this.range.from} → ${this.range.to} (${this.range.timezone}). Chaque requête est comptée le jour de son envoi.`
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
        ['all', 'Toutes les actions'],
        ...QUOTA_TASKS.map((task): [string, string] => [
          task,
          TASK_LABELS[task],
        ]),
      ],
      this.filter.task,
    );
    fill(
      'stats-provider',
      [
        ['all', 'Tous les fournisseurs'],
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
        ['all', 'Tous les modèles'],
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
        ['all', 'Toutes les clés API'],
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
      notes.push(
        `Les statistiques détaillées commencent le ${this.date(since)} (Correctly V5.8). Les requêtes antérieures ne sont comptées que dans les limites d’usage, pas ici.`,
      );
    if (history.deletedBefore !== null && history.deletedBefore > range.start)
      notes.push(
        `Les statistiques antérieures au ${this.date(history.deletedBefore)} ont été supprimées à votre demande. Les limites d’usage comptent toujours ces requêtes.`,
      );
    if (range.start < this.now() - OPERATION_RETENTION_MS)
      notes.push(
        'Les requêtes de plus de 400 jours ne sont plus conservées : cette partie de la période est incomplète.',
      );
    if (history.clockBack)
      notes.push(
        'L’horloge de votre ordinateur a reculé : les heures peuvent être fausses tant qu’elle n’est pas confirmée dans Limites d’usage.',
      );
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
        return ['$0.00', 'Aucune requête envoyée sur cette période.'];
      case 'complete':
        return [
          `${formatUsd(totals.costPico)} (estimation)`,
          `Les ${formatCount(totals.attempts)} requête(s) ont un prix. ${COST_NOTE}`,
        ];
      case 'partial':
        return [
          `${formatUsd(totals.costPico)} (partiel)`,
          `Estimation partielle pour ${formatCount(totals.priced)} requête(s) sur ${formatCount(totals.attempts)} ; le coût des autres est inconnu (${this.missing(totals)}). ${COST_NOTE}`,
        ];
      case 'unknown':
        return [
          'Indisponible',
          `Aucune requête de cette période n’a de prix (${this.missing(totals)}). Inconnu ne veut pas dire $0.00.`,
        ];
    }
  }

  private missing(totals: Totals) {
    return [
      totals.missingTokens
        ? `${formatCount(totals.missingTokens)} sans nombre de tokens`
        : '',
      totals.missingPrice
        ? `${formatCount(totals.missingPrice)} sans prix de référence`
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
        this.card(id, '—', 'Non disponible.');
      return;
    }
    const t = summary.totals;
    this.card(
      'stats-requests',
      formatCount(t.attempts),
      `Envoyées ou peut-être envoyées, comme dans les limites d’usage ; plusieurs styles dans une requête comptent une fois.${history.inProgress ? ` ${formatCount(history.inProgress)} en cours.` : ''}`,
    );
    const tasks = QUOTA_TASKS.filter((task) => summary.byTaskSuccess[task])
      .map(
        (task) =>
          `${TASK_LABELS[task].toLowerCase()} ${formatCount(summary.byTaskSuccess[task])}`,
      )
      .join(', ');
    this.card(
      'stats-success',
      formatCount(t.successful),
      `Résultats valides, pas forcément appliqués${tasks ? ` (${tasks})` : ''}. Échecs : ${formatCount(t.failed)} ; réponses perdues : ${formatCount(t.unknown)}${t.pending ? ` ; en attente : ${formatCount(t.pending)}` : ''}.`,
    );
    this.card(
      'stats-applied',
      formatCount(summary.applied),
      `Modifications appliquées à votre texte par Correctly (Copier n’est pas compté). Annulations enregistrées : ${formatCount(summary.undone)}. Enregistré depuis Correctly V5.9.`,
    );
    this.card(
      'stats-tokens',
      // Unknown is never shown as zero.
      t.inputReported || t.outputReported
        ? `${t.inputReported ? formatCount(t.inputTokens) : 'inconnu'} entrée / ${t.outputReported ? formatCount(t.outputTokens) : 'inconnu'} sortie`
        : t.attempts
          ? 'Non déclarés'
          : '0 entrée / 0 sortie',
      t.attempts
        ? `Déclarés par le fournisseur pour ${formatCount(t.inputReported)} requête(s) sur ${formatCount(t.attempts)} (entrée) et ${formatCount(t.outputReported)} sur ${formatCount(t.attempts)} (sortie).${t.inputReported < t.attempts || t.outputReported < t.attempts ? ' Partiel : les autres n’ont pas de nombre de tokens.' : ''}`
        : 'Aucune requête sur cette période.',
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
        bar.title = `${day.date} : ${day.attempts} requête(s)`;
        bar.append(fill);
        return bar;
      }),
    );
    const total = days.reduce((sum, day) => sum + day.attempts, 0);
    chart.setAttribute(
      'aria-label',
      days.length
        ? `Requêtes par jour du ${days[0]!.date} au ${days.at(-1)!.date} : ${total} au total, au plus ${max === 1 && total === 0 ? 0 : max} en un jour. Les mêmes valeurs sont dans le tableau ci-dessous.`
        : 'Aucune donnée.',
    );
    this.fillTable(
      'stats-days',
      days.map((day) => [
        day.date,
        formatCount(day.attempts),
        formatCount(day.successful),
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
      formatCount(totals.attempts),
      formatCount(totals.successful),
      totals.inputReported || totals.outputReported
        ? `${totals.inputReported ? formatCount(totals.inputTokens) : '?'} / ${totals.outputReported ? formatCount(totals.outputTokens) : '?'}`
        : 'Non déclarés',
      `${formatCount(totals.inputReported)} sur ${formatCount(totals.attempts)}`,
      totals.priced ? formatUsd(totals.costPico) : 'Inconnu',
      totals.costState === 'complete'
        ? 'Complète'
        : totals.costState === 'partial'
          ? `Partielle (${formatCount(totals.priced)} sur ${formatCount(totals.attempts)})`
          : 'Inconnue',
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
              ? (TASK_LABELS[row.key as keyof typeof TASK_LABELS] ?? row.key)
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
            `${TASK_LABELS[task]}: ${formatCount(summary.appliedByTask[task])}`,
        )
      : [];
    this.el('stats-applied-by-task').textContent = applied.length
      ? `Modifications appliquées par action — ${applied.join(', ')}.`
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
          ? 'Toutes les requêtes'
          : `À partir du ${this.date(entry.effectiveFrom)}`,
        `${entry.source === 'official' ? 'Prix officiel' : 'Votre saisie'} : ${entry.sourceLabel} (vérifié le ${new Date(entry.verifiedAt).toISOString().slice(0, 10)})`,
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
    return this.coverageNotes().join(' ') || 'Complet pour cette période.';
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
    this.message(
      'stats-message',
      `${name} exporté (aucun texte, aucune clé).`,
      'ok',
    );
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
    const label = value('price-label') || 'Saisi par moi';
    const errors = [
      isProviderId(provider) ? '' : 'Choisissez un fournisseur.',
      /^[a-z0-9][a-z0-9._-]{0,79}$/.test(modelId)
        ? ''
        : 'Saisissez l’identifiant exact du modèle (par exemple gemini-3.1-flash-lite).',
      parseRate(input) === null
        ? 'Prix d’entrée : un montant en dollars comme 0.25 (jusqu’à 6 décimales).'
        : '',
      parseRate(output) === null
        ? 'Prix de sortie : un montant en dollars comme 1.50 (jusqu’à 6 décimales).'
        : '',
      cached && parseRate(cached) === null
        ? 'Prix d’entrée en cache : un montant en dollars, ou laissez vide.'
        : '',
      DATE.test(from)
        ? ''
        : 'Choisissez la date à partir de laquelle ce prix s’applique.',
      label.length > 120 ? 'La source fait au plus 120 caractères.' : '',
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
      !this.deps.confirm(
        `Appliquer ce prix aux requêtes envoyées depuis le ${from} ? Leur estimation changera (les anciens prix restent dans l’historique).`,
      )
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
          ? `Prix de référence ajouté pour ${modelId} à partir du ${from}.`
          : 'Ce prix de référence n’est pas valide. Rien n’a été enregistré.',
        result === 'saved' ? 'ok' : 'error',
      );
    } catch {
      this.message('price-message', errorMessage('STORAGE_ERROR'), 'error');
    }
    await this.refresh();
  }

  /** Deletes statistics before the chosen date; usage limits are kept. */
  async deleteHistory(): Promise<void> {
    const before = this.el<HTMLInputElement>('stats-delete-before').value;
    if (!DATE.test(before)) {
      this.message('stats-delete-message', 'Choisissez une date.', 'error');
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
    if (
      !this.deps.confirm(
        `Supprimer les statistiques locales des requêtes envoyées avant le ${before} ? Cela supprime les enregistrements de Correctly pour ces requêtes et les modifications appliquées. Cela ne supprime PAS vos clés API, vos limites d’usage ni ce qu’elles ont déjà compté (les limites restent appliquées), ni rien chez Google ou OpenAI. C’est irréversible.`,
      )
    )
      return;
    try {
      const count = await this.deps.quota.deleteHistory(cutoff, this.now());
      this.message(
        'stats-delete-message',
        `${formatCount(count)} enregistrement(s) de requête supprimé(s). Les limites d’usage sont inchangées.`,
        'ok',
      );
    } catch {
      this.message(
        'stats-delete-message',
        errorMessage('STORAGE_ERROR'),
        'error',
      );
    }
    await this.refresh();
  }
}
