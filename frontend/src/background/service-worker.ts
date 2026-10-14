import { LanguageToolClient } from '../correction/languagetool-client';
import { isLanguage } from '../correction/language';
import {
  createContextMenu,
  handleContextClick,
  updateContextMenu,
} from '../context-menu/context-menu';
import { loadSettings, enabledOnSite } from '../shared/storage';
import {
  LANGUAGE_TOOL_BASE_URL,
  REQUEST_TIMEOUT_MS,
} from '../shared/constants';
import { logger } from '../shared/logger';
const client = new LanguageToolClient();
let menuQueue = Promise.resolve();
chrome.runtime.onInstalled.addListener(() => {
  void chrome.contextMenus
    .removeAll()
    .then(createContextMenu)
    .catch(() => logger.warn('Menu indisponible.'));
});
chrome.runtime.onStartup.addListener(() => {
  void updateContextMenu(undefined).catch(() =>
    logger.warn('Menu indisponible.'),
  );
});
chrome.contextMenus.onClicked.addListener((info, tab) => {
  void handleContextClick(info, tab).catch(() => {
    /* The tab may have closed. */
  });
});
async function health(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return (
      await fetch(LANGUAGE_TOOL_BASE_URL + '/v2/languages', {
        signal: controller.signal,
        credentials: 'omit',
        redirect: 'error',
      })
    ).ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
chrome.runtime.onMessage.addListener((raw: unknown, sender, reply) => {
  if (sender.id !== chrome.runtime.id || !raw || typeof raw !== 'object')
    return false;
  const message = raw as Record<string, unknown>;
  if (message.type === 'health' && !sender.tab) {
    void health().then(reply);
    return true;
  }
  if (
    message.type === 'check' &&
    sender.tab &&
    typeof message.text === 'string' &&
    isLanguage(message.language)
  ) {
    const text = message.text,
      language = message.language;
    void (async () => {
      const settings = await loadSettings();
      const hostname = new URL(sender.tab?.url ?? sender.url ?? '').hostname;
      if (!enabledOnSite(settings, hostname))
        return { status: 'ready', matches: [] };
      return client.checkText(text, language);
    })()
      .then(reply)
      .catch(() => reply({ status: 'unavailable', matches: [] }));
    return true;
  }
  if (message.type === 'context' && sender.tab) {
    const suggestion =
      typeof message.fieldId === 'string' &&
      typeof message.offset === 'number' &&
      typeof message.suggestion === 'string'
        ? message.suggestion
        : undefined;
    menuQueue = menuQueue
      .then(() => updateContextMenu(suggestion))
      .catch(() => {
        /* Menu can be unavailable during installation. */
      });
    void menuQueue.then(() => reply({ ok: true }));
    return true;
  }
  return false;
});
chrome.tabs.onActivated.addListener(() => {
  void updateContextMenu(undefined).catch(() => {});
});
