import {
  TEST_CONNECTION,
  TEST_KEY,
  toConnectionResult,
  toKeyCheckResult,
} from '../shared/contracts';
import { errorMessage } from '../shared/errors';
import { localDate } from '../shared/local-date';
import {
  MODEL_CATALOG,
  PROVIDERS,
  catalogModel,
  isProviderId,
  modelStatus,
  type ProviderId,
} from '../shared/models';
import {
  CHECKS_KEY,
  PROVIDERS_KEY,
  ProviderError,
  ROUTE_SLOTS,
  SECRETS_KEY,
  SLOT_LABELS,
  addProfile,
  deleteProfile,
  emptyProviders,
  loadProfiles,
  migrateLegacyKey,
  mutateProviders,
  parseChecks,
  renameProfile,
  replaceKey,
  setProfileEnabled,
  setRoute,
  slotsUsing,
  type KeyCheck,
  type ProviderProfile,
  type ProviderStore,
  type RouteSlot,
} from '../shared/providers';
import { emptyUsage, type DailyUsageRecord } from '../shared/settings';
import { STORAGE_KEYS, loadUsage, type StorageArea } from '../shared/storage';
import type { Tone } from './settings-ui';

// V5.7 "AI providers": API-key profiles and the key + model each action
// uses. This page writes keys to storage but never reads one back: views use
// metadata only, and messages to the worker carry IDs, never a key.

export interface ProvidersDeps {
  area: StorageArea;
  confirm: (question: string) => boolean;
  /** TEST_KEY / TEST_CONNECTION to the service worker. */
  send: (message: unknown) => Promise<unknown>;
  now?: () => Date;
  today?: () => string;
  uiTimeoutMs?: number;
}

const time = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
};

const providerName = (provider: ProviderId) => PROVIDERS[provider].label;

type Draft = { credentialId: string; modelId: string };

export class ProvidersSection {
  private store: ProviderStore = emptyProviders();
  private checks: Record<string, KeyCheck> = {};
  private usage: DailyUsageRecord;
  private editing: ProviderProfile | null = null;
  private readonly drafts: Partial<Record<RouteSlot, Draft>> = {};
  /** Actions in progress ("key:<id>", "route:<slot>"): one at a time each. */
  private readonly busy = new Set<string>();
  private ready = false;
  private readonly today: () => string;

  constructor(
    private readonly doc: Document,
    private readonly deps: ProvidersDeps,
  ) {
    this.today = deps.today ?? (() => localDate());
    this.usage = emptyUsage(this.today());
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

  private get keyInput() {
    return this.el<HTMLInputElement>('profile-key');
  }

  async init(): Promise<void> {
    this.bind();
    // A V5.1 key becomes a profile (local only; the worker does the same).
    await migrateLegacyKey(this.deps.area).catch(() => undefined);
    await this.reload();
  }

  async reload(): Promise<void> {
    try {
      const { area } = this.deps;
      const [loaded, checks, usage] = await Promise.all([
        loadProfiles(area),
        area.get([CHECKS_KEY]),
        loadUsage(area, this.today()),
      ]);
      this.store = loaded.store;
      this.checks = parseChecks(checks[CHECKS_KEY]);
      this.usage = usage;
      this.ready = !loaded.damaged;
      if (loaded.damaged)
        this.message(
          'providers-status',
          'Saved AI provider settings are damaged. They were left untouched; no AI request can be sent.',
          'error',
        );
      else if (loaded.dropped)
        this.message(
          'providers-status',
          `${loaded.dropped} saved key(s) were invalid and are ignored. Add them again if needed.`,
          'error',
        );
    } catch {
      this.ready = false;
      this.message('providers-status', errorMessage('STORAGE_ERROR'), 'error');
    }
    this.render();
  }

  onStorageChanged(keys: string[]): void {
    if (
      [PROVIDERS_KEY, SECRETS_KEY, CHECKS_KEY, STORAGE_KEYS.usage].some((key) =>
        keys.includes(key),
      )
    )
      void this.reload();
  }

  /** Called on navigation/visibility change: never leave a key revealed. */
  hideKey(clear = false): void {
    this.keyInput.type = 'password';
    if (clear) this.keyInput.value = '';
    const toggle = this.el<HTMLButtonElement>('profile-toggle');
    toggle.textContent = 'Show';
    toggle.setAttribute('aria-pressed', 'false');
    toggle.setAttribute('aria-label', 'Show the API key being typed');
  }

  private bind() {
    this.el<HTMLFormElement>('profile-form').addEventListener(
      'submit',
      (event) => {
        event.preventDefault();
        void this.saveProfile();
      },
    );
    this.el('profile-cancel').addEventListener('click', () => this.resetForm());
    this.el('profile-provider').addEventListener('change', () =>
      this.renderHelp(),
    );
    this.el('profile-toggle').addEventListener('click', () => {
      if (this.keyInput.type !== 'password') return this.hideKey();
      this.keyInput.type = 'text';
      const toggle = this.el<HTMLButtonElement>('profile-toggle');
      toggle.textContent = 'Hide';
      toggle.setAttribute('aria-pressed', 'true');
      toggle.setAttribute('aria-label', 'Hide the API key being typed');
    });
  }

  /** Runs one write; the store is re-read so other windows' edits survive. */
  private async run(
    change: Parameters<typeof mutateProviders>[1],
    done: string,
    target: string,
  ): Promise<boolean> {
    try {
      const { store } = await mutateProviders(this.deps.area, change);
      this.store = store;
      this.message(target, done, 'ok');
      return true;
    } catch (error) {
      this.message(
        target,
        error instanceof ProviderError
          ? error.message
          : errorMessage('STORAGE_ERROR'),
        'error',
      );
      await this.reload();
      return false;
    } finally {
      this.render();
    }
  }

  // ---- Profiles -----------------------------------------------------------

  private resetForm() {
    this.editing = null;
    this.el<HTMLInputElement>('profile-label').value = '';
    this.hideKey(true);
    this.el<HTMLSelectElement>('profile-provider').disabled = false;
    this.el('profile-form-title').textContent = 'Add an API key';
    this.el('profile-save').textContent = 'Save key';
    this.el('profile-cancel').hidden = true;
    this.keyInput.placeholder = '';
    this.renderHelp();
  }

  edit(profile: ProviderProfile): void {
    this.editing = profile;
    const provider = this.el<HTMLSelectElement>('profile-provider');
    provider.value = profile.provider;
    provider.disabled = true;
    this.el<HTMLInputElement>('profile-label').value = profile.label;
    this.hideKey(true);
    this.keyInput.placeholder = 'Leave empty to keep the saved key';
    this.el('profile-form-title').textContent = `Edit “${profile.label}”`;
    this.el('profile-save').textContent = 'Save changes';
    this.el('profile-cancel').hidden = false;
    this.renderHelp();
    this.el<HTMLInputElement>('profile-label').focus();
  }

  /** Add, or rename and/or replace the key of the profile being edited. No network. */
  async saveProfile(): Promise<void> {
    const label = this.el<HTMLInputElement>('profile-label').value;
    const key = this.keyInput.value;
    const editing = this.editing;
    if (!editing) {
      const provider = this.el<HTMLSelectElement>('profile-provider').value;
      if (
        await this.run(
          addProfile({ provider, label, key }, this.deps.now?.()),
          'Key saved. Nothing was sent. Use “Check key” to verify it, then choose it below for your actions.',
          'profile-message',
        )
      )
        this.resetForm();
      return;
    }
    if (
      key.trim() &&
      !this.deps.confirm(
        `Replace the saved key of “${editing.label}”? The old key is removed from Correctly and earlier checks no longer apply.`,
      )
    ) {
      this.message('profile-message', 'Nothing changed.');
      return;
    }
    const now = this.deps.now?.();
    if (
      await this.run(
        (pair) => {
          let next = pair;
          let current = editing;
          if (label.trim() !== editing.label) {
            next = renameProfile(current, label, now)(next);
            current =
              next.store.profiles.find((p) => p.id === editing.id) ?? current;
          }
          if (key.trim()) next = replaceKey(current, key, now)(next);
          return next;
        },
        key.trim()
          ? 'Key replaced. Nothing was sent; check it again.'
          : 'Changes saved.',
        'profile-message',
      )
    )
      this.resetForm();
  }

  private async toggle(profile: ProviderProfile): Promise<void> {
    const used = slotsUsing(this.store, profile.id);
    if (
      profile.enabled &&
      used.length &&
      !this.deps.confirm(
        `Disable “${profile.label}”? ${used.map((s) => SLOT_LABELS[s]).join(', ')} will stop working until you enable it or choose another key — no other key is used automatically.`,
      )
    )
      return;
    await this.run(
      setProfileEnabled(profile, !profile.enabled, this.deps.now?.()),
      `“${profile.label}” ${profile.enabled ? 'disabled' : 'enabled'}.`,
      'profile-message',
    );
  }

  private async remove(profile: ProviderProfile): Promise<void> {
    const used = slotsUsing(this.store, profile.id);
    const impact = used.length
      ? ` ${used.map((s) => SLOT_LABELS[s]).join(', ')} will stop working until you choose another key — no other key is used automatically.`
      : '';
    if (
      !this.deps.confirm(
        `Delete “${profile.label}” and remove its key from this browser profile?${impact} A request already sent may still be billed.`,
      )
    )
      return;
    if (this.editing?.id === profile.id) this.resetForm();
    await this.run(
      deleteProfile(profile),
      `“${profile.label}” deleted.`,
      'profile-message',
    );
  }

  /** Free check: lists the key's models; sends no text, uses no quota. */
  async checkKey(profile: ProviderProfile): Promise<void> {
    const id = `key:${profile.id}`;
    if (this.busy.has(id)) return;
    this.busy.add(id);
    this.render();
    try {
      const result = toKeyCheckResult(
        await this.withTimeout(
          this.deps.send({ type: TEST_KEY, credentialId: profile.id }),
        ),
      );
      this.message(
        'profile-message',
        result.ok
          ? `“${profile.label}” accepted by ${providerName(profile.provider)}: ${result.models} text model(s) listed. This proves access, not that a model will answer.`
          : `“${profile.label}”: ${result.message}`,
        result.ok ? 'ok' : 'error',
      );
    } finally {
      this.busy.delete(id);
      await this.reload();
    }
  }

  private async withTimeout(task: Promise<unknown>): Promise<unknown> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        task,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('UI timeout')),
            this.deps.uiTimeoutMs ?? 90_000,
          );
        }),
      ]);
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  // ---- Routes -------------------------------------------------------------

  private draft(slot: RouteSlot): Draft {
    const saved = this.store.routes[slot];
    return (
      this.drafts[slot] ?? {
        credentialId: saved?.credentialId ?? '',
        modelId: saved?.modelId ?? '',
      }
    );
  }

  async saveRoute(slot: RouteSlot): Promise<void> {
    const { credentialId, modelId } = this.draft(slot);
    const route = credentialId
      ? { credentialId, modelId: modelId.trim() }
      : null;
    if (
      await this.run(
        setRoute(slot, route),
        route
          ? `${SLOT_LABELS[slot]} saved. Requests already running keep their route; the next one uses this.`
          : slot === 'default'
            ? 'Default route removed. Actions set to “Use the default” are now blocked.'
            : `${SLOT_LABELS[slot]} now uses the default route.`,
        `route-message-${slot}`,
      )
    )
      delete this.drafts[slot];
    this.render();
  }

  /** One tiny generation through the SAVED route; may be billed. */
  async testRoute(slot: RouteSlot): Promise<void> {
    const id = `route:${slot}`;
    if (this.busy.has(id)) return;
    if (
      !this.deps.confirm(
        `Send one tiny test prompt (“Reply with OK only.”, no page text) through the saved ${SLOT_LABELS[slot]} route? It counts toward your daily limit and may be billed by the provider.`,
      )
    )
      return;
    this.busy.add(id);
    this.render();
    try {
      const result = toConnectionResult(
        await this.withTimeout(this.deps.send({ type: TEST_CONNECTION, slot })),
      );
      if (result.ok) {
        const usage = result.usage
          ? ` Tokens reported: ${result.usage.inputTokens ?? '?'} in / ${result.usage.outputTokens ?? '?'} out.`
          : '';
        this.message(
          `route-message-${slot}`,
          `Model answered — ${providerName(result.provider)} • ${result.model} replied “${result.sample}” on ${time(result.checkedAt)}.${usage}`,
          'ok',
        );
      } else
        this.message(
          `route-message-${slot}`,
          `${result.message}${result.httpStatus ? ` (HTTP ${result.httpStatus})` : ''}`,
          'error',
        );
    } finally {
      this.busy.delete(id);
      await this.reload();
    }
  }

  /** Human summary of what a slot does now; never names a fallback. */
  routeSummary(slot: RouteSlot): { text: string; tone: Tone } {
    const own = this.store.routes[slot];
    const route = own ?? this.store.routes.default;
    const via = own || slot === 'default' ? '' : ' (default)';
    if (!route)
      return {
        text:
          slot === 'default'
            ? 'No default route: actions set to “Use the default” are blocked.'
            : 'Needs configuration: no default route is set.',
        tone: 'error',
      };
    const profile = this.store.profiles.find(
      (p) => p.id === route.credentialId,
    );
    if (!profile)
      return {
        text: `Needs configuration${via}: the chosen key was deleted. No other key is used.`,
        tone: 'error',
      };
    const target = `${profile.label} (${providerName(profile.provider)}) • ${route.modelId}`;
    if (!profile.enabled)
      return {
        text: `Blocked${via}: “${profile.label}” is disabled. No other key is used.`,
        tone: 'error',
      };
    const status = modelStatus(profile.provider, route.modelId);
    if (status === 'invalid' || status === 'mismatch')
      return {
        text: `Needs configuration${via}: the saved model is not valid for ${providerName(profile.provider)}.`,
        tone: 'error',
      };
    return { text: `${SLOT_LABELS[slot]} → ${target}${via}`, tone: 'ok' };
  }

  private modelNote(
    provider: ProviderId | null,
    modelId: string,
    credentialId: string,
  ) {
    if (!provider) return '';
    const status = modelStatus(provider, modelId.trim());
    if (status === 'invalid')
      return modelId.trim()
        ? 'Not a valid model ID.'
        : 'Choose or type a model ID.';
    if (status === 'mismatch')
      return `This is not a ${providerName(provider)} model.`;
    const listed = this.checks[credentialId]?.models ?? [];
    const notListed =
      listed.length && !listed.includes(modelId.trim())
        ? ' It was not in this key’s last model list.'
        : '';
    if (status === 'reviewed')
      return `${catalogModel(provider, modelId.trim())?.note ?? ''}${notListed}`;
    return `Not reviewed by Correctly: it must support structured JSON output. Every answer is still checked strictly; if the model cannot comply the request fails — nothing else is tried.${notListed}`;
  }

  // ---- Rendering ----------------------------------------------------------

  private button(
    label: string,
    aria: string,
    action: () => void,
    disabled = false,
  ) {
    const node = this.doc.createElement('button');
    node.type = 'button';
    node.className = 'ghost';
    node.textContent = label;
    node.setAttribute('aria-label', aria);
    node.disabled = disabled || !this.ready;
    node.addEventListener('click', action);
    return node;
  }

  private renderHelp() {
    const value = this.el<HTMLSelectElement>('profile-provider').value;
    const provider = isProviderId(value) ? value : 'gemini';
    const link = this.el<HTMLAnchorElement>('profile-help-link');
    link.href = PROVIDERS[provider].keysUrl;
    link.textContent = `Create a key in ${PROVIDERS[provider].keysSite}`;
  }

  render(): void {
    for (const id of [
      'profile-provider',
      'profile-label',
      'profile-key',
      'profile-toggle',
      'profile-save',
    ])
      this.el<HTMLInputElement>(id).disabled =
        !this.ready || (id === 'profile-provider' && this.editing !== null);
    this.renderProfiles();
    this.renderRoutes();
    this.renderUsage();
  }

  private renderProfiles() {
    const { profiles } = this.store;
    this.el('profile-empty').hidden = profiles.length > 0;
    this.el('profile-list').replaceChildren(
      ...profiles.map((profile) => {
        const row = this.doc.createElement('li');
        const name = this.doc.createElement('strong');
        name.textContent = profile.label;
        const provider = this.doc.createElement('span');
        provider.textContent = providerName(profile.provider);
        const details = this.doc.createElement('span');
        details.className = 'hint';
        const check = this.checks[profile.id];
        const current = check && check.revision === profile.revision;
        const used = slotsUsing(this.store, profile.id).map(
          (s) => SLOT_LABELS[s],
        );
        details.textContent = [
          profile.enabled ? 'Enabled' : 'Disabled',
          !current
            ? 'Not checked'
            : check.ok
              ? `Accepted on ${time(check.checkedAt)} (${check.models.length} models)`
              : `Check failed on ${time(check.checkedAt)}: ${check.errorCode ? errorMessage(check.errorCode) : ''}`,
          used.length
            ? `Used by: ${used.join(', ')}`
            : 'Not used by any action',
        ].join(' · ');
        const checking = this.busy.has(`key:${profile.id}`);
        const checkButton = this.button(
          checking ? 'Checking…' : 'Check key',
          `Check the key “${profile.label}” (free, sends no text)`,
          () => void this.checkKey(profile),
          checking,
        );
        checkButton.setAttribute('aria-busy', String(checking));
        row.append(
          name,
          provider,
          details,
          checkButton,
          this.button(
            'Edit',
            `Rename or replace the key “${profile.label}”`,
            () => this.edit(profile),
          ),
          this.button(
            profile.enabled ? 'Disable' : 'Enable',
            `${profile.enabled ? 'Disable' : 'Enable'} “${profile.label}”`,
            () => void this.toggle(profile),
          ),
          this.button(
            'Delete',
            `Delete “${profile.label}”`,
            () => void this.remove(profile),
          ),
        );
        return row;
      }),
    );
  }

  private renderRoutes() {
    const container = this.el('route-list');
    const focused = this.doc.activeElement?.id ?? '';
    container.replaceChildren(
      ...ROUTE_SLOTS.map((slot) => this.renderRoute(slot)),
    );
    if (focused) this.doc.getElementById(focused)?.focus();
  }

  private renderRoute(slot: RouteSlot): HTMLElement {
    const draft = this.draft(slot);
    const box = this.doc.createElement('fieldset');
    box.className = 'route';
    const legend = this.doc.createElement('legend');
    legend.textContent = SLOT_LABELS[slot];
    const summary = this.doc.createElement('p');
    summary.className = 'message';
    summary.id = `route-summary-${slot}`;
    const { text, tone } = this.routeSummary(slot);
    summary.textContent = text;
    summary.dataset.tone = tone;

    const keyLabel = this.doc.createElement('label');
    keyLabel.className = 'stack';
    keyLabel.htmlFor = `route-key-${slot}`;
    keyLabel.textContent = 'API key';
    const select = this.doc.createElement('select');
    select.id = `route-key-${slot}`;
    const none = this.doc.createElement('option');
    none.value = '';
    none.textContent =
      slot === 'default' ? '— None —' : 'Use the default route';
    select.append(none);
    const known = new Set<string>();
    for (const profile of this.store.profiles) {
      known.add(profile.id);
      const option = this.doc.createElement('option');
      option.value = profile.id;
      option.textContent = `${profile.label} (${providerName(profile.provider)})${profile.enabled ? '' : ' — disabled'}`;
      select.append(option);
    }
    if (draft.credentialId && !known.has(draft.credentialId)) {
      const option = this.doc.createElement('option');
      option.value = draft.credentialId;
      option.textContent = '(deleted key — choose another)';
      select.append(option);
    }
    select.value = draft.credentialId;
    keyLabel.append(select);

    const profile = this.store.profiles.find(
      (p) => p.id === draft.credentialId,
    );
    const modelLabel = this.doc.createElement('label');
    modelLabel.className = 'stack';
    modelLabel.htmlFor = `route-model-${slot}`;
    modelLabel.textContent = 'Model ID';
    const model = this.doc.createElement('input');
    model.id = `route-model-${slot}`;
    model.type = 'text';
    model.autocomplete = 'off';
    model.spellcheck = false;
    model.maxLength = 80;
    model.value = draft.modelId;
    model.hidden = !draft.credentialId;
    modelLabel.hidden = !draft.credentialId;
    const list = this.doc.createElement('datalist');
    list.id = `route-models-${slot}`;
    model.setAttribute('list', list.id);
    model.setAttribute('aria-describedby', `route-note-${slot}`);
    const suggestions = new Set<string>();
    if (profile) {
      for (const item of MODEL_CATALOG)
        if (item.provider === profile.provider) suggestions.add(item.id);
      for (const id of this.checks[profile.id]?.models ?? [])
        suggestions.add(id);
    }
    list.replaceChildren(
      ...[...suggestions].map((id) => {
        const option = this.doc.createElement('option');
        option.value = id;
        const reviewed = profile && catalogModel(profile.provider, id);
        if (reviewed) option.label = `${reviewed.label} — reviewed`;
        return option;
      }),
    );
    modelLabel.append(model, list);
    const note = this.doc.createElement('p');
    note.className = 'hint';
    note.id = `route-note-${slot}`;
    note.textContent = draft.credentialId
      ? this.modelNote(
          profile?.provider ?? null,
          draft.modelId,
          draft.credentialId,
        )
      : '';

    select.addEventListener('change', () => {
      const next = this.store.profiles.find((p) => p.id === select.value);
      // Another provider never inherits the previous model ID.
      const keep = next && profile && next.provider === profile.provider;
      this.drafts[slot] = {
        credentialId: select.value,
        modelId: keep ? draft.modelId : '',
      };
      this.render();
    });
    model.addEventListener('input', () => {
      this.drafts[slot] = { credentialId: select.value, modelId: model.value };
      note.textContent = this.modelNote(
        profile?.provider ?? null,
        model.value,
        select.value,
      );
    });

    const actions = this.doc.createElement('div');
    actions.className = 'actions';
    const dirty = slot in this.drafts;
    const save = this.button(
      'Save',
      `Save the ${SLOT_LABELS[slot]} route`,
      () => void this.saveRoute(slot),
    );
    save.className = 'primary';
    save.id = `route-save-${slot}`;
    const testing = this.busy.has(`route:${slot}`);
    const usable = this.routeSummary(slot).tone === 'ok';
    const test = this.button(
      testing ? 'Testing…' : 'Test (may be billed)',
      `Send one tiny test prompt through the saved ${SLOT_LABELS[slot]} route; may be billed`,
      () => void this.testRoute(slot),
      testing || dirty || !usable,
    );
    test.id = `route-test-${slot}`;
    test.setAttribute('aria-busy', String(testing));
    actions.append(save, test);
    if (dirty) {
      const cancel = this.button(
        'Cancel',
        `Discard changes to ${SLOT_LABELS[slot]}`,
        () => {
          delete this.drafts[slot];
          this.render();
        },
      );
      actions.append(cancel);
    }
    const message = this.doc.createElement('p');
    message.className = 'message';
    message.id = `route-message-${slot}`;
    message.setAttribute('aria-live', 'polite');
    const old = this.doc.getElementById(message.id);
    if (old) {
      message.textContent = old.textContent;
      message.dataset.tone = old.dataset.tone ?? 'neutral';
    }
    for (const node of [select, model]) node.disabled = !this.ready;
    box.append(legend, summary, keyLabel, modelLabel, note, actions, message);
    return box;
  }

  /** Today's requests per key, model and action (no text, no key). */
  private renderUsage() {
    const usage =
      this.usage.localDate === this.today()
        ? this.usage
        : emptyUsage(this.today());
    const rows: string[] = [];
    let attributed = 0;
    for (const [key, item] of Object.entries(usage.routes)) {
      const [provider, id, , model, task] = key.split('|');
      attributed += item.attempts;
      if (!item.attempts) continue;
      const profile = this.store.profiles.find((p) => p.id === id);
      const who = profile
        ? `${profile.label} (${isProviderId(provider) ? providerName(provider) : provider})`
        : 'deleted key';
      const action =
        task === 'test' ? 'Test' : (SLOT_LABELS[task as RouteSlot] ?? task);
      rows.push(
        `${action} → ${who} • ${model}: ${item.attempts} request(s), ${item.completed} answered, ${item.failed} failed, ${item.unknown} unknown · ${item.inputTokens} in / ${item.outputTokens} out tokens`,
      );
    }
    const legacy = usage.testAttempts - attributed;
    if (legacy > 0)
      rows.push(`Before V5.7 (not attributed): ${legacy} request(s)`);
    if (usage.unknown)
      rows.push(
        `${usage.unknown} request(s) were sent but their answer was lost: they may be billed.`,
      );
    this.el('usage-routes').replaceChildren(
      ...rows.map((text) => {
        const item = this.doc.createElement('li');
        item.textContent = text;
        return item;
      }),
    );
  }
}
