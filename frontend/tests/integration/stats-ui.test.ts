import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StatsSection } from '../../src/options/stats-ui';
import {
  QuotaStore,
  legacySeed,
  type OperationDraft,
} from '../../src/shared/quota-store';
import {
  FakeStorage,
  GEMINI_ID,
  OPENAI_ID,
  profile,
  seedProviders,
} from '../helpers/fake-storage';

// V5.9 "Statistics" section on a real (fake) IndexedDB shared with the
// usage-limit store the worker uses.

const html = readFileSync(
  join(import.meta.dirname, '../../src/options/options.html'),
  'utf8',
);
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));
const NOW = Date.parse('2026-10-15T10:00:00Z');

let area: FakeStorage;
let confirm: ReturnType<typeof vi.fn<(question: string) => boolean>>;
let download: ReturnType<
  typeof vi.fn<(name: string, text: string, type: string) => void>
>;
const fetchSpy = vi.fn();
let n = 0;

const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const text = (id: string) => $(id).textContent?.trim() ?? '';
const store = () => new QuotaStore(globalThis.indexedDB);

async function openPage(quota: QuotaStore = store()) {
  document.body.innerHTML = body;
  const section = new StatsSection(document, {
    area,
    quota,
    confirm,
    download,
    now: () => NOW + 60_000,
    newId: () => `price-${++n}-0000`,
  });
  await section.init();
  return section;
}

/** One request as the worker records it (admit → sent → settled). */
async function request(
  over: Partial<OperationDraft> = {},
  outcome: {
    state: 'completed' | 'failed-after-send' | 'unknown';
    inputTokens?: number;
    outputTokens?: number;
  } = { state: 'completed', inputTokens: 1000, outputTokens: 200 },
) {
  const quota = store();
  await quota.ensureReady(() => legacySeed(area), NOW - 3_600_000);
  const draft: OperationDraft = {
    id: `operation-${++n}`,
    bootId: 'boot-1',
    task: 'correction',
    provider: 'gemini',
    credentialId: GEMINI_ID,
    revision: 1,
    modelId: 'gemini-3.1-flash-lite',
    originTabId: 7,
    originFrameId: 0,
    ...over,
  };
  await quota.admit(draft, NOW);
  await quota.dispatch(draft.id, NOW);
  await quota.settle(draft.id, outcome, NOW);
  return draft;
}

beforeEach(() => {
  area = new FakeStorage();
  confirm = vi.fn(() => true);
  download = vi.fn();
  fetchSpy.mockClear();
  vi.stubGlobal('fetch', fetchSpy);
  seedProviders(
    area,
    [
      { ...profile(GEMINI_ID, 'gemini'), label: 'Gemini personal' },
      profile(OPENAI_ID, 'openai'),
    ],
    {},
  );
});

describe('first open (Scenario A)', () => {
  it('a healthy empty history is a true zero, with $0.00 and an honest start date', async () => {
    await openPage();
    expect(text('stats-state')).toBe('Aucune requête');
    expect(text('stats-requests-value')).toBe('0');
    expect(text('stats-cost-value')).toBe('$0.00');
    expect(text('stats-cost-detail')).toBe(
      'Aucune requête envoyée sur cette période.',
    );
    expect(text('stats-range')).toMatch(/^2026-10-15 → 2026-10-15 \(.+\)\./);
    expect($('stats-coverage').hidden).toBe(false);
    expect(text('stats-coverage')).toMatch(
      /Les statistiques détaillées commencent le/,
    );
    expect(document.querySelectorAll('#stats-days tbody tr')).toHaveLength(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('BRW: storage unavailable → "unavailable", never a fake zero', async () => {
    await openPage(new QuotaStore(undefined));
    expect(text('stats-state')).toBe('Indisponible');
    expect(text('stats-message')).toMatch(
      /Statistiques momentanément indisponibles/,
    );
    expect(text('stats-requests-value')).toBe('—');
    expect($<HTMLButtonElement>('stats-csv').disabled).toBe(true);
  });
});

describe('with activity (Scenarios B–H)', () => {
  it('cards separate requests, results, applied edits, tokens and a partial estimate', async () => {
    const first = await request();
    await request(
      { task: 'rewrite' },
      { state: 'completed', inputTokens: 500, outputTokens: 100 },
    );
    await request({ task: 'translation' }, { state: 'unknown' });
    await store().recordEdit(
      { operationId: first.id, action: 'applied', tabId: 7, frameId: 0 },
      NOW + 1000,
    );
    await openPage();
    expect(text('stats-state')).toBe('À jour');
    expect(text('stats-requests-value')).toBe('3');
    expect(text('stats-success-value')).toBe('2');
    expect(text('stats-success-detail')).toMatch(
      /correction 1, reformulation 1.*réponses perdues : 1/,
    );
    expect(text('stats-applied-value')).toBe('1');
    expect(text('stats-tokens-value')).toBe('1\u202f500 entrée / 300 sortie');
    expect(text('stats-tokens-detail')).toMatch(
      /2 requête\(s\) sur 3 .*Partiel/,
    );
    // (1,500 × 0.25 + 300 × 1.50) per million = $0.000825
    expect(text('stats-cost-value')).toBe('$0.00082 (partiel)');
    expect(text('stats-cost-detail')).toMatch(
      /Estimation partielle pour 2 requête\(s\) sur 3.*1 sans nombre de tokens.*pas une facture/,
    );
    const rows = [...document.querySelectorAll('#stats-by-task tbody tr')].map(
      (row) => row.textContent,
    );
    expect(rows).toHaveLength(3);
    expect($('stats-chart').getAttribute('aria-label')).toMatch(/3 au total/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('GRP: filters by provider and key; deleted keys keep their history', async () => {
    await request();
    await request({
      provider: 'openai',
      credentialId: OPENAI_ID,
      modelId: 'gpt-5-nano',
    });
    await request({ credentialId: 'deleted-profile-9999' });
    const section = await openPage();
    const provider = $<HTMLSelectElement>('stats-provider');
    provider.value = 'openai';
    provider.dispatchEvent(new Event('change'));
    expect(text('stats-requests-value')).toBe('1');
    provider.value = 'all';
    provider.dispatchEvent(new Event('change'));
    const keys = [...$<HTMLSelectElement>('stats-key').options].map(
      (o) => o.text,
    );
    expect(keys).toEqual(
      expect.arrayContaining([
        'Toutes les clés API',
        'Gemini personal',
        'Clé supprimée (…9999)',
      ]),
    );
    void section;
  });

  it('CAL: presets and custom ranges; invalid dates are refused without reading', async () => {
    await request();
    await openPage();
    document
      .querySelector<HTMLButtonElement>('[data-stats-preset="week"]')!
      .click();
    await vi.waitFor(() =>
      expect(text('stats-range')).toMatch(/^2026-10-12 → 2026-10-18/),
    );
    expect(document.querySelectorAll('#stats-days tbody tr')).toHaveLength(7);
    document
      .querySelector<HTMLButtonElement>('[data-stats-preset="custom"]')!
      .click();
    expect($('stats-custom').hidden).toBe(false);
    $<HTMLInputElement>('stats-from').value = '2026-10-16';
    $<HTMLInputElement>('stats-to').value = '2026-10-15';
    $('stats-custom').dispatchEvent(new Event('submit'));
    await vi.waitFor(() =>
      expect(text('stats-message')).toBe(
        'La date de fin est avant la date de début.',
      ),
    );
    $<HTMLInputElement>('stats-from').value = '2026-10-15';
    $('stats-custom').dispatchEvent(new Event('submit'));
    await vi.waitFor(() => expect(text('stats-requests-value')).toBe('1'));
  });
});

describe('export, prices, deletion (CSV, USD, INV-15)', () => {
  it('exports CSV and JSON with no key or text; formula labels are neutralized', async () => {
    seedProviders(
      area,
      [
        {
          ...profile(GEMINI_ID, 'gemini'),
          label: '=HYPERLINK("http://x","y")',
        },
      ],
      {},
    );
    await request();
    await openPage();
    $('stats-csv').click();
    $('stats-json').click();
    const [csvName, csv] = download.mock.calls[0]!;
    const [jsonName, json] = download.mock.calls[1]!;
    expect(csvName).toBe('correctly-statistics-2026-10-15-to-2026-10-15.csv');
    expect(jsonName).toMatch(/\.json$/);
    expect(csv).toContain(`"'=HYPERLINK`);
    expect(JSON.parse(json)).toMatchObject({
      costKind: 'estimated-not-invoice',
      totals: { requests: 1 },
    });
    for (const file of [csv, json])
      expect(file).not.toMatch(/SENTINEL|Bearer|correctedText/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('a price reference is validated and added as a new version', async () => {
    const section = await openPage();
    $<HTMLInputElement>('price-model').value = 'gemini-3.1-flash-lite';
    $<HTMLInputElement>('price-input').value = '-1';
    $<HTMLInputElement>('price-output').value = 'abc';
    await section.addPrice();
    expect(text('price-message')).toMatch(
      /Prix d’entrée.*Prix de sortie.*Choisissez la date/,
    );
    $<HTMLInputElement>('price-input').value = '0.30';
    $<HTMLInputElement>('price-output').value = '2';
    $<HTMLInputElement>('price-from').value = '2026-10-01';
    $<HTMLInputElement>('price-label').value = '<b>contract</b>';
    await section.addPrice();
    expect(confirm.mock.calls.at(-1)![0]).toMatch(
      /requêtes envoyées depuis le 2026-10-01/,
    );
    expect(text('price-message')).toMatch(/Prix de référence ajouté/);
    const rows = [...document.querySelectorAll('#price-table tbody tr')].map(
      (row) => row.textContent ?? '',
    );
    expect(
      rows.some((row) => row.includes('Votre saisie : <b>contract</b>')),
    ).toBe(true);
    expect(document.querySelector('#price-table b')).toBeNull();
  });

  it('INV-15/T08: deleting statistics never frees a request under the limit', async () => {
    const quota = store();
    await request();
    const { policy } = await quota.snapshot(NOW, []);
    await quota.savePolicy(
      {
        ...policy!,
        global: { ...policy!.global, daily: { enabled: true, max: 1 } },
      },
      policy!.revision,
      NOW,
    );
    const section = await openPage();
    $<HTMLInputElement>('stats-delete-before').value = '2026-10-16';
    confirm.mockReturnValueOnce(false);
    await section.deleteHistory();
    expect(text('stats-requests-value')).toBe('1');
    await section.deleteHistory();
    expect(confirm.mock.calls.at(-1)![0]).toMatch(
      /ne supprime PAS vos clés API, vos limites d’usage/,
    );
    expect(text('stats-delete-message')).toMatch(
      /1 enregistrement\(s\) de requête supprimé\(s\)\. Les limites d’usage sont inchangées\./,
    );
    expect(text('stats-requests-value')).toBe('0');
    expect(text('stats-coverage')).toMatch(
      /supprimées à votre demande\. Les limites d’usage comptent toujours/,
    );
    const blocked = await quota.admit(
      {
        id: 'operation-after-delete',
        bootId: 'boot-1',
        task: 'correction',
        provider: 'gemini',
        credentialId: GEMINI_ID,
        revision: 1,
        modelId: 'gemini-3.1-flash-lite',
      },
      NOW + 120_000,
    );
    expect(blocked).toMatchObject({ allowed: false, reason: 'cap-exhausted' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
