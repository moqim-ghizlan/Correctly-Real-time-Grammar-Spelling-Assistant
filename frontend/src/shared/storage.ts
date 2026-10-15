import { DEFAULT_DEBOUNCE_MS } from './constants';
import { isLanguage, type Language } from '../correction/language';
export interface Settings {
  sentenceCorrection: boolean;
  enabled: boolean;
  language: Language;
  debounceMs: number;
  spellingEnabled: boolean;
  grammarEnabled: boolean;
  disabledSites: string[];
  customDictionary: string[];
}
export const DEFAULT_SETTINGS: Settings = {
  sentenceCorrection: true,
  enabled: true,
  language: 'auto',
  debounceMs: DEFAULT_DEBOUNCE_MS,
  spellingEnabled: true,
  grammarEnabled: true,
  disabledSites: [],
  customDictionary: [],
};
export function normalizeSettings(value: unknown): Settings {
  const data =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  const boolean = (key: keyof Settings) =>
    typeof data[key] === 'boolean'
      ? data[key]
      : (DEFAULT_SETTINGS[key] as boolean);
  const strings = (key: string) =>
    Array.isArray(data[key])
      ? data[key]
          .filter((item: unknown): item is string => typeof item === 'string')
          .slice(0, 500)
      : [];
  return {
    sentenceCorrection: boolean('sentenceCorrection'),
    enabled: boolean('enabled'),
    language: isLanguage(data.language) ? data.language : 'auto',
    debounceMs:
      typeof data.debounceMs === 'number' && Number.isFinite(data.debounceMs)
        ? data.debounceMs === 400
          ? DEFAULT_DEBOUNCE_MS
          : Math.round(Math.max(0, Math.min(2000, data.debounceMs)))
        : DEFAULT_DEBOUNCE_MS,
    spellingEnabled: boolean('spellingEnabled'),
    grammarEnabled: boolean('grammarEnabled'),
    disabledSites: strings('disabledSites'),
    customDictionary: strings('customDictionary'),
  };
}
export async function loadSettings(): Promise<Settings> {
  const data = await chrome.storage.local.get('settings');
  return normalizeSettings(data.settings);
}
export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ settings: normalizeSettings(settings) });
}
export function enabledOnSite(settings: Settings, hostname: string) {
  return settings.enabled && !settings.disabledSites.includes(hostname);
}
