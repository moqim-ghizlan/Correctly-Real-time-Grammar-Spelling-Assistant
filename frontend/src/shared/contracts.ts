import {
  errorMessage,
  isErrorCode,
  isRetryable,
  type ErrorCode,
} from './errors';
import type { ProviderId } from './models';

/** Sent by the options page only. It carries no data. */
export const TEST_CONNECTION = 'correctly.v5.testConnection';
/** Sent by the injected content script with the user's selected text. */
export const CORRECT_TEXT = 'correctly.v5.correctText';
/** Sent by the options page to open tabs when the smart button is turned off. */
export const SMART_BUTTON_OFF = 'correctly.v5.smartButtonOff';
/** Sent by the injected content script with selected text and style IDs. */
export const REWRITE_TEXT = 'correctly.v5.rewriteText';
/** Sent by the injected content script with text, languages and styles. */
export const TRANSLATE_TEXT = 'correctly.v5.translateText';
/** Sent by the smart button: asks the worker to open a picker in that frame. */
export const OPEN_REWRITE = 'correctly.v5.openRewrite';
export const OPEN_TRANSLATE = 'correctly.v5.openTranslate';
/** Manifest command names of the keyboard shortcuts. */
export const CORRECT_COMMAND = 'correct-selection';
export const REWRITE_COMMAND = 'rewrite-selection';
export const TRANSLATE_COMMAND = 'translate-selection';
/** Bounds cost and latency; longer selections are refused, never truncated. */
export const MAX_CORRECTION_CODE_POINTS = 2000;
// A reply may double the length (2× + 50 code points, see parseCorrection);
// in UTF-16 units that is at most 4× + 100.
const MAX_CORRECTED_CHARS = 4 * MAX_CORRECTION_CODE_POINTS + 100;

export interface TestConnectionRequest {
  type: typeof TEST_CONNECTION;
}

export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export type ConnectionResult =
  | {
      ok: true;
      provider: ProviderId;
      model: string;
      checkedAt: string;
      sample: string;
      usage?: TokenUsage;
    }
  | {
      ok: false;
      code: ErrorCode;
      message: string;
      retryable: boolean;
      httpStatus?: number;
    };

export interface CorrectTextRequest {
  type: typeof CORRECT_TEXT;
  text: string;
}

export type FailureResult = Extract<ConnectionResult, { ok: false }>;

export type CorrectionResult =
  | { ok: true; hasErrors: false }
  | {
      ok: true;
      hasErrors: true;
      correctedText: string;
      // Numbers, links or emails differ: shown, but Apply stays disabled.
      suspicious: boolean;
    }
  | FailureResult;

/** Strict shape check: exactly `{ type: CORRECT_TEXT, text }` with a bounded, non-blank text. */
export function isCorrectTextRequest(
  value: unknown,
): value is CorrectTextRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  return (
    Object.keys(data).sort().join() === 'text,type' &&
    data.type === CORRECT_TEXT &&
    typeof data.text === 'string' &&
    data.text.trim() !== '' &&
    [...data.text].length <= MAX_CORRECTION_CODE_POINTS
  );
}

/** The worker's reply is untrusted in the page too: accept only documented shapes. */
export function toCorrectionResult(value: unknown): CorrectionResult {
  const data =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  if (data.ok === true && data.hasErrors === false)
    return { ok: true, hasErrors: false };
  if (
    data.ok === true &&
    data.hasErrors === true &&
    typeof data.correctedText === 'string' &&
    data.correctedText.trim() !== '' &&
    data.correctedText.length <= MAX_CORRECTED_CHARS &&
    typeof data.suspicious === 'boolean'
  )
    return {
      ok: true,
      hasErrors: true,
      correctedText: data.correctedText,
      suspicious: data.suspicious,
    };
  const code =
    data.ok === false && isErrorCode(data.code) ? data.code : 'UNKNOWN_ERROR';
  return {
    ok: false,
    code,
    message: errorMessage(code),
    retryable: isRetryable(code),
  };
}

/** Strict shape check: exactly `{ type: TEST_CONNECTION }`, nothing else. */
export function isTestConnectionRequest(
  value: unknown,
): value is TestConnectionRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return (
    keys.length === 1 &&
    keys[0] === 'type' &&
    (value as Record<string, unknown>).type === TEST_CONNECTION
  );
}
