import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectionController } from '../../src/background/connection-controller';
import { TEST_CONNECTION } from '../../src/shared/contracts';
import {
  loadSettings,
  saveUsage,
  STORAGE_KEYS,
} from '../../src/shared/storage';
import { emptyUsage } from '../../src/shared/settings';
import {
  SettingsPage,
  statusFor,
  toConnectionResult,
} from '../../src/options/settings-ui';
import {
  FakeStorage,
  FAKE_KEY,
  OTHER_KEY,
  geminiOk,
  jsonResponse,
} from '../helpers/fake-storage';

const html = readFileSync(
  join(import.meta.dirname, '../../src/options/options.html'),
  'utf8',
);
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));

let area: FakeStorage;
let fetchImpl: ReturnType<typeof vi.fn<typeof fetch>>;
let confirm: ReturnType<typeof vi.fn<(question: string) => boolean>>;
let sent: unknown[];
const TODAY = '2026-10-15';

const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const text = (id: string) => $(id).textContent?.trim();
const flush = () => new Promise((resolve) => setTimeout(resolve, 5));

async function openPage(worker?: ConnectionController) {
  document.body.innerHTML = body;
  const controller =
    worker ??
    new ConnectionController({
      area,
      fetchImpl,
      today: () => TODAY,
      isOnline: () => true,
    });
  const page = new SettingsPage(document, {
    area,
    confirm,
    today: () => TODAY,
    // Mimics chrome.runtime.sendMessage → worker → reply, with a JSON hop.
    sendTest: async () => {
      const message = { type: TEST_CONNECTION };
      sent.push(message);
      return JSON.parse(
        JSON.stringify(await controller.testConnection()),
      ) as unknown;
    },
  });
  await page.init();
  return page;
}

async function typeAndSave(page: SettingsPage, value: string) {
  $<HTMLInputElement>('api-key').value = value;
  await page.saveKey();
}

beforeEach(() => {
  area = new FakeStorage();
  sent = [];
  confirm = vi.fn(() => true);
  fetchImpl = vi.fn<typeof fetch>(() =>
    Promise.resolve(jsonResponse(200, geminiOk('OK'))),
  );
});

describe('initial state', () => {
  it('S01: shows Not configured, cap 20, and enables controls after load', async () => {
    await openPage();
    expect(text('status-label')).toBe('Not configured');
    expect($<HTMLInputElement>('daily-limit').value).toBe('20');
    expect(text('usage-attempted')).toBe('0 of 20');
    expect(text('usage-remaining')).toBe('20');
    expect($<HTMLInputElement>('api-key').type).toBe('password');
    expect($<HTMLInputElement>('api-key').disabled).toBe(false);
    expect($<HTMLButtonElement>('remove-key').disabled).toBe(true);
    expect($('app').getAttribute('aria-busy')).toBe('false');
  });

  it('S06: storage failure on load keeps controls disabled with a message', async () => {
    area.failGet = true;
    await openPage();
    expect(text('key-message')).toContain('Browser storage');
    expect($<HTMLButtonElement>('save-key').disabled).toBe(true);
    expect($<HTMLButtonElement>('test').disabled).toBe(true);
  });

  it('opening, saving and changing settings never touches the network', async () => {
    const page = await openPage();
    await typeAndSave(page, FAKE_KEY);
    $<HTMLSelectElement>('model').value = 'gemini-3.5-flash-lite';
    await page.saveModel();
    $<HTMLInputElement>('daily-limit').value = '5';
    await page.saveLimit();
    await page.removeKey();
    await page.reload();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(sent).toHaveLength(0);
  });
});

describe('API key', () => {
  it('S02: saving shows Configured, clears the input and never renders the key', async () => {
    const page = await openPage();
    $<HTMLInputElement>('api-key').type = 'text';
    await typeAndSave(page, `  ${FAKE_KEY} `);
    expect(text('status-label')).toBe('Configured');
    expect($<HTMLInputElement>('api-key').value).toBe('');
    expect($<HTMLInputElement>('api-key').type).toBe('password');
    expect(document.body.innerHTML).not.toContain(FAKE_KEY);
    expect((await loadSettings(area)).gemini.apiKey).toBe(FAKE_KEY);
    expect(text('save-key')).toBe('Replace key');
    // Reopen: still configured, still not displayed.
    await openPage();
    expect(text('status-label')).toBe('Configured');
    expect(document.body.innerHTML).not.toContain(FAKE_KEY);
  });

  it('S03: empty key shows validation feedback and saves nothing', async () => {
    const page = await openPage();
    await typeAndSave(page, '   ');
    expect(text('key-message')).toBe('Paste a key before saving.');
    expect($('key-message').dataset.tone).toBe('error');
    expect(area.data.has(STORAGE_KEYS.settings)).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('S04: replacing asks for confirmation and keeps only the new key', async () => {
    const page = await openPage();
    await typeAndSave(page, FAKE_KEY);
    confirm.mockReturnValueOnce(false);
    await typeAndSave(page, OTHER_KEY);
    expect((await loadSettings(area)).gemini.apiKey).toBe(FAKE_KEY);
    expect(text('key-message')).toBe('Replacement cancelled.');
    await typeAndSave(page, OTHER_KEY);
    expect(confirm).toHaveBeenCalledTimes(2);
    expect((await loadSettings(area)).gemini.apiKey).toBe(OTHER_KEY);
    expect(area.dump()).not.toContain(FAKE_KEY);
  });

  it('S04b: an invalid replacement does not delete the previous key', async () => {
    const page = await openPage();
    await typeAndSave(page, FAKE_KEY);
    await typeAndSave(page, 'not a key');
    expect((await loadSettings(area)).gemini.apiKey).toBe(FAKE_KEY);
  });

  it('S05: removing clears key, connection state and UI; tests are then blocked', async () => {
    const page = await openPage();
    await typeAndSave(page, FAKE_KEY);
    await page.testConnection();
    expect(text('status-label')).toBe('Connected');
    confirm.mockReturnValueOnce(false);
    await page.removeKey();
    expect((await loadSettings(area)).gemini.apiKey).toBe(FAKE_KEY);
    await page.removeKey();
    expect(text('status-label')).toBe('Not configured');
    expect($('test-result').hidden).toBe(true);
    expect(area.dump()).not.toContain(FAKE_KEY);
    expect(area.dump()).not.toContain('lastSuccessfulCheckAt":"');
    fetchImpl.mockClear();
    const result = await page.testConnection();
    expect(result).toMatchObject({ code: 'NOT_CONFIGURED' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('show/hide toggles the field type and hideKey() re-masks', async () => {
    const page = await openPage();
    $('toggle-key').click();
    expect($<HTMLInputElement>('api-key').type).toBe('text');
    expect($('toggle-key').getAttribute('aria-pressed')).toBe('true');
    page.hideKey();
    expect($<HTMLInputElement>('api-key').type).toBe('password');
    expect(text('toggle-key')).toBe('Show');
  });

  it('S06: a storage write failure is reported and recoverable', async () => {
    const page = await openPage();
    area.failSet = true;
    await typeAndSave(page, FAKE_KEY);
    expect(text('key-message')).toContain('Browser storage');
    area.failSet = false;
    await typeAndSave(page, FAKE_KEY);
    expect(text('status-label')).toBe('Configured');
  });
});

describe('connection test', () => {
  it('N01: Connected only after a real (mocked) success, with model and time', async () => {
    const page = await openPage();
    await typeAndSave(page, FAKE_KEY);
    const result = await page.testConnection();
    expect(result).toMatchObject({ ok: true });
    expect(text('status-label')).toBe('Connected');
    expect(text('test-result')).toContain('Gemini 3.1 Flash-Lite');
    expect(text('test-result')).toContain('“OK”');
    expect(text('usage-attempted')).toBe('1 of 20');
    expect(sent).toEqual([{ type: TEST_CONNECTION }]);
    expect(JSON.stringify(sent)).not.toContain(FAKE_KEY);
    expect($<HTMLButtonElement>('test').disabled).toBe(false);
  });

  it('N02/N05: failures show copy without provider text, and the UI recovers', async () => {
    const page = await openPage();
    await typeAndSave(page, FAKE_KEY);
    fetchImpl.mockResolvedValueOnce(
      jsonResponse(400, {
        error: {
          message: `API key not valid ${FAKE_KEY}`,
          status: 'INVALID_ARGUMENT',
          details: [{ reason: 'API_KEY_INVALID' }],
        },
      }),
    );
    await page.testConnection();
    expect(text('status-label')).toBe('Connection failed');
    expect(text('test-result')).toContain('Invalid key');
    expect(text('test-result')).toContain('HTTP 400');
    expect(document.body.innerHTML).not.toContain(FAKE_KEY);
    expect(document.body.innerHTML).not.toContain('API key not valid');
    expect($<HTMLButtonElement>('test').disabled).toBe(false);

    fetchImpl.mockResolvedValueOnce(jsonResponse(200, { candidates: [] }));
    await page.testConnection();
    expect(text('status-label')).toBe('Connection failed');
    expect(text('test-result')).toContain('not usable');
  });

  it('shows Checking... and a busy button while in flight', async () => {
    let release!: (response: Response) => void;
    fetchImpl.mockImplementationOnce(
      () => new Promise<Response>((resolve) => (release = resolve)),
    );
    const page = await openPage();
    await typeAndSave(page, FAKE_KEY);
    const pending = page.testConnection();
    await flush();
    expect(text('status-label')).toBe('Checking...');
    expect($('test').getAttribute('aria-busy')).toBe('true');
    expect($<HTMLButtonElement>('test').disabled).toBe(true);
    expect(await page.testConnection()).toBeNull(); // double click ignored
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalled());
    release(jsonResponse(200, geminiOk()));
    await pending;
    expect(text('status-label')).toBe('Connected');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('N09: a dead worker/port is reported and the button re-enabled', async () => {
    document.body.innerHTML = body;
    const page = new SettingsPage(document, {
      area,
      confirm,
      today: () => TODAY,
      sendTest: () =>
        Promise.reject(new Error('Could not establish connection')),
    });
    await page.init();
    await typeAndSave(page, FAKE_KEY);
    expect(await page.testConnection()).toMatchObject({
      code: 'UNKNOWN_ERROR',
    });
    expect($<HTMLButtonElement>('test').disabled).toBe(false);
  });

  it('Q03/Q05: at the cap the page shows the limit and a reopened page stays blocked', async () => {
    await saveUsage(area, { ...emptyUsage(TODAY), testAttempts: 20 });
    let page = await openPage();
    await typeAndSave(page, FAKE_KEY);
    expect(text('usage-remaining')).toBe('0');
    await page.testConnection();
    expect(text('test-result')).toContain('Daily local limit reached');
    page = await openPage();
    await page.testConnection();
    expect(text('test-result')).toContain('Daily local limit reached');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('model changes switch Connected back to Configured until retested', async () => {
    const page = await openPage();
    await typeAndSave(page, FAKE_KEY);
    await page.testConnection();
    $<HTMLSelectElement>('model').value = 'gemini-3.5-flash-lite';
    await page.saveModel();
    expect(text('status-label')).toBe('Configured');
    expect((await loadSettings(area)).gemini.modelId).toBe(
      'gemini-3.5-flash-lite',
    );
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
      sendTest: () => Promise.resolve(undefined),
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

describe('pure helpers', () => {
  it('statusFor ignores results from an older key revision', () => {
    const settings = {
      schemaVersion: 1 as const,
      gemini: {
        apiKey: FAKE_KEY,
        modelId: 'gemini-3.1-flash-lite',
        keyRevision: 2,
      },
      safety: { dailyTestAttemptLimit: 20 },
      correction: { consent: false },
      triggers: { keyboard: true, contextMenu: true, smartButton: false },
      rewrite: { enabled: true, defaultStyles: ['professional' as const] },
    };
    const connection = {
      schemaVersion: 1 as const,
      lastCheckAt: '2026-10-15T10:00:00.000Z',
      lastCheckOk: true,
      lastCheckModelId: 'gemini-3.1-flash-lite',
      lastCheckKeyRevision: 1,
      lastErrorCode: null,
      lastSuccessfulCheckAt: '2026-10-15T10:00:00.000Z',
      lastSuccessfulModelId: 'gemini-3.1-flash-lite',
    };
    expect(statusFor(settings, connection, false).label).toBe('Configured');
    expect(
      statusFor(settings, { ...connection, lastCheckKeyRevision: 2 }, false)
        .label,
    ).toBe('Connected');
  });

  it('toConnectionResult rejects unexpected worker replies', () => {
    expect(toConnectionResult(undefined)).toMatchObject({
      code: 'UNKNOWN_ERROR',
    });
    expect(toConnectionResult({ ok: true, model: 'evil' })).toMatchObject({
      code: 'UNKNOWN_ERROR',
    });
    const rebuilt = toConnectionResult({
      ok: false,
      code: 'INVALID_KEY',
      message: '<b>raw</b>',
    });
    expect(rebuilt).toMatchObject({ code: 'INVALID_KEY' });
    expect(JSON.stringify(rebuilt)).not.toContain('<b>');
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
