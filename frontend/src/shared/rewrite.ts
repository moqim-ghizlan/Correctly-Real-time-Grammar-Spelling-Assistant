import {
  MAX_CORRECTION_CODE_POINTS,
  REWRITE_TEXT,
  failureOf,
  noticeOf,
  operationOf,
  type FailureResult,
} from './contracts';
import type { QuotaNote } from './quota';

/** Stable IDs (never localized), in display order. */
export const REWRITE_STYLES = [
  {
    id: 'professional',
    label: 'Professional',
    description: 'workplace-ready, clear and concise',
  },
  {
    id: 'formal',
    label: 'Formal',
    description: 'higher register and polite diction',
  },
  {
    id: 'friendly',
    label: 'Friendly',
    description: 'warm, natural and approachable, no emojis',
  },
  {
    id: 'casual',
    label: 'Casual',
    description: 'conversational and relaxed',
  },
  {
    id: 'polite',
    label: 'Polite',
    description: 'respectful and considerate, no excessive apologies',
  },
  {
    id: 'concise',
    label: 'Concise',
    description: 'shorter, keeping every date, number, negation and condition',
  },
  {
    id: 'funny',
    label: 'Funny',
    description: 'light, kind humor; stay respectful when the topic is serious',
  },
  {
    id: 'custom',
    label: 'Custom formality',
    description: 'choose how formal, from a light touch to very formal',
  },
] as const;

export type RewriteStyleId = (typeof REWRITE_STYLES)[number]['id'];
export const DEFAULT_REWRITE_STYLES: RewriteStyleId[] = ['professional'];

export const isRewriteStyleId = (value: unknown): value is RewriteStyleId =>
  REWRITE_STYLES.some((style) => style.id === value);

/**
 * Custom formality (owner request 2026-10-16): the slider of the "custom"
 * style, from 1 (keep the author's voice, only fix and smooth) to 5 (very
 * formal). `prompt` is the instruction sent to the model for that level.
 */
export const FORMALITY_LEVELS = [
  {
    id: 1,
    label: 'Light touch',
    prompt:
      "light touch: keep the author's words, tone and casual register; only fix errors, smooth the sentence structure and make it read naturally",
  },
  {
    id: 2,
    label: 'Relaxed',
    prompt:
      'relaxed: natural, conversational everyday language, lightly polished',
  },
  {
    id: 3,
    label: 'Neutral',
    prompt: 'neutral: clear, standard register, neither casual nor formal',
  },
  {
    id: 4,
    label: 'Polished',
    prompt:
      'polished: careful, professional register that still reads naturally',
  },
  {
    id: 5,
    label: 'Very formal',
    prompt: 'very formal: elevated register and formal, polite diction',
  },
] as const;

export type Formality = (typeof FORMALITY_LEVELS)[number]['id'];
export const DEFAULT_FORMALITY: Formality = 3;

export const isFormality = (value: unknown): value is Formality =>
  FORMALITY_LEVELS.some((level) => level.id === value);

export const normalizeFormality = (value: unknown): Formality =>
  isFormality(value) ? value : DEFAULT_FORMALITY;

/** `{ formality }` only when the custom style is requested, `{}` otherwise. */
export const formalityField = (
  styleIds: readonly RewriteStyleId[],
  formality: Formality,
): { formality?: Formality } =>
  styleIds.includes('custom') ? { formality } : {};

/** `- id: description` lines for the model (custom: its level's prompt). */
export function styleLines(
  styleIds: readonly RewriteStyleId[],
  formality: Formality = DEFAULT_FORMALITY,
): string[] {
  const level = FORMALITY_LEVELS.find((item) => item.id === formality);
  return REWRITE_STYLES.filter((style) => styleIds.includes(style.id)).map(
    (style) =>
      `- ${style.id}: ${style.id === 'custom' && level ? level.prompt : style.description}`,
  );
}

/**
 * Exact keys of a request carrying `styleIds`: `formality` is required (and
 * valid) with the custom style and forbidden without it.
 */
export function formalityKeysValid(
  data: Record<string, unknown>,
  keys: string,
): boolean {
  if (!Array.isArray(data.styleIds)) return false;
  if (!data.styleIds.includes('custom'))
    return Object.keys(data).sort().join() === keys;
  return (
    Object.keys(data).sort().join() ===
      [...keys.split(','), 'formality'].sort().join() &&
    isFormality(data.formality)
  );
}

export const styleLabel = (id: RewriteStyleId): string =>
  REWRITE_STYLES.find((style) => style.id === id)?.label ?? id;

/** Known IDs only, first occurrence wins, order kept. */
export function normalizeStyleIds(value: unknown): RewriteStyleId[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value)].filter(isRewriteStyleId);
}

export interface RewriteTextRequest {
  type: typeof REWRITE_TEXT;
  text: string;
  styleIds: RewriteStyleId[];
  /** Present exactly when styleIds includes 'custom'. */
  formality?: Formality;
}

/**
 * Exact shape, bounded text, 1–8 known and unique style IDs, and a valid
 * formality level exactly when the custom style is chosen.
 */
export function isRewriteTextRequest(
  value: unknown,
): value is RewriteTextRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  return (
    formalityKeysValid(data, 'styleIds,text,type') &&
    data.type === REWRITE_TEXT &&
    typeof data.text === 'string' &&
    data.text.trim() !== '' &&
    [...data.text].length <= MAX_CORRECTION_CODE_POINTS &&
    Array.isArray(data.styleIds) &&
    data.styleIds.length > 0 &&
    normalizeStyleIds(data.styleIds).length === data.styleIds.length
  );
}

/** One generated version, keyed by a requested ID (a style, or 'neutral'). */
export interface Candidate<K extends string = RewriteStyleId> {
  styleId: K;
  text: string;
  // Numbers, links or emails differ from the source: Copy only.
  suspicious: boolean;
}
export type RewriteCandidate = Candidate;

export type CandidatesResult<K extends string = RewriteStyleId> =
  | {
      ok: true;
      candidates: Candidate<K>[];
      missing: K[];
      // Translation only: the text is already in the target language.
      sameLanguage?: boolean;
      /** V5.8: a usage warning (80/95/100 %) this request crossed. */
      notice?: QuotaNote;
      /** V5.9: lets the page report a confirmed Apply/Undo for statistics. */
      operationId?: string;
    }
  | FailureResult;
export type RewriteResult = CandidatesResult;

// A version may be up to 4× + 200 code points (see parseCandidateList); in
// UTF-16 units that is at most 8× + 400.
const MAX_CANDIDATE_CHARS = 8 * MAX_CORRECTION_CODE_POINTS + 400;

/** The worker's reply is untrusted in the page: keep only requested IDs, in request order. */
export function toRewriteResult<K extends string = RewriteStyleId>(
  value: unknown,
  requested: readonly K[],
): CandidatesResult<K> {
  const data =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  if (data.ok === true && data.sameLanguage === true)
    return {
      ok: true,
      candidates: [],
      missing: [],
      sameLanguage: true,
      ...noticeOf(data),
      ...operationOf(data),
    };
  if (data.ok === true && Array.isArray(data.candidates)) {
    const byStyle = new Map<K, Candidate<K>>();
    for (const item of data.candidates as unknown[]) {
      const candidate = (item ?? {}) as Record<string, unknown>;
      const id = requested.find((key) => key === candidate.styleId);
      if (
        id !== undefined &&
        !byStyle.has(id) &&
        typeof candidate.text === 'string' &&
        candidate.text.trim() !== '' &&
        candidate.text.length <= MAX_CANDIDATE_CHARS &&
        typeof candidate.suspicious === 'boolean'
      )
        byStyle.set(id, {
          styleId: id,
          text: candidate.text,
          suspicious: candidate.suspicious,
        });
    }
    const candidates = requested.flatMap((id) => byStyle.get(id) ?? []);
    if (candidates.length)
      return {
        ok: true,
        candidates,
        missing: requested.filter((id) => !byStyle.has(id)),
        ...noticeOf(data),
        ...operationOf(data),
      };
  }
  return failureOf(data);
}
