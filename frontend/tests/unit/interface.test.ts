import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyReplacement,
  replaceTextRange,
  updatedCaret,
} from '../../src/content/replacement';
import {
  calculatePopupPosition,
  SuggestionPopup,
} from '../../src/content/suggestion-popup';
import { intersectRect } from '../../src/content/overlay';
import {
  getEditableTextModel,
  getTextFromField,
} from '../../src/content/text-extractor';
import { normalizeMatches } from '../../src/correction/languagetool-client';
import {
  createContextMenu,
  updateContextMenu,
  handleContextClick,
} from '../../src/context-menu/context-menu';
import { MENU_ID } from '../../src/shared/constants';
import {
  loadSettings,
  saveSettings,
  DEFAULT_SETTINGS,
} from '../../src/shared/storage';
afterEach(() => {
  document.body.replaceChildren();
  document
    .querySelectorAll('[data-correctly-ui]')
    .forEach((element) => element.remove());
  vi.unstubAllGlobals();
});
function match(text: string, offset: number, length: number) {
  return normalizeMatches(
    {
      matches: [
        {
          offset,
          length,
          message: '<script>alert(1)</script>',
          replacements: [{ value: 'suis' }],
          rule: { id: 'TEST', category: { id: 'TYPOS' } },
        },
      ],
    },
    text,
  )[0]!;
}
describe('replacement', () => {
  it.each([
    ['abc', 0, 1, 'z', 'zbc'],
    ['je sui ici', 3, 3, 'suis', 'je suis ici'],
    ['abc', 2, 1, '', 'ab'],
    ['éèàçœ', 1, 2, 'été', 'éétéçœ'],
    ["l'ami", 2, 3, 'été', "l'été"],
    ['😊 🇫🇷 sui', 8, 3, 'suis', '😊 🇫🇷 suis'],
    ['', 0, 0, 'x', 'x'],
    ['abc', 3, 0, 'z', 'abcz'],
  ])('replaces %s safely', (text, offset, length, replacement, expected) => {
    expect(replaceTextRange(text, offset, length, replacement)).toBe(expected);
  });
  it('rejects invalid offsets', () => {
    expect(() => replaceTextRange('x', 2, 1, '')).toThrow(RangeError);
  });
  it.each([
    [1, 1],
    [4, 7],
    [8, 9],
  ])('preserves caret %i → %i', (before, after) => {
    expect(updatedCaret(before, 3, 3, 4)).toBe(after);
  });
  it.each(['input', 'textarea'])(
    'replaces %s via native setter and emits input',
    (tag) => {
      const field = document.createElement(tag) as
        HTMLInputElement | HTMLTextAreaElement;
      field.value = 'je sui ici';
      document.body.append(field);
      field.setSelectionRange(8, 9, 'backward');
      const listener = vi.fn();
      field.addEventListener('input', listener);
      expect(applyReplacement(field, match(field.value, 3, 3), 'suis')).toBe(
        true,
      );
      expect(field.value).toBe('je suis ici');
      expect(field.selectionStart).toBe(9);
      expect(field.selectionEnd).toBe(10);
      expect(field.selectionDirection).toBe('backward');
      expect(listener).toHaveBeenCalledTimes(1);
    },
  );
  it('refuses old offsets even if the fragment still matches', () => {
    const field = document.createElement('textarea');
    field.value = 'je sui ici!';
    expect(applyReplacement(field, match('je sui ici', 3, 3), 'suis')).toBe(
      false,
    );
    expect(field.value).toBe('je sui ici!');
  });
  it('preserves surrounding rich markup and selection', () => {
    const field = document.createElement('div');
    field.setAttribute('contenteditable', 'true');
    field.innerHTML = '<b>je </b><i>sui</i> ici';
    document.body.append(field);
    const model = getEditableTextModel(field),
      point = model.points[9]!;
    window
      .getSelection()
      ?.setBaseAndExtent(point.node, point.offset, point.node, point.offset);
    expect(
      applyReplacement(field, match(getTextFromField(field), 3, 3), 'suis'),
    ).toBe(true);
    expect(getTextFromField(field)).toBe('je suis ici');
    expect(field.querySelector('b')?.textContent).toBe('je ');
    expect(field.querySelector('i')).not.toBeNull();
  });
  it('refuses replacement of synthetic paragraph separators', () => {
    const field = document.createElement('div');
    field.innerHTML = '<p>one</p><p>two</p>';
    expect(
      applyReplacement(field, match(getTextFromField(field), 3, 1), ' '),
    ).toBe(false);
    expect(field.children).toHaveLength(2);
  });
});
it.each([
  { left: 400, top: 300 },
  { left: 990, top: 300 },
  { left: 0, top: 300 },
  { left: 400, top: 790 },
  { left: 400, top: 0 },
])('keeps popup within viewport at $left,$top', (anchor) => {
  const position = calculatePopupPosition(
    { ...anchor, width: 30, height: 20 },
    300,
    180,
    1000,
    800,
  );
  expect(position.left).toBeGreaterThanOrEqual(8);
  expect(position.left + 300).toBeLessThanOrEqual(992);
  expect(position.top).toBeGreaterThanOrEqual(8);
  expect(position.top + 180).toBeLessThanOrEqual(792);
});
it('clips scrolled overlay rectangles', () => {
  expect(
    intersectRect(
      { left: 5, top: 5, width: 10, height: 10 },
      { left: 10, top: 10, width: 10, height: 10 },
    ),
  ).toEqual({ left: 10, top: 10, width: 5, height: 5 });
  expect(
    intersectRect(
      { left: 0, top: 0, width: 1, height: 1 },
      { left: 10, top: 10, width: 1, height: 1 },
    ),
  ).toBeUndefined();
});
it('renders messages and suggestions as text, caps suggestions, and closes on Escape', () => {
  const popup = new SuggestionPopup(),
    correction = match('sui', 0, 3);
  correction.replacements = Array.from(
    { length: 8 },
    () => '<img src=x onerror=alert(1)>',
  );
  popup.show(
    correction,
    { left: 10, top: 10, width: 20, height: 20 },
    vi.fn(),
    vi.fn(),
  );
  const root = document.querySelector('[data-correctly-ui]')!.shadowRoot!;
  expect(root.querySelectorAll('button')).toHaveLength(6);
  expect(root.querySelectorAll('script,img')).toHaveLength(0);
  expect(root.textContent).toContain('<script>');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  expect(root.querySelector('[role=dialog]')).toBeNull();
  popup.dispose();
});
describe('Chrome adapters', () => {
  it('creates, updates, hides and routes the native context menu to the clicked frame', async () => {
    const create = vi.fn(),
      update = vi.fn().mockResolvedValue(undefined),
      sendMessage = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('chrome', {
      contextMenus: { create, update },
      tabs: { sendMessage },
      runtime: {},
    });
    createContextMenu();
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ id: MENU_ID, visible: false }),
      expect.any(Function),
    );
    await updateContextMenu('suis');
    expect(update).toHaveBeenLastCalledWith(
      MENU_ID,
      expect.objectContaining({
        title: 'Correctly : Corriger en « suis »',
        visible: true,
      }),
    );
    await updateContextMenu(undefined);
    expect(update).toHaveBeenLastCalledWith(
      MENU_ID,
      expect.objectContaining({ visible: false }),
    );
    await handleContextClick(
      { menuItemId: MENU_ID, frameId: 4, editable: true },
      { id: 2 } as chrome.tabs.Tab,
    );
    expect(sendMessage).toHaveBeenCalledWith(
      2,
      { type: 'apply-context' },
      { frameId: 4 },
    );
    await handleContextClick({ menuItemId: 'other', editable: true }, {
      id: 2,
    } as chrome.tabs.Tab);
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });
  it('stores only normalized settings', async () => {
    const get = vi.fn().mockResolvedValue({ settings: { language: 'en' } }),
      set = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('chrome', { storage: { local: { get, set } } });
    expect((await loadSettings()).language).toBe('en');
    await saveSettings(DEFAULT_SETTINGS);
    expect(set).toHaveBeenCalledWith({ settings: DEFAULT_SETTINGS });
  });
});

it('keeps the whole sentence in a controlled text leaf when correcting ta to ton', () => {
  const text = "salut, c'est moi, ta frere";
  const field = document.createElement('div');
  field.setAttribute('contenteditable', 'true');
  const leaf = document.createElement('span');
  leaf.setAttribute('data-lexical-text', 'true');
  leaf.textContent = text;
  field.append(leaf);
  document.body.append(field);
  const offset = text.indexOf('ta frere');
  const selection = window.getSelection()!;
  selection.setBaseAndExtent(
    leaf.firstChild!,
    offset + 2,
    leaf.firstChild!,
    offset + 2,
  );
  let editorText = text;
  // A controlled editor reconciles the selected DOM text leaf into its model.
  field.addEventListener('input', () => {
    if (selection.anchorNode?.nodeType === Node.TEXT_NODE) {
      editorText = selection.anchorNode.textContent ?? '';
      leaf.textContent = editorText;
    }
  });
  const correction = normalizeMatches(
    {
      matches: [
        {
          offset,
          length: 2,
          message: 'Accord',
          replacements: [{ value: 'ton' }],
          rule: { id: 'AGREEMENT', category: { id: 'GRAMMAR' } },
        },
      ],
    },
    text,
  )[0]!;
  expect(applyReplacement(field, correction, 'ton')).toBe(true);
  expect(editorText).toBe("salut, c'est moi, ton frere");
  expect(getTextFromField(field)).toBe("salut, c'est moi, ton frere");
});

it('refuses a correction crossing controlled text leaves without changing the sentence', () => {
  const field = document.createElement('div');
  field.setAttribute('contenteditable', 'true');
  field.innerHTML =
    "<p>salut, c'est moi, <span>t</span><strong>a</strong> frere</p>";
  document.body.append(field);
  const text = getTextFromField(field);
  const html = field.innerHTML;
  const offset = text.indexOf('ta frere');
  expect(applyReplacement(field, match(text, offset, 2), 'ton')).toBe(false);
  expect(field.innerHTML).toBe(html);
  expect(getTextFromField(field)).toBe(text);
});
