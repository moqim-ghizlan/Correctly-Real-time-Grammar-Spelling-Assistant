import {
  MAX_BACKUP_BYTES,
  MAX_SHORTCUTS,
  SHORTCUTS_KEY,
  ShortcutError,
  addShortcut,
  applyImport,
  canonical,
  emptyStore,
  exportBackup,
  loadShortcuts,
  mutateShortcuts,
  parseBackup,
  planImport,
  removeShortcut,
  setExpansion,
  updateShortcut,
  type ImportPlan,
  type ImportPolicy,
  type ShortcutRecord,
  type ShortcutStore,
} from '../shared/shortcuts';
import type { StorageArea } from '../shared/storage';
import { COMMON, type CommonMessages } from '../shared/i18n';
import type { Locale } from '../shared/locale';
import { OPTIONS, type OptionsMessages } from './messages';
import type { Tone } from './settings-ui';

// V5.6 "Text shortcuts" settings: local CRUD, search, JSON backup/restore.
// Nothing here touches the network or the Gemini key.

export interface ShortcutsDeps {
  area: StorageArea;
  confirm: (question: string) => boolean;
  /** Asks Chrome for all-sites access (needed to expand while typing). */
  requestSiteAccess: () => Promise<boolean>;
  hasSiteAccess: () => Promise<boolean>;
  /** Removes all-sites access when neither the smart button nor shortcuts need it. */
  releaseSiteAccess: () => Promise<void>;
  download: (filename: string, text: string) => void;
  now?: () => Date;
  /** 5.13: language of this page (French when absent). */
  locale?: Locale;
}

export class ShortcutsSection {
  private store: ShortcutStore = emptyStore();
  private access = false;
  private editing: ShortcutRecord | null = null;
  private incoming: ShortcutRecord[] | null = null;
  private plan: ImportPlan | null = null;
  private busy = false;

  private readonly m: OptionsMessages;
  private readonly c: CommonMessages;

  constructor(
    private readonly doc: Document,
    private readonly deps: ShortcutsDeps,
  ) {
    this.m = OPTIONS[deps.locale ?? 'fr'];
    this.c = COMMON[deps.locale ?? 'fr'];
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

  async init(): Promise<void> {
    this.bind();
    await this.reload();
  }

  async reload(): Promise<void> {
    try {
      const [loaded, access] = await Promise.all([
        loadShortcuts(this.deps.area),
        this.deps.hasSiteAccess().catch(() => false),
      ]);
      this.store = loaded.store;
      this.access = access;
      if (loaded.damaged)
        this.message('shortcuts-status', this.m.shortcutsDamaged, 'error');
      else if (loaded.origin === 'v4')
        this.message(
          'shortcuts-status',
          this.m.v4Found(loaded.store.shortcuts.length),
          'info',
        );
      this.setEnabled(!loaded.damaged);
    } catch {
      this.message('shortcuts-status', this.c.error('STORAGE_ERROR'), 'error');
      this.setEnabled(false);
    }
    this.render();
  }

  onStorageChanged(keys: string[]): void {
    if (keys.includes(SHORTCUTS_KEY)) void this.reload();
  }

  private setEnabled(enabled: boolean) {
    for (const id of [
      'shortcuts-enabled',
      'shortcut-trigger',
      'shortcut-replacement',
      'shortcut-entry-enabled',
      'shortcut-protect-trigger',
      'shortcut-protect-replacement',
      'shortcut-save',
      'shortcut-search',
      'shortcut-export',
      'shortcut-import',
    ])
      this.el<HTMLInputElement>(id).disabled = !enabled;
  }

  private bind() {
    this.el<HTMLInputElement>('shortcuts-enabled').addEventListener(
      'change',
      () => void this.toggleExpansion(),
    );
    this.el<HTMLFormElement>('shortcut-form').addEventListener(
      'submit',
      (event) => {
        event.preventDefault();
        void this.save();
      },
    );
    this.el('shortcut-cancel').addEventListener('click', () =>
      this.resetForm(),
    );
    this.el('shortcut-search').addEventListener('input', () => this.render());
    this.el('shortcut-export').addEventListener('click', () => this.export());
    this.el<HTMLInputElement>('shortcut-import').addEventListener(
      'change',
      () => {
        const file = this.el<HTMLInputElement>('shortcut-import').files?.[0];
        if (file) void this.importFile(file);
      },
    );
    for (const radio of this.doc.querySelectorAll<HTMLInputElement>(
      'input[name="import-policy"]',
    ))
      radio.addEventListener('change', () => this.preview());
    this.el('import-confirm').addEventListener(
      'click',
      () => void this.confirmImport(),
    );
    this.el('import-cancel').addEventListener('click', () =>
      this.closeImport(),
    );
  }

  /** The one way this page writes shortcuts (serialized, verified). */
  private async run(
    change: (store: ShortcutStore) => ShortcutStore,
    done: string,
    messageId = 'shortcut-message',
  ): Promise<boolean> {
    if (this.busy) return false;
    this.busy = true;
    try {
      this.store = await mutateShortcuts(this.deps.area, change);
      this.message(messageId, done, 'ok');
      return true;
    } catch (error) {
      this.message(
        messageId,
        error instanceof ShortcutError
          ? this.m.shortcutError(error.code, error.params)
          : this.c.error('STORAGE_ERROR'),
        'error',
      );
      // Show what is really stored now (e.g. after a conflict).
      await this.reload().catch(() => undefined);
      return false;
    } finally {
      this.busy = false;
      this.render();
    }
  }

  async toggleExpansion(): Promise<void> {
    const box = this.el<HTMLInputElement>('shortcuts-enabled');
    if (box.checked) {
      // The permission prompt must come first, while the click counts.
      this.access = await this.deps.requestSiteAccess().catch(() => false);
      if (!this.access) {
        box.checked = false;
        this.message('shortcuts-status', this.m.shortcutsNoAccess, 'error');
        return;
      }
      await this.run(
        setExpansion(true),
        this.m.shortcutsOn,
        'shortcuts-status',
      );
    } else if (
      await this.run(
        setExpansion(false),
        this.m.shortcutsOff,
        'shortcuts-status',
      )
    )
      await this.deps.releaseSiteAccess().catch(() => undefined);
  }

  private draft() {
    return {
      trigger: this.el<HTMLInputElement>('shortcut-trigger').value,
      replacement: this.el<HTMLTextAreaElement>('shortcut-replacement').value,
      enabled: this.el<HTMLInputElement>('shortcut-entry-enabled').checked,
      protectTriggerInAi: this.el<HTMLInputElement>('shortcut-protect-trigger')
        .checked,
      protectReplacementInAi: this.el<HTMLInputElement>(
        'shortcut-protect-replacement',
      ).checked,
    };
  }

  async save(): Promise<void> {
    const draft = this.draft();
    const editing = this.editing;
    const ok = await this.run(
      editing ? updateShortcut(editing, draft) : addShortcut(draft),
      editing
        ? this.m.shortcutUpdated
        : this.m.shortcutSaved(draft.trigger.trim()),
    );
    // On error the form keeps what the user typed.
    if (ok) this.resetForm();
  }

  edit(entry: ShortcutRecord): void {
    this.editing = entry;
    this.el<HTMLInputElement>('shortcut-trigger').value = entry.trigger;
    this.el<HTMLTextAreaElement>('shortcut-replacement').value =
      entry.replacement;
    this.el<HTMLInputElement>('shortcut-entry-enabled').checked = entry.enabled;
    this.el<HTMLInputElement>('shortcut-protect-trigger').checked =
      entry.protectTriggerInAi;
    this.el<HTMLInputElement>('shortcut-protect-replacement').checked =
      entry.protectReplacementInAi;
    this.el('shortcut-save').textContent = this.m.saveChanges;
    this.el('shortcut-cancel').hidden = false;
    this.el('shortcut-trigger').focus();
  }

  private resetForm() {
    this.editing = null;
    this.el<HTMLFormElement>('shortcut-form').reset();
    this.el('shortcut-save').textContent = this.m.addShortcut;
    this.el('shortcut-cancel').hidden = true;
  }

  async toggle(entry: ShortcutRecord): Promise<void> {
    await this.run(
      updateShortcut(entry, { enabled: !entry.enabled }),
      this.m.shortcutToggled(entry.trigger, !entry.enabled),
    );
  }

  async remove(entry: ShortcutRecord): Promise<void> {
    if (!this.deps.confirm(this.m.confirmDeleteShortcut(entry.trigger))) return;
    if (this.editing?.id === entry.id) this.resetForm();
    await this.run(
      removeShortcut(entry),
      this.m.shortcutDeleted(entry.trigger),
    );
  }

  export(): void {
    const date = (this.deps.now?.() ?? new Date()).toISOString().slice(0, 10);
    this.deps.download(
      `correctly-shortcuts-${date}.json`,
      exportBackup(this.store, this.deps.now?.()),
    );
    this.message('import-message', this.m.backupDone, 'ok');
  }

  /** Validates the file in memory and shows a preview; writes nothing. */
  async importFile(file: File): Promise<void> {
    this.closeImport();
    try {
      if (file.size > MAX_BACKUP_BYTES) throw new ShortcutError('fileTooLarge');
      // FileReader works everywhere (incl. older engines without Blob.text).
      const content = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () =>
          resolve(typeof reader.result === 'string' ? reader.result : '');
        reader.onerror = () => reject(new Error('read failed'));
        reader.readAsText(file);
      });
      this.incoming = parseBackup(content);
      this.el('import-preview').hidden = false;
      this.preview();
    } catch (error) {
      this.message(
        'import-message',
        `${error instanceof ShortcutError ? this.m.shortcutError(error.code, error.params) : this.m.fileUnreadable} ${this.m.nothingModified}`,
        'error',
      );
    }
  }

  private policy(): ImportPolicy {
    const value = this.doc.querySelector<HTMLInputElement>(
      'input[name="import-policy"]:checked',
    )?.value;
    return value === 'overwrite' || value === 'replaceAll' ? value : 'skip';
  }

  preview(): void {
    if (!this.incoming) return;
    try {
      this.plan = planImport(this.store, this.incoming, this.policy());
      const { added, identical, conflicts, removed, policy } = this.plan;
      this.el('import-summary').textContent = this.m.importSummary({
        total: this.incoming.length,
        added,
        identical,
        conflicts,
        policy,
        removed,
      });
      this.el<HTMLButtonElement>('import-confirm').disabled = false;
    } catch (error) {
      this.plan = null;
      this.el('import-summary').textContent =
        error instanceof ShortcutError
          ? this.m.shortcutError(error.code, error.params)
          : this.m.invalidImport;
      this.el<HTMLButtonElement>('import-confirm').disabled = true;
    }
  }

  async confirmImport(): Promise<void> {
    const plan = this.plan;
    if (!plan) return;
    if (
      plan.policy === 'replaceAll' &&
      !this.deps.confirm(
        this.m.confirmReplaceAll(plan.next.length, plan.removed),
      )
    )
      return;
    if (
      await this.run(
        applyImport(plan),
        this.m.importDone(
          plan.added,
          plan.policy === 'skip' ? null : plan.conflicts,
          plan.removed,
        ),
        'import-message',
      )
    )
      this.closeImport();
    else this.preview();
  }

  private closeImport() {
    this.incoming = null;
    this.plan = null;
    this.el('import-preview').hidden = true;
    this.el<HTMLInputElement>('shortcut-import').value = '';
  }

  render(): void {
    const { store } = this;
    this.el<HTMLInputElement>('shortcuts-enabled').checked =
      store.enabled && this.access;
    this.el('shortcut-count').textContent =
      `${store.shortcuts.length} / ${MAX_SHORTCUTS}`;
    const query = this.el<HTMLInputElement>('shortcut-search')
      .value.trim()
      .toLowerCase();
    const list = this.el('shortcut-list');
    const shown = [...store.shortcuts]
      .sort((a, b) => canonical(a.trigger).localeCompare(canonical(b.trigger)))
      .filter(
        (s) =>
          !query ||
          canonical(s.trigger).includes(query) ||
          s.replacement.toLowerCase().includes(query),
      );
    list.replaceChildren(
      ...shown.map((entry) => {
        const row = this.doc.createElement('li');
        const trigger = this.doc.createElement('code');
        trigger.textContent = entry.trigger;
        const preview = this.doc.createElement('span');
        preview.className = 'replacement';
        const flat = entry.replacement.replace(/\r?\n/g, ' ⏎ ');
        preview.textContent = flat.length > 80 ? flat.slice(0, 79) + '…' : flat;
        const tags = this.doc.createElement('span');
        tags.className = 'hint';
        tags.textContent = [
          entry.enabled ? '' : this.m.tags.off,
          entry.protectTriggerInAi ? this.m.tags.protected : '',
          entry.protectReplacementInAi ? this.m.tags.replacementProtected : '',
        ]
          .filter(Boolean)
          .join(' · ');
        const button = (label: string, aria: string, action: () => void) => {
          const node = this.doc.createElement('button');
          node.type = 'button';
          node.className = 'ghost';
          node.textContent = label;
          node.setAttribute('aria-label', aria);
          node.addEventListener('click', action);
          return node;
        };
        row.append(
          trigger,
          preview,
          tags,
          button(this.m.edit, `${this.m.edit} ${entry.trigger}`, () =>
            this.edit(entry),
          ),
          button(
            entry.enabled ? this.m.disable : this.m.enable,
            `${entry.enabled ? this.m.disable : this.m.enable} ${entry.trigger}`,
            () => void this.toggle(entry),
          ),
          button(
            this.m.remove,
            `${this.m.remove} ${entry.trigger}`,
            () => void this.remove(entry),
          ),
        );
        return row;
      }),
    );
    this.el('shortcut-empty').hidden = store.shortcuts.length > 0;
    this.el<HTMLButtonElement>('shortcut-save').disabled =
      !this.editing && store.shortcuts.length >= MAX_SHORTCUTS;
  }
}
