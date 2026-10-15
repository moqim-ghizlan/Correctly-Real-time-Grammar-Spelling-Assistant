import { errorMessage } from '../shared/errors';
import {
  PROVIDERS,
  PROVIDER_IDS,
  SLOT_LABELS,
  TASKS,
  isProviderId,
  type ProviderId,
} from '../shared/models';
import { loadProfiles, type ProviderProfile } from '../shared/providers';
import {
  CAP_MAX,
  PERIODS,
  PERIOD_LABELS,
  TASK_LABELS,
  capFor,
  defaultPolicy,
  describeNote,
  formatCount,
  formatReset,
  hasGlobalCap,
  isTimeZone,
  parseCapInput,
  reached,
  type Cap,
  type Period,
  type PeriodCaps,
  type QuotaNote,
  type QuotaPolicy,
  type Scope,
} from '../shared/quota';
import {
  legacySeed,
  usageKey,
  type AlertRecord,
  type QuotaSnapshot,
  type QuotaStore,
} from '../shared/quota-store';
import type { StorageArea } from '../shared/storage';
import type { Tone } from './settings-ui';

// V5.8 "Usage limits": daily/weekly/monthly caps (total, per action, and
// optionally per provider and per key), warnings, pause and time zone. The
// page reads and writes the IndexedDB ledger directly (trusted extension
// page); every save is one transaction checked against the revision it was
// based on, so two settings tabs never overwrite each other silently.

export interface LimitsDeps {
  area: StorageArea;
  quota: QuotaStore;
  confirm: (question: string) => boolean;
  now?: () => number;
  /** IANA zones offered when changing the time zone. */
  timeZones?: () => string[];
}

type Row = {
  scope: Scope;
  period: Period;
  box: HTMLInputElement;
  input: HTMLInputElement;
  bar: HTMLProgressElement;
  usage: HTMLElement;
  error: HTMLElement;
};

const scopeTitle = (scope: Scope, profiles: ProviderProfile[]): string => {
  switch (scope.kind) {
    case 'global':
      return 'Total (all actions, providers and keys)';
    case 'task':
      return TASK_LABELS[scope.id as keyof typeof TASK_LABELS] ?? scope.id;
    case 'provider':
      return isProviderId(scope.id) ? PROVIDERS[scope.id].label : scope.id;
    case 'credential': {
      const profile = profiles.find((p) => p.id === scope.id);
      return profile
        ? `Key “${profile.label}” (${PROVIDERS[profile.provider].label})`
        : 'Deleted key';
    }
  }
};

const SCOPE_HELP: Partial<Record<string, string>> = {
  'global:all':
    'Every AI request counts here, whatever the action, provider, key or model. Switching keys or providers never frees requests. At least one total limit stays on.',
  'task:rewrite':
    'One rewrite counts as one request, even when it returns several styles.',
  'task:translateRewrite':
    'Translate & rewrite counts once, in its own category (not as a translation plus a rewrite).',
};

/** Same limits, ignoring the save bookkeeping (revision, time). */
const sameCaps = (a: QuotaPolicy, b: QuotaPolicy) =>
  JSON.stringify({ ...a, revision: 0, updatedAt: 0 }) ===
  JSON.stringify({ ...b, revision: 0, updatedAt: 0 });

export class LimitsSection {
  private snapshot: QuotaSnapshot | null = null;
  private profiles: ProviderProfile[] = [];
  private rows: Row[] = [];
  private rowsKey = '';
  /** The form holds edits not saved yet: refreshes keep them. */
  private dirty = false;
  private busy = false;
  private readonly now: () => number;

  constructor(
    private readonly doc: Document,
    private readonly deps: LimitsDeps,
  ) {
    this.now = deps.now ?? (() => Date.now());
  }

  private el<T extends HTMLElement>(id: string): T {
    const node = this.doc.getElementById(id);
    if (!node) throw new Error('Missing element #' + id);
    return node as T;
  }

  private message(text: string, tone: Tone = 'neutral') {
    const node = this.el('limits-message');
    node.textContent = text;
    node.dataset.tone = tone;
  }

  async init(): Promise<void> {
    this.bind();
    await this.refresh();
  }

  /** Re-reads keys and usage (another tab, the worker, or a new day). */
  async refresh(): Promise<void> {
    const { area, quota } = this.deps;
    try {
      const loaded = await loadProfiles(area);
      if (!loaded.damaged) this.profiles = loaded.store.profiles;
    } catch {
      // Keep the last known key list.
    }
    try {
      // Creates the limits on first use (same import as the worker).
      await quota
        .ensureReady(() => legacySeed(area), this.now())
        .catch(() => undefined);
      this.snapshot = await quota.snapshot(
        this.now(),
        this.profiles.map((p) => p.id),
      );
    } catch {
      this.snapshot = null;
    }
    this.render();
  }

  onStorageChanged(keys: string[]): void {
    if (keys.includes('correctly.v5.providers')) void this.refresh();
  }

  private get saved(): QuotaPolicy | null {
    return this.snapshot?.policy ?? null;
  }

  private bind() {
    const form = this.el<HTMLFormElement>('limits-form');
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.save();
    });
    form.addEventListener('input', () => {
      this.dirty = true;
      this.validate();
    });
    form.addEventListener('change', () => {
      this.dirty = true;
      this.validate();
    });
    this.el<HTMLInputElement>('limits-pause').addEventListener('change', () => {
      void this.savePause();
    });
    this.el('limits-reload').addEventListener('click', () => {
      this.dirty = false;
      this.rowsKey = '';
      this.message('');
      void this.refresh();
    });
    this.el('limits-repair-button').addEventListener('click', () => {
      void this.repair();
    });
    this.el('limits-clock-confirm').addEventListener('click', () => {
      void this.confirmClock();
    });
    this.el('limits-timezone-change').addEventListener('click', () => {
      this.el('limits-timezone-row').hidden = false;
      this.el<HTMLInputElement>('limits-timezone-input').focus();
    });
  }

  // ------------------------------------------------------------ rendering

  render(): void {
    const snapshot = this.snapshot;
    const policy = this.saved;
    const state = this.el('limits-state');
    const [label, tone] = !snapshot
      ? ['Unavailable', 'error']
      : snapshot.status !== 'ok'
        ? ['Needs repair', 'error']
        : snapshot.clockBack
          ? ['Clock check needed', 'error']
          : policy?.pauseAll
            ? ['AI paused', 'info']
            : ['Active', 'ok'];
    state.replaceChildren(
      Object.assign(this.doc.createElement('span'), { className: 'dot' }),
      label,
    );
    state.dataset.tone = tone;
    const status = this.el('limits-status');
    status.textContent = !snapshot
      ? 'Usage temporarily unavailable: Correctly cannot read its usage records, so no AI request is sent. Reload this page; if it persists, restart the browser.'
      : '';
    status.dataset.tone = 'error';
    this.el('limits-repair').hidden = !snapshot || snapshot.status === 'ok';
    this.el('limits-clock').hidden = !snapshot?.clockBack;
    const pause = this.el<HTMLInputElement>('limits-pause');
    pause.checked = policy?.pauseAll ?? false;
    pause.disabled = !policy || this.busy;
    this.buildRows();
    if (policy && !this.dirty) this.fill(policy);
    for (const row of this.rows) this.renderUsage(row);
    for (const id of ['limits-at80', 'limits-at95', 'limits-timezone-change'])
      this.el<HTMLInputElement>(id).disabled = !policy || this.busy;
    this.el('limits-timezone').textContent = policy?.timezone ?? '—';
    this.renderAlerts();
    this.renderToday();
    this.renderTracking();
    this.validate();
  }

  private scopes(): { main: Scope[]; advanced: Scope[] } {
    const ids = new Set(this.profiles.map((p) => p.id));
    for (const id of Object.keys(this.saved?.credentials ?? {})) ids.add(id);
    return {
      main: [
        { kind: 'global', id: 'all' },
        ...TASKS.map((id) => ({ kind: 'task' as const, id })),
      ],
      advanced: [
        ...PROVIDER_IDS.map((id) => ({ kind: 'provider' as const, id })),
        // Only keys that still exist get a row (a deleted key's caps go).
        ...this.profiles.map((p) => ({
          kind: 'credential' as const,
          id: p.id,
        })),
      ],
    };
  }

  /** (Re)creates the rows when the list of keys changes. */
  private buildRows() {
    const { main, advanced } = this.scopes();
    const key = JSON.stringify([
      main,
      advanced,
      this.profiles.map((p) => p.label),
    ]);
    if (key === this.rowsKey) return;
    this.rowsKey = key;
    this.rows = [];
    this.el('limits-groups').replaceChildren(
      ...main.map((scope) => this.group(scope)),
    );
    this.el('limits-advanced-groups').replaceChildren(
      ...advanced.map((scope) => this.group(scope)),
    );
    this.dirty = false;
  }

  private group(scope: Scope): HTMLElement {
    const doc = this.doc;
    const title = scopeTitle(scope, this.profiles);
    const fieldset = doc.createElement('fieldset');
    fieldset.className = 'route limits';
    const legend = doc.createElement('legend');
    legend.textContent = title;
    fieldset.append(legend);
    const help = SCOPE_HELP[`${scope.kind}:${scope.id}`];
    if (help) {
      const note = doc.createElement('p');
      note.className = 'hint';
      note.textContent = help;
      fieldset.append(note);
    }
    for (const period of PERIODS) {
      const name = `${PERIOD_LABELS[period]} limit — ${title}`;
      const row = doc.createElement('div');
      row.className = 'cap-row';
      const toggle = doc.createElement('label');
      toggle.className = 'check';
      const box = doc.createElement('input');
      box.type = 'checkbox';
      box.setAttribute('aria-label', `${name}: on`);
      const text = doc.createElement('span');
      text.textContent = PERIOD_LABELS[period];
      toggle.append(box, text);
      const input = doc.createElement('input');
      input.type = 'text';
      input.inputMode = 'numeric';
      input.autocomplete = 'off';
      input.className = 'cap-max';
      input.setAttribute('aria-label', `${name}: maximum AI requests`);
      const unit = doc.createElement('span');
      unit.className = 'hint';
      unit.textContent = 'AI requests';
      const bar = doc.createElement('progress');
      const usage = doc.createElement('p');
      usage.className = 'cap-usage hint';
      const error = doc.createElement('p');
      error.className = 'message';
      error.dataset.tone = 'error';
      const ids = `${scope.kind}-${scope.id}-${period}`;
      usage.id = `cap-usage-${ids}`;
      error.id = `cap-error-${ids}`;
      input.setAttribute('aria-describedby', `${usage.id} ${error.id}`);
      row.append(toggle, input, unit, bar, usage, error);
      fieldset.append(row);
      this.rows.push({ scope, period, box, input, bar, usage, error });
    }
    return fieldset;
  }

  private fill(policy: QuotaPolicy) {
    for (const row of this.rows) {
      const cap = capFor(policy, row.scope, row.period) ?? {
        enabled: false,
        max: policy.global[row.period].max,
      };
      row.box.checked = cap.enabled;
      row.input.value = formatCount(cap.max);
    }
    this.el<HTMLInputElement>('limits-at80').checked = policy.alerts.at80;
    this.el<HTMLInputElement>('limits-at95').checked = policy.alerts.at95;
    this.el<HTMLInputElement>('limits-timezone-input').value = policy.timezone;
    this.el('limits-timezone-row').hidden = true;
    const list = this.el('limits-timezones');
    if (!list.childElementCount)
      list.replaceChildren(
        ...(this.deps.timeZones?.() ?? []).map((zone) =>
          Object.assign(this.doc.createElement('option'), { value: zone }),
        ),
      );
  }

  private cell(row: { scope: Scope; period: Period }) {
    return (
      this.snapshot?.usage[usageKey(row.scope, row.period)] ?? {
        counted: 0,
        reserved: 0,
      }
    );
  }

  /** Used / limit / remaining / reset, from the SAVED limits (what is enforced). */
  private renderUsage(row: Row) {
    const policy = this.saved;
    const windows = this.snapshot?.windows;
    const disabled = !policy || this.busy;
    row.box.disabled = disabled;
    row.input.disabled = disabled;
    if (!policy || !windows) {
      row.usage.textContent = 'Usage temporarily unavailable.';
      row.bar.hidden = true;
      return;
    }
    const { counted, reserved } = this.cell(row);
    const cap = capFor(policy, row.scope, row.period);
    const progress = reserved ? `, ${formatCount(reserved)} in progress` : '';
    const reset = `Resets ${formatReset(windows[row.period].end, policy.timezone)}.`;
    if (!cap?.enabled) {
      row.bar.hidden = true;
      row.usage.textContent = `Off (still tracking usage): ${formatCount(counted)} used${progress}. ${reset}`;
      return;
    }
    const remaining = Math.max(0, cap.max - counted - reserved);
    const state =
      counted > cap.max
        ? 'Over limit'
        : counted + reserved >= cap.max
          ? 'Limit reached'
          : reached(counted, cap.max, 80)
            ? 'Approaching limit'
            : 'Available';
    const percent = Math.floor((counted * 100) / cap.max);
    row.bar.hidden = false;
    row.bar.max = cap.max;
    row.bar.value = Math.min(counted, cap.max);
    row.bar.setAttribute(
      'aria-label',
      `${PERIOD_LABELS[row.period]} ${scopeTitle(row.scope, this.profiles)} usage: ${percent} percent, ${formatCount(counted)} of ${formatCount(cap.max)}`,
    );
    row.usage.textContent = `${state} — used ${formatCount(counted)} / ${formatCount(cap.max)}${counted > cap.max ? ' (over limit)' : ''}, ${formatCount(remaining)} remaining now${progress}. ${reset}`;
  }

  private alertNote(alert: AlertRecord): QuotaNote {
    return {
      level: alert.level,
      blocked: false,
      scope: alert.kind,
      task: alert.kind === 'task' ? (alert.scopeId as QuotaNote['task']) : null,
      provider:
        alert.kind === 'provider' && isProviderId(alert.scopeId)
          ? alert.scopeId
          : null,
      period: alert.period,
      used: alert.used,
      max: alert.max,
      resetAt: alert.end,
      timezone: alert.timezone,
    };
  }

  private renderAlerts() {
    const alerts = this.snapshot?.alerts ?? [];
    this.el('limits-alerts').replaceChildren(
      ...alerts.map((alert) => {
        const item = this.doc.createElement('li');
        item.className = 'warning';
        const text = this.doc.createElement('span');
        const profile = this.profiles.find((p) => p.id === alert.scopeId);
        text.textContent = describeNote(
          this.alertNote(alert),
          profile ? `key “${profile.label}”` : 'a deleted key',
        );
        const dismiss = this.doc.createElement('button');
        dismiss.type = 'button';
        dismiss.className = 'ghost';
        dismiss.textContent = 'Dismiss';
        dismiss.setAttribute('aria-label', `Dismiss: ${text.textContent}`);
        dismiss.addEventListener('click', () => {
          void this.deps.quota
            .dismissAlert(alert.id)
            .then(() => this.refresh())
            .catch(() => undefined);
        });
        item.append(text, dismiss);
        return item;
      }),
    );
  }

  /** Today's requests per key, model and action (no text, no key). */
  private renderToday() {
    const rows = (this.snapshot?.today ?? []).map((row) => {
      const profile = this.profiles.find((p) => p.id === row.credentialId);
      const who = profile
        ? `${profile.label} (${PROVIDERS[row.provider].label})`
        : 'deleted key';
      const action =
        row.task === 'test' ? 'Test' : (SLOT_LABELS[row.task] ?? row.task);
      return `${action} → ${who} • ${row.modelId}: ${row.attempts} request(s), ${row.completed} answered, ${row.failed} failed, ${row.unknown} unknown · ${row.inputTokens} in / ${row.outputTokens} out tokens`;
    });
    const unknown = (this.snapshot?.today ?? []).reduce(
      (sum, row) => sum + row.unknown,
      0,
    );
    if (unknown)
      rows.push(
        `${unknown} request(s) were sent but their answer was lost: they may be billed.`,
      );
    this.el('usage-routes').replaceChildren(
      ...rows.map((text) =>
        Object.assign(this.doc.createElement('li'), { textContent: text }),
      ),
    );
  }

  private renderTracking() {
    const migration = this.snapshot?.migration;
    const policy = this.saved;
    const node = this.el('limits-tracking');
    if (!migration || !policy || !this.snapshot?.windows) {
      node.textContent = '';
      return;
    }
    const since = new Intl.DateTimeFormat('en-GB', {
      timeZone: policy.timezone,
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(migration.trackingSince));
    const notes: string[] = [];
    if (migration.trackingSince > this.snapshot.windows.monthly.start)
      notes.push(
        `Usage is counted since ${since}: earlier days of this week and month are unknown (previous versions kept only one day).`,
      );
    if (
      migration.unattributed > 0 &&
      migration.trackingSince === this.snapshot.windows.daily.start
    )
      notes.push(
        `${migration.unattributed} request(s) made today before V5.7 count in the total only (their action and key are unknown).`,
      );
    node.textContent = notes.join(' ');
  }

  // ----------------------------------------------------------- the draft

  /** The limits as typed, or null with per-field errors shown. */
  private collect(): QuotaPolicy | null {
    const saved = this.saved;
    if (!saved) return null;
    const draft: QuotaPolicy = structuredClone(saved);
    let valid = true;
    const credentials: Record<string, PeriodCaps> = {};
    for (const row of this.rows) {
      const typed = parseCapInput(row.input.value);
      const previous = capFor(saved, row.scope, row.period);
      let error = '';
      if (typed === null && (row.box.checked || row.input.value.trim()))
        error = `Enter a whole number from 1 to ${formatCount(CAP_MAX)} (for example 5,000).`;
      if (error && row.box.checked) valid = false;
      const cap: Cap = {
        enabled: row.box.checked,
        // A disabled cap keeps its last valid value.
        max: typed ?? previous?.max ?? saved.global[row.period].max,
      };
      const used = this.cell(row).counted;
      if (!error && cap.enabled && used >= cap.max && !previous?.enabled)
        error = `Already ${formatCount(used)} used in this period: new requests it covers are blocked once saved.`;
      else if (
        !error &&
        cap.enabled &&
        used >= cap.max &&
        previous &&
        cap.max < previous.max
      )
        error = `Below what is already used (${formatCount(used)}): new requests it covers are blocked once saved.`;
      row.error.textContent = error;
      row.input.setAttribute(
        'aria-invalid',
        String(Boolean(error) && row.box.checked && typed === null),
      );
      const { scope, period } = row;
      if (scope.kind === 'global') draft.global[period] = cap;
      else if (scope.kind === 'task')
        draft.tasks[scope.id as (typeof TASKS)[number]][period] = cap;
      else if (scope.kind === 'provider')
        draft.providers[scope.id as ProviderId][period] = cap;
      else {
        const base = credentials[scope.id] ?? {
          ...(saved.credentials[scope.id] ?? {
            daily: { enabled: false, max: saved.global.daily.max },
            weekly: { enabled: false, max: saved.global.weekly.max },
            monthly: { enabled: false, max: saved.global.monthly.max },
          }),
        };
        credentials[scope.id] = { ...base, [period]: cap };
      }
    }
    // Keep a key's entry only while one of its caps is on (or it existed).
    draft.credentials = Object.fromEntries(
      Object.entries(credentials).filter(
        ([id, caps]) =>
          Object.hasOwn(saved.credentials, id) ||
          PERIODS.some((period) => caps[period].enabled),
      ),
    );
    draft.alerts = {
      at80: this.el<HTMLInputElement>('limits-at80').checked,
      at95: this.el<HTMLInputElement>('limits-at95').checked,
    };
    const zone = this.el<HTMLInputElement>(
      'limits-timezone-input',
    ).value.trim();
    const zoneError = this.el('limits-timezone-error');
    zoneError.textContent = isTimeZone(zone)
      ? ''
      : 'Unknown time zone. Use an IANA name such as Europe/Paris.';
    if (isTimeZone(zone)) draft.timezone = zone;
    else valid = false;
    const globalError = this.el('limits-global-error');
    globalError.textContent = hasGlobalCap(draft)
      ? ''
      : 'Keep at least one total limit on (daily, weekly or monthly). To stop all AI requests, use Pause instead.';
    if (!hasGlobalCap(draft)) valid = false;
    return valid ? draft : null;
  }

  private validate() {
    const saved = this.saved;
    const draft = saved ? this.collect() : null;
    this.el<HTMLButtonElement>('limits-save').disabled =
      this.busy || !saved || !draft || sameCaps(draft, saved);
  }

  // -------------------------------------------------------------- actions

  async save(): Promise<void> {
    const saved = this.saved;
    const draft = this.collect();
    if (!saved || !draft || this.busy) return;
    if (
      draft.timezone !== saved.timezone &&
      !this.deps.confirm(
        `Use the time zone ${draft.timezone} for days, weeks and months? Today's, this week's and this month's counts carry over: nothing is reset.`,
      )
    )
      return;
    this.busy = true;
    this.render();
    try {
      const result = await this.deps.quota.savePolicy(
        draft,
        saved.revision,
        this.now(),
      );
      if (result === 'saved') {
        this.dirty = false;
        this.message('Limits saved. They apply to the next request.', 'ok');
      } else if (result === 'conflict') {
        this.message(
          'Limits were changed in another tab or window, so nothing was saved. Use “Reload saved limits” to review them (your edits here are then discarded).',
          'error',
        );
        this.el('limits-reload').hidden = false;
      } else
        this.message('These limits are not valid. Nothing was saved.', 'error');
    } catch {
      // The form keeps the edits.
      this.message(errorMessage('STORAGE_ERROR'), 'error');
    }
    this.busy = false;
    if (!this.dirty) this.el('limits-reload').hidden = true;
    await this.refresh();
  }

  async savePause(): Promise<void> {
    const saved = this.saved;
    const pause = this.el<HTMLInputElement>('limits-pause').checked;
    if (!saved || this.busy) return;
    this.busy = true;
    try {
      const result = await this.deps.quota.savePolicy(
        { ...saved, pauseAll: pause },
        saved.revision,
        this.now(),
      );
      this.message(
        result === 'saved'
          ? pause
            ? 'All AI requests are paused. Text shortcuts keep working.'
            : 'AI requests are allowed again (within your limits).'
          : 'Limits were changed in another tab or window. Nothing was saved; the page was reloaded.',
        result === 'saved' ? 'ok' : 'error',
      );
    } catch {
      this.message(errorMessage('STORAGE_ERROR'), 'error');
    }
    this.busy = false;
    await this.refresh();
  }

  /** Damaged or missing limits: safe defaults again. Usage is NOT reset. */
  async repair(): Promise<void> {
    if (
      !this.deps.confirm(
        'Restore safe default limits? Your recorded usage is kept; only the limit settings are replaced.',
      )
    )
      return;
    try {
      const seed = await legacySeed(this.deps.area);
      await this.deps.quota.savePolicy(
        defaultPolicy(seed.timezone, seed.dailyLimit, this.now()),
        null,
        this.now(),
      );
      this.message('Safe default limits restored. Usage was kept.', 'ok');
    } catch {
      this.message(errorMessage('STORAGE_ERROR'), 'error');
    }
    this.dirty = false;
    await this.refresh();
  }

  async confirmClock(): Promise<void> {
    if (
      !this.deps.confirm(
        `Is your computer's date and time correct now (${new Date(this.now()).toLocaleString()})? AI requests resume. Usage already recorded is kept.`,
      )
    )
      return;
    try {
      await this.deps.quota.confirmClock(this.now());
      this.message('Clock confirmed. AI requests can resume.', 'ok');
    } catch {
      this.message(errorMessage('STORAGE_ERROR'), 'error');
    }
    await this.refresh();
  }
}
