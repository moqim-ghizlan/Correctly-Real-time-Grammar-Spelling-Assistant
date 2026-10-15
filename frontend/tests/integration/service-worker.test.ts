import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TEST_CONNECTION } from '../../src/shared/contracts';
import { normalizeSettings } from '../../src/shared/settings';
import { saveSettings } from '../../src/shared/storage';
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
let actionClick: () => void;
let area: FakeStorage;
const fetcher = vi.fn<typeof fetch>();
const openOptionsPage = vi.fn(() => Promise.resolve());
const consoleSpies: ReturnType<typeof vi.spyOn>[] = [];

beforeEach(async () => {
  vi.resetModules();
  area = new FakeStorage();
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
    },
    action: {
      onClicked: {
        addListener: (callback: () => void) => {
          actionClick = callback;
        },
      },
    },
    storage: { local: area },
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

it('the toolbar button opens the settings page', () => {
  actionClick();
  expect(openOptionsPage).toHaveBeenCalledTimes(1);
});
