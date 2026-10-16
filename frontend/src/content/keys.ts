import { KEY_COMMAND } from '../shared/contracts';
import { matchBinding, type KeybindingsStore } from '../shared/keybindings';
import { requestPageConfig, type PageConfig } from './shortcuts';

// Correctly's own keyboard shortcuts in web pages (opt-in page script). A
// trusted key press matching a saved combination asks the worker to run that
// action in this frame, exactly like the browser command would; nothing else
// is read or sent.

/**
 * chrome.runtime.sendMessage that never throws: after the extension is
 * reloaded, an old page script's context is invalidated and the call throws
 * synchronously ("Extension context invalidated"); it then does nothing.
 */
export function safeSend(message: unknown): void {
  try {
    void chrome.runtime.sendMessage(message).catch(() => undefined);
  } catch {
    // Stale page script: reloading the tab loads the current one.
  }
}

export class KeyCommands {
  private bindings: KeybindingsStore['bindings'] = {};

  constructor(
    private readonly doc: Document,
    private readonly send: (message: unknown) => void = safeSend,
    private readonly load: () => Promise<PageConfig> = requestPageConfig,
    /** Only real key presses; page scripts cannot synthesize trusted ones. */
    private readonly trusted: (event: Event) => boolean = (event) =>
      event.isTrusted,
  ) {
    doc.addEventListener('keydown', this.onKeyDown, true);
    doc.addEventListener('visibilitychange', this.refresh);
  }

  setBindings(bindings: KeybindingsStore['bindings']): void {
    this.bindings = bindings;
  }

  /** Re-reads the saved shortcuts (a tab shown again may have stale ones). */
  readonly refresh = (): void => {
    if (this.doc.visibilityState === 'hidden') return;
    this.load()
      .then((config) => this.setBindings(config.keybindings))
      .catch(() => undefined);
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    // Only real key presses; never auto-repeat or IME composition.
    if (!this.trusted(event) || event.repeat || event.isComposing) return;
    const action = matchBinding({ bindings: this.bindings }, event);
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    this.send({ type: KEY_COMMAND, action });
  };

  dispose(): void {
    this.doc.removeEventListener('keydown', this.onKeyDown, true);
    this.doc.removeEventListener('visibilitychange', this.refresh);
  }
}

/** One listener per document, however many times the script is loaded. */
export function installKeyCommands(
  doc: Document,
  bindings: KeybindingsStore['bindings'],
): KeyCommands {
  const state = globalThis as { correctlyKeys?: KeyCommands };
  state.correctlyKeys ??= new KeyCommands(doc);
  state.correctlyKeys.setBindings(bindings);
  return state.correctlyKeys;
}
