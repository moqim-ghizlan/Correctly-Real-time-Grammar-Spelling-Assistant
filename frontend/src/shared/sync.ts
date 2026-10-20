// 5.14 optional sync between computers through chrome.storage.sync (the
// browser's Google account; Correctly has no server). storage.local stays
// the source of truth: the worker mirrors chosen domains to storage.sync and
// merges what other computers wrote back into storage.local. This file holds
// the pure parts (format, chunking, hashes, merge, encryption) and the
// message shapes; the orchestration is background/sync.ts.
import { KEYBINDINGS_KEY, normalizeKeybindings } from './keybindings';
import {
  PROVIDERS_KEY,
  SECRETS_KEY,
  loadProviders,
  type ProviderStore,
  type SecretStore,
} from './providers';
import {
  defaultSettings,
  normalizeSettings,
  type V51Settings,
} from './settings';
import {
  MAX_SHORTCUTS,
  SHORTCUTS_KEY,
  canonical,
  validateList,
  type ShortcutRecord,
} from './shortcuts';
import { STORAGE_KEYS } from './storage';

export const SYNC_DOMAINS = [
  'shortcuts',
  'settings',
  'keybindings',
  'keys',
] as const;
export type SyncDomain = (typeof SYNC_DOMAINS)[number];
export const isSyncDomain = (value: unknown): value is SyncDomain =>
  (SYNC_DOMAINS as readonly unknown[]).includes(value);

/** storage.local keys each domain mirrors (the worker reacts to these). */
export const DOMAIN_LOCAL_KEYS: Record<SyncDomain, readonly string[]> = {
  shortcuts: [SHORTCUTS_KEY],
  settings: [STORAGE_KEYS.settings],
  keybindings: [KEYBINDINGS_KEY],
  keys: [PROVIDERS_KEY, SECRETS_KEY],
};

// ---- storage keys -----------------------------------------------------------

/** Every key Correctly writes in storage.sync starts with this. */
export const SYNC_PREFIX = 'correctly.v5.sync.';
export const SYNC_META_KEY = 'correctly.v5.sync.meta';
export const SYNC_SCHEMA = 1;
export const headKey = (domain: SyncDomain) => `${SYNC_PREFIX}${domain}.head`;
export const chunkKey = (domain: SyncDomain, rev: string, index: number) =>
  `${SYNC_PREFIX}${domain}.${rev}.${index}`;
const CHUNK_KEY = /^correctly\.v5\.sync\.([a-z]+)\.([0-9a-f]{16})\.(\d{1,3})$/;
export function parseChunkKey(
  key: string,
): { domain: SyncDomain; rev: string; index: number } | null {
  const match = CHUNK_KEY.exec(key);
  return match && isSyncDomain(match[1])
    ? { domain: match[1], rev: match[2]!, index: Number(match[3]) }
    : null;
}

/** storage.local, this computer's choices (written by the settings page only). */
export const SYNC_PREFS_KEY = 'correctly.v5.syncPrefs';
/** storage.local, status per domain (written by the worker only). */
export const SYNC_STATE_KEY = 'correctly.v5.syncState';
/** storage.local, last version agreed with storage.sync (worker only). */
export const SYNC_BASE_KEY = 'correctly.v5.syncBase';
/** storage.local, versions replaced by a merge, restorable (worker only). */
export const SYNC_BACKUP_KEY = 'correctly.v5.syncBackup';
/** storage.local, key derived from the passphrase (worker only). */
export const SYNC_SECRET_KEY = 'correctly.v5.syncSecret';

// ---- Chrome limits ----------------------------------------------------------

export const SYNC_QUOTA_BYTES = 102_400;
/** Correctly stops before Chrome's total quota, and says so. */
export const SYNC_BUDGET_BYTES = 95_000;
export const SYNC_ITEM_BYTES = 8_192;
/** Data per chunk, well under the per-item limit with key and envelope. */
export const CHUNK_DATA_BYTES = 7_000;
export const MAX_CHUNKS = 64;

/** Stable codes; the settings page words them in its language. */
export type SyncErrorCode =
  | 'tooLarge'
  | 'quota'
  | 'rate'
  | 'storage'
  | 'remoteDamaged'
  | 'unknownSchema'
  | 'localDamaged'
  | 'badPassphrase'
  | 'weakPassphrase'
  | 'noPassphrase'
  | 'noBackup'
  | 'nothingToResolve';

export class SyncError extends Error {
  constructor(readonly code: SyncErrorCode) {
    super(code);
    this.name = 'SyncError';
  }
}

// ---- prefs / state / base / backup (untrusted reads) ------------------------

export interface SyncPrefs {
  schemaVersion: 1;
  enabled: boolean;
  domains: Record<SyncDomain, boolean>;
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const count = (value: unknown): number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : 0;
const HEX = (length: number) => new RegExp(`^[0-9a-f]{${length}}$`);
const HASH = HEX(64);
const REV = HEX(16);
const DEVICE = /^[A-Za-z0-9-]{8,64}$/;

/** Off by default; each domain is opted in separately. */
export function normalizeSyncPrefs(value: unknown): SyncPrefs {
  const data = record(value);
  const domains = record(data.domains);
  return {
    schemaVersion: 1,
    enabled: data.enabled === true,
    domains: Object.fromEntries(
      SYNC_DOMAINS.map((d) => [d, domains[d] === true]),
    ) as Record<SyncDomain, boolean>,
  };
}

export type DomainStatus =
  | 'off'
  | 'synced'
  | 'pending'
  | 'choose'
  | 'locked'
  | 'needsPassphrase'
  | 'error';
const STATUSES: readonly DomainStatus[] = [
  'off',
  'synced',
  'pending',
  'choose',
  'locked',
  'needsPassphrase',
  'error',
];
const ERROR_CODES: readonly SyncErrorCode[] = [
  'tooLarge',
  'quota',
  'rate',
  'storage',
  'remoteDamaged',
  'unknownSchema',
  'localDamaged',
  'badPassphrase',
  'weakPassphrase',
  'noPassphrase',
  'noBackup',
  'nothingToResolve',
];
const isErrorCode = (value: unknown): value is SyncErrorCode =>
  (ERROR_CODES as readonly unknown[]).includes(value);

export interface DomainState {
  status: DomainStatus;
  /** Last time this domain matched storage.sync (ms), 0 = never. */
  syncedAt: number;
  code: SyncErrorCode | null;
  /** A merge replaced this computer's version (restorable). */
  replaced: boolean;
}

export interface SyncState {
  schemaVersion: 1;
  deviceId: string;
  domains: Record<SyncDomain, DomainState>;
  /** storage.sync bytes in use after the last operation. */
  bytesInUse: number;
}

const emptyDomainState = (): DomainState => ({
  status: 'off',
  syncedAt: 0,
  code: null,
  replaced: false,
});

export function normalizeSyncState(value: unknown): SyncState {
  const data = record(value);
  const domains = record(data.domains);
  return {
    schemaVersion: 1,
    deviceId:
      typeof data.deviceId === 'string' && DEVICE.test(data.deviceId)
        ? data.deviceId
        : '',
    domains: Object.fromEntries(
      SYNC_DOMAINS.map((d) => {
        const item = record(domains[d]);
        return [
          d,
          {
            status: STATUSES.includes(item.status as DomainStatus)
              ? (item.status as DomainStatus)
              : 'off',
            syncedAt: count(item.syncedAt),
            code: isErrorCode(item.code) ? item.code : null,
            replaced: item.replaced === true,
          },
        ];
      }),
    ) as Record<SyncDomain, DomainState>,
    bytesInUse: count(data.bytesInUse),
  };
}

export const emptySyncState = (): SyncState => ({
  ...normalizeSyncState(undefined),
  domains: Object.fromEntries(
    SYNC_DOMAINS.map((d) => [d, emptyDomainState()]),
  ) as Record<SyncDomain, DomainState>,
});

/** What both sides last agreed on, per domain. */
export interface BaseEntry {
  rev: string;
  /** The agreed head's own history (the next push builds on it). */
  history: string[];
  /** The agreed head's time (to order parallel versions). */
  updatedAt: number;
  /** SHA-256 of the transmitted text (ciphertext for keys). */
  wireHash: string;
  /** SHA-256 of the canonical payload. */
  contentHash: string;
  /** The payload itself, for the per-shortcut three-way merge only. */
  payload: unknown;
}
export type SyncBase = Partial<Record<SyncDomain, BaseEntry>>;

export function normalizeSyncBase(value: unknown): SyncBase {
  const data = record(value);
  const base: SyncBase = {};
  for (const d of SYNC_DOMAINS) {
    const item = record(data[d]);
    if (
      typeof item.rev === 'string' &&
      REV.test(item.rev) &&
      typeof item.wireHash === 'string' &&
      HASH.test(item.wireHash) &&
      typeof item.contentHash === 'string' &&
      HASH.test(item.contentHash)
    )
      base[d] = {
        rev: item.rev,
        history: Array.isArray(item.history)
          ? item.history
              .filter(
                (rev): rev is string =>
                  typeof rev === 'string' && REV.test(rev),
              )
              .slice(0, MAX_HISTORY)
          : [],
        updatedAt: count(item.updatedAt),
        wireHash: item.wireHash,
        contentHash: item.contentHash,
        payload: d === 'shortcuts' ? (item.payload ?? null) : null,
      };
  }
  return base;
}

export interface BackupEntry {
  savedAt: number;
  payload: unknown;
}
export type SyncBackup = Partial<Record<SyncDomain, BackupEntry>>;

export function normalizeSyncBackup(value: unknown): SyncBackup {
  const data = record(value);
  const backup: SyncBackup = {};
  for (const d of SYNC_DOMAINS) {
    const item = record(data[d]);
    if (count(item.savedAt) > 0 && item.payload !== undefined)
      backup[d] = { savedAt: count(item.savedAt), payload: item.payload };
  }
  return backup;
}

// ---- canonical JSON and hashes ----------------------------------------------

/** JSON with object keys sorted, so equal content always hashes the same. */
export function canonicalJson(value: unknown): string {
  const sort = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(sort);
    if (item && typeof item === 'object')
      return Object.fromEntries(
        Object.keys(item)
          .sort()
          .map((key) => [key, sort((item as Record<string, unknown>)[key])]),
      );
    return item;
  };
  return JSON.stringify(sort(value));
}

const encoder = new TextEncoder();
const hex = (bytes: ArrayBuffer | Uint8Array) =>
  [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

export async function sha256(text: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', encoder.encode(text)));
}

export const newRev = () => hex(crypto.getRandomValues(new Uint8Array(8)));

// ---- chunking ---------------------------------------------------------------

/** Bytes a code point costs inside a JSON string (escapes included). */
function jsonCost(code: number): number {
  if (code === 0x22 || code === 0x5c) return 2; // \" and \
  if (code < 0x20 || code === 0x2028 || code === 0x2029) return 6; // \u00XX
  if (code < 0x80) return 1;
  if (code < 0x800) return 2;
  return code < 0x10000 ? 3 : 4;
}

/**
 * Splits text into pieces whose JSON-escaped UTF-8 size stays under `limit`
 * bytes, never inside a character (surrogate pairs stay together).
 */
export function splitChunks(text: string, limit = CHUNK_DATA_BYTES): string[] {
  const chunks: string[] = [];
  let start = 0;
  let size = 0;
  for (let index = 0; index < text.length;) {
    const code = text.codePointAt(index)!;
    const cost = jsonCost(code);
    if (size + cost > limit && index > start) {
      chunks.push(text.slice(start, index));
      start = index;
      size = 0;
    }
    size += cost;
    index += code > 0xffff ? 2 : 1;
  }
  if (start < text.length || !chunks.length) chunks.push(text.slice(start));
  return chunks;
}

/** Size Chrome counts for one item: key + JSON value, in UTF-8 bytes. */
export const itemBytes = (key: string, value: unknown) =>
  encoder.encode(key).length + encoder.encode(JSON.stringify(value)).length;

/** Revisions a head remembers, to tell a successor from a parallel version. */
export const MAX_HISTORY = 20;

export interface SyncHead {
  schemaVersion: number;
  rev: string;
  /** Previous revisions this one was built on, most recent first. */
  history: string[];
  updatedAt: number;
  deviceId: string;
  chunks: number;
  hash: string;
}

/** The items one push writes: the head and every chunk, in a single set(). */
export async function buildItems(
  domain: SyncDomain,
  wire: string,
  meta: {
    rev: string;
    history: string[];
    updatedAt: number;
    deviceId: string;
  },
): Promise<{ head: SyncHead; items: Record<string, unknown> }> {
  const pieces = splitChunks(wire);
  const head: SyncHead = {
    schemaVersion: SYNC_SCHEMA,
    rev: meta.rev,
    history: meta.history.slice(0, MAX_HISTORY),
    updatedAt: meta.updatedAt,
    deviceId: meta.deviceId,
    chunks: pieces.length,
    hash: await sha256(wire),
  };
  const items: Record<string, unknown> = { [headKey(domain)]: head };
  pieces.forEach((data, index) => {
    items[chunkKey(domain, meta.rev, index)] = { rev: meta.rev, data };
  });
  return { head, items };
}

export function parseHead(value: unknown): SyncHead | null {
  const data = record(value);
  const history = Array.isArray(data.history)
    ? data.history
        .filter(
          (rev): rev is string => typeof rev === 'string' && REV.test(rev),
        )
        .slice(0, MAX_HISTORY)
    : [];
  return typeof data.schemaVersion === 'number' &&
    typeof data.rev === 'string' &&
    REV.test(data.rev) &&
    count(data.updatedAt) > 0 &&
    typeof data.deviceId === 'string' &&
    DEVICE.test(data.deviceId) &&
    count(data.chunks) >= 1 &&
    count(data.chunks) <= MAX_CHUNKS &&
    typeof data.hash === 'string' &&
    HASH.test(data.hash)
    ? {
        schemaVersion: data.schemaVersion,
        rev: data.rev,
        history,
        updatedAt: count(data.updatedAt),
        deviceId: data.deviceId,
        chunks: count(data.chunks),
        hash: data.hash,
      }
    : null;
}

export type RemoteRead =
  | { kind: 'missing' }
  /** Not all chunks of this revision arrived yet (or they disagree). */
  | { kind: 'incomplete'; head: SyncHead | null }
  | { kind: 'unknownSchema' }
  | { kind: 'ok'; head: SyncHead; wire: string };

/** Reassembles one domain from everything read from storage.sync. */
export async function readRemote(
  all: Record<string, unknown>,
  domain: SyncDomain,
): Promise<RemoteRead> {
  const raw = all[headKey(domain)];
  if (raw === undefined) return { kind: 'missing' };
  // A newer Correctly wrote a format this one cannot read: never touch it.
  const version = record(raw).schemaVersion;
  if (typeof version === 'number' && version > SYNC_SCHEMA)
    return { kind: 'unknownSchema' };
  const head = parseHead(raw);
  if (!head) return { kind: 'incomplete', head: null };
  let wire = '';
  for (let index = 0; index < head.chunks; index++) {
    const chunk = record(all[chunkKey(domain, head.rev, index)]);
    if (chunk.rev !== head.rev || typeof chunk.data !== 'string')
      return { kind: 'incomplete', head };
    wire += chunk.data;
  }
  if ((await sha256(wire)) !== head.hash) return { kind: 'incomplete', head };
  return { kind: 'ok', head, wire };
}

// ---- domain payloads --------------------------------------------------------

/** Settings that follow the user; the rest stays on this computer. */
export interface SyncedSettings {
  rewrite: V51Settings['rewrite'];
  translation: V51Settings['translation'];
  language: V51Settings['ui']['language'];
  keyboard: boolean;
  contextMenu: boolean;
}

/**
 * Never synced: the handle (all-sites access is granted computer by
 * computer), consent to send text (given on this computer), the legacy
 * daily limit and V5.1 fields.
 */
export function pickSettings(settings: V51Settings): SyncedSettings {
  return {
    rewrite: settings.rewrite,
    translation: settings.translation,
    language: settings.ui.language,
    keyboard: settings.triggers.keyboard,
    contextMenu: settings.triggers.contextMenu,
  };
}

export function mergeSettings(
  local: V51Settings,
  synced: SyncedSettings,
): V51Settings {
  return normalizeSettings({
    ...local,
    rewrite: synced.rewrite,
    translation: synced.translation,
    ui: { ...local.ui, language: synced.language },
    triggers: {
      ...local.triggers,
      keyboard: synced.keyboard,
      contextMenu: synced.contextMenu,
    },
  });
}

/** Untrusted synced settings → normalized, or null when not an object. */
export function parseSyncedSettings(value: unknown): SyncedSettings | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const data = record(value);
  return pickSettings(
    normalizeSettings({
      rewrite: data.rewrite,
      translation: data.translation,
      ui: { language: data.language },
      triggers: { keyboard: data.keyboard, contextMenu: data.contextMenu },
    }),
  );
}

export const isDefaultSettings = (synced: SyncedSettings) =>
  canonicalJson(synced) === canonicalJson(pickSettings(defaultSettings()));

/** Text shortcuts: the list only; "expansion on" needs site access here. */
export interface SyncedShortcuts {
  shortcuts: ShortcutRecord[];
}

export function parseSyncedShortcuts(value: unknown): SyncedShortcuts | null {
  try {
    return { shortcuts: validateList(record(value).shortcuts) };
  } catch {
    return null;
  }
}

/** Correctly's own keys: the bindings only; "on" needs site access here. */
export interface SyncedKeybindings {
  bindings: ReturnType<typeof normalizeKeybindings>['bindings'];
}

export function parseSyncedKeybindings(
  value: unknown,
): SyncedKeybindings | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return {
    bindings: normalizeKeybindings({ bindings: record(value).bindings })
      .bindings,
  };
}

/** API key profiles, routes and keys (always encrypted in storage.sync). */
export interface SyncedKeys {
  store: ProviderStore;
  secrets: SecretStore;
}

/** Reuses the providers parser: invalid profiles or keys are dropped. */
export async function parseSyncedKeys(
  value: unknown,
): Promise<SyncedKeys | null> {
  const data = record(value);
  if (data.store === undefined) return null;
  const loaded = await loadProviders({
    get: () =>
      Promise.resolve({
        [PROVIDERS_KEY]: data.store,
        [SECRETS_KEY]: data.secrets,
      }),
    set: () => Promise.resolve(),
  });
  if (loaded.damaged) return null;
  // Keys of profiles that are not in the list are never kept.
  const ids = new Set(loaded.store.profiles.map((p) => p.id));
  return {
    // The revision is local bookkeeping (each computer counts its own).
    store: { ...loaded.store, revision: 0 },
    secrets: {
      schemaVersion: 1,
      secrets: Object.fromEntries(
        Object.entries(loaded.secrets.secrets).filter(([id]) => ids.has(id)),
      ),
    },
  };
}

// ---- per-shortcut three-way merge (decision D3) -----------------------------

export interface MergeResult {
  shortcuts: ShortcutRecord[];
  /** Some local change lost against the other computer's change. */
  localLost: boolean;
  /** Some remote change lost against this computer's change. */
  remoteLost: boolean;
}

const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);

/**
 * Merges by shortcut ID against the last agreed list (`base`): a side that
 * did not touch an entry takes the other side's version (edit or deletion),
 * so deletions need no tombstones. When both sides changed the same entry
 * differently, `localWins` decides. A trigger added on both sides under
 * different IDs keeps the winner's entry. The result stays valid (≤ 500).
 */
export function mergeShortcuts(
  base: readonly ShortcutRecord[],
  local: readonly ShortcutRecord[],
  remote: readonly ShortcutRecord[],
  localWins: boolean,
): MergeResult {
  const byId = (list: readonly ShortcutRecord[]) =>
    new Map(list.map((s) => [s.id, s] as const));
  const B = byId(base),
    L = byId(local),
    R = byId(remote);
  let localLost = false,
    remoteLost = false;
  const pick = (id: string): ShortcutRecord | undefined => {
    const b = B.get(id),
      l = L.get(id),
      r = R.get(id);
    const localChanged = !same(b, l);
    const remoteChanged = !same(b, r);
    if (!localChanged) return r;
    if (!remoteChanged || same(l, r)) return l;
    if (localWins) {
      remoteLost = true;
      return l;
    }
    localLost = true;
    return r;
  };
  // Order: the winner's list first, then entries only the other side has.
  const [first, second] = localWins ? [local, remote] : [remote, local];
  const ids = [
    ...new Set([...first.map((s) => s.id), ...second.map((s) => s.id)]),
    ...[...B.keys()],
  ];
  const result: ShortcutRecord[] = [];
  const triggers = new Set<string>();
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const entry = pick(id);
    if (!entry) continue;
    const key = canonical(entry.trigger);
    if (triggers.has(key) || result.length >= MAX_SHORTCUTS) {
      // The same trigger added on both computers, or the list is full.
      if (L.has(id) && !R.has(id)) localLost = true;
      else remoteLost = true;
      continue;
    }
    triggers.add(key);
    result.push(entry);
  }
  return { shortcuts: result, localLost, remoteLost };
}

// ---- encryption of the keys domain (decision D2) ----------------------------

export const KDF_ITERATIONS = 600_000;
export const MIN_PASSPHRASE = 8;

export interface SyncSecret {
  schemaVersion: 1;
  /** base64 salt the key was derived with (tells which passphrase). */
  salt: string;
  iterations: number;
  /** base64 raw AES-256 key. */
  key: string;
}

const b64 = (bytes: ArrayBuffer | Uint8Array) => {
  let text = '';
  for (const byte of new Uint8Array(bytes)) text += String.fromCharCode(byte);
  return btoa(text);
};
const unb64 = (text: string): Uint8Array<ArrayBuffer> | null => {
  try {
    const raw = atob(text);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
};

export function normalizeSyncSecret(value: unknown): SyncSecret | null {
  const data = record(value);
  const salt = typeof data.salt === 'string' ? unb64(data.salt) : null;
  const key = typeof data.key === 'string' ? unb64(data.key) : null;
  const iterations = count(data.iterations);
  return salt?.length === 16 && key?.length === 32 && iterations >= 1
    ? {
        schemaVersion: 1,
        salt: data.salt as string,
        iterations,
        key: data.key as string,
      }
    : null;
}

/** PBKDF2-SHA-256 → AES-GCM 256 (WebCrypto, no dependency). */
export async function deriveSecret(
  passphrase: string,
  salt: string = b64(crypto.getRandomValues(new Uint8Array(16))),
  iterations = KDF_ITERATIONS,
): Promise<SyncSecret> {
  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase.normalize('NFC')),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: unb64(salt)!, iterations },
    material,
    256,
  );
  return { schemaVersion: 1, salt, iterations, key: b64(bits) };
}

const aesKey = (secret: SyncSecret) =>
  crypto.subtle.importKey('raw', unb64(secret.key)!, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);

export interface Envelope {
  v: 1;
  kdf: { name: 'PBKDF2-SHA-256'; iterations: number; salt: string };
  iv: string;
  ct: string;
}

/** A fresh random IV every time; the salt says which passphrase is needed. */
export async function encryptText(
  secret: SyncSecret,
  plain: string,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await aesKey(secret),
    encoder.encode(plain),
  );
  const envelope: Envelope = {
    v: 1,
    kdf: {
      name: 'PBKDF2-SHA-256',
      iterations: secret.iterations,
      salt: secret.salt,
    },
    iv: b64(iv),
    ct: b64(ct),
  };
  return JSON.stringify(envelope);
}

export function parseEnvelope(wire: string): Envelope | null {
  try {
    const data = record(JSON.parse(wire));
    const kdf = record(data.kdf);
    return data.v === 1 &&
      kdf.name === 'PBKDF2-SHA-256' &&
      count(kdf.iterations) >= 1 &&
      typeof kdf.salt === 'string' &&
      typeof data.iv === 'string' &&
      typeof data.ct === 'string'
      ? (data as unknown as Envelope)
      : null;
  } catch {
    return null;
  }
}

/** Null when this key cannot open it (other passphrase, or tampered). */
export async function decryptText(
  secret: SyncSecret,
  envelope: Envelope,
): Promise<string | null> {
  const iv = unb64(envelope.iv);
  const ct = unb64(envelope.ct);
  if (!iv || !ct || envelope.kdf.salt !== secret.salt) return null;
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      await aesKey(secret),
      ct,
    );
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

// ---- messages from the settings page to the worker --------------------------

export const SYNC_NOW = 'correctly.v5.syncNow';
export const SYNC_RESOLVE = 'correctly.v5.syncResolve';
export const SYNC_RESTORE = 'correctly.v5.syncRestore';
export const SYNC_CLEAR = 'correctly.v5.syncClear';
export const SYNC_PASSPHRASE = 'correctly.v5.syncPassphrase';

export type SyncRequest =
  | { type: typeof SYNC_NOW }
  | { type: typeof SYNC_CLEAR }
  | { type: typeof SYNC_RESOLVE; domain: SyncDomain; keep: 'local' | 'remote' }
  | { type: typeof SYNC_RESTORE; domain: SyncDomain }
  /**
   * `unlock`: open the keys another computer synced. `replace`: a new
   * passphrase that re-encrypts this computer's keys for every computer.
   */
  | {
      type: typeof SYNC_PASSPHRASE;
      passphrase: string;
      mode: 'unlock' | 'replace';
    };

export type SyncReply = { ok: true } | { ok: false; code: SyncErrorCode };

const exactKeys = (data: Record<string, unknown>, keys: string) =>
  Object.keys(data).sort().join() === keys;

/** Exact shapes only (no extra field). */
export function isSyncRequest(value: unknown): value is SyncRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  switch (data.type) {
    case SYNC_NOW:
    case SYNC_CLEAR:
      return exactKeys(data, 'type');
    case SYNC_RESOLVE:
      return (
        exactKeys(data, 'domain,keep,type') &&
        isSyncDomain(data.domain) &&
        (data.keep === 'local' || data.keep === 'remote')
      );
    case SYNC_RESTORE:
      return exactKeys(data, 'domain,type') && isSyncDomain(data.domain);
    case SYNC_PASSPHRASE:
      return (
        exactKeys(data, 'mode,passphrase,type') &&
        typeof data.passphrase === 'string' &&
        data.passphrase.length <= 1024 &&
        (data.mode === 'unlock' || data.mode === 'replace')
      );
    default:
      return false;
  }
}
