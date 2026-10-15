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

export interface RewriteCandidate {
  styleId: RewriteStyleId;
  text: string;
  // Numbers, links or emails differ from the source: Copy only.
  suspicious: boolean;
}

export type RewriteResult =
  | { ok: true; candidates: RewriteCandidate[]; missing: RewriteStyleId[] }
  | FailureResult;

// A rewrite may be up to 3× + 200 code points (see parseRewrite); in UTF-16
// units that is at most 6× + 400.
const MAX_CANDIDATE_CHARS = 6 * MAX_CORRECTION_CODE_POINTS + 400;

/** The worker's reply is untrusted in the page: keep only requested styles, in request order. */
export function toRewriteResult(
  value: unknown,
  requested: readonly RewriteStyleId[],
): RewriteResult {
  const data =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  if (data.ok === true && Array.isArray(data.candidates)) {
    const byStyle = new Map<RewriteStyleId, RewriteCandidate>();
    for (const item of data.candidates as unknown[]) {
      const candidate = (item ?? {}) as Record<string, unknown>;
      if (
        isRewriteStyleId(candidate.styleId) &&
        requested.includes(candidate.styleId) &&
        !byStyle.has(candidate.styleId) &&
        typeof candidate.text === 'string' &&
        candidate.text.trim() !== '' &&
        candidate.text.length <= MAX_CANDIDATE_CHARS &&
        typeof candidate.suspicious === 'boolean'
      )
        byStyle.set(candidate.styleId, {
          styleId: candidate.styleId,
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
