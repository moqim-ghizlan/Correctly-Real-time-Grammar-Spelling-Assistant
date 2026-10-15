import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadSettings,
  saveUsage,
  STORAGE_KEYS,
} from '../../src/shared/storage';
import { emptyUsage } from '../../src/shared/settings';
import { SettingsPage } from '../../src/options/settings-ui';
import {
  FakeStorage,
  FAKE_KEY,
  geminiOk,
  jsonResponse,
} from '../helpers/fake-storage';

// General settings (consent, entry points, styles, languages, daily limit).
// API keys and routes: providers-ui.test.ts.

const html = readFileSync(
  join(import.meta.dirname, '../../src/options/options.html'),
  'utf8',
);
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));

let area: FakeStorage;
let fetchImpl: ReturnType<typeof vi.fn<typeof fetch>>;
let confirm: ReturnType<typeof vi.fn<(question: string) => boolean>>;
const TODAY = '2026-10-15';

const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const text = (id: string) => $(id).textContent?.trim();

async function openPage() {
  document.body.innerHTML = body;
  const page = new SettingsPage(document, {
    area,
    confirm,
    today: () => TODAY,
  });
  await page.init();
  return page;
}

beforeEach(() => {
  area = new FakeStorage();
  confirm = vi.fn(() => true);
  fetchImpl = vi.fn<typeof fetch>(() =>
    Promise.resolve(jsonResponse(200, geminiOk('OK'))),
  );
});

describe('initial state', () => {
  it('S01: shows cap 20 and enables controls after load', async () => {
    await openPage();
    expect($<HTMLInputElement>('daily-limit').value).toBe('20');
    expect(text('usage-attempted')).toBe('0 of 20');
    expect(text('usage-remaining')).toBe('20');
    expect($<HTMLInputElement>('correction-consent').disabled).toBe(false);
    expect($('app').getAttribute('aria-busy')).toBe('false');
  });

  it('S06: storage failure on load keeps controls disabled with a message', async () => {
    area.failGet = true;
    await openPage();
    expect(text('consent-message')).toContain('Browser storage');
    expect($<HTMLInputElement>('daily-limit').disabled).toBe(true);
    expect($<HTMLInputElement>('correction-consent').disabled).toBe(true);
  });

  it('opening and changing settings never touches the network', async () => {
    const page = await openPage();
    $<HTMLInputElement>('daily-limit').value = '5';
    await page.saveLimit();
    await page.reload();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('Q03/Q05: at the cap the page shows the limit (all providers together)', async () => {
    await saveUsage(area, { ...emptyUsage(TODAY), testAttempts: 20 });
    await openPage();
    expect(text('usage-attempted')).toBe('20 of 20');
    expect(text('usage-remaining')).toBe('0');
  });

  it('never renders a legacy V5.1 key', async () => {
    area.data.set(STORAGE_KEYS.settings, {
      gemini: { apiKey: FAKE_KEY },
    });
    await openPage();
    expect(document.body.innerHTML).not.toContain(FAKE_KEY);
  });
});

describe('correction consent', () => {
  it('is off by default, saved on toggle, and never touches the network', async () => {
    await openPage();
    const box = $<HTMLInputElement>('correction-consent');
    expect(box.checked).toBe(false);
    expect(box.disabled).toBe(false);
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    await vi.waitFor(async () =>
      expect((await loadSettings(area)).correction.consent).toBe(true),
    );
    expect(text('consent-message')).toContain('Correction enabled');
    await openPage();
    expect($<HTMLInputElement>('correction-consent').checked).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('V5.3 entry points', () => {
  async function openWith(
    deps: Partial<ConstructorParameters<typeof SettingsPage>[1]>,
  ) {
    document.body.innerHTML = body;
    const page = new SettingsPage(document, {
      area,
      confirm,
      today: () => TODAY,
      ...deps,
    });
    await page.init();
    return page;
  }

  it('shows the real assigned shortcut, or "not set"', async () => {
    await openWith({ getShortcut: () => Promise.resolve('Ctrl+Shift+C') });
    await vi.waitFor(() => expect(text('shortcut-label')).toBe('Ctrl+Shift+C'));
    await openWith({ getShortcut: () => Promise.resolve('') });
    await vi.waitFor(() => expect(text('shortcut-label')).toContain('not set'));
  });

  it('defaults: shortcut and menu on, smart button off; toggles persist', async () => {
    const openShortcuts = vi.fn();
    const page = await openWith({ openShortcuts });
    expect($<HTMLInputElement>('trigger-keyboard').checked).toBe(true);
    expect($<HTMLInputElement>('trigger-menu').checked).toBe(true);
    expect($<HTMLInputElement>('trigger-smart').checked).toBe(false);
    $<HTMLInputElement>('trigger-keyboard').checked = false;
    await page.saveTriggers();
    expect((await loadSettings(area)).triggers).toEqual({
      keyboard: false,
      contextMenu: true,
      smartButton: false,
    });
    $('open-shortcuts').click();
    expect(openShortcuts).toHaveBeenCalledTimes(1);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('the smart button is saved only when site access is granted', async () => {
    const enableSmartButton = vi.fn(() => Promise.resolve(false));
    const disableSmartButton = vi.fn(() => Promise.resolve());
    const page = await openWith({ enableSmartButton, disableSmartButton });
    $<HTMLInputElement>('trigger-smart').checked = true;
    await page.saveSmartButton();
    expect((await loadSettings(area)).triggers.smartButton).toBe(false);
    expect($<HTMLInputElement>('trigger-smart').checked).toBe(false);
    expect(text('triggers-message')).toContain('not granted');

    enableSmartButton.mockResolvedValueOnce(true);
    $<HTMLInputElement>('trigger-smart').checked = true;
    await page.saveSmartButton();
    expect((await loadSettings(area)).triggers.smartButton).toBe(true);

    $<HTMLInputElement>('trigger-smart').checked = false;
    await page.saveSmartButton();
    expect(disableSmartButton).toHaveBeenCalledTimes(1);
    expect((await loadSettings(area)).triggers.smartButton).toBe(false);
  });
});

describe('daily limit setting', () => {
  it('S08: rejects invalid values and keeps the previous limit', async () => {
    const page = await openPage();
    for (const value of ['abc', '0', '101', '2.5', '']) {
      $<HTMLInputElement>('daily-limit').value = value;
      await page.saveLimit();
      expect($('limit-message').dataset.tone).toBe('error');
      expect($<HTMLInputElement>('daily-limit').value).toBe('20');
    }
    expect(area.data.has(STORAGE_KEYS.settings)).toBe(false);
    $<HTMLInputElement>('daily-limit').value = '3';
    await page.saveLimit();
    expect(text('usage-attempted')).toBe('0 of 3');
    expect((await loadSettings(area)).safety.dailyTestAttemptLimit).toBe(3);
  });
});

describe('V5.4 rewrite settings', () => {
  it('defaults to enabled + Professional, saves choices, refuses an empty set', async () => {
    const page = await openPage();
    const box = (id: string) =>
      document.querySelector<HTMLInputElement>(`input[value="${id}"]`)!;
    expect($<HTMLInputElement>('rewrite-enabled').checked).toBe(true);
    expect(box('professional').checked).toBe(true);
    expect(box('funny').checked).toBe(false);
    box('funny').checked = true;
    await page.saveRewrite();
    expect((await loadSettings(area)).rewrite).toEqual({
      enabled: true,
      defaultStyles: ['professional', 'funny'],
    });
    box('professional').checked = false;
    box('funny').checked = false;
    await page.saveRewrite();
    expect(text('rewrite-message')).toContain('at least one');
    expect((await loadSettings(area)).rewrite.defaultStyles).toEqual([
      'professional',
      'funny',
    ]);
    expect(box('funny').checked).toBe(true);
    $<HTMLInputElement>('rewrite-enabled').checked = false;
    await page.saveRewrite();
    expect((await loadSettings(area)).rewrite.enabled).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('V5.5 translation settings', () => {
  it('defaults Auto → English, saves choices, hides the Arabic variant unless Arabic', async () => {
    const page = await openPage();
    const select = (id: string) => $<HTMLSelectElement>(id);
    expect(select('translation-source').value).toBe('auto');
    expect(select('translation-target').value).toBe('en');
    expect($('translation-variant-row').hidden).toBe(true);
    select('translation-target').value = 'ar';
    select('translation-variant').value = 'syrian';
    await page.saveTranslation();
    expect((await loadSettings(area)).translation).toEqual({
      source: 'auto',
      target: 'ar',
      arabicVariant: 'syrian',
    });
    expect($('translation-variant-row').hidden).toBe(false);
    select('translation-source').value = 'ar';
    await page.saveTranslation();
    expect(text('translation-message')).toContain('the same');
    expect((await loadSettings(area)).translation.source).toBe('auto');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
