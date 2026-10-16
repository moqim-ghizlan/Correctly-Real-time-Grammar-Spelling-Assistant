import { beforeEach, describe, expect, it } from 'vitest';
import {
  MAX_SHORTCUTS,
  SHORTCUTS_KEY,
  V4_SHORTCUTS_KEY,
  ShortcutError,
  addShortcut,
  applyImport,
  exportBackup,
  loadShortcuts,
  mutateShortcuts,
  parseBackup,
  planImport,
  removeShortcut,
  setExpansion,
  shortcutExpansion,
  shortcutMap,
  updateShortcut,
  type ShortcutRecord,
} from '../../src/shared/shortcuts';
import { FakeStorage } from '../helpers/fake-storage';

let area: FakeStorage;
const draft = (trigger: string, replacement: string, extra = {}) => ({
  trigger,
  replacement,
  enabled: true,
  protectTriggerInAi: true,
  protectReplacementInAi: false,
  ...extra,
});
const add = (trigger: string, replacement: string, extra = {}) =>
  mutateShortcuts(area, addShortcut(draft(trigger, replacement, extra)));
const expand = (
  typed: string,
  entries = [{ trigger: 'bjr', replacement: 'Bonjour' }],
) => {
  const plan = shortcutExpansion(typed, typed.length, shortcutMap(entries));
  return plan
    ? typed.slice(0, plan.start) + plan.replacement + typed.slice(plan.end)
    : typed;
};

beforeEach(() => {
  area = new FakeStorage();
});

describe('A: schema, validation and migration', () => {
  it('A01: a missing store starts empty, off, with no seeded shortcuts', async () => {
    const loaded = await loadShortcuts(area);
    expect(loaded).toMatchObject({ origin: 'empty', damaged: false });
    expect(loaded.store.shortcuts).toEqual([]);
    expect(loaded.store.enabled).toBe(false);
  });

  it('A02/A03: V4 data is migrated read-only, idempotently, with flag defaults', async () => {
    const v4 = {
      schemaVersion: 1,
      enabled: true,
      shortcuts: [
        {
          id: 'a1',
          trigger: 'bjr',
          replacement: 'Bonjour',
          enabled: true,
          createdAt: 1,
          updatedAt: 2,
        },
        {
          id: 'a2',
          trigger: 'sig',
          replacement: 'Best regards,\nAlex',
          enabled: false,
          createdAt: 1,
          updatedAt: 2,
        },
      ],
    };
    area.data.set(V4_SHORTCUTS_KEY, v4);
    const first = await loadShortcuts(area);
    const second = await loadShortcuts(area);
    expect(first).toEqual(second);
    expect(first.origin).toBe('v4');
    expect(first.store.shortcuts).toEqual([
      {
        id: 'a1',
        trigger: 'bjr',
        replacement: 'Bonjour',
        enabled: true,
        protectTriggerInAi: true,
        protectReplacementInAi: false,
      },
      {
        id: 'a2',
        trigger: 'sig',
        replacement: 'Best regards,\nAlex',
        enabled: false,
        protectTriggerInAi: true,
        protectReplacementInAi: false,
      },
    ]);
    // First change writes the V5 store; the V4 copy is never touched.
    await add('cbj', 'phrase');
    expect(area.data.get(V4_SHORTCUTS_KEY)).toEqual(v4);
    expect((await loadShortcuts(area)).store.shortcuts).toHaveLength(3);
  });

  it('A10: a damaged store is reported, left untouched and blocks writes', async () => {
    area.data.set(SHORTCUTS_KEY, {
      schemaVersion: 2,
      enabled: true,
      shortcuts: 'oops',
    });
    expect(await loadShortcuts(area)).toMatchObject({ damaged: true });
    await expect(add('bjr', 'Bonjour')).rejects.toThrow(/endommagés/);
    expect(area.data.get(SHORTCUTS_KEY)).toEqual({
      schemaVersion: 2,
      enabled: true,
      shortcuts: 'oops',
    });
  });

  it('A06/A07/A08: duplicates (any case), empty, spaced or punctuated triggers are rejected', async () => {
    await add('bjr', 'Bonjour');
    await expect(add('BJR', 'x')).rejects.toThrow(/existe déjà/);
    for (const trigger of ['', '  ', 'a b', 'a.b', 'x'.repeat(33), 'bad\nline'])
      await expect(add(trigger, 'x')).rejects.toThrow(ShortcutError);
    await expect(add('ok', '')).rejects.toThrow(/Remplacement/);
    await expect(add('ok2', 'bell\u0007')).rejects.toThrow(/Remplacement/);
    expect((await loadShortcuts(area)).store.shortcuts).toHaveLength(1);
  });

  it('A09: Unicode triggers and replacements are kept exactly', async () => {
    await add('مرحبا', 'أهلين وسهلين');
    await add('tst', 'Test 😀\nline 2');
    expect(
      (await loadShortcuts(area)).store.shortcuts.map((s) => s.replacement),
    ).toEqual(['أهلين وسهلين', 'Test 😀\nline 2']);
  });

  it('A04/A05: 500 entries accepted, the 501st refused with the 500 kept', async () => {
    await mutateShortcuts(area, (store) => ({
      ...store,
      shortcuts: Array.from({ length: MAX_SHORTCUTS }, (_, i) => ({
        id: `id${i}`,
        ...draft(`t${i}`, `r${i}`),
      })),
    }));
    await expect(add('extra', 'x')).rejects.toThrow(/500/);
    expect((await loadShortcuts(area)).store.shortcuts).toHaveLength(500);
  });
});

describe('writes and concurrency (9.5)', () => {
  it('independent changes from two pages both survive', async () => {
    await add('aa', 'A');
    const shown = (await loadShortcuts(area)).store.shortcuts[0]!;
    // Tab 1 adds, tab 2 toggles A from its older view: both are kept.
    await Promise.all([
      add('bb', 'B'),
      mutateShortcuts(area, updateShortcut(shown, { enabled: false })),
    ]);
    const { shortcuts } = (await loadShortcuts(area)).store;
    expect(shortcuts.map((s) => [s.trigger, s.enabled])).toEqual([
      ['aa', false],
      ['bb', true],
    ]);
  });

  it('a stale edit or delete of a changed entry fails clearly; no silent loss', async () => {
    await add('aa', 'A');
    const shown = (await loadShortcuts(area)).store.shortcuts[0]!;
    await mutateShortcuts(
      area,
      updateShortcut(shown, { replacement: 'first' }),
    );
    await expect(
      mutateShortcuts(area, updateShortcut(shown, { replacement: 'second' })),
    ).rejects.toThrow(/autre fenêtre/);
    await expect(mutateShortcuts(area, removeShortcut(shown))).rejects.toThrow(
      /autre fenêtre/,
    );
    expect((await loadShortcuts(area)).store.shortcuts[0]?.replacement).toBe(
      'first',
    );
  });

  it('a failed storage write keeps the previous dictionary', async () => {
    await add('aa', 'A');
    area.failSet = true;
    await expect(add('bb', 'B')).rejects.toThrow();
    area.failSet = false;
    expect(
      (await loadShortcuts(area)).store.shortcuts.map((s) => s.trigger),
    ).toEqual(['aa']);
  });

  it('the global switch and revision persist', async () => {
    const store = await mutateShortcuts(area, setExpansion(true));
    expect(store).toMatchObject({ enabled: true, revision: 1 });
  });
});

describe('JSON backup', () => {
  it('8.8: export holds only shortcut fields — no key, settings or usage', async () => {
    area.data.set('correctly.v5.settings', {
      gemini: { apiKey: 'AIzaSyFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKE1' },
    });
    area.data.set('correctly.v5.usage', { requestHistory: 'x' });
    await add('bjr', 'Bonjour');
    await add('sig', 'Best regards,\nAlex', { enabled: false });
    const text = exportBackup(
      (await loadShortcuts(area)).store,
      new Date('2026-10-15T12:00:00Z'),
    );
    for (const secret of [
      'AIza',
      'apiKey',
      'API_KEY',
      'requestHistory',
      'chatHistory',
      'gemini',
      'usage',
    ])
      expect(text).not.toContain(secret);
    const data = JSON.parse(text) as { format: string; shortcuts: object[] };
    expect(data.format).toBe('correctly-personal-shortcuts');
    expect(data.shortcuts).toHaveLength(2);
    // Round trip
    expect(parseBackup(text).map((s) => s.trigger)).toEqual(['bjr', 'sig']);
  });

  it('invalid, foreign, duplicated or oversized files are rejected whole', () => {
    const good = { format: 'correctly-personal-shortcuts', schemaVersion: 2 };
    for (const text of [
      'not json',
      JSON.stringify([]),
      JSON.stringify({ ...good, schemaVersion: 3, shortcuts: [] }),
      JSON.stringify({ format: 'other', schemaVersion: 2, shortcuts: [] }),
      JSON.stringify({
        ...good,
        shortcuts: [draft('bjr', 'a'), draft('BJR', 'b')],
      }),
      JSON.stringify({
        ...good,
        shortcuts: [draft('ok', 'a'), { trigger: 'x y', replacement: 'b' }],
      }),
      JSON.stringify({
        ...good,
        shortcuts: [{ ...draft('ok', 'a'), enabled: 'yes' }],
      }),
      'x'.repeat(4 * 1024 * 1024 + 1),
    ])
      expect(() => parseBackup(text)).toThrow(ShortcutError);
  });

  it('8.6: skip keeps mine, overwrite keeps my ID, replaceAll removes the rest; re-import is a no-op', async () => {
    await add('bjr', 'Bonjour');
    await add('mine', 'only mine');
    const store = (await loadShortcuts(area)).store;
    const myId = store.shortcuts[0]!.id;
    const incoming = parseBackup(
      JSON.stringify({
        format: 'correctly-personal-shortcuts',
        schemaVersion: 2,
        shortcuts: [
          { ...draft('BJR', 'Bonjour à tous'), id: 'imported-id' },
          draft('cbj', 'phrase'),
        ],
      }),
    );
    const skip = planImport(store, incoming, 'skip');
    expect(skip).toMatchObject({ added: 1, conflicts: 1, removed: 0 });
    expect(skip.next.find((s) => s.trigger === 'bjr')?.replacement).toBe(
      'Bonjour',
    );
    const overwrite = planImport(store, incoming, 'overwrite');
    const replaced = overwrite.next.find((s) => s.id === myId)!;
    expect(replaced.replacement).toBe('Bonjour à tous');
    expect(planImport(store, incoming, 'replaceAll')).toMatchObject({
      removed: 1,
    });
    await mutateShortcuts(area, applyImport(skip));
    const after = (await loadShortcuts(area)).store;
    expect(planImport(after, incoming, 'skip')).toMatchObject({ added: 0 });
  });

  it('a preview made before another change must be reviewed again', async () => {
    await add('aa', 'A');
    const plan = planImport((await loadShortcuts(area)).store, [], 'skip');
    await add('bb', 'B');
    await expect(mutateShortcuts(area, applyImport(plan))).rejects.toThrow(
      /Choisissez à nouveau le fichier/,
    );
  });

  it('an import that would exceed 500 changes nothing', () => {
    const many: ShortcutRecord[] = Array.from(
      { length: MAX_SHORTCUTS },
      (_, i) => ({ id: `i${i}`, ...draft(`t${i}`, 'r') }),
    );
    expect(() =>
      planImport(
        { schemaVersion: 2, revision: 0, enabled: true, shortcuts: many },
        [{ id: 'n', ...draft('new', 'x') }],
        'skip',
      ),
    ).toThrow(/dépasserait 500/);
  });
});

describe('5: deterministic matcher', () => {
  it('2.2/2.3/5.4: separators kept once, whole word, any case, exact replacement', () => {
    expect(expand('bjr ')).toBe('Bonjour ');
    expect(expand('bjr,')).toBe('Bonjour,');
    expect(expand('x bjr!')).toBe('x Bonjour!');
    expect(expand('bjr ')).toBe('Bonjour ');
    expect(expand('Salut bjr,')).toBe('Salut Bonjour,');
    expect(expand('BJR ')).toBe('Bonjour ');
    expect(expand('Bjr ')).toBe('Bonjour ');
    expect(expand('(bjr)')).toBe('(bjr)'); // ")" is not a separator
    expect(expand('(bjr ')).toBe('(Bonjour ');
  });

  it('I03: substrings, no separator, Tab and Enter never expand', () => {
    for (const typed of ['abjr ', 'bjrXYZ ', 'bjr', 'bjr\t', 'bjr\n', "l'bjr "])
      expect(expand(typed)).toBe(typed);
  });

  it('A09/E: Unicode triggers and emoji replacements', () => {
    expect(
      expand('مرحبا ', [{ trigger: 'مرحبا', replacement: 'أهلين وسهلين' }]),
    ).toBe('أهلين وسهلين ');
    expect(
      expand('😀 tst ', [{ trigger: 'tst', replacement: 'Test 😀' }]),
    ).toBe('😀 Test 😀 ');
  });

  it('6.8: work is bounded by the trigger, not the field length', () => {
    const map = shortcutMap(
      Array.from({ length: 500 }, (_, i) => ({
        trigger: `t${i}`,
        replacement: `r${i}`,
      })),
    );
    const text = 'x'.repeat(50_000) + ' t499 ';
    const start = performance.now();
    for (let i = 0; i < 1000; i++) shortcutExpansion(text, text.length, map);
    expect(shortcutExpansion(text, text.length, map)?.replacement).toBe('r499');
    // Generous bound: 1000 lookups on a 50 kB field well under a second.
    expect(performance.now() - start).toBeLessThan(1000);
  });
});
