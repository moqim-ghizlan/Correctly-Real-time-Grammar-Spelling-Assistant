import { loadSettings, saveSettings } from '../shared/storage';
import { isLanguage } from '../correction/language';
import { sendMessage } from '../shared/messages';
const enabled = document.querySelector<HTMLInputElement>('#enabled')!;
const language = document.querySelector<HTMLSelectElement>('#language')!;
const site = document.querySelector<HTMLInputElement>('#site')!;
const message = document.querySelector<HTMLElement>('#message')!;
const server = document.querySelector<HTMLElement>('#server')!;
let hostname: string | undefined;
let queue = Promise.resolve();
async function initialize() {
  const settings = await loadSettings();
  enabled.checked = settings.enabled;
  language.value = settings.language;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.url && /^https?:/.test(tab.url))
    hostname = new URL(tab.url).hostname;
  if (hostname) {
    site.disabled = false;
    site.checked = settings.disabledSites.includes(hostname);
    document.querySelector<HTMLElement>('#site-label')!.textContent =
      'Désactiver sur ' + hostname;
  }
  document.querySelector<HTMLFieldSetElement>('#controls')!.disabled = false;
}
function save(change: 'enabled' | 'language' | 'site') {
  const value = enabled.checked,
    selectedLanguage = language.value,
    disabled = site.checked;
  queue = queue
    .then(async () => {
      const settings = await loadSettings();
      if (change === 'enabled') settings.enabled = value;
      if (change === 'language' && isLanguage(selectedLanguage))
        settings.language = selectedLanguage;
      if (change === 'site' && hostname)
        settings.disabledSites = disabled
          ? [...new Set([...settings.disabledSites, hostname])]
          : settings.disabledSites.filter((site) => site !== hostname);
      await saveSettings(settings);
      message.textContent = 'Paramètres enregistrés.';
    })
    .catch(() => {
      message.textContent = 'Impossible d’enregistrer les paramètres.';
    });
}
async function health() {
  const button = document.querySelector<HTMLButtonElement>('#retry')!;
  button.disabled = true;
  server.textContent = 'Vérification de LanguageTool…';
  try {
    server.textContent = (await sendMessage<boolean>({ type: 'health' }))
      ? 'LanguageTool local disponible.'
      : 'LanguageTool indisponible. Démarrez le serveur local sur le port 8081.';
  } catch {
    server.textContent = 'Impossible de joindre le moteur local.';
  } finally {
    button.disabled = false;
  }
}
enabled.addEventListener('change', () => save('enabled'));
language.addEventListener('change', () => save('language'));
site.addEventListener('change', () => save('site'));
document.querySelector('#retry')!.addEventListener('click', () => {
  void health();
});
document.querySelector('#options')!.addEventListener('click', () => {
  void chrome.runtime.openOptionsPage().catch(() => {
    message.textContent = 'Impossible d’ouvrir les paramètres.';
  });
});
void initialize().catch(() => {
  message.textContent = 'Impossible de charger les paramètres.';
});
void health();
