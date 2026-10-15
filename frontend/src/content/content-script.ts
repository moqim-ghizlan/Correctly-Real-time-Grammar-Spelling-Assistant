import { Application } from './application';
import { loadSettings, normalizeSettings } from '../shared/storage';
import { checkViaBackground } from '../shared/messages';
import { logger } from '../shared/logger';
import {
  loadShortcuts,
  SHORTCUT_KEY,
  EMPTY_SHORTCUTS,
  type ShortcutSettings,
} from '../shared/shortcuts';
let application: Application | undefined;
let generation = 0;
function start(
  settings: ReturnType<typeof normalizeSettings>,
  shortcuts: ShortcutSettings,
) {
  application?.dispose();
  application = new Application(settings, checkViaBackground, shortcuts);
  application.start();
}
async function reload() {
  const token = ++generation;
  const [settings, shortcuts] = await Promise.all([
    loadSettings(),
    loadShortcuts().catch(() => ({ ...EMPTY_SHORTCUTS, enabled: false })),
  ]);
  if (token === generation) start(settings, shortcuts);
}
void reload().catch(() => logger.warn('Impossible de charger les paramètres.'));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.settings || changes[SHORTCUT_KEY])) {
    void reload().catch(() =>
      logger.warn('Impossible de charger les paramètres.'),
    );
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
