import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CorrectionPanel,
  capture,
  runInPage,
  type Snapshot,
  type TranslationChoice,
} from '../../src/content/correction';
import { TRANSLATE_TEXT } from '../../src/shared/contracts';
import type { RewriteStyleId } from '../../src/shared/rewrite';
import {
  DEFAULT_TRANSLATION,
  type TranslationPreferences,
} from '../../src/shared/translate';

type Send = (choice: TranslationChoice) => Promise<unknown>;
let send: ReturnType<typeof vi.fn<Send>>;
let answer: (reply: unknown) => void;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const q = <T extends Element = HTMLElement>(
  panel: CorrectionPanel,
  selector: string,
) => panel.root.querySelector<T>(selector)!;
const button = (panel: CorrectionPanel, label: string) =>
  [...panel.root.querySelectorAll('button')].find(
    (node) => node.textContent === label,
  ) as HTMLButtonElement;
const selects = (panel: CorrectionPanel) => [
  ...panel.root.querySelectorAll('select'),
];
const status = (panel: CorrectionPanel) => q(panel, '.status').textContent;
const change = (node: HTMLSelectElement | HTMLInputElement, value?: string) => {
  if (value !== undefined) node.value = value;
  node.dispatchEvent(new Event('change'));
};

function textarea(value: string) {
  document.body.innerHTML = '<textarea></textarea>';
  const el = document.querySelector('textarea')!;
  el.value = value;
  el.focus();
  el.select();
  return el;
}

function open(
  prefs: TranslationPreferences = {
    ...DEFAULT_TRANSLATION,
    target: 'ar',
    arabicVariant: 'syrian',
  },
  withStyles = false,
  styles: RewriteStyleId[] = ['friendly'],
) {
  const panel = new CorrectionPanel(document);
  panel.startTranslate(
    capture(document) as Snapshot,
    prefs,
    styles,
    withStyles,
    send,
  );
  return panel;
}

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

describe('translation picker (no network until Translate)', () => {
  it('C01/C02/F08: opening and changing languages, variant or styles never sends', () => {
    textarea('Salut, tu peux me dire quand tu seras libre demain ?');
    const panel = open();
    const [from, to, variant] = selects(panel);
    expect(from!.value).toBe('auto');
    expect(to!.value).toBe('ar');
    expect(variant!.value).toBe('syrian');
    change(variant!, 'msa');
    change(to!, 'tr');
    change(from!, 'fr');
    expect(send).not.toHaveBeenCalled();
    expect(panel.root.textContent).toContain(
      'sent to Gemini only when you click Translate',
    );
  });

  it('A03/A08: the Arabic variant shows only for Arabic and keeps its value', () => {
    textarea('Bonjour');
    const panel = open();
    const [, to, variant] = selects(panel);
    const row = variant!.closest('label')!;
    expect(row.hidden).toBe(false);
    change(to!, 'en');
    expect(row.hidden).toBe(true);
    change(to!, 'ar');
    expect(row.hidden).toBe(false);
    expect(variant!.value).toBe('syrian');
  });

  it('2.4: same source and target blocks Translate (no call) and suggests Rewrite', () => {
    textarea('Bonjour');
    const panel = open();
    const [from, to] = selects(panel);
    change(to!, 'fr');
    change(from!, 'fr');
    expect(button(panel, 'Translate').disabled).toBe(true);
    expect(q(panel, '.note').textContent).toContain('use Rewrite instead');
    button(panel, 'Translate').click();
    expect(send).not.toHaveBeenCalled();
  });

  it('F07: styles appear only for Translate & rewrite', () => {
    textarea('Bonjour');
    const neutral = open();
    expect(q(neutral, 'fieldset').hidden).toBe(true);
    neutral.close();
    const styled = open(undefined, true);
    expect(q(styled, 'fieldset').hidden).toBe(false);
    expect(q<HTMLInputElement>(styled, 'input[value="friendly"]').checked).toBe(
      true,
    );
  });
});

describe('generation and results', () => {
  it('C03/C04/D13: one click → one request with the exact choice; neutral has no styles', async () => {
    textarea('Salut, tu peux me dire quand tu seras libre demain ?');
    const panel = open();
    button(panel, 'Translate').click();
    button(panel, 'Translate').click();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({
      source: 'auto',
      target: 'ar',
      variant: 'syrian',
      styleIds: [],
    });
    answer({
      ok: true,
      missing: [],
      candidates: [
        {
          styleId: 'neutral',
          text: 'مرحبا، فيك تقلي إمتى رح تكون فاضي بكرا؟',
          suspicious: false,
        },
      ],
    });
    await flush();
    expect(q(panel, '.card strong').textContent).toBe(
      'Translation → Arabic (Syrian colloquial)',
    );
    expect(q(panel, '.card .text').getAttribute('dir')).toBe('auto');
  });

  it('E01/E10/E15: Apply puts the Arabic text in the exact range; Undo restores', async () => {
    const el = textarea('Salut !');
    const panel = open();
    button(panel, 'Translate').click();
    answer({
      ok: true,
      missing: [],
      candidates: [{ styleId: 'neutral', text: 'مرحبا!', suspicious: false }],
    });
    await flush();
    expect(el.value).toBe('Salut !');
    button(panel, 'Apply').click();
    expect(el.value).toBe('مرحبا!');
    expect(status(panel)).toBe('Translation applied.');
    button(panel, 'Undo translation').click();
    expect(el.value).toBe('Salut !');
  });

  it('translate & rewrite sends the checked styles and labels each card', async () => {
    textarea('Je ne peux pas venir demain.');
    const panel = open({ ...DEFAULT_TRANSLATION, target: 'en' }, true, [
      'formal',
    ]);
    q<HTMLInputElement>(panel, 'input[value="funny"]').click();
    button(panel, 'Translate').click();
    expect(send).toHaveBeenCalledWith({
      source: 'auto',
      target: 'en',
      variant: null,
      styleIds: ['formal', 'funny'],
    });
    answer({
      ok: true,
      missing: ['funny'],
      candidates: [
        {
          styleId: 'formal',
          text: 'I will be unable to come tomorrow.',
          suspicious: false,
        },
      ],
    });
    await flush();
    expect(q(panel, '.card strong').textContent).toBe('Formal → English');
    expect(panel.root.textContent).toContain(
      'No translation was returned for: Funny → English.',
    );
  });

  it('E05/C14: editing during the request blocks Apply; same_language shows a message', async () => {
    const el = textarea('Hello there');
    let panel = open({ ...DEFAULT_TRANSLATION, target: 'fr' });
    button(panel, 'Translate').click();
    el.value = 'Hello there!';
    el.dispatchEvent(new Event('input'));
    answer({
      ok: true,
      missing: [],
      candidates: [{ styleId: 'neutral', text: 'Bonjour', suspicious: false }],
    });
    await flush();
    expect(button(panel, 'Apply').disabled).toBe(true);
    panel.close();

    textarea('Hello there');
    panel = open({ ...DEFAULT_TRANSLATION, target: 'en' });
    button(panel, 'Translate').click();
    answer({ ok: true, candidates: [], missing: [], sameLanguage: true });
    await flush();
    expect(status(panel)).toContain('already seems to be in English');
    expect(button(panel, 'Apply').hidden).toBe(true);
  });

  it('C10/C11: errors keep the text and offer an explicit Try again', async () => {
    const el = textarea('Bonjour');
    const panel = open();
    button(panel, 'Translate').click();
    answer({ ok: false, code: 'NETWORK_ERROR', message: 'raw' });
    await flush();
    expect(status(panel)).toContain('Your text was not changed.');
    expect(el.value).toBe('Bonjour');
    button(panel, 'Try again').click();
    expect(send).toHaveBeenCalledTimes(2);
  });
});

describe('runInPage routing', () => {
  it('translate intents open the picker from the worker prefs and send TRANSLATE_TEXT', () => {
    const sendMessage = vi.fn(() => new Promise(() => undefined));
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    textarea('Merhaba');
    runInPage(document, 'translateRewrite', ['polite'], {
      source: 'tr',
      target: 'fr',
      arabicVariant: 'msa',
    });
    const panel = (globalThis as { correctlyPanel?: CorrectionPanel })
      .correctlyPanel!;
    expect(panel.root.textContent).toContain('Correctly — Translate & rewrite');
    expect(sendMessage).not.toHaveBeenCalled();
    button(panel, 'Translate').click();
    expect(sendMessage).toHaveBeenCalledWith({
      type: TRANSLATE_TEXT,
      text: 'Merhaba',
      source: 'tr',
      target: 'fr',
      variant: null,
      styleIds: ['polite'],
    });
    vi.unstubAllGlobals();
  });
});
