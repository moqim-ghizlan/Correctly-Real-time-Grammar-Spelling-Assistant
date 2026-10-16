import { REWRITE_STYLES, normalizeStyleIds } from '../shared/rewrite';
import {
  ARABIC_VARIANTS,
  LANGUAGES,
  normalizeTranslation,
} from '../shared/translate';
import { COMMON, languageName, type CommonMessages } from '../shared/i18n';
import {
  isLanguageSetting,
  resolveLocale,
  type Locale,
} from '../shared/locale';
import type { V51Settings } from '../shared/settings';
import { OPTIONS, type OptionsMessages } from './messages';
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
  /** Opens the browser's own shortcut editor (chrome://extensions/shortcuts). */
  openShortcuts?: () => void;
  /** Requests all-sites access and registers the right-edge handle script. */
  enableSmartButton?: () => Promise<boolean>;
  /** Unregisters it, drops the access and removes open buttons. */
  disableSmartButton?: () => Promise<void>;
  uiTimeoutMs?: number;
  /** 5.13: language of this page (French when absent). */
  locale?: Locale;
  /** 5.13: the interface language was saved (the page re-renders in it). */
  onLanguageChanged?: (locale: Locale) => void;
}

export type Tone = 'neutral' | 'ok' | 'error' | 'info';

export class SettingsPage {
  private settings: V51Settings | null = null;
  private readonly m: OptionsMessages;
  private readonly c: CommonMessages;

  constructor(
    private readonly doc: Document,
    private readonly deps: SettingsDeps,
  ) {
    this.m = OPTIONS[deps.locale ?? 'fr'];
    this.c = COMMON[deps.locale ?? 'fr'];
  }

  private el<T extends HTMLElement>(id: string): T {
    const node = this.doc.getElementById(id);
    if (!node) throw new Error('Missing element #' + id);
    return node as T;
  }

  async init(): Promise<void> {
    this.populateStyles();
    this.populateLanguages();
    this.bind();
    try {
      await this.reload();
      this.setControlsEnabled(true);
    } catch {
      this.message('consent-message', this.c.error('STORAGE_ERROR'), 'error');
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
      const words = this.c.style[style.id];
      const name = this.doc.createElement('strong');
      name.textContent = words.label;
      text.append(name, ` — ${words.description}`);
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
      label: languageName(this.c, language.id),
    }));
    fill('translation-source', [
      { id: 'auto', label: this.m.autoDetect },
      ...languages,
    ]);
    fill('translation-target', languages);
    fill(
      'translation-variant',
      ARABIC_VARIANTS.map((item) => ({
        id: item.id,
        label: this.c.variant[item.id],
      })),
    );
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
    this.el<HTMLSelectElement>('ui-language').addEventListener('change', () => {
      void this.saveLanguage();
    });
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
      'ui-language',
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
    this.el<HTMLSelectElement>('ui-language').value = settings.ui.language;
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
        consent ? this.m.consentOn : this.m.consentOff,
        'ok',
      );
    } catch {
      this.message('consent-message', this.c.error('STORAGE_ERROR'), 'error');
    }
    this.render();
  }

  async saveTriggers(): Promise<void> {
    const keyboard = this.el<HTMLInputElement>('trigger-keyboard').checked;
    const contextMenu = this.el<HTMLInputElement>('trigger-menu').checked;
    try {
      await this.update((settings) => ({
        ...settings,
        triggers: { ...settings.triggers, keyboard, contextMenu },
      }));
      this.message('triggers-message', this.m.triggersSaved, 'ok');
    } catch {
      this.message('triggers-message', this.c.error('STORAGE_ERROR'), 'error');
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
      this.message('translation-message', this.m.sameLanguages, 'error');
      this.render();
      return;
    }
    try {
      await this.update((settings) => ({ ...settings, translation }));
      this.message('translation-message', this.m.translationSaved, 'ok');
    } catch {
      this.message(
        'translation-message',
        this.c.error('STORAGE_ERROR'),
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
      this.message('rewrite-message', this.m.keepOneStyle, 'error');
      this.render();
      return;
    }
    try {
      await this.update((settings) => ({
        ...settings,
        rewrite: { enabled, defaultStyles },
      }));
      this.message('rewrite-message', this.m.rewriteSaved, 'ok');
    } catch {
      this.message('rewrite-message', this.c.error('STORAGE_ERROR'), 'error');
    }
    this.render();
  }

  /**
   * 5.13: saves the interface language; the page then shows itself in it.
   * Already open web pages use it from their next opening of Correctly.
   */
  async saveLanguage(): Promise<void> {
    const value = this.el<HTMLSelectElement>('ui-language').value;
    if (!isLanguageSetting(value)) return this.render();
    try {
      await this.update((settings) => ({
        ...settings,
        ui: { language: value },
      }));
      const locale = resolveLocale(value);
      this.message(
        'language-message',
        OPTIONS[locale].languageSaved(locale === 'fr' ? 'Français' : 'English'),
        'ok',
      );
      this.deps.onLanguageChanged?.(locale);
    } catch {
      this.message('language-message', this.c.error('STORAGE_ERROR'), 'error');
    }
    this.render();
  }

  async saveSmartButton(): Promise<void> {
    const on = this.el<HTMLInputElement>('trigger-smart').checked;
    try {
      // The permission prompt must come first, while the click still counts
      // as a user gesture.
      if (on && !(await this.deps.enableSmartButton?.())) {
        this.message('triggers-message', this.m.handleNoAccess, 'error');
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
        on ? this.m.handleOn : this.m.handleOff,
        'ok',
      );
    } catch {
      this.message('triggers-message', this.c.error('STORAGE_ERROR'), 'error');
    }
    this.render();
  }
}
