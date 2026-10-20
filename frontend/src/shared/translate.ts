import { MAX_CORRECTION_CODE_POINTS, TRANSLATE_TEXT } from './contracts';
import {
  formalityKeysValid,
  normalizeStyleIds,
  type Formality,
  type RewriteStyleId,
} from './rewrite';

/**
 * Stable text languages (IDs never localized): the V5.5 six first, then the
 * 5.16 curated catalog. `label` is the English name sent to the model.
 * Menus sort them by the interface language (see shared/language-menu.ts).
 */
export const LANGUAGES = [
  { id: 'fr', label: 'French', native: 'Français', rtl: false },
  { id: 'en', label: 'English', native: 'English', rtl: false },
  { id: 'ar', label: 'Arabic', native: 'العربية', rtl: true },
  { id: 'tr', label: 'Turkish', native: 'Türkçe', rtl: false },
  { id: 'de', label: 'German', native: 'Deutsch', rtl: false },
  { id: 'es', label: 'Spanish', native: 'Español', rtl: false },
  // Europe
  { id: 'pt', label: 'Portuguese', native: 'Português', rtl: false },
  { id: 'it', label: 'Italian', native: 'Italiano', rtl: false },
  { id: 'nl', label: 'Dutch', native: 'Nederlands', rtl: false },
  { id: 'pl', label: 'Polish', native: 'Polski', rtl: false },
  { id: 'ro', label: 'Romanian', native: 'Română', rtl: false },
  { id: 'el', label: 'Greek', native: 'Ελληνικά', rtl: false },
  { id: 'sv', label: 'Swedish', native: 'Svenska', rtl: false },
  { id: 'da', label: 'Danish', native: 'Dansk', rtl: false },
  { id: 'no', label: 'Norwegian', native: 'Norsk', rtl: false },
  { id: 'fi', label: 'Finnish', native: 'Suomi', rtl: false },
  { id: 'cs', label: 'Czech', native: 'Čeština', rtl: false },
  { id: 'hu', label: 'Hungarian', native: 'Magyar', rtl: false },
  { id: 'uk', label: 'Ukrainian', native: 'Українська', rtl: false },
  { id: 'ru', label: 'Russian', native: 'Русский', rtl: false },
  { id: 'bg', label: 'Bulgarian', native: 'Български', rtl: false },
  { id: 'sr', label: 'Serbian', native: 'Српски', rtl: false },
  { id: 'hr', label: 'Croatian', native: 'Hrvatski', rtl: false },
  // Middle East / Africa (Kurdish: the direction comes from its variant)
  { id: 'he', label: 'Hebrew', native: 'עברית', rtl: true },
  { id: 'fa', label: 'Persian', native: 'فارسی', rtl: true },
  { id: 'ku', label: 'Kurdish', native: 'Kurdî', rtl: false },
  { id: 'sw', label: 'Swahili', native: 'Kiswahili', rtl: false },
  { id: 'am', label: 'Amharic', native: 'አማርኛ', rtl: false },
  // South / Southeast Asia
  { id: 'hi', label: 'Hindi', native: 'हिन्दी', rtl: false },
  { id: 'ur', label: 'Urdu', native: 'اردو', rtl: true },
  { id: 'bn', label: 'Bengali', native: 'বাংলা', rtl: false },
  { id: 'id', label: 'Indonesian', native: 'Bahasa Indonesia', rtl: false },
  { id: 'ms', label: 'Malay', native: 'Bahasa Melayu', rtl: false },
  { id: 'vi', label: 'Vietnamese', native: 'Tiếng Việt', rtl: false },
  { id: 'th', label: 'Thai', native: 'ไทย', rtl: false },
  { id: 'fil', label: 'Filipino', native: 'Filipino', rtl: false },
  // East Asia
  { id: 'zh', label: 'Chinese', native: '中文', rtl: false },
  { id: 'ja', label: 'Japanese', native: '日本語', rtl: false },
  { id: 'ko', label: 'Korean', native: '한국어', rtl: false },
] as const;
export type LanguageId = (typeof LANGUAGES)[number]['id'];
export type SourceLanguage = LanguageId | 'auto';

const COLLOQUIAL =
  'in Arabic script, as people actually speak and text; do NOT use Modern Standard Arabic, avoid caricature and transliteration';

/**
 * 5.16: variants of a target (the V5.5 Arabic variant, generalized). IDs are
 * unique across languages; the first one is the default; `rtl` overrides
 * the language's direction; `lang` is the BCP 47 tag of the result.
 */
export const VARIANTS = {
  ar: [
    {
      id: 'msa',
      label: 'Modern Standard Arabic',
      prompt:
        'clear Modern Standard Arabic (pan-regional standard written Arabic)',
      lang: 'ar',
    },
    {
      id: 'syrian',
      label: 'Syrian colloquial',
      prompt:
        'natural contemporary Syrian colloquial Arabic (Levantine dialect) in Arabic script, as Syrians actually speak and text; do NOT use Modern Standard Arabic, avoid caricature and transliteration',
      lang: 'ar-SY',
    },
    {
      id: 'egyptian',
      label: 'Egyptian colloquial',
      prompt: `natural contemporary Egyptian colloquial Arabic (Masri) ${COLLOQUIAL}`,
      lang: 'ar-EG',
    },
    {
      id: 'moroccan',
      label: 'Moroccan (Darija)',
      prompt: `natural contemporary Moroccan Arabic (Darija) ${COLLOQUIAL}`,
      lang: 'ar-MA',
    },
    {
      id: 'lebanese',
      label: 'Lebanese colloquial',
      prompt: `natural contemporary Lebanese colloquial Arabic (Levantine dialect) ${COLLOQUIAL}`,
      lang: 'ar-LB',
    },
    {
      id: 'gulf',
      label: 'Gulf (Khaleeji)',
      prompt: `natural contemporary Gulf Arabic (Khaleeji, as spoken in Saudi Arabia, the UAE, Kuwait, Qatar, Bahrain and Oman) ${COLLOQUIAL}`,
      lang: 'ar-AE',
    },
  ],
  pt: [
    {
      id: 'pt_br',
      label: 'Brazil',
      prompt:
        'Brazilian Portuguese (Brazilian spelling, vocabulary and grammar)',
      lang: 'pt-BR',
    },
    {
      id: 'pt_pt',
      label: 'Portugal',
      prompt:
        'European Portuguese as written in Portugal (European spelling, vocabulary and grammar)',
      lang: 'pt-PT',
    },
  ],
  zh: [
    {
      id: 'zh_hans',
      label: 'Simplified',
      prompt: 'Simplified Chinese characters (Mainland China usage)',
      lang: 'zh-Hans',
    },
    {
      id: 'zh_hant',
      label: 'Traditional',
      prompt:
        'Traditional Chinese characters (Taiwan and Hong Kong usage); never Simplified characters',
      lang: 'zh-Hant',
    },
  ],
  ku: [
    {
      id: 'kmr',
      label: 'Kurmanji (Latin script)',
      prompt: 'Northern Kurdish (Kurmanji) in the Latin (Hawar) alphabet',
      lang: 'kmr',
    },
    {
      id: 'ckb',
      label: 'Sorani (Arabic script)',
      prompt: 'Central Kurdish (Sorani) in the Arabic-based Kurdish alphabet',
      lang: 'ckb',
      rtl: true,
    },
  ],
} as const;
export type VariantLanguage = keyof typeof VARIANTS;
type VariantOf<L extends VariantLanguage> = (typeof VARIANTS)[L][number]['id'];
export type VariantId = VariantOf<VariantLanguage>;
interface Variant {
  id: VariantId;
  label: string;
  prompt: string;
  lang: string;
  rtl?: boolean;
}

/** Kept for V5.5–5.15 code and stored preferences. */
export const ARABIC_VARIANTS = VARIANTS.ar;
export type ArabicVariant = VariantOf<'ar'>;

export const VARIANT_LANGUAGES = Object.keys(VARIANTS) as VariantLanguage[];
export const ALL_VARIANTS: readonly Variant[] = Object.values(VARIANTS).flat();

export const isLanguageId = (value: unknown): value is LanguageId =>
  LANGUAGES.some((language) => language.id === value);
export const hasVariants = (id: unknown): id is VariantLanguage =>
  typeof id === 'string' && Object.hasOwn(VARIANTS, id);
export const variantsOf = (id: LanguageId): readonly Variant[] =>
  hasVariants(id) ? VARIANTS[id] : [];
export const isVariantId = (value: unknown): value is VariantId =>
  ALL_VARIANTS.some((variant) => variant.id === value);
/** A variant ID that belongs to this very language. */
export const isVariantOf = <L extends VariantLanguage>(
  language: L,
  value: unknown,
): value is VariantOf<L> =>
  VARIANTS[language].some((variant) => variant.id === value);
export const isArabicVariant = (value: unknown): value is ArabicVariant =>
  isVariantOf('ar', value);

/** The exact `variant` field rule of the request guards. */
export const variantFits = (target: LanguageId, variant: unknown): boolean =>
  hasVariants(target) ? isVariantOf(target, variant) : variant === null;

/** A menu value → the request's `variant` field for this target. */
export const variantFor = (
  target: LanguageId,
  value: unknown,
): VariantId | null =>
  hasVariants(target) && isVariantOf(target, value) ? value : null;

const languageOf = (id: LanguageId) =>
  LANGUAGES.find((language) => language.id === id);
const variantOf = (target: LanguageId, variant: VariantId | null) =>
  variantsOf(target).find((item) => item.id === variant);

export const languageLabel = (id: LanguageId): string =>
  languageOf(id)?.label ?? id;

/** e.g. "Arabic (Syrian colloquial)", "Portuguese (Brazil)". */
export function targetLabel(
  target: LanguageId,
  variant: VariantId | null,
): string {
  const name = languageLabel(target);
  const label = variantOf(target, variant)?.label;
  return label ? `${name} (${label})` : name;
}

/** Instruction text: allowlisted names and prompts only, never page text. */
export function targetPrompt(
  target: LanguageId,
  variant: VariantId | null,
): string {
  const name = languageLabel(target);
  const chosen = variantOf(target, variant);
  return chosen ? `${name} — ${chosen.prompt}` : name;
}

/** Writing direction of a result in this target (the variant's first). */
export function isRtl(target: LanguageId, variant: VariantId | null): boolean {
  return variantOf(target, variant)?.rtl ?? languageOf(target)?.rtl ?? false;
}

/** BCP 47 tag of a result in this target, for the `lang` attribute. */
export const langTag = (
  target: LanguageId,
  variant: VariantId | null,
): string => variantOf(target, variant)?.lang ?? target;

/** Key of the single neutral translation (no style requested). */
export const NEUTRAL = 'neutral';
export type TranslationKey = RewriteStyleId | typeof NEUTRAL;

export type TargetVariants = { [L in VariantLanguage]: VariantOf<L> };
/** "Your languages", shown first in every target menu (5.16). */
export const MAX_FAVORITES = 12;

export interface TranslationPreferences {
  source: SourceLanguage;
  target: LanguageId;
  /** 5.16: preferred variant of each language that has variants. */
  variants: TargetVariants;
  favorites: LanguageId[];
  /**
   * 5.15 field, always equal to `variants.ar`: still written so a 5.15
   * computer synced with this one keeps its Arabic variant.
   */
  arabicVariant: ArabicVariant;
}

const DEFAULT_VARIANTS = Object.fromEntries(
  VARIANT_LANGUAGES.map((language) => [language, VARIANTS[language][0].id]),
) as TargetVariants;

export const DEFAULT_TRANSLATION: TranslationPreferences = {
  source: 'auto',
  target: 'en',
  variants: DEFAULT_VARIANTS,
  // Owner decision D4: the six V5.5 languages.
  favorites: ['fr', 'en', 'ar', 'tr', 'de', 'es'],
  arabicVariant: DEFAULT_VARIANTS.ar,
};

/** The preferred variant for this target, or null when it has none. */
export const preferredVariant = (
  prefs: Pick<TranslationPreferences, 'variants'>,
  target: LanguageId,
): VariantId | null => (hasVariants(target) ? prefs.variants[target] : null);

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** Untrusted favorites → unique catalog IDs, at most MAX_FAVORITES. */
export function normalizeFavorites(value: unknown): LanguageId[] {
  if (!Array.isArray(value)) return [...DEFAULT_TRANSLATION.favorites];
  return [...new Set(value.filter(isLanguageId))].slice(0, MAX_FAVORITES);
}

/**
 * Untrusted stored values → valid preferences (unknown IDs fall back, e.g. a
 * language synced from a newer version). A 5.15 `arabicVariant` is read as
 * the Arabic variant when no 5.16 one is stored.
 */
export function normalizeTranslation(value: unknown): TranslationPreferences {
  const data = record(value);
  const stored = record(data.variants);
  const variants = Object.fromEntries(
    VARIANT_LANGUAGES.map((language) => {
      const wanted =
        language === 'ar' && !isVariantOf('ar', stored.ar)
          ? data.arabicVariant
          : stored[language];
      return [
        language,
        isVariantOf(language, wanted) ? wanted : DEFAULT_VARIANTS[language],
      ];
    }),
  ) as TargetVariants;
  return {
    source:
      data.source === 'auto' || isLanguageId(data.source)
        ? data.source
        : DEFAULT_TRANSLATION.source,
    target: isLanguageId(data.target)
      ? data.target
      : DEFAULT_TRANSLATION.target,
    variants,
    favorites: normalizeFavorites(data.favorites),
    arabicVariant: variants.ar,
  };
}

export interface TranslateTextRequest {
  type: typeof TRANSLATE_TEXT;
  text: string;
  source: SourceLanguage;
  target: LanguageId;
  // Required for a target with variants (one of its own), null otherwise.
  variant: VariantId | null;
  // Empty = faithful neutral translation; otherwise translate & rewrite.
  styleIds: RewriteStyleId[];
  /** Present exactly when styleIds includes 'custom'. */
  formality?: Formality;
}

/**
 * Exact shape and only valid combinations: known languages, a variant only
 * for a target that has variants (and one of its own), source ≠ target, 0–8 unique known styles (a formality level
 * exactly with the custom style), bounded text.
 */
export function isTranslateTextRequest(
  value: unknown,
): value is TranslateTextRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  return (
    formalityKeysValid(data, 'source,styleIds,target,text,type,variant') &&
    data.type === TRANSLATE_TEXT &&
    typeof data.text === 'string' &&
    data.text.trim() !== '' &&
    [...data.text].length <= MAX_CORRECTION_CODE_POINTS &&
    (data.source === 'auto' || isLanguageId(data.source)) &&
    isLanguageId(data.target) &&
    data.source !== data.target &&
    variantFits(data.target, data.variant) &&
    Array.isArray(data.styleIds) &&
    normalizeStyleIds(data.styleIds).length === data.styleIds.length
  );
}

/** Keys the model must answer with for this request. */
export const translationKeys = (
  styleIds: readonly RewriteStyleId[],
): TranslationKey[] => (styleIds.length ? [...styleIds] : [NEUTRAL]);
