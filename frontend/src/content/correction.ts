import {
  CORRECT_TEXT,
  MAX_CORRECTION_CODE_POINTS,
  REWRITE_TEXT,
  TRANSLATE_TEXT,
  toCorrectionResult,
  type CorrectionResult,
} from '../shared/contracts';
import {
  REWRITE_STYLES,
  normalizeStyleIds,
  styleLabel,
  toRewriteResult,
  type Candidate,
  type RewriteStyleId,
} from '../shared/rewrite';
import {
  ARABIC_VARIANTS,
  LANGUAGES,
  NEUTRAL,
  isArabicVariant,
  isLanguageId,
  normalizeTranslation,
  targetLabel,
  translationKeys,
  type TranslateTextRequest,
  type TranslationKey,
  type TranslationPreferences,
} from '../shared/translate';

export type TranslationChoice = Omit<TranslateTextRequest, 'type' | 'text'>;

// Runs in the page's isolated world, injected on an explicit trigger (toolbar,
// shortcut, context menu) or loaded with the opt-in smart button. It never
// sees the API key and keeps the user's text in memory only.

type TextField = HTMLInputElement | HTMLTextAreaElement;

export const NOTICES = {
  select: 'Select the text to correct, then ask Correctly again.',
  notEditable:
    'Select text inside a text box or editor. Correctly does not send other page text.',
  rewriteOff: 'Rewrite is turned off in the Correctly settings.',
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
fieldset { margin: 8px 0 0; padding: 6px 10px 8px; border: 1px solid var(--border); border-radius: 8px; }
legend { padding: 0 4px; font-size: 12px; color: var(--muted); }
.choice { display: flex; gap: 8px; align-items: baseline; margin: 4px 0; }
.choice small { color: var(--muted); }
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
  private snapshot: Snapshot | null = null;
  private corrected = '';
  /** 'Correction', 'Rewrite' or 'Translation': only wording differs. */
  private noun = 'Correction';
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
    | 'picker'
    | 'pickerOriginal'
    | 'styles'
    | 'cards',
    HTMLElement
  > &
    Record<'apply' | 'copy' | 'undo' | 'close' | 'generate', HTMLButtonElement>;
  private readonly make: <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className: string,
    text?: string,
  ) => HTMLElementTagNameMap[K];

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
    const picker = make('div', 'picker');
    const pickerOriginal = make('p', 'text');
    pickerOriginal.dir = 'auto';
    const styles = make('fieldset', '');
    styles.append(make('legend', '', 'Styles'));
    picker.append(
      make('h2', '', 'Original'),
      pickerOriginal,
      styles,
      make(
        'p',
        'missing',
        'All chosen styles are generated in ONE Gemini request, which may count against your quota.',
      ),
    );
    picker.hidden = true;
    const cards = make('div', 'cards');
    cards.setAttribute('role', 'radiogroup');
    cards.setAttribute('aria-label', 'Rewrites');
    cards.hidden = true;
    const generate = make('button', 'primary', 'Generate rewrites');
    const apply = make('button', 'primary', 'Apply');
    const copy = make('button', '', 'Copy');
    const undo = make('button', '', 'Undo correction');
    const close = make('button', '', 'Cancel');
    const actions = make('div', 'actions');
    actions.append(generate, apply, copy, undo, close);
    const title = make('p', 'title', 'Correctly — Correction');
    panel.append(title, status, texts, picker, cards, note, actions);
    this.root.append(style, panel);
    this.ui = {
      status,
      title,
      texts,
      original,
      corrected,
      note,
      picker,
      pickerOriginal,
      styles,
      cards,
      generate,
      apply,
      copy,
      undo,
      close,
    };
    this.make = make;

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
    buttons: ('apply' | 'copy' | 'undo' | 'generate')[] = [],
  ) {
    this.ui.status.textContent = status;
    this.ui.status.dataset.tone = tone;
    for (const name of ['apply', 'copy', 'undo', 'generate'] as const)
      this.ui[name].hidden = !buttons.includes(name);
    this.ui.texts.hidden = !this.corrected || this.noun === 'Rewrite';
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
    for (const input of this.ui.cards.querySelectorAll('input'))
      input.disabled = true;
    this.show(`${this.noun} applied.`, 'info', ['copy', 'undo']);
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
    this.show(`${this.noun} undone.`, 'info', ['copy']);
    this.ui.close.focus();
  }

  /** Opens the style picker. Nothing is sent until Generate rewrites. */
  startRewrite(
    snapshot: Snapshot,
    defaults: readonly RewriteStyleId[],
    send: (text: string, styleIds: RewriteStyleId[]) => Promise<unknown>,
  ): void {
    this.openPicker(snapshot, 'Rewrite', 'Generate rewrites');
    this.buildStyleBoxes(defaults);
    this.generateReady = () => this.chosenStyles().length > 0;
    this.ui.generate.onclick = () => void this.generateRewrites(send);
    this.refreshGenerate();
    this.show('Choose one or more styles, then Generate rewrites.', 'info', [
      'generate',
    ]);
    this.ui.styles.querySelector('input')?.focus();
  }

  async generateRewrites(
    send: (text: string, styleIds: RewriteStyleId[]) => Promise<unknown>,
  ): Promise<void> {
    const styles = this.chosenStyles();
    if (!styles.length) return;
    await this.generate('Generating rewrites…', styles, styleLabel, (text) =>
      send(text, styles),
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
  ): void {
    this.openPicker(snapshot, 'Translation', 'Translate');
    this.ui.title.textContent = withStyles
      ? 'Correctly — Translate & rewrite'
      : 'Correctly — Translate';
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
      label: `${language.label} — ${language.native}`,
    }));
    const from = select(
      'From',
      [{ id: 'auto', label: 'Auto-detect' }, ...languages],
      prefs.source,
    );
    const to = select('To', languages, prefs.target);
    const variant = select(
      'Arabic variant',
      ARABIC_VARIANTS,
      prefs.arabicVariant,
    );
    const styled = this.make('label', 'choice');
    const styledBox = this.make('input', '');
    styledBox.type = 'checkbox';
    styledBox.checked = withStyles;
    styled.append(styledBox, this.make('span', '', 'Also rewrite in a style'));
    const langs = this.make('div', 'langs');
    langs.append(from.wrap, to.wrap, variant.wrap);
    this.ui.styles.before(langs, styled);
    this.buildStyleBoxes(styles);
    this.translationControls = [from.node, to.node, variant.node, styledBox];

    const choice = (): TranslationChoice => {
      const target = isLanguageId(to.node.value) ? to.node.value : 'en';
      const source =
        from.node.value === 'auto' || isLanguageId(from.node.value)
          ? from.node.value
          : 'auto';
      return {
        source,
        target,
        variant:
          target === 'ar' && isArabicVariant(variant.node.value)
            ? variant.node.value
            : null,
        styleIds: styledBox.checked ? this.chosenStyles() : [],
      };
    };
    const sync = () => {
      variant.wrap.hidden = to.node.value !== 'ar';
      this.ui.styles.hidden = !styledBox.checked;
      const { source, target } = choice();
      // Same languages: no request at all; Rewrite is the right action.
      this.ui.note.textContent =
        source === target
          ? 'Source and target are the same: use Rewrite instead.'
          : '';
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
      const target = targetLabel(request.target, request.variant);
      const label = (key: TranslationKey) =>
        key === NEUTRAL
          ? `Translation → ${target}`
          : `${styleLabel(key)} → ${target}`;
      void this.generate(
        `Translating into ${target}…`,
        keys,
        label,
        () => send(request),
        `The text already seems to be in ${target}. Nothing to translate: use Rewrite to change its style.`,
      );
    };
    this.show(
      'Choose the languages, then Translate. Selected text is sent to Gemini only when you click Translate.',
      'info',
      ['generate'],
    );
    to.node.focus();
  }

  /** Common picker setup: snapshot, wording and the original text. */
  private openPicker(snapshot: Snapshot, noun: string, action: string) {
    this.snapshot = snapshot;
    this.watch(snapshot.field, true);
    this.noun = noun;
    this.ui.title.textContent = `Correctly — ${noun}`;
    this.ui.undo.textContent = `Undo ${noun.toLowerCase()}`;
    this.ui.generate.textContent = action;
    this.ui.pickerOriginal.textContent = snapshot.text;
    this.ui.picker.hidden = false;
  }

  private buildStyleBoxes(defaults: readonly RewriteStyleId[]) {
    for (const style of REWRITE_STYLES) {
      const label = this.make('label', 'choice');
      const box = this.make('input', '');
      box.type = 'checkbox';
      box.value = style.id;
      box.checked = defaults.includes(style.id);
      box.addEventListener('change', () => this.refreshGenerate());
      label.append(
        box,
        this.make('span', '', style.label),
        this.make('small', '', style.description),
      );
      this.ui.styles.append(label);
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
    this.ui.close.textContent = 'Cancel';
    let result;
    try {
      result = toRewriteResult(await call(snapshot.text), keys);
    } catch {
      result = toRewriteResult(undefined, keys);
    }
    this.busy = false;
    if (!this.host.isConnected) return;
    if (!result.ok) {
      // Retrying is always an explicit new click.
      for (const control of controls) control.disabled = false;
      this.ui.generate.textContent = 'Try again';
      this.refreshGenerate();
      this.show(`${result.message} Your text was not changed.`, 'error', [
        'generate',
      ]);
      return;
    }
    this.ui.picker.hidden = true;
    if (result.sameLanguage) {
      this.show(sameLanguage, 'info');
      this.ui.close.textContent = 'Close';
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
    const noun = this.noun.toLowerCase();
    const cards = this.ui.cards;
    cards.replaceChildren(
      this.make('h2', '', 'Original'),
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
          ? this.make(
              'p',
              'missing',
              `No meaningful ${noun} was generated for this style.`,
            )
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
          `No ${noun} was returned for: ${missing.map(label).join(', ')}.`,
        ),
      );
    cards.hidden = false;
    this.ui.close.textContent = 'Close';
    if (!first) {
      this.show(`No meaningful ${noun} was generated.`, 'info');
      this.ui.close.focus();
      return;
    }
    this.show(`Choose a ${noun}, then Apply or Copy.`, 'info', [
      'apply',
      'copy',
    ]);
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
): void {
  // The isolated world keeps this global across injections and bundles, so an
  // in-flight request and the open panel are shared by all triggers.
  const state = globalThis as { correctlyPanel?: CorrectionPanel };
  const previous = state.correctlyPanel;
  if (previous?.busy && previous.host.isConnected) return;
  previous?.close();
  const panel = new CorrectionPanel(doc);
  state.correctlyPanel = panel;
  const snapshot =
    intent === 'unreachable' || intent === 'rewriteOff'
      ? NOTICES[intent]
      : capture(doc);
  if (typeof snapshot === 'string') return panel.notice(snapshot);
  const normalized = normalizeStyleIds(styles);
  const defaults: RewriteStyleId[] = normalized.length
    ? normalized
    : ['professional'];
  if (intent === 'rewrite')
    panel.startRewrite(snapshot, defaults, (text, styleIds) =>
      chrome.runtime.sendMessage({ type: REWRITE_TEXT, text, styleIds }),
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
    );
  else
    void panel.run(snapshot, (text) =>
      chrome.runtime.sendMessage({ type: CORRECT_TEXT, text }),
    );
}
