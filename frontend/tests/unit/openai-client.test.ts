import { describe, expect, it, vi } from 'vitest';
import {
  correctionTask,
  CORRECTION_SCHEMA,
} from '../../src/background/correction';
import {
  classifyOpenAiError,
  openaiAdapter,
  parseResponse,
  responsesBody,
} from '../../src/background/openai-client';
import { rewriteTask } from '../../src/background/rewrite';
import { translationTask } from '../../src/background/translate';
import { jsonResponse, OPENAI_KEY, openaiOk } from '../helpers/fake-storage';

const MODEL = 'gpt-5.6-luna';
const call = (
  response: Response | Promise<Response> | Error,
  modelId = MODEL,
) => {
  const fetchImpl = vi.fn<typeof fetch>(() =>
    response instanceof Error
      ? Promise.reject(response)
      : Promise.resolve(response),
  );
  return {
    fetchImpl,
    result: openaiAdapter.generate(
      { key: OPENAI_KEY, modelId, fetchImpl, timeoutMs: 50 },
      correctionTask('Je suis aller a Lyon hier.'),
    ),
  };
};

describe('request contract', () => {
  it('OA-01/02/03/04: Responses API, Bearer header, store:false, strict task schema', async () => {
    const { fetchImpl, result } = call(jsonResponse(200, openaiOk('{}')));
    await result;
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect(url as string).not.toContain(OPENAI_KEY);
    expect(init).toMatchObject({
      method: 'POST',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    });
    expect(init!.headers).toEqual({
      Authorization: `Bearer ${OPENAI_KEY}`,
      'Content-Type': 'application/json',
    });
    const body = JSON.parse(init!.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: MODEL,
      store: false,
      stream: false,
      reasoning: { effort: 'none' },
      text: {
        format: {
          type: 'json_schema',
          name: 'correctly_correction',
          strict: true,
          schema: CORRECTION_SCHEMA,
        },
      },
    });
    expect(body).not.toHaveProperty('temperature');
    expect(body).not.toHaveProperty('tools');
    expect(body).not.toHaveProperty('previous_response_id');
    expect(body.input).toEqual([
      {
        role: 'developer',
        content: expect.stringContaining('conservative') as unknown,
      },
      { role: 'user', content: 'Je suis aller a Lyon hier.' },
    ]);
    // OA-26: the key is only in the header, never in what the model reads.
    expect(init!.body as string).not.toContain(OPENAI_KEY);
  });

  it('OA-06: rewrite schema lists exactly the requested style IDs', () => {
    const body = JSON.parse(
      responsesBody(MODEL, rewriteTask('Hello', ['formal', 'friendly'])),
    ) as { text: { format: { schema: Record<string, unknown> } } };
    expect(JSON.stringify(body.text.format.schema)).toContain(
      '"enum":["formal","friendly"]',
    );
  });

  it('OA-07: French → Syrian Arabic keeps the dialect in the instructions', () => {
    const body = JSON.parse(
      responsesBody(
        MODEL,
        translationTask('Bonjour', {
          source: 'fr',
          target: 'ar',
          variant: 'syrian',
          styleIds: [],
        }),
      ),
    ) as {
      input: { content: string }[];
      text: { format: { schema: unknown } };
    };
    expect(body.input[0]!.content).toMatch(/Syrian/);
    expect(JSON.stringify(body.text.format.schema)).toContain(
      '"enum":["translated","same_language"]',
    );
  });

  it('OA-21: unreviewed models get no reasoning or temperature parameter', () => {
    const body = JSON.parse(
      responsesBody('gpt-7-experimental', correctionTask('Hi')),
    ) as Record<string, unknown>;
    expect(body).not.toHaveProperty('reasoning');
    expect(body).not.toHaveProperty('temperature');
    expect(body.max_output_tokens).toBeGreaterThan(512);
  });

  it('a malformed model ID is refused locally, without any request', async () => {
    const { fetchImpl, result } = call(
      jsonResponse(200, openaiOk()),
      '../evil',
    );
    expect(await result).toMatchObject({
      ok: false,
      code: 'MODEL_UNAVAILABLE',
      answered: false,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('response parsing', () => {
  it('OA-05/OA-08: skips reasoning items and joins output_text parts', () => {
    expect(parseResponse(openaiOk('{"a":1}'))).toEqual({
      ok: true,
      text: '{"a":1}',
    });
  });

  it('OA-09: a refusal is an explicit failure, never an empty success', () => {
    expect(
      parseResponse({
        status: 'completed',
        output: [
          { type: 'message', content: [{ type: 'refusal', refusal: 'No.' }] },
        ],
      }),
    ).toEqual({ ok: false, code: 'RESPONSE_REFUSED', answered: true });
  });

  it('OA-10/OA-11: incomplete, failed, empty or malformed bodies are rejected', () => {
    for (const body of [
      { ...openaiOk('{"hasErrors":true'), status: 'incomplete' },
      { ...openaiOk('x'), status: 'failed' },
      { status: 'completed', output: [] },
      { status: 'completed', output: [{ type: 'message', content: 'x' }] },
      { status: 'completed' },
      null,
      'text',
    ])
      expect(parseResponse(body)).toMatchObject({
        ok: false,
        code: 'INVALID_RESPONSE',
      });
  });

  it('OA-19/OA-20: usage is mapped without inventing or double counting', () => {
    expect(
      parseResponse(
        openaiOk('x', {
          input_tokens: 40,
          input_tokens_details: { cached_tokens: 10 },
          output_tokens: 25,
          output_tokens_details: { reasoning_tokens: 20 },
          total_tokens: 65,
        }),
      ),
    ).toEqual({
      ok: true,
      text: 'x',
      // cached_tokens is a subset of input_tokens, kept apart (TOK).
      usage: { inputTokens: 40, outputTokens: 25, cachedInputTokens: 10 },
    });
    expect(parseResponse(openaiOk('x'))).toEqual({ ok: true, text: 'x' });
    expect(
      parseResponse(openaiOk('x', { input_tokens: -1, output_tokens: 'many' })),
    ).toEqual({
      ok: true,
      text: 'x',
    });
  });
});

describe('errors (never retried)', () => {
  it('OA-12..OA-16: HTTP statuses map to fixed codes', async () => {
    for (const [status, body, code] of [
      [
        401,
        { error: { code: 'invalid_api_key', message: `bad ${OPENAI_KEY}` } },
        'INVALID_KEY',
      ],
      [403, {}, 'PERMISSION_DENIED'],
      [404, {}, 'MODEL_UNAVAILABLE'],
      [400, { error: { code: 'model_not_found' } }, 'MODEL_UNAVAILABLE'],
      [429, { error: { code: 'insufficient_quota' } }, 'RATE_LIMITED'],
      [429, { error: { code: 'rate_limit_exceeded' } }, 'RATE_LIMITED'],
      [500, {}, 'PROVIDER_ERROR'],
      [503, {}, 'PROVIDER_ERROR'],
      [
        400,
        { error: { param: 'temperature', code: null } },
        'MODEL_INCOMPATIBLE',
      ],
      [
        400,
        { error: { param: 'text.format', code: 'invalid_value' } },
        'MODEL_INCOMPATIBLE',
      ],
      [
        400,
        { error: { code: 'unsupported_parameter', param: 'reasoning.effort' } },
        'MODEL_INCOMPATIBLE',
      ],
      [400, { error: { code: 'invalid_request_error' } }, 'PROVIDER_ERROR'],
    ] as const) {
      const { fetchImpl, result } = call(jsonResponse(status, body));
      const reply = await result;
      expect(reply).toEqual({
        ok: false,
        code,
        httpStatus: status,
        answered: true,
      });
      expect(JSON.stringify(reply)).not.toContain(OPENAI_KEY);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
    expect(classifyOpenAiError(418, null)).toBe('PROVIDER_ERROR');
  });

  it('OA-17: a hanging request times out once; billing is unknown', async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_, reject) =>
          init!.signal!.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          ),
        ),
    );
    const reply = await openaiAdapter.generate(
      { key: OPENAI_KEY, modelId: MODEL, fetchImpl, timeoutMs: 20 },
      correctionTask('Hi'),
    );
    expect(reply).toEqual({ ok: false, code: 'TIMEOUT', answered: false });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('OA-18: a network failure is NETWORK_ERROR, sent once', async () => {
    const { fetchImpl, result } = call(new TypeError('Failed to fetch'));
    expect(await result).toEqual({
      ok: false,
      code: 'NETWORK_ERROR',
      answered: false,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('model list', () => {
  it('OA-23: only text-capable IDs are offered; the key stays in the header', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        jsonResponse(200, {
          object: 'list',
          data: [
            { id: 'gpt-5.6-luna' },
            { id: 'text-embedding-3-large' },
            { id: 'gpt-image-1' },
            { id: 'whisper-1' },
            { id: 'tts-1' },
            { id: 'omni-moderation-latest' },
            { id: 'gpt-realtime' },
            { id: 'gpt-5-nano' },
            { id: 'gpt-5-nano' },
            { id: 'ft:gpt-4o:org::x' },
            { id: '<script>' },
          ],
        }),
      ),
    );
    const reply = await openaiAdapter.listModels({
      key: OPENAI_KEY,
      fetchImpl,
    });
    expect(reply).toEqual({ ok: true, models: ['gpt-5-nano', 'gpt-5.6-luna'] });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.openai.com/v1/models');
    expect(init!.headers).toEqual({ Authorization: `Bearer ${OPENAI_KEY}` });
  });

  it('OA-24: a failed list is reported, never as a valid key', async () => {
    for (const [status, code] of [
      [401, 'INVALID_KEY'],
      [500, 'PROVIDER_ERROR'],
    ] as const) {
      const fetchImpl = vi.fn<typeof fetch>(() =>
        Promise.resolve(jsonResponse(status, {})),
      );
      expect(
        await openaiAdapter.listModels({ key: OPENAI_KEY, fetchImpl }),
      ).toEqual({
        ok: false,
        code,
        httpStatus: status,
      });
    }
    const odd = vi.fn<typeof fetch>(() =>
      Promise.resolve(jsonResponse(200, { data: 'x' })),
    );
    expect(
      await openaiAdapter.listModels({ key: OPENAI_KEY, fetchImpl: odd }),
    ).toEqual({
      ok: false,
      code: 'INVALID_RESPONSE',
    });
  });
});
