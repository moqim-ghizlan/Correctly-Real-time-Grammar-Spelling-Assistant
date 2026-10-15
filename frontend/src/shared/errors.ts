export type ErrorCode =
  | 'NOT_CONFIGURED'
  | 'INVALID_KEY'
  | 'PERMISSION_DENIED'
  | 'MODEL_UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'LOCAL_DAILY_LIMIT'
  | 'CONSENT_REQUIRED'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'PROVIDER_ERROR'
  | 'INVALID_RESPONSE'
  | 'STORAGE_ERROR'
  | 'UNKNOWN_ERROR';

// Fixed, user-facing copy. Provider text is never shown verbatim.
const COPY: Record<ErrorCode, { message: string; retryable: boolean }> = {
  NOT_CONFIGURED: {
    message: 'No Gemini API key is saved. Paste and save a key first.',
    retryable: false,
  },
  INVALID_KEY: {
    message:
      'Invalid key — create or paste a valid key in Google AI Studio, then save it again.',
    retryable: false,
  },
  PERMISSION_DENIED: {
    message:
      'Google refused this request for your key or project (API disabled, key restrictions, region or billing). Check your project in Google AI Studio.',
    retryable: false,
  },
  MODEL_UNAVAILABLE: {
    message:
      'Model not available for this key/project. Choose another model below and test again.',
    retryable: false,
  },
  RATE_LIMITED: {
    message:
      'Quota exceeded or rate limited by Google — check usage and limits in Google AI Studio, then retry later.',
    retryable: true,
  },
  LOCAL_DAILY_LIMIT: {
    message:
      'Daily local limit reached. Try tomorrow or adjust your safety setting.',
    retryable: false,
  },
  CONSENT_REQUIRED: {
    message:
      'Allow sending selected text to Gemini in the Correctly settings first.',
    retryable: false,
  },
  NETWORK_ERROR: {
    message: 'Offline or network error — check your internet connection.',
    retryable: true,
  },
  TIMEOUT: {
    message:
      'Gemini did not answer in time. The attempt was counted; retry manually if needed.',
    retryable: true,
  },
  PROVIDER_ERROR: {
    message:
      'Gemini returned an error. Try again later; if it persists, check Google AI Studio.',
    retryable: true,
  },
  INVALID_RESPONSE: {
    message:
      'Gemini answered, but the response was not usable. Nothing was confirmed or changed.',
    retryable: true,
  },
  STORAGE_ERROR: {
    message:
      'Browser storage could not be read or written. Reload this page and try again.',
    retryable: true,
  },
  UNKNOWN_ERROR: {
    message: 'Something unexpected went wrong. Reload this page and try again.',
    retryable: true,
  },
};

export const ERROR_CODES = Object.keys(COPY) as ErrorCode[];

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && value in COPY;
}

export function errorMessage(code: ErrorCode): string {
  return COPY[code].message;
}

export function isRetryable(code: ErrorCode): boolean {
  return COPY[code].retryable;
}

export class CorrectlyError extends Error {
  constructor(readonly code: ErrorCode) {
    super(code);
    this.name = 'CorrectlyError';
  }
}
