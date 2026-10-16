import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NOTICES } from '../../src/content/correction';
import {
  CorrectlyModal,
  UNDO_MS,
  openModal,
  type ModalOptions,
  type ModalTab,
} from '../../src/content/modal';
import {
  AI_EDIT,
  CORRECT_TEXT,
  OPEN_LIMITS,
  OPEN_SETTINGS,
  REWRITE_TEXT,
  TRANSLATE_TEXT,
} from '../../src/shared/contracts';

// V5.11 modal: the catalog IDs (S, G, A, M, R) refer to v5/v5.11_done.md §19.

type Reply = (value: unknown) => void;
let send: ReturnType<typeof vi.fn<(message: unknown) => Promise<unknown>>>;
let replies: Reply[];
const writeText = vi.fn((text: string) => Promise.resolve(void text));
const OPTIONS: ModalOptions = {
  styles: ['formal', 'concise'],
  translation: { source: 'auto', target: 'fr', arabicVariant: 'msa' },
  rewriteEnabled: true,
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const ai = () =>
  send.mock.calls
    .map(([message]) => message as { type: string })
    .filter((message) =>
      [CORRECT_TEXT, REWRITE_TEXT, TRANSLATE_TEXT].includes(message.type),
    );
const ui = (modal: CorrectlyModal) => {
  const q = <T extends Element>(selector: string) =>
    modal.root.querySelector<T>(selector)!;
  const button = (label: string) =>
    [...modal.root.querySelectorAll('button')].find(
      (node) =>
        node.textContent === label || node.getAttribute('aria-label') === label,
    )!;
  return {
    q,
    button,
    textarea: q<HTMLTextAreaElement>('textarea'),
    tab: (id: ModalTab) => q<HTMLButtonElement>(`#correctly-tab-${id}`),
    panel: (id: ModalTab) => q<HTMLElement>(`#correctly-panel-${id}`),
    status: (id: ModalTab) =>
      q<HTMLElement>(`#correctly-panel-${id} .status`).textContent,
    results: (id: ModalTab) =>
      q<HTMLElement>(`#correctly-panel-${id} .results`).textContent,
    note: () => q<HTMLElement>('.note').textContent,
  };
};
const type = (modal: CorrectlyModal, value: string) => {
  const area = ui(modal).textarea;
  area.value = value;
  area.dispatchEvent(new Event('input', { bubbles: true }));
};
const corrected = (text: string, operationId = 'op-correct-1') => ({
  ok: true,
  hasErrors: true,
  correctedText: text,
  suspicious: false,
  operationId,
});

function field(value: string, start: number, end: number) {
  document.body.innerHTML =
    '<textarea id="f"></textarea><textarea id="g"></textarea>';
  const el = document.getElementById('f') as HTMLTextAreaElement;
  el.value = value;
  el.focus();
  el.setSelectionRange(start, end);
  return el;
}

beforeEach(() => {
  document.body.innerHTML = '';
  for (const node of document.querySelectorAll(
    'correctly-modal, correctly-undo, correctly-panel',
  ))
    node.remove();
  const state = globalThis as {
    correctlyModal?: CorrectlyModal;
    correctlyUndo?: { dismiss(): void };
    correctlyHandle?: unknown;
  };
  state.correctlyModal?.close();
  state.correctlyUndo?.dismiss();
  delete state.correctlyModal;
  delete state.correctlyUndo;
  delete state.correctlyHandle;
  replies = [];
  send = vi.fn(
    (message: unknown) =>
      new Promise<unknown>((resolve) => {
        const kind = (message as { type: string }).type;
        if ([CORRECT_TEXT, REWRITE_TEXT, TRANSLATE_TEXT].includes(kind))
          replies.push(resolve);
        else resolve(undefined);
      }),
  );
  vi.stubGlobal('navigator', {
    clipboard: { writeText },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('opening and session', () => {
  it('S01/T04/G01: a valid selection is prefilled on Correction; nothing is sent', () => {
    field('Hello I has a cat. Bye', 6, 18);
    const modal = openModal(document, OPTIONS, send);
    const view = ui(modal);
    expect(view.textarea.value).toBe('I has a cat.');
    expect(modal.activeTab).toBe('correction');
    expect(view.tab('correction').getAttribute('aria-selected')).toBe('true');
    expect(view.panel('reformulation').hidden).toBe(true);
    expect(send).not.toHaveBeenCalled();
  });

  it('S02: no selection gives an empty editable input', () => {
    field('Hello', 2, 2);
    const modal = openModal(document, OPTIONS, send);
    expect(ui(modal).textarea.value).toBe('');
    expect(ui(modal).textarea.disabled).toBe(false);
    expect(ui(modal).button('Generate correction').disabled).toBe(true);
  });

  it('sensitive fields are never read: empty input with the V5.2 notice', () => {
    document.body.innerHTML = '<input type="password" value="secret123">';
    const input = document.querySelector('input')!;
    input.focus();
    input.setSelectionRange(0, 9);
    const modal = openModal(document, OPTIONS, send);
    expect(ui(modal).textarea.value).toBe('');
    expect(modal.root.textContent).toContain(NOTICES.sensitive);
    expect(modal.root.textContent).not.toContain('secret123');
  });

  it('T03: an open signal while visible focuses the same modal, no reset, no duplicate', () => {
    field('abc def', 0, 3);
    const first = openModal(document, OPTIONS, send);
    type(first, 'edited');
    first.selectTab('translation');
    const second = openModal(document, OPTIONS, send);
    expect(second).toBe(first);
    expect(second.activeTab).toBe('translation');
    expect(second.sharedText).toBe('edited');
    expect(document.querySelectorAll('correctly-modal')).toHaveLength(1);
  });

  it('S10/S11/M06: Close (X) discards the session; reopening starts fresh on Correction', async () => {
    const el = field('one two', 0, 3);
    const modal = openModal(document, OPTIONS, send);
    modal.selectTab('reformulation');
    void modal.generate('reformulation');
    replies[0]!({
      ok: true,
      candidates: [{ styleId: 'formal', text: 'One.', suspicious: false }],
      missing: [],
    });
    await flush();
    ui(modal).button('Close Correctly').click();
    expect(modal.visible).toBe(false);
    expect(document.querySelector('correctly-modal')).toBeNull();
    expect(el.value).toBe('one two'); // nothing applied
    expect(document.activeElement).toBe(el);
    el.setSelectionRange(4, 7);
    const next = openModal(document, OPTIONS, send);
    expect(next).not.toBe(modal);
    expect(next.activeTab).toBe('correction');
    expect(next.sharedText).toBe('two');
    expect(ui(next).results('reformulation')).toBe('');
    el.setSelectionRange(0, 0);
    next.close();
    expect(openModal(document, OPTIONS, send).sharedText).toBe('');
  });

  it('M04 (owner change): the header has Settings, Minimize and Close (X)', () => {
    field('x', 0, 1);
    const modal = openModal(document, OPTIONS, send);
    const header = [...modal.root.querySelectorAll('header button')];
    expect(header.map((node) => node.getAttribute('aria-label'))).toEqual([
      'Open Correctly settings',
      'Minimize Correctly (keeps your text and results)',
      'Close Correctly',
    ]);
    // Icons only (no text); the X is an SVG, never page-provided HTML.
    expect(header.every((node) => node.querySelector('svg'))).toBe(true);
    const dialog = modal.root.querySelector('[role="dialog"]')!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    // V5.12: Summary is the fourth tab.
    expect(modal.root.querySelectorAll('[role="tab"]')).toHaveLength(4);
  });

  it('M05: the gear asks the worker to open the options page; nothing else', () => {
    field('x', 0, 1);
    const modal = openModal(document, OPTIONS, send);
    ui(modal).button('Open Correctly settings').click();
    expect(send).toHaveBeenCalledWith({ type: OPEN_SETTINGS });
    expect(modal.visible).toBe(true);
    expect(ai()).toHaveLength(0);
  });

  it('Escape minimizes (session kept); the handle is told', () => {
    const handle = { modalOpen: vi.fn() };
    (globalThis as { correctlyHandle?: unknown }).correctlyHandle = handle;
    field('x', 0, 1);
    const modal = openModal(document, OPTIONS, send);
    expect(handle.modalOpen).toHaveBeenLastCalledWith(true);
    ui(modal).textarea.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        composed: true,
      }),
    );
    expect(modal.visible).toBe(true);
    expect(modal.minimized).toBe(true);
    expect(handle.modalOpen).toHaveBeenLastCalledWith(false);
  });

  it('Minimize keeps text, tab and results; any opening shows the same session', async () => {
    const handle = { modalOpen: vi.fn() };
    (globalThis as { correctlyHandle?: unknown }).correctlyHandle = handle;
    const el = field('one two', 0, 3);
    const modal = openModal(document, OPTIONS, send);
    modal.selectTab('reformulation');
    void modal.generate('reformulation');
    ui(modal)
      .button('Minimize Correctly (keeps your text and results)')
      .click();
    expect(modal.minimized).toBe(true);
    expect(modal.host.style.display).toBe('none');
    expect(document.activeElement).toBe(el);
    // A request sent before minimizing still lands in its tab.
    replies[0]!({
      ok: true,
      candidates: [{ styleId: 'formal', text: 'One.', suspicious: false }],
      missing: [],
    });
    await flush();
    el.setSelectionRange(4, 7);
    const again = openModal(document, OPTIONS, send);
    expect(again).toBe(modal);
    expect(again.minimized).toBe(false);
    expect(again.host.style.display).toBe('');
    expect(handle.modalOpen).toHaveBeenLastCalledWith(true);
    expect(again.activeTab).toBe('reformulation');
    expect(again.sharedText).toBe('one');
    expect(ui(again).results('reformulation')).toContain('One.');
    expect(document.querySelectorAll('correctly-modal')).toHaveLength(1);
    expect(ai()).toHaveLength(1);
    // Close still ends it; the next opening is fresh.
    again.close();
    expect(openModal(document, OPTIONS, send)).not.toBe(modal);
  });

  it('typing in the modal does not reach page key handlers', () => {
    field('x', 0, 1);
    const modal = openModal(document, OPTIONS, send);
    const page = vi.fn();
    document.addEventListener('keydown', page);
    ui(modal).textarea.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'c', bubbles: true, composed: true }),
    );
    document.removeEventListener('keydown', page);
    expect(page).not.toHaveBeenCalled();
  });

  it('R07: arrow keys move between tabs', () => {
    field('x', 0, 1);
    const modal = openModal(document, OPTIONS, send);
    const tablist = modal.root.querySelector('[role="tablist"]')!;
    tablist.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    );
    expect(modal.activeTab).toBe('reformulation');
    tablist.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'End', bubbles: true }),
    );
    expect(modal.activeTab).toBe('summary');
    tablist.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    );
    expect(modal.activeTab).toBe('correction');
    expect(ai()).toHaveLength(0);
  });

  it('R03: 100 open/hide cycles leave no duplicated roots', () => {
    const el = field('abc', 0, 3);
    for (let i = 0; i < 100; i++) {
      el.focus();
      openModal(document, OPTIONS, send).close();
    }
    openModal(document, OPTIONS, send);
    expect(document.querySelectorAll('correctly-modal')).toHaveLength(1);
    expect(ai()).toHaveLength(0);
  });
});

describe('shared text and per-tab results', () => {
  it('S03/S04: one shared text across tabs', () => {
    field('abc', 0, 3);
    const modal = openModal(document, OPTIONS, send);
    modal.selectTab('reformulation');
    type(modal, 'Changed here');
    modal.selectTab('translation');
    expect(ui(modal).textarea.value).toBe('Changed here');
    expect(modal.sharedText).toBe('Changed here');
    expect(modal.root.querySelectorAll('textarea')).toHaveLength(1);
  });

  it('S05/S06/G02: results stay per tab while the text is unchanged; no extra calls', async () => {
    field('I has a cat', 0, 11);
    const modal = openModal(document, OPTIONS, send);
    void modal.generate('correction');
    expect(ai()).toEqual([{ type: CORRECT_TEXT, text: 'I has a cat' }]);
    replies[0]!(corrected('I have a cat'));
    await flush();
    expect(ui(modal).results('correction')).toContain('I have a cat');
    modal.selectTab('translation');
    void modal.generate('translation');
    expect(ai()[1]).toEqual({
      type: TRANSLATE_TEXT,
      text: 'I has a cat',
      source: 'auto',
      target: 'fr',
      variant: null,
      styleIds: [],
    });
    replies[1]!({
      ok: true,
      candidates: [
        { styleId: 'neutral', text: "J'ai un chat", suspicious: false },
      ],
      missing: [],
    });
    await flush();
    modal.selectTab('correction');
    expect(ui(modal).results('correction')).toContain('I have a cat');
    modal.selectTab('translation');
    expect(ui(modal).results('translation')).toContain("J'ai un chat");
    expect(ai()).toHaveLength(2);
  });

  it('S07: editing the text clears the results of all three tabs', async () => {
    field('I has a cat', 0, 11);
    const modal = openModal(document, OPTIONS, send);
    void modal.generate('correction');
    replies[0]!(corrected('I have a cat'));
    void modal.generate('reformulation');
    replies[1]!({
      ok: true,
      candidates: [
        { styleId: 'formal', text: 'I own a cat.', suspicious: false },
      ],
      missing: [],
    });
    await flush();
    modal.selectTab('translation');
    type(modal, 'Another text');
    for (const id of ['correction', 'reformulation', 'translation'] as const)
      expect(ui(modal).results(id)).toBe('');
    expect(ui(modal).button('Apply').disabled).toBe(true);
    expect(ui(modal).button('Copy').disabled).toBe(true);
  });

  it('focusing or re-setting the same text is not a change', async () => {
    field('I has a cat', 0, 11);
    const modal = openModal(document, OPTIONS, send);
    void modal.generate('correction');
    replies[0]!(corrected('I have a cat'));
    await flush();
    ui(modal).textarea.focus();
    modal.setText('I has a cat');
    expect(modal.revision).toBe(0);
    expect(ui(modal).results('correction')).toContain('I have a cat');
  });

  it('S08: a reply for an older text never appears', async () => {
    field('I has a cat', 0, 11);
    const modal = openModal(document, OPTIONS, send);
    void modal.generate('correction');
    type(modal, 'New text');
    replies[0]!(corrected('I have a cat'));
    await flush();
    expect(ui(modal).results('correction')).toBe('');
    expect(ui(modal).status('correction')).toBe('');
  });

  it('S09: Hide during a request; the late reply changes nothing and reopens nothing', async () => {
    field('I has a cat', 0, 11);
    const modal = openModal(document, OPTIONS, send);
    void modal.generate('correction');
    modal.close();
    replies[0]!(corrected('I have a cat'));
    await flush();
    expect(document.querySelector('correctly-modal')).toBeNull();
    expect(modal.visible).toBe(false);
  });

  it('G09: a double Generate click sends one request', () => {
    field('I has a cat', 0, 11);
    const modal = openModal(document, OPTIONS, send);
    ui(modal).button('Generate correction').click();
    ui(modal).button('Generate correction').click();
    void modal.generate('correction');
    expect(ai()).toHaveLength(1);
  });

  it('text over the limit is refused locally', () => {
    field('x', 0, 1);
    const modal = openModal(document, OPTIONS, send);
    type(modal, 'a'.repeat(2001));
    expect(modal.ready('correction')).toBe(false);
    expect(modal.root.textContent).toContain(NOTICES.tooLong);
    void modal.generate('correction');
    expect(ai()).toHaveLength(0);
  });
});

describe('reformulation and translation options', () => {
  it('G03/G04: options never send; one request carries all chosen styles', async () => {
    field('Hi there', 0, 8);
    const modal = openModal(document, OPTIONS, send);
    modal.selectTab('reformulation');
    const boxes = [
      ...ui(modal)
        .panel('reformulation')
        .querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    ];
    expect(boxes.filter((box) => box.checked).map((box) => box.value)).toEqual([
      'formal',
      'concise',
    ]);
    const friendly = boxes.find((box) => box.value === 'friendly')!;
    friendly.click();
    expect(ai()).toHaveLength(0);
    ui(modal).button('Generate reformulation').click();
    expect(ai()).toEqual([
      {
        type: REWRITE_TEXT,
        text: 'Hi there',
        styleIds: ['formal', 'friendly', 'concise'],
      },
    ]);
    replies[0]!({
      ok: true,
      candidates: [
        { styleId: 'concise', text: 'Hi.', suspicious: false },
        { styleId: 'formal', text: 'Good day.', suspicious: false },
        { styleId: 'friendly', text: 'Hi there', suspicious: false },
      ],
      missing: [],
    });
    await flush();
    const cards = ui(modal).panel('reformulation').querySelectorAll('.card');
    expect(
      [...cards].map((card) => card.querySelector('strong')!.textContent),
    ).toEqual(['Formal', 'Concise']);
    expect(ui(modal).status('reformulation')).toContain('Friendly');
    // Changing an option afterwards drops that tab's result only.
    friendly.click();
    expect(ui(modal).results('reformulation')).toBe('');
    expect(ai()).toHaveLength(1);
  });

  it('rewrite turned off: the tab explains it and cannot send', () => {
    field('Hi', 0, 2);
    const modal = openModal(
      document,
      { ...OPTIONS, rewriteEnabled: false },
      send,
    );
    modal.selectTab('reformulation');
    expect(ui(modal).panel('reformulation').textContent).toContain(
      NOTICES.rewriteOff,
    );
    expect(ui(modal).button('Generate reformulation').disabled).toBe(true);
    void modal.generate('reformulation');
    expect(ai()).toHaveLength(0);
  });

  it('G05/G06/G07: language choices never send; Syrian Arabic and RTL output', async () => {
    field('Good morning', 0, 12);
    const modal = openModal(document, OPTIONS, send);
    modal.selectTab('translation');
    const view = ui(modal);
    const to = view.panel('translation').querySelectorAll('select')[1]!;
    const variant = view.panel('translation').querySelectorAll('select')[2]!;
    to.value = 'ar';
    to.dispatchEvent(new Event('change'));
    variant.value = 'syrian';
    variant.dispatchEvent(new Event('change'));
    expect(ai()).toHaveLength(0);
    view.button('Generate translation').click();
    expect(ai()[0]).toMatchObject({ target: 'ar', variant: 'syrian' });
    replies[0]!({
      ok: true,
      candidates: [
        { styleId: 'neutral', text: 'صباح الخير', suspicious: false },
      ],
      missing: [],
    });
    await flush();
    const output = view.panel('translation').querySelector('.results .text')!;
    expect(output.textContent).toBe('صباح الخير');
    expect(output.getAttribute('dir')).toBe('auto');
  });

  it('same source and target: Generate stays disabled', () => {
    field('Bonjour', 0, 7);
    const modal = openModal(
      document,
      { ...OPTIONS, translation: { source: 'fr', target: 'fr' } },
      send,
    );
    modal.selectTab('translation');
    expect(ui(modal).button('Generate translation').disabled).toBe(true);
    expect(modal.root.textContent).toContain('Source and target are the same');
  });

  it('G08: a refusal by the usage limits shows the note and Manage limits', async () => {
    field('I has', 0, 5);
    const modal = openModal(document, OPTIONS, send);
    void modal.generate('correction');
    replies[0]!({ ok: false, code: 'QUOTA_EXCEEDED' });
    await flush();
    expect(ui(modal).status('correction')).toMatch(/not changed/);
    const limits = ui(modal).button('Manage limits');
    expect(limits.hidden).toBe(false);
    limits.click();
    expect(send).toHaveBeenCalledWith({ type: OPEN_LIMITS });
  });
});

describe('Apply, Copy, Cancel and Undo', () => {
  async function generated(
    value = 'Hello I has a cat. Bye',
    start = 6,
    end = 18,
  ) {
    const el = field(value, start, end);
    const modal = openModal(document, OPTIONS, send);
    void modal.generate('correction');
    replies[0]!(corrected('I have a cat.'));
    await flush();
    return { el, modal };
  }

  it('A01/A06: Apply replaces the exact selection, hides the modal, offers Undo', async () => {
    const { el, modal } = await generated();
    ui(modal).button('Apply').click();
    expect(el.value).toBe('Hello I have a cat. Bye');
    expect(modal.visible).toBe(false);
    expect(document.querySelector('correctly-modal')).toBeNull();
    expect(document.querySelectorAll('correctly-undo')).toHaveLength(1);
    expect(send).toHaveBeenCalledWith({
      type: AI_EDIT,
      operationId: 'op-correct-1',
      action: 'applied',
    });
  });

  it('A07: Undo within five seconds restores the original exactly', async () => {
    const { el, modal } = await generated();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    modal.apply();
    vi.advanceTimersByTime(UNDO_MS - 100);
    const toast = (globalThis as { correctlyUndo?: { undo(): boolean } })
      .correctlyUndo!;
    expect(toast.undo()).toBe(true);
    expect(el.value).toBe('Hello I has a cat. Bye');
    expect(document.querySelector('correctly-undo')).toBeNull();
    expect(send).toHaveBeenCalledWith({
      type: AI_EDIT,
      operationId: 'op-correct-1',
      action: 'undone',
    });
  });

  it('A08: after five seconds the offer is gone and nothing is undone', async () => {
    const { el, modal } = await generated();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    modal.apply();
    vi.advanceTimersByTime(UNDO_MS);
    expect(document.querySelector('correctly-undo')).toBeNull();
    expect(el.value).toBe('Hello I have a cat. Bye');
  });

  it('A09: Undo is refused after the user typed', async () => {
    const { el, modal } = await generated();
    modal.apply();
    el.value += '!';
    const toast = (globalThis as { correctlyUndo?: { undo(): boolean } })
      .correctlyUndo!;
    expect(toast.undo()).toBe(false);
    expect(el.value).toBe('Hello I have a cat. Bye!');
  });

  it('A02/A10: stale selection or another editor → Apply refused, modal stays, Copy works', async () => {
    const { el, modal } = await generated();
    el.setSelectionRange(0, 5); // selection moved
    const other = document.getElementById('g') as HTMLTextAreaElement;
    other.value = 'other editor';
    other.focus();
    expect(ui(modal).button('Apply').disabled).toBe(false); // refreshed on click
    expect(modal.apply()).toBe(false);
    expect(el.value).toBe('Hello I has a cat. Bye');
    expect(other.value).toBe('other editor');
    expect(modal.visible).toBe(true);
    expect(ui(modal).button('Apply').disabled).toBe(true);
    expect(ui(modal).note()).toBe(NOTICES.stale);
    expect(ui(modal).button('Copy').disabled).toBe(false);
  });

  it('A03/A04: without an editable target Apply is disabled; Copy keeps the modal open', async () => {
    field('', 0, 0);
    const modal = openModal(document, OPTIONS, send);
    type(modal, 'I has');
    void modal.generate('correction');
    replies[0]!(corrected('I have'));
    await flush();
    expect(ui(modal).button('Apply').disabled).toBe(true);
    expect(ui(modal).note()).toBe(NOTICES.noTarget);
    await modal.copy();
    expect(writeText).toHaveBeenCalledWith('I have');
    expect(modal.visible).toBe(true);
    expect(ui(modal).note()).toBe('Copied.');
  });

  it('editing the shared text keeps the verified original target for Apply', async () => {
    const el = field('Hello I has a cat. Bye', 6, 18);
    const modal = openModal(document, OPTIONS, send);
    type(modal, 'I has two cat.');
    void modal.generate('correction');
    replies[0]!(corrected('I have two cats.'));
    await flush();
    expect(modal.apply()).toBe(true);
    expect(el.value).toBe('Hello I have two cats. Bye');
  });

  it('A05: Cancel discards the result without touching the page', async () => {
    const { el, modal } = await generated();
    ui(modal).button('Cancel').click();
    expect(ui(modal).results('correction')).toBe('');
    expect(el.value).toBe('Hello I has a cat. Bye');
    expect(modal.visible).toBe(true);
  });

  it('suspicious results cannot be applied', async () => {
    field('Pay 10 euros', 0, 12);
    const modal = openModal(document, OPTIONS, send);
    void modal.generate('correction');
    replies[0]!({ ...corrected('Pay 100 euros'), suspicious: true });
    await flush();
    expect(ui(modal).button('Apply').disabled).toBe(true);
    expect(ui(modal).note()).toBe(NOTICES.suspicious);
  });

  it('R02: hostile HTML in the input and the result is shown as text only', async () => {
    const hostile = '<img src=x onerror="alert(1)">';
    field(hostile, 0, hostile.length);
    const modal = openModal(document, OPTIONS, send);
    void modal.generate('correction');
    replies[0]!(corrected('<script>alert(2)</script>'));
    await flush();
    expect(modal.root.querySelector('img, script')).toBeNull();
    expect(ui(modal).results('correction')).toContain(
      '<script>alert(2)</script>',
    );
  });

  it('a second Apply never writes twice (modal already hidden)', async () => {
    const { el, modal } = await generated();
    modal.apply();
    expect(modal.apply()).toBe(false);
    expect(el.value).toBe('Hello I have a cat. Bye');
    expect(document.querySelectorAll('correctly-undo')).toHaveLength(1);
  });
});
