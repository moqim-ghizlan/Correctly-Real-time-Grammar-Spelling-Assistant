# Correctly V5.11 — Test report

Run on 2026-10-16, Windows 10, Node 24.21.0, branch `dev` (base `a226310`,
V5.11 tests run on the working tree later committed as tag `v5.11.0`). Chrome 155.0.8059.40, Brave (Chromium 155).

Legend: **PASS** run and passed · **FAIL** · **NOT TESTED** not run (manual
step for the owner) · **BLOCKED** needs something unavailable here.

## Commands

| Command                                                      | Result                                                          |
| ------------------------------------------------------------ | --------------------------------------------------------------- |
| `npm test`                                                   | **PASS** — 30 files, 574 tests (baseline 533)                   |
| `npm run lint`                                               | **PASS**                                                        |
| `npm run typecheck`                                          | **PASS**                                                        |
| `npm run format:check`                                       | **PASS**                                                        |
| `npm run build` (+ `dist/` audit, 11 files)                  | **PASS**                                                        |
| `node scripts/verify-browser.mjs --browser=chrome --offline` | **PASS** (all steps; 3 SKIPPED by `--offline`) — see note       |
| `node scripts/verify-browser.mjs --browser=brave --offline`  | **PASS** (all steps; 3 SKIPPED by `--offline`)                  |
| Online browser run (dummy keys sent to providers)            | **NOT TESTED** (not needed for V5.11; no provider code changed) |

Note: one earlier Chrome run stopped with `Cannot read properties of null
(reading 'textContent')` in a settings-page step **before** the V5.11
steps; the next two Chrome runs passed completely. Not reproduced; recorded
as a flake of the existing settings-page automation.

New and changed test files: `integration/content-modal.test.ts` (35),
`integration/right-edge-handle.test.ts` (12), `service-worker.test.ts`
(+7 V5.11, smart-button cases replaced), `shortcut-expansion.test.ts` (+1),
`settings-ui.test.ts` (Ctrl+M label). Removed: `smart-button.test.ts`
(feature replaced). Browser smoke test: `H05`, `C02` replace the old `C02`.

## Catalog (spec §19)

| ID      | Result                                   | Evidence                                                                                                          |
| ------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| H01     | PASS                                     | handle test "H01/H02"; browser H05 (right edge ±1 px, centred, height > width); `evidence/handle-chrome.png`      |
| H02     | PASS                                     | handle test "H01/H02" (focusing a field moves nothing)                                                            |
| H03     | PASS / visual NOT TESTED                 | zero messages on hover (unit); the 1.08 growth is CSS only — owner to look                                        |
| H04     | PASS                                     | unit "H03/H04" (one open); worker "H04"; browser C02 (real click)                                                 |
| H05     | PASS                                     | unit "H05/H06/H07"; browser H05 (real CDP mouse drag −100 px)                                                     |
| H06     | PASS                                     | unit (clientX ignored); browser H05 (moved 200 px sideways, still on edge)                                        |
| H07     | PASS                                     | unit; browser H05 (no `OPEN_MODAL` after drag)                                                                    |
| H08     | PASS                                     | unit "H08" (clamped to 16 px margins)                                                                             |
| H09     | PASS (unit) / NOT TESTED (real reload)   | worker "H09" stores and returns `handleY`; unit restore from ratio                                                |
| H10     | PASS                                     | unit "H09/H10" resize re-clamp                                                                                    |
| H11     | PASS                                     | unit; browser C02 (`button.hidden` while open)                                                                    |
| H12     | PASS                                     | unit (same Y after); browser C02 (visible after Apply)                                                            |
| T01     | PASS (command) / NOT TESTED (real key)   | worker "T01"; the automated profile assigns no suggested key (K05) — press Ctrl+M manually                        |
| T02     | PASS (handler) / NOT TESTED (real click) | worker "T02"; CDP cannot click the toolbar; no `default_popup` (audit)                                            |
| T03     | PASS                                     | modal "T03" (same instance, no reset, one root)                                                                   |
| T04     | PASS                                     | modal "S01/T04/G01"; worker tests: no fetch on open                                                               |
| T05     | PASS (unit)                              | worker "falls back to the settings on pages that cannot be scripted"                                              |
| T06     | NOT TESTED                               | manual: check `chrome://extensions/shortcuts` in Chrome and Brave                                                 |
| M01     | PASS                                     | browser C02 (centre ±1 px)                                                                                        |
| M02     | PASS                                     | browser C02 (`offsetWidth/Height` identical on the 3 tabs)                                                        |
| M03     | NOT TESTED (visual)                      | structure: only `.body` scrolls; owner to check with a long text                                                  |
| M04     | PASS                                     | modal "M04" (exactly two header buttons, none named close); browser C02                                           |
| M05     | PASS (message) / NOT TESTED (page opens) | modal + worker "M05"                                                                                              |
| M06     | PASS                                     | modal "S10/S11/M06"                                                                                               |
| M07     | NOT TESTED                               | CSS clamp `min(640px, 100vw−24px)`; owner to check at 320 px                                                      |
| M08     | NOT TESTED                               | `prefers-reduced-motion` disables the animations (CSS)                                                            |
| S01–S11 | PASS                                     | modal tests (S01 also browser C02)                                                                                |
| G01–G09 | PASS                                     | modal tests (G08: refusal shown, Manage limits; the no-send rule itself is the V5.8 worker, unchanged and tested) |
| A01–A10 | PASS                                     | modal tests (A01/A07 also browser C02; clipboard mocked in A04)                                                   |
| R01     | PASS                                     | browser M15 (no key in console/DOM); KEY-21 `PAGE_CONFIG` has no key                                              |
| R02     | PASS                                     | modal "R02" (hostile HTML stays text)                                                                             |
| R03     | PASS                                     | modal "R03" (100 cycles, one root)                                                                                |
| R04     | NOT TESTED                               | SPA navigation: manual                                                                                            |
| R05     | PASS (offline)                           | Chrome smoke test                                                                                                 |
| R06     | PASS (offline)                           | Brave smoke test                                                                                                  |
| R07     | PASS (partial)                           | unit: tab arrows, Escape, handle Enter/Space/arrows; full keyboard walkthrough NOT TESTED                         |
| R08     | NOT TESTED                               | 200 % zoom / small viewport: manual                                                                               |
| R09     | PASS                                     | browser C05 (real typing), shortcut tests                                                                         |
| R10     | PASS                                     | quota/stats code unchanged; all V5.8/V5.9 tests pass                                                              |

## Regression (spec §20.1)

All V5.1–V5.10 suites pass unchanged except the expected edits: the
toolbar now opens the modal (was: correct directly), and the smart-button
messages are gone. Context menu, Alt+Shift+C and per-action shortcuts keep
their V5.2–V5.5 behaviour (C01, C03, C04 browser steps PASS).

## Owner walkthrough (spec §20.2)

**NOT TESTED** by the owner yet. Steps 1–5, 8–11 are covered by automation
above except the items marked NOT TESTED; steps 6–7 (real Ctrl+M, real
toolbar click) and 12 need the owner's browser.
