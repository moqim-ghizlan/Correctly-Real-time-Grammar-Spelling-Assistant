// 5.14 "Synchronisation" page. This page writes only this computer's
// choices (correctly.v5.syncPrefs); everything that touches storage.sync or
// the passphrase goes to the worker as a message. The passphrase is never
// stored or shown here, and the inputs are emptied after each attempt.
import type { Locale } from '../shared/locale';
import type { StorageArea } from '../shared/storage';
import {
  SYNC_CLEAR,
  SYNC_DOMAINS,
  SYNC_NOW,
  SYNC_PASSPHRASE,
  SYNC_PREFS_KEY,
  SYNC_RESOLVE,
  SYNC_RESTORE,
  SYNC_STATE_KEY,
  normalizeSyncPrefs,
  normalizeSyncState,
  type SyncDomain,
  type SyncErrorCode,
  type SyncPrefs,
  type SyncReply,
  type SyncRequest,
  type SyncState,
} from '../shared/sync';
import { OPTIONS, type SyncMessages } from './messages';
import type { Tone } from './settings-ui';

export interface SyncDeps {
  area: StorageArea;
  /** chrome.runtime.sendMessage to the worker. */
  send: (message: SyncRequest) => Promise<unknown>;
  confirm: (question: string, action: string) => Promise<boolean>;
  locale?: Locale;
}

/** The worker's reply, rebuilt field by field (anything else = storage error). */
function toReply(value: unknown): SyncReply {
  const data =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  if (data.ok === true) return { ok: true };
  return {
    ok: false,
    code:
      typeof data.code === 'string' && data.code in OPTIONS.en.sync.error
        ? (data.code as SyncErrorCode)
        : 'storage',
  };
}

export class SyncSection {
  private prefs: SyncPrefs = normalizeSyncPrefs(undefined);
  private state: SyncState = normalizeSyncState(undefined);
  private busy = false;
  /** Locked, but the user chose a new passphrase instead of unlocking. */
  private replacing = false;
  private readonly m: SyncMessages;
  private readonly locale: Locale;

  constructor(
    private readonly doc: Document,
    private readonly deps: SyncDeps,
  ) {
    this.locale = deps.locale ?? 'fr';
    this.m = OPTIONS[this.locale].sync;
  }

  private el<T extends HTMLElement>(id: string): T {
    const node = this.doc.getElementById(id);
    if (!node) throw new Error('Missing element #' + id);
    return node as T;
  }

  private say(id: string, text: string, tone: Tone = 'neutral') {
    const node = this.el(id);
    node.textContent = text;
    node.dataset.tone = tone;
  }

  async init(): Promise<void> {
    this.el<HTMLInputElement>('sync-enabled').addEventListener(
      'change',
      () => void this.savePrefs(),
    );
    for (const domain of SYNC_DOMAINS)
      this.el<HTMLInputElement>(`sync-${domain}`).addEventListener(
        'change',
        () => void this.savePrefs(),
      );
    this.el('sync-now').addEventListener('click', () => void this.syncNow());
    this.el('sync-pass-form').addEventListener('submit', (event) => {
      event.preventDefault();
      void this.passphrase();
    });
    this.el('sync-pass-replace').addEventListener('click', () => {
      this.replacing = true;
      this.render();
      this.el('sync-pass').focus();
    });
    this.el('sync-clear').addEventListener('click', () => void this.clear());
    await this.reload();
  }

  onStorageChanged(keys: string[]): void {
    if (keys.includes(SYNC_PREFS_KEY) || keys.includes(SYNC_STATE_KEY))
      void this.reload();
  }

  async reload(): Promise<void> {
    try {
      const data = await this.deps.area.get([SYNC_PREFS_KEY, SYNC_STATE_KEY]);
      this.prefs = normalizeSyncPrefs(data[SYNC_PREFS_KEY]);
      this.state = normalizeSyncState(data[SYNC_STATE_KEY]);
    } catch {
      this.say('sync-message', this.m.error.storage, 'error');
    }
    this.render();
  }

  private async request(message: SyncRequest): Promise<SyncReply> {
    try {
      return toReply(await this.deps.send(message));
    } catch {
      return { ok: false, code: 'storage' };
    }
  }

  /** This page is the only writer of the prefs. */
  private async savePrefs(): Promise<void> {
    const enabled = this.el<HTMLInputElement>('sync-enabled').checked;
    const next = normalizeSyncPrefs({
      enabled,
      domains: Object.fromEntries(
        SYNC_DOMAINS.map((d) => [
          d,
          this.el<HTMLInputElement>(`sync-${d}`).checked,
        ]),
      ),
    });
    try {
      await this.deps.area.set({ [SYNC_PREFS_KEY]: next });
      if (next.enabled !== this.prefs.enabled)
        this.say('sync-message', next.enabled ? this.m.on : this.m.off, 'ok');
      this.prefs = next;
    } catch {
      this.say('sync-message', this.m.error.storage, 'error');
    }
    this.render();
  }

  private async run(
    message: SyncRequest,
    target: string,
    success: string,
  ): Promise<boolean> {
    if (this.busy) return false;
    this.busy = true;
    this.render();
    const reply = await this.request(message);
    this.busy = false;
    if (reply.ok) this.say(target, success, 'ok');
    else this.say(target, this.m.error[reply.code], 'error');
    await this.reload();
    return reply.ok;
  }

  private syncNow() {
    return this.run({ type: SYNC_NOW }, 'sync-message', this.m.done);
  }

  private async passphrase(): Promise<void> {
    const first = this.el<HTMLInputElement>('sync-pass');
    const second = this.el<HTMLInputElement>('sync-pass2');
    const locked = this.state.domains.keys.status === 'locked';
    const mode = locked && !this.replacing ? 'unlock' : 'replace';
    const passphrase = first.value;
    const confirmation = second.value;
    first.value = '';
    second.value = '';
    this.replacing = false;
    // Unlocking checks against the synced keys; a new passphrase is typed twice.
    if (mode === 'replace' && passphrase !== confirmation) {
      this.say('sync-pass-message', this.m.passMismatch, 'error');
      this.render();
      return;
    }
    if (
      locked &&
      mode === 'replace' &&
      !(await this.deps.confirm(this.m.confirmReplace, this.m.replaceAction))
    ) {
      this.render();
      return;
    }
    await this.run(
      { type: SYNC_PASSPHRASE, passphrase, mode },
      'sync-pass-message',
      mode === 'unlock' ? this.m.unlocked : this.m.passSaved,
    );
  }

  private async clear(): Promise<void> {
    if (!(await this.deps.confirm(this.m.confirmClear, this.m.clearAction)))
      return;
    // Off first, so this computer does not send everything again.
    const next = normalizeSyncPrefs({ ...this.prefs, enabled: false });
    try {
      await this.deps.area.set({ [SYNC_PREFS_KEY]: next });
      this.prefs = next;
    } catch {
      this.say('sync-clear-message', this.m.error.storage, 'error');
      return;
    }
    await this.run({ type: SYNC_CLEAR }, 'sync-clear-message', this.m.cleared);
  }

  private button(label: string, onClick: () => void, ghost = false) {
    const button = this.doc.createElement('button');
    button.type = 'button';
    if (ghost) button.className = 'ghost';
    button.textContent = label;
    button.disabled = this.busy;
    button.addEventListener('click', onClick);
    return button;
  }

  private statusText(domain: SyncDomain): string {
    const item = this.state.domains[domain];
    if (!this.prefs.enabled || !this.prefs.domains[domain])
      return this.m.status.off;
    if (item.status === 'error' && item.code) return this.m.error[item.code];
    if (item.status === 'synced' && item.syncedAt)
      return this.m.syncedAt(
        new Date(item.syncedAt).toLocaleTimeString(this.locale, {
          hour: '2-digit',
          minute: '2-digit',
        }),
      );
    return this.m.status[item.status];
  }

  render(): void {
    const on = this.prefs.enabled;
    const enabled = this.el<HTMLInputElement>('sync-enabled');
    enabled.checked = on;
    enabled.disabled = this.busy;
    for (const domain of SYNC_DOMAINS) {
      const box = this.el<HTMLInputElement>(`sync-${domain}`);
      box.checked = this.prefs.domains[domain];
      box.disabled = !on || this.busy;
      const item = this.state.domains[domain];
      const active = on && this.prefs.domains[domain];
      const status = this.el(`sync-status-${domain}`);
      status.textContent = this.statusText(domain);
      status.dataset.tone =
        item.status === 'error' && active
          ? 'error'
          : item.status === 'synced' && active
            ? 'ok'
            : 'neutral';
      const actions = this.el(`sync-actions-${domain}`);
      actions.replaceChildren();
      if (active && item.status === 'choose')
        actions.append(
          this.button(this.m.keepLocal, () => this.resolve(domain, 'local')),
          this.button(
            this.m.keepRemote,
            () => this.resolve(domain, 'remote'),
            true,
          ),
        );
      if (item.replaced) {
        const note = this.doc.createElement('span');
        note.textContent = this.m.replaced;
        actions.append(
          note,
          this.button(
            this.m.restore,
            () =>
              void this.run(
                { type: SYNC_RESTORE, domain },
                'sync-message',
                this.m.restored,
              ),
            true,
          ),
        );
      }
      actions.hidden = !actions.childElementCount;
    }
    const usage = this.el('sync-usage');
    usage.textContent = on
      ? this.m.usage(Math.ceil(this.state.bytesInUse / 1024))
      : '';
    this.el<HTMLButtonElement>('sync-now').disabled = !on || this.busy;
    this.el<HTMLButtonElement>('sync-clear').disabled = this.busy;

    // Passphrase form: unlock (keys synced by another computer) or set.
    const keysOn = on && this.prefs.domains.keys;
    const locked =
      keysOn && this.state.domains.keys.status === 'locked' && !this.replacing;
    const hasSecret =
      keysOn &&
      this.state.domains.keys.status !== 'locked' &&
      this.state.domains.keys.status !== 'needsPassphrase' &&
      this.state.domains.keys.status !== 'off';
    for (const id of ['sync-pass', 'sync-pass2'])
      this.el<HTMLInputElement>(id).disabled = !keysOn || this.busy;
    this.el('sync-pass2-row').hidden = locked;
    const submit = this.el<HTMLButtonElement>('sync-pass-submit');
    submit.textContent = locked
      ? this.m.passUnlock
      : hasSecret
        ? this.m.passChange
        : this.m.passSet;
    submit.disabled = !keysOn || this.busy;
    const replace = this.el<HTMLButtonElement>('sync-pass-replace');
    replace.textContent = this.m.passReplace;
    replace.hidden = !locked;
    replace.disabled = this.busy;
    const hint = this.el('sync-pass-message');
    if (!keysOn && !hint.dataset.tone?.match(/ok|error/))
      this.say('sync-pass-message', this.m.passNeedsDomain);
    else if (keysOn && hint.textContent === this.m.passNeedsDomain)
      this.say('sync-pass-message', '');
  }

  private resolve(domain: SyncDomain, keep: 'local' | 'remote') {
    void this.run(
      { type: SYNC_RESOLVE, domain, keep },
      'sync-message',
      this.m.resolved,
    );
  }
}
