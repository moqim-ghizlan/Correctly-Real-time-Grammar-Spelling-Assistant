# Correctly 5.15.0 — Test report

Date: 2026-10-21. Windows 10, Node 22, branch `dev`. Baseline before the
milestone (5.14.1): 41 files, 726 tests passing.

## Summary

| Check                                                            | Result                                                                                                                                         |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run format:check`                                           | PASS                                                                                                                                           |
| `npm run lint`                                                   | PASS                                                                                                                                           |
| `npm test`                                                       | PASS — 42 files, 741 tests                                                                                                                     |
| `npm run build` (typecheck, Vite, audit of `dist/`)              | PASS — 11 files                                                                                                                                |
| `npm run package`                                                | PASS — `release/Correctly-V5.15-Extension.zip`, 153,444 bytes, SHA-256 `ebde5cf6b38ccc2f21526316947eaa534c372f4607a95509e3b4a8747c109830`      |
| `node scripts/verify-browser.mjs` (real Brave, dummy keys)       | PASS — 27 steps, including the new **Y02**; evidence in `docs/v5.15/evidence/` (`selection-brave.png`)                                         |
| Visual check (built-in browser, real `smart.js`, stubbed worker) | PASS — button below the end of the selection; bubble for 3 words (one request); 2-sentence paragraph → `openTranslation` with `generate: true` |
| Owner manual checklist                                           | **NOT TESTED** — [MANUAL_TEST_CHECKLIST.md](MANUAL_TEST_CHECKLIST.md)                                                                          |
| Live key (real translation in the bubble)                        | **BLOCKED** (owner's key)                                                                                                                      |

## New and updated automated tests

`frontend/tests/integration/selection-button.test.ts` (12): word count;
the button appears on a selection and sends nothing (Q1/Q2); none for a
password field or an empty selection (Q4); Escape, outside click and scroll
hide it (Q5); dispose removes it; short selection → exactly one
`translateText` with the default language, result rendered as text only with
`dir="auto"` (Q2/Q6); another language → one more request only after
Translate, not saved (D3); refusals use the shared wording (Q7); "Open in
Correctly" → `openTranslation` with `generate: false` and no new request;
long selection → `openTranslation` with `generate: true` and no
`translateText` (Q3/D5); the window opened that way starts on Translation
with the text and sends exactly one request, or none without `generate`.

`service-worker.test.ts`: `openTranslation` is honoured only from our
content script, only when the setting is on, only with the exact shape, and
reaches `correctlyRun` with the text (Q8). `settings-ui.test.ts`: the
setting is off by default, saved only when site access is granted, and its
removal tells open tabs (D2). `settings.test.ts`: normalized to `false`
unless stored `true`. `sync.test.ts`: never synced (Q9).
`shortcut-expansion.test.ts`: page config carries the new fields.
