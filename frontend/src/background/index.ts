import {
  CORRECT_COMMAND,
  isCorrectTextRequest,
  isTestConnectionRequest,
  type ConnectionResult,
} from '../shared/contracts';
import { errorMessage, isRetryable } from '../shared/errors';
import {
  browserStorage,
  loadSettings,
  STORAGE_KEYS,
  type StorageArea,
} from '../shared/storage';
import { ConnectionController } from './connection-controller';

// No logging here on purpose: nothing in this worker should ever print a
// key, a request, the user's text or a provider response.

/** Built separately as classic scripts (see vite.content.config.ts). */
export const CONTENT_SCRIPT = 'content.js';
export const SMART_SCRIPT = 'smart.js';
export const SMART_SCRIPT_ID = 'correctly-smart-button';
export const MENU_PARENT = 'correctly';
export const MENU_CORRECT = 'correctly-correct-selection';
const ALL_SITES = ['<all_urls>'];

/** Only pages bundled in this extension may talk to the worker. */
export function isTrustedSender(
  sender: chrome.runtime.MessageSender,
  runtimeId: string,
  extensionOrigin: string,
): boolean {
  if (sender.id !== runtimeId) return false;
  const url = typeof sender.url === 'string' ? sender.url : '';
  return url.startsWith(extensionOrigin);
}

/**
 * Our injected content script, in a tab's top frame. Web pages cannot message
 * this extension at all (no externally_connectable), so sender.id is ours.
 */
export function isContentScriptSender(
  sender: chrome.runtime.MessageSender,
  runtimeId: string,
): boolean {
  return (
    sender.id === runtimeId &&
    typeof sender.tab?.id === 'number' &&
    typeof sender.frameId === 'number'
  );
}

export type Trigger = 'toolbar' | 'keyboard' | 'contextMenu';

/**
 * The one path used by the toolbar button, the shortcut and the context menu:
 * inject content.js into the frame the user acted in (activeTab is granted
 * by the gesture). A disabled shortcut or menu does nothing. Without a key or
 * consent, or on pages Chrome does not let extensions script (chrome://, Web
 * Store, PDF viewer), the settings open instead.
 */
export async function correctInTab(
  tab: chrome.tabs.Tab | undefined,
  area: StorageArea,
  trigger: Trigger,
  frameId = 0,
): Promise<void> {
  let tabId: number | undefined;
  try {
    const settings = await loadSettings(area);
    if (trigger !== 'toolbar' && !settings.triggers[trigger]) return;
    if (settings.gemini.apiKey && settings.correction.consent) tabId = tab?.id;
  } catch {
    // Fall through to the settings page.
  }
  if (typeof tabId !== 'number') return chrome.runtime.openOptionsPage();
  try {
    await chrome.scripting.executeScript({
      target: { tabId, frameIds: [frameId] },
      files: [CONTENT_SCRIPT],
    });
    return;
  } catch {
    if (frameId === 0) return chrome.runtime.openOptionsPage();
  }
  // A frame embedded from another site is outside activeTab: say so in the
  // top frame instead of correcting anything there.
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        (globalThis as { correctlyNotice?: string }).correctlyNotice =
          'unreachable';
      },
    });
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [CONTENT_SCRIPT],
    });
  } catch {
    await chrome.runtime.openOptionsPage();
  }
}

/** Idempotent: exactly one parent and one item after any install/update. */
export async function installMenu(area: StorageArea): Promise<void> {
  const settings = await loadSettings(area);
  await chrome.contextMenus.removeAll();
  const ignore = () => void chrome.runtime.lastError;
  chrome.contextMenus.create(
    {
      id: MENU_PARENT,
      title: 'Correctly',
      contexts: ['editable'],
      visible: settings.triggers.contextMenu,
    },
    ignore,
  );
  chrome.contextMenus.create(
    {
      id: MENU_CORRECT,
      parentId: MENU_PARENT,
      title: 'Correct selected text',
      contexts: ['editable'],
    },
    ignore,
  );
}

/** Keeps the opt-in smart-button script registered across updates. */
export async function syncSmartScript(area: StorageArea): Promise<void> {
  const settings = await loadSettings(area);
  const granted = await chrome.permissions.contains({ origins: ALL_SITES });
  await chrome.scripting
    .unregisterContentScripts({ ids: [SMART_SCRIPT_ID] })
    .catch(() => undefined);
  if (settings.triggers.smartButton && granted)
    await chrome.scripting.registerContentScripts([
      {
        id: SMART_SCRIPT_ID,
        matches: ALL_SITES,
        js: [SMART_SCRIPT],
        runAt: 'document_idle',
      },
    ]);
}

export function registerServiceWorker(
  area: StorageArea = browserStorage(),
  controller = new ConnectionController({ area }),
): void {
  const extensionOrigin = chrome.runtime.getURL('');

  chrome.runtime.onMessage.addListener((message: unknown, sender, reply) => {
    let task: Promise<unknown>;
    if (
      isTrustedSender(sender, chrome.runtime.id, extensionOrigin) &&
      isTestConnectionRequest(message)
    )
      task = controller.testConnection();
    else if (
      isContentScriptSender(sender, chrome.runtime.id) &&
      isCorrectTextRequest(message)
    )
      task = controller.correct(message.text);
    else return false;
    void task
      .catch((): ConnectionResult => ({
        ok: false,
        code: 'UNKNOWN_ERROR',
        message: errorMessage('UNKNOWN_ERROR'),
        retryable: isRetryable('UNKNOWN_ERROR'),
      }))
      .then(reply);
    return true;
  });

  chrome.action.onClicked.addListener((tab) => {
    void correctInTab(tab, area, 'toolbar').catch(() => undefined);
  });
  chrome.commands.onCommand.addListener((command, tab) => {
    if (command === CORRECT_COMMAND)
      void correctInTab(tab, area, 'keyboard').catch(() => undefined);
  });
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === MENU_CORRECT)
      void correctInTab(tab, area, 'contextMenu', info.frameId ?? 0).catch(
        () => undefined,
      );
  });
  chrome.runtime.onInstalled.addListener(() => {
    void installMenu(area).catch(() => undefined);
    void syncSmartScript(area).catch(() => undefined);
  });
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !(STORAGE_KEYS.settings in changes)) return;
    void loadSettings(area)
      .then((settings) =>
        chrome.contextMenus.update(MENU_PARENT, {
          visible: settings.triggers.contextMenu,
        }),
      )
      .catch(() => undefined);
    void syncSmartScript(area).catch(() => undefined);
  });
}
