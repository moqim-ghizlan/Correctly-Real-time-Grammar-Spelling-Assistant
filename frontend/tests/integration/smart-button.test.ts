import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runInPage } from '../../src/content/correction';
import {
  installSmartButton,
  type SmartButton,
} from '../../src/content/smart-button';
import {
  CORRECT_TEXT,
  OPEN_REWRITE,
  OPEN_TRANSLATE,
  SMART_BUTTON_OFF,
} from '../../src/shared/contracts';

const ID = 'correctlyextensionid';
let sendMessage: ReturnType<typeof vi.fn>;
let onMessage: (message: unknown, sender: { id?: string }) => void;
let smart: SmartButton;

const hosts = () => document.querySelectorAll('correctly-smart-button').length;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function editors(html: string) {
  document.body.innerHTML = html;
  return [...document.body.children] as HTMLElement[];
}

beforeEach(() => {
  document.body.innerHTML = '';
  for (const node of document.querySelectorAll(
    'correctly-smart-button, correctly-panel',
  ))
    node.remove();
  const state = globalThis as {
    correctlySmartButton?: SmartButton;
    correctlyPanel?: unknown;
  };
  state.correctlySmartButton?.dispose();
  delete state.correctlySmartButton;
  delete state.correctlyPanel;
  sendMessage = vi.fn(() => new Promise(() => undefined));
  sendMessage.mockName('sendMessage');
  vi.stubGlobal('chrome', {
    runtime: {
      id: ID,
      sendMessage,
      onMessage: {
        addListener: (callback: typeof onMessage) => (onMessage = callback),
      },
    },
  });
  // jsdom has no layout: give fields a visible box in an 800×600 viewport.
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(10, 10, 300, 100),
  );
  vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(
    600,
  );
  vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(800);
  smart = installSmartButton(document);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('visibility', () => {
  it('B01/S03: focusing a plain textarea shows one button and sends nothing', () => {
    const [textarea] = editors('<textarea></textarea>');
    textarea!.focus();
    expect(hosts()).toBe(1);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('B09: sensitive, read-only or unsupported fields never get a button', () => {
    for (const element of editors(
      '<input type="password"><input type="email"><input type="text" autocomplete="one-time-code"><textarea readonly></textarea><textarea disabled></textarea><div contenteditable="true" tabindex="0"></div>',
    )) {
      element.focus();
      expect(hosts()).toBe(0);
    }
  });

  it('B02: switching between 20 editors keeps a single button', () => {
    for (const element of editors('<textarea></textarea>'.repeat(20)))
      element.focus();
    expect(hosts()).toBe(1);
  });

  it('B06: leaving the field or removing it hides the button', async () => {
    const [textarea, other] = editors(
      '<textarea></textarea><button>x</button>',
    );
    textarea!.focus();
    other!.focus();
    await flush();
    expect(hosts()).toBe(0);
    textarea!.focus();
    textarea!.remove();
    window.dispatchEvent(new Event('resize'));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(hosts()).toBe(0);
  });

  it('a second install reuses the same button', () => {
    expect(installSmartButton(document)).toBe(smart);
  });
});

describe('activation', () => {
  it('B03/S01: typing never sends anything', () => {
    const [textarea] = editors(
      '<textarea></textarea>',
    ) as HTMLTextAreaElement[];
    textarea!.focus();
    for (let i = 0; i < 1000; i++) {
      textarea!.value += 'a';
      textarea!.dispatchEvent(new Event('input', { bubbles: true }));
    }
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('B04: pressing keeps focus/selection, and the exact selection is sent', () => {
    const [textarea] = editors(
      '<textarea></textarea>',
    ) as HTMLTextAreaElement[];
    textarea!.value = 'Bonjour. Je suis aller a Lyon.';
    textarea!.focus();
    textarea!.setSelectionRange(9, 30);
    const press = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
    });
    smart.button.dispatchEvent(press);
    expect(press.defaultPrevented).toBe(true);
    smart.correct();
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith({
      type: CORRECT_TEXT,
      text: 'Je suis aller a Lyon.',
    });
  });

  it('synthetic (page-script) clicks are ignored', () => {
    const [textarea] = editors(
      '<textarea></textarea>',
    ) as HTMLTextAreaElement[];
    textarea!.value = 'Il a oublier.';
    textarea!.focus();
    textarea!.select();
    smart.button.click();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('P13/N4: button + shortcut on the same pending capture make one call', () => {
    const [textarea] = editors(
      '<textarea></textarea>',
    ) as HTMLTextAreaElement[];
    textarea!.value = 'Il a oublier.';
    textarea!.focus();
    textarea!.select();
    smart.correct();
    runInPage(document, 'correct'); // the shortcut's injected script, same frame
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });
});

describe('turning the setting off', () => {
  it('B10: our own off-message removes the button and its listeners', () => {
    const [textarea] = editors('<textarea></textarea>');
    textarea!.focus();
    onMessage({ type: SMART_BUTTON_OFF }, { id: 'another-extension' });
    expect(hosts()).toBe(1);
    onMessage({ type: SMART_BUTTON_OFF }, { id: ID });
    expect(hosts()).toBe(0);
    textarea!.blur();
    textarea!.focus();
    expect(hosts()).toBe(0);
  });
});

describe('injected-trigger notices', () => {
  it('M05: an unreachable-frame notice is shown and nothing is sent', () => {
    runInPage(document, 'unreachable');
    const panel = (globalThis as { correctlyPanel?: { root: ShadowRoot } })
      .correctlyPanel;
    expect(panel?.root.textContent).toContain('cannot reach this editor');
    expect(sendMessage).not.toHaveBeenCalled();
  });
});

describe('V5.4 rewrite action', () => {
  it('asks the worker to open the picker here; synthetic clicks are ignored', () => {
    const [textarea] = editors(
      '<textarea></textarea>',
    ) as HTMLTextAreaElement[];
    textarea!.value = 'Salut';
    textarea!.focus();
    textarea!.select();
    smart.rewriteButton.click();
    expect(sendMessage).not.toHaveBeenCalled();
    const press = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
    });
    smart.rewriteButton.dispatchEvent(press);
    expect(press.defaultPrevented).toBe(true);
    smart.rewrite();
    expect(sendMessage).toHaveBeenCalledWith({ type: OPEN_REWRITE });
    expect(document.activeElement).toBe(textarea);
  });
});

describe('V5.5 translate action', () => {
  it('asks the worker to open the translation picker; synthetic clicks ignored', () => {
    const [textarea] = editors(
      '<textarea></textarea>',
    ) as HTMLTextAreaElement[];
    textarea!.value = 'Salut';
    textarea!.focus();
    textarea!.select();
    smart.translateButton.click();
    expect(sendMessage).not.toHaveBeenCalled();
    smart.open(OPEN_TRANSLATE);
    expect(sendMessage).toHaveBeenCalledWith({ type: OPEN_TRANSLATE });
  });
});
