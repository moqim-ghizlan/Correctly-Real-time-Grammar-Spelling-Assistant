import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectionController } from '../../src/background/connection-controller';
import { protectedSpans, shield } from '../../src/shared/protection';
import { normalizeSettings } from '../../src/shared/settings';
import { SHORTCUTS_KEY, type ShortcutRecord } from '../../src/shared/shortcuts';
import { saveSettings } from '../../src/shared/storage';
import {
  FakeStorage,
  FAKE_KEY,
  geminiOk,
  jsonResponse,
} from '../helpers/fake-storage';

const entry = (
  trigger: string,
  replacement: string,
  extra: Partial<ShortcutRecord> = {},
): ShortcutRecord => ({
  id: trigger,
  trigger,
  replacement,
  enabled: true,
  protectTriggerInAi: true,
  protectReplacementInAi: false,
  ...extra,
});
const DICT = [
  entry('cbj', 'My custom business phrase'),
  entry('bjr', 'Bonjour'),
  entry('sig', 'Best regards,\nAlex', { protectReplacementInAi: true }),
  entry('off', 'x', { protectTriggerInAi: false }),
];
const fixedTag = () => 'TAG777';

describe('10.9: protected spans', () => {
  it('whole tokens only, any case; replacement only when opted in', () => {
    const text = 'Hello cbj, CBJ and abcbj; Bonjour! Best regards,\nAlex off';
    const spans = protectedSpans(text, DICT).map((s) =>
      text.slice(s.start, s.end),
    );
    expect(spans).toEqual(['cbj', 'CBJ', 'Best regards,\nAlex']);
  });

  it('overlaps keep the longest span; triggers inside a protected replacement are not split', () => {
    const dict = [
      entry('alex', 'x'),
      entry('sig', 'Best regards, Alex', { protectReplacementInAi: true }),
    ];
    const text = 'Best regards, Alex';
    expect(protectedSpans(text, dict)).toEqual([
      { start: 0, end: text.length },
    ]);
  });
});

describe('10.6: placeholders', () => {
  const guard = shield('Hello cbj, cbj again.', DICT, fixedTag);

  it('each occurrence gets its own marker; the dictionary is not in the text', () => {
    expect(guard.text).toBe('Hello [[TAG777_1]], [[TAG777_2]] again.');
    expect(guard.count).toBe(2);
    expect(guard.note).toMatch(/exactly once/);
    expect(guard.text).not.toContain('business');
  });

  it('restores exact originals, even reordered', () => {
    expect(guard.restore('[[TAG777_2]] then [[TAG777_1]], hi.')).toBe(
      'cbj then cbj, hi.',
    );
  });

  it('missing, duplicated, invented, altered or case-changed markers are rejected', () => {
    for (const candidate of [
      'Hello [[TAG777_1]], again.',
      'Hello [[TAG777_1]] [[TAG777_1]], [[TAG777_2]].',
      'Hello [[TAG777_1]], [[TAG777_2]] [[TAG777_3]].',
      'Hello [[TAG777_1]], [TAG777_2] again.',
      'Hello [[TAG777_1]], [[tag777_2]] again.',
      'Hello [[TAG777_1]], [[ TAG777_2 ]] again.',
    ])
      expect(guard.restore(candidate)).toBeNull();
  });

  it('a source already containing the marker prefix gets a new namespace', () => {
    const tags = ['AAAAAA', 'BBBBBB'];
    const s = shield('see [[AAAAAA_1]] and cbj', DICT, () => tags.shift()!);
    expect(s.text).toBe('see [[AAAAAA_1]] and [[BBBBBB_1]]');
  });

  it('no protected text: unchanged text and a no-op restore', () => {
    const s = shield('Nothing here', DICT, fixedTag);
    expect(s).toMatchObject({ text: 'Nothing here', count: 0, note: '' });
    expect(s.restore('anything')).toBe('anything');
  });
});

describe('10.10: integration — one request, masked copy, local restore', () => {
  let area: FakeStorage;
  let fetchImpl: ReturnType<typeof vi.fn<typeof fetch>>;
  const controller = () =>
    new ConnectionController({
      area,
      fetchImpl,
      today: () => '2026-10-15',
      isOnline: () => true,
      timeoutMs: 50,
      placeholderTag: fixedTag,
    });
  const answer = (value: unknown) =>
    jsonResponse(200, geminiOk(JSON.stringify(value)));
  const sentText = (call = 0) =>
    JSON.parse(fetchImpl.mock.calls[call]![1]!.body as string) as {
      contents: { parts: { text: string }[] }[];
      systemInstruction: { parts: { text: string }[] };
    };

  beforeEach(async () => {
    area = new FakeStorage();
    fetchImpl = vi.fn<typeof fetch>();
    await saveSettings(
      area,
      normalizeSettings({
        gemini: { apiKey: FAKE_KEY },
        correction: { consent: true },
      }),
    );
    area.data.set(SHORTCUTS_KEY, {
      schemaVersion: 2,
      revision: 1,
      enabled: false,
      shortcuts: DICT,
    });
  });

  it('correction: the trigger is masked in the one request and restored', async () => {
    fetchImpl.mockResolvedValueOnce(
      answer({
        hasErrors: true,
        correctedText: 'Please keep [[TAG777_1]] unchanged.',
      }),
    );
    const result = await controller().correct('Plese keep cbj unchanged.');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const body = sentText();
    expect(body.contents[0]!.parts[0]!.text).toBe(
      'Plese keep [[TAG777_1]] unchanged.',
    );
    expect(body.systemInstruction.parts[0]!.text).toMatch(
      /\[\[TAG777_1\]\] are protected/,
    );
    expect(JSON.stringify(body)).not.toContain('business'); // dictionary never sent
    expect(result).toMatchObject({
      correctedText: 'Please keep cbj unchanged.',
    });
  });

  it('I09: a lost placeholder makes the correction invalid — no second request', async () => {
    fetchImpl.mockResolvedValueOnce(
      answer({ hasErrors: true, correctedText: 'Please keep this unchanged.' }),
    );
    expect(
      await controller().correct('Plese keep cbj unchanged.'),
    ).toMatchObject({
      code: 'INVALID_RESPONSE',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('rewrite: a style that damaged the placeholder is dropped, the others kept', async () => {
    fetchImpl.mockResolvedValueOnce(
      answer({
        candidates: [
          { styleId: 'formal', text: 'Kindly retain [[TAG777_1]].' },
          { styleId: 'funny', text: 'Keep the mysterious thing!' },
        ],
      }),
    );
    const result = await controller().rewrite('keep cbj', ['formal', 'funny']);
    expect(result).toMatchObject({
      ok: true,
      candidates: [{ styleId: 'formal', text: 'Kindly retain cbj.' }],
      missing: ['funny'],
    });
  });

  it('translation keeps the protected replacement phrase verbatim', async () => {
    fetchImpl.mockResolvedValueOnce(
      answer({
        status: 'translated',
        candidates: [{ styleId: 'neutral', text: 'شكراً. [[TAG777_1]]' }],
      }),
    );
    const result = await controller().translate({
      type: 'correctly.v5.translateText',
      text: 'Merci. Best regards,\nAlex',
      source: 'auto',
      target: 'ar',
      variant: 'syrian',
      styleIds: [],
    });
    expect(sentText().contents[0]!.parts[0]!.text).toBe('Merci. [[TAG777_1]]');
    expect(result).toMatchObject({
      candidates: [{ text: 'شكراً. Best regards,\nAlex' }],
    });
  });
});
