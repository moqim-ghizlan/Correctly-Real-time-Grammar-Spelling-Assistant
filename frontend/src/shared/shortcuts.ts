// V5.6 personal text shortcuts: schema, validation, V4 migration, storage
// mutations, JSON backup and the pure expansion matcher. No network here.
import type { StorageArea } from './storage';

export const SHORTCUTS_KEY = 'correctly.v5.shortcuts';
/** V4 store (same extension ID/profile only). Read, never written or cleared. */
export const V4_SHORTCUTS_KEY = 'correctly.shortcuts.v1';
export const MAX_SHORTCUTS = 500;
export const MAX_REPLACEMENT = 2000;
export const BACKUP_FORMAT = 'correctly-personal-shortcuts';
// 500 × 2000 characters (≤ 3 bytes each in UTF-8) plus JSON overhead.
export const MAX_BACKUP_BYTES = 4 * 1024 * 1024;

export interface ShortcutRecord {
  id: string;
  trigger: string;
  replacement: string;
  enabled: boolean;
  protectTriggerInAi: boolean;
  protectReplacementInAi: boolean;
}

export interface ShortcutStore {
  schemaVersion: 2;
  revision: number;
  enabled: boolean;
  shortcuts: ShortcutRecord[];
}

export const emptyStore = (): ShortcutStore => ({
  schemaVersion: 2,
  revision: 0,
  enabled: false,
  shortcuts: [],
});

/** The one canonical form used for duplicates, lookup and import (V4 rule). */
export const canonical = (trigger: string): string =>
  trigger.normalize('NFC').toLowerCase();

// V4 rules: a trigger is one token of letters/marks/digits/_/- (1–32).
const TRIGGER = /^[\p{L}\p{M}\p{N}_-]{1,32}$/u;
const hasControl = (text: string) =>
  [...text].some((character) => {
    const code = character.charCodeAt(0);
    return (code < 32 && ![9, 10, 13].includes(code)) || code === 127;
  });

/** 5.13: stable codes; the settings page words them in its language. */
export type ShortcutErrorCode =
  | 'invalid'
  | 'triggerFormat'
  | 'replacementLength'
  | 'invalidList'
  | 'tooMany'
  | 'duplicate'
  | 'damaged'
  | 'saveUnverified'
  | 'full'
  | 'exists'
  | 'changedElsewhere'
  | 'fileTooLarge'
  | 'notJson'
  | 'notBackup'
  | 'importExceeds'
  | 'previewStale';

export class ShortcutError extends Error {
  constructor(
    readonly code: ShortcutErrorCode,
    readonly params: Record<string, string | number> = {},
  ) {
    super(code);
    this.name = 'ShortcutError';
  }
}

export interface ShortcutDraft {
  trigger: string;
  replacement: string;
  enabled: boolean;
  protectTriggerInAi: boolean;
  protectReplacementInAi: boolean;
}

/** Strict field picker: unknown keys are ignored, wrong types rejected. */
export function validateDraft(value: unknown): ShortcutDraft {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ShortcutError('invalid');
  const data = value as Record<string, unknown>;
  if (typeof data.trigger !== 'string' || typeof data.replacement !== 'string')
    throw new ShortcutError('invalid');
  const trigger = data.trigger.trim().normalize('NFC');
  if (!TRIGGER.test(trigger)) throw new ShortcutError('triggerFormat');
  const replacement = data.replacement;
  if (
    !replacement.length ||
    replacement.length > MAX_REPLACEMENT ||
    hasControl(replacement)
  )
    throw new ShortcutError('replacementLength', { max: MAX_REPLACEMENT });
  const flag = (key: string, fallback: boolean) => {
    const item = data[key];
    if (item === undefined) return fallback;
    if (typeof item !== 'boolean') throw new ShortcutError('invalid');
    return item;
  };
  return {
    trigger,
    replacement,
    enabled: flag('enabled', true),
    protectTriggerInAi: flag('protectTriggerInAi', true),
    protectReplacementInAi: flag('protectReplacementInAi', false),
  };
}

const newId = () => crypto.randomUUID();
const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Validates a whole list: shapes, 500 max, no duplicate trigger or ID. */
export function validateList(list: unknown, keepIds = true): ShortcutRecord[] {
  if (!Array.isArray(list)) throw new ShortcutError('invalidList');
  if (list.length > MAX_SHORTCUTS)
    throw new ShortcutError('tooMany', { max: MAX_SHORTCUTS });
  const triggers = new Set<string>();
  const ids = new Set<string>();
  return list.map((item: unknown) => {
    const draft = validateDraft(item);
    const key = canonical(draft.trigger);
    if (triggers.has(key))
      throw new ShortcutError('duplicate', { trigger: draft.trigger });
    triggers.add(key);
    const raw = (item as { id?: unknown }).id;
    let id = keepIds && typeof raw === 'string' && ID.test(raw) ? raw : newId();
    if (ids.has(id)) id = newId();
    ids.add(id);
    return { id, ...draft };
  });
}

/** Valid store, or null when the stored value is damaged (left untouched). */
export function parseStore(value: unknown): ShortcutStore | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  try {
    if (data.schemaVersion !== 2 || typeof data.enabled !== 'boolean')
      return null;
    return {
      schemaVersion: 2,
      revision:
        typeof data.revision === 'number' && Number.isSafeInteger(data.revision)
          ? data.revision
          : 0,
      enabled: data.enabled,
      shortcuts: validateList(data.shortcuts),
    };
  } catch {
    return null;
  }
}

/** V4 `{schemaVersion:1, enabled, shortcuts}` → V5 store (flags get defaults). */
export function migrateV4(value: unknown): ShortcutStore | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  try {
    if (data.schemaVersion !== 1 || typeof data.enabled !== 'boolean')
      return null;
    return {
      schemaVersion: 2,
      revision: 0,
      // Expansion now needs site access, granted when the user turns it on.
      enabled: false,
      shortcuts: validateList(data.shortcuts),
    };
  } catch {
    return null;
  }
}

export interface LoadedShortcuts {
  store: ShortcutStore;
  origin: 'v5' | 'v4' | 'empty';
  /** A stored value exists but is invalid: it is never overwritten silently. */
  damaged: boolean;
}

export async function loadShortcuts(
  area: StorageArea,
): Promise<LoadedShortcuts> {
  const data = await area.get([SHORTCUTS_KEY, V4_SHORTCUTS_KEY]);
  if (data[SHORTCUTS_KEY] !== undefined) {
    const store = parseStore(data[SHORTCUTS_KEY]);
    return store
      ? { store, origin: 'v5', damaged: false }
      : { store: emptyStore(), origin: 'v5', damaged: true };
  }
  if (data[V4_SHORTCUTS_KEY] !== undefined) {
    const store = migrateV4(data[V4_SHORTCUTS_KEY]);
    return store
      ? { store, origin: 'v4', damaged: false }
      : { store: emptyStore(), origin: 'v4', damaged: true };
  }
  return { store: emptyStore(), origin: 'empty', damaged: false };
}

/**
 * The single write path (settings page only). Settings tabs share one origin:
 * a Web Lock serializes read → change → write → read back across them, and
 * each change is applied to the LATEST store, so independent edits merge.
 * shortcut: chrome.storage has no compare-and-swap; the lock covers settings
 * pages only, which are the only writers.
 */
export async function mutateShortcuts(
  area: StorageArea,
  change: (store: ShortcutStore) => ShortcutStore,
): Promise<ShortcutStore> {
  const run = async () => {
    const latest = await loadShortcuts(area);
    if (latest.damaged) throw new ShortcutError('damaged');
    const changed = change(latest.store);
    const next: ShortcutStore = {
      schemaVersion: 2,
      revision: latest.store.revision + 1,
      enabled: changed.enabled,
      shortcuts: validateList(changed.shortcuts),
    };
    await area.set({ [SHORTCUTS_KEY]: next });
    const check = parseStore((await area.get([SHORTCUTS_KEY]))[SHORTCUTS_KEY]);
    if (!check || JSON.stringify(check) !== JSON.stringify(next))
      throw new ShortcutError('saveUnverified');
    return next;
  };
  const locks = (globalThis.navigator as Navigator | undefined)?.locks;
  if (locks) return locks.request(SHORTCUTS_KEY, run);
  // No Web Locks: at least serialize the writes made from this page.
  const next = localQueue.then(run, run);
  localQueue = next.catch(() => undefined);
  return next;
}
let localQueue: Promise<unknown> = Promise.resolve();

const sameRecord = (a: ShortcutRecord | undefined, b: ShortcutRecord) =>
  !!a && JSON.stringify(a) === JSON.stringify(b);

export const addShortcut = (draft: unknown) => (store: ShortcutStore) => {
  const entry = validateDraft(draft);
  if (store.shortcuts.length >= MAX_SHORTCUTS)
    throw new ShortcutError('full', { max: MAX_SHORTCUTS });
  if (
    store.shortcuts.some(
      (s) => canonical(s.trigger) === canonical(entry.trigger),
    )
  )
    throw new ShortcutError('exists', { trigger: entry.trigger });
  return {
    ...store,
    shortcuts: [...store.shortcuts, { id: newId(), ...entry }],
  };
};

/** Fails if another tab changed or deleted this entry since it was shown. */
export const updateShortcut =
  (expected: ShortcutRecord, patch: Partial<ShortcutDraft>) =>
  (store: ShortcutStore) => {
    const current = store.shortcuts.find((s) => s.id === expected.id);
    if (!sameRecord(current, expected))
      throw new ShortcutError('changedElsewhere');
    const entry = validateDraft({ ...expected, ...patch });
    if (
      store.shortcuts.some(
        (s) =>
          s.id !== expected.id &&
          canonical(s.trigger) === canonical(entry.trigger),
      )
    )
      throw new ShortcutError('exists', { trigger: entry.trigger });
    return {
      ...store,
      shortcuts: store.shortcuts.map((s) =>
        s.id === expected.id ? { id: s.id, ...entry } : s,
      ),
    };
  };

export const removeShortcut =
  (expected: ShortcutRecord) => (store: ShortcutStore) => {
    if (
      !sameRecord(
        store.shortcuts.find((s) => s.id === expected.id),
        expected,
      )
    )
      throw new ShortcutError('changedElsewhere');
    return {
      ...store,
      shortcuts: store.shortcuts.filter((s) => s.id !== expected.id),
    };
  };

export const setExpansion = (enabled: boolean) => (store: ShortcutStore) => ({
  ...store,
  enabled,
});

// ---- JSON backup -------------------------------------------------------

/** Only portable shortcut fields: no key, settings, usage or page data. */
export function exportBackup(store: ShortcutStore, now = new Date()): string {
  return (
    JSON.stringify(
      {
        format: BACKUP_FORMAT,
        schemaVersion: 2,
        exportedAt: now.toISOString(),
        shortcuts: [...store.shortcuts]
          .sort((a, b) =>
            canonical(a.trigger).localeCompare(canonical(b.trigger)),
          )
          .map((s) => ({
            id: s.id,
            trigger: s.trigger,
            replacement: s.replacement,
            enabled: s.enabled,
            protectTriggerInAi: s.protectTriggerInAi,
            protectReplacementInAi: s.protectReplacementInAi,
          })),
      },
      null,
      2,
    ) + '\n'
  );
}

/** Parses an untrusted backup file; any invalid entry rejects the file. */
export function parseBackup(text: string): ShortcutRecord[] {
  if (new TextEncoder().encode(text).length > MAX_BACKUP_BYTES)
    throw new ShortcutError('fileTooLarge');
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ShortcutError('notJson');
  }
  const record =
    data && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};
  if (record.format !== BACKUP_FORMAT || record.schemaVersion !== 2)
    throw new ShortcutError('notBackup');
  return validateList(record.shortcuts);
}

export type ImportPolicy = 'skip' | 'overwrite' | 'replaceAll';

export interface ImportPlan {
  revision: number;
  policy: ImportPolicy;
  added: number;
  identical: number;
  conflicts: number;
  removed: number;
  next: ShortcutRecord[];
}

/** Dry run: never writes. Matching is by canonical trigger, never by ID. */
export function planImport(
  store: ShortcutStore,
  incoming: ShortcutRecord[],
  policy: ImportPolicy,
): ImportPlan {
  const byTrigger = new Map(
    store.shortcuts.map((s) => [canonical(s.trigger), s] as const),
  );
  const fields = (s: ShortcutRecord) =>
    JSON.stringify([
      s.trigger,
      s.replacement,
      s.enabled,
      s.protectTriggerInAi,
      s.protectReplacementInAi,
    ]);
  let added = 0,
    identical = 0,
    conflicts = 0;
  const updates = new Map<string, ShortcutRecord>();
  const additions: ShortcutRecord[] = [];
  for (const entry of incoming) {
    const local = byTrigger.get(canonical(entry.trigger));
    if (!local) {
      added++;
      additions.push({ ...entry, id: newId() });
    } else if (fields(local) === fields(entry)) identical++;
    else {
      conflicts++;
      // Overwrite keeps the local ID of that logical entry.
      if (policy === 'overwrite')
        updates.set(local.id, { ...entry, id: local.id });
    }
  }
  const next =
    policy === 'replaceAll'
      ? incoming.map((entry) => ({
          ...entry,
          id: byTrigger.get(canonical(entry.trigger))?.id ?? newId(),
        }))
      : [...store.shortcuts.map((s) => updates.get(s.id) ?? s), ...additions];
  if (next.length > MAX_SHORTCUTS)
    throw new ShortcutError('importExceeds', { max: MAX_SHORTCUTS });
  const kept = new Set(next.map((s) => canonical(s.trigger)));
  return {
    revision: store.revision,
    policy,
    added,
    identical,
    conflicts,
    removed: store.shortcuts.filter((s) => !kept.has(canonical(s.trigger)))
      .length,
    next,
  };
}

/** Applies a plan only if nothing changed since the preview. */
export const applyImport = (plan: ImportPlan) => (store: ShortcutStore) => {
  if (store.revision !== plan.revision) throw new ShortcutError('previewStale');
  return { ...store, shortcuts: plan.next };
};

// ---- Expansion matcher (pure, synchronous) -------------------------------

// V4 separators: space, no-break space and , ; : . ! ? (not Tab/Enter).
const SEPARATOR = /^[ \xa0,;:.!?]$/u;
const TOKEN_BEFORE = /(?:^|[\s(«“])([\p{L}\p{M}\p{N}_-]{1,32})$/u;

/** True for a character that may end a trigger (Tab and Enter never do). */
export const isShortcutSeparator = (character: string): boolean =>
  SEPARATOR.test(character);

export type ShortcutMap = ReadonlyMap<string, string>;

export function shortcutMap(
  entries: readonly { trigger: string; replacement: string }[],
): ShortcutMap {
  return new Map(entries.map((s) => [canonical(s.trigger), s.replacement]));
}

/**
 * `text` already contains the just-typed separator just before `caret`.
 * Returns the trigger range to replace (the separator stays), or null.
 * Work is bounded by the trigger length, not the field length.
 */
export function shortcutExpansion(
  text: string,
  caret: number,
  map: ShortcutMap,
): { start: number; end: number; trigger: string; replacement: string } | null {
  if (!map.size || !SEPARATOR.test(text[caret - 1] ?? '')) return null;
  const token = TOKEN_BEFORE.exec(
    text.slice(Math.max(0, caret - 35), caret - 1),
  );
  const trigger = token?.[1];
  if (!trigger) return null;
  const replacement = map.get(canonical(trigger));
  return replacement === undefined
    ? null
    : {
        start: caret - 1 - trigger.length,
        end: caret - 1,
        trigger,
        replacement,
      };
}
