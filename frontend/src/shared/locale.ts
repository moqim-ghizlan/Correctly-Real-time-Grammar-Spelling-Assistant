// 5.13 interface language: which locale to show. No imports, so the settings
// schema can use it without pulling the catalogs in.

export const LOCALES = ['en', 'fr'] as const;
export type Locale = (typeof LOCALES)[number];
export const LANGUAGE_SETTINGS = ['auto', 'fr', 'en'] as const;
export type LanguageSetting = (typeof LANGUAGE_SETTINGS)[number];

export const isLocale = (value: unknown): value is Locale =>
  (LOCALES as readonly unknown[]).includes(value);
export const isLanguageSetting = (value: unknown): value is LanguageSetting =>
  (LANGUAGE_SETTINGS as readonly unknown[]).includes(value);

/** The browser's interface language ("fr-FR", "en-US"…), or "". */
export function browserLanguage(): string {
  try {
    const ui = (
      globalThis as { chrome?: { i18n?: { getUILanguage?: () => string } } }
    ).chrome?.i18n?.getUILanguage?.();
    if (ui) return ui;
  } catch {
    // Not in an extension context (tests, plain pages).
  }
  return typeof navigator === 'object' ? (navigator.language ?? '') : '';
}

/** "auto" → French for a French browser, English otherwise. */
export function resolveLocale(
  setting: unknown,
  language: string = browserLanguage(),
): Locale {
  if (setting === 'fr' || setting === 'en') return setting;
  return /^fr\b/i.test(language) ? 'fr' : 'en';
}
