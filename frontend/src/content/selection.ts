// 5.15 translate button on selected text (opt-in, in the page script).
// Selecting text shows a small button at the end of the selection. Showing
// it sends nothing: a click on it does. Up to SHORT_WORDS words, a bubble
// translates the selection (one request per click on the button or on
// Translate); longer selections open the Correctly window on Translation,
// which translates at once (the click was the explicit action). The bubble
// is copy-only: the page is never changed. No log, never the key.
import {
  MAX_SUMMARY_CODE_POINTS,
  OPEN_TRANSLATION,
  SELECTION_BUTTON_OFF,
  TRANSLATE_TEXT,
} from '../shared/contracts';
import { COMMON, languageName, type CommonMessages } from '../shared/i18n';
import type { Locale } from '../shared/locale';
import { toRewriteResult } from '../shared/rewrite';
import {
  ARABIC_VARIANTS,
  LANGUAGES,
  translationKeys,
  type ArabicVariant,
  type LanguageId,
  type TranslationPreferences,
} from '../shared/translate';
import { capture } from './correction';
import { closeIcon, logo, translateIcon } from './icons';
import { CONTENT, type ContentMessages } from './messages';

/** Up to this many words: the bubble; more: the Correctly window. */
export const SHORT_WORDS = 5;
const BUTTON_SIZE = 30;
const BUBBLE_WIDTH = 340;
const GAP = 8;
/** Our own UI: a selection or click there never shows the button. */
const OWN_HOSTS = new Set([
  'CORRECTLY-MODAL',
  'CORRECTLY-HANDLE',
  'CORRECTLY-UNDO',
  'CORRECTLY-SELECTION',
  'CORRECTLY-BUBBLE',
]);

export interface SelectionConfig {
  locale: Locale;
  translation: Pick<TranslationPreferences, 'target' | 'arabicVariant'>;
}

/** chrome.runtime.sendMessage, injectable for tests. */
export type Send = (message: unknown) => Promise<unknown>;

/** Words as a reader counts them (French, Arabic, Turkish…). */
export function countWords(text: string, locale = 'en'): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  if (typeof Intl.Segmenter === 'function') {
    let count = 0;
    for (const part of new Intl.Segmenter(locale, {
      granularity: 'word',
    }).segment(trimmed))
      if (part.isWordLike) count++;
    return count;
  }
  return trimmed.split(/\s+/).length;
}

const CSS = `
:host { all: initial; }
.box {
  --solid: #161922; --surface: rgba(255, 255, 255, 0.05); --surface-2: rgba(255, 255, 255, 0.09);
  --text: #eef1f7; --muted: #a3abba; --border: rgba(255, 255, 255, 0.12);
  --accent: #7c9cff; --accent-2: #a67cff; --accent-text: #0b1020; --error: #ff8a80;
  --shadow: 0 16px 40px rgba(0, 0, 0, 0.45);
  position: fixed; z-index: 2147483647; box-sizing: border-box;
  color: var(--text); font: 14px/1.5 system-ui, -apple-system, 'Segoe UI', sans-serif;
}
@media (prefers-color-scheme: light) {
  .box {
    --solid: #ffffff; --surface: rgba(20, 30, 60, 0.04); --surface-2: rgba(20, 30, 60, 0.08);
    --text: #141821; --muted: #5b6475; --border: rgba(20, 30, 60, 0.14);
    --accent: #3461e8; --accent-2: #7b4fe0; --accent-text: #ffffff; --error: #b42318;
    --shadow: 0 16px 40px rgba(20, 30, 60, 0.2);
  }
}
.trigger {
  width: ${BUTTON_SIZE}px; height: ${BUTTON_SIZE}px; padding: 0; display: grid; place-items: center;
  border: 0; border-radius: 50%; cursor: pointer; color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  box-shadow: var(--shadow); animation: pop 120ms ease-out;
}
.trigger:hover { filter: brightness(1.1); }
.bubble {
  width: min(${BUBBLE_WIDTH}px, calc(100vw - 16px)); padding: 12px 14px 14px;
  border: 1px solid var(--border); border-radius: 16px; background: var(--solid);
  box-shadow: var(--shadow); animation: pop 140ms ease-out;
}
@keyframes pop { from { opacity: 0; transform: translateY(4px) scale(0.97); } }
@media (prefers-reduced-motion: reduce) { .trigger, .bubble { animation: none; } }
.head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.head h2 { flex: 1; margin: 0; font-size: 14px; font-weight: 650; }
.icon {
  width: 28px; height: 28px; padding: 0; display: grid; place-items: center;
  border: 0; border-radius: 8px; background: transparent; color: var(--muted); cursor: pointer;
}
.icon:hover { background: var(--surface-2); color: var(--text); }
.source { margin: 0 0 8px; color: var(--muted); font-size: 13px; overflow-wrap: anywhere; }
.row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
select {
  flex: 1 1 120px; min-height: 34px; padding: 4px 8px; font: inherit; font-size: 13px;
  color: var(--text); background: var(--solid); border: 1px solid var(--border); border-radius: 10px;
}
button.action {
  min-height: 34px; padding: 4px 12px; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer;
  border: 1px solid var(--border); border-radius: 10px; background: var(--surface); color: var(--text);
}
button.action:hover:not(:disabled) { background: var(--surface-2); }
button.primary { border-color: transparent; color: var(--accent-text); background: linear-gradient(135deg, var(--accent), var(--accent-2)); }
button:disabled { opacity: 0.5; cursor: not-allowed; }
button:focus-visible, select:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.result {
  margin: 10px 0 0; padding: 10px 12px; min-height: 22px; border-radius: 12px;
  background: var(--surface); font-size: 15px; white-space: pre-wrap; overflow-wrap: anywhere;
  user-select: text; max-height: 180px; overflow-y: auto;
}
.result:empty { display: none; }
.status { margin: 10px 0 0; color: var(--muted); font-size: 13px; }
.status[data-tone='error'] { color: var(--error); }
.status:empty { display: none; }
.foot { display: flex; gap: 8px; justify-content: flex-end; margin-top: 10px; }
[hidden] { display: none !important; }
`;

interface Anchor {
  /** Right end of the selection's last line, top and bottom (viewport). */
  x: number;
  top: number;
  bottom: number;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), Math.max(min, max));

export class SelectionButton {
  private readonly m: ContentMessages;
  private readonly c: CommonMessages;
  private buttonHost: HTMLElement | null = null;
  private bubbleHost: HTMLElement | null = null;
  /** The button shown now (tests and the page script only). */
  button: HTMLButtonElement | null = null;
  /** The bubble's closed shadow root while it is open (tests only). */
  bubble: ShadowRoot | null = null;
  private lastPointer: { x: number; y: number } | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Bumped on every new request: a late answer for an old one is dropped. */
  private token = 0;

  constructor(
    private readonly doc: Document,
    private readonly config: SelectionConfig,
    private readonly send: Send = (message) =>
      chrome.runtime.sendMessage(message),
  ) {
    this.m = CONTENT[config.locale];
    this.c = COMMON[config.locale];
  }

  private get win(): Window {
    return this.doc.defaultView ?? window;
  }

  install(): void {
    this.doc.addEventListener('mouseup', this.onPointerUp, true);
    this.doc.addEventListener('keyup', this.onKeyUp, true);
    this.doc.addEventListener('mousedown', this.onPointerDown, true);
    this.doc.addEventListener('keydown', this.onKeyDown, true);
    this.win.addEventListener('scroll', this.onScroll, true);
  }

  dispose(): void {
    this.doc.removeEventListener('mouseup', this.onPointerUp, true);
    this.doc.removeEventListener('keyup', this.onKeyUp, true);
    this.doc.removeEventListener('mousedown', this.onPointerDown, true);
    this.doc.removeEventListener('keydown', this.onKeyDown, true);
    this.win.removeEventListener('scroll', this.onScroll, true);
    if (this.timer) clearTimeout(this.timer);
    this.hideButton();
    this.closeBubble();
  }

  /** True when the event comes from Correctly's own UI. */
  private fromOwnUi(event: Event): boolean {
    return event
      .composedPath()
      .some((node) => node instanceof Element && OWN_HOSTS.has(node.tagName));
  }

  private readonly onPointerDown = (event: MouseEvent) => {
    if (this.fromOwnUi(event)) return;
    this.hideButton();
    this.closeBubble();
  };

  private readonly onPointerUp = (event: MouseEvent) => {
    if (event.button !== 0 || this.fromOwnUi(event)) return;
    this.lastPointer = { x: event.clientX, y: event.clientY };
    this.schedule();
  };

  private readonly onKeyUp = (event: KeyboardEvent) => {
    if (this.fromOwnUi(event)) return;
    // Keyboard selections: Shift+arrows, Ctrl/Cmd+A.
    if (
      event.shiftKey ||
      ((event.ctrlKey || event.metaKey) && event.key === 'a')
    )
      this.schedule();
  };

  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      this.hideButton();
      this.closeBubble();
      return;
    }
    // Typing replaces the selection: the button would point at nothing.
    if (
      !this.fromOwnUi(event) &&
      !['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)
    )
      this.hideButton();
  };

  private readonly onScroll = () => this.hideButton();

  /** After the browser has finished updating the selection. */
  private schedule() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.check();
    }, 0);
  }

  /** Shows the button for the current selection, or hides it. */
  check(): void {
    // Same rules as Correctly itself: no password, sensitive or hidden text.
    const snapshot = capture(this.doc, {
      readOnlyPage: true,
      max: MAX_SUMMARY_CODE_POINTS,
      m: this.m,
    });
    const text = typeof snapshot === 'string' ? '' : snapshot.text.trim();
    if (!text) {
      this.hideButton();
      return;
    }
    const anchor = this.anchor();
    if (!anchor) {
      this.hideButton();
      return;
    }
    this.showButton(text, anchor);
  }

  /** Where the selection ends on screen (the pointer for text fields). */
  private anchor(): Anchor | null {
    const active = this.doc.activeElement;
    const inField =
      active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement;
    const selection = this.doc.getSelection();
    const range =
      !inField && selection && selection.rangeCount > 0
        ? selection.getRangeAt(0)
        : null;
    if (range && typeof range.getClientRects === 'function') {
      const rects = [...range.getClientRects()].filter(
        (rect) => rect.width > 0 || rect.height > 0,
      );
      const last = rects[rects.length - 1];
      if (last) return { x: last.right, top: last.top, bottom: last.bottom };
    }
    const pointer = this.lastPointer;
    return pointer
      ? { x: pointer.x, top: pointer.y - 10, bottom: pointer.y + 10 }
      : null;
  }

  /** Just below the end of the selection (it hides no text), else above. */
  private place(host: HTMLElement, width: number, height: number, a: Anchor) {
    const vw = this.win.innerWidth || 1024;
    const vh = this.win.innerHeight || 768;
    const left = clamp(a.x - width / 2, GAP, vw - width - GAP);
    const below = a.bottom + 4;
    const top =
      below + height <= vh - GAP
        ? below
        : clamp(a.top - height - 4, GAP, vh - height - GAP);
    host.style.setProperty('left', `${Math.round(left)}px`);
    host.style.setProperty('top', `${Math.round(top)}px`);
  }

  private shadow(tag: string) {
    const host = this.doc.createElement(tag);
    const root = host.attachShadow({ mode: 'closed' });
    const style = this.doc.createElement('style');
    style.textContent = CSS;
    root.append(style);
    return { host, root };
  }

  private showButton(text: string, anchor: Anchor) {
    this.hideButton();
    const { host, root } = this.shadow('correctly-selection');
    const button = this.doc.createElement('button');
    button.type = 'button';
    button.className = 'box trigger';
    button.title = this.m.selectionButton;
    button.setAttribute('aria-label', this.m.selectionButton);
    button.append(translateIcon(this.doc, 17));
    // Keep the page's selection while clicking.
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', () => this.activate(text, anchor));
    root.append(button);
    this.doc.documentElement.append(host);
    this.place(button, BUTTON_SIZE, BUTTON_SIZE, anchor);
    this.buttonHost = host;
    this.button = button;
  }

  hideButton(): void {
    this.buttonHost?.remove();
    this.buttonHost = null;
    this.button = null;
  }

  /** The click on the button: the explicit action. */
  activate(text: string, anchor: Anchor): void {
    this.hideButton();
    if (countWords(text, this.config.locale) <= SHORT_WORDS)
      this.openBubble(text, anchor);
    else void this.openWindow(text, true);
  }

  private async openWindow(text: string, generate: boolean) {
    try {
      await this.send({ type: OPEN_TRANSLATION, text, generate });
    } catch {
      // Worker restarted or the extension was reloaded: nothing happens.
    }
  }

  private openBubble(text: string, anchor: Anchor) {
    this.closeBubble();
    const doc = this.doc;
    const make = <K extends keyof HTMLElementTagNameMap>(
      tag: K,
      className = '',
      content = '',
    ) => {
      const node = doc.createElement(tag);
      if (className) node.className = className;
      node.textContent = content;
      return node;
    };
    const { host, root } = this.shadow('correctly-bubble');
    const box = make('div', 'box bubble');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', `Correctly — ${this.m.bubbleTitle}`);

    const head = make('div', 'head');
    const title = make('h2', '', this.m.bubbleTitle);
    const close = make('button', 'icon');
    close.type = 'button';
    close.title = this.m.close;
    close.setAttribute('aria-label', this.m.close);
    close.append(closeIcon(doc));
    close.addEventListener('click', () => this.closeBubble());
    head.append(logo(doc, 20), title, close);

    const source = make('p', 'source', text);
    source.dir = 'auto';

    const options = (
      label: string,
      items: { id: string; label: string }[],
      value: string,
    ) => {
      const select = make('select');
      select.setAttribute('aria-label', label);
      for (const item of items) {
        const option = make('option', '', item.label);
        option.value = item.id;
        select.append(option);
      }
      select.value = value;
      return select;
    };
    const target = options(
      this.m.to,
      LANGUAGES.map((l) => ({ id: l.id, label: languageName(this.c, l.id) })),
      this.config.translation.target,
    );
    const variant = options(
      this.m.arabicVariant,
      ARABIC_VARIANTS.map((v) => ({ id: v.id, label: this.c.variant[v.id] })),
      this.config.translation.arabicVariant,
    );
    const translate = make('button', 'action primary', this.m.bubbleTranslate);
    translate.type = 'button';
    const row = make('div', 'row');
    row.append(target, variant, translate);

    const result = make('p', 'result');
    result.dir = 'auto';
    result.setAttribute('aria-live', 'polite');
    const status = make('p', 'status');
    status.setAttribute('role', 'status');

    const copy = make('button', 'action', this.m.copy);
    copy.type = 'button';
    copy.disabled = true;
    const open = make('button', 'action', this.m.bubbleOpen);
    open.type = 'button';
    const foot = make('div', 'foot');
    foot.append(copy, open);

    box.append(head, source, row, result, status, foot);
    root.append(box);

    const sync = () => {
      variant.hidden = target.value !== 'ar';
    };
    sync();
    // The language chosen here is for this bubble only (owner decision D3).
    target.addEventListener('change', sync);

    const run = async () => {
      const token = ++this.token;
      const language = target.value as LanguageId;
      translate.disabled = true;
      copy.disabled = true;
      result.textContent = '';
      status.dataset.tone = '';
      status.textContent = this.m.bubbleTranslating;
      let reply: unknown;
      try {
        reply = await this.send({
          type: TRANSLATE_TEXT,
          text,
          source: 'auto',
          target: language,
          variant: language === 'ar' ? (variant.value as ArabicVariant) : null,
          styleIds: [],
        });
      } catch {
        reply = undefined;
      }
      if (token !== this.token || this.bubbleHost !== host) return;
      translate.disabled = false;
      const parsed = toRewriteResult(reply, translationKeys([]));
      if (!parsed.ok) {
        status.dataset.tone = 'error';
        status.textContent = this.c.error(parsed.code);
        return;
      }
      const best = parsed.candidates[0]?.text ?? '';
      if (parsed.sameLanguage || !best) {
        status.textContent = parsed.sameLanguage
          ? this.m.bubbleSame
          : this.m.bubbleEmpty;
        return;
      }
      // Model output is shown as text only, never as markup.
      result.textContent = best;
      status.textContent = '';
      copy.disabled = false;
      copy.textContent = this.m.copy;
    };
    translate.addEventListener('click', () => void run());
    copy.addEventListener('click', () => {
      void navigator.clipboard
        ?.writeText(result.textContent ?? '')
        .then(() => {
          copy.textContent = this.m.copied;
        })
        .catch(() => undefined);
    });
    open.addEventListener('click', () => {
      this.closeBubble();
      void this.openWindow(text, false);
    });

    doc.documentElement.append(host);
    this.bubbleHost = host;
    this.bubble = root;
    // Below the selection (it stays readable), above when there is no room.
    const vw = this.win.innerWidth || 1024;
    const vh = this.win.innerHeight || 768;
    const width = Math.min(BUBBLE_WIDTH, vw - 2 * GAP);
    const height = 240;
    const below = anchor.bottom + GAP;
    const top =
      below + height <= vh - GAP
        ? below
        : clamp(anchor.top - height - GAP, GAP, vh - height - GAP);
    box.style.setProperty(
      'left',
      `${Math.round(clamp(anchor.x - width / 2, GAP, vw - width - GAP))}px`,
    );
    box.style.setProperty('top', `${Math.round(top)}px`);
    // One request: the click on the button asked for it.
    void run();
  }

  closeBubble(): void {
    this.token++;
    this.bubbleHost?.remove();
    this.bubbleHost = null;
    this.bubble = null;
  }
}

/** Installs the button in this page; the settings page can remove it live. */
export function installSelectionButton(
  doc: Document,
  config: SelectionConfig,
): SelectionButton {
  const button = new SelectionButton(doc, config);
  button.install();
  chrome.runtime.onMessage.addListener(
    (message: unknown, sender: chrome.runtime.MessageSender) => {
      if (
        sender.id === chrome.runtime.id &&
        (message as { type?: unknown } | null)?.type === SELECTION_BUTTON_OFF
      )
        button.dispose();
    },
  );
  return button;
}
