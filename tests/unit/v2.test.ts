import { afterEach, expect, it, vi } from 'vitest';
import {
  findEditableElement,
  getEditableRoot,
} from '../../src/content/field-detector';
import { analysisWindow } from '../../src/content/analysis-window';
import { Application } from '../../src/content/application';
import { DEFAULT_SETTINGS } from '../../src/shared/storage';
import { CorrectionController } from '../../src/content/correction-controller';
import { createFieldState } from '../../src/content/field-state';
let app: Application | undefined;
afterEach(() => {
  app?.dispose();
  app = undefined;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it('normalizes nested plaintext editors and rejects noneditable islands', () => {
  document.body.innerHTML =
    '<div contenteditable="plaintext-only"><p><span>hello</span></p><div contenteditable="false">private</div></div>';
  const root = document.body.firstElementChild!;
  expect(getEditableRoot(root.querySelector('span')!.firstChild!)).toBe(root);
  expect(
    getEditableRoot(
      root.querySelector('[contenteditable="false"]')!.firstChild!,
    ),
  ).toBeNull();
});
it.each(['password', 'number', 'checkbox', 'file', 'date'])(
  'rejects %s fields',
  (type) => {
    const field = document.createElement('input');
    field.type = type;
    document.body.append(field);
    expect(getEditableRoot(field)).toBeNull();
  },
);
it('rejects hidden fields and Correctly UI across shadow boundaries', () => {
  const host = document.createElement('div');
  host.dataset.correctlyUi = '';
  document.body.append(host);
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = '<textarea></textarea>';
  expect(getEditableRoot(shadow.firstChild!)).toBeNull();
  document.body.innerHTML = '<div hidden><textarea></textarea></div>';
  expect(getEditableRoot(document.querySelector('textarea')!)).toBeNull();
});
it('discovers open shadow editors from composed events, without scanning', () => {
  vi.stubGlobal('chrome', {
    runtime: { sendMessage: vi.fn().mockResolvedValue({ ok: true }) },
  });
  const host = document.createElement('div');
  document.body.append(host);
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = '<textarea></textarea>';
  const field = shadow.querySelector('textarea')!;
  app = new Application(DEFAULT_SETTINGS, () =>
    Promise.resolve({ status: 'ready', matches: [] }),
  );
  app.start();
  expect(app.getState(field)).toBeUndefined();
  let detected: unknown;
  document.addEventListener(
    'input',
    (event) => {
      detected = findEditableElement(event);
    },
    { once: true, capture: true },
  );
  field.value = 'hello';
  field.dispatchEvent(
    new InputEvent('input', { bubbles: true, composed: true }),
  );
  expect(detected).toBe(field);
  expect(app.getState(field)?.currentText).toBe('hello');
});
it('uses the caret paragraph in a large document and translates result offsets', async () => {
  const field = document.createElement('textarea');
  field.value = 'a'.repeat(5100) + '\nwrong word';
  document.body.append(field);
  field.setSelectionRange(5104, 5104);
  const check = vi.fn().mockResolvedValue({
    status: 'ready',
    matches: [
      {
        id: '1',
        offset: 0,
        length: 5,
        originalFragment: 'wrong',
        sourceText: 'wrong word',
        category: 'spelling',
        replacements: ['right'],
      },
    ],
  });
  const state = createFieldState(field, '1');
  const controller = new CorrectionController(
    state,
    DEFAULT_SETTINGS,
    check,
    () => {},
  );
  await controller.analyze();
  expect(check).toHaveBeenCalledWith('wrong word', 'auto');
  expect(state.matches[0]?.offset).toBe(5101);
  expect(state.matches[0]?.sourceText).toBe(field.value);
  controller.dispose();
});
it('bounds a single oversized paragraph around the caret', () => {
  const text = 'a'.repeat(12000),
    window = analysisWindow(text, 9000);
  expect(window.text.length).toBeLessThanOrEqual(5000);
  expect(window.offset).toBeLessThan(9000);
  expect(window.offset + window.text.length).toBeGreaterThan(9000);
});

it('uses browser insertion to replace a match spanning inline text leaves', async () => {
  const { applyReplacement } = await import('../../src/content/replacement');
  const { getTextFromField } = await import('../../src/content/text-extractor');
  const field = document.createElement('div');
  field.setAttribute('contenteditable', 'true');
  field.innerHTML = '<span>wr</span><b>ong</b> word';
  document.body.append(field);
  const exec = vi.fn((_command: string, _ui: boolean, value: string) => {
    const range = document.getSelection()!.getRangeAt(0);
    range.deleteContents();
    range.insertNode(document.createTextNode(value));
    return true;
  });
  Object.defineProperty(document, 'execCommand', {
    configurable: true,
    value: exec,
  });
  try {
    expect(
      applyReplacement(
        field,
        {
          id: '1',
          offset: 0,
          length: 5,
          originalFragment: 'wrong',
          sourceText: 'wrong word',
          category: 'spelling',
          replacements: ['right'],
          message: '',
          ruleId: '',
        },
        'right',
      ),
    ).toBe(true);
    expect(exec).toHaveBeenCalledWith('insertText', false, 'right');
    expect(getTextFromField(field)).toBe('right word');
  } finally {
    Reflect.deleteProperty(document, 'execCommand');
  }
});

it('invalidates a pending large-text response when the caret moves to another paragraph', async () => {
  vi.useFakeTimers();
  const field = document.createElement('textarea');
  field.value = 'a'.repeat(5100) + '\nfirst\nsecond';
  document.body.append(field);
  field.setSelectionRange(5102, 5102);
  let resolve!: (value: { status: 'ready'; matches: [] }) => void;
  const check = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    )
    .mockResolvedValue({ status: 'ready', matches: [] });
  const state = createFieldState(field, '1');
  const controller = new CorrectionController(
    state,
    DEFAULT_SETTINGS,
    check,
    () => {},
  );
  const pending = controller.analyze();
  field.setSelectionRange(5108, 5108);
  controller.selectionChanged();
  resolve({ status: 'ready', matches: [] });
  await pending;
  expect(state.sourceText).toBe('');
  await vi.advanceTimersByTimeAsync(DEFAULT_SETTINGS.debounceMs);
  expect(check).toHaveBeenLastCalledWith('second', 'auto');
  controller.dispose();
});

it('keeps the start of a large text beginning with a newline inside bounds', () => {
  expect(analysisWindow('\n' + 'a'.repeat(6000), 0)).toEqual({
    text: '',
    offset: 0,
  });
});
it('maps text-node starts after synthetic paragraph separators', async () => {
  const { createEditorAdapter } =
    await import('../../src/content/editor-adapter');
  const field = document.createElement('div');
  field.setAttribute('contenteditable', 'true');
  field.innerHTML = '<p>first</p><p>second</p>';
  document.body.append(field);
  const node = field.children[1]!.firstChild!;
  document.getSelection()!.setBaseAndExtent(node, 0, node, 0);
  expect(createEditorAdapter(field).getSelection()).toEqual({
    start: 6,
    end: 6,
  });
});
it('rejects transparent and inert editors', () => {
  document.body.innerHTML =
    '<div style="opacity:0"><textarea></textarea></div><div inert><input></div>';
  expect(getEditableRoot(document.querySelector('textarea')!)).toBeNull();
  expect(getEditableRoot(document.querySelector('input')!)).toBeNull();
});
it('refuses stale replacement after a field becomes readonly', async () => {
  const { applyReplacement } = await import('../../src/content/replacement');
  const { normalizeMatches } =
    await import('../../src/correction/languagetool-client');
  const field = document.createElement('textarea');
  field.value = 'sui';
  document.body.append(field);
  const match = normalizeMatches(
    {
      matches: [
        {
          offset: 0,
          length: 3,
          message: '',
          replacements: [{ value: 'suis' }],
          rule: { id: 'TEST', category: { id: 'TYPOS' } },
        },
      ],
    },
    'sui',
  )[0]!;
  field.readOnly = true;
  expect(applyReplacement(field, match, 'suis')).toBe(false);
  expect(field.value).toBe('sui');
});
it('does not dispatch a duplicate input when browser insertion already delivered it', async () => {
  const { applyReplacement } = await import('../../src/content/replacement');
  const field = document.createElement('div');
  field.setAttribute('contenteditable', 'true');
  field.textContent = 'sui';
  document.body.append(field);
  const listener = vi.fn();
  field.addEventListener('input', listener);
  Object.defineProperty(document, 'execCommand', {
    configurable: true,
    value: () => {
      field.firstChild!.textContent = 'suis';
      field.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          inputType: 'insertText',
          data: 'suis',
        }),
      );
      return true;
    },
  });
  try {
    expect(
      applyReplacement(
        field,
        {
          id: '1',
          offset: 0,
          length: 3,
          originalFragment: 'sui',
          sourceText: 'sui',
          category: 'spelling',
          replacements: ['suis'],
          message: '',
          ruleId: '',
        },
        'suis',
      ),
    ).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
  } finally {
    Reflect.deleteProperty(document, 'execCommand');
  }
});

it.each(['native', 'rich'] as const)(
  'respects canceled replacement beforeinput in %s editors',
  async (type) => {
    const { applyReplacement } = await import('../../src/content/replacement');
    const field =
      type === 'native'
        ? document.createElement('textarea')
        : document.createElement('div');
    if (field instanceof HTMLTextAreaElement) field.value = 'sui';
    else {
      field.setAttribute('contenteditable', 'true');
      field.textContent = 'sui';
    }
    document.body.append(field);
    field.addEventListener('beforeinput', (event) => event.preventDefault());
    if (type === 'rich')
      Object.defineProperty(document, 'execCommand', {
        configurable: true,
        value: () => {
          field.dispatchEvent(
            new InputEvent('beforeinput', { cancelable: true, bubbles: true }),
          );
          return false;
        },
      });
    try {
      expect(
        applyReplacement(
          field,
          {
            id: '1',
            offset: 0,
            length: 3,
            originalFragment: 'sui',
            sourceText: 'sui',
            category: 'spelling',
            replacements: ['suis'],
            message: '',
            ruleId: '',
          },
          'suis',
        ),
      ).toBe(false);
      expect(
        field instanceof HTMLTextAreaElement ? field.value : field.textContent,
      ).toBe('sui');
    } finally {
      if (type === 'rich') Reflect.deleteProperty(document, 'execCommand');
    }
  },
);
