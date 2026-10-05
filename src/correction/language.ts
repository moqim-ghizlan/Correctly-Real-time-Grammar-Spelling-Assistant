export type Language = 'auto' | 'fr' | 'en';
export function isLanguage(value: unknown): value is Language {
  return value === 'auto' || value === 'fr' || value === 'en';
}
