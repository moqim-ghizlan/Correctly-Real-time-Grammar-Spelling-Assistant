import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ShortcutsSection,
  type ShortcutsDeps,
} from '../../src/options/shortcuts-ui';
import {
  SHORTCUTS_KEY,
  V4_SHORTCUTS_KEY,
  loadShortcuts,
} from '../../src/shared/shortcuts';
import { FakeStorage } from '../helpers/fake-storage';

const html = readFileSync(
  join(import.meta.dirname, '../../src/options/options.html'),
  'utf8',
);
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const text = (id: string) => $(id).textContent?.trim() ?? '';
const rows = () =>
  [...document.querySelectorAll('#shortcut-list li')].map(
    (li) => li.querySelector('code')?.textContent,
  );

let area: FakeStorage;
let deps: ShortcutsDeps & {
  download: ReturnType<typeof vi.fn<ShortcutsDeps['download']>>;
  confirm: ReturnType<typeof vi.fn<ShortcutsDeps['confirm']>>;
  requestSiteAccess: ReturnType<
    typeof vi.fn<ShortcutsDeps['requestSiteAccess']>
  >;
  releaseSiteAccess: ReturnType<
    typeof vi.fn<ShortcutsDeps['releaseSiteAccess']>
  >;
};
let fetchSpy: ReturnType<typeof vi.fn>;

async function open() {
  document.body.innerHTML = body;
  const section = new ShortcutsSection(document, deps);
  await section.init();
  return section;
}

async function addVia(
  section: ShortcutsSection,
  trigger: string,
  replacement: string,
) {
  $<HTMLInputElement>('shortcut-trigger').value = trigger;
  $<HTMLTextAreaElement>('shortcut-replacement').value = replacement;
  await section.save();
}

function file(content: string) {
  return new File([content], 'backup.json', { type: 'application/json' });
}

beforeEach(() => {
  area = new FakeStorage();
  fetchSpy = vi.fn();
  vi.stubGlobal('fetch', fetchSpy);
  deps = {
    area,
    confirm: vi.fn<ShortcutsDeps['confirm']>(() => true),
    requestSiteAccess: vi.fn<ShortcutsDeps['requestSiteAccess']>(() =>
      Promise.resolve(true),
    ),
    hasSiteAccess: () => Promise.resolve(true),
    releaseSiteAccess: vi.fn<ShortcutsDeps['releaseSiteAccess']>(() =>
      Promise.resolve(),
    ),
    download: vi.fn<ShortcutsDeps['download']>(),
    now: () => new Date('2026-10-15T12:00:00Z'),
  };
});

describe('7: CRUD', () => {
  it('empty state, add, duplicate refused, count and no network', async () => {
    const section = await open();
    expect($('shortcut-empty').hidden).toBe(false);
    expect(text('shortcut-count')).toBe('0 / 500');
    await addVia(section, 'bjr', 'Bonjour');
    expect(rows()).toEqual(['bjr']);
    expect(text('shortcut-count')).toBe('1 / 500');
    expect($<HTMLInputElement>('shortcut-trigger').value).toBe('');
    await addVia(section, 'BJR', 'Autre');
    expect(text('shortcut-message')).toContain('already exists');
    // The form keeps what was typed after an error.
    expect($<HTMLTextAreaElement>('shortcut-replacement').value).toBe('Autre');
    expect(rows()).toEqual(['bjr']);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('2.4: edit, disable/enable and delete (with confirmation) persist', async () => {
    const section = await open();
    await addVia(section, 'bjr', 'Bonjour');
    const [entry] = (await loadShortcuts(area)).store.shortcuts;
    section.edit(entry!);
    expect(text('shortcut-save')).toBe('Save changes');
    $<HTMLTextAreaElement>('shortcut-replacement').value = 'Bonjour à tous';
    await section.save();
    let [saved] = (await loadShortcuts(area)).store.shortcuts;
    expect(saved?.replacement).toBe('Bonjour à tous');
    await section.toggle(saved!);
    [saved] = (await loadShortcuts(area)).store.shortcuts;
    expect(saved?.enabled).toBe(false);
    expect(document.querySelector('#shortcut-list li')?.textContent).toContain(
      'off',
    );
    deps.confirm.mockReturnValueOnce(false);
    await section.remove(saved!);
    expect(rows()).toEqual(['bjr']);
    await section.remove(saved!);
    expect(rows()).toEqual([]);
    expect(deps.confirm).toHaveBeenCalledWith('Delete the shortcut "bjr"?');
  });

  it('search filters by trigger or replacement without writing', async () => {
    const section = await open();
    await addVia(section, 'bjr', 'Bonjour');
    await addVia(section, 'sig', 'Best regards');
    const writes = area.sets;
    $<HTMLInputElement>('shortcut-search').value = 'regards';
    section.render();
    expect(rows()).toEqual(['sig']);
    expect(area.sets).toBe(writes);
  });

  it('replacement previews are plain text', async () => {
    const section = await open();
    await addVia(section, 'xss', '<img src=x onerror=alert(1)>');
    expect(document.querySelector('#shortcut-list img')).toBeNull();
    expect(
      document.querySelector('#shortcut-list .replacement')?.textContent,
    ).toBe('<img src=x onerror=alert(1)>');
  });

  it('V4 shortcuts are shown with a notice; the old copy is kept', async () => {
    const v4 = {
      schemaVersion: 1,
      enabled: true,
      shortcuts: [
        {
          id: 'x',
          trigger: 'cbj',
          replacement: 'phrase',
          enabled: true,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    };
    area.data.set(V4_SHORTCUTS_KEY, v4);
    await open();
    expect(rows()).toEqual(['cbj']);
    expect(text('shortcuts-status')).toContain('V4');
    expect(area.data.has(SHORTCUTS_KEY)).toBe(false);
  });
});

describe('global switch and site access', () => {
  it('turning on asks for access; refusal keeps it off; turning off releases access', async () => {
    const section = await open();
    deps.requestSiteAccess.mockResolvedValueOnce(false);
    $<HTMLInputElement>('shortcuts-enabled').checked = true;
    await section.toggleExpansion();
    expect((await loadShortcuts(area)).store.enabled).toBe(false);
    expect(text('shortcuts-status')).toContain('not granted');
    $<HTMLInputElement>('shortcuts-enabled').checked = true;
    await section.toggleExpansion();
    expect((await loadShortcuts(area)).store.enabled).toBe(true);
    $<HTMLInputElement>('shortcuts-enabled').checked = false;
    await section.toggleExpansion();
    expect((await loadShortcuts(area)).store.enabled).toBe(false);
    expect(deps.releaseSiteAccess).toHaveBeenCalledTimes(1);
  });
});

describe('8: backup', () => {
  it('export downloads a dated JSON without the key', async () => {
    area.data.set('correctly.v5.settings', {
      gemini: { apiKey: 'AIzaSyFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAK' },
    });
    const section = await open();
    await addVia(section, 'bjr', 'Bonjour');
    section.export();
    const [name, content] = deps.download.mock.calls[0] as [string, string];
    expect(name).toBe('correctly-shortcuts-2026-10-15.json');
    expect(content).toContain('"trigger": "bjr"');
    expect(content).not.toContain('AIza');
  });

  it('import: preview writes nothing; default keeps mine; confirm applies once', async () => {
    const section = await open();
    await addVia(section, 'bjr', 'Bonjour');
    const backup = JSON.stringify({
      format: 'correctly-personal-shortcuts',
      schemaVersion: 2,
      shortcuts: [
        { trigger: 'bjr', replacement: 'Salut' },
        { trigger: 'cbj', replacement: 'phrase' },
      ],
    });
    const writes = area.sets;
    await section.importFile(file(backup));
    expect($('import-preview').hidden).toBe(false);
    expect(text('import-summary')).toContain(
      '1 new, 0 identical, 1 different from yours (kept as they are)',
    );
    expect(area.sets).toBe(writes);
    await section.confirmImport();
    expect(rows()).toEqual(['bjr', 'cbj']);
    expect((await loadShortcuts(area)).store.shortcuts[0]?.replacement).toBe(
      'Bonjour',
    );
    expect($('import-preview').hidden).toBe(true);
  });

  it('replace all needs an extra confirmation; invalid files change nothing', async () => {
    const section = await open();
    await addVia(section, 'mine', 'only mine');
    await section.importFile(
      file(
        JSON.stringify({
          format: 'correctly-personal-shortcuts',
          schemaVersion: 2,
          shortcuts: [{ trigger: 'cbj', replacement: 'phrase' }],
        }),
      ),
    );
    document.querySelector<HTMLInputElement>(
      'input[value="replaceAll"]',
    )!.checked = true;
    section.preview();
    expect(text('import-summary')).toContain('1 of yours will be DELETED');
    deps.confirm.mockReturnValueOnce(false);
    await section.confirmImport();
    expect(rows()).toEqual(['mine']);
    await section.confirmImport();
    expect(rows()).toEqual(['cbj']);

    const before = JSON.stringify(area.data.get(SHORTCUTS_KEY));
    await section.importFile(file('{"format":"other"}'));
    expect(text('import-message')).toContain('Nothing was changed');
    expect($('import-preview').hidden).toBe(true);
    expect(JSON.stringify(area.data.get(SHORTCUTS_KEY))).toBe(before);
  });
});
