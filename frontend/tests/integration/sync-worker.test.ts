// 5.14: the sync engine as wired in the real worker entry point.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SHORTCUTS_KEY } from '../../src/shared/shortcuts';
import { SYNC_NOW, SYNC_PREFS_KEY, SYNC_PREFIX } from '../../src/shared/sync';
import { FastFakeStorage, FakeSyncArea } from '../helpers/fake-storage';

const ID = 'abcdefghijklmnopabcdefghijklmnop';
const ORIGIN = `chrome-extension://${ID}/`;
type Listener = (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  reply: (value: unknown) => void,
) => boolean | undefined;
let listener: Listener;
let onStorageChanged: (changes: Record<string, unknown>, area: string) => void;
let area: FastFakeStorage;
let sync: FakeSyncArea;
const localAccess = vi.fn(() => Promise.resolve());
const syncAccess = vi.fn(() => Promise.resolve());
const listen = (save: (callback: never) => void) => ({ addListener: save });

beforeEach(async () => {
  vi.resetModules();
  area = new FastFakeStorage();
  sync = new FakeSyncArea();
  vi.stubGlobal('chrome', {
    runtime: {
      id: ID,
      getURL: (path: string) => ORIGIN + path,
      onMessage: listen((callback: Listener) => (listener = callback)),
      onInstalled: listen(() => undefined),
      onStartup: listen(() => undefined),
      openOptionsPage: vi.fn(),
    },
    commands: { onCommand: listen(() => undefined) },
    contextMenus: {
      onClicked: listen(() => undefined),
      update: vi.fn(() => Promise.resolve()),
    },
    action: { onClicked: listen(() => undefined) },
    permissions: { contains: () => Promise.resolve(false) },
    scripting: {
      registerContentScripts: vi.fn(() => Promise.resolve()),
      unregisterContentScripts: vi.fn(() => Promise.resolve()),
    },
    storage: {
      local: Object.assign(area, { setAccessLevel: localAccess }),
      sync: Object.assign(sync, { setAccessLevel: syncAccess }),
      onChanged: listen(
        (callback: typeof onStorageChanged) => (onStorageChanged = callback),
      ),
    },
  });
  await import('../../src/background/service-worker');
});
afterEach(() => vi.unstubAllGlobals());

const send = (message: unknown, sender: chrome.runtime.MessageSender) =>
  new Promise<{ handled: boolean | undefined; reply?: unknown }>((resolve) => {
    const handled = listener(message, sender, (reply) =>
      resolve({ handled, reply }),
    );
    if (!handled) resolve({ handled });
  });
const page = { id: ID, url: ORIGIN + 'src/options/options.html' };
const content = {
  id: ID,
  url: 'https://evil.example/',
  frameId: 0,
  tab: { id: 3 } as chrome.tabs.Tab,
};

it('storage.sync is restricted to trusted contexts; off means untouched', async () => {
  expect(syncAccess).toHaveBeenCalledWith({ accessLevel: 'TRUSTED_CONTEXTS' });
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(sync.gets + sync.writes).toBe(0);
});

it('only the settings page may drive sync; edits are mirrored', async () => {
  expect((await send({ type: SYNC_NOW }, content)).handled).toBe(false);
  await area.set({
    [SYNC_PREFS_KEY]: {
      schemaVersion: 1,
      enabled: true,
      domains: { shortcuts: true },
    },
    [SHORTCUTS_KEY]: {
      schemaVersion: 2,
      revision: 1,
      enabled: false,
      shortcuts: [
        {
          id: 'one',
          trigger: 'brb',
          replacement: 'be right back',
          enabled: true,
          protectTriggerInAi: true,
          protectReplacementInAi: false,
        },
      ],
    },
  });
  const { handled, reply } = await send({ type: SYNC_NOW }, page);
  expect(handled).toBe(true);
  expect(reply).toEqual({ ok: true });
  expect([...sync.data.keys()].some((k) => k.startsWith(SYNC_PREFIX))).toBe(
    true,
  );
  expect(sync.dump()).toContain('be right back');
  // A change notification from storage.sync is accepted without error.
  onStorageChanged({ [SYNC_PREFIX + 'shortcuts.head']: {} }, 'sync');
});
