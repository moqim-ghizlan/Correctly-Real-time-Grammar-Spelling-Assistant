import { errorMessage } from '../shared/errors';
import { REWRITE_STYLES, normalizeStyleIds } from '../shared/rewrite';
import {
  ARABIC_VARIANTS,
  LANGUAGES,
  normalizeTranslation,
} from '../shared/translate';
import type { V51Settings } from '../shared/settings';
import {
  STORAGE_KEYS,
  loadSettings,
  saveSettings,
  type StorageArea,
} from '../shared/storage';

// General settings: consent, entry points, rewrite/translation defaults.
// API keys and routes: providers-ui.ts; usage limits (V5.8): limits-ui.ts.

export interface SettingsDeps {
  area: StorageArea;
  confirm: (question: string) => boolean;
  /** Actual shortcut assigned by the browser ('' when none). */
  getShortcut?: () => Promise<string>;
  openShortcuts?: () => void;
  /** Requests all-sites access and registers the smart-button script. */
  enableSmartButton?: () => Promise<boolean>;
  /** Unregisters it, drops the access and removes open buttons. */
  disableSmartButton?: () => Promise<void>;
  uiTimeoutMs?: number;
}

export type Tone = 'neutral' | 'ok' | 'error' | 'info';

export class SettingsPage {
  private settings: V51Settings | null = null;

  constructor(
    private readonly doc: Document,
    private readonly deps: SettingsDeps,
  ) {}

  private el<T extends HTMLElement>(id: string): T {
    const node = this.doc.getElementById(id);
    if (!node) throw new Error('Missing element #' + id);
    return node as T;
  }

  async init(): Promise<void> {
    this.populateStyles();
    this.populateLanguages();
    this.bind();
    void this.renderShortcut();
    try {
      await this.reload();
      this.setControlsEnabled(true);
    } catch {
      this.message('consent-message', errorMessage('STORAGE_ERROR'), 'error');
    } finally {
      this.el('app').setAttribute('aria-busy', 'false');
    }
  }

  /** Re-reads everything from storage (also used when another tab or the worker writes). */
  async reload(): Promise<void> {
    this.settings = await loadSettings(this.deps.area);
    this.render();
  }

  onStorageChanged(keys: string[]): void {
    if (keys.includes(STORAGE_KEYS.settings))
      void this.reload().catch(() => undefined);
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

  private populateLanguages() {
    const fill = (
      id: string,
      options: readonly { id: string; label: string }[],
    ) =>
      this.el<HTMLSelectElement>(id).replaceChildren(
        ...options.map((item) => {
          const option = this.doc.createElement('option');
          option.value = item.id;
          option.textContent = item.label;
          return option;
        }),
      );
    const languages = LANGUAGES.map((language) => ({
      id: language.id,
      label: `${language.label} — ${language.native}`,
    }));
    fill('translation-source', [
      { id: 'auto', label: 'Auto-detect' },
      ...languages,
    ]);
    fill('translation-target', languages);
    fill('translation-variant', ARABIC_VARIANTS);
  }

  private get styleBoxes(): HTMLInputElement[] {
    return [
      ...this.doc.querySelectorAll<HTMLInputElement>(
        'input[data-rewrite-style]',
      ),
    ];
  }

  private bind() {
    for (const id of [
      'translation-source',
      'translation-target',
      'translation-variant',
    ])
      this.el<HTMLSelectElement>(id).addEventListener('change', () => {
        void this.saveTranslation();
      });
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
  }

  private setControlsEnabled(enabled: boolean) {
    for (const id of [
      'correction-consent',
      'trigger-keyboard',
      'trigger-menu',
      'trigger-smart',
      'open-shortcuts',
      'rewrite-enabled',
      'translation-source',
      'translation-target',
      'translation-variant',
    ])
      this.el<HTMLInputElement>(id).disabled = !enabled;
    for (const box of this.styleBoxes) box.disabled = !enabled;
  }

  private message(id: string, text: string, tone: Tone = 'neutral') {
    const node = this.el(id);
    node.textContent = text;
    node.dataset.tone = tone;
  }

  render(): void {
    const settings = this.settings;
    if (!settings) return;
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
    this.el<HTMLSelectElement>('translation-source').value =
      settings.translation.source;
    this.el<HTMLSelectElement>('translation-target').value =
      settings.translation.target;
    this.el<HTMLSelectElement>('translation-variant').value =
      settings.translation.arabicVariant;
    // Hidden, not cleared: switching back to Arabic restores the variant.
    this.el('translation-variant-row').hidden =
      settings.translation.target !== 'ar';
    for (const box of this.styleBoxes)
      box.checked = settings.rewrite.defaultStyles.some(
        (id) => id === box.value,
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

  async saveTranslation(): Promise<void> {
    const value = (id: string) => this.el<HTMLSelectElement>(id).value;
    const translation = normalizeTranslation({
      source: value('translation-source'),
      target: value('translation-target'),
      arabicVariant: value('translation-variant'),
    });
    if (translation.source === translation.target) {
      this.message(
        'translation-message',
        'Source and target are the same. The previous choice is kept.',
        'error',
      );
      this.render();
      return;
    }
    try {
      await this.update((settings) => ({ ...settings, translation }));
      this.message('translation-message', 'Translation defaults saved.', 'ok');
    } catch {
      this.message(
        'translation-message',
        errorMessage('STORAGE_ERROR'),
        'error',
      );
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
      await this.update((settings) => ({
        ...settings,
        triggers: { ...settings.triggers, smartButton: on },
      }));
      // After saving "off": access is released only if shortcuts don't need it.
      if (!on) await this.deps.disableSmartButton?.();
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
}
