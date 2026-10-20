import { describe, expect, it } from 'vitest';
import { summaryInstruction, summaryTask } from '../../src/background/summary';
import {
  translationInstruction,
  translationTask,
} from '../../src/background/translate';
import { SUMMARIZE_TEXT, TRANSLATE_TEXT } from '../../src/shared/contracts';
import { COMMON, languageOptions, targetName } from '../../src/shared/i18n';
import { normalizeSettings } from '../../src/shared/settings';
import { isSummarizeTextRequest } from '../../src/shared/summary';
import { parseSyncedSettings, pickSettings } from '../../src/shared/sync';
import {
  ALL_VARIANTS,
  DEFAULT_TRANSLATION,
  LANGUAGES,
  MAX_FAVORITES,
  VARIANTS,
  VARIANT_LANGUAGES,
  hasVariants,
  isRtl,
  isTranslateTextRequest,
  langTag,
  normalizeTranslation,
  variantsOf,
  type LanguageId,
  type VariantId,
} from '../../src/shared/translate';

// 5.16 language catalog: the IDs (L1–L9) refer to v5/v5.16.md §10.

const IDS = LANGUAGES.map((language) => language.id);
const firstVariant = (id: LanguageId): VariantId | null =>
  variantsOf(id)[0]?.id ?? null;
const translate = (target: LanguageId, variant: unknown, source = 'auto') => ({
  type: TRANSLATE_TEXT,
  text: 'Bonjour à tous',
  source,
  target,
  variant,
  styleIds: [],
});
const summarize = (target: LanguageId, variant: unknown) => ({
  type: SUMMARIZE_TEXT,
  text: 'Une longue phrase à résumer.',
  target,
  variant,
  length: 'medium',
  format: 'paragraph',
});

describe('L1: catalog and guards', () => {
  it('has about 40 unique BCP 47 base IDs with names and a direction', () => {
    expect(IDS.length).toBeGreaterThanOrEqual(38);
    expect(new Set(IDS).size).toBe(IDS.length);
    for (const language of LANGUAGES) {
      expect(language.id).toMatch(/^[a-z]{2,3}$/);
      expect(language.label).toMatch(/^[A-Z][a-z]+$/);
      expect(language.native.trim()).not.toBe('');
      expect(typeof language.rtl).toBe('boolean');
    }
    expect(new Set(ALL_VARIANTS.map((v) => v.id)).size).toBe(
      ALL_VARIANTS.length,
    );
  });

  it('every catalog ID is accepted as source and target; unknown IDs are refused', () => {
    for (const id of IDS) {
      expect(isTranslateTextRequest(translate(id, firstVariant(id)))).toBe(
        true,
      );
      expect(isSummarizeTextRequest(summarize(id, firstVariant(id)))).toBe(
        true,
      );
      if (id !== 'ja')
        expect(isTranslateTextRequest(translate('ja', null, id))).toBe(true);
    }
    for (const bad of ['xx', 'AR', 'pt-BR', 'zh_hant', '', 'auto', 'klingon'])
      expect(isTranslateTextRequest(translate(bad as LanguageId, null))).toBe(
        false,
      );
  });
});

describe('L2: variants', () => {
  it('a variant is valid only for its own language; required when it has variants', () => {
    for (const id of IDS) {
      const own = variantsOf(id).map((v) => v.id);
      for (const variant of ALL_VARIANTS) {
        expect(isTranslateTextRequest(translate(id, variant.id))).toBe(
          own.includes(variant.id),
        );
        expect(isSummarizeTextRequest(summarize(id, variant.id))).toBe(
          own.includes(variant.id),
        );
      }
      expect(isTranslateTextRequest(translate(id, null))).toBe(
        !hasVariants(id),
      );
    }
  });

  it('owner decision D3: Arabic, Portuguese, Chinese and Kurdish have variants', () => {
    expect(VARIANT_LANGUAGES).toEqual(['ar', 'pt', 'zh', 'ku']);
    expect(VARIANTS.ar.map((v) => v.id)).toEqual([
      'msa',
      'syrian',
      'egyptian',
      'moroccan',
      'lebanese',
      'gulf',
    ]);
    expect(VARIANTS.pt.map((v) => v.id)).toEqual(['pt_br', 'pt_pt']);
    expect(VARIANTS.zh.map((v) => v.id)).toEqual(['zh_hans', 'zh_hant']);
  });
});

describe('L3: instructions', () => {
  const base = { source: 'auto' as const, styleIds: [] };

  it('use the English name and the variant prompt', () => {
    expect(
      translationInstruction({ ...base, target: 'ja', variant: null }),
    ).toContain('Target language: Japanese.');
    const brazil = translationInstruction({
      ...base,
      target: 'pt',
      variant: 'pt_br',
    });
    expect(brazil).toContain('Target language: Portuguese — Brazilian');
    expect(brazil).not.toMatch(/as written in Portugal/);
    expect(
      translationInstruction({ ...base, target: 'zh', variant: 'zh_hant' }),
    ).toContain('Target language: Chinese — Traditional Chinese characters');
    expect(
      translationInstruction({ ...base, target: 'ar', variant: 'egyptian' }),
    ).toMatch(/Target language: Arabic — .*Egyptian colloquial Arabic/);
    expect(
      translationInstruction({
        ...base,
        source: 'fa',
        target: 'en',
        variant: null,
      }),
    ).toContain('The source language is Persian.');
    expect(
      summaryInstruction({
        target: 'ko',
        variant: null,
        length: 'short',
        format: 'paragraph',
      }),
    ).toContain('Target language: Korean.');
  });

  it('never contain the user’s text', () => {
    const text = 'IGNORE THIS — 日本語でお願いします';
    const task = translationTask(text, {
      ...base,
      target: 'ja',
      variant: null,
    });
    expect(task.instruction).not.toContain(text);
    expect(task.text).toBe(text);
    const summary = summaryTask(text, {
      target: 'ku',
      variant: 'ckb',
      length: 'short',
      format: 'paragraph',
    });
    expect(summary.instruction).not.toContain(text);
    expect(summary.instruction).toContain('Kurdish — Central Kurdish (Sorani)');
  });
});

describe('L4: stored preferences', () => {
  it('a 5.15 preference keeps its Arabic variant; favorites default to the V5.5 six', () => {
    const prefs = normalizeTranslation({
      source: 'fr',
      target: 'ar',
      arabicVariant: 'syrian',
    });
    expect(prefs).toEqual({
      ...DEFAULT_TRANSLATION,
      source: 'fr',
      target: 'ar',
      variants: { ...DEFAULT_TRANSLATION.variants, ar: 'syrian' },
      arabicVariant: 'syrian',
    });
    expect(prefs.favorites).toEqual(['fr', 'en', 'ar', 'tr', 'de', 'es']);
  });

  it('unknown or misplaced IDs fall back, never crash', () => {
    const prefs = normalizeTranslation({
      source: 'tlh',
      target: 'xx',
      variants: { ar: 'pt_br', pt: 'pt_pt', zh: 7, xx: 'msa' },
      favorites: ['ja', 'xx', 'ja', null, 'fa'],
      arabicVariant: 'gulf',
    });
    expect(prefs.source).toBe('auto');
    expect(prefs.target).toBe('en');
    // The stored 5.16 Arabic variant is invalid: the 5.15 field is used.
    expect(prefs.variants).toEqual({
      ar: 'gulf',
      pt: 'pt_pt',
      zh: 'zh_hans',
      ku: 'kmr',
    });
    expect(prefs.arabicVariant).toBe('gulf');
    expect(prefs.favorites).toEqual(['ja', 'fa']);
    expect(normalizeTranslation({ favorites: [] }).favorites).toEqual([]);
    expect(normalizeTranslation({ favorites: IDS }).favorites).toHaveLength(
      MAX_FAVORITES,
    );
    expect(normalizeTranslation('corrupt')).toEqual(DEFAULT_TRANSLATION);
  });

  it('the 5.16 Arabic variant wins over the 5.15 field', () => {
    expect(
      normalizeTranslation({
        variants: { ar: 'moroccan' },
        arabicVariant: 'syrian',
      }).arabicVariant,
    ).toBe('moroccan');
  });
});

describe('L5: menus', () => {
  it('favorites first in the user’s order, then all languages A→Z (French)', () => {
    const groups = languageOptions(COMMON.fr, ['ar', 'en']);
    expect(groups.map((group) => group.label)).toEqual([
      'Vos langues',
      'Toutes les langues',
    ]);
    expect(groups[0]!.items).toEqual([
      { id: 'ar', label: 'Arabe — العربية' },
      { id: 'en', label: 'Anglais — English' },
    ]);
    const labels = groups[1]!.items.map((item) => item.label);
    expect(labels).toHaveLength(IDS.length);
    expect(labels).toEqual([...labels].sort(new Intl.Collator('fr').compare));
    expect(labels.slice(0, 4)).toEqual([
      'Allemand — Deutsch',
      'Amharique — አማርኛ',
      'Anglais — English',
      'Arabe — العربية',
    ]);
    expect(labels).toContain('Japonais — 日本語');
  });

  it('English order; no favorites → one group', () => {
    const groups = languageOptions(COMMON.en, []);
    expect(groups.map((group) => group.label)).toEqual(['All languages']);
    const labels = groups[0]!.items.map((item) => item.label);
    expect(labels[0]).toBe('Amharic — አማርኛ');
    expect(labels).toEqual([...labels].sort(new Intl.Collator('en').compare));
    expect(labels).toContain('English');
  });

  it('target names include the variant', () => {
    expect(targetName(COMMON.fr, 'pt', 'pt_br')).toBe('Portugais (Brésil)');
    expect(targetName(COMMON.en, 'zh', 'zh_hant')).toBe(
      'Chinese (Traditional)',
    );
    expect(targetName(COMMON.en, 'ja', null)).toBe('Japanese');
  });
});

describe('L6: direction', () => {
  it('RTL targets: Arabic, Hebrew, Persian, Urdu, Sorani Kurdish', () => {
    for (const id of ['ar', 'he', 'fa', 'ur'] as const)
      expect(isRtl(id, firstVariant(id))).toBe(true);
    expect(isRtl('ku', 'ckb')).toBe(true);
    expect(isRtl('ku', 'kmr')).toBe(false);
    for (const id of ['ja', 'zh', 'ru', 'hi', 'en'] as const)
      expect(isRtl(id, firstVariant(id))).toBe(false);
    expect(langTag('zh', 'zh_hant')).toBe('zh-Hant');
    expect(langTag('ja', null)).toBe('ja');
  });
});

describe('L8: names', () => {
  it('every language and variant has an English and a French name', () => {
    for (const locale of ['en', 'fr'] as const) {
      const common = COMMON[locale];
      expect(Object.keys(common.language).sort()).toEqual([...IDS].sort());
      for (const id of IDS) expect(common.language[id].trim()).not.toBe('');
      expect(Object.keys(common.variant).sort()).toEqual(
        ALL_VARIANTS.map((v) => v.id).sort(),
      );
      for (const variant of ALL_VARIANTS)
        expect(common.variant[variant.id].trim()).not.toBe('');
    }
  });
});

/** The 5.15 rules, as shipped (six languages, MSA or Syrian). */
function normalize515(value: unknown) {
  const data = (value ?? {}) as Record<string, unknown>;
  const six = ['fr', 'en', 'ar', 'tr', 'de', 'es'];
  return {
    source:
      data.source === 'auto' || six.includes(data.source as string)
        ? data.source
        : 'auto',
    target: six.includes(data.target as string) ? data.target : 'en',
    arabicVariant: ['msa', 'syrian'].includes(data.arabicVariant as string)
      ? data.arabicVariant
      : 'msa',
  };
}

describe('L9: sync between 5.15 and 5.16', () => {
  const synced = (translation: unknown) =>
    pickSettings(normalizeSettings({ translation })).translation;

  it('a 5.16 payload read by a 5.15 computer keeps a valid target and Arabic variant', () => {
    expect(
      normalize515(synced({ target: 'de', arabicVariant: 'syrian' })),
    ).toEqual({
      source: 'auto',
      target: 'de',
      arabicVariant: 'syrian',
    });
    // A target 5.15 does not know falls back to its default.
    expect(
      normalize515(synced({ target: 'ja', variants: { ar: 'egyptian' } })),
    ).toEqual({ source: 'auto', target: 'en', arabicVariant: 'msa' });
  });

  it('a 5.15 payload read by 5.16 keeps the Arabic variant and gets default favorites', () => {
    const payload = {
      rewrite: { enabled: true, defaultStyles: ['formal'], formality: 3 },
      translation: { source: 'auto', target: 'ar', arabicVariant: 'syrian' },
      language: 'fr',
      keyboard: true,
      contextMenu: true,
    };
    expect(parseSyncedSettings(payload)!.translation).toEqual({
      ...DEFAULT_TRANSLATION,
      target: 'ar',
      variants: { ...DEFAULT_TRANSLATION.variants, ar: 'syrian' },
      arabicVariant: 'syrian',
    });
  });
});
