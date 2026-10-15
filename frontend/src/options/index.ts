import {
  CORRECT_COMMAND,
  SMART_BUTTON_OFF,
  TEST_CONNECTION,
} from '../shared/contracts';
import { browserStorage } from '../shared/storage';
import { SettingsPage } from './settings-ui';

const page = new SettingsPage(document, {
  area: browserStorage(),
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
  enableSmartButton: () =>
    chrome.permissions.request({ origins: ['<all_urls>'] }),
  disableSmartButton: async () => {
    await chrome.permissions.remove({ origins: ['<all_urls>'] });
    for (const tab of await chrome.tabs.query({}))
      if (typeof tab.id === 'number')
        void chrome.tabs
          .sendMessage(tab.id, { type: SMART_BUTTON_OFF })
          .catch(() => undefined);
  },
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local') page.onStorageChanged(Object.keys(changes));
});

// Never leave a revealed key on screen when the tab is hidden or left.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') page.hideKey();
});
window.addEventListener('pagehide', () => page.hideKey(true));

// Local midnight rollover: re-render the counter without any network access.
setInterval(() => page.renderUsage(), 60_000);

void page.init();
