import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  KeyboardSection,
  type BrowserCommand,
  type KeyboardDeps,
} from '../../src/options/keyboard-ui';
import { KEYBINDINGS_KEY, loadKeybindings } from '../../src/shared/keybindings';
import { FakeStorage } from '../helpers/fake-storage';

// "Raccourcis clavier" page: browser commands (read-only) and Correctly's
// own in-page shortcuts recorded here.

const html = readFileSync(
  join(import.meta.dirname, '../../src/options/options.html'),
  'utf8',
);
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const text = (id: string) => $(id).textContent?.trim() ?? '';

let area: FakeStorage;
let commands: BrowserCommand[];
let deps: KeyboardDeps & {
  requestSiteAccess: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
  releaseSiteAccess: ReturnType<typeof vi.fn<() => Promise<void>>>;
};
const fetchSpy = vi.fn();

async function openPage() {
  document.body.innerHTML = body;
  const section = new KeyboardSection(document, deps);
  await section.init();
  return section;
}
const key = (
  code: string,
  keyText: string,
  mods: Partial<
    Record<'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey', boolean>
  > = {},
) => ({
  code,
  key: keyText,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...mods,
});
const rows = (id: string) =>
  [...document.querySelectorAll(`#${id} tbody tr, #${id} > li`)].map((row) =>
    [...row.children]
      .map((cell) => cell.textContent ?? '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );

beforeEach(() => {
  area = new FakeStorage();
  commands = [
    { name: '_execute_action', shortcut: '' },
    { name: 'open-correctly', shortcut: 'Ctrl+M' },
    { name: 'correct-selection', shortcut: 'Alt+Shift+C' },
    { name: 'rewrite-selection', shortcut: '' },
    { name: 'translate-selection', shortcut: '' },
  ];
  deps = {
    area,
    getCommands: () => Promise.resolve(commands),
    requestSiteAccess: vi.fn(() => Promise.resolve(true)),
    hasSiteAccess: () => Promise.resolve(true),
    releaseSiteAccess: vi.fn(() => Promise.resolve()),
  };
  fetchSpy.mockClear();
  vi.stubGlobal('fetch', fetchSpy);
});

describe('browser shortcuts (read-only here)', () => {
  it('lists every command with its real shortcut or "non défini"', async () => {
    await openPage();
    expect(rows('command-list')).toEqual([
      'Bouton de la barre d’outils non défini',
      'Ouvrir Correctly Ctrl+M',
      'Corriger la sélection Alt+Shift+C',
      'Reformuler la sélection non défini',
      'Traduire la sélection non défini',
    ]);
  });

  it('“Actualiser” re-reads them after a change in Chrome', async () => {
    const section = await openPage();
    commands = commands.map((c) =>
      c.name === 'open-correctly' ? { ...c, shortcut: 'Ctrl+Shift+O' } : c,
    );
    await section.refreshCommands();
    expect(rows('command-list')[1]).toBe('Ouvrir Correctly Ctrl+Shift+O');
  });

  it('unavailable commands show an empty state, not an error', async () => {
    deps.getCommands = () => Promise.reject(new Error('no API'));
    await openPage();
    expect($('command-empty').hidden).toBe(false);
  });
});

describe('Correctly shortcuts (recorded on this page)', () => {
  it('Définir + key press saves the combination; nothing is sent anywhere', async () => {
    const section = await openPage();
    expect(rows('keybinding-list')[0]).toMatch(/^Ouvrir Correctly aucun/);
    section.record('open');
    expect(rows('keybinding-list')[0]).toMatch(/Appuyez sur une combinaison/);
    // A lone modifier keeps waiting.
    await section.press(key('ShiftLeft', 'Shift', { shiftKey: true }));
    expect(section.recording).toBe('open');
    await section.press(key('KeyK', 'K', { ctrlKey: true, shiftKey: true }));
    expect(section.recording).toBeNull();
    expect(text('keybindings-message')).toMatch(
      /Ctrl\+Shift\+K enregistré pour « Ouvrir Correctly »/,
    );
    expect((await loadKeybindings(area)).bindings.open).toMatchObject({
      code: 'KeyK',
      ctrl: true,
      shift: true,
    });
    expect(rows('keybinding-list')[0]).toMatch(/Ctrl\+Shift\+K/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('a real key press on the page is the recording (captured, not passed on)', async () => {
    const section = await openPage();
    section.record('translate');
    const event = new KeyboardEvent('keydown', {
      code: 'KeyY',
      key: 'y',
      altKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.body.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    await vi.waitFor(async () =>
      expect((await loadKeybindings(area)).bindings.translate?.code).toBe(
        'KeyY',
      ),
    );
  });

  it('reserved, modifier-less or already used combinations are refused', async () => {
    const section = await openPage();
    section.record('open');
    await section.press(key('KeyC', 'c', { ctrlKey: true }));
    expect(text('keybindings-message')).toMatch(/utilisé par le navigateur/);
    await section.press(key('KeyK', 'k'));
    expect(text('keybindings-message')).toMatch(/Ajoutez Ctrl, Alt ou Meta/);
    expect(section.recording).toBe('open');
    await section.press(key('KeyK', 'K', { ctrlKey: true, shiftKey: true }));
    section.record('correct');
    await section.press(key('KeyK', 'K', { ctrlKey: true, shiftKey: true }));
    expect(text('keybindings-message')).toMatch(
      /déjà utilisé pour « Ouvrir Correctly »/,
    );
    expect((await loadKeybindings(area)).bindings.correct).toBeUndefined();
  });

  it('Échap cancels; Effacer removes a combination', async () => {
    const section = await openPage();
    section.record('rewrite');
    await section.press(key('Escape', 'Escape'));
    expect(section.recording).toBeNull();
    expect((await loadKeybindings(area)).bindings.rewrite).toBeUndefined();
    section.record('rewrite');
    await section.press(key('KeyR', 'r', { altKey: true }));
    await section.clear('rewrite');
    expect((await loadKeybindings(area)).bindings.rewrite).toBeUndefined();
    expect(text('keybindings-message')).toMatch(/effacé/);
  });

  it('warns when a combination is also a browser shortcut', async () => {
    const section = await openPage();
    section.record('open');
    await section.press(key('KeyM', 'm', { ctrlKey: true }));
    expect(rows('keybinding-list')[0]).toMatch(
      /Identique au raccourci du navigateur \(Ctrl\+M\)/,
    );
    section.record('rewrite');
    await section.press(key('KeyC', 'C', { altKey: true, shiftKey: true }));
    expect(rows('keybinding-list')[2]).toMatch(
      /Alt\+Shift\+C est aussi le raccourci navigateur de « Corriger la sélection »/,
    );
  });

  it('turning on asks for site access; refusal keeps it off; off releases access', async () => {
    const section = await openPage();
    const box = $<HTMLInputElement>('keybindings-enabled');
    deps.requestSiteAccess.mockResolvedValueOnce(false);
    box.checked = true;
    await section.toggle();
    expect(box.checked).toBe(false);
    expect(text('keybindings-message')).toMatch(/pas été accordé/);
    expect((await loadKeybindings(area)).enabled).toBe(false);
    box.checked = true;
    await section.toggle();
    expect((await loadKeybindings(area)).enabled).toBe(true);
    box.checked = false;
    await section.toggle();
    expect((await loadKeybindings(area)).enabled).toBe(false);
    expect(deps.releaseSiteAccess).toHaveBeenCalledTimes(1);
  });

  it('another tab’s change is shown; damaged storage reads as empty', async () => {
    const section = await openPage();
    area.data.set(KEYBINDINGS_KEY, {
      enabled: true,
      bindings: {
        correct: {
          ctrl: false,
          alt: true,
          shift: false,
          meta: false,
          code: 'Digit2',
          label: '2',
        },
      },
    });
    section.onStorageChanged([KEYBINDINGS_KEY]);
    await vi.waitFor(() =>
      expect(rows('keybinding-list')[1]).toMatch(/Alt\+2/),
    );
    area.data.set(KEYBINDINGS_KEY, 'broken');
    await section.reload();
    expect(rows('keybinding-list').every((row) => /aucun/.test(row))).toBe(
      true,
    );
  });
});
