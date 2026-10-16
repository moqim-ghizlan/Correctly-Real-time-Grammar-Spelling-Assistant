import {
  TEST_CONNECTION,
  TEST_KEY,
  toConnectionResult,
  toKeyCheckResult,
} from '../shared/contracts';
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
import type { StorageArea } from '../shared/storage';
import {
  SLOT_FR as SLOT_LABELS,
  dateHeure,
  decrireNote as describeNote,
  erreur as errorMessage,
} from './fr';
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
  uiTimeoutMs?: number;
}

const time = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : dateHeure(date);
};

const providerName = (provider: ProviderId) => PROVIDERS[provider].label;

type Draft = { credentialId: string; modelId: string };

export class ProvidersSection {
  private store: ProviderStore = emptyProviders();
  private checks: Record<string, KeyCheck> = {};
  private editing: ProviderProfile | null = null;
  private readonly drafts: Partial<Record<RouteSlot, Draft>> = {};
  /** Actions in progress ("key:<id>", "route:<slot>"): one at a time each. */
  private readonly busy = new Set<string>();
  private ready = false;

  constructor(
    private readonly doc: Document,
    private readonly deps: ProvidersDeps,
  ) {}

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
      const [loaded, checks] = await Promise.all([
        loadProfiles(area),
        area.get([CHECKS_KEY]),
      ]);
      this.store = loaded.store;
      this.checks = parseChecks(checks[CHECKS_KEY]);
      this.ready = !loaded.damaged;
      if (loaded.damaged)
        this.message(
          'providers-status',
          'Les réglages des fournisseurs IA enregistrés sont endommagés. Ils n’ont pas été modifiés ; aucune requête IA ne peut être envoyée.',
          'error',
        );
      else if (loaded.dropped)
        this.message(
          'providers-status',
          `${loaded.dropped} clé(s) enregistrée(s) invalide(s) ignorée(s). Ajoutez-les à nouveau si besoin.`,
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
      [PROVIDERS_KEY, SECRETS_KEY, CHECKS_KEY].some((key) => keys.includes(key))
    )
      void this.reload();
  }

  /** Called on navigation/visibility change: never leave a key revealed. */
  hideKey(clear = false): void {
    this.keyInput.type = 'password';
    if (clear) this.keyInput.value = '';
    const toggle = this.el<HTMLButtonElement>('profile-toggle');
    toggle.textContent = 'Afficher';
    toggle.setAttribute('aria-pressed', 'false');
    toggle.setAttribute('aria-label', 'Afficher la clé API saisie');
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
      toggle.textContent = 'Masquer';
      toggle.setAttribute('aria-pressed', 'true');
      toggle.setAttribute('aria-label', 'Masquer la clé API saisie');
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
    this.el('profile-form-title').textContent = 'Ajouter une clé API';
    this.el('profile-save').textContent = 'Enregistrer la clé';
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
    this.keyInput.placeholder = 'Laisser vide pour garder la clé enregistrée';
    this.el('profile-form-title').textContent = `Modifier « ${profile.label} »`;
    this.el('profile-save').textContent = 'Enregistrer les modifications';
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
          'Clé enregistrée. Rien n’a été envoyé. Utilisez « Vérifier » pour la tester, puis choisissez-la ci-dessous pour vos actions.',
          'profile-message',
        )
      )
        this.resetForm();
      return;
    }
    if (
      key.trim() &&
      !this.deps.confirm(
        `Remplacer la clé enregistrée de « ${editing.label} » ? L’ancienne clé est supprimée de Correctly et les vérifications précédentes ne s’appliquent plus.`,
      )
    ) {
      this.message('profile-message', 'Rien n’a changé.');
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
          ? 'Clé remplacée. Rien n’a été envoyé ; vérifiez-la à nouveau.'
          : 'Modifications enregistrées.',
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
        `Désactiver « ${profile.label} » ? ${used.map((s) => SLOT_LABELS[s]).join(', ')} cessera de fonctionner jusqu’à ce que vous la réactiviez ou choisissiez une autre clé — aucune autre clé n’est utilisée automatiquement.`,
      )
    )
      return;
    await this.run(
      setProfileEnabled(profile, !profile.enabled, this.deps.now?.()),
      `« ${profile.label} » ${profile.enabled ? 'désactivée' : 'activée'}.`,
      'profile-message',
    );
  }

  private async remove(profile: ProviderProfile): Promise<void> {
    const used = slotsUsing(this.store, profile.id);
    const impact = used.length
      ? ` ${used.map((s) => SLOT_LABELS[s]).join(', ')} cessera de fonctionner jusqu’à ce que vous choisissiez une autre clé — aucune autre clé n’est utilisée automatiquement.`
      : '';
    if (
      !this.deps.confirm(
        `Supprimer « ${profile.label} » et retirer sa clé de ce profil de navigateur ?${impact} Une requête déjà envoyée peut encore être facturée.`,
      )
    )
      return;
    if (this.editing?.id === profile.id) this.resetForm();
    await this.run(
      deleteProfile(profile),
      `« ${profile.label} » supprimée.`,
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
          ? `« ${profile.label} » acceptée par ${providerName(profile.provider)} : ${result.models} modèle(s) de texte listé(s). Cela prouve l’accès, pas qu’un modèle répondra.`
          : `« ${profile.label} » : ${errorMessage(result.code)}`,
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
          ? `${SLOT_LABELS[slot]} : route enregistrée. Les requêtes déjà en cours gardent leur route ; la suivante utilise celle-ci.`
          : slot === 'default'
            ? 'Route par défaut supprimée. Les actions réglées sur « Utiliser la route par défaut » sont maintenant bloquées.'
            : `${SLOT_LABELS[slot]} utilise maintenant la route par défaut.`,
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
        `Envoyer un tout petit message de test (« Reply with OK only. », aucun texte de page) par la route enregistrée « ${SLOT_LABELS[slot]} » ? Il compte comme une requête dans vos limites d’usage et peut être facturé par le fournisseur.`,
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
          ? ` Tokens déclarés : ${result.usage.inputTokens ?? '?'} en entrée / ${result.usage.outputTokens ?? '?'} en sortie.`
          : '';
        this.message(
          `route-message-${slot}`,
          `Le modèle a répondu — ${providerName(result.provider)} • ${result.model} a répondu « ${result.sample} » le ${time(result.checkedAt)}.${usage}`,
          'ok',
        );
      } else
        this.message(
          `route-message-${slot}`,
          `${errorMessage(result.code)}${result.httpStatus ? ` (HTTP ${result.httpStatus})` : ''}${result.quota ? ` ${describeNote(result.quota)}` : ''}`,
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
    const via = own || slot === 'default' ? '' : ' (par défaut)';
    if (!route)
      return {
        text:
          slot === 'default'
            ? 'Aucune route par défaut : les actions réglées sur « Utiliser la route par défaut » sont bloquées.'
            : 'À configurer : aucune route par défaut n’est définie.',
        tone: 'error',
      };
    const profile = this.store.profiles.find(
      (p) => p.id === route.credentialId,
    );
    if (!profile)
      return {
        text: `À configurer${via} : la clé choisie a été supprimée. Aucune autre clé n’est utilisée.`,
        tone: 'error',
      };
    const target = `${profile.label} (${providerName(profile.provider)}) • ${route.modelId}`;
    if (!profile.enabled)
      return {
        text: `Bloquée${via} : « ${profile.label} » est désactivée. Aucune autre clé n’est utilisée.`,
        tone: 'error',
      };
    const status = modelStatus(profile.provider, route.modelId);
    if (status === 'invalid' || status === 'mismatch')
      return {
        text: `À configurer${via} : le modèle enregistré n’est pas valide pour ${providerName(profile.provider)}.`,
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
        ? 'Identifiant de modèle invalide.'
        : 'Choisissez ou saisissez un identifiant de modèle.';
    if (status === 'mismatch')
      return `Ce n’est pas un modèle ${providerName(provider)}.`;
    const listed = this.checks[credentialId]?.models ?? [];
    const notListed =
      listed.length && !listed.includes(modelId.trim())
        ? ' Il n’était pas dans la dernière liste de modèles de cette clé.'
        : '';
    if (status === 'reviewed')
      return `${catalogModel(provider, modelId.trim())?.note ?? ''}${notListed}`;
    return `Non vérifié par Correctly : il doit gérer la sortie JSON structurée. Chaque réponse reste contrôlée strictement ; si le modèle ne peut pas suivre, la requête échoue — rien d’autre n’est essayé.${notListed}`;
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
    link.textContent = `Créer une clé dans ${PROVIDERS[provider].keysSite}`;
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
          profile.enabled ? 'Activée' : 'Désactivée',
          !current
            ? 'Non vérifiée'
            : check.ok
              ? `Acceptée le ${time(check.checkedAt)} (${check.models.length} modèles)`
              : `Échec de la vérification le ${time(check.checkedAt)} : ${check.errorCode ? errorMessage(check.errorCode) : ''}`,
          used.length
            ? `Utilisée par : ${used.join(', ')}`
            : 'Utilisée par aucune action',
        ].join(' · ');
        const checking = this.busy.has(`key:${profile.id}`);
        const checkButton = this.button(
          checking ? 'Vérification…' : 'Vérifier',
          `Vérifier la clé « ${profile.label} » (gratuit, n’envoie aucun texte)`,
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
            'Modifier',
            `Renommer ou remplacer la clé « ${profile.label} »`,
            () => this.edit(profile),
          ),
          this.button(
            profile.enabled ? 'Désactiver' : 'Activer',
            `${profile.enabled ? 'Désactiver' : 'Activer'} « ${profile.label} »`,
            () => void this.toggle(profile),
          ),
          this.button(
            'Supprimer',
            `Supprimer « ${profile.label} »`,
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
    keyLabel.textContent = 'Clé API';
    const select = this.doc.createElement('select');
    select.id = `route-key-${slot}`;
    const none = this.doc.createElement('option');
    none.value = '';
    none.textContent =
      slot === 'default' ? '— Aucune —' : 'Utiliser la route par défaut';
    select.append(none);
    const known = new Set<string>();
    for (const profile of this.store.profiles) {
      known.add(profile.id);
      const option = this.doc.createElement('option');
      option.value = profile.id;
      option.textContent = `${profile.label} (${providerName(profile.provider)})${profile.enabled ? '' : ' — désactivée'}`;
      select.append(option);
    }
    if (draft.credentialId && !known.has(draft.credentialId)) {
      const option = this.doc.createElement('option');
      option.value = draft.credentialId;
      option.textContent = '(clé supprimée — choisissez-en une autre)';
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
    modelLabel.textContent = 'Modèle';
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
        if (reviewed) option.label = `${reviewed.label} — vérifié`;
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
      'Enregistrer',
      `Enregistrer la route « ${SLOT_LABELS[slot]} »`,
      () => void this.saveRoute(slot),
    );
    save.className = 'primary';
    save.id = `route-save-${slot}`;
    const testing = this.busy.has(`route:${slot}`);
    const usable = this.routeSummary(slot).tone === 'ok';
    const test = this.button(
      testing ? 'Test en cours…' : 'Tester (peut être facturé)',
      `Envoyer un petit message de test par la route « ${SLOT_LABELS[slot]} » enregistrée ; peut être facturé`,
      () => void this.testRoute(slot),
      testing || dirty || !usable,
    );
    test.id = `route-test-${slot}`;
    test.setAttribute('aria-busy', String(testing));
    actions.append(save, test);
    if (dirty) {
      const cancel = this.button(
        'Annuler',
        `Annuler les modifications de « ${SLOT_LABELS[slot]} »`,
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
}
