import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openModal, type CorrectlyModal } from '../../src/content/modal';
import { CONTENT } from '../../src/content/messages';
import { COMMON } from '../../src/shared/i18n';
import { resolveLocale } from '../../src/shared/locale';
import { normalizeSettings } from '../../src/shared/settings';
import { loadSettings } from '../../src/shared/storage';
import { localizePage, renderInline } from '../../src/options/i18n-dom';
import { HTML_EN, HTML_FR, HTML_MARKUP } from '../../src/options/messages-html';
import { OPTIONS } from '../../src/options/messages';
import { SettingsPage } from '../../src/options/settings-ui';
import { FakeStorage } from '../helpers/fake-storage';

// 5.13 interface languages: English and French, chosen in the settings.

const html = readFileSync(
  join(import.meta.dirname, '../../src/options/options.html'),
  'utf8',
);
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('locale', () => {
  it('auto follows the browser; an explicit choice wins; unknown → auto', () => {
    expect(resolveLocale('auto', 'fr-CA')).toBe('fr');
    expect(resolveLocale('auto', 'en-US')).toBe('en');
    expect(resolveLocale('auto', 'de-DE')).toBe('en');
    expect(resolveLocale('en', 'fr-FR')).toBe('en');
    expect(resolveLocale('fr', 'en-US')).toBe('fr');
    expect(normalizeSettings({ ui: { language: 'de' } }).ui.language).toBe(
      'auto',
    );
    expect(normalizeSettings({}).ui.language).toBe('auto');
  });

  it('every catalog has the same keys in both languages', () => {
    for (const [en, fr] of [
      [CONTENT.en, CONTENT.fr],
      [OPTIONS.en, OPTIONS.fr],
      [COMMON.en, COMMON.fr],
      [HTML_EN, HTML_FR],
    ] as const)
      expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort());
    expect(CONTENT.fr.tabs.correction.action).not.toBe(
      CONTENT.en.tabs.correction.action,
    );
    expect(COMMON.fr.error('NOT_CONFIGURED')).toMatch(/Aucun fournisseur/);
    expect(COMMON.en.error('NOT_CONFIGURED')).toMatch(/No AI provider/);
  });
});

describe('settings page', () => {
  it('every tagged node has a text in both languages; the default page is French', () => {
    document.body.innerHTML = body;
    const keys = [
      ...document.querySelectorAll<HTMLElement>(
        '[data-i18n],[data-i18n-html],[data-i18n-aria]',
      ),
    ].map(
      (node) =>
        node.dataset.i18n ?? node.dataset.i18nHtml ?? node.dataset.i18nAria,
    );
    expect(keys.length).toBeGreaterThan(150);
    for (const key of keys) {
      expect(HTML_EN).toHaveProperty(key!);
      expect(HTML_FR).toHaveProperty(key!);
    }
    expect(document.querySelector('[data-i18n="navStart"]')!.textContent).toBe(
      'Démarrage',
    );
  });

  it('switches the whole static page to English, markup rebuilt without HTML parsing', () => {
    document.body.innerHTML = body;
    localizePage(document, OPTIONS.en, 'en');
    expect(document.documentElement.lang).toBe('en');
    expect(document.title).toBe('Settings — Correctly');
    expect(document.querySelector('[data-i18n="navStart"]')!.textContent).toBe(
      'Getting started',
    );
    const step = document.querySelector('[data-i18n-html="step3"]')!;
    expect(step.querySelectorAll('kbd')).toHaveLength(2);
    expect(step.textContent).toBe(
      'Toolbar button, Ctrl+M or the handle on the right edge of the page.',
    );
    expect(
      document.getElementById('profile-list')!.getAttribute('aria-label'),
    ).toBe('Saved API keys');
    expect(document.getElementById('profile-help-link')).not.toBeNull();
    expect(HTML_MARKUP).toContain('step3');
  });

  it('inline markup accepts only the allowlist: anything else stays text', () => {
    const node = document.createElement('p');
    renderInline(
      document,
      node,
      'a <strong>b</strong> <img src=x onerror=alert(1)> <a href="javascript:x">c</a> <a href="#about">d</a>',
    );
    expect(node.querySelector('img')).toBeNull();
    expect(node.querySelector('strong')!.textContent).toBe('b');
    expect(
      [...node.querySelectorAll('a')].map((a) => a.getAttribute('href')),
    ).toEqual(['#about']);
    expect(node.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('the language choice is saved, then the page re-renders in it', async () => {
    document.body.innerHTML = body;
    const area = new FakeStorage();
    const changed = vi.fn();
    const page = new SettingsPage(document, {
      area,
      confirm: () => true,
      locale: 'en',
      onLanguageChanged: changed,
    });
    await page.init();
    const select = document.getElementById('ui-language') as HTMLSelectElement;
    expect(select.value).toBe('auto');
    select.value = 'fr';
    await page.saveLanguage();
    expect((await loadSettings(area)).ui.language).toBe('fr');
    expect(changed).toHaveBeenCalledWith('fr');
    expect(document.getElementById('language-message')!.textContent).toMatch(
      /Français/,
    );
    const consent = document.getElementById(
      'correction-consent',
    ) as HTMLInputElement;
    consent.checked = true;
    await page.saveConsent();
    expect(document.getElementById('consent-message')!.textContent).toBe(
      OPTIONS.en.consentOn,
    );
  });
});

describe('in-page modal', () => {
  const send = vi.fn(() => Promise.resolve(undefined));
  const open = (locale: 'en' | 'fr') => {
    for (const node of document.querySelectorAll('correctly-modal'))
      node.remove();
    const state = globalThis as { correctlyModal?: CorrectlyModal };
    state.correctlyModal?.close();
    delete state.correctlyModal;
    document.body.innerHTML = '<p>Rien</p>';
    return openModal(
      document,
      { styles: [], translation: null, rewriteEnabled: true, locale },
      send,
    );
  };
  const labels = (modal: CorrectlyModal) =>
    [...modal.root.querySelectorAll('button')].map(
      (node) => node.getAttribute('aria-label') ?? node.textContent,
    );

  it('French: tabs, header, options and footer in French', () => {
    const modal = open('fr');
    for (const text of [
      CONTENT.fr.close,
      CONTENT.fr.minimize,
      'Résumé',
      'Générer la correction',
      'Appliquer',
      'Copier',
    ])
      expect(labels(modal)).toContain(text);
    expect(modal.root.textContent).toContain('Langue du résumé');
    expect(modal.root.textContent).toContain('Détection automatique');
    expect(modal.root.textContent).toContain('Syrien (dialecte parlé)');
  });

  it('English (default) is the V5.x copy, unchanged', () => {
    const modal = open('en');
    for (const text of [
      'Close Correctly',
      'Summary',
      'Generate correction',
      'Apply',
    ])
      expect(labels(modal)).toContain(text);
  });

  it('French errors come from the French catalog', async () => {
    const modal = open('fr');
    (modal as unknown as { send: unknown }).send = () =>
      Promise.resolve({ ok: false, code: 'AI_PAUSED' });
    const area = modal.root.querySelector('textarea')!;
    area.value = 'Bonjour';
    area.dispatchEvent(new Event('input', { bubbles: true }));
    await modal.generate('correction');
    expect(
      modal.root.querySelector('#correctly-panel-correction .status')!
        .textContent,
    ).toBe(CONTENT.fr.notChanged(COMMON.fr.error('AI_PAUSED')));
  });
});
