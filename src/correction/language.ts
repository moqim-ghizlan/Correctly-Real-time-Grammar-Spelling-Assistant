export type Language = 'auto' | 'fr' | 'en';
export type SupportedLanguage = Exclude<Language, 'auto'>;
export function isLanguage(value: unknown): value is Language {
  return value === 'auto' || value === 'fr' || value === 'en';
}
export function isSupportedLanguageCode(value: unknown): value is string {
  return typeof value === 'string' && /^(fr|en)(?:-|$)/.test(value);
}
const FRENCH_WORDS = new Set(
  'je tu il elle nous vous ils elles suis sui sommes êtes sont était étaient avoir être avec dans pour une des les le la mon ma mes ton ta tes son sa ses ce cette ces bonjour salut merci oui non aller vais va vont fait faire ici hier demain'.split(
    ' ',
  ),
);
const ENGLISH_WORDS = new Set(
  'i you he she we they am is are was were be been being have has had with in for the my your his her our their this that these those hello hi thanks thank yes not go goes went going do does did doing can could will would should here yesterday tomorrow car school world'.split(
    ' ',
  ),
);
// A small preference hint for ambiguous short text, not a replacement for the engine's detector.
export function preferredAutoLanguage(text: string): SupportedLanguage {
  const words = text.toLocaleLowerCase('fr').match(/[\p{L}]+/gu) ?? [];
  let french = 0,
    english = 0;
  for (const word of words) {
    if (FRENCH_WORDS.has(word)) french++;
    if (ENGLISH_WORDS.has(word)) english++;
    if (/[àâçéèêëîïôùûüœ]/.test(word)) french++;
  }
  return english > french ? 'en' : 'fr';
}
export function autoPreferredLanguages(text: string): string {
  return preferredAutoLanguage(text) === 'en' ? 'en,fr' : 'fr,en';
}
