import { MAX_CORRECTION_CODE_POINTS, TRANSLATE_TEXT } from './contracts';
import { normalizeStyleIds, type RewriteStyleId } from './rewrite';

/** Stable target languages (IDs never localized), in display order. */
export const LANGUAGES = [
  { id: 'fr', label: 'French', native: 'Français', rtl: false },
  { id: 'en', label: 'English', native: 'English', rtl: false },
  { id: 'ar', label: 'Arabic', native: 'العربية', rtl: true },
  { id: 'tr', label: 'Turkish', native: 'Türkçe', rtl: false },
  { id: 'de', label: 'German', native: 'Deutsch', rtl: false },
  { id: 'es', label: 'Spanish', native: 'Español', rtl: false },
] as const;
export type LanguageId = (typeof LANGUAGES)[number]['id'];
export type SourceLanguage = LanguageId | 'auto';

/** Offered only when the target is Arabic. */
export const ARABIC_VARIANTS = [
  {
    id: 'msa',
    label: 'Modern Standard Arabic',
    prompt:
      'clear Modern Standard Arabic (pan-regional standard written Arabic)',
  },
  {
    id: 'syrian',
    label: 'Syrian colloquial',
    prompt:
      'natural contemporary Syrian colloquial Arabic (Levantine dialect) in Arabic script, as Syrians actually speak and text; do NOT use Modern Standard Arabic, avoid caricature and transliteration',
  },
] as const;
export type ArabicVariant = (typeof ARABIC_VARIANTS)[number]['id'];

export const isLanguageId = (value: unknown): value is LanguageId =>
  LANGUAGES.some((language) => language.id === value);
export const isArabicVariant = (value: unknown): value is ArabicVariant =>
  ARABIC_VARIANTS.some((variant) => variant.id === value);

export const languageLabel = (id: LanguageId): string =>
  LANGUAGES.find((language) => language.id === id)?.label ?? id;

/** e.g. "Arabic (Syrian colloquial)". */
export function targetLabel(
  target: LanguageId,
  variant: ArabicVariant | null,
): string {
  const name = languageLabel(target);
  const dialect = ARABIC_VARIANTS.find((item) => item.id === variant)?.label;
  return target === 'ar' && dialect ? `${name} (${dialect})` : name;
}

/** Key of the single neutral translation (no style requested). */
export const NEUTRAL = 'neutral';
export type TranslationKey = RewriteStyleId | typeof NEUTRAL;

export interface TranslationPreferences {
  source: SourceLanguage;
  target: LanguageId;
  arabicVariant: ArabicVariant;
}

export const DEFAULT_TRANSLATION: TranslationPreferences = {
  source: 'auto',
  target: 'en',
  arabicVariant: 'msa',
};

/** Untrusted stored values → valid preferences (unknown IDs fall back). */
export function normalizeTranslation(value: unknown): TranslationPreferences {
  const data =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return {
    source:
      data.source === 'auto' || isLanguageId(data.source)
        ? data.source
        : DEFAULT_TRANSLATION.source,
    target: isLanguageId(data.target)
      ? data.target
      : DEFAULT_TRANSLATION.target,
    arabicVariant: isArabicVariant(data.arabicVariant)
      ? data.arabicVariant
      : DEFAULT_TRANSLATION.arabicVariant,
  };
}

export interface TranslateTextRequest {
  type: typeof TRANSLATE_TEXT;
  text: string;
  source: SourceLanguage;
  target: LanguageId;
  // Required (msa | syrian) for Arabic, null for every other target.
  variant: ArabicVariant | null;
  // Empty = faithful neutral translation; otherwise translate & rewrite.
  styleIds: RewriteStyleId[];
}

/**
 * Exact shape and only valid combinations: known languages, a variant only
 * for Arabic, source ≠ target, 0–7 unique known styles, bounded text.
 */
export function isTranslateTextRequest(
  value: unknown,
): value is TranslateTextRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  return (
    Object.keys(data).sort().join() ===
      'source,styleIds,target,text,type,variant' &&
    data.type === TRANSLATE_TEXT &&
    typeof data.text === 'string' &&
    data.text.trim() !== '' &&
    [...data.text].length <= MAX_CORRECTION_CODE_POINTS &&
    (data.source === 'auto' || isLanguageId(data.source)) &&
    isLanguageId(data.target) &&
    data.source !== data.target &&
    (data.target === 'ar'
      ? isArabicVariant(data.variant)
      : data.variant === null) &&
    Array.isArray(data.styleIds) &&
    normalizeStyleIds(data.styleIds).length === data.styleIds.length
  );
}

/** Keys the model must answer with for this request. */
export const translationKeys = (
  styleIds: readonly RewriteStyleId[],
): TranslationKey[] => (styleIds.length ? [...styleIds] : [NEUTRAL]);
