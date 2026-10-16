import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CorrectionPanel,
  NOTICES,
  capture,
  runInPage,
  type Snapshot,
} from '../../src/content/correction';
import { REWRITE_TEXT } from '../../src/shared/contracts';
import type { RewriteStyleId } from '../../src/shared/rewrite';

type Send = (text: string, styleIds: RewriteStyleId[]) => Promise<unknown>;
let send: ReturnType<typeof vi.fn<Send>>;
let answer: (reply: unknown) => void;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const $$ = (panel: CorrectionPanel, selector: string) => [
  ...panel.root.querySelectorAll<HTMLElement>(selector),
];
const button = (panel: CorrectionPanel, label: string) =>
  $$(panel, 'button').find(
    (node) => node.textContent === label,
  ) as HTMLButtonElement;
const status = (panel: CorrectionPanel) =>
  panel.root.querySelector('.status')?.textContent;
const styleBox = (panel: CorrectionPanel, id: string) =>
  panel.root.querySelector<HTMLInputElement>(`input[value="${id}"]`)!;
const cards = (panel: CorrectionPanel) => $$(panel, '.card');

function textarea(value: string, start = 0, end = value.length) {
  document.body.innerHTML = '<textarea></textarea>';
  const el = document.querySelector('textarea')!;
  el.value = value;
  el.focus();
  el.setSelectionRange(start, end);
  return el;
}

function open(defaults: RewriteStyleId[] = ['professional']) {
  const snapshot = capture(document) as Snapshot;
  const panel = new CorrectionPanel(document);
  panel.startRewrite(snapshot, defaults, send);
  return panel;
}

const ok = (candidates: object[], missing: string[] = []) => ({
  ok: true,
  candidates: candidates.map((c) => ({ suspicious: false, ...c })),
  missing,
});

beforeEach(() => {
  for (const node of document.querySelectorAll('correctly-panel'))
    node.remove();
  send = vi.fn<Send>(
    () =>
      new Promise((resolve) => {
        answer = resolve;
      }),
  );
});

describe('style picker (no network until Generate)', () => {
  it('opening and changing styles never sends; defaults are pre-checked', () => {
    textarea('Salut, peux-tu m’envoyer le rapport demain ?');
    const panel = open(['professional', 'friendly']);
    expect(panel.root.textContent).toContain('Correctly — Rewrite');
    expect(styleBox(panel, 'professional').checked).toBe(true);
    expect(styleBox(panel, 'friendly').checked).toBe(true);
    expect(styleBox(panel, 'funny').checked).toBe(false);
    styleBox(panel, 'funny').click();
    styleBox(panel, 'professional').click();
    expect(send).not.toHaveBeenCalled();
    expect($$(panel, 'fieldset input[type=checkbox]')).toHaveLength(8);
    // The formality slider shows only while Custom formality is checked.
    const slider = panel.root.querySelector<HTMLElement>('.formality');
    expect(slider?.hidden).toBe(true);
    styleBox(panel, 'custom').click();
    expect(slider?.hidden).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it('no style selected disables Generate', () => {
    textarea('Bonjour');
    const panel = open(['formal']);
    styleBox(panel, 'formal').click();
    expect(button(panel, 'Generate rewrites').disabled).toBe(true);
    button(panel, 'Generate rewrites').click();
    expect(send).not.toHaveBeenCalled();
  });

  it('one Generate = one request with the checked styles in catalog order; double click ignored', async () => {
    textarea("I can't attend the meeting tomorrow.");
    const panel = open(['concise']);
    styleBox(panel, 'formal').click();
    styleBox(panel, 'friendly').click();
    button(panel, 'Generate rewrites').click();
    button(panel, 'Generate rewrites').click();
    await panel.generateRewrites(send);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      "I can't attend the meeting tomorrow.",
      ['formal', 'friendly', 'concise'],
      3,
    );
    expect(styleBox(panel, 'funny').disabled).toBe(true); // locked while running
  });
});

describe('results', () => {
  async function generated(
    value: string,
    reply: unknown,
    defaults: RewriteStyleId[] = ['formal', 'friendly', 'concise'],
  ) {
    const el = textarea(value);
    const panel = open(defaults);
    button(panel, 'Generate rewrites').click();
    answer(reply);
    await flush();
    return { el, panel };
  }

  it('labeled cards in requested order; choosing a card never edits; Apply inserts the chosen one', async () => {
    const { el, panel } = await generated(
      "I can't attend the meeting tomorrow.",
      ok([
        { styleId: 'formal', text: 'I am unable to attend tomorrow.' },
        { styleId: 'friendly', text: "Sorry, I can't make it tomorrow!" },
        { styleId: 'concise', text: "Can't attend tomorrow." },
      ]),
    );
    expect(
      cards(panel).map((card) => card.querySelector('strong')?.textContent),
    ).toEqual(['Formal', 'Friendly', 'Concise']);
    const radios = $$(panel, '.card input') as HTMLInputElement[];
    expect(radios[0]!.checked).toBe(true);
    radios[2]!.click();
    expect(el.value).toBe("I can't attend the meeting tomorrow.");
    button(panel, 'Apply').click();
    expect(el.value).toBe("Can't attend tomorrow.");
    expect(status(panel)).toBe('Rewrite applied.');
    button(panel, 'Undo rewrite').click();
    expect(el.value).toBe("I can't attend the meeting tomorrow.");
  });

  it('M03: editing the source while generating blocks Apply; Copy stays', async () => {
    const el = textarea('Je ne peux pas venir vendredi.');
    const panel = open();
    button(panel, 'Generate rewrites').click();
    el.value = 'Je ne peux pas venir vendredi. Désolé';
    el.dispatchEvent(new Event('input'));
    answer(
      ok([
        { styleId: 'professional', text: 'Je ne pourrai pas venir vendredi.' },
      ]),
    );
    await flush();
    expect(button(panel, 'Apply').disabled).toBe(true);
    expect(panel.root.querySelector('.note')?.textContent).toBe(NOTICES.stale);
    button(panel, 'Apply').click();
    expect(el.value).toBe('Je ne peux pas venir vendredi. Désolé');
    expect(button(panel, 'Copy').hidden).toBe(false);
  });

  it('partial results show a notice; identical rewrites are not selectable', async () => {
    const { panel } = await generated(
      'Bonjour Dr. Martin,',
      ok(
        [
          { styleId: 'formal', text: 'Bonjour Dr. Martin,' },
          { styleId: 'friendly', text: 'Salut Dr. Martin,' },
        ],
        ['concise'],
      ),
    );
    expect(panel.root.textContent).toContain(
      'No meaningful rewrite was generated for this style.',
    );
    expect(panel.root.textContent).toContain(
      'No rewrite was returned for: Concise.',
    );
    const radios = $$(panel, '.card input') as HTMLInputElement[];
    expect(radios[0]!.disabled).toBe(true);
    expect(radios[1]!.checked).toBe(true);
  });

  it('suspicious candidates are copy-only; HTML is shown as text; RTL text gets dir=auto', async () => {
    const { panel } = await generated(
      'ما بقدر اجي بكرا',
      ok([
        {
          styleId: 'formal',
          text: '<img src=x onerror=alert(1)> لا أستطيع المجيء غداً',
          suspicious: true,
        },
      ]),
      ['formal'],
    );
    expect(panel.root.querySelector('img')).toBeNull();
    expect(button(panel, 'Apply').disabled).toBe(true);
    expect(panel.root.querySelector('.card .text')?.getAttribute('dir')).toBe(
      'auto',
    );
  });

  it('errors keep the text, show fixed copy, and offer an explicit Try again', async () => {
    const { el, panel } = await generated('Bonjour', {
      ok: false,
      code: 'RATE_LIMITED',
      message: '<b>raw provider text</b>',
    });
    expect(status(panel)).toContain('The provider is rate-limiting requests');
    expect(panel.root.textContent).not.toContain('<b>');
    expect(el.value).toBe('Bonjour');
    expect(send).toHaveBeenCalledTimes(1);
    const retry = button(panel, 'Try again');
    expect(retry.disabled).toBe(false);
    retry.click();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('a late answer after Cancel changes nothing', async () => {
    const el = textarea('Bonjour');
    const panel = open();
    button(panel, 'Generate rewrites').click();
    button(panel, 'Cancel').click();
    answer(ok([{ styleId: 'professional', text: 'Bonjour à vous' }]));
    await flush();
    expect(el.value).toBe('Bonjour');
    expect(document.querySelector('correctly-panel')).toBeNull();
  });
});

describe('runInPage routing', () => {
  it('rewrite intent opens the picker with given defaults; the request carries REWRITE_TEXT', () => {
    const sendMessage = vi.fn(() => new Promise(() => undefined));
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    textarea('Bonjour');
    runInPage(document, 'rewrite', ['casual', 'evil']);
    const panel = (globalThis as { correctlyPanel?: CorrectionPanel })
      .correctlyPanel!;
    expect(styleBox(panel, 'casual').checked).toBe(true);
    expect(sendMessage).not.toHaveBeenCalled();
    button(panel, 'Generate rewrites').click();
    expect(sendMessage).toHaveBeenCalledWith({
      type: REWRITE_TEXT,
      text: 'Bonjour',
      styleIds: ['casual'],
    });
    panel.close();
    runInPage(document, 'rewriteOff');
    expect(
      (globalThis as { correctlyPanel?: CorrectionPanel }).correctlyPanel!.root
        .textContent,
    ).toContain('Rewrite is turned off');
    vi.unstubAllGlobals();
  });

  it('sensitive fields are refused before any picker or request', () => {
    const sendMessage = vi.fn();
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    document.body.innerHTML = '<input type="password" value="secret">';
    document.querySelector('input')!.focus();
    runInPage(document, 'rewrite', ['formal']);
    const panel = (globalThis as { correctlyPanel?: CorrectionPanel })
      .correctlyPanel!;
    expect(panel.root.querySelector('fieldset input')).toBeNull();
    expect(panel.root.textContent).toContain(NOTICES.sensitive);
    expect(sendMessage).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
