import { describe, expect, it, vi } from 'vitest';
import {
  geminiAdapter,
  generateContentUrl,
  SMOKE_TEST_PROMPT,
  testGemini,
} from '../../src/background/gemini-client';
import { FAKE_KEY, geminiOk, jsonResponse } from '../helpers/fake-storage';

const MODEL = 'gemini-3.1-flash-lite';
const run = (response: Response | Promise<Response>) => {
  const fetchImpl = vi.fn<typeof fetch>(() => Promise.resolve(response));
  return {
    fetchImpl,
    result: testGemini({ apiKey: FAKE_KEY, modelId: MODEL, fetchImpl }),
  };
};
const googleError = (code: number, status: string, reason?: string) => ({
  error: {
    code,
    message: `API key not valid. Please pass a valid API key. ${FAKE_KEY}`,
    status,
    ...(reason
      ? {
          details: [
            { '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason },
          ],
        }
      : {}),
  },
});

describe('request contract', () => {
  it('sends exactly one fixed prompt to the allowlisted HTTPS endpoint', async () => {
    const { fetchImpl, result } = run(jsonResponse(200, geminiOk()));
    await result;
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent',
    );
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({
      'Content-Type': 'application/json',
      'x-goog-api-key': FAKE_KEY,
    });
    expect(url as string).not.toContain(FAKE_KEY);
    expect(init?.credentials).toBe('omit');
    expect(init?.redirect).toBe('error');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(init?.body as string)).toEqual({
      contents: [{ role: 'user', parts: [{ text: SMOKE_TEST_PROMPT }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 128 },
    });
  });

  it('S09/RT-02: only a strictly shaped model ID reaches the URL path', () => {
    for (const bad of [
      '../../evil',
      'gemini..x',
      'models/x',
      'x?key=1',
      'x#y',
      'X%2F',
      '',
      'a'.repeat(81),
    ])
      expect(() => generateContentUrl(bad)).toThrow();
    // V5.7: a manually entered model ID is allowed when well-formed.
    expect(generateContentUrl('gemini-2.0-flash')).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
    );
  });
});

describe('response handling', () => {
  it('N01: valid 200 with text is a success', async () => {
    expect(await run(jsonResponse(200, geminiOk('OK'))).result).toEqual({
      ok: true,
      sample: 'OK',
    });
  });

  it('N02: 200 without candidates is INVALID_RESPONSE', async () => {
    for (const body of [
      {},
      { candidates: [] },
      { candidates: [{ content: { parts: [] } }] },
      { candidates: [{ content: { parts: [{ text: '   ' }] } }] },
      { candidates: [{ finishReason: 'MAX_TOKENS' }] },
      {
        candidates: [
          { content: { parts: [{ text: 'hidden', thought: true }] } },
        ],
      },
      { promptFeedback: { blockReason: 'SAFETY' }, ...geminiOk() },
    ])
      expect(await run(jsonResponse(200, body)).result).toEqual({
        ok: false,
        code: 'INVALID_RESPONSE',
      });
  });

  it('N03: malformed JSON is INVALID_RESPONSE', async () => {
    expect(await run(jsonResponse(200, '{"candidates": [')).result).toEqual({
      ok: false,
      code: 'INVALID_RESPONSE',
    });
    expect(await run(jsonResponse(200, '[1,2]')).result).toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });

  it('N04: generic 400 is a sanitized provider error', async () => {
    expect(
      await run(jsonResponse(400, googleError(400, 'INVALID_ARGUMENT'))).result,
    ).toEqual({ ok: false, code: 'PROVIDER_ERROR', httpStatus: 400 });
  });

  it('N05: invalid key (Google sends 400 + API_KEY_INVALID), 401 and 403', async () => {
    expect(
      await run(
        jsonResponse(
          400,
          googleError(400, 'INVALID_ARGUMENT', 'API_KEY_INVALID'),
        ),
      ).result,
    ).toMatchObject({ code: 'INVALID_KEY', httpStatus: 400 });
    expect(await run(jsonResponse(401, {})).result).toMatchObject({
      code: 'INVALID_KEY',
    });
    expect(
      await run(jsonResponse(403, googleError(403, 'PERMISSION_DENIED')))
        .result,
    ).toMatchObject({ code: 'PERMISSION_DENIED' });
    expect(
      await run(jsonResponse(400, googleError(400, 'FAILED_PRECONDITION')))
        .result,
    ).toMatchObject({ code: 'PERMISSION_DENIED' });
  });

  it('N06: 404 means model unavailable', async () => {
    expect(
      await run(jsonResponse(404, googleError(404, 'NOT_FOUND'))).result,
    ).toMatchObject({ code: 'MODEL_UNAVAILABLE' });
  });

  it('N07/N08: 429 and 5xx are reported once, never retried', async () => {
    for (const [status, code] of [
      [429, 'RATE_LIMITED'],
      [500, 'PROVIDER_ERROR'],
      [503, 'PROVIDER_ERROR'],
    ] as const) {
      const { fetchImpl, result } = run(jsonResponse(status, {}));
      expect(await result).toMatchObject({ ok: false, code });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  });

  it('N09: network rejection is NETWORK_ERROR', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.reject(new TypeError('Failed to fetch')),
    );
    expect(
      await testGemini({ apiKey: FAKE_KEY, modelId: MODEL, fetchImpl }),
    ).toEqual({ ok: false, code: 'NETWORK_ERROR' });
  });

  it('N10: a hanging request is aborted with TIMEOUT', async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn<typeof fetch>(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError')),
            );
          }),
      );
      const pending = testGemini({
        apiKey: FAKE_KEY,
        modelId: MODEL,
        fetchImpl,
        timeoutMs: 15_000,
      });
      await vi.advanceTimersByTimeAsync(15_000);
      expect(await pending).toEqual({ ok: false, code: 'TIMEOUT' });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('N11: usage metadata is parsed (thinking tokens count as output)', async () => {
    expect(
      await run(
        jsonResponse(
          200,
          geminiOk('OK', {
            promptTokenCount: 6,
            candidatesTokenCount: 1,
            thoughtsTokenCount: 20,
            totalTokenCount: 27,
          }),
        ),
      ).result,
    ).toEqual({
      ok: true,
      sample: 'OK',
      // No cachedContentTokenCount next to a prompt count: none cached.
      usage: { inputTokens: 6, outputTokens: 21, cachedInputTokens: 0 },
    });
  });

  it('N12: missing or bogus metadata still succeeds without usage', async () => {
    const result = await run(
      jsonResponse(200, {
        ...geminiOk(),
        usageMetadata: { promptTokenCount: -3 },
      }),
    ).result;
    expect(result).toEqual({ ok: true, sample: 'OK' });
  });

  it('N13: the key never appears in results even if the provider echoes it', async () => {
    const errorResult = await run(
      jsonResponse(
        400,
        googleError(400, 'INVALID_ARGUMENT', 'API_KEY_INVALID'),
      ),
    ).result;
    expect(JSON.stringify(errorResult)).not.toContain(FAKE_KEY);
    const echo = await run(jsonResponse(200, geminiOk(`OK ${FAKE_KEY}`)))
      .result;
    expect(JSON.stringify(echo)).not.toContain(FAKE_KEY);
  });

  it('truncates and cleans long samples', async () => {
    const result = await run(
      jsonResponse(200, geminiOk('OK\n\u0007' + 'x'.repeat(200))),
    ).result;
    expect(result.ok && result.sample.length).toBe(40);
    expect(result.ok && result.sample).not.toMatch(/\p{Cc}/u);
  });
});

describe('V5.7 model list (GE-14)', () => {
  it('follows pages, keeps only generateContent text models, key in the header only', async () => {
    const pages = [
      {
        models: [
          {
            name: 'models/gemini-3.1-flash-lite',
            supportedGenerationMethods: ['generateContent', 'countTokens'],
          },
          {
            name: 'models/text-embedding-004',
            supportedGenerationMethods: ['embedContent'],
          },
          {
            name: 'models/imagen-4.0-generate',
            supportedGenerationMethods: ['generateContent'],
          },
        ],
        nextPageToken: 'page-2',
      },
      {
        models: [
          {
            name: 'models/gemini-3.5-flash-lite',
            supportedGenerationMethods: ['generateContent'],
          },
          {
            name: 'tunedModels/mine',
            supportedGenerationMethods: ['generateContent'],
          },
        ],
      },
    ];
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(jsonResponse(200, pages.shift())),
    );
    expect(
      await geminiAdapter.listModels({ key: FAKE_KEY, fetchImpl }),
    ).toEqual({
      ok: true,
      models: ['gemini-3.1-flash-lite', 'gemini-3.5-flash-lite'],
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [second, init] = fetchImpl.mock.calls[1]!;
    expect(second as string).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000&pageToken=page-2',
    );
    expect(second as string).not.toContain(FAKE_KEY);
    expect(init!.headers).toEqual({ 'x-goog-api-key': FAKE_KEY });
  });

  it('a refused key is reported with a fixed code', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        jsonResponse(400, {
          error: {
            status: 'INVALID_ARGUMENT',
            details: [{ reason: 'API_KEY_INVALID' }],
          },
        }),
      ),
    );
    expect(
      await geminiAdapter.listModels({ key: FAKE_KEY, fetchImpl }),
    ).toEqual({
      ok: false,
      code: 'INVALID_KEY',
      httpStatus: 400,
    });
  });
});
