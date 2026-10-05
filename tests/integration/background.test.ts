import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/shared/storage';
type Listener = (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  reply: (response: unknown) => void,
) => boolean | undefined;
let listener: Listener;
let installed: () => void;
const get = vi.fn(),
  fetcher = vi.fn<typeof fetch>(),
  update = vi.fn(),
  create = vi.fn();
beforeEach(async () => {
  vi.resetModules();
  get.mockResolvedValue({ settings: DEFAULT_SETTINGS });
  update.mockResolvedValue(undefined);
  vi.stubGlobal('fetch', fetcher);
  vi.stubGlobal('chrome', {
    runtime: {
      id: 'correctly-test',
      onMessage: {
        addListener: (callback: Listener) => {
          listener = callback;
        },
      },
      onInstalled: {
        addListener: (callback: () => void) => {
          installed = callback;
        },
      },
      onStartup: { addListener: vi.fn() },
    },
    contextMenus: {
      create,
      update,
      removeAll: vi.fn().mockResolvedValue(undefined),
      onClicked: { addListener: vi.fn() },
    },
    storage: { local: { get } },
    tabs: {
      onActivated: { addListener: vi.fn() },
      sendMessage: vi.fn().mockResolvedValue(undefined),
    },
  });
  await import('../../src/background/service-worker');
});
afterEach(() => vi.unstubAllGlobals());
const sender: chrome.runtime.MessageSender = {
  id: 'correctly-test',
  url: 'https://example.org',
  tab: { id: 1, url: 'https://example.org' } as chrome.tabs.Tab,
};
it('creates a hidden editable menu at installation', async () => {
  installed();
  await vi.waitFor(() =>
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ visible: false, contexts: ['editable'] }),
      expect.any(Function),
    ),
  );
});
it('checks text through the worker using only the local endpoint', async () => {
  fetcher.mockResolvedValue(new Response(JSON.stringify({ matches: [] })));
  const reply = vi.fn();
  expect(
    listener({ type: 'check', text: 'bonjour', language: 'fr' }, sender, reply),
  ).toBe(true);
  await vi.waitFor(() =>
    expect(reply).toHaveBeenCalledWith({ status: 'ready', matches: [] }),
  );
  expect(fetcher).toHaveBeenCalledWith(
    'http://127.0.0.1:8081/v2/check',
    expect.objectContaining({
      method: 'POST',
      credentials: 'omit',
      redirect: 'error',
    }),
  );
});
it('does not send text for a globally disabled extension', async () => {
  get.mockResolvedValue({ settings: { ...DEFAULT_SETTINGS, enabled: false } });
  const reply = vi.fn();
  listener({ type: 'check', text: 'private', language: 'auto' }, sender, reply);
  await vi.waitFor(() => expect(reply).toHaveBeenCalled());
  expect(fetcher).not.toHaveBeenCalled();
});
it('uses the parent tab domain for disabled sites, including third-party frames', async () => {
  get.mockResolvedValue({
    settings: { ...DEFAULT_SETTINGS, disabledSites: ['example.org'] },
  });
  const reply = vi.fn();
  listener(
    { type: 'check', text: 'private', language: 'en' },
    { ...sender, url: 'https://third-party.org/frame' },
    reply,
  );
  await vi.waitFor(() => expect(reply).toHaveBeenCalled());
  expect(fetcher).not.toHaveBeenCalled();
});
it('rejects malformed or foreign messages before reading storage or fetching', () => {
  const reply = vi.fn();
  expect(
    listener(
      { type: 'check', text: 'private', language: 'fr' },
      { ...sender, id: 'foreign' },
      reply,
    ),
  ).toBe(false);
  expect(
    listener({ type: 'check', text: 123, language: 'fr' }, sender, reply),
  ).toBe(false);
  expect(
    listener({ type: 'check', text: 'private', language: 'xx' }, sender, reply),
  ).toBe(false);
  expect(fetcher).not.toHaveBeenCalled();
  expect(get).not.toHaveBeenCalled();
});
it('handles failed storage without rejecting the message channel', async () => {
  get.mockRejectedValue(new Error('storage failed'));
  const reply = vi.fn();
  listener({ type: 'check', text: 'test', language: 'auto' }, sender, reply);
  await vi.waitFor(() =>
    expect(reply).toHaveBeenCalledWith({ status: 'unavailable', matches: [] }),
  );
});
it('reports health for an extension page and serializes menu updates', async () => {
  fetcher.mockResolvedValue(new Response('[]'));
  const healthReply = vi.fn();
  listener({ type: 'health' }, { id: 'correctly-test' }, healthReply);
  await vi.waitFor(() => expect(healthReply).toHaveBeenCalledWith(true));
  const reply = vi.fn();
  listener(
    { type: 'context', fieldId: '1', offset: 3, suggestion: 'suis' },
    sender,
    reply,
  );
  listener({ type: 'context', fieldId: null }, sender, reply);
  await vi.waitFor(() => expect(reply).toHaveBeenCalledTimes(2));
  expect(update).toHaveBeenLastCalledWith(
    'correctly-correct',
    expect.objectContaining({ visible: false }),
  );
});
