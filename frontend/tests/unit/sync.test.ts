import { describe, expect, it } from 'vitest';
import { normalizeSettings } from '../../src/shared/settings';
import type { ShortcutRecord } from '../../src/shared/shortcuts';
import {
  CHUNK_DATA_BYTES,
  KDF_ITERATIONS,
  SYNC_CLEAR,
  SYNC_ITEM_BYTES,
  SYNC_NOW,
  SYNC_PASSPHRASE,
  SYNC_RESOLVE,
  SYNC_RESTORE,
  buildItems,
  canonicalJson,
  decryptText,
  deriveSecret,
  encryptText,
  headKey,
  isSyncRequest,
  itemBytes,
  mergeSettings,
  mergeShortcuts,
  normalizeSyncPrefs,
  normalizeSyncSecret,
  normalizeSyncState,
  parseEnvelope,
  parseSyncedKeys,
  parseSyncedSettings,
  parseSyncedShortcuts,
  pickSettings,
  readRemote,
  splitChunks,
} from '../../src/shared/sync';
import { FAKE_KEY, GEMINI_ID, profile } from '../helpers/fake-storage';

const meta = (rev = '0123456789abcdef') => ({
  rev,
  history: [],
  updatedAt: 5,
  deviceId: 'device-0001',
});

/** A lone surrogate at either end means a character was cut in two. */
const LONE_SURROGATE = /^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/;

describe('chunking', () => {
  it('round-trips emoji, Arabic and quotes, never splitting a character', () => {
    const text = ('a"\\é😀مرحبا\n' + '😀'.repeat(3)).repeat(800);
    const pieces = splitChunks(text, 100);
    expect(pieces.join('')).toBe(text);
    for (const piece of pieces) {
      expect(piece).not.toMatch(LONE_SURROGATE);
      expect(
        new TextEncoder().encode(JSON.stringify(piece)).length,
      ).toBeLessThan(100 + 8);
    }
  });

  it('every item stays under Chrome’s per-item limit, key included', async () => {
    const wire = '😀"'.repeat(20_000);
    const { head, items } = await buildItems('shortcuts', wire, meta());
    expect(head.chunks).toBeGreaterThan(5);
    for (const [key, value] of Object.entries(items))
      expect(itemBytes(key, value)).toBeLessThanOrEqual(SYNC_ITEM_BYTES);
    expect(await readRemote(items, 'shortcuts')).toMatchObject({
      kind: 'ok',
      wire,
    });
    expect(CHUNK_DATA_BYTES).toBeLessThan(SYNC_ITEM_BYTES);
  });

  it('a missing chunk, another revision or a wrong hash is incomplete', async () => {
    const { items } = await buildItems('settings', 'x'.repeat(20_000), meta());
    const chunkKeys = Object.keys(items).filter(
      (k) => k !== headKey('settings'),
    );
    const missing = { ...items };
    delete missing[chunkKeys[1]!];
    expect((await readRemote(missing, 'settings')).kind).toBe('incomplete');
    const otherRev = {
      ...items,
      [chunkKeys[0]!]: { rev: 'ffffffffffffffff', data: 'x' },
    };
    expect((await readRemote(otherRev, 'settings')).kind).toBe('incomplete');
    const tampered = {
      ...items,
      [chunkKeys[0]!]: {
        ...(items[chunkKeys[0]!] as object),
        data: 'y'.repeat(10),
      },
    };
    expect((await readRemote(tampered, 'settings')).kind).toBe('incomplete');
    expect((await readRemote({}, 'settings')).kind).toBe('missing');
  });

  it('a newer format is refused', async () => {
    const { items } = await buildItems('settings', '{}', meta());
    items[headKey('settings')] = {
      ...(items[headKey('settings')] as object),
      schemaVersion: 2,
    };
    expect((await readRemote(items, 'settings')).kind).toBe('unknownSchema');
  });
});

describe('payloads', () => {
  it('canonical JSON ignores key order', () => {
    expect(canonicalJson({ b: 1, a: [{ d: 1, c: 2 }] })).toBe(
      canonicalJson({ a: [{ c: 2, d: 1 }], b: 1 }),
    );
  });

  it('settings: only the synced fields leave or come in', () => {
    const local = normalizeSettings({
      correction: { consent: true },
      triggers: { smartButton: true },
      safety: { dailyTestAttemptLimit: 7 },
    });
    const synced = pickSettings(
      normalizeSettings({
        ui: { language: 'en' },
        correction: { consent: false },
        triggers: { smartButton: false, keyboard: false },
      }),
    );
    expect(Object.keys(synced).sort()).toEqual([
      'contextMenu',
      'keyboard',
      'language',
      'rewrite',
      'translation',
    ]);
    const merged = mergeSettings(local, synced);
    expect(merged.ui.language).toBe('en');
    expect(merged.triggers.keyboard).toBe(false);
    expect(merged.triggers.smartButton).toBe(true);
    // 5.15: the translate button needs site access on each computer too.
    expect(
      mergeSettings(
        normalizeSettings({ triggers: { selectionButton: true } }),
        synced,
      ).triggers.selectionButton,
    ).toBe(true);
    expect(Object.keys(synced)).not.toContain('selectionButton');
    expect(merged.correction.consent).toBe(true);
    expect(merged.safety.dailyTestAttemptLimit).toBe(7);
  });

  it('untrusted synced data is normalized or refused', async () => {
    expect(parseSyncedSettings('x')).toBeNull();
    expect(
      parseSyncedSettings({ language: 'xx', keyboard: 'yes' }),
    ).toMatchObject({ language: 'auto', keyboard: true });
    expect(
      parseSyncedShortcuts({ shortcuts: [{ trigger: 'bad trigger!' }] }),
    ).toBeNull();
    expect(parseSyncedShortcuts({ shortcuts: 'no' })).toBeNull();
    expect(await parseSyncedKeys({ store: 'no' })).toBeNull();
    const keys = await parseSyncedKeys({
      store: {
        schemaVersion: 1,
        revision: 4,
        profiles: [profile(GEMINI_ID, 'gemini')],
        routes: {},
      },
      secrets: {
        secrets: {
          [GEMINI_ID]: { provider: 'gemini', revision: 1, key: FAKE_KEY },
          'orphan-profile-1': {
            provider: 'gemini',
            revision: 1,
            key: FAKE_KEY,
          },
        },
      },
    });
    expect(keys?.store.revision).toBe(0);
    expect(Object.keys(keys!.secrets.secrets)).toEqual([GEMINI_ID]);
  });

  it('prefs, state and secret normalize to safe defaults', () => {
    expect(
      normalizeSyncPrefs({ enabled: 'yes', domains: { keys: true } }),
    ).toEqual({
      schemaVersion: 1,
      enabled: false,
      domains: {
        shortcuts: false,
        settings: false,
        keybindings: false,
        keys: true,
      },
    });
    expect(
      normalizeSyncState({ domains: { shortcuts: { status: 'evil' } } }).domains
        .shortcuts.status,
    ).toBe('off');
    expect(
      normalizeSyncSecret({ salt: 'x', key: 'y', iterations: 1 }),
    ).toBeNull();
  });
});

describe('per-shortcut merge', () => {
  const s = (
    id: string,
    trigger: string,
    replacement = trigger,
  ): ShortcutRecord => ({
    id,
    trigger,
    replacement,
    enabled: true,
    protectTriggerInAi: true,
    protectReplacementInAi: false,
  });

  it('takes each side’s edits and deletions', () => {
    const base = [s('1', 'a'), s('2', 'b'), s('3', 'c')];
    const local = [s('1', 'a', 'A!'), s('2', 'b'), s('3', 'c'), s('4', 'd')];
    const remote = [s('1', 'a'), s('3', 'c', 'C!'), s('5', 'e')];
    const result = mergeShortcuts(base, local, remote, false);
    expect(
      result.shortcuts.map((x) => `${x.trigger}=${x.replacement}`).sort(),
    ).toEqual(['a=A!', 'c=C!', 'd=d', 'e=e']);
    expect(result.localLost).toBe(false);
    expect(result.remoteLost).toBe(false);
  });

  it('a conflict follows the winner and reports the loser', () => {
    const base = [s('1', 'a')];
    const local = [s('1', 'a', 'local')];
    const remote = [s('1', 'a', 'remote')];
    expect(mergeShortcuts(base, local, remote, false)).toMatchObject({
      shortcuts: [{ replacement: 'remote' }],
      localLost: true,
    });
    expect(mergeShortcuts(base, local, remote, true)).toMatchObject({
      shortcuts: [{ replacement: 'local' }],
      remoteLost: true,
    });
  });

  it('the same trigger added twice keeps one entry', () => {
    const result = mergeShortcuts(
      [],
      [s('L', 'brb', 'mine')],
      [s('R', 'BRB', 'theirs')],
      false,
    );
    expect(result.shortcuts).toEqual([s('R', 'BRB', 'theirs')]);
    expect(result.localLost).toBe(true);
  });
});

describe('encryption', () => {
  it('round-trips; a wrong passphrase or salt fails; the IV changes', async () => {
    const secret = await deriveSecret('correct horse battery', undefined, 1000);
    const one = await encryptText(secret, `{"key":"${FAKE_KEY}"}`);
    const two = await encryptText(secret, `{"key":"${FAKE_KEY}"}`);
    expect(one).not.toContain(FAKE_KEY);
    expect(parseEnvelope(one)!.iv).not.toBe(parseEnvelope(two)!.iv);
    expect(await decryptText(secret, parseEnvelope(one)!)).toContain(FAKE_KEY);
    const wrong = await deriveSecret('wrong passphrase', secret.salt, 1000);
    expect(await decryptText(wrong, parseEnvelope(one)!)).toBeNull();
    const other = await deriveSecret('correct horse battery', undefined, 1000);
    expect(await decryptText(other, parseEnvelope(one)!)).toBeNull();
    expect(normalizeSyncSecret(secret)).toEqual(secret);
  });

  it('a new passphrase uses PBKDF2 with at least 600,000 iterations', () => {
    expect(KDF_ITERATIONS).toBeGreaterThanOrEqual(600_000);
  });
});

describe('message shapes', () => {
  it('accepts exact shapes only', () => {
    expect(isSyncRequest({ type: SYNC_NOW })).toBe(true);
    expect(isSyncRequest({ type: SYNC_CLEAR })).toBe(true);
    expect(
      isSyncRequest({ type: SYNC_RESOLVE, domain: 'keys', keep: 'local' }),
    ).toBe(true);
    expect(isSyncRequest({ type: SYNC_RESTORE, domain: 'settings' })).toBe(
      true,
    );
    expect(
      isSyncRequest({
        type: SYNC_PASSPHRASE,
        passphrase: 'abcdefgh',
        mode: 'unlock',
      }),
    ).toBe(true);
    for (const bad of [
      { type: SYNC_NOW, extra: 1 },
      { type: SYNC_RESOLVE, domain: 'usage', keep: 'local' },
      { type: SYNC_RESOLVE, domain: 'keys', keep: 'both' },
      { type: SYNC_RESTORE },
      { type: SYNC_PASSPHRASE, passphrase: 1, mode: 'unlock' },
      { type: SYNC_PASSPHRASE, passphrase: 'x'.repeat(2000), mode: 'unlock' },
      [SYNC_NOW],
      null,
    ])
      expect(isSyncRequest(bad)).toBe(false);
  });
});
