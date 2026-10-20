// V5.12 summaries: one request condenses the text and writes the summary
// directly in the chosen language (and variant). Shared by the modal
// and the worker; reuses the V5.5 language catalog, never a second one.
import {
  MAX_SUMMARY_CODE_POINTS,
  SUMMARIZE_TEXT,
  failureOf,
  noticeOf,
  operationOf,
  type FailureResult,
} from './contracts';
import type { QuotaNote } from './quota';
import {
  isLanguageId,
  variantFits,
  type LanguageId,
  type VariantId,
} from './translate';

/** Semantic targets for the model, not exact word counts. */
export const SUMMARY_LENGTHS = [
  {
    id: 'short',
    label: 'Short',
    prompt: 'short: one to three sentences, or at most 3 key points',
  },
  {
    id: 'medium',
    label: 'Medium',
    prompt: 'medium: one paragraph, or about 3 to 6 key points',
  },
  {
    id: 'detailed',
    label: 'Detailed',
    prompt:
      'detailed: covers every main point and important detail, still clearly shorter than the text',
  },
] as const;
export type SummaryLength = (typeof SUMMARY_LENGTHS)[number]['id'];

export const SUMMARY_FORMATS = [
  { id: 'paragraph', label: 'Paragraph' },
  { id: 'key_points', label: 'Key points' },
] as const;
export type SummaryFormat = (typeof SUMMARY_FORMATS)[number]['id'];

export const DEFAULT_SUMMARY_LENGTH: SummaryLength = 'medium';
export const DEFAULT_SUMMARY_FORMAT: SummaryFormat = 'paragraph';

export const isSummaryLength = (value: unknown): value is SummaryLength =>
  SUMMARY_LENGTHS.some((item) => item.id === value);
export const isSummaryFormat = (value: unknown): value is SummaryFormat =>
  SUMMARY_FORMATS.some((item) => item.id === value);

/** Key points are shown as plain text lines starting with this bullet. */
export const BULLET = '• ';

export interface SummarizeTextRequest {
  type: typeof SUMMARIZE_TEXT;
  text: string;
  target: LanguageId;
  // Required for a target with variants (one of its own), null otherwise.
  variant: VariantId | null;
  length: SummaryLength;
  format: SummaryFormat;
}
export type SummaryOptions = Omit<SummarizeTextRequest, 'type' | 'text'>;

/**
 * Exact shape and allowlisted values only: the page never chooses a prompt,
 * model, key or provider. The source language is detected in the same call.
 */
export function isSummarizeTextRequest(
  value: unknown,
): value is SummarizeTextRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  return (
    Object.keys(data).sort().join() ===
      'format,length,target,text,type,variant' &&
    data.type === SUMMARIZE_TEXT &&
    typeof data.text === 'string' &&
    data.text.trim() !== '' &&
    [...data.text].length <= MAX_SUMMARY_CODE_POINTS &&
    isLanguageId(data.target) &&
    variantFits(data.target, data.variant) &&
    isSummaryLength(data.length) &&
    isSummaryFormat(data.format)
  );
}

export type SummaryResult =
  | {
      ok: true;
      /** The text could not be summarized faithfully: nothing to show. */
      unsummarizable: false;
      text: string;
      // A number, link or email absent from the source: Copy only.
      suspicious: boolean;
      notice?: QuotaNote;
      operationId?: string;
    }
  | {
      ok: true;
      unsummarizable: true;
      notice?: QuotaNote;
      operationId?: string;
    }
  | FailureResult;

/** Bounded like the worker's own parser (see parseSummary). */
const MAX_SUMMARY_CHARS = 4 * MAX_SUMMARY_CODE_POINTS + 2000;

/** The worker's reply is untrusted in the page: accept only documented shapes. */
export function toSummaryResult(value: unknown): SummaryResult {
  const data =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  if (data.ok === true && data.unsummarizable === true)
    return {
      ok: true,
      unsummarizable: true,
      ...noticeOf(data),
      ...operationOf(data),
    };
  if (
    data.ok === true &&
    data.unsummarizable === false &&
    typeof data.text === 'string' &&
    data.text.trim() !== '' &&
    data.text.length <= MAX_SUMMARY_CHARS &&
    typeof data.suspicious === 'boolean'
  )
    return {
      ok: true,
      unsummarizable: false,
      text: data.text,
      suspicious: data.suspicious,
      ...noticeOf(data),
      ...operationOf(data),
    };
  return failureOf(data);
}
