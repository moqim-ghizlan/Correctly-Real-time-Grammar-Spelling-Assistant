import {
  MAX_CORRECTION_CODE_POINTS,
  REWRITE_TEXT,
  type FailureResult,
} from './contracts';
import { errorMessage, isErrorCode, isRetryable } from './errors';

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
] as const;

export type RewriteStyleId = (typeof REWRITE_STYLES)[number]['id'];
export const DEFAULT_REWRITE_STYLES: RewriteStyleId[] = ['professional'];

export const isRewriteStyleId = (value: unknown): value is RewriteStyleId =>
  REWRITE_STYLES.some((style) => style.id === value);

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
}

/** Exact shape, bounded text, 1–7 known and unique style IDs. */
export function isRewriteTextRequest(
  value: unknown,
): value is RewriteTextRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  return (
    Object.keys(data).sort().join() === 'styleIds,text,type' &&
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
    return { ok: true, candidates: [], missing: [], sameLanguage: true };
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
      };
  }
  const code =
    data.ok === false && isErrorCode(data.code) ? data.code : 'UNKNOWN_ERROR';
  return {
    ok: false,
    code,
    message: errorMessage(code),
    retryable: isRetryable(code),
  };
}
