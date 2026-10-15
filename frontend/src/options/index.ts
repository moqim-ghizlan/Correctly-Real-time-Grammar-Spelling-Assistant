import { TEST_CONNECTION } from '../shared/contracts';
import { browserStorage } from '../shared/storage';
import { SettingsPage } from './settings-ui';

const page = new SettingsPage(document, {
  area: browserStorage(),
  sendTest: () => chrome.runtime.sendMessage({ type: TEST_CONNECTION }),
  confirm: (question) => window.confirm(question),
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
