import {
  CORRECT_TEXT,
  MAX_CORRECTION_CODE_POINTS,
  toCorrectionResult,
  type CorrectionResult,
} from '../shared/contracts';

// Runs in the page's isolated world, injected on an explicit trigger (toolbar,
// shortcut, context menu) or loaded with the opt-in smart button. It never
// sees the API key and keeps the user's text in memory only.

type TextField = HTMLInputElement | HTMLTextAreaElement;

export const NOTICES = {
  select: 'Select the text to correct, then ask Correctly again.',
  notEditable:
    'Select text inside a text box or editor. Correctly does not send other page text.',
  unreachable:
    'Correctly cannot reach this editor (embedded from another site). Copy the text into a regular text box.',
  sensitive:
    'Correctly never reads password, email, phone, URL, number or search fields.',
  tooLong: `Select at most ${MAX_CORRECTION_CODE_POINTS.toLocaleString('en')} characters.`,
  copyOnly:
    'Apply works only in plain text boxes. Copy the suggestion instead.',
  readOnly: 'This field cannot be edited. Copy the suggestion instead.',
  stale:
    'The text or selection changed since the request. Copy the suggestion or correct again.',
  suspicious:
    'A number, link or email address differs from your text. Check it and copy it if it is right; Apply is disabled.',
} as const;

const SENSITIVE_AUTOCOMPLETE =
  /\b(?:cc-|one-time-code|current-password|new-password)/i;

/** Only textareas and type=text inputs are ever read or written. */
const isTextField = (el: Element | null): el is TextField =>
  el instanceof HTMLTextAreaElement ||
  (el instanceof HTMLInputElement && el.type === 'text');

/** A focused field the smart button may offer to correct (Apply-capable). */
export const isEligibleField = (el: Element | null): el is TextField =>
  isTextField(el) &&
  !el.disabled &&
  !el.readOnly &&
  !SENSITIVE_AUTOCOMPLETE.test(el.getAttribute('autocomplete') ?? '');

/** Follows focus into open shadow roots (closed ones stop at their host). */
export function deepActiveElement(doc: Document): Element | null {
  let el = doc.activeElement;
  while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
  return el;
}

/** Immutable, in-memory picture of what the user asked to correct. */
export interface Snapshot {
  readonly text: string;
  readonly field: TextField | null;
  readonly start: number;
  readonly end: number;
  readonly value: string;
  /** Empty when Apply is possible. */
  readonly copyOnlyReason: string;
}

/** Returns a snapshot, or the notice explaining why nothing is sent. */
export function capture(doc: Document): Snapshot | string {
  const active = deepActiveElement(doc);
  let snapshot: Snapshot;
  if (
    active instanceof HTMLInputElement ||
    active instanceof HTMLTextAreaElement
  ) {
    if (
      !isTextField(active) ||
      SENSITIVE_AUTOCOMPLETE.test(active.getAttribute('autocomplete') ?? '')
    )
      return NOTICES.sensitive;
    const start = active.selectionStart ?? 0;
    const end = active.selectionEnd ?? 0;
    snapshot = {
      text: active.value.slice(start, end),
      field: active,
      start,
      end,
      value: active.value,
      copyOnlyReason:
        active.disabled || active.readOnly ? NOTICES.readOnly : '',
    };
  } else {
    // contenteditable and rich editors: suggestion only. Plain page text is
    // never sent.
    const selection = doc.getSelection();
    const anchor = selection?.anchorNode;
    const editor = (
      anchor instanceof Element ? anchor : anchor?.parentElement
    )?.closest('[contenteditable]:not([contenteditable="false"])');
    const text = selection?.toString() ?? '';
    if (
      text.trim() &&
      !(editor && editor.contains(selection?.focusNode ?? null))
    )
      return NOTICES.notEditable;
    snapshot = {
      text,
      field: null,
      start: 0,
      end: 0,
      value: '',
      copyOnlyReason: NOTICES.copyOnly,
    };
  }
  if (!snapshot.text.trim()) return NOTICES.select;
  if ([...snapshot.text].length > MAX_CORRECTION_CODE_POINTS)
    return NOTICES.tooLong;
  return snapshot;
}

/** Why Apply must not run right now ('' = safe). Matching the substring alone is not enough. */
export function applyBlocker(snapshot: Snapshot, composing: boolean): string {
  const el = snapshot.field;
  if (!el || snapshot.copyOnlyReason)
    return snapshot.copyOnlyReason || NOTICES.copyOnly;
  if (el.disabled || el.readOnly) return NOTICES.readOnly;
  if (
    composing ||
    !el.isConnected ||
    !isTextField(el) ||
    el.value !== snapshot.value ||
    el.selectionStart !== snapshot.start ||
    el.selectionEnd !== snapshot.end
  )
    return NOTICES.stale;
  return '';
}

/** One exact-range replacement, then an input event so frameworks see it. */
function replaceRange(el: TextField, start: number, end: number, text: string) {
  el.setRangeText(text, start, end, 'end');
  el.dispatchEvent(
    new InputEvent('input', {
      bubbles: true,
      inputType: 'insertReplacementText',
    }),
  );
}

const CSS = `
:host { all: initial; }
.panel {
  --bg: #ffffff; --text: #15181e; --muted: #5d6573; --border: #dfe3e8;
  --accent: #2357d9; --accent-text: #ffffff; --warn: #8a5a00; --error: #b42318;
  position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
  box-sizing: border-box; width: min(420px, calc(100vw - 32px));
  max-height: calc(100vh - 32px); overflow: auto;
  padding: 14px 16px; border: 1px solid var(--border); border-radius: 10px;
  background: var(--bg); color: var(--text);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.18);
  font: 14px/1.5 system-ui, -apple-system, 'Segoe UI', sans-serif;
}
@media (prefers-color-scheme: dark) {
  .panel {
    --bg: #1d2026; --text: #e8eaee; --muted: #a3aab6; --border: #323741;
    --accent: #6d95ff; --accent-text: #0d1220; --warn: #f2c66d; --error: #ff8a80;
  }
}
.title { margin: 0 0 4px; font-size: 13px; font-weight: 700; color: var(--muted); }
.status { margin: 0 0 8px; font-weight: 600; }
.status[data-tone='error'] { color: var(--error); }
h2 { margin: 8px 0 2px; font-size: 12px; text-transform: uppercase; color: var(--muted); }
.text { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; user-select: text; }
.note { margin: 8px 0 0; color: var(--warn); }
.note:empty { display: none; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
button {
  font: inherit; min-height: 32px; padding: 4px 12px; cursor: pointer;
  border: 1px solid var(--border); border-radius: 8px;
  background: transparent; color: var(--text);
}
button.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-text); }
button:disabled { opacity: 0.5; cursor: not-allowed; }
button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
[hidden] { display: none !important; }
`;

/** The in-page preview. Nothing is written to the page without an Apply click. */
export class CorrectionPanel {
  readonly host: HTMLElement;
  /** Closed root: page scripts cannot read or click into the panel. Exposed for tests. */
  readonly root: ShadowRoot;
  busy = false;
  private snapshot: Snapshot | null = null;
  private corrected = '';
  private suspicious = false;
  private composing = false;
  private changed = false;
  private writing = false;
  private applied: {
    start: number;
    end: number;
    before: string;
    value: string;
  } | null = null;
  private readonly ui: Record<
    'status' | 'texts' | 'original' | 'corrected' | 'note',
    HTMLElement
  > &
    Record<'apply' | 'copy' | 'undo' | 'close', HTMLButtonElement>;

  constructor(doc: Document) {
    this.host = doc.createElement('correctly-panel');
    this.root = this.host.attachShadow({ mode: 'closed' });
    const make = <K extends keyof HTMLElementTagNameMap>(
      tag: K,
      className: string,
      text = '',
    ) => {
      const node = doc.createElement(tag);
      node.className = className;
      node.textContent = text;
      return node;
    };
    const style = doc.createElement('style');
    style.textContent = CSS;
    const panel = make('div', 'panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Correctly correction');
    const status = make('p', 'status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const texts = make('div', 'texts');
    const original = make('p', 'text');
    const corrected = make('p', 'text');
    texts.append(
      make('h2', '', 'Original'),
      original,
      make('h2', '', 'Corrected'),
      corrected,
    );
    const note = make('p', 'note');
    note.setAttribute('aria-live', 'polite');
    const apply = make('button', 'primary', 'Apply');
    const copy = make('button', '', 'Copy');
    const undo = make('button', '', 'Undo correction');
    const close = make('button', '', 'Cancel');
    const actions = make('div', 'actions');
    actions.append(apply, copy, undo, close);
    panel.append(make('p', 'title', 'Correctly'), status, texts, note, actions);
    this.root.append(style, panel);
    this.ui = {
      status,
      texts,
      original,
      corrected,
      note,
      apply,
      copy,
      undo,
      close,
    };

    apply.addEventListener('click', () => this.apply());
    copy.addEventListener('click', () => void this.copy());
    undo.addEventListener('click', () => this.undo());
    close.addEventListener('click', () => this.close());
    this.root.addEventListener('keydown', (event) => {
      if ((event as KeyboardEvent).key === 'Escape') this.close();
    });
    this.show('', 'info');
    doc.documentElement.append(this.host);
  }

  private show(
    status: string,
    tone: 'info' | 'error',
    buttons: ('apply' | 'copy' | 'undo')[] = [],
  ) {
    this.ui.status.textContent = status;
    this.ui.status.dataset.tone = tone;
    for (const name of ['apply', 'copy', 'undo'] as const)
      this.ui[name].hidden = !buttons.includes(name);
    this.ui.texts.hidden = !this.corrected;
  }

  /** A refusal that sent nothing. */
  notice(text: string): void {
    this.show(text, 'info');
    this.ui.close.textContent = 'Close';
    this.ui.close.focus();
  }

  private readonly onInput = () => {
    if (this.writing) return;
    this.changed = true;
    this.applied = null;
    this.refresh();
  };
  private readonly onCompositionStart = () => {
    this.composing = true;
    this.refresh();
  };
  private readonly onCompositionEnd = () => {
    this.composing = false;
    this.refresh();
  };

  private watch(field: TextField | null, on: boolean) {
    if (!field) return;
    const method = on ? 'addEventListener' : 'removeEventListener';
    field[method]('input', this.onInput);
    field[method]('compositionstart', this.onCompositionStart);
    field[method]('compositionend', this.onCompositionEnd);
  }

  async run(
    snapshot: Snapshot,
    send: (text: string) => Promise<unknown>,
  ): Promise<void> {
    this.snapshot = snapshot;
    this.watch(snapshot.field, true);
    this.busy = true;
    this.show('Checking with Gemini…', 'info');
    this.ui.close.textContent = 'Cancel';
    let result: CorrectionResult;
    try {
      result = toCorrectionResult(await send(snapshot.text));
    } catch {
      // Worker restarted or the message channel closed: nothing is applied.
      result = toCorrectionResult(undefined);
    }
    this.busy = false;
    // Closed or superseded meanwhile: a late answer must change nothing.
    if (!this.host.isConnected) return;
    if (!result.ok) {
      this.show(`${result.message} Your text was not changed.`, 'error');
      this.ui.close.textContent = 'Close';
      this.ui.close.focus();
      return;
    }
    if (!result.hasErrors) {
      this.show('No corrections needed.', 'info');
      this.ui.close.textContent = 'Close';
      this.ui.close.focus();
      return;
    }
    this.corrected = result.correctedText;
    this.suspicious = result.suspicious;
    this.ui.original.textContent = snapshot.text;
    this.ui.corrected.textContent = result.correctedText;
    this.show('Suggested correction', 'info', ['apply', 'copy']);
    this.refresh();
    (this.ui.apply.disabled ? this.ui.copy : this.ui.apply).focus();
  }

  /** Re-evaluates Apply/Undo after any change in the page. */
  private refresh() {
    const snapshot = this.snapshot;
    if (!snapshot || !this.corrected) return;
    const blocker = this.suspicious
      ? NOTICES.suspicious
      : this.changed
        ? NOTICES.stale
        : applyBlocker(snapshot, this.composing);
    if (!this.ui.apply.hidden) {
      this.ui.apply.disabled = Boolean(blocker);
      this.ui.note.textContent = blocker;
    }
    if (!this.ui.undo.hidden) this.ui.undo.disabled = !this.canUndo();
  }

  apply(): void {
    const snapshot = this.snapshot;
    if (!snapshot || !this.corrected || this.ui.apply.hidden) return;
    const blocker = this.suspicious
      ? NOTICES.suspicious
      : this.changed
        ? NOTICES.stale
        : applyBlocker(snapshot, this.composing);
    const field = snapshot.field;
    if (blocker || !field) {
      this.ui.apply.disabled = true;
      this.ui.note.textContent = blocker || NOTICES.copyOnly;
      return;
    }
    this.writing = true;
    try {
      replaceRange(field, snapshot.start, snapshot.end, this.corrected);
    } finally {
      this.writing = false;
    }
    this.applied = {
      start: snapshot.start,
      end: snapshot.start + this.corrected.length,
      before: snapshot.text,
      value: field.value,
    };
    this.show('Correction applied.', 'info', ['copy', 'undo']);
    this.ui.note.textContent = '';
    this.ui.close.textContent = 'Close';
    this.refresh();
    this.ui.undo.focus();
  }

  private canUndo(): boolean {
    const field = this.snapshot?.field;
    return Boolean(
      field &&
      this.applied &&
      field.isConnected &&
      !field.disabled &&
      !field.readOnly &&
      !this.composing &&
      field.value === this.applied.value,
    );
  }

  /** Restores the original only if nothing was typed since Apply; never calls Gemini. */
  undo(): void {
    const field = this.snapshot?.field;
    const applied = this.applied;
    if (!field || !applied || !this.canUndo()) {
      this.ui.undo.disabled = true;
      this.ui.note.textContent =
        'The text changed after the correction, so it cannot be undone safely.';
      return;
    }
    this.writing = true;
    try {
      replaceRange(field, applied.start, applied.end, applied.before);
    } finally {
      this.writing = false;
    }
    this.applied = null;
    this.show('Correction undone.', 'info', ['copy']);
    this.ui.close.focus();
  }

  async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.corrected);
      this.ui.note.textContent = 'Copied.';
    } catch {
      this.ui.note.textContent =
        'Copy failed. Select the corrected text and copy it manually.';
    }
  }

  close(): void {
    this.watch(this.snapshot?.field ?? null, false);
    const restore = this.host.isConnected && this.snapshot?.field?.isConnected;
    this.host.remove();
    if (restore) this.snapshot?.field?.focus({ preventScroll: true });
  }
}

/**
 * One trigger activation. A click while a request is in flight is ignored (no
 * duplicate paid call); otherwise the previous panel is replaced.
 */
export function startCorrection(
  doc: Document,
  send: (text: string) => Promise<unknown>,
  previous?: CorrectionPanel,
): CorrectionPanel {
  if (previous?.busy && previous.host.isConnected) return previous;
  previous?.close();
  const panel = new CorrectionPanel(doc);
  const snapshot = capture(doc);
  if (typeof snapshot === 'string') panel.notice(snapshot);
  else void panel.run(snapshot, send);
  return panel;
}

/** The single entry point shared by every trigger in this frame. */
export function correctInPage(doc: Document, notice?: string): void {
  // The isolated world keeps this global across injections and bundles, so an
  // in-flight request and the open panel are shared by all triggers.
  const state = globalThis as { correctlyPanel?: CorrectionPanel };
  if (notice && !state.correctlyPanel?.busy) {
    state.correctlyPanel?.close();
    state.correctlyPanel = new CorrectionPanel(doc);
    state.correctlyPanel.notice(notice);
    return;
  }
  state.correctlyPanel = startCorrection(
    doc,
    (text) => chrome.runtime.sendMessage({ type: CORRECT_TEXT, text }),
    state.correctlyPanel,
  );
}
