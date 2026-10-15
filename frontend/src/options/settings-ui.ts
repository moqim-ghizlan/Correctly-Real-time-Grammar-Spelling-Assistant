import type { ConnectionResult } from '../shared/contracts';
import {
  errorMessage,
  isErrorCode,
  isRetryable,
  type ErrorCode,
} from '../shared/errors';
import { localDate } from '../shared/local-date';
import { GEMINI_MODELS, isAllowedModelId, modelLabel } from '../shared/models';
import { REWRITE_STYLES, normalizeStyleIds } from '../shared/rewrite';
import {
  emptyConnection,
  emptyUsage,
  parseDailyLimit,
  validateApiKey,
  DAILY_LIMIT_MAX,
  DAILY_LIMIT_MIN,
  type ConnectionRecord,
  type DailyUsageRecord,
  type V51Settings,
} from '../shared/settings';
import {
  STORAGE_KEYS,
  loadConnection,
  loadSettings,
  loadUsage,
  saveConnection,
  saveSettings,
  type StorageArea,
} from '../shared/storage';

export interface SettingsDeps {
  area: StorageArea;
  /** Sends TEST_CONNECTION to the service worker; carries no key. */
  sendTest: () => Promise<unknown>;
  confirm: (question: string) => boolean;
  /** Actual shortcut assigned by the browser ('' when none). */
  getShortcut?: () => Promise<string>;
  openShortcuts?: () => void;
  /** Requests all-sites access and registers the smart-button script. */
  enableSmartButton?: () => Promise<boolean>;
  /** Unregisters it, drops the access and removes open buttons. */
  disableSmartButton?: () => Promise<void>;
  today?: () => string;
  uiTimeoutMs?: number;
}

export type Tone = 'neutral' | 'ok' | 'error' | 'info';

export interface StatusView {
  label:
    | 'Not configured'
    | 'Configured'
    | 'Checking...'
    | 'Connected'
    | 'Connection failed';
  tone: Tone;
}

/** Connected/failed only describe the most recent test of the CURRENT key and model. */
export function statusFor(
  settings: V51Settings,
  connection: ConnectionRecord,
  testing: boolean,
): StatusView {
  if (testing) return { label: 'Checking...', tone: 'info' };
  if (!settings.gemini.apiKey)
    return { label: 'Not configured', tone: 'neutral' };
  const current =
    connection.lastCheckKeyRevision === settings.gemini.keyRevision &&
    connection.lastCheckModelId === settings.gemini.modelId;
  if (current && connection.lastCheckOk === true)
    return { label: 'Connected', tone: 'ok' };
  if (current && connection.lastCheckOk === false)
    return { label: 'Connection failed', tone: 'error' };
  return { label: 'Configured', tone: 'neutral' };
}

const failure = (code: ErrorCode): ConnectionResult => ({
  ok: false,
  code,
  message: errorMessage(code),
  retryable: isRetryable(code),
});

/** The worker's reply is untrusted input too: accept only the documented shapes. */
export function toConnectionResult(value: unknown): ConnectionResult {
  if (!value || typeof value !== 'object') return failure('UNKNOWN_ERROR');
  const data = value as Record<string, unknown>;
  if (
    data.ok === true &&
    data.provider === 'gemini' &&
    isAllowedModelId(data.model) &&
    typeof data.checkedAt === 'string' &&
    typeof data.sample === 'string'
  ) {
    const usage =
      data.usage && typeof data.usage === 'object'
        ? (data.usage as Record<string, unknown>)
        : null;
    const tokens = (item: unknown) =>
      typeof item === 'number' && Number.isSafeInteger(item) && item >= 0
        ? item
        : undefined;
    const input = tokens(usage?.inputTokens),
      output = tokens(usage?.outputTokens);
    return {
      ok: true,
      provider: 'gemini',
      model: data.model,
      checkedAt: data.checkedAt,
      sample: data.sample.slice(0, 40),
      ...(input === undefined && output === undefined
        ? {}
        : {
            usage: {
              ...(input === undefined ? {} : { inputTokens: input }),
              ...(output === undefined ? {} : { outputTokens: output }),
            },
          }),
    };
  }
  if (data.ok === false && isErrorCode(data.code)) {
    const status =
      typeof data.httpStatus === 'number' &&
      Number.isInteger(data.httpStatus) &&
      data.httpStatus >= 100 &&
      data.httpStatus <= 599
        ? data.httpStatus
        : undefined;
    return {
      ...failure(data.code),
      ...(status === undefined ? {} : { httpStatus: status }),
    };
  }
  return failure('UNKNOWN_ERROR');
}

const time = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
};

export class SettingsPage {
  private settings: V51Settings | null = null;
  private connection: ConnectionRecord = emptyConnection();
  private usage: DailyUsageRecord;
  private testing = false;
  private readonly today: () => string;

  constructor(
    private readonly doc: Document,
    private readonly deps: SettingsDeps,
  ) {
    this.today = deps.today ?? (() => localDate());
    this.usage = emptyUsage(this.today());
  }

  private el<T extends HTMLElement>(id: string): T {
    const node = this.doc.getElementById(id);
    if (!node) throw new Error('Missing element #' + id);
    return node as T;
  }

  private get keyInput() {
    return this.el<HTMLInputElement>('api-key');
  }

  async init(): Promise<void> {
    this.populateModels();
    this.populateStyles();
    this.bind();
    void this.renderShortcut();
    try {
      await this.reload();
      this.setControlsEnabled(true);
    } catch {
      this.message('key-message', errorMessage('STORAGE_ERROR'), 'error');
    } finally {
      this.el('app').setAttribute('aria-busy', 'false');
    }
  }

  /** Re-reads everything from storage (also used when another tab or the worker writes). */
  async reload(): Promise<void> {
    const { area } = this.deps;
    const [settings, connection, usage] = await Promise.all([
      loadSettings(area),
      loadConnection(area),
      loadUsage(area, this.today()),
    ]);
    this.settings = settings;
    this.connection = connection;
    this.usage = usage;
    this.render();
  }

  onStorageChanged(keys: string[]): void {
    const ours: string[] = Object.values(STORAGE_KEYS);
    if (keys.some((key) => ours.includes(key)))
      void this.reload().catch(() => undefined);
  }

  /** Called on navigation/visibility change: never leave a key revealed. */
  hideKey(clear = false): void {
    const input = this.keyInput;
    input.type = 'password';
    if (clear) input.value = '';
    const toggle = this.el<HTMLButtonElement>('toggle-key');
    toggle.textContent = 'Show';
    toggle.setAttribute('aria-pressed', 'false');
    toggle.setAttribute('aria-label', 'Show API key');
  }

  private populateModels() {
    const select = this.el<HTMLSelectElement>('model');
    select.replaceChildren(
      ...GEMINI_MODELS.map((model) => {
        const option = this.doc.createElement('option');
        option.value = model.id;
        option.textContent = `${model.label} (${model.id})`;
        return option;
      }),
    );
  }

  private populateStyles() {
    const fieldset = this.el('rewrite-styles');
    for (const style of REWRITE_STYLES) {
      const label = this.doc.createElement('label');
      label.className = 'check';
      const box = this.doc.createElement('input');
      box.type = 'checkbox';
      box.value = style.id;
      box.disabled = true;
      box.dataset.rewriteStyle = '';
      const text = this.doc.createElement('span');
      text.textContent = `${style.label} — ${style.description}`;
      label.append(box, text);
      fieldset.append(label);
    }
  }

  private get styleBoxes(): HTMLInputElement[] {
    return [
      ...this.doc.querySelectorAll<HTMLInputElement>(
        'input[data-rewrite-style]',
      ),
    ];
  }

  private bind() {
    this.el<HTMLInputElement>('rewrite-enabled').addEventListener(
      'change',
      () => {
        void this.saveRewrite();
      },
    );
    for (const box of this.styleBoxes)
      box.addEventListener('change', () => {
        void this.saveRewrite();
      });
    this.el<HTMLButtonElement>('toggle-key').addEventListener('click', () => {
      if (this.keyInput.type === 'password') {
        this.keyInput.type = 'text';
        const toggle = this.el<HTMLButtonElement>('toggle-key');
        toggle.textContent = 'Hide';
        toggle.setAttribute('aria-pressed', 'true');
        toggle.setAttribute('aria-label', 'Hide API key');
      } else this.hideKey();
    });
    this.el<HTMLFormElement>('key-form').addEventListener('submit', (event) => {
      event.preventDefault();
      void this.saveKey();
    });
    this.el<HTMLButtonElement>('remove-key').addEventListener('click', () => {
      void this.removeKey();
    });
    this.el<HTMLSelectElement>('model').addEventListener('change', () => {
      void this.saveModel();
    });
    this.el<HTMLButtonElement>('test').addEventListener('click', () => {
      void this.testConnection();
    });
    this.el<HTMLInputElement>('correction-consent').addEventListener(
      'change',
      () => {
        void this.saveConsent();
      },
    );
    for (const id of ['trigger-keyboard', 'trigger-menu'] as const)
      this.el<HTMLInputElement>(id).addEventListener('change', () => {
        void this.saveTriggers();
      });
    this.el<HTMLInputElement>('trigger-smart').addEventListener(
      'change',
      () => {
        void this.saveSmartButton();
      },
    );
    this.el<HTMLButtonElement>('open-shortcuts').addEventListener('click', () =>
      this.deps.openShortcuts?.(),
    );
    this.el<HTMLFormElement>('limit-form').addEventListener(
      'submit',
      (event) => {
        event.preventDefault();
        void this.saveLimit();
      },
    );
  }

  private setControlsEnabled(enabled: boolean) {
    for (const id of [
      'api-key',
      'toggle-key',
      'save-key',
      'model',
      'daily-limit',
      'save-limit',
      'correction-consent',
      'trigger-keyboard',
      'trigger-menu',
      'trigger-smart',
      'open-shortcuts',
      'rewrite-enabled',
    ])
      this.el<HTMLInputElement>(id).disabled = !enabled;
    for (const box of this.styleBoxes) box.disabled = !enabled;
    this.renderButtons(enabled);
  }

  private renderButtons(enabled = this.settings !== null) {
    const configured = Boolean(this.settings?.gemini.apiKey);
    this.el<HTMLButtonElement>('remove-key').disabled =
      !enabled || !configured || this.testing;
    this.el<HTMLButtonElement>('save-key').disabled = !enabled || this.testing;
    this.el<HTMLButtonElement>('save-key').textContent = configured
      ? 'Replace key'
      : 'Save key';
    const test = this.el<HTMLButtonElement>('test');
    test.disabled = !enabled || this.testing;
    test.setAttribute('aria-busy', String(this.testing));
    this.el('test-label').textContent = this.testing
      ? 'Testing…'
      : 'Test connection';
  }

  private message(id: string, text: string, tone: Tone = 'neutral') {
    const node = this.el(id);
    node.textContent = text;
    node.dataset.tone = tone;
  }

  render(): void {
    const settings = this.settings;
    if (!settings) return;
    const status = statusFor(settings, this.connection, this.testing);
    this.el('status-label').textContent = status.label;
    this.el('status').dataset.tone = status.tone;
    let detail = '';
    if (status.label === 'Configured')
      detail =
        'A key is saved but not verified with the selected model. Run Test connection.';
    else if (status.label === 'Connected' && this.connection.lastCheckAt)
      detail = `Last verified with ${modelLabel(settings.gemini.modelId)} on ${time(this.connection.lastCheckAt)}.`;
    else if (
      status.label === 'Connection failed' &&
      this.connection.lastCheckAt
    )
      detail = `Last test failed on ${time(this.connection.lastCheckAt)}${
        this.connection.lastErrorCode
          ? ': ' + errorMessage(this.connection.lastErrorCode)
          : '.'
      }`;
    else if (status.label === 'Not configured')
      detail = 'No key saved. Nothing can be sent to Gemini.';
    this.el('status-detail').textContent = detail;

    this.el<HTMLSelectElement>('model').value = settings.gemini.modelId;
    const note = GEMINI_MODELS.find(
      (model) => model.id === settings.gemini.modelId,
    )?.note;
    this.el('model-note').textContent =
      `${note ? note + ' ' : ''}Availability and billing depend on your Google project.`;
    this.el<HTMLInputElement>('correction-consent').checked =
      settings.correction.consent;
    this.el<HTMLInputElement>('trigger-keyboard').checked =
      settings.triggers.keyboard;
    this.el<HTMLInputElement>('trigger-menu').checked =
      settings.triggers.contextMenu;
    this.el<HTMLInputElement>('trigger-smart').checked =
      settings.triggers.smartButton;
    this.el<HTMLInputElement>('rewrite-enabled').checked =
      settings.rewrite.enabled;
    for (const box of this.styleBoxes)
      box.checked = settings.rewrite.defaultStyles.some(
        (id) => id === box.value,
      );
    const limitInput = this.el<HTMLInputElement>('daily-limit');
    if (this.doc.activeElement !== limitInput)
      limitInput.value = String(settings.safety.dailyTestAttemptLimit);
    this.renderUsage();
    this.renderButtons();
  }

  renderUsage(): void {
    if (!this.settings) return;
    const limit = this.settings.safety.dailyTestAttemptLimit;
    const attempted =
      this.usage.localDate === this.today() ? this.usage.testAttempts : 0;
    this.el('usage-attempted').textContent = `${attempted} of ${limit}`;
    this.el('usage-remaining').textContent = String(
      Math.max(0, limit - attempted),
    );
  }

  /** Read-modify-write from fresh storage so other tabs' changes survive. */
  private async update(
    mutate: (settings: V51Settings) => V51Settings,
  ): Promise<V51Settings> {
    const fresh = await loadSettings(this.deps.area);
    this.settings = await saveSettings(this.deps.area, mutate(fresh));
    return this.settings;
  }

  async saveKey(): Promise<void> {
    const validation = validateApiKey(this.keyInput.value);
    if (!validation.ok) {
      this.message('key-message', validation.reason, 'error');
      return;
    }
    if (
      this.settings?.gemini.apiKey &&
      !this.deps.confirm(
        'Replace the saved Gemini API key? The previous key will be removed from Correctly.',
      )
    ) {
      this.message('key-message', 'Replacement cancelled.');
      return;
    }
    try {
      await this.update((settings) => ({
        ...settings,
        gemini: {
          ...settings.gemini,
          apiKey: validation.key,
          keyRevision: settings.gemini.keyRevision + 1,
        },
      }));
      await saveConnection(this.deps.area, emptyConnection());
      this.connection = emptyConnection();
      this.hideKey(true);
      this.clearResult();
      this.message(
        'key-message',
        'Key saved. Run Test connection to verify it with Google.',
        'ok',
      );
    } catch {
      this.message('key-message', errorMessage('STORAGE_ERROR'), 'error');
    }
    this.render();
  }

  async removeKey(): Promise<void> {
    if (!this.settings?.gemini.apiKey) return;
    if (
      !this.deps.confirm(
        'Remove the saved Gemini API key from this browser profile?',
      )
    )
      return;
    try {
      await this.update((settings) => ({
        ...settings,
        gemini: {
          ...settings.gemini,
          apiKey: null,
          keyRevision: settings.gemini.keyRevision + 1,
        },
      }));
      await saveConnection(this.deps.area, emptyConnection());
      this.connection = emptyConnection();
      this.hideKey(true);
      this.clearResult();
      this.message('key-message', 'Key removed.', 'ok');
    } catch {
      this.message('key-message', errorMessage('STORAGE_ERROR'), 'error');
    }
    this.render();
  }

  async saveModel(): Promise<void> {
    const value = this.el<HTMLSelectElement>('model').value;
    if (!isAllowedModelId(value)) {
      this.message('model-message', 'Unknown model; not saved.', 'error');
      this.render();
      return;
    }
    try {
      await this.update((settings) => ({
        ...settings,
        gemini: { ...settings.gemini, modelId: value },
      }));
      this.clearResult();
      this.message(
        'model-message',
        `Model saved: ${modelLabel(value)}. Test the connection to confirm availability.`,
        'ok',
      );
    } catch {
      this.message('model-message', errorMessage('STORAGE_ERROR'), 'error');
    }
    this.render();
  }

  async saveLimit(): Promise<void> {
    const limit = parseDailyLimit(
      this.el<HTMLInputElement>('daily-limit').value,
    );
    if (limit === null) {
      this.message(
        'limit-message',
        `Enter a whole number from ${DAILY_LIMIT_MIN} to ${DAILY_LIMIT_MAX}. The previous limit is kept.`,
        'error',
      );
      this.el<HTMLInputElement>('daily-limit').value = String(
        this.settings?.safety.dailyTestAttemptLimit ?? '',
      );
      return;
    }
    try {
      await this.update((settings) => ({
        ...settings,
        safety: { dailyTestAttemptLimit: limit },
      }));
      this.message('limit-message', `Daily limit saved: ${limit}.`, 'ok');
    } catch {
      this.message('limit-message', errorMessage('STORAGE_ERROR'), 'error');
    }
    this.render();
  }

  async saveConsent(): Promise<void> {
    const consent = this.el<HTMLInputElement>('correction-consent').checked;
    try {
      await this.update((settings) => ({
        ...settings,
        correction: { consent },
      }));
      this.message(
        'consent-message',
        consent
          ? 'Correction enabled. Select text on a page, then click the Correctly button.'
          : 'Correction disabled. No selected text will be sent.',
        'ok',
      );
    } catch {
      this.message('consent-message', errorMessage('STORAGE_ERROR'), 'error');
    }
    this.render();
  }

  async renderShortcut(): Promise<void> {
    let shortcut = '';
    try {
      shortcut = (await this.deps.getShortcut?.()) ?? '';
    } catch {
      // Shown as "not set" below.
    }
    this.el('shortcut-label').textContent =
      shortcut || 'not set (choose one with Change shortcut)';
  }

  async saveTriggers(): Promise<void> {
    const keyboard = this.el<HTMLInputElement>('trigger-keyboard').checked;
    const contextMenu = this.el<HTMLInputElement>('trigger-menu').checked;
    try {
      await this.update((settings) => ({
        ...settings,
        triggers: { ...settings.triggers, keyboard, contextMenu },
      }));
      this.message('triggers-message', 'Entry points saved.', 'ok');
    } catch {
      this.message('triggers-message', errorMessage('STORAGE_ERROR'), 'error');
    }
    this.render();
  }

  async saveRewrite(): Promise<void> {
    const enabled = this.el<HTMLInputElement>('rewrite-enabled').checked;
    const defaultStyles = normalizeStyleIds(
      this.styleBoxes.filter((box) => box.checked).map((box) => box.value),
    );
    if (!defaultStyles.length) {
      this.message(
        'rewrite-message',
        'Keep at least one default style. The previous choice is kept.',
        'error',
      );
      this.render();
      return;
    }
    try {
      await this.update((settings) => ({
        ...settings,
        rewrite: { enabled, defaultStyles },
      }));
      this.message('rewrite-message', 'Rewrite settings saved.', 'ok');
    } catch {
      this.message('rewrite-message', errorMessage('STORAGE_ERROR'), 'error');
    }
    this.render();
  }

  async saveSmartButton(): Promise<void> {
    const on = this.el<HTMLInputElement>('trigger-smart').checked;
    try {
      // The permission prompt must come first, while the click still counts
      // as a user gesture.
      if (on && !(await this.deps.enableSmartButton?.())) {
        this.message(
          'triggers-message',
          'Site access was not granted, so the smart button stays off.',
          'error',
        );
        this.render();
        return;
      }
      if (!on) await this.deps.disableSmartButton?.();
      await this.update((settings) => ({
        ...settings,
        triggers: { ...settings.triggers, smartButton: on },
      }));
      this.message(
        'triggers-message',
        on
          ? 'Smart button on. Reload already open pages to see it.'
          : 'Smart button off. Site access removed.',
        'ok',
      );
    } catch {
      this.message('triggers-message', errorMessage('STORAGE_ERROR'), 'error');
    }
    this.render();
  }

  private clearResult() {
    const box = this.el('test-result');
    box.hidden = true;
    box.textContent = '';
  }

  private showResult(result: ConnectionResult) {
    const box = this.el('test-result');
    box.hidden = false;
    box.dataset.tone = result.ok ? 'ok' : 'error';
    if (result.ok) {
      const usage = result.usage
        ? ` Tokens reported: ${result.usage.inputTokens ?? '?'} in / ${result.usage.outputTokens ?? '?'} out.`
        : '';
      box.textContent = `Connected — ${modelLabel(result.model)} (Gemini) answered “${result.sample}” on ${time(result.checkedAt)}.${usage}`;
    } else {
      const status = result.httpStatus ? ` (HTTP ${result.httpStatus})` : '';
      box.textContent = `${result.message}${status}`;
    }
  }

  async testConnection(): Promise<ConnectionResult | null> {
    if (this.testing || !this.settings) return null;
    this.testing = true;
    this.clearResult();
    this.render();
    let result: ConnectionResult;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const reply = await Promise.race([
        this.deps.sendTest(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('UI timeout')),
            this.deps.uiTimeoutMs ?? 30_000,
          );
        }),
      ]);
      result = toConnectionResult(reply);
    } catch {
      result = failure('UNKNOWN_ERROR');
    } finally {
      clearTimeout(timer);
      this.testing = false;
    }
    this.showResult(result);
    try {
      await this.reload();
    } catch {
      this.render();
    }
    this.message('key-message', '');
    return result;
  }
}
