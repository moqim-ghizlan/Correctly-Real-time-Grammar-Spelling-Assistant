import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NOTICES, capture, runInPage } from '../../src/content/correction';
import {
  CorrectlyModal,
  openModal,
  type ModalOptions,
  type ModalTab,
} from '../../src/content/modal';
import {
  AI_EDIT,
  CORRECT_TEXT,
  MAX_CORRECTION_CODE_POINTS,
  MAX_SUMMARY_CODE_POINTS,
  REWRITE_TEXT,
  SUMMARIZE_TEXT,
  TRANSLATE_TEXT,
} from '../../src/shared/contracts';
import { isSummarizeTextRequest } from '../../src/shared/summary';

// V5.12: Summary tab and read-only page selections. Catalog IDs (SUM, SEL,
// UX, REG) refer to v5/v5.12.md §13.

const AI = [CORRECT_TEXT, REWRITE_TEXT, TRANSLATE_TEXT, SUMMARIZE_TEXT];
type Reply = (value: unknown) => void;
let send: ReturnType<typeof vi.fn<(message: unknown) => Promise<unknown>>>;
let replies: Reply[];
const writeText = vi.fn((text: string) => Promise.resolve(void text));
const OPTIONS: ModalOptions = {
  styles: ['formal'],
  translation: { source: 'auto', target: 'ar', arabicVariant: 'syrian' },
  rewriteEnabled: true,
};
const ARTICLE =
  'Le conseil municipal a voté un budget de 12 millions pour trois écoles.';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const ai = () =>
  send.mock.calls
    .map(([message]) => message as { type: string })
    .filter((message) => AI.includes(message.type));
const ui = (modal: CorrectlyModal) => {
  const q = <T extends Element>(selector: string) =>
    modal.root.querySelector<T>(selector)!;
  const button = (label: string) =>
    [...modal.root.querySelectorAll('button')].find(
      (node) =>
        node.textContent === label || node.getAttribute('aria-label') === label,
    )!;
  const select = (label: string, tab: ModalTab = 'summary') =>
    [
      ...modal.root.querySelectorAll<HTMLLabelElement>(
        `#correctly-panel-${tab} label.field`,
      ),
    ]
      .find((node) => node.querySelector('span')?.textContent === label)!
      .querySelector('select')!;
  return {
    q,
    button,
    select,
    textarea: q<HTMLTextAreaElement>('textarea'),
    tab: (id: ModalTab) => q<HTMLButtonElement>(`#correctly-tab-${id}`),
    status: (id: ModalTab) =>
      q<HTMLElement>(`#correctly-panel-${id} .status`).textContent,
    results: (id: ModalTab) =>
      q<HTMLElement>(`#correctly-panel-${id} .results`),
    hint: () => q<HTMLElement>('.body > .hint').textContent,
    note: () => q<HTMLElement>('.note').textContent,
  };
};
const type = (modal: CorrectlyModal, value: string) => {
  const area = ui(modal).textarea;
  area.value = value;
  area.dispatchEvent(new Event('input', { bubbles: true }));
};
const change = (node: HTMLSelectElement, value: string) => {
  node.value = value;
  node.dispatchEvent(new Event('change'));
};
const summary = (text: string, operationId = 'op-summary-1') => ({
  ok: true,
  unsummarizable: false,
  text,
  suspicious: false,
  operationId,
});

/** Plain article text selected by the user (not an editor). */
function selectArticle(html = `<article><p>${ARTICLE}</p></article>`) {
  document.body.innerHTML = html;
  (document.activeElement as HTMLElement | null)?.blur();
  const range = document.createRange();
  range.selectNodeContents(document.querySelector('p')!);
  const selection = document.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  return document.querySelector('article')!;
}

function field(value: string, start: number, end: number) {
  document.body.innerHTML = '<textarea id="f"></textarea>';
  const el = document.getElementById('f') as HTMLTextAreaElement;
  el.value = value;
  el.focus();
  el.setSelectionRange(start, end);
  return el;
}

beforeEach(() => {
  document.body.innerHTML = '';
  document.getSelection()?.removeAllRanges();
  for (const node of document.querySelectorAll(
    'correctly-modal, correctly-undo, correctly-panel',
  ))
    node.remove();
  const state = globalThis as {
    correctlyModal?: CorrectlyModal;
    correctlyUndo?: { dismiss(): void };
    correctlyPanel?: unknown;
  };
  state.correctlyModal?.close();
  state.correctlyUndo?.dismiss();
  delete state.correctlyModal;
  delete state.correctlyUndo;
  delete state.correctlyPanel;
  replies = [];
  send = vi.fn(
    (message: unknown) =>
      new Promise<unknown>((resolve) => {
        if (AI.includes((message as { type: string }).type))
          replies.push(resolve);
        else resolve(undefined);
      }),
  );
  writeText.mockClear();
  vi.stubGlobal('navigator', { clipboard: { writeText } });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('read-anywhere selection', () => {
  it('SEL-001: selected article text prefills the shared input; nothing is sent', () => {
    selectArticle();
    const modal = openModal(document, OPTIONS, send);
    expect(ui(modal).textarea.value).toBe(ARTICLE);
    expect(modal.target?.source).toBe('read_only_page');
    expect(modal.activeTab).toBe('correction');
    expect(ui(modal).hint()).toBe(NOTICES.pageText);
    expect(send).not.toHaveBeenCalled();
  });

  it('SEL-009: no selection opens an empty manual input; no AI', () => {
    document.body.innerHTML = '<p>Nothing selected</p>';
    const modal = openModal(document, OPTIONS, send);
    expect(ui(modal).textarea.value).toBe('');
    expect(modal.target).toBeNull();
    modal.selectTab('summary');
    expect(ui(modal).button('Generate summary').disabled).toBe(true);
    void modal.generate('summary');
    expect(ai()).toHaveLength(0);
  });

  it('only the selection is read, never the rest of the page', () => {
    document.body.innerHTML =
      '<p id="a">Hidden secret sibling.</p><p id="b">Only this.</p><div hidden>Hidden node</div>';
    const range = document.createRange();
    range.selectNodeContents(document.getElementById('b')!);
    document.getSelection()!.addRange(range);
    const modal = openModal(document, OPTIONS, send);
    expect(ui(modal).textarea.value).toBe('Only this.');
  });

  it('the V5.2 panel keeps refusing page text for correction, but translation reads it (copy only)', () => {
    selectArticle();
    expect(capture(document)).toBe(NOTICES.notEditable);
    const snapshot = capture(document, { readOnlyPage: true });
    expect(snapshot).toMatchObject({
      text: ARTICLE,
      source: 'read_only_page',
      field: null,
      copyOnlyReason: NOTICES.readOnlyPage,
    });
  });

  it('a page selection over the summary limit opens empty with a notice', () => {
    document.body.innerHTML = `<p>${'a'.repeat(MAX_SUMMARY_CODE_POINTS + 1)}</p>`;
    const range = document.createRange();
    range.selectNodeContents(document.querySelector('p')!);
    document.getSelection()!.addRange(range);
    const modal = openModal(document, OPTIONS, send);
    expect(ui(modal).textarea.value).toBe('');
    expect(ui(modal).hint()).toMatch(/at most 12,000 characters/);
  });

  it('SEL-008: a secret-labelled editor is never read', () => {
    document.body.innerHTML =
      '<div contenteditable="true" aria-label="One-time code"><p>123456</p></div>';
    const range = document.createRange();
    range.selectNodeContents(document.querySelector('p')!);
    document.getSelection()!.addRange(range);
    const modal = openModal(document, OPTIONS, send);
    expect(ui(modal).textarea.value).toBe('');
    expect(ui(modal).hint()).toBe(NOTICES.sensitive);
  });
});

describe('Summary tab', () => {
  it('UX-001/UX-003: four tabs in the same fixed modal; header unchanged', () => {
    field('x', 0, 1);
    const modal = openModal(document, OPTIONS, send);
    expect(
      [...modal.root.querySelectorAll('[role="tab"]')].map(
        (node) => node.textContent,
      ),
    ).toEqual(['Correction', 'Reformulation', 'Translation', 'Summary']);
    const css = modal.root.querySelector('style')!.textContent;
    expect(css).toContain('width: min(640px, calc(100vw - 24px))');
    expect(css).toContain('height: min(520px, calc(100dvh - 24px))');
    expect(
      [...modal.root.querySelectorAll('header button')].map((node) =>
        node.getAttribute('aria-label'),
      ),
    ).toEqual([
      'Open Correctly settings',
      'Minimize Correctly (keeps your text and results)',
      'Close Correctly',
    ]);
  });

  it('defaults: saved target language and variant, Medium, Paragraph; options never send', () => {
    selectArticle();
    const modal = openModal(document, OPTIONS, send);
    modal.selectTab('summary');
    const view = ui(modal);
    expect(view.select('Summary language').value).toBe('ar');
    expect(view.select('Arabic variant').value).toBe('syrian');
    expect(view.select('Length').value).toBe('medium');
    expect(view.select('Format').value).toBe('paragraph');
    change(view.select('Summary language'), 'fr');
    expect(view.select('Arabic variant').closest('label')!.hidden).toBe(true);
    change(view.select('Length'), 'detailed');
    expect(ai()).toHaveLength(0);
  });

  it('SUM-001/SEL-002/UX-006/UX-007: one request; Arabic result; Copy only on page text', async () => {
    const article = selectArticle();
    const before = article.innerHTML;
    const modal = openModal(document, OPTIONS, send);
    modal.selectTab('summary');
    const view = ui(modal);
    change(view.select('Length'), 'short');
    change(view.select('Format'), 'key_points');
    view.button('Generate summary').click();
    expect(ai()).toEqual([
      {
        type: SUMMARIZE_TEXT,
        text: ARTICLE,
        target: 'ar',
        variant: 'syrian',
        length: 'short',
        format: 'key_points',
      },
    ]);
    expect(isSummarizeTextRequest(ai()[0])).toBe(true);
    expect(view.status('summary')).toBe('Summarizing…');
    expect(view.select('Summary language').disabled).toBe(true);
    replies[0]!(summary('• ميزانية 12 مليون لتلات مدارس'));
    await flush();
    const result = view.results('summary');
    expect(result.querySelector('h2')!.textContent).toBe(
      'Summary → Arabic (Syrian colloquial)',
    );
    const output = result.querySelector('p')!;
    expect(output.textContent).toBe('• ميزانية 12 مليون لتلات مدارس');
    expect(output.dir).toBe('auto');
    expect(output.lang).toBe('ar');
    expect(view.button('Apply').disabled).toBe(true);
    expect(view.note()).toBe(NOTICES.readOnlyPage);
    expect(view.button('Copy').disabled).toBe(false);
    await modal.copy();
    expect(writeText).toHaveBeenCalledWith('• ميزانية 12 مليون لتلات مدارس');
    expect(modal.visible).toBe(true);
    expect(modal.apply()).toBe(false);
    expect(article.innerHTML).toBe(before);
    expect(ai()).toHaveLength(1);
  });

  it('SEL-003: read-only translation is Copy only too', async () => {
    selectArticle();
    const modal = openModal(document, OPTIONS, send);
    modal.selectTab('translation');
    ui(modal).button('Generate translation').click();
    replies[0]!({
      ok: true,
      candidates: [{ styleId: 'neutral', text: 'ترجمة', suspicious: false }],
      missing: [],
    });
    await flush();
    expect(ui(modal).button('Apply').disabled).toBe(true);
    expect(ui(modal).button('Copy').disabled).toBe(false);
    expect(document.querySelector('p')!.textContent).toBe(ARTICLE);
  });

  it('SEL-004/UX-005: a textarea selection can be replaced by its summary, then undone', async () => {
    const el = field(`Intro. ${ARTICLE} End.`, 7, 7 + ARTICLE.length);
    const modal = openModal(document, OPTIONS, send);
    expect(modal.target?.source).toBe('editable');
    modal.selectTab('summary');
    ui(modal).button('Generate summary').click();
    replies[0]!(summary('Trois écoles rénovées.'));
    await flush();
    expect(ui(modal).button('Apply').disabled).toBe(false);
    ui(modal).button('Apply').click();
    expect(el.value).toBe('Intro. Trois écoles rénovées. End.');
    expect(modal.visible).toBe(false);
    expect(document.querySelectorAll('correctly-undo')).toHaveLength(1);
    expect(send).toHaveBeenCalledWith({
      type: AI_EDIT,
      operationId: 'op-summary-1',
      action: 'applied',
    });
  });

  it('SEL-005: Apply is refused when the editor changed', async () => {
    const el = field(ARTICLE, 0, ARTICLE.length);
    const modal = openModal(document, OPTIONS, send);
    modal.selectTab('summary');
    ui(modal).button('Generate summary').click();
    replies[0]!(summary('Trois écoles.'));
    await flush();
    el.value = `${ARTICLE}!`;
    el.dispatchEvent(new Event('input'));
    expect(ui(modal).button('Apply').disabled).toBe(true);
    expect(modal.apply()).toBe(false);
    expect(el.value).toBe(`${ARTICLE}!`);
  });

  it('a summary with an invented number is never applied', async () => {
    field(ARTICLE, 0, ARTICLE.length);
    const modal = openModal(document, OPTIONS, send);
    modal.selectTab('summary');
    ui(modal).button('Generate summary').click();
    replies[0]!({ ...summary('15 millions.'), suspicious: true });
    await flush();
    expect(ui(modal).button('Apply').disabled).toBe(true);
    expect(ui(modal).note()).toBe(NOTICES.suspicious);
  });

  it('SUM-007/008: empty or over-limit text cannot be sent; longer text fits Summary only', () => {
    field('x', 0, 0);
    const modal = openModal(document, OPTIONS, send);
    modal.selectTab('summary');
    expect(ui(modal).button('Generate summary').disabled).toBe(true);
    type(modal, 'a'.repeat(MAX_CORRECTION_CODE_POINTS + 1));
    expect(ui(modal).button('Generate summary').disabled).toBe(false);
    expect(ui(modal).button('Generate correction').disabled).toBe(true);
    type(modal, 'a'.repeat(MAX_SUMMARY_CODE_POINTS + 1));
    expect(ui(modal).button('Generate summary').disabled).toBe(true);
    expect(ui(modal).hint()).toMatch(/nothing is cut automatically/);
    void modal.generate('summary');
    expect(ai()).toHaveLength(0);
  });

  it('SUM-010: a double click sends one request', () => {
    selectArticle();
    const modal = openModal(document, OPTIONS, send);
    modal.selectTab('summary');
    void modal.generate('summary');
    void modal.generate('summary');
    ui(modal).button('Generate summary').click();
    expect(ai()).toHaveLength(1);
  });

  it('SUM-011: editing the text during a request discards its late result', async () => {
    selectArticle();
    const modal = openModal(document, OPTIONS, send);
    modal.selectTab('summary');
    void modal.generate('summary');
    type(modal, 'Another text entirely.');
    replies[0]!(summary('Old summary.'));
    await flush();
    expect(ui(modal).results('summary').textContent).toBe('');
    expect(modal.apply()).toBe(false);
  });

  it('SUM-012: options are locked in flight; a later change drops only the Summary result', async () => {
    selectArticle();
    const modal = openModal(document, OPTIONS, send);
    const view = ui(modal);
    modal.selectTab('translation');
    view.button('Generate translation').click();
    replies[0]!({
      ok: true,
      candidates: [{ styleId: 'neutral', text: 'ترجمة', suspicious: false }],
      missing: [],
    });
    modal.selectTab('summary');
    view.button('Generate summary').click();
    expect(view.select('Summary language').disabled).toBe(true);
    replies[1]!(summary('ملخص'));
    await flush();
    expect(view.results('summary').textContent).toContain('ملخص');
    change(view.select('Summary language'), 'en');
    expect(view.results('summary').textContent).toBe('');
    expect(view.results('translation').textContent).toContain('ترجمة');
    expect(ai()).toHaveLength(2);
  });

  it('SUM-013: switching tabs keeps the summary and sends nothing', async () => {
    selectArticle();
    const modal = openModal(document, OPTIONS, send);
    modal.selectTab('summary');
    void modal.generate('summary');
    replies[0]!(summary('Résumé.'));
    await flush();
    for (const tab of ['correction', 'translation', 'summary'] as const)
      modal.selectTab(tab);
    expect(ui(modal).results('summary').textContent).toContain('Résumé.');
    expect(ai()).toHaveLength(1);
  });

  it('SUM-014: Hide then reopen starts fresh on Correction', async () => {
    selectArticle();
    const first = openModal(document, OPTIONS, send);
    first.selectTab('summary');
    void first.generate('summary');
    first.close();
    replies[0]!(summary('Late.'));
    await flush();
    const second = openModal(document, OPTIONS, send);
    expect(second).not.toBe(first);
    expect(second.activeTab).toBe('correction');
    expect(ui(second).results('summary').textContent).toBe('');
  });

  it('an unsummarizable answer and errors keep the text and invent nothing', async () => {
    selectArticle();
    const modal = openModal(document, OPTIONS, send);
    modal.selectTab('summary');
    void modal.generate('summary');
    replies[0]!({ ok: true, unsummarizable: true });
    await flush();
    expect(ui(modal).status('summary')).toMatch(/cannot be summarized/);
    expect(ui(modal).button('Copy').disabled).toBe(true);
    void modal.generate('summary');
    replies[1]!({ ok: false, code: 'INVALID_RESPONSE' });
    await flush();
    expect(ui(modal).status('summary')).toMatch(/not usable/);
    expect(ui(modal).textarea.value).toBe(ARTICLE);
    expect(ai()).toHaveLength(2);
  });

  it('hostile HTML in a summary is shown as text only', async () => {
    selectArticle();
    const modal = openModal(document, OPTIONS, send);
    modal.selectTab('summary');
    void modal.generate('summary');
    replies[0]!(summary('<img src=x onerror=alert(1)>'));
    await flush();
    expect(modal.root.querySelector('img')).toBeNull();
    expect(ui(modal).results('summary').textContent).toContain('<img');
  });
});

describe('context-menu / shortcut translation panel (V5.5) on page text', () => {
  it('reads the page selection for translation; Apply stays disabled', async () => {
    selectArticle();
    vi.stubGlobal('chrome', { runtime: { sendMessage: send } });
    runInPage(document, 'translate', [], {
      source: 'auto',
      target: 'en',
      arabicVariant: 'msa',
    });
    const panel = (globalThis as { correctlyPanel?: { root: ShadowRoot } })
      .correctlyPanel!;
    const button = (label: string) =>
      [...panel.root.querySelectorAll('button')].find(
        (node) => node.textContent === label,
      )!;
    button('Translate').click();
    expect(ai()).toEqual([
      expect.objectContaining({ type: TRANSLATE_TEXT, text: ARTICLE }),
    ]);
    replies[0]!({
      ok: true,
      candidates: [
        { styleId: 'neutral', text: 'The council voted.', suspicious: false },
      ],
      missing: [],
    });
    await flush();
    expect(button('Apply').disabled).toBe(true);
    expect(document.querySelector('p')!.textContent).toBe(ARTICLE);
  });

  it('correction from the panel still refuses page text', () => {
    selectArticle();
    vi.stubGlobal('chrome', { runtime: { sendMessage: send } });
    runInPage(document, 'correct');
    expect(ai()).toHaveLength(0);
  });
});
