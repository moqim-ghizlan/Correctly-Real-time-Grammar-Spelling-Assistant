import {
  AI_EDIT,
  CORRECT_TEXT,
  MAX_CORRECTION_CODE_POINTS,
  MAX_SUMMARY_CODE_POINTS,
  OPEN_LIMITS,
  OPEN_SETTINGS,
  REWRITE_TEXT,
  SUMMARIZE_TEXT,
  TRANSLATE_TEXT,
  toCorrectionResult,
} from '../shared/contracts';
import type { ErrorCode } from '../shared/errors';
import { describeNote, type QuotaNote } from '../shared/quota';
import {
  REWRITE_STYLES,
  normalizeStyleIds,
  styleLabel,
  toRewriteResult,
  type RewriteStyleId,
} from '../shared/rewrite';
import {
  DEFAULT_SUMMARY_FORMAT,
  DEFAULT_SUMMARY_LENGTH,
  SUMMARY_FORMATS,
  SUMMARY_LENGTHS,
  isSummaryFormat,
  isSummaryLength,
  toSummaryResult,
  type SummaryOptions,
} from '../shared/summary';
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
} from '../shared/translate';
import {
  LIMIT_CODES,
  NOTICES,
  applyBlocker,
  capture,
  replaceRange,
  type Snapshot,
} from './correction';
import { gearIcon, hideIcon, logo } from './icons';

// V5.11: the one Correctly modal, opened by the right-edge handle, Ctrl+M or
// the toolbar icon. Opening, switching tabs, typing or changing options never
// sends anything; only a Generate click does, through the same worker
// messages (consent, route, usage limits) as the V5.2–V5.5 pickers.
// V5.12: a fourth tab, Summary, and plain page text as a copy-only source.

export type ModalTab =
  'correction' | 'reformulation' | 'translation' | 'summary';
export const MODAL_TABS: readonly {
  id: ModalTab;
  label: string;
  action: string;
  loading: string;
}[] = [
  {
    id: 'correction',
    label: 'Correction',
    action: 'Generate correction',
    loading: 'Checking with your AI provider…',
  },
  {
    id: 'reformulation',
    label: 'Reformulation',
    action: 'Generate reformulation',
    loading: 'Generating reformulations…',
  },
  {
    id: 'translation',
    label: 'Translation',
    action: 'Generate translation',
    loading: 'Translating…',
  },
  {
    id: 'summary',
    label: 'Summary',
    action: 'Generate summary',
    loading: 'Summarizing…',
  },
];
/** How long the Undo offer stays after a successful Apply. */
export const UNDO_MS = 5000;

/** Picker defaults from the settings (style IDs and languages, never a key). */
export interface ModalOptions {
  styles: readonly string[];
  translation: unknown;
  rewriteEnabled: boolean;
}

/** chrome.runtime.sendMessage, injectable for tests. */
export type Send = (message: unknown) => Promise<unknown>;

type TextField = NonNullable<Snapshot['field']>;
type TranslationChoice = Omit<TranslateTextRequest, 'type' | 'text'>;

interface Choice {
  label: string;
  text: string;
  suspicious: boolean;
  /** Language of the result when known (summaries), for rendering. */
  lang?: string;
}

/** Everything one tab shows; replaced as a whole on any reset. */
interface TabState {
  choices: Choice[];
  chosen: number;
  operationId: string | null;
  status: string;
  tone: 'info' | 'error';
  quota: string;
  urgent: boolean;
  limits: boolean;
  /** Token of the request this tab waits for (0 = none). */
  pending: number;
}

const emptyTab = (): TabState => ({
  choices: [],
  chosen: -1,
  operationId: null,
  status: '',
  tone: 'info',
  quota: '',
  urgent: false,
  limits: false,
  pending: 0,
});

const emptyTabs = (): Record<ModalTab, TabState> =>
  Object.fromEntries(MODAL_TABS.map((item) => [item.id, emptyTab()])) as Record<
    ModalTab,
    TabState
  >;

/** Longest text each tab may send in its one request. */
const TEXT_LIMITS: Record<ModalTab, number> = {
  correction: MAX_CORRECTION_CODE_POINTS,
  reformulation: MAX_CORRECTION_CODE_POINTS,
  translation: MAX_CORRECTION_CODE_POINTS,
  summary: MAX_SUMMARY_CODE_POINTS,
};

/** Shared by every bundle loaded in this isolated world (content.js, smart.js). */
interface PageUi {
  correctlyModal?: CorrectlyModal;
  correctlyHandle?: { modalOpen(open: boolean): void };
  correctlyUndo?: UndoToast;
  correctlyPanel?: { busy: boolean; close(): void };
}
const pageUi = globalThis as PageUi;

const CSS = `
:host { all: initial; }
.scrim { position: fixed; inset: 0; z-index: 2147483646; background: rgba(8, 10, 14, 0.3); }
.modal {
  --solid: #181b22; --glass: rgba(24, 27, 34, 0.9); --surface: rgba(255, 255, 255, 0.06);
  --text: #eef1f6; --muted: #a5adbb; --border: rgba(255, 255, 255, 0.13);
  --accent: #6d95ff; --accent-text: #0b1020; --warn: #f2c66d; --error: #ff8a80; --ok: #7ad69b;
  position: fixed; z-index: 2147483647; top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  box-sizing: border-box;
  width: min(640px, calc(100vw - 24px));
  height: min(520px, calc(100vh - 24px));
  height: min(520px, calc(100dvh - 24px));
  display: flex; flex-direction: column; overflow: hidden;
  border: 1px solid var(--border); border-radius: 16px;
  background: var(--solid); color: var(--text);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.42);
  font: 14px/1.5 system-ui, -apple-system, 'Segoe UI', sans-serif;
  animation: correctly-in 140ms ease-out;
}
@supports ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .modal { background: var(--glass); backdrop-filter: blur(18px) saturate(140%); -webkit-backdrop-filter: blur(18px) saturate(140%); }
}
@media (prefers-color-scheme: light) {
  .modal {
    --solid: #ffffff; --glass: rgba(255, 255, 255, 0.92); --surface: rgba(15, 20, 30, 0.05);
    --text: #15181e; --muted: #5d6573; --border: rgba(15, 20, 30, 0.14);
    --accent: #2357d9; --accent-text: #ffffff; --warn: #8a5a00; --error: #b42318; --ok: #1d7a42;
  }
}
@keyframes correctly-in { from { opacity: 0; transform: translate(-50%, -50%) scale(0.98); } }
@media (prefers-reduced-motion: reduce) { .modal { animation: none; } }
.head { flex: none; display: flex; align-items: center; gap: 10px; padding: 12px 12px 8px 16px; }
.head h1 { flex: 1; margin: 0; font-size: 15px; font-weight: 650; }
.icon {
  width: 34px; height: 34px; padding: 0; display: inline-grid; place-items: center;
  border: 1px solid transparent; border-radius: 8px; background: transparent;
  color: var(--muted); cursor: pointer;
}
.icon:hover { background: var(--surface); color: var(--text); }
.tabs { flex: none; display: flex; gap: 4px; padding: 0 12px; border-bottom: 1px solid var(--border); overflow-x: auto; }
[role='tab'] {
  font: inherit; padding: 8px 10px; margin: 0; cursor: pointer; white-space: nowrap;
  border: 0; border-bottom: 2px solid transparent; border-radius: 0;
  background: transparent; color: var(--muted);
}
[role='tab'][aria-selected='true'] { color: var(--text); border-bottom-color: var(--accent); font-weight: 600; }
.body { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 12px 16px; }
.label { display: block; margin: 0 0 4px; font-size: 12px; color: var(--muted); }
textarea {
  box-sizing: border-box; width: 100%; min-height: 96px; max-height: 240px; resize: vertical;
  padding: 8px 10px; font: inherit; color: var(--text); background: var(--surface);
  border: 1px solid var(--border); border-radius: 10px;
}
.hint { margin: 6px 0 0; color: var(--muted); font-size: 13px; }
.hint:empty, .quota:empty, .status:empty, .note:empty { display: none; }
[role='tabpanel'] { margin-top: 12px; }
.row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 10px; }
.status { margin: 10px 0 0; font-weight: 600; }
.status[data-tone='error'] { color: var(--error); }
.quota { margin: 6px 0 0; color: var(--warn); font-size: 13px; }
h2 { margin: 12px 0 2px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.02em; color: var(--muted); }
.text { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; user-select: text; }
button {
  font: inherit; min-height: 34px; padding: 4px 14px; cursor: pointer;
  border: 1px solid var(--border); border-radius: 8px; background: transparent; color: var(--text);
}
button.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-text); font-weight: 600; }
button:disabled { opacity: 0.5; cursor: not-allowed; }
button:focus-visible, textarea:focus-visible, select:focus-visible, input:focus-visible {
  outline: 2px solid var(--accent); outline-offset: 2px;
}
fieldset { margin: 10px 0 0; padding: 6px 10px 8px; border: 1px solid var(--border); border-radius: 10px; }
legend { padding: 0 4px; font-size: 12px; color: var(--muted); }
.choice { display: flex; gap: 8px; align-items: baseline; margin: 4px 0; }
.choice small { color: var(--muted); }
.card { display: block; margin-top: 8px; padding: 8px 10px; border: 1px solid var(--border); border-radius: 10px; cursor: pointer; }
.card:has(input:checked) { border-color: var(--accent); }
.card strong { margin-left: 6px; }
.card .text { margin-top: 4px; }
.langs { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; }
.field { display: flex; flex-direction: column; gap: 2px; font-size: 12px; color: var(--muted); }
select {
  font: inherit; font-size: 14px; color: var(--text); background: var(--solid);
  border: 1px solid var(--border); border-radius: 6px; padding: 4px 6px; min-height: 32px;
}
.foot {
  flex: none; display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
  padding: 10px 16px 14px; border-top: 1px solid var(--border);
}
.note { flex: 1 1 100%; margin: 0; color: var(--warn); font-size: 13px; }
.note[data-tone='ok'] { color: var(--ok); }
@media (forced-colors: active) {
  .modal { border: 1px solid CanvasText; }
  [role='tab'][aria-selected='true'] { border-bottom-color: Highlight; }
}
[hidden] { display: none !important; }
`;

const TOAST_CSS = `
:host { all: initial; }
.toast {
  position: fixed; z-index: 2147483647; left: 50%; bottom: 24px; transform: translateX(-50%);
  box-sizing: border-box; max-width: calc(100vw - 24px);
  display: flex; flex-wrap: wrap; gap: 12px; align-items: center; padding: 8px 8px 8px 14px;
  border: 1px solid rgba(255, 255, 255, 0.14); border-radius: 12px;
  background: #181b22; color: #eef1f6; box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
  font: 14px/1.4 system-ui, -apple-system, 'Segoe UI', sans-serif;
}
@media (prefers-color-scheme: light) {
  .toast { background: #ffffff; color: #15181e; border-color: rgba(15, 20, 30, 0.14); }
}
button {
  font: inherit; min-height: 32px; padding: 4px 12px; cursor: pointer; font-weight: 600;
  border: 1px solid currentColor; border-radius: 8px; background: transparent; color: inherit;
}
button:disabled { opacity: 0.5; cursor: not-allowed; }
button:focus-visible { outline: 2px solid #6d95ff; outline-offset: 2px; }
@media (forced-colors: active) { .toast { border: 1px solid CanvasText; } }
`;

const FOCUSABLE =
  'button:not([disabled]), textarea:not([disabled]), select:not([disabled]), input:not([disabled])';

/** Keys of the page must not see typing inside the modal (site shortcuts). */
const ISOLATED_EVENTS = ['keydown', 'keyup', 'keypress', 'input'] as const;

export class CorrectlyModal {
  readonly host: HTMLElement;
  /** Closed root: page scripts cannot read or click into it. Exposed for tests. */
  readonly root: ShadowRoot;
  /** False once hidden: this session is over and late answers are dropped. */
  visible = true;
  activeTab: ModalTab = 'correction';
  sharedText: string;
  /** Bumped by every real change of the shared text. */
  revision = 0;
  /** The verified original selection, or null (Apply disabled, Copy only). */
  readonly target: Snapshot | null;
  private readonly captureNotice: string;
  private readonly rewriteEnabled: boolean;
  private tabs: Record<ModalTab, TabState> = emptyTabs();
  private nextToken = 0;
  private composing = false;
  private copied = '';
  private readonly make: <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className?: string,
    text?: string,
  ) => HTMLElementTagNameMap[K];
  private readonly ui: {
    textarea: HTMLTextAreaElement;
    textNote: HTMLElement;
    tab: Record<ModalTab, HTMLButtonElement>;
    panel: Record<ModalTab, HTMLElement>;
    generate: Record<ModalTab, HTMLButtonElement>;
    status: Record<ModalTab, HTMLElement>;
    quota: Record<ModalTab, HTMLElement>;
    limits: Record<ModalTab, HTMLButtonElement>;
    results: Record<ModalTab, HTMLElement>;
    rewriteStyles: HTMLInputElement[];
    translateStyles: HTMLInputElement[];
    translateStyleBox: HTMLElement;
    from: HTMLSelectElement;
    to: HTMLSelectElement;
    variant: HTMLSelectElement;
    variantRow: HTMLElement;
    alsoRewrite: HTMLInputElement;
    sameNote: HTMLElement;
    summaryTo: HTMLSelectElement;
    summaryVariant: HTMLSelectElement;
    summaryVariantRow: HTMLElement;
    summaryLength: HTMLSelectElement;
    summaryFormat: HTMLSelectElement;
    apply: HTMLButtonElement;
    copy: HTMLButtonElement;
    cancel: HTMLButtonElement;
    note: HTMLElement;
    settings: HTMLButtonElement;
    hide: HTMLButtonElement;
  };

  constructor(
    private readonly doc: Document,
    captured: Snapshot | string,
    options: ModalOptions,
    private readonly send: Send,
  ) {
    this.target = typeof captured === 'string' ? null : captured;
    this.sharedText = this.target?.text ?? '';
    this.captureNotice =
      typeof captured === 'string'
        ? captured !== NOTICES.select
          ? captured
          : ''
        : captured.source === 'read_only_page'
          ? NOTICES.pageText
          : '';
    this.rewriteEnabled = options.rewriteEnabled;
    this.host = doc.createElement('correctly-modal');
    this.root = this.host.attachShadow({ mode: 'closed' });
    const make = <K extends keyof HTMLElementTagNameMap>(
      tag: K,
      className = '',
      text = '',
    ) => {
      const node = doc.createElement(tag);
      if (className) node.className = className;
      node.textContent = text;
      return node;
    };
    this.make = make;

    const style = make('style');
    style.textContent = CSS;
    const scrim = make('div', 'scrim');
    const modal = make('div', 'modal');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'correctly-title');

    // Header: identity, then exactly Settings and Hide (no X by design).
    const head = make('header', 'head');
    const title = make('h1', '', 'Correctly');
    title.id = 'correctly-title';
    const iconButton = (label: string, glyph: SVGSVGElement) => {
      const node = make('button', 'icon');
      node.type = 'button';
      node.title = label;
      node.setAttribute('aria-label', label);
      node.append(glyph);
      return node;
    };
    const settings = iconButton('Open Correctly settings', gearIcon(doc));
    const hide = iconButton('Hide Correctly', hideIcon(doc));
    head.append(logo(doc, 22), title, settings, hide);

    const tablist = make('div', 'tabs');
    tablist.setAttribute('role', 'tablist');
    tablist.setAttribute('aria-label', 'Correctly actions');
    const body = make('div', 'body');
    const label = make('label', 'label', 'Text');
    label.htmlFor = 'correctly-text';
    const textarea = make('textarea');
    textarea.id = 'correctly-text';
    textarea.dir = 'auto';
    textarea.spellcheck = true;
    textarea.value = this.sharedText;
    textarea.placeholder = 'Type or paste text here.';
    const textNote = make('p', 'hint');
    textNote.setAttribute('aria-live', 'polite');
    body.append(label, textarea, textNote);

    const tab = {} as Record<ModalTab, HTMLButtonElement>;
    const panel = {} as Record<ModalTab, HTMLElement>;
    const generate = {} as Record<ModalTab, HTMLButtonElement>;
    const status = {} as Record<ModalTab, HTMLElement>;
    const quota = {} as Record<ModalTab, HTMLElement>;
    const limits = {} as Record<ModalTab, HTMLButtonElement>;
    const results = {} as Record<ModalTab, HTMLElement>;
    for (const item of MODAL_TABS) {
      const button = make('button', '', item.label);
      button.type = 'button';
      button.id = `correctly-tab-${item.id}`;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-controls', `correctly-panel-${item.id}`);
      tablist.append(button);
      tab[item.id] = button;
      const section = make('section');
      section.id = `correctly-panel-${item.id}`;
      section.setAttribute('role', 'tabpanel');
      section.setAttribute('aria-labelledby', button.id);
      panel[item.id] = section;
      generate[item.id] = Object.assign(
        make('button', 'primary', item.action),
        { type: 'button' },
      );
      status[item.id] = make('p', 'status');
      status[item.id].setAttribute('role', 'status');
      status[item.id].setAttribute('aria-live', 'polite');
      quota[item.id] = make('p', 'quota');
      quota[item.id].setAttribute('aria-live', 'polite');
      limits[item.id] = Object.assign(make('button', '', 'Manage limits'), {
        type: 'button',
      });
      results[item.id] = make('div', 'results');
      body.append(section);
    }

    // Correction: no options.
    panel.correction.append(
      make(
        'p',
        'hint',
        'Fixes spelling and grammar. The text is sent to your AI provider only when you click Generate correction.',
      ),
    );

    // Reformulation: the V5.4 styles; all chosen styles in ONE request.
    const styleBoxes = (defaults: readonly RewriteStyleId[]) => {
      const fieldset = make('fieldset');
      fieldset.append(make('legend', '', 'Styles'));
      const boxes = REWRITE_STYLES.map((item) => {
        const row = make('label', 'choice');
        const box = make('input');
        box.type = 'checkbox';
        box.value = item.id;
        box.checked = defaults.includes(item.id);
        row.append(
          box,
          make('span', '', item.label),
          make('small', '', item.description),
        );
        fieldset.append(row);
        return box;
      });
      return { fieldset, boxes };
    };
    const normalized = normalizeStyleIds(options.styles);
    const defaults: RewriteStyleId[] = normalized.length
      ? normalized
      : ['professional'];
    const rewrite = styleBoxes(defaults);
    panel.reformulation.append(
      ...(options.rewriteEnabled
        ? [
            rewrite.fieldset,
            make(
              'p',
              'hint',
              'All chosen styles are generated in ONE AI request, which may count against your quota.',
            ),
          ]
        : [make('p', 'hint', NOTICES.rewriteOff)]),
    );

    // Translation: the V5.5 languages, Arabic variant and optional styles.
    const prefs = normalizeTranslation(options.translation);
    const select = (
      text: string,
      items: readonly { id: string; label: string }[],
      value: string,
    ) => {
      const wrap = make('label', 'field');
      const node = make('select');
      for (const item of items) {
        const option = make('option', '', item.label);
        option.value = item.id;
        node.append(option);
      }
      node.value = value;
      wrap.append(make('span', '', text), node);
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
    const langs = make('div', 'langs');
    langs.append(from.wrap, to.wrap, variant.wrap);
    const also = make('label', 'choice');
    const alsoRewrite = make('input');
    alsoRewrite.type = 'checkbox';
    also.append(alsoRewrite, make('span', '', 'Also rewrite in a style'));
    const translate = styleBoxes(defaults);
    const sameNote = make('p', 'hint');
    sameNote.setAttribute('aria-live', 'polite');
    panel.translation.append(langs, also, translate.fieldset, sameNote);

    // Summary (V5.12): written directly in the chosen language, ONE request.
    const summaryTo = select('Summary language', languages, prefs.target);
    const summaryVariant = select(
      'Arabic variant',
      ARABIC_VARIANTS,
      prefs.arabicVariant,
    );
    const summaryLength = select(
      'Length',
      SUMMARY_LENGTHS,
      DEFAULT_SUMMARY_LENGTH,
    );
    const summaryFormat = select(
      'Format',
      SUMMARY_FORMATS,
      DEFAULT_SUMMARY_FORMAT,
    );
    const summaryOptions = make('div', 'langs');
    summaryOptions.append(
      summaryTo.wrap,
      summaryVariant.wrap,
      summaryLength.wrap,
      summaryFormat.wrap,
    );
    panel.summary.append(
      summaryOptions,
      make(
        'p',
        'hint',
        'The summary is written directly in the chosen language in ONE AI request. Only the text above is sent, when you click Generate summary.',
      ),
    );

    for (const item of MODAL_TABS) {
      const row = make('div', 'row');
      row.append(generate[item.id], limits[item.id]);
      panel[item.id].append(
        row,
        status[item.id],
        quota[item.id],
        results[item.id],
      );
    }

    const foot = make('footer', 'foot');
    const note = make('p', 'note');
    note.setAttribute('aria-live', 'polite');
    const apply = Object.assign(make('button', 'primary', 'Apply'), {
      type: 'button',
    });
    const copy = Object.assign(make('button', '', 'Copy'), { type: 'button' });
    const cancel = Object.assign(make('button', '', 'Cancel'), {
      type: 'button',
    });
    foot.append(note, apply, copy, cancel);
    modal.append(head, tablist, body, foot);
    this.root.append(style, scrim, modal);

    this.ui = {
      textarea,
      textNote,
      tab,
      panel,
      generate,
      status,
      quota,
      limits,
      results,
      rewriteStyles: rewrite.boxes,
      translateStyles: translate.boxes,
      translateStyleBox: translate.fieldset,
      from: from.node,
      to: to.node,
      variant: variant.node,
      variantRow: variant.wrap,
      alsoRewrite,
      sameNote,
      summaryTo: summaryTo.node,
      summaryVariant: summaryVariant.node,
      summaryVariantRow: summaryVariant.wrap,
      summaryLength: summaryLength.node,
      summaryFormat: summaryFormat.node,
      apply,
      copy,
      cancel,
      note,
      settings,
      hide,
    };

    textarea.addEventListener('input', () => this.setText(textarea.value));
    for (const item of MODAL_TABS) {
      tab[item.id].addEventListener('click', () => this.selectTab(item.id));
      generate[item.id].addEventListener(
        'click',
        () => void this.generate(item.id),
      );
      limits[item.id].addEventListener('click', () => {
        void this.send({ type: OPEN_LIMITS }).catch(() => undefined);
      });
    }
    // Changing options never sends; it only drops that tab's older result.
    for (const box of rewrite.boxes)
      box.addEventListener('change', () =>
        this.optionsChanged('reformulation'),
      );
    for (const node of [
      from.node,
      to.node,
      variant.node,
      alsoRewrite,
      ...translate.boxes,
    ])
      node.addEventListener('change', () => this.optionsChanged('translation'));
    for (const node of [
      summaryTo.node,
      summaryVariant.node,
      summaryLength.node,
      summaryFormat.node,
    ])
      node.addEventListener('change', () => this.optionsChanged('summary'));
    apply.addEventListener('click', () => this.apply());
    copy.addEventListener('click', () => void this.copy());
    cancel.addEventListener('click', () => this.cancel());
    settings.addEventListener('click', () => {
      void this.send({ type: OPEN_SETTINGS }).catch(() => undefined);
    });
    hide.addEventListener('click', () => this.hide());
    tablist.addEventListener('keydown', (event) => this.onTabKey(event));
    this.root.addEventListener('keydown', (event) =>
      this.onKey(event as KeyboardEvent),
    );
    for (const type of ISOLATED_EVENTS)
      this.root.addEventListener(type, (event) => event.stopPropagation());
    this.watch(true);

    this.render();
    doc.documentElement.append(this.host);
  }

  // --- state changes ----------------------------------------------------

  /** One real edit of the shared text clears every tab's result. */
  setText(next: string): void {
    if (!this.visible || next === this.sharedText) return;
    this.sharedText = next;
    if (this.ui.textarea.value !== next) this.ui.textarea.value = next;
    this.revision += 1;
    this.copied = '';
    this.tabs = emptyTabs();
    for (const item of MODAL_TABS) this.renderResults(item.id);
    this.render();
  }

  /** Switching keeps the shared text and every tab's result; nothing is sent. */
  selectTab(id: ModalTab, focus = false): void {
    if (!this.visible) return;
    this.activeTab = id;
    this.copied = '';
    this.render();
    if (focus) this.ui.tab[id].focus();
  }

  private optionsChanged(tab: ModalTab) {
    // A result no longer matches the options shown: drop it, never relabel it.
    if (!this.tabs[tab].pending) {
      this.tabs[tab] = emptyTab();
      this.renderResults(tab);
    }
    this.copied = '';
    this.render();
  }

  /** Why the shared text cannot be sent by this tab ('' = it can). */
  private textProblem(tab: ModalTab = this.activeTab): string {
    if (!this.sharedText.trim()) return 'empty';
    const max = TEXT_LIMITS[tab];
    if ([...this.sharedText].length <= max) return '';
    // Never cut automatically: the user shortens the text or switches tab.
    return max === MAX_SUMMARY_CODE_POINTS
      ? `Summary accepts at most ${max.toLocaleString('en')} characters; nothing is cut automatically.`
      : `${NOTICES.tooLong} Summary accepts up to ${MAX_SUMMARY_CODE_POINTS.toLocaleString('en')}.`;
  }

  private summaryChoice(): SummaryOptions {
    const { summaryTo, summaryVariant, summaryLength, summaryFormat } = this.ui;
    const target = isLanguageId(summaryTo.value) ? summaryTo.value : 'en';
    return {
      target,
      variant:
        target === 'ar' && isArabicVariant(summaryVariant.value)
          ? summaryVariant.value
          : null,
      length: isSummaryLength(summaryLength.value)
        ? summaryLength.value
        : DEFAULT_SUMMARY_LENGTH,
      format: isSummaryFormat(summaryFormat.value)
        ? summaryFormat.value
        : DEFAULT_SUMMARY_FORMAT,
    };
  }

  private chosenStyles(boxes: HTMLInputElement[]): RewriteStyleId[] {
    return normalizeStyleIds(
      boxes.filter((box) => box.checked).map((box) => box.value),
    );
  }

  private translationChoice(): TranslationChoice {
    const { from, to, variant, alsoRewrite } = this.ui;
    const target = isLanguageId(to.value) ? to.value : 'en';
    const source =
      from.value === 'auto' || isLanguageId(from.value) ? from.value : 'auto';
    return {
      source,
      target,
      variant:
        target === 'ar' && isArabicVariant(variant.value)
          ? variant.value
          : null,
      styleIds: alsoRewrite.checked
        ? this.chosenStyles(this.ui.translateStyles)
        : [],
    };
  }

  /** Generate is possible for this tab now (no request in flight, valid input). */
  ready(tab: ModalTab): boolean {
    if (!this.visible || this.tabs[tab].pending || this.textProblem(tab))
      return false;
    if (tab === 'reformulation')
      return (
        this.rewriteEnabled &&
        this.chosenStyles(this.ui.rewriteStyles).length > 0
      );
    if (tab === 'translation') {
      const choice = this.translationChoice();
      return (
        choice.source !== choice.target &&
        (!this.ui.alsoRewrite.checked || choice.styleIds.length > 0)
      );
    }
    return true;
  }

  /**
   * One explicit click → one request for that tab. The answer is shown only
   * if this session is still open, the text unchanged and the tab still
   * waiting for this very request.
   */
  async generate(tab: ModalTab): Promise<void> {
    if (!this.ready(tab)) return;
    const token = ++this.nextToken;
    const revision = this.revision;
    const text = this.sharedText;
    const loading = MODAL_TABS.find((item) => item.id === tab)?.loading ?? '';
    this.tabs[tab] = { ...emptyTab(), pending: token, status: loading };
    this.copied = '';
    this.renderResults(tab);
    this.render();

    let message: unknown;
    let parse: (reply: unknown) => TabState;
    if (tab === 'correction') {
      message = { type: CORRECT_TEXT, text };
      parse = (reply) => this.parseCorrection(reply);
    } else if (tab === 'reformulation') {
      const styles = this.chosenStyles(this.ui.rewriteStyles);
      message = { type: REWRITE_TEXT, text, styleIds: styles };
      parse = (reply) =>
        this.parseCandidates(reply, styles, styleLabel, text, 'reformulation');
    } else if (tab === 'summary') {
      // Options are frozen with the request (the controls stay locked while
      // it runs), so the label always matches what was asked.
      const choice = this.summaryChoice();
      const target = targetLabel(choice.target, choice.variant);
      message = { type: SUMMARIZE_TEXT, text, ...choice };
      parse = (reply) =>
        this.parseSummary(reply, `Summary → ${target}`, choice.target);
    } else {
      const choice = this.translationChoice();
      const target = targetLabel(choice.target, choice.variant);
      message = { type: TRANSLATE_TEXT, text, ...choice };
      parse = (reply) =>
        this.parseCandidates(
          reply,
          translationKeys(choice.styleIds),
          (key: TranslationKey) =>
            key === NEUTRAL
              ? `Translation → ${target}`
              : `${styleLabel(key)} → ${target}`,
          text,
          'translation',
          `The text already seems to be in ${target}. Nothing to translate: use Reformulation to change its style.`,
        );
    }
    let reply: unknown;
    try {
      reply = await this.send(message);
    } catch {
      // Worker restarted or channel closed: shown as an error, nothing applied.
      reply = undefined;
    }
    if (
      !this.visible ||
      revision !== this.revision ||
      this.tabs[tab].pending !== token
    )
      return;
    this.tabs[tab] = parse(reply);
    this.renderResults(tab);
    this.render();
  }

  private withQuota(
    state: TabState,
    result:
      | { ok: true; notice?: QuotaNote }
      | { ok: false; code: ErrorCode; quota?: QuotaNote; notice?: QuotaNote },
  ): TabState {
    const note = result.ok ? result.notice : (result.quota ?? result.notice);
    return {
      ...state,
      quota: note ? describeNote(note) : '',
      urgent: !!note && (note.blocked || note.level === 100),
      limits: !!note || (!result.ok && LIMIT_CODES.includes(result.code)),
    };
  }

  private parseCorrection(reply: unknown): TabState {
    const result = toCorrectionResult(reply);
    const state = this.withQuota(emptyTab(), result);
    if (!result.ok)
      return {
        ...state,
        status: `${result.message} Your text was not changed.`,
        tone: 'error',
      };
    if (!result.hasErrors)
      return { ...state, status: 'No corrections needed.' };
    return {
      ...state,
      status: 'Suggested correction',
      operationId: result.operationId ?? null,
      choices: [
        {
          label: 'Corrected',
          text: result.correctedText,
          suspicious: result.suspicious,
        },
      ],
      chosen: 0,
    };
  }

  private parseSummary(reply: unknown, label: string, lang: string): TabState {
    const result = toSummaryResult(reply);
    const state = this.withQuota(emptyTab(), result);
    if (!result.ok)
      return {
        ...state,
        status: `${result.message} Your text was not changed.`,
        tone: 'error',
      };
    if (result.unsummarizable)
      return {
        ...state,
        status:
          'This text cannot be summarized faithfully (too short, unclear or incomplete). Nothing was invented.',
      };
    return {
      ...state,
      status: 'Suggested summary.',
      operationId: result.operationId ?? null,
      choices: [
        { label, text: result.text, suspicious: result.suspicious, lang },
      ],
      chosen: 0,
    };
  }

  private parseCandidates<K extends string>(
    reply: unknown,
    keys: readonly K[],
    label: (key: K) => string,
    text: string,
    tab: 'reformulation' | 'translation',
    sameLanguage = '',
  ): TabState {
    const result = toRewriteResult(reply, keys);
    const state = this.withQuota(emptyTab(), result);
    if (!result.ok)
      return {
        ...state,
        status: `${result.message} Your text was not changed.`,
        tone: 'error',
      };
    if (result.sameLanguage) return { ...state, status: sameLanguage };
    const useful = result.candidates.filter(
      (candidate) => candidate.text !== text,
    );
    const missing = keys.filter(
      (key) => !useful.some((candidate) => candidate.styleId === key),
    );
    const noun = tab === 'translation' ? 'translation' : 'reformulation';
    const lacking = missing.length
      ? ` No ${noun} was returned for: ${missing.map(label).join(', ')}.`
      : '';
    if (!useful.length)
      return { ...state, status: `No meaningful ${noun} was generated.` };
    return {
      ...state,
      status:
        (useful.length > 1
          ? `Choose a ${noun}, then Apply or Copy.`
          : `Suggested ${noun}.`) + lacking,
      operationId: result.operationId ?? null,
      choices: useful.map((candidate) => ({
        label: label(candidate.styleId),
        text: candidate.text,
        suspicious: candidate.suspicious,
      })),
      chosen: 0,
    };
  }

  private choice(): Choice | undefined {
    const state = this.tabs[this.activeTab];
    return state.choices[state.chosen];
  }

  /** Why Apply must not run now ('' = safe): the V5.2 guard, unchanged. */
  private blocker(choice: Choice): string {
    if (!this.target) return NOTICES.noTarget;
    if (choice.suspicious) return NOTICES.suspicious;
    return applyBlocker(this.target, this.composing);
  }

  /**
   * Replaces exactly the original selection (same field, value and range),
   * then hides the modal and offers Undo for five seconds.
   */
  apply(): boolean {
    const choice = this.choice();
    if (!this.visible || !choice) return false;
    const field = this.target?.field;
    if (this.blocker(choice) || !this.target || !field) {
      this.render();
      return false;
    }
    const { start, end, text: before } = this.target;
    replaceRange(field, start, end, choice.text);
    const stop = start + choice.text.length;
    const operationId = this.tabs[this.activeTab].operationId;
    const report = (action: 'applied' | 'undone') => {
      if (operationId)
        void this.send({ type: AI_EDIT, operationId, action }).catch(
          () => undefined,
        );
    };
    // Counted only when the field really holds the applied text.
    if (field.value.slice(start, stop) === choice.text) report('applied');
    const applied = { start, end: stop, before, value: field.value };
    this.hide();
    showUndo(this.doc, field, applied, () => report('undone'));
    return true;
  }

  async copy(): Promise<void> {
    const choice = this.choice();
    if (!this.visible || !choice) return;
    try {
      await navigator.clipboard.writeText(choice.text);
      this.copied = 'Copied.';
    } catch {
      this.copied = 'Copy failed. Select the result and copy it manually.';
    }
    if (this.visible) this.renderFooter();
  }

  /** Discards this tab's result or waiting request; never edits the page. */
  cancel(): void {
    if (!this.visible) return;
    const pending = this.tabs[this.activeTab].pending;
    this.tabs[this.activeTab] = {
      ...emptyTab(),
      status: pending
        ? 'Cancelled. A request already sent may still count in your usage.'
        : '',
    };
    this.copied = '';
    this.renderResults(this.activeTab);
    this.render();
  }

  /** Ends the session: nothing is applied, copied or sent; the handle returns. */
  hide(): void {
    if (!this.visible) return;
    this.visible = false;
    this.watch(false);
    const field = this.target?.field;
    const restore = this.host.isConnected && field?.isConnected;
    this.host.remove();
    if (pageUi.correctlyModal === this) delete pageUi.correctlyModal;
    pageUi.correctlyHandle?.modalOpen(false);
    if (restore) field?.focus({ preventScroll: true });
  }

  focus(): void {
    if (this.visible) this.ui.textarea.focus({ preventScroll: true });
  }

  // --- page field and keyboard ------------------------------------------

  private readonly onCompositionStart = () => {
    this.composing = true;
    this.renderFooter();
  };
  private readonly onCompositionEnd = () => {
    this.composing = false;
    this.renderFooter();
  };
  private readonly onFieldInput = () => this.renderFooter();

  private watch(on: boolean) {
    const field = this.target?.field;
    if (!field) return;
    const method = on ? 'addEventListener' : 'removeEventListener';
    field[method]('input', this.onFieldInput);
    field[method]('compositionstart', this.onCompositionStart);
    field[method]('compositionend', this.onCompositionEnd);
  }

  private onTabKey(event: KeyboardEvent) {
    const ids = MODAL_TABS.map((item) => item.id);
    const index = ids.indexOf(this.activeTab);
    const next =
      event.key === 'ArrowRight'
        ? ids[(index + 1) % ids.length]
        : event.key === 'ArrowLeft'
          ? ids[(index + ids.length - 1) % ids.length]
          : event.key === 'Home'
            ? ids[0]
            : event.key === 'End'
              ? ids[ids.length - 1]
              : undefined;
    if (!next) return;
    event.preventDefault();
    this.selectTab(next, true);
  }

  private onKey(event: KeyboardEvent) {
    // Escape = keyboard equivalent of Hide (there is no close button).
    if (event.key === 'Escape') {
      event.preventDefault();
      this.hide();
      return;
    }
    if (event.key !== 'Tab') return;
    // Focus stays inside the dialog while it is open.
    const items = [
      ...this.root.querySelectorAll<HTMLElement>(FOCUSABLE),
    ].filter((node) => !node.closest('[hidden]'));
    const first = items[0];
    const last = items[items.length - 1];
    const active = this.root.activeElement;
    if (!first || !last) return;
    if (event.shiftKey && (active === first || !active)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !active)) {
      event.preventDefault();
      first.focus();
    }
  }

  // --- rendering --------------------------------------------------------

  private renderResults(tab: ModalTab) {
    const state = this.tabs[tab];
    const box = this.ui.results[tab];
    box.replaceChildren();
    const [only] = state.choices;
    if (!only) return;
    const text = (value: string, lang = '') =>
      Object.assign(this.make('p', 'text', value), { dir: 'auto', lang });
    if (state.choices.length === 1) {
      box.append(this.make('h2', '', only.label), text(only.text, only.lang));
      return;
    }
    const group = this.make('div');
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-label', 'Results');
    state.choices.forEach((choice, index) => {
      const card = this.make('label', 'card');
      const radio = this.make('input');
      radio.type = 'radio';
      radio.name = `correctly-${tab}`;
      radio.checked = index === state.chosen;
      // Choosing only changes what Apply/Copy use; it never edits the page.
      radio.addEventListener('change', () => {
        if (this.tabs[tab] !== state) return;
        state.chosen = index;
        this.copied = '';
        this.renderFooter();
      });
      card.append(
        radio,
        this.make('strong', '', choice.label),
        text(choice.text),
      );
      group.append(card);
    });
    box.append(group);
  }

  private render() {
    if (!this.visible) return;
    const { ui } = this;
    const problem = this.textProblem();
    ui.textNote.textContent =
      problem && problem !== 'empty' ? problem : this.captureNotice;
    for (const item of MODAL_TABS) {
      const id = item.id;
      const selected = id === this.activeTab;
      const state = this.tabs[id];
      ui.tab[id].setAttribute('aria-selected', String(selected));
      ui.tab[id].tabIndex = selected ? 0 : -1;
      ui.panel[id].hidden = !selected;
      ui.panel[id].setAttribute('aria-busy', String(!!state.pending));
      ui.generate[id].disabled = !this.ready(id);
      ui.status[id].textContent = state.status;
      ui.status[id].dataset.tone = state.tone;
      ui.quota[id].textContent = state.quota;
      ui.quota[id].setAttribute(
        'aria-live',
        state.urgent ? 'assertive' : 'polite',
      );
      ui.limits[id].hidden = !state.limits;
    }
    const busyRewrite = !!this.tabs.reformulation.pending;
    for (const box of ui.rewriteStyles) box.disabled = busyRewrite;
    const busyTranslate = !!this.tabs.translation.pending;
    for (const node of [
      ui.from,
      ui.to,
      ui.variant,
      ui.alsoRewrite,
      ...ui.translateStyles,
    ])
      node.disabled = busyTranslate;
    ui.variantRow.hidden = ui.to.value !== 'ar';
    ui.translateStyleBox.hidden = !ui.alsoRewrite.checked;
    const busySummary = !!this.tabs.summary.pending;
    for (const node of [
      ui.summaryTo,
      ui.summaryVariant,
      ui.summaryLength,
      ui.summaryFormat,
    ])
      node.disabled = busySummary;
    ui.summaryVariantRow.hidden = ui.summaryTo.value !== 'ar';
    const choice = this.translationChoice();
    ui.sameNote.textContent =
      choice.source === choice.target
        ? 'Source and target are the same: use Reformulation instead.'
        : '';
    this.renderFooter();
  }

  private renderFooter() {
    if (!this.visible) return;
    const state = this.tabs[this.activeTab];
    const choice = this.choice();
    const blocker = choice ? this.blocker(choice) : '';
    this.ui.apply.disabled = !choice || !!blocker;
    this.ui.copy.disabled = !choice;
    this.ui.cancel.disabled = !state.pending && !choice && !state.status;
    this.ui.note.textContent = this.copied || blocker;
    this.ui.note.dataset.tone = this.copied === 'Copied.' ? 'ok' : 'warn';
  }
}

interface Applied {
  start: number;
  end: number;
  before: string;
  value: string;
}

/** The five-second Undo offer after a successful Apply (modal hidden). */
export class UndoToast {
  readonly host: HTMLElement;
  /** Closed root, exposed for tests. */
  readonly root: ShadowRoot;
  readonly button: HTMLButtonElement;
  private readonly message: HTMLElement;
  private composing = false;
  private readonly timer: ReturnType<typeof setTimeout>;

  constructor(
    doc: Document,
    private readonly field: TextField,
    private readonly applied: Applied,
    private readonly onUndone: () => void,
    ms = UNDO_MS,
  ) {
    this.host = doc.createElement('correctly-undo');
    this.root = this.host.attachShadow({ mode: 'closed' });
    const style = doc.createElement('style');
    style.textContent = TOAST_CSS;
    const toast = doc.createElement('div');
    toast.className = 'toast';
    toast.setAttribute('role', 'status');
    this.message = doc.createElement('span');
    this.message.textContent = 'Text replaced.';
    this.button = doc.createElement('button');
    this.button.type = 'button';
    this.button.textContent = 'Undo';
    this.button.addEventListener('mousedown', (event) =>
      event.preventDefault(),
    );
    this.button.addEventListener('click', () => this.undo());
    toast.append(this.message, this.button);
    this.root.append(style, toast);
    field.addEventListener('compositionstart', this.onCompositionStart);
    field.addEventListener('compositionend', this.onCompositionEnd);
    // Expiry only removes the offer; it never edits anything.
    this.timer = setTimeout(() => this.dismiss(), ms);
    doc.documentElement.append(this.host);
  }

  private readonly onCompositionStart = () => (this.composing = true);
  private readonly onCompositionEnd = () => (this.composing = false);

  /** Same guard as V5.2: nothing typed since Apply, field still editable. */
  canUndo(): boolean {
    const field = this.field;
    return (
      this.host.isConnected &&
      field.isConnected &&
      !field.disabled &&
      !field.readOnly &&
      !this.composing &&
      field.value === this.applied.value
    );
  }

  /** Restores the original text only when safe; never calls the AI provider. */
  undo(): boolean {
    if (!this.canUndo()) {
      this.button.disabled = true;
      this.message.textContent =
        'The text changed after Apply, so it cannot be undone safely.';
      return false;
    }
    const { start, end, before } = this.applied;
    replaceRange(this.field, start, end, before);
    if (this.field.value.slice(start, start + before.length) === before)
      this.onUndone();
    this.dismiss();
    this.field.focus({ preventScroll: true });
    return true;
  }

  dismiss(): void {
    clearTimeout(this.timer);
    this.field.removeEventListener('compositionstart', this.onCompositionStart);
    this.field.removeEventListener('compositionend', this.onCompositionEnd);
    this.host.remove();
    if (pageUi.correctlyUndo === this) delete pageUi.correctlyUndo;
  }
}

/** One Undo offer at a time: a newer Apply replaces the previous offer. */
function showUndo(
  doc: Document,
  field: TextField,
  applied: Applied,
  onUndone: () => void,
): UndoToast {
  pageUi.correctlyUndo?.dismiss();
  const toast = new UndoToast(doc, field, applied, onUndone);
  pageUi.correctlyUndo = toast;
  return toast;
}

/**
 * The single semantic action behind the handle, Ctrl+M and the toolbar icon.
 * Already open: focus it, keep the session. Otherwise: a fresh session on
 * Correction with the verified selection (or an empty text).
 */
export function openModal(
  doc: Document,
  options: ModalOptions,
  send: Send = (message) => chrome.runtime.sendMessage(message),
): CorrectlyModal {
  const current = pageUi.correctlyModal;
  if (current?.visible && current.host.isConnected) {
    current.focus();
    return current;
  }
  // Capture first: nothing below may move the focus or the selection. V5.12:
  // plain page text is accepted too, as a copy-only source.
  const captured = capture(doc, {
    readOnlyPage: true,
    max: MAX_SUMMARY_CODE_POINTS,
  });
  const panel = pageUi.correctlyPanel;
  if (panel && !panel.busy) panel.close();
  const modal = new CorrectlyModal(doc, captured, options, send);
  pageUi.correctlyModal = modal;
  pageUi.correctlyHandle?.modalOpen(true);
  modal.focus();
  return modal;
}
