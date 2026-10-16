import { describe, expect, it } from 'vitest';
import { modelStatus } from '../../src/shared/models';
import {
  MIGRATED_LABEL,
  PROVIDERS_KEY,
  ProviderError,
  SECRETS_KEY,
  addProfile,
  deleteProfile,
  emptyProviders,
  loadProviders,
  migrateLegacyKey,
  mutateProviders,
  renameProfile,
  replaceKey,
  resolveRoute,
  setProfileEnabled,
  setRoute,
  slotsUsing,
  type ProviderStore,
  type SecretStore,
} from '../../src/shared/providers';
import { normalizeSettings } from '../../src/shared/settings';
import {
  STORAGE_KEYS,
  loadSettings,
  saveSettings,
  saveUsage,
} from '../../src/shared/storage';
import { SHORTCUTS_KEY, loadShortcuts } from '../../src/shared/shortcuts';
import {
  FAKE_KEY,
  FakeStorage,
  GEMINI_ID,
  OPENAI_ID,
  OPENAI_KEY,
  OTHER_KEY,
  profile,
  seedProviders,
} from '../helpers/fake-storage';

const gemini = { credentialId: GEMINI_ID, modelId: 'gemini-3.1-flash-lite' };
const openai = { credentialId: OPENAI_ID, modelId: 'gpt-5.6-luna' };

async function seeded(
  routes: Parameters<typeof seedProviders>[2],
  profiles = [profile(GEMINI_ID, 'gemini'), profile(OPENAI_ID, 'openai')],
) {
  const area = new FakeStorage();
  seedProviders(area, profiles, routes);
  const { store, secrets } = await loadProviders(area);
  return { area, store, secrets };
}

describe('RT: route resolution is exact and never falls back', () => {
  it('RT-03: no default route → NOT_CONFIGURED', async () => {
    const { store, secrets } = await seeded({});
    expect(resolveRoute(store, secrets, 'correction')).toEqual({
      ok: false,
      code: 'NOT_CONFIGURED',
    });
  });

  it('RT-04/05/07: a task without its own route inherits the default', async () => {
    for (const [route, provider, key] of [
      [gemini, 'gemini', FAKE_KEY],
      [openai, 'openai', OPENAI_KEY],
    ] as const) {
      const { store, secrets } = await seeded({ default: route });
      expect(resolveRoute(store, secrets, 'rewrite')).toEqual({
        ok: true,
        route: {
          provider,
          credentialId: route.credentialId,
          revision: 1,
          modelId: route.modelId,
        },
        key,
      });
    }
  });

  it('RT-06/RT-08/RT-09: explicit task routes win over the default', async () => {
    const { store, secrets } = await seeded({
      default: gemini,
      correction: openai,
      translation: openai,
    });
    expect(resolveRoute(store, secrets, 'correction')).toMatchObject({
      route: { provider: 'openai', modelId: 'gpt-5.6-luna' },
    });
    expect(resolveRoute(store, secrets, 'translation')).toMatchObject({
      route: { provider: 'openai' },
    });
    // Translate & rewrite has no own route here: it follows the default.
    expect(resolveRoute(store, secrets, 'translateRewrite')).toMatchObject({
      route: { provider: 'gemini' },
    });
  });

  it('RT-10/RT-12: an explicit route to a deleted key blocks — never the default', async () => {
    const { store, secrets } = await seeded(
      { default: gemini, correction: openai },
      [profile(GEMINI_ID, 'gemini')],
    );
    expect(resolveRoute(store, secrets, 'correction')).toEqual({
      ok: false,
      code: 'ROUTE_BROKEN',
    });
    const noDefault = await seeded({ default: openai }, [
      profile(GEMINI_ID, 'gemini'),
    ]);
    expect(resolveRoute(noDefault.store, noDefault.secrets, 'rewrite')).toEqual(
      {
        ok: false,
        code: 'ROUTE_BROKEN',
      },
    );
  });

  it('RT-11: a disabled key blocks, even with another key of the same provider', async () => {
    const { store, secrets } = await seeded({ default: gemini }, [
      profile(GEMINI_ID, 'gemini', { enabled: false }),
      profile('gemini-backup-1', 'gemini'),
    ]);
    expect(resolveRoute(store, secrets, 'correction')).toEqual({
      ok: false,
      code: 'PROFILE_DISABLED',
    });
  });

  it('RT-13: another provider’s model is rejected before any HTTP call', async () => {
    const { store, secrets } = await seeded({
      default: { credentialId: GEMINI_ID, modelId: 'gpt-5-nano' },
      correction: { credentialId: OPENAI_ID, modelId: 'gemini-3.1-flash-lite' },
    });
    expect(resolveRoute(store, secrets, 'rewrite')).toMatchObject({
      code: 'MODEL_UNAVAILABLE',
    });
    expect(resolveRoute(store, secrets, 'correction')).toMatchObject({
      code: 'MODEL_UNAVAILABLE',
    });
    expect(modelStatus('gemini', 'gpt-5-nano')).toBe('mismatch');
    expect(modelStatus('openai', 'o3')).toBe('unknown');
    expect(modelStatus('gemini', 'o3')).toBe('mismatch');
    expect(modelStatus('openai', '../x')).toBe('invalid');
  });

  it('RT-14: an unreviewed but well-formed model is allowed (explicit choice)', async () => {
    const { store, secrets } = await seeded({
      default: { credentialId: OPENAI_ID, modelId: 'gpt-7-experimental' },
    });
    expect(resolveRoute(store, secrets, 'correction')).toMatchObject({
      ok: true,
      route: { modelId: 'gpt-7-experimental' },
    });
  });

  it('RT-16/RT-17: two keys of one provider with the same-looking label stay distinct by ID', async () => {
    const { store, secrets } = await seeded(
      {
        default: {
          credentialId: 'gemini-second-2',
          modelId: 'gemini-3.1-flash-lite',
        },
      },
      [
        profile(GEMINI_ID, 'gemini', { label: 'Main' }),
        profile('gemini-second-2', 'gemini', { label: 'Main ' }),
      ],
    );
    const resolved = resolveRoute(store, secrets, 'correction');
    expect(resolved).toMatchObject({
      route: { credentialId: 'gemini-second-2' },
    });
  });

  it('a malformed stored route blocks instead of meaning “use default”', async () => {
    const area = new FakeStorage();
    seedProviders(area, [profile(GEMINI_ID, 'gemini')], { default: gemini });
    const raw = area.data.get(PROVIDERS_KEY) as ProviderStore;
    area.data.set(PROVIDERS_KEY, {
      ...raw,
      routes: {
        ...raw.routes,
        correction: { credentialId: '../x', modelId: 7 },
      },
    });
    const { store, secrets } = await loadProviders(area);
    expect(resolveRoute(store, secrets, 'correction')).toMatchObject({
      ok: false,
      code: 'ROUTE_BROKEN',
    });
    expect(resolveRoute(store, secrets, 'rewrite')).toMatchObject({ ok: true });
  });

  it('a key stored for an older revision is not used for the new one', async () => {
    const area = new FakeStorage();
    seedProviders(area, [profile(GEMINI_ID, 'gemini', { revision: 2 })], {
      default: gemini,
    });
    const secrets = area.data.get(SECRETS_KEY) as SecretStore;
    secrets.secrets[GEMINI_ID]!.revision = 1;
    area.data.set(SECRETS_KEY, secrets);
    const loaded = await loadProviders(area);
    expect(
      resolveRoute(loaded.store, loaded.secrets, 'correction'),
    ).toMatchObject({
      code: 'ROUTE_BROKEN',
    });
  });
});

describe('KEY: profile writes', () => {
  it('KEY-01/02/03: several keys per provider, each in the secret store only', async () => {
    const area = new FakeStorage();
    await mutateProviders(
      area,
      addProfile({ provider: 'gemini', label: 'Gemini Main', key: FAKE_KEY }),
    );
    await mutateProviders(
      area,
      addProfile({
        provider: 'gemini',
        label: 'Gemini Experiments',
        key: OTHER_KEY,
      }),
    );
    await mutateProviders(
      area,
      addProfile({
        provider: 'openai',
        label: 'OpenAI Personal',
        key: OPENAI_KEY,
      }),
    );
    const { store, secrets } = await loadProviders(area);
    expect(
      store.profiles.map((p) => [p.provider, p.label, p.enabled, p.revision]),
    ).toEqual([
      ['gemini', 'Gemini Main', true, 1],
      ['gemini', 'Gemini Experiments', true, 1],
      ['openai', 'OpenAI Personal', true, 1],
    ]);
    expect(JSON.stringify(area.data.get(PROVIDERS_KEY))).not.toMatch(
      /SENTINEL/,
    );
    expect(Object.values(secrets.secrets).map((s) => s.key)).toEqual([
      FAKE_KEY,
      OTHER_KEY,
      OPENAI_KEY,
    ]);
    // Saving never routes anything by itself.
    expect(store.routes.default).toBeNull();
  });

  it('KEY-04/05: invalid input writes nothing', async () => {
    const area = new FakeStorage();
    for (const draft of [
      { provider: 'gemini', label: 'A', key: '' },
      { provider: 'gemini', label: 'A', key: 'bad key with spaces here' },
      { provider: 'gemini', label: '', key: FAKE_KEY },
      { provider: 'gemini', label: 'x'.repeat(41), key: FAKE_KEY },
      { provider: 'deepseek', label: 'A', key: FAKE_KEY },
      { provider: 'gemini', label: 'tab\there', key: FAKE_KEY },
    ])
      await expect(
        mutateProviders(area, addProfile(draft)),
      ).rejects.toBeInstanceOf(ProviderError);
    expect(area.sets).toBe(0);
  });

  it('duplicate names are refused, ignoring case', async () => {
    const area = new FakeStorage();
    await mutateProviders(
      area,
      addProfile({ provider: 'gemini', label: 'Main', key: FAKE_KEY }),
    );
    await expect(
      mutateProviders(
        area,
        addProfile({ provider: 'openai', label: ' MAIN ', key: OPENAI_KEY }),
      ),
    ).rejects.toThrow(/existe déjà/);
  });

  it('KEY-06/09: rename keeps ID, key and routes; replace bumps the revision', async () => {
    const { area } = await seeded({ correction: openai });
    let { store } = await loadProviders(area);
    await mutateProviders(
      area,
      renameProfile(store.profiles[1]!, 'OpenAI Personal'),
    );
    ({ store } = await loadProviders(area));
    expect(store.profiles[1]).toMatchObject({
      id: OPENAI_ID,
      label: 'OpenAI Personal',
      revision: 1,
    });
    expect(store.routes.correction).toEqual(openai);
    const replacement = 'CORRECTLY_TEST_SENTINEL_KEY_openai_rotated';
    await mutateProviders(area, replaceKey(store.profiles[1]!, replacement));
    const loaded = await loadProviders(area);
    expect(loaded.store.profiles[1]!.revision).toBe(2);
    expect(loaded.secrets.secrets[OPENAI_ID]).toEqual({
      provider: 'openai',
      revision: 2,
      key: replacement,
    });
    expect(area.dump()).not.toContain(OPENAI_KEY);
    expect(
      resolveRoute(loaded.store, loaded.secrets, 'correction'),
    ).toMatchObject({
      route: { revision: 2 },
      key: replacement,
    });
  });

  it('KEY-07/08: disable blocks routes without touching the key; enable restores', async () => {
    const { area } = await seeded({ default: gemini });
    let loaded = await loadProviders(area);
    await mutateProviders(
      area,
      setProfileEnabled(loaded.store.profiles[0]!, false),
    );
    loaded = await loadProviders(area);
    expect(
      resolveRoute(loaded.store, loaded.secrets, 'correction'),
    ).toMatchObject({
      code: 'PROFILE_DISABLED',
    });
    expect(loaded.secrets.secrets[GEMINI_ID]!.key).toBe(FAKE_KEY);
    await mutateProviders(
      area,
      setProfileEnabled(loaded.store.profiles[0]!, true),
    );
    loaded = await loadProviders(area);
    expect(
      resolveRoute(loaded.store, loaded.secrets, 'correction'),
    ).toMatchObject({ ok: true });
  });

  it('KEY-10/11/12: delete removes exactly that key; its routes block, others stay', async () => {
    const { area } = await seeded({ default: gemini, correction: openai });
    let loaded = await loadProviders(area);
    expect(slotsUsing(loaded.store, OPENAI_ID)).toEqual(['correction']);
    await mutateProviders(area, deleteProfile(loaded.store.profiles[1]!));
    loaded = await loadProviders(area);
    expect(loaded.store.profiles.map((p) => p.id)).toEqual([GEMINI_ID]);
    expect(Object.keys(loaded.secrets.secrets)).toEqual([GEMINI_ID]);
    expect(area.dump()).not.toContain(OPENAI_KEY);
    expect(
      resolveRoute(loaded.store, loaded.secrets, 'correction'),
    ).toMatchObject({
      code: 'ROUTE_BROKEN',
    });
    expect(resolveRoute(loaded.store, loaded.secrets, 'rewrite')).toMatchObject(
      {
        ok: true,
        route: { provider: 'gemini' },
      },
    );
  });

  it('routes can only name an enabled key and a model of its provider', async () => {
    const { area } = await seeded({}, [
      profile(GEMINI_ID, 'gemini'),
      profile(OPENAI_ID, 'openai', { enabled: false }),
    ]);
    await expect(
      mutateProviders(area, setRoute('correction', openai)),
    ).rejects.toThrow(/désactivée/);
    await expect(
      mutateProviders(
        area,
        setRoute('correction', {
          credentialId: GEMINI_ID,
          modelId: 'gpt-5-nano',
        }),
      ),
    ).rejects.toThrow(/autre fournisseur/);
    await expect(
      mutateProviders(
        area,
        setRoute('correction', {
          credentialId: GEMINI_ID,
          modelId: 'Bad Model',
        }),
      ),
    ).rejects.toThrow(/identifiant de modèle/);
    await mutateProviders(area, setRoute('correction', gemini));
    await mutateProviders(area, setRoute('correction', null));
    expect((await loadProviders(area)).store.routes.correction).toBeNull();
  });

  it('KEY-16: two windows adding different keys at the same time both survive', async () => {
    const area = new FakeStorage();
    await Promise.all([
      mutateProviders(
        area,
        addProfile({ provider: 'gemini', label: 'Window A', key: FAKE_KEY }),
      ),
      mutateProviders(
        area,
        addProfile({ provider: 'openai', label: 'Window B', key: OPENAI_KEY }),
      ),
    ]);
    const { store, secrets } = await loadProviders(area);
    expect(store.profiles.map((p) => p.label).sort()).toEqual([
      'Window A',
      'Window B',
    ]);
    expect(Object.keys(secrets.secrets)).toHaveLength(2);
  });

  it('KEY-17: editing a profile changed in another window is refused', async () => {
    const { area } = await seeded({});
    const shown = (await loadProviders(area)).store.profiles[0]!;
    await mutateProviders(area, renameProfile(shown, 'Renamed elsewhere'));
    await expect(
      mutateProviders(area, setProfileEnabled(shown, false)),
    ).rejects.toThrow(/autre fenêtre/);
    await expect(mutateProviders(area, deleteProfile(shown))).rejects.toThrow(
      /autre fenêtre/,
    );
    expect((await loadProviders(area)).store.profiles[0]!.enabled).toBe(true);
  });

  it('KEY-15: a failed write keeps the previous data', async () => {
    const { area } = await seeded({ default: gemini });
    const before = area.dump();
    area.failSet = true;
    await expect(
      mutateProviders(
        area,
        addProfile({ provider: 'openai', label: 'New', key: OPENAI_KEY }),
      ),
    ).rejects.toThrow();
    expect(area.dump()).toBe(before);
  });

  it('KEY-18: invalid profile entries are ignored; valid ones and their routes survive', async () => {
    const area = new FakeStorage();
    seedProviders(area, [profile(GEMINI_ID, 'gemini')], { default: gemini });
    const raw = area.data.get(PROVIDERS_KEY) as ProviderStore;
    area.data.set(PROVIDERS_KEY, {
      ...raw,
      profiles: [...raw.profiles, { id: 'x', provider: 'evil' }, 'junk'],
    });
    const loaded = await loadProviders(area);
    expect(loaded.dropped).toBe(2);
    expect(loaded.damaged).toBe(false);
    expect(
      resolveRoute(loaded.store, loaded.secrets, 'correction'),
    ).toMatchObject({ ok: true });
  });

  it('a store that is not a V5.7 store is never overwritten', async () => {
    const area = new FakeStorage();
    area.data.set(PROVIDERS_KEY, 'corrupted');
    const loaded = await loadProviders(area);
    expect(loaded.damaged).toBe(true);
    await expect(
      mutateProviders(
        area,
        addProfile({ provider: 'gemini', label: 'A', key: FAKE_KEY }),
      ),
    ).rejects.toThrow(/endommagés/);
    expect(area.data.get(PROVIDERS_KEY)).toBe('corrupted');
  });

  it('empty storage gives an empty, usable store', async () => {
    const loaded = await loadProviders(new FakeStorage());
    expect(loaded).toMatchObject({
      store: emptyProviders(),
      damaged: false,
      dropped: 0,
    });
  });
});

describe('MIG: V5.1 single Gemini key → profiles', () => {
  const legacy = (apiKey: string | null, modelId = 'gemini-3.5-flash-lite') =>
    normalizeSettings({
      gemini: { apiKey, modelId, keyRevision: 3 },
      safety: { dailyTestAttemptLimit: 7 },
      correction: { consent: true },
      rewrite: { defaultStyles: ['formal', 'friendly'] },
    });

  it('MIG-01/MIG-11: no V5.1 key → nothing invented, nothing written', async () => {
    const area = new FakeStorage();
    await migrateLegacyKey(area);
    await saveSettings(area, legacy(null));
    const writes = area.sets;
    await migrateLegacyKey(area);
    expect(area.sets).toBe(writes);
    expect(area.data.has(PROVIDERS_KEY)).toBe(false);
  });

  it('MIG-02/MIG-08: one profile with the same key and model; the old copy is cleared', async () => {
    const area = new FakeStorage();
    await saveSettings(area, legacy(FAKE_KEY));
    await migrateLegacyKey(area, new Date('2026-10-15T10:00:00Z'));
    const { store, secrets } = await loadProviders(area);
    expect(store.profiles).toEqual([
      expect.objectContaining({
        provider: 'gemini',
        label: MIGRATED_LABEL,
        enabled: true,
        revision: 1,
      }),
    ]);
    expect(store.routes.default).toEqual({
      credentialId: store.profiles[0]!.id,
      modelId: 'gemini-3.5-flash-lite',
    });
    expect(secrets.secrets[store.profiles[0]!.id]!.key).toBe(FAKE_KEY);
    const settings = await loadSettings(area);
    expect(settings.gemini.apiKey).toBeNull();
    expect(area.dump().match(new RegExp(FAKE_KEY, 'g'))).toHaveLength(1);
  });

  it('MIG-03/MIG-04/MIG-05: other settings, counters and 500 shortcuts are untouched', async () => {
    const area = new FakeStorage();
    await saveSettings(area, legacy(FAKE_KEY));
    await saveUsage(area, {
      schemaVersion: 1,
      localDate: '2026-10-15',
      testAttempts: 4,
      completed: 3,
      failed: 1,
      unknown: 0,
      inputTokensObserved: 10,
      outputTokensObserved: 5,
      routes: {},
      pending: {},
    });
    const shortcuts = {
      schemaVersion: 2,
      revision: 9,
      enabled: true,
      shortcuts: Array.from({ length: 500 }, (_, i) => ({
        id: `s${i}`,
        trigger: `t${i}`,
        replacement: `Replacement ${i}`,
        enabled: true,
        protectTriggerInAi: true,
        protectReplacementInAi: false,
      })),
    };
    area.data.set(SHORTCUTS_KEY, structuredClone(shortcuts));
    const usageBefore = JSON.stringify(area.data.get(STORAGE_KEYS.usage));
    await migrateLegacyKey(area);
    const settings = await loadSettings(area);
    expect(settings).toMatchObject({
      safety: { dailyTestAttemptLimit: 7 },
      correction: { consent: true },
      rewrite: { defaultStyles: ['formal', 'friendly'] },
      gemini: { modelId: 'gemini-3.5-flash-lite' },
    });
    expect(JSON.stringify(area.data.get(STORAGE_KEYS.usage))).toBe(usageBefore);
    expect(area.data.get(SHORTCUTS_KEY)).toEqual(shortcuts);
    expect((await loadShortcuts(area)).store.shortcuts).toHaveLength(500);
  });

  it('MIG-06/MIG-07/MIG-10: an interrupted or repeated migration never duplicates', async () => {
    const area = new FakeStorage();
    await saveSettings(area, legacy(FAKE_KEY));
    // Interrupted after the profile write, before the old field was cleared.
    const original = area.set.bind(area);
    let calls = 0;
    area.set = async (items) => {
      if (STORAGE_KEYS.settings in items && calls++ === 0)
        throw new Error('worker stopped');
      return original(items);
    };
    await expect(migrateLegacyKey(area)).rejects.toThrow();
    await migrateLegacyKey(area);
    await migrateLegacyKey(area);
    const { store } = await loadProviders(area);
    expect(store.profiles).toHaveLength(1);
    expect((await loadSettings(area)).gemini.apiKey).toBeNull();
  });

  it('an existing default route is kept; a second migrated label is disambiguated', async () => {
    const area = new FakeStorage();
    seedProviders(
      area,
      [profile(OPENAI_ID, 'openai', { label: MIGRATED_LABEL })],
      {
        default: openai,
      },
    );
    await saveSettings(area, legacy(FAKE_KEY));
    await migrateLegacyKey(area);
    const { store } = await loadProviders(area);
    expect(store.routes.default).toEqual(openai);
    expect(store.profiles.map((p) => p.label)).toEqual([
      MIGRATED_LABEL,
      `${MIGRATED_LABEL} 2`,
    ]);
  });

  it('MIG-12: a model outside the V5.1 allowlist keeps the V5.1 default (never upgraded)', async () => {
    const area = new FakeStorage();
    area.data.set(STORAGE_KEYS.settings, {
      gemini: { apiKey: FAKE_KEY, modelId: 'gemini-9-ultra' },
    });
    await migrateLegacyKey(area);
    const { store } = await loadProviders(area);
    expect(store.routes.default?.modelId).toBe('gemini-3.1-flash-lite');
  });

  it('MIG-14: a corrupt V5.1 key field creates nothing', async () => {
    const area = new FakeStorage();
    area.data.set(STORAGE_KEYS.settings, {
      gemini: { apiKey: { nested: FAKE_KEY } },
    });
    await migrateLegacyKey(area);
    expect(area.data.has(PROVIDERS_KEY)).toBe(false);
  });
});
