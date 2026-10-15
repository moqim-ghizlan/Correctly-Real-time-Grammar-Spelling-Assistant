export type ErrorCode =
  | 'NOT_CONFIGURED'
  | 'ROUTE_BROKEN'
  | 'PROFILE_DISABLED'
  | 'ROUTE_CHANGED'
  | 'INVALID_KEY'
  | 'PERMISSION_DENIED'
  | 'MODEL_UNAVAILABLE'
  | 'MODEL_INCOMPATIBLE'
  | 'RATE_LIMITED'
  | 'LOCAL_DAILY_LIMIT'
  | 'CONSENT_REQUIRED'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'PROVIDER_ERROR'
  | 'INVALID_RESPONSE'
  | 'RESPONSE_REFUSED'
  | 'STORAGE_ERROR'
  | 'UNKNOWN_ERROR';

const SETTINGS = 'Correctly settings → AI providers';

// Fixed, user-facing copy. Provider text is never shown verbatim.
const COPY: Record<ErrorCode, { message: string; retryable: boolean }> = {
  NOT_CONFIGURED: {
    message: `No AI provider is set up for this action. Add an API key and choose a model in ${SETTINGS}.`,
    retryable: false,
  },
  ROUTE_BROKEN: {
    message: `The API key chosen for this action was deleted or is incomplete. Choose another one in ${SETTINGS}. No other key was used.`,
    retryable: false,
  },
  PROFILE_DISABLED: {
    message: `The API key chosen for this action is disabled. Enable it or choose another one in ${SETTINGS}. No other key was used.`,
    retryable: false,
  },
  ROUTE_CHANGED: {
    message:
      'The API key for this request was changed or deleted while it was running, so the request was stopped. It may still count toward provider billing.',
    retryable: false,
  },
  INVALID_KEY: {
    message: `The provider rejected this API key. Replace or check it in ${SETTINGS}.`,
    retryable: false,
  },
  PERMISSION_DENIED: {
    message:
      'The provider refused this request for your key or project (API disabled, key restrictions, region or billing). Check your provider dashboard.',
    retryable: false,
  },
  MODEL_UNAVAILABLE: {
    message: `This model is not available for this key. Choose another model in ${SETTINGS}. No other model was used.`,
    retryable: false,
  },
  MODEL_INCOMPATIBLE: {
    message: `This model does not accept the options Correctly needs (structured JSON output). Choose another model in ${SETTINGS}.`,
    retryable: false,
  },
  RATE_LIMITED: {
    message:
      'The provider is rate-limiting requests, or your quota or billing limit is reached. No automatic switch was made; retry later.',
    retryable: true,
  },
  LOCAL_DAILY_LIMIT: {
    message:
      'Daily local limit reached. Try tomorrow or adjust your safety setting.',
    retryable: false,
  },
  CONSENT_REQUIRED: {
    message:
      'Allow sending selected text to your AI provider in the Correctly settings first.',
    retryable: false,
  },
  NETWORK_ERROR: {
    message: 'Offline or network error — check your internet connection.',
    retryable: true,
  },
  TIMEOUT: {
    message:
      'The provider did not answer in time. The request may still count toward provider billing; retry only if you want to make another request.',
    retryable: true,
  },
  PROVIDER_ERROR: {
    message:
      'The provider returned an error. Try again later; if it persists, check your provider dashboard.',
    retryable: true,
  },
  INVALID_RESPONSE: {
    message:
      'The provider answered, but the response was not usable (incomplete or malformed). Nothing was confirmed or changed.',
    retryable: true,
  },
  RESPONSE_REFUSED: {
    message: 'The provider declined to process this text. Nothing was changed.',
    retryable: false,
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
  return typeof value === 'string' && Object.hasOwn(COPY, value);
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
