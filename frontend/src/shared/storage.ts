import { CorrectlyError } from './errors';
import { localDate } from './local-date';
import {
  normalizeConnection,
  normalizeSettings,
  normalizeUsage,
  type ConnectionRecord,
  type DailyUsageRecord,
  type V51Settings,
} from './settings';

// Namespaced keys: V5 never reads, rewrites or clears V4 data such as the
// `settings` or shortcut entries a previous version left in this profile.
export const STORAGE_KEYS = {
  settings: 'correctly.v5.settings',
  connection: 'correctly.v5.connection',
  usage: 'correctly.v5.usage',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

/** Minimal surface of chrome.storage.local, injectable for tests. */
export interface StorageArea {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export const browserStorage = (): StorageArea => chrome.storage.local;

async function read(area: StorageArea, key: StorageKey): Promise<unknown> {
  try {
    return (await area.get([key]))[key];
  } catch {
    throw new CorrectlyError('STORAGE_ERROR');
  }
}

async function write(
  area: StorageArea,
  key: StorageKey,
  value: unknown,
): Promise<void> {
  try {
    await area.set({ [key]: value });
  } catch {
    throw new CorrectlyError('STORAGE_ERROR');
  }
}

export async function loadSettings(area: StorageArea): Promise<V51Settings> {
  return normalizeSettings(await read(area, STORAGE_KEYS.settings));
}

export async function saveSettings(
  area: StorageArea,
  settings: V51Settings,
): Promise<V51Settings> {
  const normalized = normalizeSettings(settings);
  await write(area, STORAGE_KEYS.settings, normalized);
  return normalized;
}

export async function loadConnection(
  area: StorageArea,
): Promise<ConnectionRecord> {
  return normalizeConnection(await read(area, STORAGE_KEYS.connection));
}

export async function saveConnection(
  area: StorageArea,
  connection: ConnectionRecord,
): Promise<void> {
  await write(area, STORAGE_KEYS.connection, normalizeConnection(connection));
}

export async function loadUsage(
  area: StorageArea,
  today: string = localDate(),
): Promise<DailyUsageRecord> {
  return normalizeUsage(await read(area, STORAGE_KEYS.usage), today);
}

export async function saveUsage(
  area: StorageArea,
  usage: DailyUsageRecord,
): Promise<void> {
  await write(area, STORAGE_KEYS.usage, usage);
}
