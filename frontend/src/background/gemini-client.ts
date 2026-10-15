import type { ErrorCode } from '../shared/errors';
import type { TokenUsage } from '../shared/contracts';
import { isAllowedModelId } from '../shared/models';

export const GEMINI_API_ORIGIN = 'https://generativelanguage.googleapis.com';
export const SMOKE_TEST_PROMPT = 'Reply with OK only.';
export const REQUEST_TIMEOUT_MS = 15_000;
// Room for minimal model "thinking" on Flash-Lite models; still a tiny
// request. This bounds tokens, it is not an exact cost cap.
export const MAX_OUTPUT_TOKENS = 128;
const MAX_SAMPLE_LENGTH = 40;
const MAX_BODY_CHARS = 256 * 1024;

export type GeminiResult =
  | { ok: true; sample: string; usage?: TokenUsage }
  | { ok: false; code: ErrorCode; httpStatus?: number };

export interface GeminiRequest {
  apiKey: string;
  modelId: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/** Only allowlisted model IDs reach the URL; anything else throws. */
export function generateContentUrl(modelId: string): string {
  if (!isAllowedModelId(modelId)) throw new Error('Model not allowlisted');
  return `${GEMINI_API_ORIGIN}/v1beta/models/${modelId}:generateContent`;
}

export function smokeTestBody(): string {
  return JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: SMOKE_TEST_PROMPT }] }],
    generationConfig: { temperature: 0, maxOutputTokens: MAX_OUTPUT_TOKENS },
  });
}

const object = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const tokenCount = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;

function parseUsage(value: unknown): TokenUsage | undefined {
  const usage = object(value);
  if (!usage) return undefined;
  const input = tokenCount(usage.promptTokenCount);
  const candidates = tokenCount(usage.candidatesTokenCount);
  const thoughts = tokenCount(usage.thoughtsTokenCount);
  // Thinking tokens are billed as output tokens.
  const output =
    candidates === undefined && thoughts === undefined
      ? undefined
      : (candidates ?? 0) + (thoughts ?? 0);
  const result: TokenUsage = {};
  if (input !== undefined) result.inputTokens = input;
  if (output !== undefined) result.outputTokens = output;
  return Object.keys(result).length ? result : undefined;
}

function sanitizeSample(text: string, apiKey: string): string {
  const safe = text
    .split(apiKey)
    .join('[redacted]')
    .replace(/\p{Cc}+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return safe.length > MAX_SAMPLE_LENGTH
    ? safe.slice(0, MAX_SAMPLE_LENGTH - 1) + '…'
    : safe;
}

export interface CandidateText {
  text: string;
  finishReason?: string;
  usage?: TokenUsage;
}

/** Joined non-thought text of the first candidate, or null when the prompt was blocked or the shape is wrong. */
export function candidateText(body: unknown): CandidateText | null {
  const data = object(body);
  if (!data || object(data.promptFeedback)?.blockReason) return null;
  const candidates = data.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const candidate = object(candidates[0]);
  const parts = object(candidate?.content)?.parts;
  if (!Array.isArray(parts)) return null;
  const text = parts
    .map(object)
    .filter((part) => part && part.thought !== true)
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .join('');
  const finishReason =
    typeof candidate?.finishReason === 'string'
      ? candidate.finishReason
      : undefined;
  const usage = parseUsage(data.usageMetadata);
  return {
    text,
    ...(finishReason ? { finishReason } : {}),
    ...(usage ? { usage } : {}),
  };
}

/** Success requires a non-empty, non-thought text part in the first candidate. */
export function parseSuccess(body: unknown, apiKey: string): GeminiResult {
  const candidate = candidateText(body);
  const sample = candidate ? sanitizeSample(candidate.text, apiKey) : '';
  if (!candidate || !sample) return { ok: false, code: 'INVALID_RESPONSE' };
  return candidate.usage
    ? { ok: true, sample, usage: candidate.usage }
    : { ok: true, sample };
}

/** Maps an HTTP failure to a code using only status and Google's enum fields. */
export function classifyHttpError(status: number, body: unknown): ErrorCode {
  const error = object(object(body)?.error);
  const providerStatus = typeof error?.status === 'string' ? error.status : '';
  const reasons = Array.isArray(error?.details)
    ? error.details
        .map((detail) => object(detail)?.reason)
        .filter((reason): reason is string => typeof reason === 'string')
    : [];
  if (reasons.some((reason) => /^API_KEY_(INVALID|EXPIRED)$/.test(reason)))
    return 'INVALID_KEY';
  if (status === 401) return 'INVALID_KEY';
  if (status === 403) return 'PERMISSION_DENIED';
  if (status === 404) return 'MODEL_UNAVAILABLE';
  if (status === 429) return 'RATE_LIMITED';
  if (status === 400 && providerStatus === 'FAILED_PRECONDITION')
    return 'PERMISSION_DENIED';
  return 'PROVIDER_ERROR';
}

async function readJson(response: Response): Promise<unknown> {
  try {
    const text = await response.text();
    return text.length > MAX_BODY_CHARS ? null : (JSON.parse(text) as unknown);
  } catch {
    return null;
  }
}

export type GeminiReply =
  | { ok: true; body: unknown }
  | { ok: false; code: ErrorCode; httpStatus?: number };

/**
 * POSTs one generateContent request. Never retries: every dispatch may
 * consume quota, so retrying is always an explicit user action.
 */
export async function postGemini(
  {
    apiKey,
    modelId,
    fetchImpl = fetch,
    timeoutMs = REQUEST_TIMEOUT_MS,
  }: GeminiRequest,
  body: string,
): Promise<GeminiReply> {
  const url = generateContentUrl(modelId);
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body,
      signal: controller.signal,
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    });
    const json = await readJson(response);
    if (!response.ok)
      return {
        ok: false,
        code: classifyHttpError(response.status, json),
        httpStatus: response.status,
      };
    return { ok: true, body: json };
  } catch {
    return { ok: false, code: timedOut ? 'TIMEOUT' : 'NETWORK_ERROR' };
  } finally {
    clearTimeout(timer);
  }
}

/** Sends the fixed smoke-test prompt once. */
export async function testGemini(
  request: GeminiRequest,
): Promise<GeminiResult> {
  const reply = await postGemini(request, smokeTestBody());
  return reply.ok ? parseSuccess(reply.body, request.apiKey) : reply;
}
