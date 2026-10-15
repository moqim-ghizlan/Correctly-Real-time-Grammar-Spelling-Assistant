import { SMART_BUTTON_OFF } from '../shared/contracts';
import {
  correctInPage,
  deepActiveElement,
  isEligibleField,
} from './correction';

// Opt-in smart button: a small action next to the focused plain text field.
// Showing it never sends anything; only an activation does, through the same
// correctInPage() path as the other triggers.

const SIZE = 24;
const CSS = `
:host { all: initial; }
button {
  position: fixed; z-index: 2147483646; box-sizing: border-box;
  width: ${SIZE}px; height: ${SIZE}px; padding: 0; margin: 0;
  border: 1px solid #2357d9; border-radius: 50%;
  background: #ffffff; color: #2357d9; cursor: pointer;
  font: 700 13px/1 system-ui, -apple-system, 'Segoe UI', sans-serif;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2); opacity: 0.85;
}
button:hover, button:focus-visible { opacity: 1; }
button:focus-visible { outline: 2px solid #2357d9; outline-offset: 2px; }
@media (prefers-color-scheme: dark) {
  button { background: #1d2026; color: #8fb0ff; border-color: #8fb0ff; }
}
`;

type TextField = HTMLInputElement | HTMLTextAreaElement;

export class SmartButton {
  readonly host: HTMLElement;
  /** Inside a closed shadow root; exposed for tests only. */
  readonly button: HTMLButtonElement;
  private field: TextField | null = null;
  private frame = 0;

  constructor(private readonly doc: Document) {
    this.host = doc.createElement('correctly-smart-button');
    const root = this.host.attachShadow({ mode: 'closed' });
    const style = doc.createElement('style');
    style.textContent = CSS;
    this.button = doc.createElement('button');
    this.button.type = 'button';
    this.button.textContent = '✓';
    this.button.title = 'Correct the selected text (Correctly)';
    this.button.setAttribute('aria-label', this.button.title);
    root.append(style, this.button);

    // Keep focus and selection in the field when the button is pressed.
    this.button.addEventListener('mousedown', (event) =>
      event.preventDefault(),
    );
    this.button.addEventListener('click', this.activate);
    doc.addEventListener('focusin', this.onFocus, true);
    doc.addEventListener('focusout', this.onBlur, true);
    doc.defaultView?.addEventListener('scroll', this.schedule, true);
    doc.defaultView?.addEventListener('resize', this.schedule);
  }

  private readonly onFocus = () => {
    const active = deepActiveElement(this.doc);
    if (active === this.host) return; // keyboard focus moved onto the button
    this.field = isEligibleField(active) ? active : null;
    this.place();
  };

  private readonly onBlur = (event: FocusEvent) => {
    // Leaving the field for the button keeps it; anything else hides it.
    if (event.relatedTarget === this.host) return;
    queueMicrotask(() => {
      if (deepActiveElement(this.doc) !== this.field) this.hide();
    });
  };

  private readonly schedule = () => {
    if (!this.field || this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.place();
    });
  };

  private readonly activate = (event: MouseEvent) => {
    // Page scripts cannot reach a closed shadow root; this also rejects
    // synthetic clicks so only a real user gesture can send text.
    if (event.isTrusted) this.correct();
  };

  /** Same path as the shortcut: the field keeps its selection. */
  correct(): void {
    if (!this.field?.isConnected) return;
    this.field.focus({ preventScroll: true });
    correctInPage(this.doc);
  }

  private place() {
    const field = this.field;
    if (!field?.isConnected || !isEligibleField(field)) return this.hide();
    const rect = field.getBoundingClientRect();
    const view = this.doc.documentElement;
    if (
      !rect.width ||
      !rect.height ||
      rect.bottom < 0 ||
      rect.top > view.clientHeight
    )
      return this.hide();
    // Inside the field's bottom-right corner, kept on screen.
    const top = Math.min(rect.bottom - SIZE - 4, view.clientHeight - SIZE - 4);
    const left = Math.min(rect.right - SIZE - 4, view.clientWidth - SIZE - 4);
    this.button.style.top = `${Math.max(4, top)}px`;
    this.button.style.left = `${Math.max(4, left)}px`;
    if (!this.host.isConnected) this.doc.documentElement.append(this.host);
  }

  hide(): void {
    this.host.remove();
  }

  /** Removes every listener and the button (setting turned off). */
  dispose(): void {
    this.hide();
    this.field = null;
    this.doc.removeEventListener('focusin', this.onFocus, true);
    this.doc.removeEventListener('focusout', this.onBlur, true);
    this.doc.defaultView?.removeEventListener('scroll', this.schedule, true);
    this.doc.defaultView?.removeEventListener('resize', this.schedule);
  }
}

/** One button per document, however many times the script is loaded. */
export function installSmartButton(doc: Document): SmartButton {
  const state = globalThis as { correctlySmartButton?: SmartButton };
  if (state.correctlySmartButton) return state.correctlySmartButton;
  const smart = new SmartButton(doc);
  state.correctlySmartButton = smart;
  chrome.runtime.onMessage.addListener(
    (message: unknown, sender: chrome.runtime.MessageSender) => {
      if (
        sender.id === chrome.runtime.id &&
        (message as { type?: unknown } | null)?.type === SMART_BUTTON_OFF
      ) {
        smart.dispose();
        delete state.correctlySmartButton;
      }
    },
  );
  return smart;
}
