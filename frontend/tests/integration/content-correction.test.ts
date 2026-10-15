import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NOTICES,
  startCorrection,
  type CorrectionPanel,
} from '../../src/content/correction';

type Send = ReturnType<typeof vi.fn<(text: string) => Promise<unknown>>>;
let send: Send;
let answer: (reply: unknown) => void;

const suggestion = (correctedText: string, suspicious = false) => ({
  ok: true,
  hasErrors: true,
  correctedText,
  suspicious,
});
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const button = (panel: CorrectionPanel, label: string) =>
  [...panel.root.querySelectorAll('button')].find(
    (node) => node.textContent === label,
  )!;
const status = (panel: CorrectionPanel) =>
  panel.root.querySelector('.status')?.textContent;
const note = (panel: CorrectionPanel) =>
  panel.root.querySelector('.note')?.textContent;

function field<T extends HTMLInputElement | HTMLTextAreaElement>(
  html: string,
  value: string,
  start: number,
  end: number,
): T {
  document.body.innerHTML = html;
  const el = document.body.firstElementChild as T;
  el.value = value;
  el.focus();
  el.setSelectionRange(start, end);
  return el;
}

/** Selects `part` (the n-th occurrence) in a textarea and runs a correction. */
async function correctIn(
  value: string,
  part: string,
  corrected: string,
  nth = 0,
) {
  let start = -1;
  for (let i = 0; i <= nth; i++) start = value.indexOf(part, start + 1);
  const el = field<HTMLTextAreaElement>(
    '<textarea></textarea>',
    value,
    start,
    start + part.length,
  );
  const panel = startCorrection(document, send);
  answer(suggestion(corrected));
  await flush();
  return { el, panel, start };
}

beforeEach(() => {
  document.body.innerHTML = '';
  for (const node of document.querySelectorAll('correctly-panel'))
    node.remove();
  send = vi.fn(
    () =>
      new Promise<unknown>((resolve) => {
        answer = resolve;
      }),
  );
});

describe('selection and eligibility', () => {
  it('E15: no selection → notice and no request', () => {
    field('<textarea></textarea>', 'Bonjour', 3, 3);
    const panel = startCorrection(document, send);
    expect(status(panel)).toBe(NOTICES.select);
    expect(send).not.toHaveBeenCalled();
  });

  it('E13/E14: password, email and similar fields are never read', () => {
    for (const html of [
      '<input type="password">',
      '<input type="email">',
      '<input type="url">',
      '<input type="search">',
      '<input type="tel">',
      '<input type="number">',
      '<input type="text" autocomplete="cc-number">',
      '<input type="text" autocomplete="one-time-code">',
    ]) {
      document.body.innerHTML = html;
      const input = document.querySelector('input')!;
      input.focus();
      const panel = startCorrection(document, send);
      expect(status(panel)).toBe(NOTICES.sensitive);
      panel.close();
    }
    expect(send).not.toHaveBeenCalled();
  });

  it('E16: an oversized selection is refused, never truncated', () => {
    field('<textarea></textarea>', 'é'.repeat(2001), 0, 2001);
    expect(status(startCorrection(document, send))).toBe(NOTICES.tooLong);
    expect(send).not.toHaveBeenCalled();
  });

  it('sends exactly the selected substring', () => {
    field('<input type="text">', 'Elle a oublier le document.', 5, 14);
    startCorrection(document, send);
    expect(send).toHaveBeenCalledWith('a oublier');
  });

  it('E12: contenteditable selections are copy-only', async () => {
    document.body.innerHTML =
      '<div contenteditable="true"><b>Il a</b> oublier son dossier.</div>';
    const div = document.querySelector('div')!;
    div.focus();
    const range = document.createRange();
    range.selectNodeContents(div);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    const panel = startCorrection(document, send);
    expect(send).toHaveBeenCalledWith('Il a oublier son dossier.');
    answer(suggestion('Il a oublié son dossier.'));
    await flush();
    expect(button(panel, 'Apply').disabled).toBe(true);
    expect(note(panel)).toBe(NOTICES.copyOnly);
    button(panel, 'Apply').click();
    expect(div.innerHTML).toBe('<b>Il a</b> oublier son dossier.');
  });

  it('V5.10 INV-13: a secret-labelled contenteditable is never read', () => {
    for (const attributes of [
      'aria-label="Card number"',
      'id="security-code"',
      'name="otp"',
    ]) {
      document.body.innerHTML = `<div contenteditable="true" ${attributes}><span>4111 1111</span></div>`;
      const span = document.querySelector('span')!;
      const range = document.createRange();
      range.selectNodeContents(span);
      document.getSelection()!.removeAllRanges();
      document.getSelection()!.addRange(range);
      const panel = startCorrection(document, send);
      expect(status(panel)).toBe(NOTICES.sensitive);
      panel.close();
    }
    expect(send).not.toHaveBeenCalled();
  });
});

describe('preview and Apply', () => {
  it('1.1: no errors → message, no Apply, nothing changed', async () => {
    const el = field<HTMLTextAreaElement>(
      '<textarea></textarea>',
      'Hello, how are you?',
      0,
      19,
    );
    const panel = startCorrection(document, send);
    expect(status(panel)).toContain('Checking');
    answer({ ok: true, hasErrors: false });
    await flush();
    expect(status(panel)).toBe('No corrections needed.');
    expect(button(panel, 'Apply').hidden).toBe(true);
    expect(el.value).toBe('Hello, how are you?');
  });

  it('1.2/E01: nothing changes before Apply; Apply replaces only the selection', async () => {
    const value = 'Bonjour.\nJe suis aller a Lyon hier.\nMerci.';
    const { el, panel } = await correctIn(
      value,
      'Je suis aller a Lyon hier.',
      'Je suis allé à Lyon hier.',
    );
    expect(el.value).toBe(value);
    expect(panel.root.querySelector('.texts')?.textContent).toContain(
      'Je suis allé à Lyon hier.',
    );
    const inputs = vi.fn();
    el.addEventListener('input', inputs);
    button(panel, 'Apply').click();
    expect(el.value).toBe('Bonjour.\nJe suis allé à Lyon hier.\nMerci.');
    expect(inputs).toHaveBeenCalledTimes(1);
    expect(status(panel)).toBe('Correction applied.');
  });

  it('E05: the second occurrence is replaced, not the first', async () => {
    const { el, panel } = await correctIn(
      'il a oublier. il a oublier.',
      'il a oublier.',
      'il a oublié.',
      1,
    );
    button(panel, 'Apply').click();
    expect(el.value).toBe('il a oublier. il a oublié.');
  });

  it('V5.10 EDT-010/011/023: combining accents and Arabic keep exact bounds; a double Apply writes once', async () => {
    const value = 'Café « مرحبا، كيفك؟ » café';
    const { el, panel } = await correctIn(
      value,
      'مرحبا، كيفك؟',
      'مرحباً، كيفك؟',
    );
    const inputs = vi.fn();
    el.addEventListener('input', inputs);
    const apply = button(panel, 'Apply');
    apply.click();
    apply.click();
    panel.apply();
    expect(el.value).toBe('Café « مرحباً، كيفك؟ » café');
    expect(inputs).toHaveBeenCalledTimes(1);
  });

  it('E17/E18: emoji and newlines around the range are preserved', async () => {
    const { el, panel } = await correctIn(
      '😀 Je suis aller\n👍 fin',
      'Je suis aller',
      'Je suis allé',
    );
    button(panel, 'Apply').click();
    expect(el.value).toBe('😀 Je suis allé\n👍 fin');
  });

  it('E03: typing during the request disables Apply', async () => {
    const el = field<HTMLTextAreaElement>(
      '<textarea></textarea>',
      'Il a oublier.',
      0,
      13,
    );
    const panel = startCorrection(document, send);
    el.value = 'Il a oublier. Et';
    el.dispatchEvent(new Event('input'));
    answer(suggestion('Il a oublié.'));
    await flush();
    expect(button(panel, 'Apply').disabled).toBe(true);
    expect(note(panel)).toBe(NOTICES.stale);
    button(panel, 'Apply').click();
    expect(el.value).toBe('Il a oublier. Et');
    expect(button(panel, 'Copy').hidden).toBe(false);
  });

  it('E04/E06/E07/E08: changed selection, read-only, removed or composing blocks Apply', async () => {
    const scenarios: ((el: HTMLTextAreaElement) => void)[] = [
      (el) => el.setSelectionRange(0, 2),
      (el) => (el.readOnly = true),
      (el) => (el.disabled = true),
      (el) => el.remove(),
      (el) => el.dispatchEvent(new CompositionEvent('compositionstart')),
    ];
    for (const change of scenarios) {
      const { el, panel } = await correctIn(
        'Il a oublier.',
        'Il a oublier.',
        'Il a oublié.',
      );
      change(el);
      button(panel, 'Apply').click();
      expect(el.value).toBe('Il a oublier.');
      expect(button(panel, 'Apply').disabled).toBe(true);
      panel.close();
    }
  });

  it('suspicious suggestions (changed numbers/links) are copy-only', async () => {
    const el = field<HTMLTextAreaElement>(
      '<textarea></textarea>',
      'Prix 39,99 €',
      0,
      12,
    );
    const panel = startCorrection(document, send);
    answer(suggestion('Prix 38,99 €', true));
    await flush();
    expect(button(panel, 'Apply').disabled).toBe(true);
    expect(note(panel)).toBe(NOTICES.suspicious);
    button(panel, 'Apply').click();
    expect(el.value).toBe('Prix 39,99 €');
  });

  it('P15: markup in a suggestion is shown as text', async () => {
    const { panel } = await correctIn(
      'texte',
      'texte',
      '<img src=x onerror=alert(1)>',
    );
    expect(panel.root.querySelector('img')).toBeNull();
    expect(panel.root.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('Cancel and Escape close without any change', async () => {
    let { el, panel } = await correctIn(
      'Il a oublier.',
      'Il a oublier.',
      'Il a oublié.',
    );
    button(panel, 'Cancel').click();
    expect(panel.host.isConnected).toBe(false);
    expect(el.value).toBe('Il a oublier.');
    ({ el, panel } = await correctIn(
      'Il a oublier.',
      'Il a oublier.',
      'Il a oublié.',
    ));
    button(panel, 'Apply').dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        composed: true,
      }),
    );
    expect(panel.host.isConnected).toBe(false);
    expect(el.value).toBe('Il a oublier.');
  });

  it('Copy writes the suggestion to the clipboard', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const { panel } = await correctIn(
      'Il a oublier.',
      'Il a oublier.',
      'Il a oublié.',
    );
    await panel.copy();
    expect(writeText).toHaveBeenCalledWith('Il a oublié.');
    expect(note(panel)).toBe('Copied.');
    vi.unstubAllGlobals();
  });
});

describe('undo', () => {
  it('E10: undo restores the original when nothing changed since Apply', async () => {
    const { el, panel } = await correctIn(
      'A: Il a oublier. B',
      'Il a oublier.',
      'Il a oublié.',
    );
    button(panel, 'Apply').click();
    button(panel, 'Undo correction').click();
    expect(el.value).toBe('A: Il a oublier. B');
    expect(status(panel)).toBe('Correction undone.');
  });

  it('E11: undo is refused after the user typed', async () => {
    const { el, panel } = await correctIn(
      'Il a oublier.',
      'Il a oublier.',
      'Il a oublié.',
    );
    button(panel, 'Apply').click();
    el.value += ' Merci';
    el.dispatchEvent(new Event('input'));
    expect(button(panel, 'Undo correction').disabled).toBe(true);
    panel.undo();
    expect(el.value).toBe('Il a oublié. Merci');
  });
});

describe('V5.9 edit events (AP)', () => {
  const ID = 'operation-abcdef12';
  async function preview(value = 'A: Il a oublier. B') {
    const start = value.indexOf('Il a oublier.');
    const el = field<HTMLTextAreaElement>(
      '<textarea></textarea>',
      value,
      start,
      start + 'Il a oublier.'.length,
    );
    const panel = startCorrection(document, send);
    const report = vi.fn();
    panel.reportEdit = report;
    answer({ ...suggestion('Il a oublié.'), operationId: ID });
    await flush();
    return { el, panel, report };
  }

  it('INV-07: Apply reports once, after the text really changed; Undo reports once', async () => {
    const { el, panel, report } = await preview();
    expect(report).not.toHaveBeenCalled();
    button(panel, 'Apply').click();
    expect(el.value).toBe('A: Il a oublié. B');
    expect(report.mock.calls).toEqual([[ID, 'applied']]);
    panel.apply(); // Apply is hidden now: nothing more
    button(panel, 'Undo correction').click();
    expect(report.mock.calls).toEqual([
      [ID, 'applied'],
      [ID, 'undone'],
    ]);
  });

  it('INV-08/T06/T07: a stale Apply, Copy or Cancel reports nothing', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn(() => Promise.resolve()) },
    });
    const { el, panel, report } = await preview();
    await panel.copy();
    el.value += ' Merci';
    el.dispatchEvent(new Event('input'));
    button(panel, 'Apply').click();
    panel.apply();
    button(panel, 'Cancel').click();
    expect(report).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('a reply without a valid request ID reports nothing', async () => {
    const el = field<HTMLTextAreaElement>(
      '<textarea></textarea>',
      'Il a oublier.',
      0,
      13,
    );
    void el;
    const panel = startCorrection(document, send);
    const report = vi.fn();
    panel.reportEdit = report;
    answer({ ...suggestion('Il a oublié.'), operationId: '<script>' });
    await flush();
    button(panel, 'Apply').click();
    expect(report).not.toHaveBeenCalled();
  });
});

describe('request lifecycle', () => {
  it('A08: a second click while waiting sends nothing more', () => {
    field('<textarea></textarea>', 'Il a oublier.', 0, 13);
    const first = startCorrection(document, send);
    const second = startCorrection(document, send, first);
    expect(second).toBe(first);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('A09: a late answer for a closed or replaced panel changes nothing', async () => {
    const el = field<HTMLTextAreaElement>(
      '<textarea></textarea>',
      'Il a oublier.',
      0,
      13,
    );
    const panel = startCorrection(document, send);
    panel.close();
    answer(suggestion('Il a oublié.'));
    await flush();
    expect(el.value).toBe('Il a oublier.');
    expect(document.querySelector('correctly-panel')).toBeNull();
  });

  it('A14: a lost worker reply is an error, never an edit', async () => {
    const el = field<HTMLTextAreaElement>(
      '<textarea></textarea>',
      'Il a oublier.',
      0,
      13,
    );
    send.mockRejectedValueOnce(new Error('message port closed'));
    const panel = startCorrection(document, send);
    await flush();
    expect(status(panel)).toContain('Your text was not changed.');
    expect(panel.root.querySelector('.status')?.getAttribute('data-tone')).toBe(
      'error',
    );
    expect(el.value).toBe('Il a oublier.');
  });

  it('errors from the worker are shown with fixed copy', async () => {
    field('<textarea></textarea>', 'Il a oublier.', 0, 13);
    const panel = startCorrection(document, send);
    answer({ ok: false, code: 'PROVIDER_ERROR', message: '<b>raw</b>' });
    await flush();
    expect(status(panel)).toContain('The provider returned an error');
    expect(panel.root.textContent).not.toContain('<b>');
    expect(button(panel, 'Manage limits').hidden).toBe(true);
  });

  it('NOTE-004/UX-014: a local limit refusal names the limit and offers Manage limits', async () => {
    const el = field('<textarea></textarea>', 'Il a oublier.', 0, 13);
    const panel = startCorrection(document, send);
    const open = vi.fn();
    panel.openLimits = open;
    answer({
      ok: false,
      code: 'QUOTA_EXCEEDED',
      message: '<b>raw</b>',
      quota: {
        level: 100,
        blocked: true,
        scope: 'task',
        task: 'correction',
        provider: null,
        period: 'daily',
        used: 5000,
        max: 5000,
        resetAt: Date.parse('2026-10-15T22:00:00Z'),
        timezone: 'Europe/Paris',
        label: '<img src=x onerror=alert(1)>',
      },
    });
    await flush();
    expect(status(panel)).toContain('A Correctly usage limit is reached');
    const quota = panel.root.querySelector('.quota')!;
    expect(quota.textContent).toBe(
      'Daily correction request limit reached (5,000 / 5,000). No request was sent. Resets Fri 16 Oct, 00:00 (Europe/Paris).',
    );
    expect(quota.getAttribute('aria-live')).toBe('assertive');
    expect(panel.root.querySelector('img')).toBeNull();
    const manage = button(panel, 'Manage limits');
    expect(manage.hidden).toBe(false);
    manage.click();
    expect(open).toHaveBeenCalledTimes(1);
    expect(el.value).toBe('Il a oublier.');
    expect(document.activeElement).not.toBe(manage);
  });

  it('a failed but sent request still shows the warning it crossed', async () => {
    field('<textarea></textarea>', 'Il a oublier.', 0, 13);
    const panel = startCorrection(document, send);
    answer({
      ok: false,
      code: 'RATE_LIMITED',
      notice: {
        level: 80,
        blocked: false,
        scope: 'global',
        task: null,
        provider: null,
        period: 'daily',
        used: 4,
        max: 5,
        resetAt: Date.parse('2026-10-15T22:00:00Z'),
        timezone: 'Europe/Paris',
      },
    });
    await flush();
    expect(status(panel)).toContain('rate-limiting');
    expect(panel.root.querySelector('.quota')!.textContent).toMatch(
      /^Correctly: 80% of your daily total AI request limit used \(4 \/ 5\)\./,
    );
    expect(button(panel, 'Manage limits').hidden).toBe(false);
  });

  it('NOTE-002: a 95% warning is shown with the preview, without stealing focus', async () => {
    field('<textarea></textarea>', 'Il a oublier.', 0, 13);
    const panel = startCorrection(document, send);
    answer({
      ok: true,
      hasErrors: true,
      correctedText: 'Il a oublié.',
      suspicious: false,
      notice: {
        level: 95,
        blocked: false,
        scope: 'global',
        task: null,
        provider: null,
        period: 'daily',
        used: 4750,
        max: 5000,
        resetAt: Date.parse('2026-10-15T22:00:00Z'),
        timezone: 'Europe/Paris',
      },
    });
    await flush();
    expect(panel.root.querySelector('.quota')!.textContent).toBe(
      'Correctly: 95% of your daily total AI request limit used (4,750 / 5,000). Only 250 remain. Resets Fri 16 Oct, 00:00 (Europe/Paris).',
    );
    expect(button(panel, 'Apply').hidden).toBe(false);
    expect(button(panel, 'Manage limits').hidden).toBe(false);
  });
});

describe('V5.3 selection policy', () => {
  it('M02: a selection in plain page text is never sent', () => {
    document.body.innerHTML = '<p>Je suis aller a Lyon hier.</p>';
    const range = document.createRange();
    range.selectNodeContents(document.querySelector('p')!);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    const panel = startCorrection(document, send);
    expect(status(panel)).toBe(NOTICES.notEditable);
    expect(send).not.toHaveBeenCalled();
  });
});
