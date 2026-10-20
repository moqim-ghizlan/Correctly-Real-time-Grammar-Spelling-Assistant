// 5.14: the one sync engine, in the service worker. Reads storage.local
// (source of truth) and storage.sync, decides per domain, and writes either
// side. No network request of its own (the browser syncs storage.sync), no
// log. Every run is serialized; nothing is queued in memory, so a stopped
// worker loses nothing: the next run compares again.
import { loadKeybindings, saveKeybindings } from '../shared/keybindings';
import { PROVIDERS_KEY, SECRETS_KEY, loadProviders } from '../shared/providers';
import { SHORTCUTS_KEY, loadShortcuts } from '../shared/shortcuts';
import {
  loadSettings,
  saveSettings,
  type StorageArea,
} from '../shared/storage';
import {
  DOMAIN_LOCAL_KEYS,
  KDF_ITERATIONS,
  MIN_PASSPHRASE,
  SYNC_BACKUP_KEY,
  SYNC_BASE_KEY,
  SYNC_BUDGET_BYTES,
  SYNC_CLEAR,
  SYNC_DOMAINS,
  SYNC_ITEM_BYTES,
  SYNC_META_KEY,
  SYNC_NOW,
  SYNC_PASSPHRASE,
  SYNC_PREFIX,
  SYNC_PREFS_KEY,
  SYNC_RESOLVE,
  SYNC_RESTORE,
  SYNC_SCHEMA,
  SYNC_SECRET_KEY,
  SYNC_STATE_KEY,
  SyncError,
  buildItems,
  canonicalJson,
  decryptText,
  deriveSecret,
  encryptText,
  headKey,
  isDefaultSettings,
  itemBytes,
  mergeSettings,
  mergeShortcuts,
  newRev,
  normalizeSyncBackup,
  normalizeSyncBase,
  normalizeSyncPrefs,
  normalizeSyncSecret,
  normalizeSyncState,
  parseChunkKey,
  parseEnvelope,
  parseSyncedKeybindings,
  parseSyncedKeys,
  parseSyncedSettings,
  parseSyncedShortcuts,
  pickSettings,
  readRemote,
  sha256,
  type BaseEntry,
  type DomainState,
  type SyncBackup,
  type SyncBase,
  type SyncDomain,
  type SyncErrorCode,
  type SyncHead,
  type SyncPrefs,
  type SyncReply,
  type SyncRequest,
  type SyncSecret,
  type SyncState,
} from '../shared/sync';

/** The part of chrome.storage.sync the engine uses (injectable for tests). */
export interface SyncArea {
  get(keys: string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string[]): Promise<void>;
  getBytesInUse(keys: string[] | null): Promise<number>;
}

export interface SyncEngineDeps {
  local: StorageArea;
  sync: SyncArea;
  now?: () => number;
  /** PBKDF2 iterations for a new passphrase (lowered in tests only). */
  iterations?: number;
}

interface Local {
  payload: unknown;
  contentHash: string;
  empty: boolean;
}

type Remote =
  | { kind: 'missing' }
  | { kind: 'incomplete' }
  | { kind: 'unknownSchema' }
  | { kind: 'damaged' }
  | { kind: 'locked' }
  | {
      kind: 'ok';
      head: SyncHead;
      payload: unknown;
      contentHash: string;
      empty: boolean;
    };

const hashOf = (payload: unknown) => sha256(canonicalJson(payload));

/** Chrome's quota errors are plain messages naming the limit. */
function syncErrorCode(error: unknown): SyncErrorCode {
  if (error instanceof SyncError) return error.code;
  const text = error instanceof Error ? error.message : String(error);
  if (/MAX_WRITE_OPERATIONS/i.test(text)) return 'rate';
  if (/QUOTA_BYTES|MAX_ITEMS/i.test(text)) return 'quota';
  return 'storage';
}

/** Same lock names as the settings page's write paths (Web Locks). */
function withLock<T>(name: string, task: () => Promise<T>): Promise<T> {
  const locks = (globalThis.navigator as Navigator | undefined)?.locks;
  return locks ? (locks.request(name, task) as Promise<T>) : task();
}

export class SyncEngine {
  private queue: Promise<unknown> = Promise.resolve();
  private readonly now: () => number;

  constructor(private readonly deps: SyncEngineDeps) {
    this.now = deps.now ?? Date.now;
  }

  /** One run at a time; a failed run never blocks the next. */
  private serial<T>(task: () => Promise<T>): Promise<T> {
    const next = this.queue.then(task, task);
    this.queue = next.catch(() => undefined);
    return next;
  }

  /** Resolves once every queued run has finished. */
  async idle(): Promise<void> {
    let current: Promise<unknown>;
    do {
      current = this.queue;
      await current;
    } while (current !== this.queue);
  }

  // ---- triggers -------------------------------------------------------------

  /** storage.local changed: our domains or this computer's choices. */
  onLocalChanged(keys: string[]): Promise<void> | null {
    if (keys.includes(SYNC_PREFS_KEY)) return this.reconcile();
    const changed = SYNC_DOMAINS.filter((d) =>
      DOMAIN_LOCAL_KEYS[d].some((key) => keys.includes(key)),
    );
    return changed.length ? this.reconcile(changed) : null;
  }

  /** storage.sync changed (another computer, or our own push). */
  onSyncChanged(keys: string[]): Promise<void> | null {
    return keys.some((key) => key.startsWith(SYNC_PREFIX))
      ? this.reconcile()
      : null;
  }

  /** `edited`: domains changed on this computer just now (they win ties). */
  reconcile(edited: SyncDomain[] = []): Promise<void> {
    return this.serial(() => this.run(edited));
  }

  async handle(request: SyncRequest): Promise<SyncReply> {
    try {
      switch (request.type) {
        case SYNC_NOW:
          await this.reconcile();
          return { ok: true };
        case SYNC_CLEAR:
          await this.serial(() => this.clear());
          return { ok: true };
        case SYNC_RESOLVE:
          await this.serial(() => this.resolve(request.domain, request.keep));
          return { ok: true };
        case SYNC_RESTORE:
          await this.serial(() => this.restore(request.domain));
          return { ok: true };
        case SYNC_PASSPHRASE:
          await this.serial(() =>
            this.passphrase(request.passphrase, request.mode),
          );
          return { ok: true };
      }
    } catch (error) {
      return { ok: false, code: syncErrorCode(error) };
    }
  }

  // ---- local reads/writes ---------------------------------------------------

  private async readLocal<T>(key: string, normalize: (v: unknown) => T) {
    return normalize((await this.deps.local.get([key]))[key]);
  }

  private prefs(): Promise<SyncPrefs> {
    return this.readLocal(SYNC_PREFS_KEY, normalizeSyncPrefs);
  }

  private secret(): Promise<SyncSecret | null> {
    return this.readLocal(SYNC_SECRET_KEY, normalizeSyncSecret);
  }

  private async localPayload(domain: SyncDomain): Promise<Local | null> {
    let payload: unknown;
    let empty: boolean;
    const area = this.deps.local;
    if (domain === 'shortcuts') {
      const loaded = await loadShortcuts(area);
      if (loaded.damaged) return null;
      payload = parseSyncedShortcuts({ shortcuts: loaded.store.shortcuts });
      empty = !loaded.store.shortcuts.length;
    } else if (domain === 'settings') {
      const synced = pickSettings(await loadSettings(area));
      payload = parseSyncedSettings(synced);
      empty = isDefaultSettings(synced);
    } else if (domain === 'keybindings') {
      const keys = await loadKeybindings(area);
      payload = parseSyncedKeybindings({ bindings: keys.bindings });
      empty = !Object.keys(keys.bindings).length;
    } else {
      const loaded = await loadProviders(area);
      if (loaded.damaged) return null;
      payload = await parseSyncedKeys(loaded);
      empty = !loaded.store.profiles.length;
    }
    if (!payload) return null;
    return { payload, contentHash: await hashOf(payload), empty };
  }

  /** Writes a synced payload into storage.local, keeping local-only fields. */
  private async applyLocal(domain: SyncDomain, payload: unknown) {
    const area = this.deps.local;
    if (domain === 'shortcuts') {
      const { shortcuts } = payload as { shortcuts: unknown[] };
      await withLock(SHORTCUTS_KEY, async () => {
        const latest = await loadShortcuts(area);
        if (latest.damaged) throw new SyncError('localDamaged');
        await area.set({
          [SHORTCUTS_KEY]: {
            schemaVersion: 2,
            revision: latest.store.revision + 1,
            enabled: latest.store.enabled,
            shortcuts,
          },
        });
      });
    } else if (domain === 'settings') {
      const synced = parseSyncedSettings(payload);
      if (!synced) throw new SyncError('remoteDamaged');
      await saveSettings(area, mergeSettings(await loadSettings(area), synced));
    } else if (domain === 'keybindings') {
      const local = await loadKeybindings(area);
      await saveKeybindings(area, {
        ...local,
        bindings: (payload as { bindings: typeof local.bindings }).bindings,
      });
    } else {
      const keys = await parseSyncedKeys(payload);
      if (!keys) throw new SyncError('remoteDamaged');
      await withLock(PROVIDERS_KEY, async () => {
        const latest = await loadProviders(area);
        if (latest.damaged) throw new SyncError('localDamaged');
        await area.set({
          [PROVIDERS_KEY]: {
            ...keys.store,
            revision: latest.store.revision + 1,
          },
          [SECRETS_KEY]: keys.secrets,
        });
      });
    }
  }

  // ---- remote reads/writes --------------------------------------------------

  private async remote(
    all: Record<string, unknown>,
    domain: SyncDomain,
    secret: SyncSecret | null,
  ): Promise<Remote> {
    const read = await readRemote(all, domain);
    if (read.kind !== 'ok') return { kind: read.kind };
    let text: string | null = read.wire;
    if (domain === 'keys') {
      const envelope = parseEnvelope(read.wire);
      if (!envelope) return { kind: 'damaged' };
      text = secret ? await decryptText(secret, envelope) : null;
      if (text === null) return { kind: 'locked' };
    }
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return { kind: 'damaged' };
    }
    const payload =
      domain === 'shortcuts'
        ? parseSyncedShortcuts(data)
        : domain === 'settings'
          ? parseSyncedSettings(data)
          : domain === 'keybindings'
            ? parseSyncedKeybindings(data)
            : await parseSyncedKeys(data);
    if (!payload) return { kind: 'damaged' };
    const empty =
      domain === 'shortcuts'
        ? !(payload as { shortcuts: unknown[] }).shortcuts.length
        : domain === 'settings'
          ? isDefaultSettings(payload as ReturnType<typeof pickSettings>)
          : domain === 'keybindings'
            ? !Object.keys((payload as { bindings: object }).bindings).length
            : !(payload as { store: { profiles: unknown[] } }).store.profiles
                .length;
    return {
      kind: 'ok',
      head: read.head,
      payload,
      contentHash: await hashOf(payload),
      empty,
    };
  }

  /**
   * One push = one set() with the head and every chunk (one write operation
   * for Chrome), then the previous chunks are removed. Over the budget,
   * nothing is written: never a silent truncation.
   */
  private async push(
    ctx: RunContext,
    domain: SyncDomain,
    local: Local,
  ): Promise<void> {
    let wire = canonicalJson(local.payload);
    if (domain === 'keys') {
      if (!ctx.secret) throw new SyncError('noPassphrase');
      wire = await encryptText(ctx.secret, wire);
    }
    const rev = newRev();
    const base = ctx.base[domain];
    const history = base ? [base.rev, ...base.history] : [];
    const { head, items } = await buildItems(domain, wire, {
      rev,
      history,
      updatedAt: this.now(),
      deviceId: ctx.state.deviceId,
    });
    items[SYNC_META_KEY] = { schemaVersion: SYNC_SCHEMA };
    const mine = (key: string) =>
      key === headKey(domain) || parseChunkKey(key)?.domain === domain;
    let total = 0;
    for (const [key, value] of Object.entries(ctx.all))
      if (key.startsWith(SYNC_PREFIX) && !mine(key) && key !== SYNC_META_KEY)
        total += itemBytes(key, value);
    for (const [key, value] of Object.entries(items)) {
      const size = itemBytes(key, value);
      if (size > SYNC_ITEM_BYTES) throw new SyncError('tooLarge');
      total += size;
    }
    if (total > SYNC_BUDGET_BYTES) throw new SyncError('tooLarge');
    try {
      await this.deps.sync.set(items);
    } catch (error) {
      throw new SyncError(syncErrorCode(error));
    }
    const stale = Object.keys(ctx.all).filter((key) => {
      const chunk = parseChunkKey(key);
      return chunk?.domain === domain && chunk.rev !== rev;
    });
    if (stale.length) await this.deps.sync.remove(stale).catch(() => undefined);
    for (const [key, value] of Object.entries(items)) ctx.all[key] = value;
    for (const key of stale) delete ctx.all[key];
    ctx.base[domain] = {
      rev,
      history: head.history,
      updatedAt: head.updatedAt,
      wireHash: head.hash,
      contentHash: local.contentHash,
      payload: domain === 'shortcuts' ? local.payload : null,
    };
  }

  private agree(
    ctx: RunContext,
    domain: SyncDomain,
    head: SyncHead,
    contentHash: string,
    payload: unknown,
  ) {
    const entry: BaseEntry = {
      rev: head.rev,
      history: head.history,
      updatedAt: head.updatedAt,
      wireHash: head.hash,
      contentHash,
      payload: domain === 'shortcuts' ? payload : null,
    };
    ctx.base[domain] = entry;
  }

  private backupLocal(ctx: RunContext, domain: SyncDomain, local: Local) {
    ctx.backup[domain] = { savedAt: this.now(), payload: local.payload };
    ctx.replaced.add(domain);
  }

  // ---- one run ---------------------------------------------------------------

  private async context(): Promise<RunContext> {
    const prefs = await this.prefs();
    const data = await this.deps.local.get([
      SYNC_STATE_KEY,
      SYNC_BASE_KEY,
      SYNC_BACKUP_KEY,
    ]);
    const state = normalizeSyncState(data[SYNC_STATE_KEY]);
    const base = normalizeSyncBase(data[SYNC_BASE_KEY]);
    const backup = normalizeSyncBackup(data[SYNC_BACKUP_KEY]);
    if (!state.deviceId) state.deviceId = crypto.randomUUID();
    // Sync off: no storage.sync call at all.
    const ctx: RunContext = {
      prefs,
      state,
      base,
      backup,
      off: !prefs.enabled,
      all: {},
      secret: null,
      replaced: new Set(),
    };
    if (ctx.off) return ctx;
    let all: Record<string, unknown>;
    try {
      all = await this.deps.sync.get(null);
    } catch {
      throw new SyncError('storage');
    }
    ctx.all = all;
    ctx.secret = await this.secret();
    return ctx;
  }

  private async save(ctx: RunContext): Promise<void> {
    if (!ctx.off)
      ctx.state.bytesInUse = await this.deps.sync
        .getBytesInUse(null)
        .catch(() => ctx.state.bytesInUse);
    await this.deps.local.set({
      [SYNC_STATE_KEY]: ctx.state,
      [SYNC_BASE_KEY]: ctx.base,
      [SYNC_BACKUP_KEY]: ctx.backup,
    });
  }

  private async run(edited: SyncDomain[]): Promise<void> {
    const ctx = await this.context();
    const before = canonicalJson([ctx.state, ctx.base]);
    const metaVersion = (ctx.all[SYNC_META_KEY] as { schemaVersion?: unknown })
      ?.schemaVersion;
    for (const domain of SYNC_DOMAINS) {
      const previous = ctx.state.domains[domain];
      if (ctx.off || !ctx.prefs.domains[domain]) {
        // Turned off: the next activation starts over (§6.5).
        delete ctx.base[domain];
        ctx.state.domains[domain] = {
          ...previous,
          status: 'off',
          code: null,
        };
        continue;
      }
      let next: Omit<DomainState, 'replaced' | 'syncedAt'>;
      try {
        next =
          typeof metaVersion === 'number' && metaVersion > SYNC_SCHEMA
            ? { status: 'error', code: 'unknownSchema' }
            : await this.step(ctx, domain, edited.includes(domain));
      } catch (error) {
        next = { status: 'error', code: syncErrorCode(error) };
      }
      ctx.state.domains[domain] = {
        status: next.status,
        code: next.code,
        syncedAt: next.status === 'synced' ? this.now() : previous.syncedAt,
        replaced: ctx.replaced.has(domain) || previous.replaced,
      };
    }
    // Sync off and nothing new: no write at every worker start.
    if (ctx.off && canonicalJson([ctx.state, ctx.base]) === before) return;
    await this.save(ctx);
  }

  /** The decision for one domain (plan §6.3–6.5). */
  private async step(
    ctx: RunContext,
    domain: SyncDomain,
    editedHere: boolean,
  ): Promise<Omit<DomainState, 'replaced' | 'syncedAt'>> {
    const done = { status: 'synced', code: null } as const;
    const local = await this.localPayload(domain);
    if (!local) return { status: 'error', code: 'localDamaged' };
    if (domain === 'keys' && !ctx.secret) {
      const present = (await readRemote(ctx.all, 'keys')).kind !== 'missing';
      return { status: present ? 'locked' : 'needsPassphrase', code: null };
    }
    const remote = await this.remote(ctx.all, domain, ctx.secret);
    const base = ctx.base[domain];
    const localChanged = !base || local.contentHash !== base.contentHash;
    switch (remote.kind) {
      case 'unknownSchema':
        return { status: 'error', code: 'unknownSchema' };
      case 'damaged':
        // Never written over, never applied: shown until cleared.
        return { status: 'error', code: 'remoteDamaged' };
      case 'locked':
        return { status: 'locked', code: null };
      case 'incomplete':
        // Another computer is still writing; a newer local edit goes anyway.
        if (base && localChanged) {
          await this.push(ctx, domain, local);
          return done;
        }
        return { status: 'pending', code: null };
      case 'missing':
        // An empty computer has nothing to offer: it waits for the others
        // rather than sending an empty list that would read as deletions.
        if (!base && local.empty) return done;
        await this.push(ctx, domain, local);
        return done;
    }
    // Does the synced version build on what this computer last agreed on?
    // If not, it is a parallel version (another computer's first sync, or
    // one that missed ours) and nothing is read as a deletion.
    const ancestor =
      base &&
      (remote.head.rev === base.rev || remote.head.history.includes(base.rev))
        ? base
        : undefined;
    const remoteChanged = !ancestor || remote.head.hash !== ancestor.wireHash;
    if (local.contentHash === remote.contentHash) {
      this.agree(ctx, domain, remote.head, remote.contentHash, remote.payload);
      return done;
    }
    if (!remoteChanged) {
      await this.push(ctx, domain, local);
      return done;
    }
    if ((ancestor && !localChanged) || local.empty) {
      await this.applyLocal(domain, remote.payload);
      this.agree(ctx, domain, remote.head, remote.contentHash, remote.payload);
      return done;
    }
    if (!ancestor && remote.empty) {
      await this.push(ctx, domain, local);
      return done;
    }
    // Both sides changed since they last agreed. An edit made here just now
    // wins; otherwise the remote version, except for two parallel versions,
    // ordered the same way on every computer (time, then revision).
    const localWins =
      editedHere ||
      (!ancestor &&
        !localChanged &&
        !!base &&
        (base.updatedAt > remote.head.updatedAt ||
          (base.updatedAt === remote.head.updatedAt &&
            base.rev > remote.head.rev)));
    if (domain === 'shortcuts') {
      const baseList = parseSyncedShortcuts(ancestor?.payload)?.shortcuts ?? [];
      const merged = mergeShortcuts(
        baseList,
        (local.payload as { shortcuts: [] }).shortcuts,
        (remote.payload as { shortcuts: [] }).shortcuts,
        localWins,
      );
      if (merged.localLost) this.backupLocal(ctx, domain, local);
      const payload = { shortcuts: merged.shortcuts };
      const contentHash = await hashOf(payload);
      await this.applyLocal(domain, payload);
      if (contentHash === remote.contentHash)
        this.agree(ctx, domain, remote.head, contentHash, payload);
      else await this.push(ctx, domain, { payload, contentHash, empty: false });
      return done;
    }
    // First activation with two different versions: the user chooses.
    if (!base) return { status: 'choose', code: null };
    // The version replaced here is kept, restorable.
    if (localWins) {
      await this.push(ctx, domain, local);
      return done;
    }
    this.backupLocal(ctx, domain, local);
    await this.applyLocal(domain, remote.payload);
    this.agree(ctx, domain, remote.head, remote.contentHash, remote.payload);
    return done;
  }

  // ---- user requests --------------------------------------------------------

  private async withContext(task: (ctx: RunContext) => Promise<void>) {
    const ctx = await this.context();
    if (ctx.off) throw new SyncError('nothingToResolve');
    await task(ctx);
    await this.save(ctx);
    await this.run([]);
  }

  /** §6.5: "Keep this computer" or "Use the synced version". */
  private resolve(domain: SyncDomain, keep: 'local' | 'remote') {
    return this.withContext(async (ctx) => {
      const local = await this.localPayload(domain);
      if (!local) throw new SyncError('localDamaged');
      const remote = await this.remote(ctx.all, domain, ctx.secret);
      if (remote.kind !== 'ok') throw new SyncError('nothingToResolve');
      if (keep === 'local') {
        await this.push(ctx, domain, local);
        return;
      }
      this.backupLocal(ctx, domain, local);
      await this.applyLocal(domain, remote.payload);
      this.agree(ctx, domain, remote.head, remote.contentHash, remote.payload);
      ctx.state.domains[domain].replaced = true;
    });
  }

  /** Puts back the version a merge replaced; it is then sent as an edit. */
  private async restore(domain: SyncDomain) {
    const backup = await this.readLocal(SYNC_BACKUP_KEY, normalizeSyncBackup);
    const entry = backup[domain];
    if (!entry) throw new SyncError('noBackup');
    await this.applyLocal(domain, entry.payload);
    delete backup[domain];
    const state = await this.readLocal(SYNC_STATE_KEY, normalizeSyncState);
    state.domains[domain].replaced = false;
    await this.deps.local.set({
      [SYNC_BACKUP_KEY]: backup,
      [SYNC_STATE_KEY]: state,
    });
    await this.run([domain]);
  }

  /** Empties Correctly's data in storage.sync (this computer keeps its own). */
  private async clear() {
    const all = await this.deps.sync.get(null);
    const keys = Object.keys(all).filter((key) => key.startsWith(SYNC_PREFIX));
    try {
      if (keys.length) await this.deps.sync.remove(keys);
    } catch (error) {
      throw new SyncError(syncErrorCode(error));
    }
    const state = await this.readLocal(SYNC_STATE_KEY, normalizeSyncState);
    state.bytesInUse = await this.deps.sync.getBytesInUse(null).catch(() => 0);
    await this.deps.local.set({ [SYNC_BASE_KEY]: {}, [SYNC_STATE_KEY]: state });
  }

  private async passphrase(passphrase: string, mode: 'unlock' | 'replace') {
    if ([...passphrase].length < MIN_PASSPHRASE)
      throw new SyncError('weakPassphrase');
    const all = await this.deps.sync.get(null);
    const read = await readRemote(all, 'keys');
    if (mode === 'unlock' && read.kind === 'ok') {
      const envelope = parseEnvelope(read.wire);
      if (!envelope) throw new SyncError('remoteDamaged');
      const secret = await deriveSecret(
        passphrase,
        envelope.kdf.salt,
        envelope.kdf.iterations,
      );
      if ((await decryptText(secret, envelope)) === null)
        throw new SyncError('badPassphrase');
      await this.deps.local.set({ [SYNC_SECRET_KEY]: secret });
      await this.run([]);
      return;
    }
    // A new passphrase (new salt): this computer's keys are encrypted with it
    // and replace the synced ones; other computers must enter it once.
    const secret = await deriveSecret(
      passphrase,
      undefined,
      this.deps.iterations ?? KDF_ITERATIONS,
    );
    await this.deps.local.set({ [SYNC_SECRET_KEY]: secret });
    const ctx = await this.context();
    if (ctx.off || !ctx.prefs.domains.keys) return;
    const local = await this.localPayload('keys');
    if (!local) throw new SyncError('localDamaged');
    await this.push(ctx, 'keys', local);
    await this.save(ctx);
    await this.run([]);
  }
}

interface RunContext {
  prefs: SyncPrefs;
  state: SyncState;
  base: SyncBase;
  backup: SyncBackup;
  off: boolean;
  all: Record<string, unknown>;
  secret: SyncSecret | null;
  replaced: Set<SyncDomain>;
}
