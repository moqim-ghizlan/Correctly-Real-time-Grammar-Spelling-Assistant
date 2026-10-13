import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Application } from '../../src/content/application';
import { DEFAULT_SETTINGS } from '../../src/shared/storage';
import { normalizeMatches } from '../../src/correction/languagetool-client';
import { getTextFromField } from '../../src/content/text-extractor';
import type { CheckResult } from '../../src/correction/correction-types';
let application: Application | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('chrome', {
    runtime: { sendMessage: vi.fn().mockResolvedValue({ ok: true }) },
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      if (this.style.position === 'fixed' && this.style.width)
        return new DOMRect(
          parseFloat(this.style.left) || 0,
          parseFloat(this.style.top) || 0,
          parseFloat(this.style.width) || 0,
          parseFloat(this.style.height) || 0,
        );
      return new DOMRect(20, 20, 300, 100);
    },
  );
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(300);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(100);
  Object.defineProperty(Range.prototype, 'getClientRects', {
    configurable: true,
    value: () => [new DOMRect(45, 25, 30, 20)] as unknown as DOMRectList,
  });
});
afterEach(() => {
  application?.dispose();
  application = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});
function check(text: string): Promise<CheckResult> {
  return Promise.resolve({
    status: 'ready',
    matches: normalizeMatches(
      {
        matches: [
          {
            offset: 3,
            length: 3,
            message: 'Orthographe',
            replacements: [{ value: 'suis' }],
            rule: { id: 'SPELL', category: { id: 'TYPOS' } },
          },
        ],
      },
      text,
    ),
  });
}
it.each(['textarea', 'input', 'contenteditable'])(
  'runs input → debounce → annotation → suggestion → replacement for %s',
  async (type) => {
    const field =
      type === 'contenteditable'
        ? document.createElement('div')
        : document.createElement(type);
    if (type === 'contenteditable')
      field.setAttribute('contenteditable', 'true');
    document.body.append(field);
    const checker = vi.fn(check);
    application = new Application(DEFAULT_SETTINGS, checker);
    application.start();
    if (
      field instanceof HTMLInputElement ||
      field instanceof HTMLTextAreaElement
    )
      field.value = 'je sui ici';
    else field.textContent = 'je sui ici';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(DEFAULT_SETTINGS.debounceMs - 1);
    expect(checker).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(checker).toHaveBeenCalledTimes(1);
    expect(getTextFromField(field)).toBe('je sui ici');
    expect(application.getState(field)?.matches).toHaveLength(1);
    expect(application.getHighlighter(field)?.annotations).toHaveLength(1);
    field.dispatchEvent(
      new MouseEvent('click', { bubbles: true, clientX: 50, clientY: 30 }),
    );
    const panel = [...document.querySelectorAll('[data-correctly-ui]')]
      .map((host) => host.shadowRoot?.querySelector('[role=dialog]'))
      .find(Boolean)!;
    (panel.querySelector('button') as HTMLButtonElement).click();
    expect(getTextFromField(field)).toBe('je suis ici');
    expect(document.querySelector('textarea,input,[contenteditable]')).toBe(
      field,
    );
  },
);
it('switches active editors, discovers later fields on interaction and disposes removals', async () => {
  document.body.innerHTML =
    '<textarea></textarea><input><div contenteditable="true"></div>';
  application = new Application(DEFAULT_SETTINGS, check);
  application.start();
  const a = document.querySelector('textarea')!,
    b = document.querySelector('input')!;
  a.value = 'je sui ici';
  b.value = 'je sui ici';
  a.dispatchEvent(new Event('input'));
  await vi.advanceTimersByTimeAsync(400);
  const oldController = application.getController(a)!;
  b.dispatchEvent(new Event('input'));
  expect(application.getState(a)).toBeUndefined();
  expect(oldController.state.matches).toEqual([]);
  await vi.advanceTimersByTimeAsync(400);
  expect(application.getState(b)?.matches).toHaveLength(1);
  expect(application.getState(b)?.ignoredMatches.size).toBe(0);
  const dynamic = document.createElement('textarea');
  document.body.append(dynamic);
  await Promise.resolve();
  expect(application.getState(dynamic)).toBeUndefined();
  dynamic.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
  expect(application.getState(dynamic)).toBeDefined();
  const hostCount = document.querySelectorAll('[data-correctly-ui]').length;
  dynamic.remove();
  await Promise.resolve();
  expect(application.getState(dynamic)).toBeUndefined();
  expect(document.querySelectorAll('[data-correctly-ui]')).toHaveLength(
    hostCount - 1,
  );
});
it('skips disabled sites and never registers passwords', () => {
  document.body.innerHTML = '<input type="password"><textarea></textarea>';
  application = new Application({ ...DEFAULT_SETTINGS, enabled: false }, check);
  application.start();
  expect(
    application.getState(document.querySelector('textarea')!),
  ).toBeUndefined();
  application.dispose();
  application = new Application(DEFAULT_SETTINGS, check);
  application.start();
  expect(
    application.getState(document.querySelector('input')!),
  ).toBeUndefined();
});
it('does not analyze IME composition until it ends', async () => {
  const field = document.createElement('textarea');
  document.body.append(field);
  const checker = vi.fn(check);
  application = new Application(DEFAULT_SETTINGS, checker);
  application.start();
  field.dispatchEvent(new CompositionEvent('compositionstart'));
  field.value = 'je sui ici';
  field.dispatchEvent(new Event('input'));
  await vi.advanceTimersByTimeAsync(1000);
  expect(checker).not.toHaveBeenCalled();
  field.dispatchEvent(new CompositionEvent('compositionend'));
  await vi.advanceTimersByTimeAsync(400);
  expect(checker).toHaveBeenCalledTimes(1);
});
it('removes a field immediately when its type becomes password', async () => {
  const field = document.createElement('input');
  document.body.append(field);
  const checker = vi.fn(check);
  application = new Application(DEFAULT_SETTINGS, checker);
  application.start();
  field.value = 'je sui ici';
  field.dispatchEvent(new Event('input'));
  field.type = 'password';
  await Promise.resolve();
  await vi.advanceTimersByTimeAsync(400);
  expect(checker).not.toHaveBeenCalled();
  expect(application.getState(field)).toBeUndefined();
});

it('corrects a dynamically mounted rich compose editor under hidden layout ancestors', async () => {
  const checker = vi.fn(check);
  application = new Application(DEFAULT_SETTINGS, checker);
  application.start();
  const layout = document.createElement('div');
  layout.style.visibility = 'hidden';
  layout.innerHTML =
    '<input name="subjectbox" style="visibility:visible"><div contenteditable="true" role="textbox" style="visibility:visible"><div>je sui <strong>ici</strong></div><div>Second paragraphe.</div></div>';
  document.body.append(layout);
  await Promise.resolve();
  const field = layout.querySelector<HTMLElement>('[contenteditable]')!;
  const bold = field.querySelector('strong');
  bold!.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
  await vi.advanceTimersByTimeAsync(400);
  expect(checker).toHaveBeenCalledWith(
    'je sui ici\nSecond paragraphe.',
    'auto',
  );
  expect(application.getHighlighter(field)?.annotations).toHaveLength(1);
  field.dispatchEvent(
    new MouseEvent('click', { bubbles: true, clientX: 50, clientY: 30 }),
  );
  const panel = [...document.querySelectorAll('[data-correctly-ui]')]
    .map((host) => host.shadowRoot?.querySelector('[role=dialog]'))
    .find(Boolean)!;
  (panel.querySelector('button') as HTMLButtonElement).click();
  expect(getTextFromField(field)).toBe('je suis ici\nSecond paragraphe.');
  expect(field.querySelector('strong')).toBe(bold);
  expect(bold?.textContent).toBe('ici');
  layout.remove();
  await Promise.resolve();
  expect(application.getState(field)).toBeUndefined();
});

it('resumes caret tracking after closing the popup with Escape', async () => {
  const field = document.createElement('textarea');
  field.value = 'je sui ici\n' + 'a'.repeat(5100) + '\nlast paragraph';
  document.body.append(field);
  const checker = vi.fn(check);
  application = new Application(DEFAULT_SETTINGS, checker);
  application.start();
  field.focus();
  await vi.advanceTimersByTimeAsync(400);
  application.open(field, application.getHighlighter(field)!.annotations[0]!);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  field.setSelectionRange(field.value.length, field.value.length);
  document.dispatchEvent(new Event('selectionchange'));
  await vi.advanceTimersByTimeAsync(400);
  expect(checker).toHaveBeenLastCalledWith('last paragraph', 'auto');
});
it('prunes active overlays when the body is replaced', async () => {
  const field = document.createElement('textarea');
  field.value = 'je sui ici';
  document.body.append(field);
  application = new Application(DEFAULT_SETTINGS, check);
  application.start();
  field.focus();
  await vi.advanceTimersByTimeAsync(400);
  const previousBody = document.body;
  const next = document.createElement('body');
  previousBody.replaceWith(next);
  await Promise.resolve();
  expect(application.getState(field)).toBeUndefined();
  expect(application.getHighlighter(field)).toBeUndefined();
});

it('keeps caret analysis suspended when an already open popup is reopened', async () => {
  const field = document.createElement('textarea');
  field.value = 'je sui ici\n' + 'a'.repeat(5100) + '\nlast paragraph';
  document.body.append(field);
  const checker = vi.fn(check);
  application = new Application(DEFAULT_SETTINGS, checker);
  application.start();
  field.focus();
  await vi.advanceTimersByTimeAsync(400);
  const annotation = application.getHighlighter(field)!.annotations[0]!;
  application.open(field, annotation);
  application.open(field, annotation);
  const calls = checker.mock.calls.length;
  field.setSelectionRange(field.value.length, field.value.length);
  document.dispatchEvent(new Event('selectionchange'));
  await vi.advanceTimersByTimeAsync(400);
  expect(checker).toHaveBeenCalledTimes(calls);
});
