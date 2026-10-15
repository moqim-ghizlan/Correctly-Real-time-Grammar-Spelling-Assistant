import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CORRECT_TEXT,
  OPEN_REWRITE,
  REWRITE_TEXT,
  TEST_CONNECTION,
} from '../../src/shared/contracts';
import { normalizeSettings } from '../../src/shared/settings';
import { saveSettings, STORAGE_KEYS } from '../../src/shared/storage';
import {
  FakeStorage,
  FAKE_KEY,
  geminiOk,
  jsonResponse,
} from '../helpers/fake-storage';

type Listener = (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  reply: (response: unknown) => void,
) => boolean | undefined;

const ID = 'correctlyextensionid';
const ORIGIN = `chrome-extension://${ID}/`;
const optionsSender: chrome.runtime.MessageSender = {
  id: ID,
  url: ORIGIN + 'src/options/options.html',
  origin: ORIGIN.slice(0, -1),
  tab: { id: 3, url: ORIGIN + 'src/options/options.html' } as chrome.tabs.Tab,
};

let listener: Listener;
let actionClick: (tab: chrome.tabs.Tab) => void;
let area: FakeStorage;
const fetcher = vi.fn<typeof fetch>();
const openOptionsPage = vi.fn(() => Promise.resolve());
const executeScript = vi.fn<(injection: unknown) => Promise<unknown[]>>(() =>
  Promise.resolve([]),
);
const menus = {
  create: vi.fn(),
  removeAll: vi.fn(() => Promise.resolve()),
  update: vi.fn(() => Promise.resolve()),
};
const registerContentScripts = vi.fn(() => Promise.resolve());
const unregisterContentScripts = vi.fn(() => Promise.resolve());
let granted = false;
let onCommand: (command: string, tab?: chrome.tabs.Tab) => void;
let onMenuClick: (
  info: Partial<chrome.contextMenus.OnClickData>,
  tab?: chrome.tabs.Tab,
) => void;
let onInstalled: () => void;
let onStorageChanged: (changes: object, areaName: string) => void;
const listen = <T>(set: (callback: T) => void) => ({ addListener: set });
/** Every trigger = load content.js in a frame, then run it with an intent. */
const expectInjected = (frameIds: number[] | undefined, intent: unknown[]) => {
  const target = frameIds ? { tabId: 7, frameIds } : { tabId: 7 };
  const calls = executeScript.mock.calls.map((call) => call[0]) as {
    target: unknown;
    files?: unknown;
    args?: unknown;
  }[];
  const load = calls.findIndex(
    (call) =>
      JSON.stringify(call.target) === JSON.stringify(target) && call.files,
  );
  expect(calls[load]).toEqual({ target, files: ['content.js'] });
  expect(calls[load + 1]).toMatchObject({ target, args: intent });
};
const contentSender: chrome.runtime.MessageSender = {
  id: ID,
  url: 'https://mail.example/compose',
  frameId: 0,
  tab: { id: 7 } as chrome.tabs.Tab,
};
const configure = (consent: boolean, triggers: object = {}) =>
  saveSettings(
    area,
    normalizeSettings({
      gemini: { apiKey: FAKE_KEY },
      correction: { consent },
      triggers,
    }),
  );
const correctionReply = (hasErrors: boolean, correctedText: string) =>
  jsonResponse(200, geminiOk(JSON.stringify({ hasErrors, correctedText })));
const consoleSpies: ReturnType<typeof vi.spyOn>[] = [];

beforeEach(async () => {
  vi.resetModules();
  area = new FakeStorage();
  granted = false;
  fetcher.mockResolvedValue(jsonResponse(200, geminiOk()));
  vi.stubGlobal('fetch', fetcher);
  vi.stubGlobal('chrome', {
    runtime: {
      id: ID,
      getURL: (path: string) => ORIGIN + path,
      onMessage: {
        addListener: (callback: Listener) => {
          listener = callback;
        },
      },
      openOptionsPage,
      onInstalled: listen((callback: () => void) => (onInstalled = callback)),
      lastError: undefined,
    },
    commands: {
      onCommand: listen((callback: typeof onCommand) => (onCommand = callback)),
    },
    contextMenus: {
      ...menus,
      onClicked: listen(
        (callback: typeof onMenuClick) => (onMenuClick = callback),
      ),
    },
    permissions: { contains: () => Promise.resolve(granted) },
    action: {
      onClicked: {
        addListener: (callback: (tab: chrome.tabs.Tab) => void) => {
          actionClick = callback;
        },
      },
    },
    scripting: {
      executeScript,
      registerContentScripts,
      unregisterContentScripts,
    },
    storage: {
      local: area,
      onChanged: listen(
        (callback: typeof onStorageChanged) => (onStorageChanged = callback),
      ),
    },
  });
  for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const)
    consoleSpies.push(vi.spyOn(console, method));
  // The real entry point, exactly as bundled into service-worker.js.
  await import('../../src/background/service-worker');
});

afterEach(() => {
  vi.unstubAllGlobals();
  consoleSpies.length = 0;
});

const send = (message: unknown, sender = optionsSender) =>
  new Promise<{ handled: boolean | undefined; reply?: unknown }>((resolve) => {
    const handled = listener(message, sender, (reply) =>
      resolve({ handled, reply }),
    );
    if (!handled) resolve({ handled });
  });

it('answers TEST_CONNECTION from the options page through the real worker', async () => {
  await saveSettings(area, normalizeSettings({ gemini: { apiKey: FAKE_KEY } }));
  const { handled, reply } = await send({ type: TEST_CONNECTION });
  expect(handled).toBe(true);
  expect(reply).toMatchObject({ ok: true, provider: 'gemini', sample: 'OK' });
  expect(fetcher).toHaveBeenCalledTimes(1);
  const init = fetcher.mock.calls[0]![1]!;
  expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe(
    FAKE_KEY,
  );
  // The key goes only into the outgoing header, never back to the UI or logs.
  expect(JSON.stringify(reply)).not.toContain(FAKE_KEY);
  for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
});

it('S10: unknown actions and malformed payloads are ignored without network', async () => {
  await saveSettings(area, normalizeSettings({ gemini: { apiKey: FAKE_KEY } }));
  for (const message of [
    { type: 'check', text: 'hello' },
    { type: 'health' },
    { type: TEST_CONNECTION, apiKey: 'x' },
    { type: TEST_CONNECTION, modelId: '../../evil' },
    { type: TEST_CONNECTION, url: 'https://evil.example' },
    [TEST_CONNECTION],
    TEST_CONNECTION,
    null,
    undefined,
  ]) {
    const { handled, reply } = await send(message);
    expect(handled).toBe(false);
    expect(reply).toBeUndefined();
  }
  expect(fetcher).not.toHaveBeenCalled();
});

it('S11: forged senders get nothing back, and no key', async () => {
  await saveSettings(area, normalizeSettings({ gemini: { apiKey: FAKE_KEY } }));
  for (const sender of [
    { ...optionsSender, id: 'another-extension' },
    {
      id: ID,
      url: 'https://evil.example/page',
      tab: { id: 9 } as chrome.tabs.Tab,
    },
    { id: ID },
    { id: ID, url: 'chrome-extension://otherid/src/options/options.html' },
  ]) {
    const { handled, reply } = await send({ type: TEST_CONNECTION }, sender);
    expect(handled).toBe(false);
    expect(reply).toBeUndefined();
  }
  expect(fetcher).not.toHaveBeenCalled();
});

it('no fetch happens on worker startup', () => {
  expect(fetcher).not.toHaveBeenCalled();
});

describe('toolbar button', () => {
  it('opens the settings page while no key is saved', async () => {
    actionClick({ id: 7 } as chrome.tabs.Tab);
    await vi.waitFor(() => expect(openOptionsPage).toHaveBeenCalledTimes(1));
    expect(executeScript).not.toHaveBeenCalled();
  });

  it('opens the settings page until correction consent is given', async () => {
    await configure(false);
    actionClick({ id: 7 } as chrome.tabs.Tab);
    await vi.waitFor(() => expect(openOptionsPage).toHaveBeenCalledTimes(1));
    expect(executeScript).not.toHaveBeenCalled();
  });

  it('injects the content script into the clicked tab only, without network', async () => {
    await configure(true);
    actionClick({ id: 7 } as chrome.tabs.Tab);
    await vi.waitFor(() => expect(executeScript).toHaveBeenCalledTimes(2));
    expectInjected([0], ['correct', []]);
    expect(openOptionsPage).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('falls back to the settings on pages that cannot be scripted', async () => {
    await configure(true);
    executeScript.mockRejectedValueOnce(new Error('Cannot access chrome://'));
    actionClick({ id: 7 } as chrome.tabs.Tab);
    await vi.waitFor(() => expect(openOptionsPage).toHaveBeenCalledTimes(1));
  });
});

describe('CORRECT_TEXT', () => {
  it('A02: one Gemini call, the text only as a user part, no key in the reply', async () => {
    await configure(true);
    fetcher.mockResolvedValueOnce(
      correctionReply(true, 'Je suis allé à Lyon hier.'),
    );
    const { handled, reply } = await send(
      { type: CORRECT_TEXT, text: ' Je suis aller a Lyon hier.\n' },
      contentSender,
    );
    expect(handled).toBe(true);
    expect(reply).toEqual({
      ok: true,
      hasErrors: true,
      correctedText: ' Je suis allé à Lyon hier.\n',
      suspicious: false,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetcher.mock.calls[0]![1]!.body as string) as {
      contents: unknown;
    };
    expect(body.contents).toEqual([
      { role: 'user', parts: [{ text: 'Je suis aller a Lyon hier.' }] },
    ]);
    expect(JSON.stringify(reply)).not.toContain(FAKE_KEY);
    expect(area.dump()).not.toContain('Lyon');
    for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
  });

  it('refuses without consent, and from forged senders or shapes, without network', async () => {
    await configure(false);
    const { reply } = await send(
      { type: CORRECT_TEXT, text: 'Bonjour' },
      contentSender,
    );
    expect(reply).toMatchObject({ ok: false, code: 'CONSENT_REQUIRED' });
    await configure(true);
    for (const [message, sender] of [
      [
        { type: CORRECT_TEXT, text: 'x' },
        { ...contentSender, id: 'other' },
      ],
      [
        { type: CORRECT_TEXT, text: 'x' },
        { ...contentSender, frameId: undefined },
      ],
      [{ type: CORRECT_TEXT, text: 'x' }, { id: ID }],
      [{ type: CORRECT_TEXT, text: '   ' }, contentSender],
      [{ type: CORRECT_TEXT, text: 'é'.repeat(2001) }, contentSender],
      [{ type: CORRECT_TEXT, text: 'x', model: 'evil' }, contentSender],
      [{ type: CORRECT_TEXT, text: 42 }, contentSender],
      [{ type: TEST_CONNECTION }, contentSender],
    ] as [unknown, chrome.runtime.MessageSender][]) {
      const { handled } = await send(message, sender);
      expect(handled).toBe(false);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('V5.3 keyboard shortcut', () => {
  it('K01: the command injects into the active tab, like the toolbar', async () => {
    await configure(true);
    onCommand('correct-selection', { id: 7 } as chrome.tabs.Tab);
    await vi.waitFor(() => expect(executeScript).toHaveBeenCalledTimes(2));
    expectInjected([0], ['correct', []]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('K07/K10: unknown commands and a disabled shortcut do nothing', async () => {
    await configure(true, { keyboard: false });
    onCommand('correct-selection', { id: 7 } as chrome.tabs.Tab);
    onCommand('_execute_action', { id: 7 } as chrome.tabs.Tab);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(executeScript).not.toHaveBeenCalled();
    expect(openOptionsPage).not.toHaveBeenCalled();
  });

  it('K09: no tab (browser page) opens the settings', async () => {
    await configure(true);
    onCommand('correct-selection', undefined);
    await vi.waitFor(() => expect(openOptionsPage).toHaveBeenCalledTimes(1));
  });
});

describe('V5.3 context menu', () => {
  it('M07: install/update registers exactly one parent and its items, idempotently', async () => {
    for (let i = 0; i < 2; i++) onInstalled();
    await vi.waitFor(() => expect(menus.create).toHaveBeenCalledTimes(6));
    expect(menus.removeAll).toHaveBeenCalledTimes(2);
    const ids = menus.create.mock.calls.map(
      (call) => (call as unknown as [{ id: string }])[0].id,
    );
    expect(ids).toEqual([
      'correctly',
      'correctly-correct-selection',
      'correctly-rewrite-selection',
      'correctly',
      'correctly-correct-selection',
      'correctly-rewrite-selection',
    ]);
    expect((menus.create.mock.calls[0] as unknown[])[0]).toMatchObject({
      contexts: ['editable'],
      visible: true,
    });
  });

  it('M01/M05: a click injects into the frame that was right-clicked', async () => {
    await configure(true);
    onMenuClick({ menuItemId: 'correctly-correct-selection', frameId: 4 }, {
      id: 7,
    } as chrome.tabs.Tab);
    await vi.waitFor(() => expect(executeScript).toHaveBeenCalledTimes(2));
    expectInjected([4], ['correct', []]);
  });

  it('M05: an unreachable cross-site frame gets a notice in the top frame, nothing else', async () => {
    await configure(true);
    executeScript.mockRejectedValueOnce(new Error('Cannot access frame'));
    onMenuClick({ menuItemId: 'correctly-correct-selection', frameId: 4 }, {
      id: 7,
    } as chrome.tabs.Tab);
    await vi.waitFor(() => expect(executeScript).toHaveBeenCalledTimes(3));
    expectInjected(undefined, ['unreachable', []]);
    expect(openOptionsPage).not.toHaveBeenCalled();
  });

  it('M09: a disabled menu or another item does nothing, and the menu is hidden', async () => {
    await configure(true, { contextMenu: false });
    onMenuClick({ menuItemId: 'correctly-correct-selection', frameId: 0 }, {
      id: 7,
    } as chrome.tabs.Tab);
    onMenuClick({ menuItemId: 'other', frameId: 0 }, {
      id: 7,
    } as chrome.tabs.Tab);
    onStorageChanged({ [STORAGE_KEYS.settings]: {} }, 'local');
    await vi.waitFor(() =>
      expect(menus.update).toHaveBeenCalledWith('correctly', {
        visible: false,
      }),
    );
    expect(executeScript).not.toHaveBeenCalled();
  });
});

describe('V5.3 smart button registration', () => {
  it('registers smart.js only when enabled AND site access is granted', async () => {
    await configure(true, { smartButton: true });
    onStorageChanged({ [STORAGE_KEYS.settings]: {} }, 'local');
    await vi.waitFor(() => expect(unregisterContentScripts).toHaveBeenCalled());
    expect(registerContentScripts).not.toHaveBeenCalled();
    granted = true;
    onStorageChanged({ [STORAGE_KEYS.settings]: {} }, 'local');
    await vi.waitFor(() =>
      expect(registerContentScripts).toHaveBeenCalledWith([
        {
          id: 'correctly-smart-button',
          matches: ['<all_urls>'],
          js: ['smart.js'],
          runAt: 'document_idle',
        },
      ]),
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('V5.4 rewrite', () => {
  const rewriteReply = (candidates: { styleId: string; text: string }[]) =>
    jsonResponse(200, geminiOk(JSON.stringify({ candidates })));

  it('three styles → exactly ONE Gemini call, candidates in requested order', async () => {
    await configure(true);
    fetcher.mockResolvedValueOnce(
      rewriteReply([
        { styleId: 'concise', text: "Can't attend tomorrow." },
        { styleId: 'formal', text: 'I am unable to attend tomorrow.' },
        { styleId: 'friendly', text: "Sorry, I can't make it tomorrow!" },
      ]),
    );
    const { handled, reply } = await send(
      {
        type: REWRITE_TEXT,
        text: "I can't attend the meeting tomorrow.",
        styleIds: ['formal', 'friendly', 'concise'],
      },
      contentSender,
    );
    expect(handled).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(reply).toMatchObject({
      ok: true,
      missing: [],
      candidates: [
        { styleId: 'formal' },
        { styleId: 'friendly' },
        { styleId: 'concise' },
      ],
    });
    expect(area.dump()).not.toContain('attend');
  });

  it('unknown, duplicated or too many styles and forged senders are refused without network', async () => {
    await configure(true);
    for (const [message, sender] of [
      [{ type: REWRITE_TEXT, text: 'x', styleIds: [] }, contentSender],
      [{ type: REWRITE_TEXT, text: 'x', styleIds: ['evil'] }, contentSender],
      [
        { type: REWRITE_TEXT, text: 'x', styleIds: ['formal', 'formal'] },
        contentSender,
      ],
      [{ type: REWRITE_TEXT, text: 'x', styleIds: 'formal' }, contentSender],
      [
        { type: REWRITE_TEXT, text: 'x', styleIds: ['formal'], model: 'm' },
        contentSender,
      ],
      [{ type: REWRITE_TEXT, text: 'x', styleIds: ['formal'] }, optionsSender],
    ] as [unknown, chrome.runtime.MessageSender][]) {
      const { handled } = await send(message, sender);
      expect(handled).toBe(false);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('menu and shortcut open the picker with the saved default styles, no network', async () => {
    await saveSettings(
      area,
      normalizeSettings({
        gemini: { apiKey: FAKE_KEY },
        correction: { consent: true },
        rewrite: { defaultStyles: ['friendly', 'concise'] },
      }),
    );
    onMenuClick({ menuItemId: 'correctly-rewrite-selection', frameId: 0 }, {
      id: 7,
    } as chrome.tabs.Tab);
    await vi.waitFor(() => expect(executeScript).toHaveBeenCalledTimes(2));
    expectInjected([0], ['rewrite', ['friendly', 'concise']]);
    executeScript.mockClear();
    onCommand('rewrite-selection', { id: 7 } as chrome.tabs.Tab);
    await vi.waitFor(() => expect(executeScript).toHaveBeenCalledTimes(2));
    expectInjected([0], ['rewrite', ['friendly', 'concise']]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rewrite turned off → a notice instead of the picker, and the item is hidden', async () => {
    await configure(true);
    await saveSettings(
      area,
      normalizeSettings({
        gemini: { apiKey: FAKE_KEY },
        correction: { consent: true },
        rewrite: { enabled: false },
      }),
    );
    onMenuClick({ menuItemId: 'correctly-rewrite-selection', frameId: 0 }, {
      id: 7,
    } as chrome.tabs.Tab);
    await vi.waitFor(() => expect(executeScript).toHaveBeenCalledTimes(2));
    expectInjected([0], ['rewriteOff', ['professional']]);
    onStorageChanged({ [STORAGE_KEYS.settings]: {} }, 'local');
    await vi.waitFor(() =>
      expect(menus.update).toHaveBeenCalledWith('correctly-rewrite-selection', {
        visible: false,
      }),
    );
  });

  it('smart button OPEN_REWRITE opens the picker in its own frame, only when enabled', async () => {
    await configure(true);
    await send({ type: OPEN_REWRITE }, { ...contentSender, frameId: 2 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(executeScript).not.toHaveBeenCalled(); // smart button is off
    await configure(true, { smartButton: true });
    const { handled } = await send(
      { type: OPEN_REWRITE },
      { ...contentSender, frameId: 2 },
    );
    expect(handled).toBe(false); // no reply channel kept open
    await vi.waitFor(() => expect(executeScript).toHaveBeenCalledTimes(2));
    expectInjected([2], ['rewrite', ['professional']]);
    await send({ type: OPEN_REWRITE, text: 'x' }, contentSender);
    await send({ type: OPEN_REWRITE }, { ...contentSender, id: 'other' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(executeScript).toHaveBeenCalledTimes(2);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
