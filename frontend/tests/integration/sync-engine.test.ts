// 5.14: two simulated computers (two storage.local, two storage.sync views
// that the test "syncs" with deliverTo), running the real worker engine.
import { describe, expect, it } from 'vitest';
import { SyncEngine } from '../../src/background/sync';
import {
  PROVIDERS_KEY,
  loadProviders,
  resolveRoute,
} from '../../src/shared/providers';
import { normalizeSettings } from '../../src/shared/settings';
import {
  SHORTCUTS_KEY,
  addShortcut,
  loadShortcuts,
  mutateShortcuts,
  removeShortcut,
  setExpansion,
  updateShortcut,
} from '../../src/shared/shortcuts';
import { loadSettings, saveSettings } from '../../src/shared/storage';
import {
  SYNC_BACKUP_KEY,
  SYNC_CLEAR,
  SYNC_META_KEY,
  SYNC_PASSPHRASE,
  SYNC_PREFIX,
  SYNC_PREFS_KEY,
  SYNC_RESOLVE,
  SYNC_RESTORE,
  SYNC_STATE_KEY,
  headKey,
  normalizeSyncState,
  type SyncDomain,
} from '../../src/shared/sync';
import { KEYBINDINGS_KEY, loadKeybindings } from '../../src/shared/keybindings';
import {
  FAKE_KEY,
  FakeStorage,
  FakeSyncArea,
  FastFakeStorage,
  GEMINI_ID,
  profile,
  seedProviders,
} from '../helpers/fake-storage';

const ALL: SyncDomain[] = ['shortcuts', 'settings', 'keybindings', 'keys'];

/** One computer: its storage.local fires the engine like chrome.storage.onChanged. */
function computer(
  domains: SyncDomain[] = ['shortcuts', 'settings', 'keybindings'],
) {
  const local = new FastFakeStorage();
  const sync = new FakeSyncArea();
  let now = 1_000_000;
  const engine = new SyncEngine({
    local,
    sync,
    iterations: 1000,
    now: () => (now += 1000),
  });
  const set = local.set.bind(local);
  local.set = async (items) => {
    await set(items);
    void engine.onLocalChanged(Object.keys(items));
  };
  sync.onChanged((keys) => void engine.onSyncChanged(keys));
  const enable = async (list = domains, enabled = true) => {
    await local.set({
      [SYNC_PREFS_KEY]: {
        schemaVersion: 1,
        enabled,
        domains: Object.fromEntries(ALL.map((d) => [d, list.includes(d)])),
      },
    });
    await engine.idle();
  };
  const state = async () =>
    normalizeSyncState((await local.get([SYNC_STATE_KEY]))[SYNC_STATE_KEY]);
  const triggers = async () =>
    (await loadShortcuts(local)).store.shortcuts.map((s) => s.trigger).sort();
  return { local, sync, engine, enable, state, triggers };
}
type Computer = ReturnType<typeof computer>;

/** The browser syncs both ways until nothing changes. */
async function settle(...computers: Computer[]) {
  for (let round = 0; round < 10; round++) {
    let delivered = 0;
    for (const a of computers)
      for (const b of computers)
        if (a !== b) delivered += a.sync.deliverTo(b.sync);
    for (const c of computers) await c.engine.idle();
    if (!delivered) return;
  }
  throw new Error('the computers never settled');
}

const add = (c: Computer, trigger: string, replacement = trigger + '!') =>
  mutateShortcuts(c.local, addShortcut({ trigger, replacement })).then(() =>
    c.engine.idle(),
  );

describe('sync off', () => {
  it('makes no storage.sync call at all', async () => {
    const a = computer();
    await add(a, 'brb');
    await a.engine.reconcile(['shortcuts']);
    await a.enable(ALL, false);
    expect(a.sync.gets).toBe(0);
    expect(a.sync.writes).toBe(0);
    expect((await a.state()).domains.shortcuts.status).toBe('off');
  });
});

describe('text shortcuts between two computers', () => {
  it('adds, edits and deletes on A appear on B; expansion stays local', async () => {
    const a = computer();
    const b = computer();
    await add(a, 'brb', 'be right back');
    await mutateShortcuts(a.local, setExpansion(true));
    await a.enable();
    await b.enable();
    await settle(a, b);
    expect(await b.triggers()).toEqual(['brb']);
    // "Expansion on" needs site access on each computer: never synced.
    expect((await loadShortcuts(b.local)).store.enabled).toBe(false);

    await add(a, 'omw', 'on my way');
    await settle(a, b);
    expect(await b.triggers()).toEqual(['brb', 'omw']);

    const brb = (await loadShortcuts(a.local)).store.shortcuts[0]!;
    await mutateShortcuts(a.local, updateShortcut(brb, { replacement: 'BRB' }));
    await a.engine.idle();
    await settle(a, b);
    const onB = (await loadShortcuts(b.local)).store.shortcuts;
    expect(onB.find((s) => s.trigger === 'brb')?.replacement).toBe('BRB');

    const omw = onB.find((s) => s.trigger === 'omw')!;
    await mutateShortcuts(b.local, removeShortcut(omw));
    await b.engine.idle();
    await settle(a, b);
    expect(await a.triggers()).toEqual(['brb']);
    expect((await a.state()).domains.shortcuts.status).toBe('synced');
  });

  it('merges offline additions made on both computers (per shortcut)', async () => {
    const a = computer();
    const b = computer();
    await a.enable();
    await b.enable();
    await add(a, 'common');
    await settle(a, b);
    // Both offline: nothing is delivered while they edit.
    await add(a, 'fromA');
    await add(b, 'fromB');
    await settle(a, b);
    expect(await a.triggers()).toEqual(['common', 'fromA', 'fromB']);
    expect(await b.triggers()).toEqual(['common', 'fromA', 'fromB']);
  });

  it('the same shortcut changed on both: one wins, the other is restorable', async () => {
    const a = computer();
    const b = computer();
    await a.enable();
    await b.enable();
    await add(a, 'sig', 'original');
    await settle(a, b);
    const onA = (await loadShortcuts(a.local)).store.shortcuts[0]!;
    const onB = (await loadShortcuts(b.local)).store.shortcuts[0]!;
    await mutateShortcuts(
      a.local,
      updateShortcut(onA, { replacement: 'from A' }),
    );
    await mutateShortcuts(
      b.local,
      updateShortcut(onB, { replacement: 'from B' }),
    );
    await a.engine.idle();
    await b.engine.idle();
    await settle(a, b);
    const final = async (c: Computer) =>
      (await loadShortcuts(c.local)).store.shortcuts[0]!.replacement;
    expect(await final(a)).toBe(await final(b));
    const loser = (await final(a)) === 'from A' ? b : a;
    expect((await loser.state()).domains.shortcuts.replaced).toBe(true);
    expect(
      (await loser.local.get([SYNC_BACKUP_KEY]))[SYNC_BACKUP_KEY],
    ).toHaveProperty('shortcuts');
    const reply = await loser.engine.handle({
      type: SYNC_RESTORE,
      domain: 'shortcuts',
    });
    expect(reply).toEqual({ ok: true });
    await settle(a, b);
    expect(await final(a)).toBe(await final(b));
    expect(await final(a)).toBe(loser === a ? 'from A' : 'from B');
    expect((await loser.state()).domains.shortcuts.replaced).toBe(false);
  });

  it('no loop: a settled pair writes nothing more', async () => {
    const a = computer();
    const b = computer();
    await add(a, 'x1');
    await a.enable();
    await b.enable();
    await settle(a, b);
    const writes = a.sync.writes + b.sync.writes;
    await a.engine.reconcile();
    await b.engine.reconcile();
    await settle(a, b);
    expect(a.sync.writes + b.sync.writes).toBe(writes);
  });

  it('a batch received in part is not applied until it is complete', async () => {
    const a = computer();
    const b = computer();
    await a.enable();
    await b.enable();
    await settle(a, b);
    await add(a, 'later', 'x'.repeat(1500));
    for (let i = 0; i < 8; i++) await add(a, `more${i}`, 'y'.repeat(1500));
    const chunks = [...a.sync.data.keys()].filter(
      (k) => k.startsWith(SYNC_PREFIX + 'shortcuts.') && !k.endsWith('.head'),
    );
    expect(chunks.length).toBeGreaterThan(1);
    // Only the head and the first chunk arrive.
    a.sync.deliverTo(b.sync, [headKey('shortcuts'), chunks[0]!]);
    await b.engine.idle();
    expect(await b.triggers()).toEqual([]);
    expect((await b.state()).domains.shortcuts.status).toBe('pending');
    await settle(a, b);
    expect(await b.triggers()).toEqual(await a.triggers());
    expect((await b.triggers()).length).toBe(9);
  });

  it('too large: nothing is written, the local list stays whole', async () => {
    const a = computer();
    await a.enable();
    for (let i = 0; i < 60; i++)
      await mutateShortcuts(
        a.local,
        addShortcut({ trigger: `t${i}`, replacement: 'é'.repeat(1990) }),
      );
    await a.engine.idle();
    expect((await a.state()).domains.shortcuts).toMatchObject({
      status: 'error',
      code: 'tooLarge',
    });
    expect((await loadShortcuts(a.local)).store.shortcuts).toHaveLength(60);
    expect(a.sync.bytes()).toBeLessThan(95_000);
  });

  it('a stopped worker catches up on the next start', async () => {
    const a = computer();
    await a.enable();
    // The change lands while no engine runs (worker stopped).
    await mutateShortcuts(
      {
        get: (k) => a.local.get(k),
        set: (i) => FakeStorage.prototype.set.call(a.local, i),
      },
      addShortcut({ trigger: 'offline', replacement: 'x' }),
    );
    expect(a.sync.dump()).not.toContain('offline');
    const restarted = new SyncEngine({ local: a.local, sync: a.sync });
    await restarted.reconcile();
    expect(a.sync.dump()).toContain('offline');
  });

  it('a domain left unchecked is neither sent nor received', async () => {
    const a = computer();
    const b = computer();
    await add(a, 'mine');
    await a.enable(['settings']);
    await b.enable(['settings', 'shortcuts']);
    await settle(a, b);
    expect(a.sync.dump()).not.toContain('mine');
    expect(await b.triggers()).toEqual([]);
  });
});

describe('settings', () => {
  it('preferences follow; the handle and consent never do', async () => {
    const a = computer();
    const b = computer();
    await saveSettings(
      a.local,
      normalizeSettings({
        ui: { language: 'en' },
        correction: { consent: true },
        triggers: { smartButton: true, contextMenu: false },
      }),
    );
    await a.enable();
    await b.enable();
    await settle(a, b);
    const onB = await loadSettings(b.local);
    expect(onB.ui.language).toBe('en');
    expect(onB.triggers.contextMenu).toBe(false);
    expect(onB.triggers.smartButton).toBe(false);
    expect(onB.correction.consent).toBe(false);
  });

  it('first activation with two different versions asks; the other is kept', async () => {
    const a = computer();
    const b = computer();
    await saveSettings(a.local, normalizeSettings({ ui: { language: 'en' } }));
    await saveSettings(b.local, normalizeSettings({ ui: { language: 'fr' } }));
    await a.enable();
    await settle(a, b);
    await b.enable();
    await settle(a, b);
    expect((await b.state()).domains.settings.status).toBe('choose');
    expect((await loadSettings(b.local)).ui.language).toBe('fr');
    const reply = await b.engine.handle({
      type: SYNC_RESOLVE,
      domain: 'settings',
      keep: 'remote',
    });
    expect(reply).toEqual({ ok: true });
    expect((await loadSettings(b.local)).ui.language).toBe('en');
    expect((await b.state()).domains.settings).toMatchObject({
      status: 'synced',
      replaced: true,
    });
    await b.engine.handle({ type: SYNC_RESTORE, domain: 'settings' });
    await settle(a, b);
    expect((await loadSettings(a.local)).ui.language).toBe('fr');
  });
});

describe('keyboard shortcuts', () => {
  it('bindings follow, "on" stays local', async () => {
    const a = computer();
    const b = computer();
    const binding = {
      ctrl: true,
      alt: false,
      shift: true,
      meta: false,
      code: 'KeyK',
      label: 'K',
    };
    await a.local.set({
      [KEYBINDINGS_KEY]: {
        schemaVersion: 1,
        enabled: true,
        bindings: { open: binding },
      },
    });
    await a.enable();
    await b.enable();
    await settle(a, b);
    const onB = await loadKeybindings(b.local);
    expect(onB.bindings.open).toEqual(binding);
    expect(onB.enabled).toBe(false);
  });
});

describe('API keys (encrypted)', () => {
  const seed = (c: Computer) =>
    seedProviders(c.local, [profile(GEMINI_ID, 'gemini')], {
      default: { credentialId: GEMINI_ID, modelId: 'gemini-2.5-flash-lite' },
    });

  it('need a passphrase; the key never reaches storage.sync in clear', async () => {
    const a = computer(ALL);
    const b = computer(ALL);
    seed(a);
    await a.enable();
    expect((await a.state()).domains.keys.status).toBe('needsPassphrase');
    expect(
      await a.engine.handle({
        type: SYNC_PASSPHRASE,
        passphrase: 'short',
        mode: 'replace',
      }),
    ).toEqual({ ok: false, code: 'weakPassphrase' });
    expect(
      await a.engine.handle({
        type: SYNC_PASSPHRASE,
        passphrase: 'correct horse battery',
        mode: 'replace',
      }),
    ).toEqual({ ok: true });
    expect(a.sync.dump()).toContain(SYNC_PREFIX + 'keys.head');
    expect(a.sync.dump()).not.toContain(FAKE_KEY);
    expect(a.sync.dump()).not.toContain(GEMINI_ID);

    await b.enable();
    await settle(a, b);
    expect((await b.state()).domains.keys.status).toBe('locked');
    expect(
      await b.engine.handle({
        type: SYNC_PASSPHRASE,
        passphrase: 'wrong passphrase',
        mode: 'unlock',
      }),
    ).toEqual({ ok: false, code: 'badPassphrase' });
    expect(
      await b.engine.handle({
        type: SYNC_PASSPHRASE,
        passphrase: 'correct horse battery',
        mode: 'unlock',
      }),
    ).toEqual({ ok: true });
    const loaded = await loadProviders(b.local);
    const resolved = resolveRoute(loaded.store, loaded.secrets, 'correction');
    expect(resolved.ok && resolved.key).toBe(FAKE_KEY);
    expect((await b.state()).domains.keys.status).toBe('synced');

    // Each push uses a fresh IV: the ciphertext changes, the content not.
    const before = JSON.stringify(a.sync.data.get(headKey('keys')));
    await a.local.set({
      [PROVIDERS_KEY]: { ...(await loadProviders(a.local)).store, revision: 9 },
    });
    await a.engine.idle();
    expect(JSON.stringify(a.sync.data.get(headKey('keys')))).toBe(before);
  });
});

describe('errors and controls', () => {
  it('a newer sync format is refused without writing', async () => {
    const a = computer();
    await add(a, 'x');
    a.sync.data.set(SYNC_META_KEY, { schemaVersion: 2 });
    await a.enable();
    expect((await a.state()).domains.shortcuts).toMatchObject({
      status: 'error',
      code: 'unknownSchema',
    });
    expect(a.sync.writes).toBe(0);
  });

  it('the write rate limit is reported, then caught up', async () => {
    const a = computer();
    a.sync.maxWritesPerMinute = 0;
    await add(a, 'x');
    await a.enable();
    expect((await a.state()).domains.shortcuts).toMatchObject({
      status: 'error',
      code: 'rate',
    });
    a.sync.maxWritesPerMinute = 120;
    a.sync.writes = 0;
    await a.engine.reconcile();
    expect((await a.state()).domains.shortcuts.status).toBe('synced');
  });

  it('clear empties Correctly data in storage.sync only', async () => {
    const a = computer();
    await add(a, 'keep');
    await a.enable();
    a.sync.data.set('other.extension.key', 1);
    await a.local.set({
      [SYNC_PREFS_KEY]: { schemaVersion: 1, enabled: false, domains: {} },
    });
    expect(await a.engine.handle({ type: SYNC_CLEAR })).toEqual({ ok: true });
    expect([...a.sync.data.keys()]).toEqual(['other.extension.key']);
    expect(await a.triggers()).toEqual(['keep']);
  });

  it('the damaged local store is never overwritten', async () => {
    const a = computer();
    const b = computer();
    await add(a, 'x');
    await a.enable();
    b.local.data.set(SHORTCUTS_KEY, { broken: true });
    await b.enable();
    await settle(a, b);
    expect((await b.state()).domains.shortcuts.code).toBe('localDamaged');
    expect(b.local.data.get(SHORTCUTS_KEY)).toEqual({ broken: true });
  });
});
