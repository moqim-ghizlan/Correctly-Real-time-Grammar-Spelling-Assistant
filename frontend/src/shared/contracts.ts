import type { ErrorCode } from './errors';
import type { ProviderId } from './models';

/** The only action the service worker accepts in V5.1. It carries no data. */
export const TEST_CONNECTION = 'correctly.v5.testConnection';

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
