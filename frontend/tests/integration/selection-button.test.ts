// 5.15 translate button on selected text: the button, the bubble (short
// selections) and the Correctly window on Translation (long ones).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openModal, type ModalOptions } from '../../src/content/modal';
import { CONTENT } from '../../src/content/messages';
import {
  SHORT_WORDS,
  SelectionButton,
  countWords,
} from '../../src/content/selection';
import { OPEN_TRANSLATION, TRANSLATE_TEXT } from '../../src/shared/contracts';
import { COMMON } from '../../src/shared/i18n';

let send: ReturnType<typeof vi.fn<(message: unknown) => Promise<unknown>>>;
let selector: SelectionButton;
const flush = async () => {
  for (let i = 0; i < 3; i++)
    await new Promise((resolve) => setTimeout(resolve, 0));
};
const types = () =>
  send.mock.calls.map(([message]) => (message as { type: string }).type);

/** Selects the whole text of an element, then releases the mouse there. */
async function selectText(element: Element) {
  const range = document.createRange();
  range.selectNodeContents(element);
  const selection = document.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  element.dispatchEvent(
    new MouseEvent('mouseup', {
      bubbles: true,
      button: 0,
      clientX: 200,
      clientY: 300,
    }),
  );
  await flush();
}

const make = () => {
  selector = new SelectionButton(
    document,
    { locale: 'en', translation: { target: 'en', arabicVariant: 'msa' } },
    send,
  );
  selector.install();
  return selector;
};
const translated = (text: string) => ({
  ok: true,
  candidates: [{ styleId: 'neutral', text, suspicious: false }],
  missing: [],
});
const bubbleButton = (label: string) =>
  [...selector.bubble!.querySelectorAll('button')].find(
    (node) => node.textContent === label,
  )!;

beforeEach(() => {
  document.body.innerHTML =
    '<p id="short">Qu’est-ce que</p>' +
    '<p id="long">Le conseil municipal a voté un budget de douze millions.</p>' +
    '<input id="secret" type="password" value="hunter2hunter2">';
  send = vi.fn(() => Promise.resolve(translated('What is')));
});

afterEach(() => {
  selector?.dispose();
  document.getSelection()?.removeAllRanges();
});

describe('word count', () => {
  it('counts words as a reader does', () => {
    expect(countWords('Qu’est-ce que', 'fr')).toBeLessThanOrEqual(SHORT_WORDS);
    expect(countWords('  hello  ')).toBe(1);
    expect(countWords('')).toBe(0);
    expect(countWords('Le conseil municipal a voté un budget', 'fr')).toBe(7);
  });
});

describe('button', () => {
  it('Q1/Q2: a selection shows the button and sends nothing', async () => {
    make();
    await selectText(document.getElementById('short')!);
    expect(selector.button).not.toBeNull();
    expect(selector.button!.getAttribute('aria-label')).toBe(
      CONTENT.en.selectionButton,
    );
    expect(send).not.toHaveBeenCalled();
  });

  it('Q4: no button for a password field or an empty selection', async () => {
    make();
    const secret = document.getElementById('secret') as HTMLInputElement;
    secret.focus();
    secret.select();
    secret.dispatchEvent(
      new MouseEvent('mouseup', { bubbles: true, button: 0 }),
    );
    await flush();
    expect(selector.button).toBeNull();
    document.getSelection()!.removeAllRanges();
    secret.blur();
    document.body.dispatchEvent(
      new MouseEvent('mouseup', { bubbles: true, button: 0 }),
    );
    await flush();
    expect(selector.button).toBeNull();
  });

  it('Q5: Escape, a click elsewhere or a scroll hides it', async () => {
    make();
    await selectText(document.getElementById('short')!);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(selector.button).toBeNull();
    await selectText(document.getElementById('short')!);
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(selector.button).toBeNull();
    await selectText(document.getElementById('short')!);
    window.dispatchEvent(new Event('scroll'));
    expect(selector.button).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });

  it('dispose removes the button and every listener', async () => {
    make();
    selector.dispose();
    await selectText(document.getElementById('short')!);
    expect(selector.button).toBeNull();
    expect(document.querySelector('correctly-selection')).toBeNull();
  });
});

describe('short selection: bubble', () => {
  it('Q2: one click = one request with the default language; text only', async () => {
    send.mockResolvedValueOnce(translated('<img src=x onerror=alert(1)>'));
    make();
    await selectText(document.getElementById('short')!);
    selector.button!.click();
    await flush();
    expect(selector.button).toBeNull();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({
      type: TRANSLATE_TEXT,
      text: 'Qu’est-ce que',
      source: 'auto',
      target: 'en',
      variant: null,
      styleIds: [],
    });
    const result = selector.bubble!.querySelector('.result')!;
    // Model output stays text (Q6).
    expect(result.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(result.children).toHaveLength(0);
    expect(result.getAttribute('dir')).toBe('auto');
  });

  it('another language: one more request only after Translate (D3: not saved)', async () => {
    make();
    await selectText(document.getElementById('short')!);
    selector.button!.click();
    await flush();
    const [target, variant] = [...selector.bubble!.querySelectorAll('select')];
    target!.value = 'ar';
    target!.dispatchEvent(new Event('change'));
    expect(variant!.hidden).toBe(false);
    variant!.value = 'syrian';
    variant!.dispatchEvent(new Event('change'));
    expect(send).toHaveBeenCalledTimes(1);
    bubbleButton(CONTENT.en.bubbleTranslate).click();
    await flush();
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith(
      expect.objectContaining({ target: 'ar', variant: 'syrian' }),
    );
  });

  it('Q7: refusals are shown with the shared wording, nothing else is sent', async () => {
    send.mockResolvedValueOnce({ ok: false, code: 'NOT_CONFIGURED' });
    make();
    await selectText(document.getElementById('short')!);
    selector.button!.click();
    await flush();
    expect(selector.bubble!.querySelector('.status')!.textContent).toBe(
      COMMON.en.error('NOT_CONFIGURED'),
    );
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('Open in Correctly: the window on Translation, without a new request', async () => {
    make();
    await selectText(document.getElementById('short')!);
    selector.button!.click();
    await flush();
    bubbleButton(CONTENT.en.bubbleOpen).click();
    await flush();
    expect(selector.bubble).toBeNull();
    expect(send).toHaveBeenLastCalledWith({
      type: OPEN_TRANSLATION,
      text: 'Qu’est-ce que',
      generate: false,
    });
    expect(types().filter((type) => type === TRANSLATE_TEXT)).toHaveLength(1);
  });
});

describe('long selection: window', () => {
  it('Q3/D5: opens Correctly on Translation and asks to translate at once', async () => {
    make();
    await selectText(document.getElementById('long')!);
    selector.button!.click();
    await flush();
    expect(selector.bubble).toBeNull();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({
      type: OPEN_TRANSLATION,
      text: 'Le conseil municipal a voté un budget de douze millions.',
      generate: true,
    });
  });
});

describe('window opened by the button', () => {
  const OPTIONS: ModalOptions = {
    styles: [],
    translation: { source: 'auto', target: 'en', arabicVariant: 'msa' },
    rewriteEnabled: true,
  };
  const clean = () => {
    for (const node of document.querySelectorAll('correctly-modal'))
      node.remove();
    delete (globalThis as { correctlyModal?: unknown }).correctlyModal;
  };
  beforeEach(clean);
  afterEach(clean);

  it('starts on Translation with the text and translates once (generate)', async () => {
    const modalSend = vi.fn(() => new Promise<unknown>(() => undefined));
    const modal = openModal(
      document,
      { ...OPTIONS, open: { text: 'Bonjour à tous', generate: true } },
      modalSend,
    );
    await flush();
    const tab = modal.root.querySelector('#correctly-tab-translation')!;
    expect(tab.getAttribute('aria-selected')).toBe('true');
    expect(
      modal.root.querySelector<HTMLTextAreaElement>('#correctly-text')!.value,
    ).toBe('Bonjour à tous');
    expect(modalSend).toHaveBeenCalledTimes(1);
    expect(modalSend).toHaveBeenCalledWith(
      expect.objectContaining({ type: TRANSLATE_TEXT, text: 'Bonjour à tous' }),
    );
  });

  it('without generate: nothing is sent', async () => {
    const modalSend = vi.fn(() => Promise.resolve(undefined));
    openModal(
      document,
      { ...OPTIONS, open: { text: 'Bonjour', generate: false } },
      modalSend,
    );
    await flush();
    expect(modalSend).not.toHaveBeenCalled();
  });
});
