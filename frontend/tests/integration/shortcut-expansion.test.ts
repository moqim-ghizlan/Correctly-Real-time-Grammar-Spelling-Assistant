import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ShortcutExpander, toPageConfig } from '../../src/content/shortcuts';

const ENTRIES = [
  { trigger: 'bjr', replacement: 'Bonjour' },
  { trigger: 'sig', replacement: 'Best regards,\nAlex' },
];
let expander: ShortcutExpander;
let fetchSpy: ReturnType<typeof vi.fn>;

/** Simulates the browser state right after the user typed `char` at the caret. */
function type(field: HTMLInputElement | HTMLTextAreaElement, char: string) {
  const caret = field.selectionStart ?? field.value.length;
  field.value = field.value.slice(0, caret) + char + field.value.slice(caret);
  field.setSelectionRange(caret + char.length, caret + char.length);
  return expander.typed(field, 'insertText', char, false);
}

function field(html = '<textarea></textarea>', value = '') {
  document.body.innerHTML = html;
  const el = document.body.firstElementChild as HTMLTextAreaElement;
  el.value = value;
  el.focus();
  el.setSelectionRange(value.length, value.length);
  return el;
}

beforeEach(() => {
  fetchSpy = vi.fn();
  vi.stubGlobal('fetch', fetchSpy);
  expander?.dispose();
  expander = new ShortcutExpander(document, () =>
    Promise.resolve({
      smartButton: false,
      locale: 'en' as const,
      keybindings: {},
      handleY: 0.5,
      shortcuts: ENTRIES,
    }),
  );
  expander.setShortcuts(ENTRIES);
});

describe('2.1/I01: local expansion, zero network', () => {
  it('bjr + space → "Bonjour " with the caret after the space', () => {
    const el = field();
    for (const char of 'bjr') type(el, char);
    expect(type(el, ' ')).toBe(true);
    expect(el.value).toBe('Bonjour ');
    expect(el.selectionStart).toBe(8);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('expands in the middle of text, keeps punctuation and following text', () => {
    const el = field('<input type="text">', 'Salut  et merci');
    el.setSelectionRange(6, 6);
    for (const char of 'bjr') type(el, char);
    type(el, ',');
    expect(el.value).toBe('Salut bjr, et merci'.replace('bjr', 'Bonjour'));
    expect(el.selectionStart).toBe('Salut Bonjour,'.length);
  });

  it('multiline replacement and one input event for frameworks', () => {
    const el = field();
    const events = vi.fn();
    el.addEventListener('input', events);
    for (const char of 'sig') type(el, char);
    type(el, '.');
    expect(el.value).toBe('Best regards,\nAlex.');
    expect(events).toHaveBeenCalledTimes(1);
  });
});

describe('I03/I05/I06: never expand when unsafe', () => {
  it('partial words, missing separator and Tab/Enter', () => {
    const el = field('<textarea></textarea>', 'abjr');
    expect(type(el, ' ')).toBe(false);
    expect(el.value).toBe('abjr ');
    const other = field('<textarea></textarea>', 'bjr');
    expect(type(other, '\t')).toBe(false);
    expect(type(other, '\n')).toBe(false);
  });

  it('paste, drop, undo, composition and multi-character input are ignored', () => {
    const el = field('<textarea></textarea>', 'bjr ');
    for (const inputType of [
      'insertFromPaste',
      'insertFromDrop',
      'historyUndo',
      'insertReplacementText',
    ])
      expect(expander.typed(el, inputType, ' ', false)).toBe(false);
    expect(expander.typed(el, 'insertText', ' ', true)).toBe(false);
    expect(expander.typed(el, 'insertText', 'r ', false)).toBe(false);
    expect(el.value).toBe('bjr ');
  });

  it('synthetic (page-script) input events never expand', () => {
    const el = field('<textarea></textarea>', 'bjr ');
    el.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: ' ',
      }),
    );
    expect(el.value).toBe('bjr ');
  });

  it('password, payment, OTP, read-only, code editors and email fields are excluded', () => {
    for (const html of [
      '<input type="password">',
      '<input type="email">',
      '<input type="text" name="card-number">',
      '<input type="text" autocomplete="one-time-code">',
      '<textarea readonly></textarea>',
      '<div class="monaco-editor"><textarea></textarea></div>',
      '<div class="CodeMirror"><textarea></textarea></div>',
    ]) {
      document.body.innerHTML = html;
      const el = document.querySelector(
        'input, textarea',
      ) as HTMLTextAreaElement;
      el.value = 'bjr ';
      el.focus();
      try {
        el.setSelectionRange(4, 4);
      } catch {
        // email inputs have no selection API; eligibility is checked first.
      }
      const before = el.value; // email inputs sanitize their value
      expect(expander.typed(el, 'insertText', ' ', false)).toBe(false);
      expect(el.value).toBe(before);
    }
  });

  it('a field that is not the focused one, or with a selection, is left alone', () => {
    const el = field('<textarea></textarea>', 'bjr ');
    el.setSelectionRange(0, 4);
    expect(expander.typed(el, 'insertText', ' ', false)).toBe(false);
    el.blur();
    el.setSelectionRange(4, 4);
    expect(expander.typed(el, 'insertText', ' ', false)).toBe(false);
  });

  it('2.4: a refreshed dictionary without the entry stops expanding', async () => {
    expander.dispose();
    let entries = ENTRIES;
    expander = new ShortcutExpander(document, () =>
      Promise.resolve({
        smartButton: false,
        locale: 'en' as const,
        keybindings: {},
        handleY: 0.5,
        shortcuts: entries,
      }),
    );
    entries = [];
    expander.refresh();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const el = field('<textarea></textarea>', 'bjr');
    expect(type(el, ' ')).toBe(false);
  });
});

describe('toPageConfig', () => {
  it('keeps only well-formed pairs from the worker reply', () => {
    expect(
      toPageConfig({
        smartButton: 'yes',
        shortcuts: [
          { trigger: 'bjr', replacement: 'Bonjour', extra: 1 },
          { trigger: 1, replacement: 'x' },
          null,
        ],
      }),
    ).toEqual({
      smartButton: false,
      locale: 'en' as const,
      keybindings: {},
      handleY: 0.5,
      shortcuts: [{ trigger: 'bjr', replacement: 'Bonjour' }],
    });
    expect(toPageConfig(undefined)).toEqual({
      smartButton: false,
      locale: 'en' as const,
      keybindings: {},
      handleY: 0.5,
      shortcuts: [],
    });
  });

  it('V5.11: keeps a valid handle position, clamps or resets bad ones', () => {
    expect(toPageConfig({ handleY: 0.2 }).handleY).toBe(0.2);
    expect(toPageConfig({ handleY: 7 }).handleY).toBe(1);
    expect(toPageConfig({ handleY: 'x' }).handleY).toBe(0.5);
  });
});
