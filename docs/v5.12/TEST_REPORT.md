# Correctly V5.12 — Test report

Run on 2026-10-16, Windows 10, Node 24.21.0, branch `dev` (base `939e99b`,
uncommitted working tree). Chrome and Brave installed locally.

Legend: **PASS** run and passed · **FAIL** · **NOT TESTED** not run (manual
step for the owner) · **BLOCKED** needs something unavailable here.

## Commands

| Command                                                      | Result                                                         |
| ------------------------------------------------------------ | -------------------------------------------------------------- |
| `npm test`                                                   | **PASS** — 33 files, 629 tests (baseline 574)                  |
| `npm run lint`                                               | **PASS**                                                       |
| `npm run typecheck`                                          | **PASS** (part of `npm run build`)                             |
| `npm run format:check`                                       | **PASS**                                                       |
| `npm run build` (+ `dist/` audit, 11 files)                  | **PASS**                                                       |
| `node scripts/verify-browser.mjs --browser=brave --offline`  | **PASS** (all steps incl. new `S12`; 3 SKIPPED by `--offline`) |
| `node scripts/verify-browser.mjs --browser=chrome --offline` | **PASS** (all steps incl. new `S12`; 3 SKIPPED by `--offline`) |
| Live provider call with the owner's key                      | **BLOCKED** (needs the owner's key; may be billed)             |

Settings page redesign (French, sidebar): `integration/options-nav.test.ts` (4), limits folding (+1); settings-page tests updated to the French copy. `npm run package`: **PASS**, `release/Correctly-V5.12-Extension.zip`, SHA-256 `c4a061fba72b512884c9e014147dc9ab14628dec3ae66ccc01973688d95c42d0` (recomputed, identical).

New test files: `unit/summary.test.ts` (21), `integration/content-summary.test.ts`
(23). Extended: `service-worker.test.ts` (+3), `limits-ui.test.ts` (+2),
`providers-ui.test.ts` (+1), `content-modal.test.ts` (M04 and R07 updated
from three to four tabs). Browser smoke: `C02` now checks the fixed size on
four tabs; new `S12` (real handle click with a page selection → Summary →
one request → Apply disabled → page unchanged); screenshot
`evidence/summary-{chrome,brave}.png`.

## Catalog (spec §13)

All provider tests use deterministic mocked responses.

| ID      | Result                                                            | Evidence                                                                                             |
| ------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| SUM-001 | PASS                                                              | `summary.test` "French → Arabic in ONE call"; browser S12                                            |
| SUM-002 | PASS                                                              | `summary.test` "SUM-002/004" (English → French, detailed, key points)                                |
| SUM-003 | PASS                                                              | `summary.test` contract + instruction contains MSA                                                   |
| SUM-004 | PASS                                                              | `summary.test`; `service-worker.test` "Syrian Arabic asked directly"                                 |
| SUM-005 | PASS                                                              | `summary.test` "SUM-004/005/006" (length in instruction, output budget)                              |
| SUM-006 | PASS                                                              | same test (schema `summary` vs `points`); modal message carries `format`                             |
| SUM-007 | PASS                                                              | `content-summary` "SUM-007/008", "SEL-009"; worker guard rejects blank text                          |
| SUM-008 | PASS                                                              | `content-summary` "SUM-007/008" + over-limit page selection; `summary.test` guard 12,000/12,001      |
| SUM-009 | PASS                                                              | `summary.test` parser rejections + controller "malformed, 429 … never retried"                       |
| SUM-010 | PASS                                                              | `content-summary` "SUM-010"                                                                          |
| SUM-011 | PASS                                                              | `content-summary` "SUM-011"                                                                          |
| SUM-012 | PASS                                                              | `content-summary` "SUM-012" (controls locked in flight; later change drops only Summary)             |
| SUM-013 | PASS                                                              | `content-summary` "SUM-013"                                                                          |
| SUM-014 | PASS                                                              | `content-summary` "SUM-014"                                                                          |
| SEL-001 | PASS                                                              | `content-summary` "SEL-001"; browser S12 (real selection survives the handle click)                  |
| SEL-002 | PASS                                                              | `content-summary` "SUM-001/SEL-002…"; browser S12                                                    |
| SEL-003 | PASS                                                              | `content-summary` "SEL-003" + V5.5 panel test                                                        |
| SEL-004 | PASS                                                              | `content-summary` "SEL-004/UX-005"                                                                   |
| SEL-005 | PASS                                                              | `content-summary` "SEL-005"                                                                          |
| SEL-006 | PASS (unit) / NOT TESTED (manual)                                 | capture is synchronous at open; empty fallback tested (SEL-009). Real toolbar click: owner checklist |
| SEL-007 | PASS                                                              | existing V5.11 "A02/A10" (other editor/stale) unchanged; page text has no field at all               |
| SEL-008 | PASS                                                              | `content-summary` "SEL-008"; existing sensitive-field tests                                          |
| SEL-009 | PASS                                                              | `content-summary` "SEL-009"                                                                          |
| SEL-010 | PASS                                                              | `summary.test` instruction test (text never in instruction; injection treated as data)               |
| QUO-001 | PASS                                                              | `summary.test` "QUO-001" (zero fetch when blocked)                                                   |
| QUO-002 | PASS                                                              | `summary.test` "QUO-002/QUO-003"; `limits-ui` "V5.12 Summary limits"                                 |
| QUO-003 | PASS                                                              | `summary.test` "QUO-002/QUO-003" (two concurrent, one admitted)                                      |
| QUO-004 | PASS                                                              | no retry path (one `fetch` per error); V5.8 recovery tests unchanged                                 |
| STA-001 | PASS                                                              | `summary.test` "SUM-001/STA-001" (task summary, tokens)                                              |
| STA-002 | PASS                                                              | `summary.test` "STA-002" (`null` tokens, not 0)                                                      |
| STA-003 | PASS                                                              | `summary.test` "STA-003" (no text/summary/key in IndexedDB or storage)                               |
| UX-001  | PASS                                                              | `content-summary` "UX-001/UX-003"; browser C02 (same size on 4 tabs)                                 |
| UX-002  | PASS                                                              | `service-worker` V5.11 entry-point tests + "Summary-only route"; modal opens on Correction           |
| UX-003  | PASS                                                              | `content-summary` "UX-001/UX-003"; `content-modal` M04                                               |
| UX-004  | PASS                                                              | unchanged V5.11 handle tests; browser H05                                                            |
| UX-005  | PASS                                                              | `content-summary` "SEL-004/UX-005"                                                                   |
| UX-006  | PASS                                                              | `content-summary` "SUM-001/SEL-002/UX-006/UX-007"                                                    |
| UX-007  | PASS (dir/lang/keyboard) / NOT TESTED (200 % zoom, screen reader) | tests check `dir="auto"`, `lang="ar"`, tab keys; zoom: owner checklist                               |
| REG-001 | PASS                                                              | existing correction tests unchanged and passing                                                      |
| REG-002 | PASS                                                              | existing rewrite tests                                                                               |
| REG-003 | PASS                                                              | existing translation tests; browser C04                                                              |
| REG-004 | PASS                                                              | existing shortcut tests; browser C05 (offline, nothing sent)                                         |
| REG-005 | PASS                                                              | `summary.test` "REG-005"; fixtures without `summary` route still resolve                             |
| REG-006 | PASS                                                              | `summary.test` "REG-006" (policy migration keeps caps and revision)                                  |

## Not covered here

- Real model quality (Arabic MSA/Syrian wording, faithfulness): needs the
  owner's key — **BLOCKED** / manual.
- Built-in PDF viewer, `chrome://` pages, cross-origin iframes: not promised;
  **NOT TESTED**.
