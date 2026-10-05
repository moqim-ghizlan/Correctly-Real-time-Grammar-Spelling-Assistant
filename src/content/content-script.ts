import { Application } from './application';
import { loadSettings, normalizeSettings } from '../shared/storage';
import { checkViaBackground } from '../shared/messages';
import { logger } from '../shared/logger';
let application: Application | undefined;
let generation = 0;
function start(settings: ReturnType<typeof normalizeSettings>) {
  application?.dispose();
  application = new Application(settings, checkViaBackground);
  application.start();
}
async function reload() {
  const token = ++generation;
  const settings = await loadSettings();
  if (token === generation) start(settings);
}
void reload().catch(() => logger.warn('Impossible de charger les paramètres.'));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) {
    generation++;
    start(normalizeSettings(changes.settings.newValue));
  }
});
chrome.runtime.onMessage.addListener((raw: unknown, _sender, reply) => {
  if (
    raw &&
    typeof raw === 'object' &&
    'type' in raw &&
    raw.type === 'apply-context'
  ) {
    application?.applyContext();
    reply({ ok: true });
  }
});
window.addEventListener('pagehide', () => {
  generation++;
  application?.dispose();
  application = undefined;
});
window.addEventListener('pageshow', (event) => {
  if (event.persisted) void reload().catch(() => {});
});
