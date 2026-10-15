import {
  CORRECT_COMMAND,
  SMART_BUTTON_OFF,
  TEST_CONNECTION,
} from '../shared/contracts';
import { loadShortcuts } from '../shared/shortcuts';
import { browserStorage, loadSettings } from '../shared/storage';
import { SettingsPage } from './settings-ui';
import { ShortcutsSection } from './shortcuts-ui';

const area = browserStorage();
const ALL_SITES = { origins: ['<all_urls>'] };
/** All-sites access stays while the smart button or shortcuts need it. */
const releaseSiteAccess = async () => {
  const [settings, shortcuts] = await Promise.all([
    loadSettings(area),
    loadShortcuts(area),
  ]);
  if (!settings.triggers.smartButton && !shortcuts.store.enabled)
    await chrome.permissions.remove(ALL_SITES);
};

const page = new SettingsPage(document, {
  area,
  sendTest: () => chrome.runtime.sendMessage({ type: TEST_CONNECTION }),
  confirm: (question) => window.confirm(question),
  getShortcut: async () =>
    (await chrome.commands.getAll()).find(
      (command) => command.name === CORRECT_COMMAND,
    )?.shortcut ?? '',
  openShortcuts: () =>
    void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }),
  // The worker (re)registers or unregisters the script when the setting
  // changes; this page only handles the permission and open tabs.
  enableSmartButton: () => chrome.permissions.request(ALL_SITES),
  disableSmartButton: async () => {
    for (const tab of await chrome.tabs.query({}))
      if (typeof tab.id === 'number')
        void chrome.tabs
          .sendMessage(tab.id, { type: SMART_BUTTON_OFF })
          .catch(() => undefined);
    await releaseSiteAccess();
  },
});

const shortcuts = new ShortcutsSection(document, {
  area,
  confirm: (question) => window.confirm(question),
  requestSiteAccess: () => chrome.permissions.request(ALL_SITES),
  hasSiteAccess: () => chrome.permissions.contains(ALL_SITES),
  releaseSiteAccess,
  download: (filename, text) => {
    const url = URL.createObjectURL(
      new Blob([text], { type: 'application/json' }),
    );
    const link = Object.assign(document.createElement('a'), {
      href: url,
      download: filename,
    });
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  page.onStorageChanged(Object.keys(changes));
  shortcuts.onStorageChanged(Object.keys(changes));
});

// Never leave a revealed key on screen when the tab is hidden or left.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') page.hideKey();
});
window.addEventListener('pagehide', () => page.hideKey(true));

// Local midnight rollover: re-render the counter without any network access.
setInterval(() => page.renderUsage(), 60_000);

void page.init();
void shortcuts.init();
