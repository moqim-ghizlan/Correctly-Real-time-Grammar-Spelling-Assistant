// Gemini models offered in V5.1. Verified against the official model list
// (https://ai.google.dev/gemini-api/docs/models) and pricing page on
// 2026-10-15: both are listed as stable text models. Availability for a
// specific key/project is only proven by a successful Test connection.
export type ProviderId = 'gemini';

export interface ModelInfo {
  id: string;
  label: string;
  note: string;
}

export const GEMINI_MODELS: readonly ModelInfo[] = [
  {
    id: 'gemini-3.1-flash-lite',
    label: 'Gemini 3.1 Flash-Lite',
    note: 'Lowest listed price per token (default).',
  },
  {
    id: 'gemini-3.5-flash-lite',
    label: 'Gemini 3.5 Flash-Lite',
    note: 'Newer Flash-Lite model; slightly higher listed price.',
  },
];

export const DEFAULT_MODEL_ID = 'gemini-3.1-flash-lite';

// Defence in depth: a model ID must be allowlisted AND match a strict
// character set before it is ever interpolated into a URL path.
const MODEL_ID_PATTERN = /^[a-z0-9][a-z0-9.-]{0,63}$/;

export function isAllowedModelId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    MODEL_ID_PATTERN.test(value) &&
    GEMINI_MODELS.some((model) => model.id === value)
  );
}

export function modelLabel(id: string): string {
  return GEMINI_MODELS.find((model) => model.id === id)?.label ?? id;
}
