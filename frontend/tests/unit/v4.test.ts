import { afterEach, expect, it, vi } from 'vitest';
import {
  EMPTY_SHORTCUTS,
  SHORTCUT_KEY,
  loadShortcuts,
  saveShortcuts,
  validateShortcuts,
  type ShortcutSettings,
} from '../../src/shared/shortcuts';
import {
  canTransform,
  EditTransaction,
  planSentence,
  planSentenceChoices,
  rangeMatch,
  sentenceAt,
  sentenceContaining,
  shortcutExpansion,
} from '../../src/content/v4-editing';
import { CorrectionController } from '../../src/content/correction-controller';
import { createFieldState } from '../../src/content/field-state';
import { DEFAULT_SETTINGS, normalizeSettings } from '../../src/shared/storage';
import type { CheckResult } from '../../src/correction/correction-types';
import { Application } from '../../src/content/application';
let application: Application | undefined;
const shortcuts: ShortcutSettings = {
  schemaVersion: 1,
  enabled: true,
  shortcuts: [
    {
      id: 'one',
      trigger: 'bjr',
      replacement: 'Bonjour',
      enabled: true,
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: 'two',
      trigger: 'écr',
      replacement: 'Écriture',
      enabled: true,
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: 'three',
      trigger: 'jsp',
      replacement: 'Je ne sais pas',
      enabled: true,
      createdAt: 1,
      updatedAt: 1,
    },
  ],
};
afterEach(() => {
  application?.dispose();
  application = undefined;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it('never applies the first spelling suggestion to a name without an explicit choice', async () => {
  const field = editor("Je m'appelles Moqim. Je sui ici.");
  field.setSelectionRange(1, 1);
  const state = createFieldState(field, 'name');
  const controller = new CorrectionController(
    state,
    DEFAULT_SETTINGS,
    (text) =>
      Promise.resolve<CheckResult>({
        status: 'ready',
        matches: [
          {
            ...rangeMatch(
              text,
              text.indexOf('appelles'),
              text.indexOf('appelles') + 8,
            ),
            id: 'verb',
            category: 'grammar',
            replacements: ['appelle'],
          },
          {
            ...rangeMatch(
              text,
              text.indexOf('Moqim'),
              text.indexOf('Moqim') + 5,
            ),
            id: 'name',
            category: 'spelling',
            replacements: ['Mois', 'Moi'],
          },
        ],
      }),
    () => {},
  );
  await controller.analyze();
  expect(controller.correctSentence(state.matches[0]!)).toBe(false);
  expect(field.value).toBe("Je m'appelles Moqim. Je sui ici.");
  const verb = state.matches.find((m) => m.id === 'verb')!;
  const choices = [{ match: verb, replacement: 'appelle' }];
  expect(controller.sentencePreview(verb, choices)).toBe(
    "Je m'appelle Moqim. ",
  );
  expect(controller.correctSentence(verb, choices)).toBe(true);
  expect(field.value).toBe("Je m'appelle Moqim. Je sui ici.");
  expect(controller.undo()).toBe(true);
  expect(field.value).toBe("Je m'appelles Moqim. Je sui ici.");
  controller.dispose();
});
it('reviews each sentence separately and applies the selected alternative only', async () => {
  const field = editor('Je sui ici. Tu es la.');
  field.setSelectionRange(1, 1);
  const state = createFieldState(field, 'two');
  const controller = new CorrectionController(
    state,
    DEFAULT_SETTINGS,
    (text) =>
      Promise.resolve<CheckResult>({
        status: 'ready',
        matches: [
          {
            ...rangeMatch(text, text.indexOf('sui'), text.indexOf('sui') + 3),
            id: 'one',
            category: 'spelling',
            replacements: ['suis', 'suit'],
          },
          {
            ...rangeMatch(text, text.indexOf('la'), text.indexOf('la') + 2),
            id: 'two',
            category: 'spelling',
            replacements: ['là'],
          },
        ],
      }),
    () => {},
  );
  await controller.analyze();
  const first = state.matches[0]!,
    second = state.matches[1]!;
  const review = controller.sentenceReview(first)!;
  expect(review.matches).toEqual([first]);
  expect(controller.sentenceReview(second)!.matches).toEqual([second]);
  expect(
    controller.sentencePreview(first, [{ match: second, replacement: 'là' }]),
  ).toBeNull();
  expect(
    controller.sentencePreview(first, [
      { match: first, replacement: 'invented' },
    ]),
  ).toBeNull();
  const choices = [{ match: second, replacement: 'là' }];
  expect(controller.sentencePreview(second, choices)).toBe('Tu es là.');
  expect(controller.correctSentence(second, choices)).toBe(true);
  expect(field.value).toBe('Je sui ici. Tu es là.');
  controller.dispose();
});
it('analyzes the second sentence after leaving a first-sentence window at offset zero', async () => {
  vi.useFakeTimers();
  const field = editor('Je sui ici. Tu es la.');
  field.setSelectionRange('Je sui ici.'.length, 'Je sui ici.'.length);
  const state = createFieldState(field, 'window');
  const check = vi.fn((text: string) =>
    Promise.resolve<CheckResult>({
      status: 'ready',
      matches: text.includes('la')
        ? [
            {
              ...rangeMatch(text, text.indexOf('la'), text.indexOf('la') + 2),
              category: 'spelling',
              replacements: ['là'],
            },
          ]
        : [],
    }),
  );
  const controller = new CorrectionController(
    state,
    DEFAULT_SETTINGS,
    check,
    () => {},
  );
  await controller.analyze();
  expect(check).toHaveBeenCalledExactlyOnceWith('Je sui ici.', 'auto');
  field.setSelectionRange(field.value.length, field.value.length);
  controller.selectionChanged();
  await vi.advanceTimersByTimeAsync(DEFAULT_SETTINGS.debounceMs);
  expect(check).toHaveBeenLastCalledWith('Tu es la.', 'auto');
  const second = state.matches[0]!;
  expect(
    controller.sentencePreview(second, [{ match: second, replacement: 'là' }]),
  ).toBe('Tu es là.');
  controller.dispose();
});
it('rejects conflicting and duplicate choices while allowing an explicit alternative', () => {
  const text = 'Je sui ici.';
  const first = { ...rangeMatch(text, 3, 6), replacements: ['suis', 'suit'] };
  const overlapping = { ...rangeMatch(text, 3, 10), replacements: ['suis là'] };
  const review = {
    segment: sentenceAt(text, text.length),
    matches: [first, overlapping],
    unavailableCount: 0,
  };
  expect(
    planSentenceChoices(review, [{ match: first, replacement: 'suit' }]),
  ).toBe('Je suit ici.');
  expect(
    planSentenceChoices(review, [
      { match: first, replacement: 'suis' },
      { match: overlapping, replacement: 'suis là' },
    ]),
  ).toBeNull();
  expect(
    planSentenceChoices(review, [
      { match: first, replacement: 'suis' },
      { match: first, replacement: 'suit' },
    ]),
  ).toBeNull();
});
it('recognizes the non-breaking space inserted by Chromium in a simple contenteditable', () => {
  expect(shortcutExpansion('bjr\u00a0', 4, shortcuts)).toEqual({
    start: 0,
    end: 3,
    replacement: 'Bonjour',
  });
  expect(shortcutExpansion('bjr\t', 4, shortcuts)).toBeNull();
  expect(shortcutExpansion('bjr\n', 4, shortcuts)).toBeNull();
});
it('targets the clicked sentence and refuses truncated manual batches', () => {
  expect(sentenceContaining('Before. Je sui ici. After.', 11)?.text).toBe(
    'Je sui ici. ',
  );
  expect(sentenceContaining('x'.repeat(6000), 10)).toBeNull();
  expect(sentenceContaining('x'.repeat(6000), 5500)).toBeNull();
});
it('explains unsupported and stale sentence reviews without permitting edits', async () => {
  const field = editor('Je sui ici.');
  const state = createFieldState(field, 'reason');
  const controller = new CorrectionController(
    state,
    DEFAULT_SETTINGS,
    (text) =>
      Promise.resolve<CheckResult>({
        status: 'ready',
        matches: [
          {
            ...rangeMatch(text, 3, 6),
            category: 'spelling',
            replacements: ['suis'],
          },
        ],
      }),
    () => {},
  );
  await controller.analyze();
  const match = state.matches[0]!;
  field.value = 'Changed.';
  expect(controller.sentencePreview(match)).toBeNull();
  expect(controller.sentenceUnavailableReason(match)).toContain('périmé');
  expect(
    controller.correctSentence(match, [{ match, replacement: 'suis' }]),
  ).toBe(false);
  field.className = 'ProseMirror';
  expect(controller.sentenceUnavailableReason(match)).toContain(
    'non pris en charge',
  );
  controller.dispose();
});
it('reviews the whole sentence when analysis starts with the caret near its beginning', async () => {
  const field = editor('Je sui ici');
  field.setSelectionRange(1, 1);
  const state = createFieldState(field, 'review');
  const controller = new CorrectionController(
    state,
    DEFAULT_SETTINGS,
    (text) =>
      Promise.resolve<CheckResult>({
        status: 'ready',
        matches: [
          {
            ...rangeMatch(text, 3, 6),
            category: 'spelling',
            replacements: ['suis'],
          },
        ],
      }),
    () => {},
  );
  await controller.analyze();
  const choices = [{ match: state.matches[0]!, replacement: 'suis' }];
  expect(controller.sentencePreview(state.matches[0]!, choices)).toBe(
    'Je suis ici',
  );
  expect(controller.correctSentence(state.matches[0]!, choices)).toBe(true);
  expect(field.value).toBe('Je suis ici');
  controller.dispose();
});
it('keeps valid individual suggestions when clicking inside an analyzed second sentence', async () => {
  const field = editor('Before. Je sui ici.');
  const state = createFieldState(field, 'click');
  const controller = new CorrectionController(
    state,
    DEFAULT_SETTINGS,
    (text) =>
      Promise.resolve<CheckResult>({
        status: 'ready',
        matches: [
          {
            ...rangeMatch(text, 3, 6),
            category: 'spelling',
            replacements: ['suis'],
          },
        ],
      }),
    () => {},
  );
  await controller.analyze();
  const match = state.matches[0]!;
  field.setSelectionRange(12, 12);
  controller.selectionChanged();
  expect(state.matches).toContain(match);
  expect(controller.replaceMatch(match, 'suis')).toBe(true);
  expect(field.value).toBe('Before. Je suis ici.');
  controller.dispose();
});
it.each([' ', ',', '.'])(
  'expands cpg with separator %j in a text input without the engine',
  (separator) => {
    const field = document.createElement('input');
    field.type = 'text';
    document.body.append(field);
    field.focus();
    const state = createFieldState(field, 'input');
    const check = vi
      .fn()
      .mockResolvedValue({ status: 'unavailable', matches: [] });
    const controller = new CorrectionController(
      state,
      { ...DEFAULT_SETTINGS, enabled: false },
      check,
      () => {},
    );
    const settings = {
      ...shortcuts,
      shortcuts: [
        {
          ...shortcuts.shortcuts[0]!,
          trigger: 'cpg',
          replacement: "Ce n'est pas grave",
        },
      ],
    };
    field.value = 'cpg';
    field.setSelectionRange(3, 3);
    controller.typed(
      new InputEvent('input', { inputType: 'insertText', data: 'g' }),
      settings,
    );
    expect(field.value).toBe('cpg');
    field.value += separator;
    field.setSelectionRange(4, 4);
    controller.typed(
      new InputEvent('input', { inputType: 'insertText', data: separator }),
      settings,
    );
    expect(field.value).toBe("Ce n'est pas grave" + separator);
    expect(check).not.toHaveBeenCalled();
    expect(controller.undo()).toBe(true);
    expect(field.value).toBe('cpg' + separator);
    controller.dispose();
  },
);
it.each([true, false])(
  'respects disabled domains independently of backend availability (%s)',
  (disabled) => {
    vi.stubGlobal('chrome', {
      runtime: { sendMessage: vi.fn().mockResolvedValue({ ok: true }) },
    });
    const field = editor('');
    const check = vi
      .fn()
      .mockResolvedValue({ status: 'unavailable', matches: [] });
    application = new Application(
      {
        ...DEFAULT_SETTINGS,
        enabled: false,
        disabledSites: disabled ? [location.hostname] : [],
      },
      check,
      shortcuts,
    );
    application.start();
    field.value = 'bjr ';
    field.setSelectionRange(4, 4);
    field.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: ' ',
      }),
    );
    expect(field.value).toBe(disabled ? 'bjr ' : 'Bonjour ');
    expect(check).not.toHaveBeenCalled();
  },
);
it('does not capture Tab or Enter or expand over a replaced selection', () => {
  vi.stubGlobal('chrome', {
    runtime: { sendMessage: vi.fn().mockResolvedValue({ ok: true }) },
  });
  const field = editor('bjr');
  application = new Application(
    DEFAULT_SETTINGS,
    vi.fn().mockResolvedValue({ status: 'unavailable', matches: [] }),
    shortcuts,
  );
  application.start();
  for (const key of ['Enter', 'Tab'])
    expect(
      field.dispatchEvent(
        new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
      ),
    ).toBe(true);
  field.setSelectionRange(0, 3);
  field.dispatchEvent(
    new InputEvent('beforeinput', {
      bubbles: true,
      inputType: 'insertText',
      data: ' ',
    }),
  );
  field.value = 'bjr ';
  field.setSelectionRange(4, 4);
  field.dispatchEvent(
    new InputEvent('input', {
      bubbles: true,
      inputType: 'insertText',
      data: ' ',
    }),
  );
  expect(field.value).toBe('bjr ');
});
it('expands literal text in a simple rich editor without replacing its text node', () => {
  const field = document.createElement('div');
  field.setAttribute('contenteditable', 'true');
  const leaf = document.createTextNode('bjr ');
  field.append(leaf);
  document.body.append(field);
  field.focus();
  document.getSelection()!.setBaseAndExtent(leaf, 4, leaf, 4);
  const transaction = new EditTransaction();
  const input = vi.fn();
  field.addEventListener('input', input);
  expect(transaction.apply(field, 'bjr ', 0, 3, '<b>Bonjour</b>')).toBe(true);
  expect(field.firstChild).toBe(leaf);
  expect(field.querySelector('b')).toBeNull();
  expect(field.textContent).toBe('<b>Bonjour</b> ');
  expect(input).toHaveBeenCalledTimes(1);
  expect(transaction.undo()).toBe(true);
  expect(field.textContent).toBe('bjr ');
});
it('migrates missing shortcut storage without overwriting legacy preferences', async () => {
  const data: Record<string, unknown> = {
    settings: { customDictionary: ['Example'] },
  };
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: vi.fn(() => Promise.resolve(data)),
        set: vi.fn((value: Record<string, unknown>) => {
          Object.assign(data, value);
          return Promise.resolve();
        }),
      },
    },
  });
  expect(await loadShortcuts()).toEqual(EMPTY_SHORTCUTS);
  await saveShortcuts(shortcuts);
  expect(await loadShortcuts()).toEqual(shortcuts);
  expect(data.settings).toEqual({ customDictionary: ['Example'] });
  expect(data[SHORTCUT_KEY]).toEqual(shortcuts);
});
it('propagates quota and corrupt-storage errors without erasing data', async () => {
  const set = vi.fn().mockRejectedValue(new Error('quota'));
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: vi
          .fn()
          .mockResolvedValue({ [SHORTCUT_KEY]: { schemaVersion: 99 } }),
        set,
      },
    },
  });
  await expect(loadShortcuts()).rejects.toThrow();
  expect(set).not.toHaveBeenCalled();
  await expect(saveShortcuts(shortcuts)).rejects.toThrow('quota');
});
it.each(['', 'two words', 'a.', 'a\n', 'a@', 'x'.repeat(33), '\u0000'])(
  'rejects invalid trigger %j',
  (trigger) => {
    // Trailing whitespace is intentionally trimmed on save.
    if (trigger === 'a\n') trigger = 'a\nb';
    expect(() =>
      validateShortcuts({
        ...shortcuts,
        shortcuts: [{ ...shortcuts.shortcuts[0]!, trigger }],
      }),
    ).toThrow();
  },
);
it('rejects NFC/case duplicates, excessive entries and invalid replacements', () => {
  expect(() =>
    validateShortcuts({
      ...shortcuts,
      shortcuts: [
        shortcuts.shortcuts[1]!,
        { ...shortcuts.shortcuts[1]!, id: 'duplicate', trigger: 'E\u0301CR' },
      ],
    }),
  ).toThrow('existe');
  expect(() =>
    validateShortcuts({
      ...shortcuts,
      shortcuts: Array.from({ length: 501 }, () => shortcuts.shortcuts[0]!),
    }),
  ).toThrow();
  for (const replacement of ['', 'x'.repeat(2001), '\u0000'])
    expect(() =>
      validateShortcuts({
        ...shortcuts,
        shortcuts: [{ ...shortcuts.shortcuts[0]!, replacement }],
      }),
    ).toThrow();
});
it.each(['bjr ', 'bjr,', 'bjr.', 'BJr!', '(bjr;', 'hi bjr '])(
  'expands exact token once: %s',
  (text) => {
    const edit = shortcutExpansion(text, text.length, shortcuts)!;
    expect(
      text.slice(0, edit.start) + edit.replacement + text.slice(edit.end),
    ).toBe(text.replace(/bjr/iu, 'Bonjour'));
  },
);
it.each(['abjr ', 'https://bjr.', 'user@bjr ', 'bjr', 'x'.repeat(40) + 'bjr '])(
  'does not expand partial/code tokens %s',
  (text) => {
    expect(shortcutExpansion(text, text.length, shortcuts)).toBeNull();
  },
);
it('handles Unicode, multiple words and both disable switches', () => {
  expect(shortcutExpansion('E\u0301CR ', 5, shortcuts)?.replacement).toBe(
    'Écriture',
  );
  expect(shortcutExpansion('jsp ', 4, shortcuts)?.replacement).toBe(
    'Je ne sais pas',
  );
  expect(
    shortcutExpansion('bjr ', 4, { ...shortcuts, enabled: false }),
  ).toBeNull();
  expect(
    shortcutExpansion('bjr ', 4, {
      ...shortcuts,
      shortcuts: [{ ...shortcuts.shortcuts[0]!, enabled: false }],
    }),
  ).toBeNull();
});
it.each(['Hello world.', 'Une phrase !', 'Hello world? ', 'Une phrase…'])(
  'recognizes complete sentence %s',
  (text) => expect(sentenceAt(text, text.length).complete).toBe(true),
);
it.each([
  'Writing unfinished',
  'Dr.',
  'M. ',
  'Value 3.14.',
  'https://example.com.',
  'email@example.com.',
  'Wait...',
  '`code`.',
])('abstains on incomplete or ambiguous sentence %s', (text) =>
  expect(sentenceAt(text, text.length).complete).toBe(false),
);
it('isolates the latest sentence and bounds long input', () => {
  expect(sentenceAt('First sentence. Next sentence.', 30).text).toBe(
    'Next sentence.',
  );
  expect(sentenceAt('x'.repeat(20000), 20000).text.length).toBe(5000);
});
it('plans multiple replacements without offset shifts, rejects conflicts and ambiguous auto', () => {
  const text = 'Je sui la.';
  const first = {
    ...rangeMatch(text, 3, 6),
    replacements: ['suis'],
    ruleId: 'SPELL',
  };
  const second = {
    ...rangeMatch(text, 7, 9),
    replacements: ['là'],
    ruleId: 'SPELL',
  };
  const segment = sentenceAt(text, text.length);
  expect(planSentence(segment, [second, first], false)).toBe('Je suis là.');
  expect(
    planSentence(segment, [first, { ...first, offset: 4 }], false),
  ).toBeNull();
  expect(planSentence(segment, [first], true)).toBeNull();
  expect(
    planSentence(
      segment,
      [{ ...first, ruleId: 'WHITESPACE_RULE', replacements: ['a', 'b'] }],
      true,
    ),
  ).toBeNull();
});
function editor(value: string) {
  const field = document.createElement('textarea');
  document.body.append(field);
  field.value = value;
  field.focus();
  field.setSelectionRange(value.length, value.length);
  return field;
}
it('applies one atomic input event, preserves neighbors/caret/scroll and offers guarded Undo', () => {
  const field = editor('Before. bjr After.');
  field.setSelectionRange(12, 12);
  field.scrollTop = 42;
  const input = vi.fn();
  field.addEventListener('input', input);
  const transaction = new EditTransaction();
  expect(transaction.apply(field, field.value, 8, 11, 'Bonjour')).toBe(true);
  expect(field.value).toBe('Before. Bonjour After.');
  expect(field.selectionStart).toBe(16);
  expect(field.scrollTop).toBe(42);
  expect(input).toHaveBeenCalledTimes(1);
  expect(transaction.undo()).toBe(true);
  expect(field.value).toBe('Before. bjr After.');
  expect(transaction.undo()).toBe(false);
});
it('rejects stale text, selection, canceled beforeinput and changed undo', () => {
  const field = editor('bjr '),
    transaction = new EditTransaction();
  expect(transaction.apply(field, 'old', 0, 3, 'Bonjour')).toBe(false);
  field.setSelectionRange(0, 3);
  expect(transaction.apply(field, field.value, 0, 3, 'Bonjour')).toBe(false);
  field.setSelectionRange(4, 4);
  field.addEventListener('beforeinput', (event) => event.preventDefault(), {
    once: true,
  });
  expect(transaction.apply(field, field.value, 0, 3, 'Bonjour')).toBe(false);
  expect(transaction.apply(field, field.value, 0, 3, 'Bonjour')).toBe(true);
  field.value += 'changed';
  expect(transaction.undo()).toBe(false);
});
it.each(['password', 'email', 'search', 'url', 'number', 'tel'])(
  'excludes input type %s',
  (type) => {
    const field = document.createElement('input');
    field.type = type;
    document.body.append(field);
    expect(canTransform(field)).toBe(false);
  },
);
it('protects disabled, readonly, OTP and structured rich editors', () => {
  const single = document.createElement('input');
  single.value = 'bjr ';
  document.body.append(single);
  expect(
    new EditTransaction().apply(single, single.value, 0, 3, 'Bonjour\nmonde'),
  ).toBe(false);
  expect(single.value).toBe('bjr ');
  expect(shortcutExpansion('bjr\n', 4, shortcuts)).toBeNull();
  expect(shortcutExpansion('bjr\t', 4, shortcuts)).toBeNull();
  const field = editor('bjr ');
  field.readOnly = true;
  expect(canTransform(field)).toBe(false);
  field.readOnly = false;
  field.disabled = true;
  expect(canTransform(field)).toBe(false);
  field.disabled = false;
  field.autocomplete = 'one-time-code';
  expect(canTransform(field)).toBe(false);
  const rich = document.createElement('div');
  rich.setAttribute('contenteditable', 'true');
  rich.innerHTML = '<b>bjr</b> ';
  document.body.append(rich);
  expect(canTransform(rich)).toBe(false);
  expect(rich.innerHTML).toBe('<b>bjr</b> ');
});
it('expands without the server and never expands paste or composition', () => {
  vi.useFakeTimers();
  const field = editor('bjr '),
    state = createFieldState(field, 'one');
  const check = vi
    .fn()
    .mockResolvedValue({ status: 'unavailable', matches: [] });
  const controller = new CorrectionController(
    state,
    DEFAULT_SETTINGS,
    check,
    () => {},
  );
  controller.typed(
    new InputEvent('input', { inputType: 'insertFromPaste', data: ' ' }),
    shortcuts,
  );
  expect(field.value).toBe('bjr ');
  state.composing = true;
  controller.typed(
    new InputEvent('input', { inputType: 'insertText', data: ' ' }),
    shortcuts,
  );
  expect(field.value).toBe('bjr ');
  state.composing = false;
  controller.typed(
    new InputEvent('input', { inputType: 'insertText', data: ' ' }),
    shortcuts,
  );
  expect(field.value).toBe('Bonjour ');
  expect(check).not.toHaveBeenCalled();
  controller.dispose();
});
it('ignores late responses after edit or disposal', async () => {
  const field = editor('Hello world.');
  let resolve!: (result: CheckResult) => void;
  const state = createFieldState(field, 'one');
  const controller = new CorrectionController(
    state,
    DEFAULT_SETTINGS,
    () =>
      new Promise((done) => {
        resolve = done;
      }),
    () => {},
  );
  const request = controller.analyze();
  field.value = 'Changed.';
  controller.changed();
  resolve({
    status: 'ready',
    matches: [
      { ...rangeMatch('Hello world.', 0, 5), replacements: ['Goodbye'] },
    ],
  });
  await request;
  expect(state.matches).toEqual([]);
  expect(field.value).toBe('Changed.');
  controller.dispose();
});
it('auto-applies a safe completed sentence once and supports explicit sentence review', async () => {
  const field = editor('Hello  world.');
  const state = createFieldState(field, 'one');
  const check = vi.fn((text: string): Promise<CheckResult> =>
    Promise.resolve({
      status: 'ready',
      matches: [
        {
          ...rangeMatch(text, 5, 7),
          category: 'grammar',
          ruleId: 'WHITESPACE_RULE',
          replacements: [' '],
        },
      ],
    }),
  );
  const controller = new CorrectionController(
    state,
    DEFAULT_SETTINGS,
    check,
    () => {},
  );
  const events = vi.fn();
  field.addEventListener('input', events);
  controller.typed(
    new InputEvent('input', { inputType: 'insertText', data: '.' }),
    shortcuts,
  );
  await controller.analyze();
  expect(field.value).toBe('Hello world.');
  expect(events).toHaveBeenCalledTimes(1);
  expect(controller.undo()).toBe(true);
  controller.dispose();
});
it('migrates sentence preference without losing dictionary/sites', () => {
  const settings = normalizeSettings({
    customDictionary: ['Example'],
    disabledSites: ['example.com'],
  });
  expect(settings.sentenceCorrection).toBe(true);
  expect(settings.customDictionary).toEqual(['Example']);
  expect(settings.disabledSites).toEqual(['example.com']);
});
it('merges independent options edits and rejects concurrent changes to the same entry', async () => {
  const data: Record<string, unknown> = {
    [SHORTCUT_KEY]: structuredClone(shortcuts),
  };
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: vi.fn(() => Promise.resolve(data)),
        set: vi.fn((value: Record<string, unknown>) => {
          Object.assign(data, value);
          return Promise.resolve();
        }),
      },
    },
  });
  const second = structuredClone(shortcuts);
  second.shortcuts[1]!.replacement = 'Remote';
  await saveShortcuts(second, shortcuts);
  const first = structuredClone(shortcuts);
  first.shortcuts[0]!.replacement = 'Local';
  const merged = await saveShortcuts(first, shortcuts);
  expect(merged.shortcuts.find((s) => s.id === 'two')?.replacement).toBe(
    'Remote',
  );
  expect(merged.shortcuts.find((s) => s.id === 'one')?.replacement).toBe(
    'Local',
  );
  await expect(saveShortcuts(first, shortcuts)).rejects.toThrow(
    'autre fenêtre',
  );
});
it('compares stored shortcut values independently of serialized property order', async () => {
  const expected = structuredClone(shortcuts);
  const stored = {
    ...shortcuts,
    shortcuts: shortcuts.shortcuts.map((s) => ({
      updatedAt: s.updatedAt,
      replacement: s.replacement,
      id: s.id,
      enabled: s.enabled,
      trigger: s.trigger,
      createdAt: s.createdAt,
    })),
  };
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({ [SHORTCUT_KEY]: stored }),
        set: vi.fn().mockResolvedValue(undefined),
      },
    },
  });
  const next = structuredClone(expected);
  next.shortcuts[0]!.enabled = false;
  expect(
    (await saveShortcuts(next, expected)).shortcuts.find((s) => s.id === 'one')
      ?.enabled,
  ).toBe(false);
});
it('expands first, checks the new sentence, and performs at most one further sentence edit', async () => {
  const field = editor('bjr.'),
    state = createFieldState(field, 'one');
  const check = vi.fn((text: string): Promise<CheckResult> =>
    Promise.resolve({
      status: 'ready',
      matches: [
        {
          ...rangeMatch(text, 7, 9),
          category: 'grammar',
          ruleId: 'CONSECUTIVE_SPACES',
          replacements: [' '],
        },
      ],
    }),
  );
  const controller = new CorrectionController(
    state,
    DEFAULT_SETTINGS,
    check,
    () => {},
  );
  const events = vi.fn();
  field.addEventListener('input', events);
  controller.typed(
    new InputEvent('input', { inputType: 'insertText', data: '.' }),
    {
      ...shortcuts,
      shortcuts: [
        { ...shortcuts.shortcuts[0]!, replacement: 'Bonjour  monde' },
      ],
    },
  );
  controller.changed();
  await controller.analyze();
  expect(check).toHaveBeenCalledWith('Bonjour  monde.', 'auto');
  expect(field.value).toBe('Bonjour monde.');
  expect(events).toHaveBeenCalledTimes(2);
  controller.dispose();
});
it('never automatically changes non-whitespace content or a truncated sentence', () => {
  const text = 'Hello world.';
  expect(
    planSentence(
      sentenceAt(text, text.length),
      [
        {
          ...rangeMatch(text, 0, 5),
          ruleId: 'WHITESPACE_RULE',
          replacements: ['Changed'],
        },
      ],
      true,
    ),
  ).toBeNull();
  const long = 'word '.repeat(2000) + 'end.';
  expect(sentenceAt(long, long.length).complete).toBe(false);
});
it('offers a preview for ambiguous manual suggestions and applies the displayed batch only', async () => {
  const field = editor('Before. Je sui ici.');
  const state = createFieldState(field, 'one');
  const check = (text: string): Promise<CheckResult> =>
    Promise.resolve({
      status: 'ready',
      matches: [
        {
          ...rangeMatch(text, 3, 6),
          category: 'spelling',
          replacements: ['suis', 'suit'],
        },
      ],
    });
  const controller = new CorrectionController(
    state,
    DEFAULT_SETTINGS,
    check,
    () => {},
  );
  await controller.analyze();
  expect(field.value).toBe('Before. Je sui ici.');
  const match = state.matches[0]!;
  const choices = [{ match, replacement: 'suis' }];
  expect(controller.sentencePreview(match, choices)).toBe('Je suis ici.');
  const events = vi.fn();
  field.addEventListener('input', events);
  expect(controller.correctSentence(match, choices)).toBe(true);
  expect(field.value).toBe('Before. Je suis ici.');
  expect(events).toHaveBeenCalledTimes(1);
  controller.dispose();
});
it('does not auto-edit on pause, selected replacement, shifted selection or disposed requests', async () => {
  const field = editor('Hello  world.');
  const state = createFieldState(field, 'one');
  let done!: (value: CheckResult) => void;
  const check = () =>
    new Promise<CheckResult>((resolve) => {
      done = resolve;
    });
  const controller = new CorrectionController(
    state,
    DEFAULT_SETTINGS,
    check,
    () => {},
  );
  const result: CheckResult = {
    status: 'ready',
    matches: [
      {
        ...rangeMatch(field.value, 5, 7),
        category: 'grammar',
        ruleId: 'WHITESPACE_RULE',
        replacements: [' '],
      },
    ],
  };
  let pending = controller.analyze();
  done(result);
  await pending;
  expect(field.value).toBe('Hello  world.');
  controller.typed(
    new InputEvent('input', { inputType: 'insertText', data: '.' }),
    shortcuts,
    true,
  );
  pending = controller.analyze();
  done(result);
  await pending;
  expect(field.value).toBe('Hello  world.');
  controller.typed(
    new InputEvent('input', { inputType: 'insertText', data: '.' }),
    shortcuts,
  );
  pending = controller.analyze();
  field.setSelectionRange(0, 0);
  controller.selectionChanged();
  done(result);
  await pending;
  expect(field.value).toBe('Hello  world.');
  field.setSelectionRange(field.value.length, field.value.length);
  controller.typed(
    new InputEvent('input', { inputType: 'insertText', data: '.' }),
    shortcuts,
  );
  pending = controller.analyze();
  controller.dispose();
  done(result);
  await pending;
  expect(field.value).toBe('Hello  world.');
});
