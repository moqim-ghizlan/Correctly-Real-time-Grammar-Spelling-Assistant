import {
  CORRECT_COMMAND,
  OPEN_REWRITE,
  REWRITE_COMMAND,
  isCorrectTextRequest,
  isTestConnectionRequest,
  type ConnectionResult,
} from '../shared/contracts';
import { errorMessage, isRetryable } from '../shared/errors';
import { isRewriteTextRequest } from '../shared/rewrite';
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
export const MENU_REWRITE = 'correctly-rewrite-selection';
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

export type Trigger = 'toolbar' | 'keyboard' | 'contextMenu' | 'smartButton';
type Intent = 'correct' | 'rewrite' | 'unreachable' | 'rewriteOff';

/** Loads content.js into one frame, then runs it with the intent. */
async function inject(
  tabId: number,
  frameIds: number[] | undefined,
  intent: Intent,
  styles: string[] = [],
): Promise<void> {
  const target = frameIds ? { tabId, frameIds } : { tabId };
  await chrome.scripting.executeScript({ target, files: [CONTENT_SCRIPT] });
  await chrome.scripting.executeScript({
    target,
    func: (intent: string, styles: string[]) => {
      (
        globalThis as {
          correctlyRun?: (intent: string, styles: string[]) => void;
        }
      ).correctlyRun?.(intent, styles);
    },
    args: [intent, styles],
  });
}

/**
 * The one path used by every trigger: inject content.js into the frame the
 * user acted in (activeTab is granted by the gesture, or site access by the
 * smart button) and run correction or the rewrite picker. A disabled trigger
 * does nothing. Without a key or consent, or on pages Chrome does not let
 * extensions script (chrome://, Web Store, PDF viewer), the settings open.
 */
export async function correctInTab(
  tab: chrome.tabs.Tab | undefined,
  area: StorageArea,
  trigger: Trigger,
  frameId = 0,
  requested: 'correct' | 'rewrite' = 'correct',
): Promise<void> {
  let tabId: number | undefined;
  let intent: Intent = requested;
  let styles: string[] = [];
  try {
    const settings = await loadSettings(area);
    if (trigger !== 'toolbar' && !settings.triggers[trigger]) return;
    if (intent === 'rewrite') {
      if (!settings.rewrite.enabled) intent = 'rewriteOff';
      styles = settings.rewrite.defaultStyles;
    }
    if (settings.gemini.apiKey && settings.correction.consent) tabId = tab?.id;
  } catch {
    // Fall through to the settings page.
  }
  if (typeof tabId !== 'number') return chrome.runtime.openOptionsPage();
  try {
    return await inject(tabId, [frameId], intent, styles);
  } catch {
    if (frameId === 0) return chrome.runtime.openOptionsPage();
  }
  // A frame embedded from another site is outside activeTab: say so in the
  // top frame instead of correcting anything there.
  try {
    await inject(tabId, undefined, 'unreachable');
  } catch {
    await chrome.runtime.openOptionsPage();
  }
}

const isOpenRewriteRequest = (value: unknown): boolean =>
  !!value &&
  typeof value === 'object' &&
  Object.keys(value).join() === 'type' &&
  (value as { type?: unknown }).type === OPEN_REWRITE;

/** Idempotent: exactly one parent and its two items after any install/update. */
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
  chrome.contextMenus.create(
    {
      id: MENU_REWRITE,
      parentId: MENU_PARENT,
      title: 'Rewrite selected text…',
      contexts: ['editable'],
      visible: settings.rewrite.enabled,
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
    else if (
      isContentScriptSender(sender, chrome.runtime.id) &&
      isRewriteTextRequest(message)
    )
      task = controller.rewrite(message.text, message.styleIds);
    else {
      // Smart button → open the picker in that frame; nothing is replied.
      if (
        isContentScriptSender(sender, chrome.runtime.id) &&
        isOpenRewriteRequest(message)
      )
        void correctInTab(
          sender.tab,
          area,
          'smartButton',
          sender.frameId,
          'rewrite',
        ).catch(() => undefined);
      return false;
    }
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
    if (command === CORRECT_COMMAND || command === REWRITE_COMMAND)
      void correctInTab(
        tab,
        area,
        'keyboard',
        0,
        command === REWRITE_COMMAND ? 'rewrite' : 'correct',
      ).catch(() => undefined);
  });
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === MENU_CORRECT || info.menuItemId === MENU_REWRITE)
      void correctInTab(
        tab,
        area,
        'contextMenu',
        info.frameId ?? 0,
        info.menuItemId === MENU_REWRITE ? 'rewrite' : 'correct',
      ).catch(() => undefined);
  });
  chrome.runtime.onInstalled.addListener(() => {
    void installMenu(area).catch(() => undefined);
    void syncSmartScript(area).catch(() => undefined);
  });
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !(STORAGE_KEYS.settings in changes)) return;
    void loadSettings(area)
      .then((settings) =>
        Promise.all([
          chrome.contextMenus.update(MENU_PARENT, {
            visible: settings.triggers.contextMenu,
          }),
          chrome.contextMenus.update(MENU_REWRITE, {
            visible: settings.rewrite.enabled,
          }),
        ]),
      )
      .catch(() => undefined);
    void syncSmartScript(area).catch(() => undefined);
  });
}
