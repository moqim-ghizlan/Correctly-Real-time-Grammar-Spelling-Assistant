import {
  AI_EDIT,
  CORRECT_TEXT,
  MAX_CORRECTION_CODE_POINTS,
  OPEN_LIMITS,
  REWRITE_TEXT,
  TRANSLATE_TEXT,
  toCorrectionResult,
  type CorrectionResult,
} from '../shared/contracts';
import type { ErrorCode } from '../shared/errors';
import {
  COMMON,
  type CommonMessages,
  languageName,
  targetName,
} from '../shared/i18n';
import type { Locale } from '../shared/locale';
import type { QuotaNote } from '../shared/quota';
import {
  CONTENT,
  type ContentMessages,
  type Kind,
  type Notices,
} from './messages';
import {
  DEFAULT_FORMALITY,
  FORMALITY_LEVELS,
  REWRITE_STYLES,
  formalityField,
  normalizeFormality,
  normalizeStyleIds,
  toRewriteResult,
  type Candidate,
  type Formality,
  type RewriteStyleId,
} from '../shared/rewrite';
import {
  ARABIC_VARIANTS,
  LANGUAGES,
  NEUTRAL,
  isArabicVariant,
  isLanguageId,
  normalizeTranslation,
  translationKeys,
  type TranslateTextRequest,
  type TranslationKey,
  type TranslationPreferences,
} from '../shared/translate';

export type TranslationChoice = Omit<TranslateTextRequest, 'type' | 'text'>;
type RewriteSend = (
  text: string,
  styleIds: RewriteStyleId[],
  formality: Formality,
) => Promise<unknown>;

/** A style's result label; the custom style also names its level. */
export const styleName = (
  c: CommonMessages,
  id: RewriteStyleId,
  formality: Formality,
): string =>
  id === 'custom'
    ? `${c.style.custom.label} · ${c.formality[formality]}`
    : c.style[id].label;

/**
 * The custom-formality slider (owner request 2026-10-16), shown under its
 * checkbox while it is checked. Moving it never sends anything.
 */
export function formalitySlider(
  doc: Document,
  c: CommonMessages,
  initial: Formality,
): { wrap: HTMLElement; range: HTMLInputElement; value: () => Formality } {
  const make = (tag: string, className: string, text = '') => {
    const node = doc.createElement(tag);
    node.className = className;
    node.textContent = text;
    return node;
  };
  const wrap = make('div', 'formality');
  const range = doc.createElement('input');
  range.type = 'range';
  range.min = '1';
  range.max = String(FORMALITY_LEVELS.length);
  range.step = '1';
  range.value = String(initial);
  range.setAttribute('aria-label', c.formalityScale.name);
  const level = make('span', 'level');
  const value = () => normalizeFormality(Number(range.value));
  const sync = () => {
    const colon = c.locale === 'fr' ? ' : ' : ': ';
    level.textContent = `${c.formalityScale.name}${colon}${c.formality[value()]}`;
    range.setAttribute('aria-valuetext', c.formality[value()]);
  };
  range.addEventListener('input', sync);
  sync();
  wrap.append(
    make('small', '', c.formalityScale.less),
    range,
    make('small', '', c.formalityScale.more),
    level,
  );
  return { wrap, range, value };
}

/** Refusals by the V5.8 usage limits: nothing was sent. */
export const LIMIT_CODES: readonly ErrorCode[] = [
  'QUOTA_EXCEEDED',
  'AI_PAUSED',
  'QUOTA_UNAVAILABLE',
  'CLOCK_CHANGED',
];

// Runs in the page's isolated world, injected on an explicit trigger (toolbar,
// shortcut, context menu) or loaded with the opt-in smart button. It never
// sees the API key and keeps the user's text in memory only.

type TextField = HTMLInputElement | HTMLTextAreaElement;

/** English notices (5.13: each UI language has its own, see messages.ts). */
export const NOTICES: Notices = CONTENT.en.notices;

// Same exclusions as V4: credentials, payment and secrets by any label, and
// code/rich editors whose hidden textareas must never be rewritten.
const SENSITIVE =
  /(?:password|one-time|otp|credit|cc-|card|cvc|cvv|secret|token|verification|security.?code)/iu;
const CODE_OR_RICH_EDITOR =
  '.monaco-editor, .CodeMirror, .cm-editor, .ace_editor, pre, code, [data-slate-editor], .ProseMirror, .ql-editor, [data-lexical-editor]';
const hasSensitiveLabel = (el: Element) =>
  SENSITIVE.test(
    ['autocomplete', 'name', 'id', 'aria-label']
      .map((name) => el.getAttribute(name) ?? '')
      .join(' '),
  );
const isSensitiveField = (el: Element) =>
  hasSensitiveLabel(el) || !!el.closest(CODE_OR_RICH_EDITOR);

/** Only textareas and type=text inputs are ever read or written. */
const isTextField = (el: Element | null): el is TextField =>
  el instanceof HTMLTextAreaElement ||
  (el instanceof HTMLInputElement && el.type === 'text');

/** A focused field the smart button may offer to correct (Apply-capable). */
export const isEligibleField = (el: Element | null): el is TextField =>
  isTextField(el) && !el.disabled && !el.readOnly && !isSensitiveField(el);

/** Follows focus into open shadow roots (closed ones stop at their host). */
export function deepActiveElement(doc: Document): Element | null {
  let el = doc.activeElement;
  while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
  return el;
}

/** Where a snapshot's text comes from (V5.12). */
export type SelectionSource = 'editable' | 'read_only_page';

/** Immutable, in-memory picture of what the user asked to correct. */
export interface Snapshot {
  readonly text: string;
  /** read_only_page: plain page text, never writable (copy only). */
  readonly source: SelectionSource;
  readonly field: TextField | null;
  readonly start: number;
  readonly end: number;
  readonly value: string;
  /** Empty when Apply is possible. */
  readonly copyOnlyReason: string;
}

export interface CaptureOptions {
  /**
   * V5.12: also accept one plain selection of page text (the modal and
   * translation), as a copy-only snapshot. Only the selection is read.
   */
  readOnlyPage?: boolean;
  /** Longest accepted selection (code points). */
  max?: number;
  /** 5.13: wording of the notices (English by default). */
  m?: ContentMessages;
}

/** Returns a snapshot, or the notice explaining why nothing is sent. */
export function capture(
  doc: Document,
  {
    readOnlyPage = false,
    max = MAX_CORRECTION_CODE_POINTS,
    m = CONTENT.en,
  }: CaptureOptions = {},
): Snapshot | string {
  const NOTICES = m.notices;
  const active = deepActiveElement(doc);
  let snapshot: Snapshot;
  if (
    active instanceof HTMLInputElement ||
    active instanceof HTMLTextAreaElement
  ) {
    if (!isTextField(active) || isSensitiveField(active))
      return NOTICES.sensitive;
    const start = active.selectionStart ?? 0;
    const end = active.selectionEnd ?? 0;
    snapshot = {
      text: active.value.slice(start, end),
      source: 'editable',
      field: active,
      start,
      end,
      value: active.value,
      copyOnlyReason:
        active.disabled || active.readOnly ? NOTICES.readOnly : '',
    };
  } else {
    // contenteditable and rich editors: suggestion only. Plain page text is
    // read only when the caller allows it (V5.12), and is never writable.
    const selection = doc.getSelection();
    const anchor = selection?.anchorNode;
    const editor = (
      anchor instanceof Element ? anchor : anchor?.parentElement
    )?.closest('[contenteditable]:not([contenteditable="false"])');
    // V5.10: a secret-labelled editor is never read, like such an input.
    if (editor && hasSensitiveLabel(editor)) return NOTICES.sensitive;
    const text = selection?.toString() ?? '';
    const inEditor = !!editor?.contains(selection?.focusNode ?? null);
    if (text.trim() && !inEditor && !readOnlyPage) return NOTICES.notEditable;
    // V5.12: exactly one live, non-collapsed range of page text; nothing
    // around it (no page, sibling or hidden text) is ever read.
    if (
      text.trim() &&
      !inEditor &&
      (selection?.rangeCount !== 1 ||
        selection.isCollapsed ||
        !selection.getRangeAt(0).commonAncestorContainer.isConnected)
    )
      return NOTICES.multiRange;
    snapshot = {
      text,
      source: inEditor ? 'editable' : 'read_only_page',
      field: null,
      start: 0,
      end: 0,
      value: '',
      copyOnlyReason: inEditor ? NOTICES.copyOnly : NOTICES.readOnlyPage,
    };
  }
  if (!snapshot.text.trim()) return NOTICES.select;
  if ([...snapshot.text].length > max)
    return max === MAX_CORRECTION_CODE_POINTS
      ? NOTICES.tooLong
      : m.selectAtMost(max.toLocaleString(m === CONTENT.fr ? 'fr-FR' : 'en'));
  return snapshot;
}

/** Why Apply must not run right now ('' = safe). Matching the substring alone is not enough. */
export function applyBlocker(
  snapshot: Snapshot,
  composing: boolean,
  NOTICES: Notices = CONTENT.en.notices,
): string {
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
export function replaceRange(
  el: TextField,
  start: number,
  end: number,
  text: string,
) {
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
.quota { margin: 8px 0 0; color: var(--warn); font-size: 13px; }
.quota:empty { display: none; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
button {
  font: inherit; min-height: 32px; padding: 4px 12px; cursor: pointer;
  border: 1px solid var(--border); border-radius: 8px;
  background: transparent; color: var(--text);
}
button.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-text); }
button:disabled { opacity: 0.5; cursor: not-allowed; }
button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
fieldset { margin: 8px 0 0; padding: 6px 10px 8px; border: 1px solid var(--border); border-radius: 8px; }
legend { padding: 0 4px; font-size: 12px; color: var(--muted); }
.choice { display: flex; gap: 8px; align-items: baseline; margin: 4px 0; }
.choice small { color: var(--muted); }
.formality { display: grid; grid-template-columns: auto 1fr auto; gap: 4px 8px; align-items: center; margin: 2px 0 8px 24px; }
.formality small { color: var(--muted); }
.formality input { width: 100%; margin: 0; }
.formality .level { grid-column: 1 / -1; }
.card { display: block; margin-top: 8px; padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; cursor: pointer; }
.card:has(input:checked) { border-color: var(--accent); }
.card strong { margin-left: 6px; }
.card .text { margin-top: 4px; }
.missing { margin: 8px 0 0; color: var(--muted); }
.langs { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.field { display: flex; flex-direction: column; gap: 2px; font-size: 12px; color: var(--muted); }
select { font: inherit; font-size: 14px; color: var(--text); background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 4px 6px; min-height: 30px; }
[hidden] { display: none !important; }
`;

/** The in-page preview. Nothing is written to the page without an Apply click. */
export class CorrectionPanel {
  readonly host: HTMLElement;
  /** Closed root: page scripts cannot read or click into the panel. Exposed for tests. */
  readonly root: ShadowRoot;
  busy = false;
  /** "Manage limits": asks the worker to open the usage limits page. */
  openLimits: () => void = () => undefined;
  /**
   * V5.9: reports an AI edit only after the text really changed (statistics;
   * carries the opaque request ID, never any text).
   */
  reportEdit: (operationId: string, action: 'applied' | 'undone') => void =
    () => undefined;
  /** Request that produced the shown result (from the worker's reply). */
  private operationId: string | null = null;
  /** The custom-formality slider's level (set by buildStyleBoxes). */
  private formality: () => Formality = () => DEFAULT_FORMALITY;
  private snapshot: Snapshot | null = null;
  private corrected = '';
  /** Only wording differs between correction, rewrite and translation. */
  private noun: Kind = 'correction';
  private readonly m: ContentMessages;
  private readonly c: CommonMessages;
  private generateReady: () => boolean = () => false;
  private translationControls: (HTMLSelectElement | HTMLInputElement)[] = [];
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
    | 'status'
    | 'title'
    | 'texts'
    | 'original'
    | 'corrected'
    | 'note'
    | 'quota'
    | 'picker'
    | 'pickerOriginal'
    | 'styles'
    | 'cards',
    HTMLElement
  > &
    Record<
      'apply' | 'copy' | 'undo' | 'close' | 'generate' | 'limits',
      HTMLButtonElement
    >;
  private readonly make: <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className: string,
    text?: string,
  ) => HTMLElementTagNameMap[K];

  constructor(doc: Document, locale: Locale = 'en') {
    this.m = CONTENT[locale];
    this.c = COMMON[locale];
    const m = this.m;
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
    panel.setAttribute('aria-label', m.panelLabel);
    const status = make('p', 'status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const texts = make('div', 'texts');
    const original = make('p', 'text');
    const corrected = make('p', 'text');
    texts.append(
      make('h2', '', m.original),
      original,
      make('h2', '', m.corrected),
      corrected,
    );
    const note = make('p', 'note');
    note.setAttribute('aria-live', 'polite');
    // Usage warnings (V5.8): plain text built from fixed labels and numbers.
    const quota = make('p', 'quota');
    quota.setAttribute('aria-live', 'polite');
    const picker = make('div', 'picker');
    const pickerOriginal = make('p', 'text');
    pickerOriginal.dir = 'auto';
    const styles = make('fieldset', '');
    styles.append(make('legend', '', m.styles));
    picker.append(
      make('h2', '', m.original),
      pickerOriginal,
      styles,
      make('p', 'missing', m.oneRequestStyles),
    );
    picker.hidden = true;
    const cards = make('div', 'cards');
    cards.setAttribute('role', 'radiogroup');
    cards.setAttribute('aria-label', m.rewrites);
    cards.hidden = true;
    const generate = make('button', 'primary', m.generateRewrites);
    const apply = make('button', 'primary', m.apply);
    const copy = make('button', '', m.copy);
    const undo = make('button', '', m.undoKind('correction'));
    const close = make('button', '', m.cancel);
    const limits = make('button', '', m.manageLimits);
    limits.hidden = true;
    const actions = make('div', 'actions');
    actions.append(generate, apply, copy, undo, limits, close);
    const title = make('p', 'title', m.title('correction'));
    panel.append(title, status, texts, picker, cards, note, quota, actions);
    this.root.append(style, panel);
    this.ui = {
      status,
      title,
      texts,
      original,
      corrected,
      note,
      quota,
      picker,
      pickerOriginal,
      styles,
      cards,
      generate,
      apply,
      copy,
      undo,
      close,
      limits,
    };
    this.make = make;

    apply.addEventListener('click', () => this.apply());
    copy.addEventListener('click', () => void this.copy());
    undo.addEventListener('click', () => this.undo());
    close.addEventListener('click', () => this.close());
    limits.addEventListener('click', () => this.openLimits());
    this.root.addEventListener('keydown', (event) => {
      if ((event as KeyboardEvent).key === 'Escape') this.close();
    });
    this.show('', 'info');
    doc.documentElement.append(this.host);
  }

  private show(
    status: string,
    tone: 'info' | 'error',
    buttons: ('apply' | 'copy' | 'undo' | 'generate')[] = [],
  ) {
    this.ui.status.textContent = status;
    this.ui.status.dataset.tone = tone;
    for (const name of ['apply', 'copy', 'undo', 'generate'] as const)
      this.ui[name].hidden = !buttons.includes(name);
    this.ui.texts.hidden = !this.corrected || this.noun === 'rewrite';
  }

  /**
   * The usage warning a request crossed, or the limit that refused it. Never
   * moves the focus. "Manage limits" only opens Correctly's own settings.
   */
  private showQuota(
    result:
      | { ok: true; notice?: QuotaNote }
      | { ok: false; code: ErrorCode; quota?: QuotaNote; notice?: QuotaNote },
  ) {
    const note = result.ok ? result.notice : (result.quota ?? result.notice);
    this.ui.quota.textContent = note ? this.c.note(note) : '';
    this.ui.quota.setAttribute(
      'aria-live',
      note && (note.blocked || note.level === 100) ? 'assertive' : 'polite',
    );
    this.ui.limits.hidden =
      !note && (result.ok || !LIMIT_CODES.includes(result.code));
  }

  /** A refusal that sent nothing. */
  notice(text: string): void {
    this.show(text, 'info');
    this.ui.close.textContent = this.m.closeButton;
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
    this.show(this.m.checking, 'info');
    this.ui.close.textContent = this.m.cancel;
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
    this.showQuota(result);
    this.operationId = (result.ok && result.operationId) || null;
    if (!result.ok) {
      this.show(this.m.notChanged(this.c.error(result.code)), 'error');
      this.ui.close.textContent = this.m.closeButton;
      this.ui.close.focus();
      return;
    }
    if (!result.hasErrors) {
      this.show(this.m.noCorrections, 'info');
      this.ui.close.textContent = this.m.closeButton;
      this.ui.close.focus();
      return;
    }
    this.corrected = result.correctedText;
    this.suspicious = result.suspicious;
    this.ui.original.textContent = snapshot.text;
    this.ui.corrected.textContent = result.correctedText;
    this.show(this.m.suggestedCorrection, 'info', ['apply', 'copy']);
    this.refresh();
    (this.ui.apply.disabled ? this.ui.copy : this.ui.apply).focus();
  }

  /** Re-evaluates Apply/Undo after any change in the page. */
  private refresh() {
    const snapshot = this.snapshot;
    if (!snapshot || !this.corrected) return;
    const blocker = this.suspicious
      ? this.m.notices.suspicious
      : this.changed
        ? this.m.notices.stale
        : applyBlocker(snapshot, this.composing, this.m.notices);
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
      ? this.m.notices.suspicious
      : this.changed
        ? this.m.notices.stale
        : applyBlocker(snapshot, this.composing, this.m.notices);
    const field = snapshot.field;
    if (blocker || !field) {
      this.ui.apply.disabled = true;
      this.ui.note.textContent = blocker || this.m.notices.copyOnly;
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
    // Counted only when the field really holds the applied text.
    if (
      this.operationId &&
      field.value.slice(snapshot.start, this.applied.end) === this.corrected
    )
      this.reportEdit(this.operationId, 'applied');
    for (const input of this.ui.cards.querySelectorAll('input'))
      input.disabled = true;
    this.show(this.m.applied(this.noun), 'info', ['copy', 'undo']);
    this.ui.note.textContent = '';
    this.ui.close.textContent = this.m.closeButton;
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

  /** Restores the original only if nothing was typed since Apply; never calls the AI provider. */
  undo(): void {
    const field = this.snapshot?.field;
    const applied = this.applied;
    if (!field || !applied || !this.canUndo()) {
      this.ui.undo.disabled = true;
      this.ui.note.textContent = this.m.undoRefusedPanel;
      return;
    }
    this.writing = true;
    try {
      replaceRange(field, applied.start, applied.end, applied.before);
    } finally {
      this.writing = false;
    }
    this.applied = null;
    if (
      this.operationId &&
      field.value.slice(
        applied.start,
        applied.start + applied.before.length,
      ) === applied.before
    )
      this.reportEdit(this.operationId, 'undone');
    this.show(this.m.undone(this.noun), 'info', ['copy']);
    this.ui.close.focus();
  }

  /** Opens the style picker. Nothing is sent until Generate rewrites. */
  startRewrite(
    snapshot: Snapshot,
    defaults: readonly RewriteStyleId[],
    send: RewriteSend,
    formality: Formality = DEFAULT_FORMALITY,
  ): void {
    this.openPicker(snapshot, 'rewrite', this.m.generateRewrites);
    this.buildStyleBoxes(defaults, formality);
    this.generateReady = () => this.chosenStyles().length > 0;
    this.ui.generate.onclick = () => void this.generateRewrites(send);
    this.refreshGenerate();
    this.show(this.m.chooseStyles, 'info', ['generate']);
    this.ui.styles.querySelector('input')?.focus();
  }

  async generateRewrites(send: RewriteSend): Promise<void> {
    const styles = this.chosenStyles();
    if (!styles.length) return;
    const formality = this.formality();
    await this.generate(
      this.m.generatingRewrites,
      styles,
      (id: RewriteStyleId) => styleName(this.c, id, formality),
      (text) => send(text, styles, formality),
    );
  }

  /**
   * Opens the translation picker (From, To, Arabic variant, optional styles).
   * Nothing is sent until Translate.
   */
  startTranslate(
    snapshot: Snapshot,
    prefs: TranslationPreferences,
    styles: readonly RewriteStyleId[],
    withStyles: boolean,
    send: (request: TranslationChoice) => Promise<unknown>,
    formality: Formality = DEFAULT_FORMALITY,
  ): void {
    const m = this.m;
    this.openPicker(snapshot, 'translation', m.translate);
    this.ui.title.textContent = withStyles
      ? m.titleTranslateRewrite
      : m.titleTranslate;
    const select = (
      label: string,
      options: readonly { id: string; label: string }[],
      value: string,
    ) => {
      const wrap = this.make('label', 'field');
      const node = this.make('select', '');
      for (const option of options) {
        const item = this.make('option', '', option.label);
        item.value = option.id;
        node.append(item);
      }
      node.value = value;
      wrap.append(this.make('span', '', label), node);
      return { wrap, node };
    };
    const languages = LANGUAGES.map((language) => ({
      id: language.id,
      label: languageName(this.c, language.id),
    }));
    const from = select(
      m.from,
      [{ id: 'auto', label: m.autoDetect }, ...languages],
      prefs.source,
    );
    const to = select(m.to, languages, prefs.target);
    const variant = select(
      m.arabicVariant,
      ARABIC_VARIANTS.map((item) => ({
        id: item.id,
        label: this.c.variant[item.id],
      })),
      prefs.arabicVariant,
    );
    const styled = this.make('label', 'choice');
    const styledBox = this.make('input', '');
    styledBox.type = 'checkbox';
    styledBox.checked = withStyles;
    styled.append(styledBox, this.make('span', '', m.alsoRewrite));
    const langs = this.make('div', 'langs');
    langs.append(from.wrap, to.wrap, variant.wrap);
    this.ui.styles.before(langs, styled);
    this.buildStyleBoxes(styles, formality);
    this.translationControls = [from.node, to.node, variant.node, styledBox];

    const choice = (): TranslationChoice => {
      const target = isLanguageId(to.node.value) ? to.node.value : 'en';
      const source =
        from.node.value === 'auto' || isLanguageId(from.node.value)
          ? from.node.value
          : 'auto';
      const styleIds = styledBox.checked ? this.chosenStyles() : [];
      return {
        source,
        target,
        variant:
          target === 'ar' && isArabicVariant(variant.node.value)
            ? variant.node.value
            : null,
        styleIds,
        ...formalityField(styleIds, this.formality()),
      };
    };
    const sync = () => {
      variant.wrap.hidden = to.node.value !== 'ar';
      this.ui.styles.hidden = !styledBox.checked;
      const { source, target } = choice();
      // Same languages: no request at all; Rewrite is the right action.
      this.ui.note.textContent =
        source === target ? m.sameSourceTarget('rewrite') : '';
      this.refreshGenerate();
    };
    this.generateReady = () => {
      const { source, target } = choice();
      return (
        source !== target &&
        (!styledBox.checked || !!this.chosenStyles().length)
      );
    };
    for (const node of this.translationControls)
      node.addEventListener('change', sync);
    sync();
    this.ui.generate.onclick = () => {
      const request = choice();
      if (!this.generateReady()) return;
      const keys = translationKeys(request.styleIds);
      const target = targetName(this.c, request.target, request.variant);
      const formality = request.formality ?? DEFAULT_FORMALITY;
      const label = (key: TranslationKey) =>
        key === NEUTRAL
          ? m.translationLabel(target)
          : m.styledLabel(styleName(this.c, key, formality), target);
      void this.generate(
        m.translatingInto(target),
        keys,
        label,
        () => send(request),
        m.sameLanguage(target, 'rewrite'),
      );
    };
    this.show(m.chooseLanguages, 'info', ['generate']);
    to.node.focus();
  }

  /** Common picker setup: snapshot, wording and the original text. */
  private openPicker(snapshot: Snapshot, noun: Kind, action: string) {
    this.snapshot = snapshot;
    this.watch(snapshot.field, true);
    this.noun = noun;
    this.ui.title.textContent = this.m.title(noun);
    this.ui.undo.textContent = this.m.undoKind(noun);
    this.ui.generate.textContent = action;
    this.ui.pickerOriginal.textContent = snapshot.text;
    this.ui.picker.hidden = false;
  }

  private buildStyleBoxes(
    defaults: readonly RewriteStyleId[],
    formality: Formality,
  ) {
    for (const style of REWRITE_STYLES) {
      const label = this.make('label', 'choice');
      const box = this.make('input', '');
      box.type = 'checkbox';
      box.value = style.id;
      box.checked = defaults.includes(style.id);
      box.addEventListener('change', () => this.refreshGenerate());
      label.append(
        box,
        this.make('span', '', this.c.style[style.id].label),
        this.make('small', '', this.c.style[style.id].description),
      );
      this.ui.styles.append(label);
      if (style.id !== 'custom') continue;
      const slider = formalitySlider(
        this.host.ownerDocument,
        this.c,
        formality,
      );
      const sync = () => (slider.wrap.hidden = !box.checked);
      box.addEventListener('change', sync);
      sync();
      this.formality = slider.value;
      this.ui.styles.append(slider.wrap);
    }
  }

  private refreshGenerate() {
    this.ui.generate.disabled = this.busy || !this.generateReady();
  }

  /** Checked styles, in catalog order. */
  private chosenStyles(): RewriteStyleId[] {
    return normalizeStyleIds(
      [...this.ui.styles.querySelectorAll('input')]
        .filter((box) => box.checked)
        .map((box) => box.value),
    );
  }

  /**
   * One explicit click → one request. Locks the picker while running, keeps
   * the text untouched on any error and offers an explicit Try again.
   */
  private async generate<K extends string>(
    loading: string,
    keys: readonly K[],
    label: (key: K) => string,
    call: (text: string) => Promise<unknown>,
    sameLanguage = '',
  ): Promise<void> {
    const snapshot = this.snapshot;
    // In-flight guard: a double click never makes a second paid request.
    if (this.busy || !snapshot) return;
    this.busy = true;
    const controls = [
      ...this.ui.styles.querySelectorAll('input'),
      ...this.translationControls,
    ];
    for (const control of controls) control.disabled = true;
    this.show(loading, 'info', ['generate']);
    this.ui.generate.disabled = true;
    this.ui.close.textContent = this.m.cancel;
    let result;
    try {
      result = toRewriteResult(await call(snapshot.text), keys);
    } catch {
      result = toRewriteResult(undefined, keys);
    }
    this.busy = false;
    if (!this.host.isConnected) return;
    this.showQuota(result);
    this.operationId = (result.ok && result.operationId) || null;
    if (!result.ok) {
      // Retrying is always an explicit new click.
      for (const control of controls) control.disabled = false;
      this.ui.generate.textContent = this.m.tryAgain;
      this.refreshGenerate();
      this.show(this.m.notChanged(this.c.error(result.code)), 'error', [
        'generate',
      ]);
      return;
    }
    this.ui.picker.hidden = true;
    if (result.sameLanguage) {
      this.show(sameLanguage, 'info');
      this.ui.close.textContent = this.m.closeButton;
      this.ui.close.focus();
      return;
    }
    this.renderCards(snapshot, result.candidates, result.missing, label);
  }

  private renderCards<K extends string>(
    snapshot: Snapshot,
    candidates: Candidate<K>[],
    missing: K[],
    label: (key: K) => string,
  ) {
    const noun = this.noun;
    const cards = this.ui.cards;
    cards.replaceChildren(
      this.make('h2', '', this.m.original),
      Object.assign(this.make('p', 'text', snapshot.text), { dir: 'auto' }),
    );
    let first: HTMLInputElement | null = null;
    for (const candidate of candidates) {
      const card = this.make('label', 'card');
      const radio = this.make('input', '');
      radio.type = 'radio';
      radio.name = 'candidate';
      const same = candidate.text === snapshot.text;
      radio.disabled = same;
      radio.addEventListener('change', () => this.select(candidate));
      card.append(radio, this.make('strong', '', label(candidate.styleId)));
      card.append(
        same
          ? this.make('p', 'missing', this.m.noMeaningfulForStyle(noun))
          : Object.assign(this.make('p', 'text', candidate.text), {
              dir: 'auto',
            }),
      );
      cards.append(card);
      if (!same && !first) {
        first = radio;
        radio.checked = true;
        this.select(candidate);
      }
    }
    if (missing.length)
      cards.append(
        this.make(
          'p',
          'missing',
          this.m.noneReturned(noun, missing.map(label).join(', ')).trim(),
        ),
      );
    cards.hidden = false;
    this.ui.close.textContent = this.m.closeButton;
    if (!first) {
      this.show(this.m.noMeaningful(noun), 'info');
      this.ui.close.focus();
      return;
    }
    this.show(this.m.chooseOne(noun), 'info', ['apply', 'copy']);
    this.refresh();
    first.focus();
  }

  /** Choosing a card only changes what Apply/Copy use; it never edits the page. */
  private select(candidate: Candidate<string>) {
    this.corrected = candidate.text;
    this.suspicious = candidate.suspicious;
    this.refresh();
  }

  async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.corrected);
      this.ui.note.textContent = this.m.copied;
    } catch {
      this.ui.note.textContent = this.m.copyFailedPanel;
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

export type Intent =
  | 'correct'
  | 'rewrite'
  | 'translate'
  | 'translateRewrite'
  | 'unreachable'
  | 'rewriteOff';

/** The single entry point shared by every trigger in this frame. */
export function runInPage(
  doc: Document,
  intent: Intent,
  styles: readonly string[] = [],
  translation?: unknown,
  locale: Locale = 'en',
  formality: unknown = DEFAULT_FORMALITY,
): void {
  // The isolated world keeps this global across injections and bundles, so an
  // in-flight request and the open panel are shared by all triggers.
  const state = globalThis as { correctlyPanel?: CorrectionPanel };
  const previous = state.correctlyPanel;
  if (previous?.busy && previous.host.isConnected) return;
  previous?.close();
  const panel = new CorrectionPanel(doc, locale);
  const m = CONTENT[locale];
  panel.openLimits = () =>
    void chrome.runtime
      .sendMessage({ type: OPEN_LIMITS })
      .catch(() => undefined);
  panel.reportEdit = (operationId, action) =>
    void chrome.runtime
      .sendMessage({ type: AI_EDIT, operationId, action })
      .catch(() => undefined);
  state.correctlyPanel = panel;
  const snapshot =
    intent === 'unreachable' || intent === 'rewriteOff'
      ? m.notices[intent]
      : // V5.12: page text can be translated (copy only), not corrected.
        capture(doc, {
          readOnlyPage: intent === 'translate' || intent === 'translateRewrite',
          m,
        });
  if (typeof snapshot === 'string') return panel.notice(snapshot);
  const normalized = normalizeStyleIds(styles);
  const defaults: RewriteStyleId[] = normalized.length
    ? normalized
    : ['professional'];
  const level = normalizeFormality(formality);
  if (intent === 'rewrite')
    panel.startRewrite(
      snapshot,
      defaults,
      (text, styleIds, chosen) =>
        chrome.runtime.sendMessage({
          type: REWRITE_TEXT,
          text,
          styleIds,
          ...formalityField(styleIds, chosen),
        }),
      level,
    );
  else if (intent === 'translate' || intent === 'translateRewrite')
    panel.startTranslate(
      snapshot,
      normalizeTranslation(translation),
      defaults,
      intent === 'translateRewrite',
      (choice) =>
        chrome.runtime.sendMessage({
          type: TRANSLATE_TEXT,
          text: snapshot.text,
          ...choice,
        }),
      level,
    );
  else
    void panel.run(snapshot, (text) =>
      chrome.runtime.sendMessage({ type: CORRECT_TEXT, text }),
    );
}
