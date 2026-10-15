import { loadSettings, saveSettings, type Settings } from '../shared/storage';
import { isLanguage } from '../correction/language';
import { lines, siteNames } from '../shared/settings-ui';
const input = (id: string) =>
  document.querySelector<HTMLInputElement>('#' + id)!;
const textarea = (id: string) =>
  document.querySelector<HTMLTextAreaElement>('#' + id)!;
const language = document.querySelector<HTMLSelectElement>('#language')!;
const message = document.querySelector<HTMLElement>('#message')!;
async function initialize() {
  const settings = await loadSettings();
  input('enabled').checked = settings.enabled;
  input('sentence-correction').checked = settings.sentenceCorrection;
  language.value = settings.language;
  input('delay').value = String(settings.debounceMs);
  input('spelling').checked = settings.spellingEnabled;
  input('grammar').checked = settings.grammarEnabled;
  textarea('sites').value = settings.disabledSites.join('\n');
  textarea('dictionary').value = settings.customDictionary.join('\n');
  document.querySelector<HTMLFieldSetElement>('#controls')!.disabled = false;
}
async function save() {
  const settings: Settings = {
    sentenceCorrection: input('sentence-correction').checked,
    enabled: input('enabled').checked,
    language: isLanguage(language.value) ? language.value : 'auto',
    debounceMs: Number(input('delay').value),
    spellingEnabled: input('spelling').checked,
    grammarEnabled: input('grammar').checked,
    disabledSites: [...new Set(siteNames(textarea('sites').value))],
    customDictionary: lines(textarea('dictionary').value),
  };
  await saveSettings(settings);
  message.textContent =
    'Paramètres enregistrés. Ils s’appliquent aux pages ouvertes.';
}
document
  .querySelector<HTMLFormElement>('#settings')!
  .addEventListener('submit', (event) => {
    event.preventDefault();
    void save().catch((error: unknown) => {
      message.textContent =
        error instanceof Error ? error.message : 'Impossible d’enregistrer.';
    });
  });
void initialize().catch(() => {
  message.textContent = 'Impossible de charger les paramètres.';
});
