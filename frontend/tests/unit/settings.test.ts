import { describe, expect, it } from 'vitest';
import { localDate } from '../../src/shared/local-date';
import { DEFAULT_MODEL_ID, isAllowedModelId } from '../../src/shared/models';
import {
  normalizeConnection,
  normalizeSettings,
  normalizeUsage,
  parseDailyLimit,
  validateApiKey,
} from '../../src/shared/settings';
import {
  loadSettings,
  saveSettings,
  STORAGE_KEYS,
} from '../../src/shared/storage';
import { FakeStorage, FAKE_KEY } from '../helpers/fake-storage';

describe('settings defaults and validation', () => {
  it('S01: no saved settings gives safe defaults', async () => {
    const settings = await loadSettings(new FakeStorage());
    expect(settings).toEqual({
      schemaVersion: 1,
      gemini: { apiKey: null, modelId: DEFAULT_MODEL_ID, keyRevision: 0 },
      safety: { dailyTestAttemptLimit: 20 },
      correction: { consent: false },
      triggers: { keyboard: true, contextMenu: true, smartButton: false },
      rewrite: { enabled: true, defaultStyles: ['professional'] },
      translation: { source: 'auto', target: 'en', arabicVariant: 'msa' },
    });
  });

  it('V5.4: default styles keep known IDs in order, dedupe, and recover Professional', () => {
    const styles = (defaultStyles: unknown) =>
      normalizeSettings({ rewrite: { defaultStyles } }).rewrite.defaultStyles;
    expect(styles(['funny', 'formal', 'funny', 'evil'])).toEqual([
      'funny',
      'formal',
    ]);
    expect(styles(['evil'])).toEqual(['professional']);
    expect(styles('formal')).toEqual(['professional']);
    expect(normalizeSettings({ rewrite: { enabled: 0 } }).rewrite.enabled).toBe(
      true,
    );
    expect(
      normalizeSettings({ rewrite: { enabled: false } }).rewrite.enabled,
    ).toBe(false);
  });

  it('V5.3: shortcut and menu default on, smart button only when stored true', () => {
    expect(
      normalizeSettings({ triggers: { keyboard: 'no', smartButton: 1 } })
        .triggers,
    ).toEqual({ keyboard: true, contextMenu: true, smartButton: false });
    expect(
      normalizeSettings({
        triggers: { keyboard: false, contextMenu: false, smartButton: true },
      }).triggers,
    ).toEqual({ keyboard: false, contextMenu: false, smartButton: true });
  });

  it('V5.2: correction consent is on only for a stored boolean true', () => {
    for (const consent of [undefined, 'true', 1, null, {}])
      expect(
        normalizeSettings({ correction: { consent } }).correction.consent,
      ).toBe(false);
    expect(
      normalizeSettings({ correction: { consent: true } }).correction.consent,
    ).toBe(true);
  });

  it('S03: empty, blank or malformed keys are rejected', () => {
    expect(validateApiKey('').ok).toBe(false);
    expect(validateApiKey('    ').ok).toBe(false);
    expect(validateApiKey('abc def ghi jkl mno pqr').ok).toBe(false);
    expect(validateApiKey('short').ok).toBe(false);
    expect(validateApiKey('x'.repeat(201)).ok).toBe(false);
    expect(validateApiKey('<script>alert(1)</script>xxxxxxxx').ok).toBe(false);
    expect(validateApiKey(`  ${FAKE_KEY}  `)).toEqual({
      ok: true,
      key: FAKE_KEY,
    });
  });

  it('S07/S09: corrupt or injected model IDs never survive normalization', () => {
    for (const modelId of [
      'gemini-9-ultra',
      '../../v1/files',
      'gemini-3.1-flash-lite/../../x',
      'gemini-3.1-flash-lite?key=1',
      'https://evil.example/model',
      42,
      null,
    ]) {
      expect(isAllowedModelId(modelId)).toBe(false);
      expect(normalizeSettings({ gemini: { modelId } }).gemini.modelId).toBe(
        DEFAULT_MODEL_ID,
      );
    }
    expect(isAllowedModelId('gemini-3.5-flash-lite')).toBe(true);
  });

  it('S08: corrupt limits fall back to the default; parse rejects out-of-range', () => {
    for (const bad of ['abc', NaN, Infinity, -1, 0, 101, 2.5, '7.5', '', null])
      expect(
        normalizeSettings({ safety: { dailyTestAttemptLimit: bad } }).safety
          .dailyTestAttemptLimit,
      ).toBe(20);
    expect(parseDailyLimit('1')).toBe(1);
    expect(parseDailyLimit(' 100 ')).toBe(100);
    expect(parseDailyLimit('0')).toBeNull();
    expect(parseDailyLimit('101')).toBeNull();
    expect(parseDailyLimit('1e2')).toBeNull();
  });

  it('drops a stored value that is not key-shaped', () => {
    expect(normalizeSettings({ gemini: { apiKey: 'a b' } }).gemini.apiKey).toBe(
      null,
    );
    expect(normalizeSettings('garbage').gemini.apiKey).toBe(null);
  });

  it('normalizes corrupt connection records', () => {
    expect(
      normalizeConnection({
        lastCheckOk: 'yes',
        lastErrorCode: 'HACKED',
        lastCheckAt: 'not a date',
        lastSuccessfulModelId: '../x',
      }),
    ).toMatchObject({
      lastCheckOk: null,
      lastErrorCode: null,
      lastCheckAt: null,
      lastSuccessfulModelId: null,
    });
  });

  it('saves under a namespaced key and leaves V4 data alone', async () => {
    const area = new FakeStorage();
    area.data.set('settings', { language: 'fr' });
    area.data.set('shortcuts', [{ trigger: ';;sig' }]);
    await saveSettings(area, normalizeSettings({}));
    expect(area.data.get('settings')).toEqual({ language: 'fr' });
    expect(area.data.get('shortcuts')).toEqual([{ trigger: ';;sig' }]);
    expect(area.data.has(STORAGE_KEYS.settings)).toBe(true);
  });

  it('S06: storage rejection becomes STORAGE_ERROR', async () => {
    const area = new FakeStorage();
    area.failGet = true;
    await expect(loadSettings(area)).rejects.toMatchObject({
      code: 'STORAGE_ERROR',
    });
  });
});

describe('local date (Q08/Q09)', () => {
  it('uses the local calendar day, not the UTC day', () => {
    // 2026-03-01 00:30 local time is still 2026-02-28 in UTC for zones east
    // of UTC; the local formatter must report March 1st regardless.
    const date = new Date(2026, 2, 1, 0, 30);
    expect(localDate(date)).toBe('2026-03-01');
    expect(localDate(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
  });

  it('is stable across a DST change day', () => {
    // Last Sunday of March / October: local wall-clock dates stay correct.
    expect(localDate(new Date(2026, 2, 29, 3, 30))).toBe('2026-03-29');
    expect(localDate(new Date(2026, 9, 25, 2, 30))).toBe('2026-10-25');
  });

  it('a record from another day becomes a fresh record', () => {
    const usage = normalizeUsage(
      { localDate: '2026-10-14', testAttempts: 20 },
      '2026-10-15',
    );
    expect(usage.testAttempts).toBe(0);
    expect(usage.localDate).toBe('2026-10-15');
  });
});
