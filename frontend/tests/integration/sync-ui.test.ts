import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { localizePage } from '../../src/options/i18n-dom';
import { OPTIONS } from '../../src/options/messages';
import { SyncSection, type SyncDeps } from '../../src/options/sync-ui';
import type { Locale } from '../../src/shared/locale';
import {
  SYNC_CLEAR,
  SYNC_NOW,
  SYNC_PASSPHRASE,
  SYNC_PREFS_KEY,
  SYNC_RESOLVE,
  SYNC_STATE_KEY,
  emptySyncState,
  normalizeSyncPrefs,
} from '../../src/shared/sync';
import { FastFakeStorage } from '../helpers/fake-storage';

// 5.14 "Synchronisation" page: choices, statuses, passphrase, clear.

const html = readFileSync(
  join(import.meta.dirname, '../../src/options/options.html'),
  'utf8',
);
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const text = (id: string) => $(id).textContent?.trim() ?? '';
const flush = async () => {
  for (let i = 0; i < 4; i++)
    await new Promise((resolve) => setImmediate(resolve));
};

let area: FastFakeStorage;
let send: ReturnType<typeof vi.fn<(message: unknown) => Promise<unknown>>>;
let confirm: ReturnType<typeof vi.fn<() => Promise<boolean>>>;

async function openPage(locale: Locale = 'fr') {
  document.body.innerHTML = body;
  localizePage(document, OPTIONS[locale], locale);
  const deps: SyncDeps = { area, send, confirm, locale };
  const section = new SyncSection(document, deps);
  await section.init();
  return section;
}

const state = (patch: (s: ReturnType<typeof emptySyncState>) => void) => {
  const value = emptySyncState();
  patch(value);
  area.data.set(SYNC_STATE_KEY, value);
};
const prefs = (domains: Record<string, boolean>) =>
  area.data.set(SYNC_PREFS_KEY, normalizeSyncPrefs({ enabled: true, domains }));

beforeEach(() => {
  area = new FastFakeStorage();
  send = vi.fn(() => Promise.resolve({ ok: true }));
  confirm = vi.fn(() => Promise.resolve(true));
});

describe('sync page', () => {
  it('is off by default: domains and actions are disabled, nothing sent', async () => {
    await openPage();
    expect($<HTMLInputElement>('sync-enabled').checked).toBe(false);
    expect($<HTMLInputElement>('sync-shortcuts').disabled).toBe(true);
    expect($<HTMLButtonElement>('sync-now').disabled).toBe(true);
    expect($<HTMLInputElement>('sync-pass').disabled).toBe(true);
    expect(text('sync-pass-message')).toBe(OPTIONS.fr.sync.passNeedsDomain);
    expect(send).not.toHaveBeenCalled();
  });

  it('turning it on writes only this computer’s choices', async () => {
    await openPage();
    $<HTMLInputElement>('sync-enabled').click();
    await flush();
    $<HTMLInputElement>('sync-shortcuts').click();
    await flush();
    expect(normalizeSyncPrefs(area.data.get(SYNC_PREFS_KEY))).toEqual({
      schemaVersion: 1,
      enabled: true,
      domains: {
        shortcuts: true,
        settings: false,
        keybindings: false,
        keys: false,
      },
    });
    expect(text('sync-message')).toBe(OPTIONS.fr.sync.on);
    expect(send).not.toHaveBeenCalled();
  });

  it('shows statuses, errors and the usage, in English too', async () => {
    prefs({ shortcuts: true, settings: true, keys: true });
    state((s) => {
      s.domains.shortcuts = {
        status: 'error',
        code: 'tooLarge',
        syncedAt: 0,
        replaced: false,
      };
      s.domains.settings = {
        status: 'choose',
        code: null,
        syncedAt: 0,
        replaced: false,
      };
      s.domains.keys.status = 'locked';
      s.bytesInUse = 38 * 1024;
    });
    await openPage('en');
    expect(text('sync-status-shortcuts')).toBe(OPTIONS.en.sync.error.tooLarge);
    expect($('sync-status-shortcuts').dataset.tone).toBe('error');
    expect(text('sync-status-keybindings')).toBe(OPTIONS.en.sync.status.off);
    expect(text('sync-usage')).toContain('38 KB');
    expect(text('sync-pass-submit')).toBe(OPTIONS.en.sync.passUnlock);
    expect($('sync-pass2-row').hidden).toBe(true);
    expect(text('sync-title')).toBe('Sync');

    const [keep, take] = [
      ...$('sync-actions-settings').querySelectorAll('button'),
    ];
    expect(keep?.textContent).toBe(OPTIONS.en.sync.keepLocal);
    take!.click();
    await flush();
    expect(send).toHaveBeenCalledWith({
      type: SYNC_RESOLVE,
      domain: 'settings',
      keep: 'remote',
    });
  });

  it('a replaced version can be restored', async () => {
    prefs({ shortcuts: true });
    state((s) => {
      s.domains.shortcuts.status = 'synced';
      s.domains.shortcuts.replaced = true;
    });
    await openPage();
    const actions = $('sync-actions-shortcuts');
    expect(actions.hidden).toBe(false);
    expect(actions.textContent).toContain(OPTIONS.fr.sync.replaced);
    actions.querySelector('button')!.click();
    await flush();
    expect(send).toHaveBeenCalledWith({
      type: 'correctly.v5.syncRestore',
      domain: 'shortcuts',
    });
    expect(text('sync-message')).toBe(OPTIONS.fr.sync.restored);
  });

  it('a new passphrase is typed twice and never kept on the page', async () => {
    prefs({ keys: true });
    state((s) => (s.domains.keys.status = 'needsPassphrase'));
    await openPage();
    expect(text('sync-pass-submit')).toBe(OPTIONS.fr.sync.passSet);
    $<HTMLInputElement>('sync-pass').value = 'correct horse';
    $<HTMLInputElement>('sync-pass2').value = 'correct horsE';
    $<HTMLButtonElement>('sync-pass-submit').click();
    await flush();
    expect(text('sync-pass-message')).toBe(OPTIONS.fr.sync.passMismatch);
    expect(send).not.toHaveBeenCalled();
    expect($<HTMLInputElement>('sync-pass').value).toBe('');

    $<HTMLInputElement>('sync-pass').value = 'correct horse';
    $<HTMLInputElement>('sync-pass2').value = 'correct horse';
    $<HTMLButtonElement>('sync-pass-submit').click();
    await flush();
    expect(send).toHaveBeenCalledWith({
      type: SYNC_PASSPHRASE,
      passphrase: 'correct horse',
      mode: 'replace',
    });
    expect(text('sync-pass-message')).toBe(OPTIONS.fr.sync.passSaved);
    expect($<HTMLInputElement>('sync-pass2').value).toBe('');
    expect(area.dump()).not.toContain('correct horse');
  });

  it('locked: unlock with one field; a wrong passphrase is reported', async () => {
    prefs({ keys: true });
    state((s) => (s.domains.keys.status = 'locked'));
    send.mockResolvedValueOnce({ ok: false, code: 'badPassphrase' });
    await openPage();
    $<HTMLInputElement>('sync-pass').value = 'not the one';
    $<HTMLButtonElement>('sync-pass-submit').click();
    await flush();
    expect(send).toHaveBeenCalledWith({
      type: SYNC_PASSPHRASE,
      passphrase: 'not the one',
      mode: 'unlock',
    });
    expect(text('sync-pass-message')).toBe(OPTIONS.fr.sync.error.badPassphrase);

    // "Use a new passphrase": shows the confirmation field, then asks.
    $<HTMLButtonElement>('sync-pass-replace').click();
    expect($('sync-pass2-row').hidden).toBe(false);
    $<HTMLInputElement>('sync-pass').value = 'brand new one';
    $<HTMLInputElement>('sync-pass2').value = 'brand new one';
    $<HTMLButtonElement>('sync-pass-submit').click();
    await flush();
    expect(confirm).toHaveBeenCalledWith(
      OPTIONS.fr.sync.confirmReplace,
      OPTIONS.fr.sync.replaceAction,
    );
    expect(send).toHaveBeenLastCalledWith({
      type: SYNC_PASSPHRASE,
      passphrase: 'brand new one',
      mode: 'replace',
    });
  });

  it('sync now and clear (after confirmation, sync off first)', async () => {
    prefs({ shortcuts: true });
    await openPage();
    $<HTMLButtonElement>('sync-now').click();
    await flush();
    expect(send).toHaveBeenCalledWith({ type: SYNC_NOW });
    confirm.mockResolvedValueOnce(false);
    $<HTMLButtonElement>('sync-clear').click();
    await flush();
    expect(send).toHaveBeenCalledTimes(1);
    $<HTMLButtonElement>('sync-clear').click();
    await flush();
    expect(normalizeSyncPrefs(area.data.get(SYNC_PREFS_KEY)).enabled).toBe(
      false,
    );
    expect(send).toHaveBeenLastCalledWith({ type: SYNC_CLEAR });
    expect(text('sync-clear-message')).toBe(OPTIONS.fr.sync.cleared);
  });

  it('a malformed worker reply is shown as a storage error', async () => {
    prefs({ shortcuts: true });
    send.mockResolvedValueOnce({ ok: false, code: '<img src=x>' });
    await openPage();
    $<HTMLButtonElement>('sync-now').click();
    await flush();
    expect(text('sync-message')).toBe(OPTIONS.fr.sync.error.storage);
  });
});
