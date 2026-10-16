import { PAGE_CONFIG } from '../shared/contracts';
import { normalizeHandle } from '../shared/settings';
import {
  MAX_REPLACEMENT,
  shortcutExpansion,
  shortcutMap,
  type ShortcutMap,
} from '../shared/shortcuts';
import { deepActiveElement, isEligibleField } from './correction';

// V5.6 local text expansion. Runs in the opt-in page script, never calls the
// network and never sees the API key: the worker sends only the active
// trigger → replacement pairs.

export interface PageConfig {
  /** V5.11: show the right-edge handle (the former smart button setting). */
  smartButton: boolean;
  /** V5.11: saved vertical position of the handle (0–1). */
  handleY: number;
  shortcuts: { trigger: string; replacement: string }[];
}

/** The worker's reply is untrusted here too: keep only well-formed pairs. */
export function toPageConfig(value: unknown): PageConfig {
  const data =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  const list = Array.isArray(data.shortcuts)
    ? (data.shortcuts as unknown[])
    : [];
  return {
    smartButton: data.smartButton === true,
    handleY: normalizeHandle({ yRatio: data.handleY }).yRatio,
    shortcuts: list
      .map((item) => (item ?? {}) as Record<string, unknown>)
      .filter(
        (item): item is { trigger: string; replacement: string } =>
          typeof item.trigger === 'string' &&
          typeof item.replacement === 'string' &&
          item.replacement.length <= MAX_REPLACEMENT,
      )
      .slice(0, 500)
      .map(({ trigger, replacement }) => ({ trigger, replacement })),
  };
}

export const requestPageConfig = async (): Promise<PageConfig> =>
  toPageConfig(
    await chrome.runtime.sendMessage({ type: PAGE_CONFIG }).catch(() => null),
  );

export class ShortcutExpander {
  private map: ShortcutMap = new Map();
  private expanding = false;

  constructor(
    private readonly doc: Document,
    private readonly load: () => Promise<PageConfig> = requestPageConfig,
  ) {
    doc.addEventListener('input', this.onInput, true);
    // Pick up dictionary changes when the user comes back from the settings.
    doc.addEventListener('focusin', this.refresh, true);
    doc.addEventListener('visibilitychange', this.refresh);
  }

  readonly refresh = () => {
    void this.load()
      .then((config) => this.setShortcuts(config.shortcuts))
      .catch(() => undefined);
  };

  setShortcuts(entries: PageConfig['shortcuts']): void {
    this.map = shortcutMap(entries);
  }

  private readonly onInput = (event: Event) => {
    // Only real typing: page scripts, paste, drop, undo and our own edits
    // never expand.
    if (!(event instanceof InputEvent) || !event.isTrusted) return;
    const target = event.composedPath()[0];
    if (target instanceof Element)
      this.typed(target, event.inputType, event.data, event.isComposing);
  };

  /** One typed character in `field`; returns true when it expanded. */
  typed(
    field: Element,
    inputType: string,
    data: string | null,
    composing: boolean,
  ): boolean {
    if (
      this.expanding ||
      composing ||
      inputType !== 'insertText' ||
      !data ||
      [...data].length !== 1 ||
      !this.map.size ||
      !isEligibleField(field) ||
      field !== deepActiveElement(this.doc) ||
      field.selectionStart === null ||
      field.selectionStart !== field.selectionEnd
    )
      return false;
    const caret = field.selectionStart;
    const plan = shortcutExpansion(field.value, caret, this.map);
    if (!plan || field.value.slice(plan.start, plan.end) !== plan.trigger)
      return false;
    this.expanding = true;
    try {
      field.setSelectionRange(plan.start, plan.end);
      // insertText keeps the browser's own undo (Ctrl+Z restores the trigger)
      // and is seen by frameworks like typing; setRangeText is the fallback.
      const inserted =
        typeof this.doc.execCommand === 'function' &&
        this.doc.execCommand('insertText', false, plan.replacement) &&
        field.value.slice(plan.start, plan.start + plan.replacement.length) ===
          plan.replacement;
      if (!inserted) {
        field.setRangeText(plan.replacement, plan.start, plan.end, 'end');
        field.dispatchEvent(
          new InputEvent('input', {
            bubbles: true,
            inputType: 'insertReplacementText',
          }),
        );
      }
      // Caret after the separator the user typed, which was kept as is.
      const after = plan.start + plan.replacement.length + (caret - plan.end);
      field.setSelectionRange(after, after);
    } finally {
      this.expanding = false;
    }
    return true;
  }

  dispose(): void {
    this.doc.removeEventListener('input', this.onInput, true);
    this.doc.removeEventListener('focusin', this.refresh, true);
    this.doc.removeEventListener('visibilitychange', this.refresh);
  }
}

/** One expander per document. */
export function installShortcutExpander(doc: Document): ShortcutExpander {
  const state = globalThis as { correctlyExpander?: ShortcutExpander };
  state.correctlyExpander ??= new ShortcutExpander(doc);
  state.correctlyExpander.refresh();
  return state.correctlyExpander;
}
