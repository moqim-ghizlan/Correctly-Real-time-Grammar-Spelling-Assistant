# V5.1 test report

Date: 2026-10-15 · OS: Windows 10 Home 10.0.19045 · Node v24.21.0 / npm
11.19.0 · base commit `4c95233` (branch `feat/v5.1-foundation`) · model
`gemini-3.1-flash-lite`.

**Real external API access:** only with a dummy key (expected and observed:
HTTP 400 `API_KEY_INVALID`). **No real owner key was used** — the live
success test is BLOCKED (owner credential required).

## Commands

| Command                                            | Result                                                               |
| -------------------------------------------------- | -------------------------------------------------------------------- |
| `npm ci`                                           | PASS                                                                 |
| `npm run typecheck` (`tsc --noEmit`)               | PASS, 0 errors                                                       |
| `npm run lint`                                     | PASS, 0 findings                                                     |
| `npm run format:check`                             | PASS                                                                 |
| `npm test`                                         | PASS — 6 files, 70 tests                                             |
| `npm run build` (typecheck + Vite + dist audit)    | PASS — 9 files in `dist/`, audit clean                               |
| `node scripts/package.mjs`                         | PASS — `release/Correctly-V5.1-Extension.zip`, 9 files, 16 251 bytes |
| `node scripts/verify-browser.mjs --browser=brave`  | PASS 11/11 (Brave 1.97.57, Chromium 155.0.8059.80)                   |
| `node scripts/verify-browser.mjs --browser=chrome` | PASS 11/11, 4 consecutive runs (Chrome 155.0.8059.40)                |

Built files: `manifest.json`, `service-worker.js`, `options.js`,
`chunks/storage.js`, `assets/options-*.css`, `src/options/options.html`,
3 icons.

## Plan matrix (§9.2)

| ID         | Result | Evidence                                                                                                              |
| ---------- | ------ | --------------------------------------------------------------------------------------------------------------------- |
| S01        | PASS   | `settings.test.ts` S01; `settings-ui.test.ts` S01; browser M4                                                         |
| S02        | PASS   | `settings-ui.test.ts` S02; browser M5a                                                                                |
| S03        | PASS   | `settings.test.ts` S03; `settings-ui.test.ts` S03                                                                     |
| S04        | PASS   | `settings-ui.test.ts` S04, S04b                                                                                       |
| S05        | PASS   | `settings-ui.test.ts` S05; browser M6b                                                                                |
| S06        | PASS   | `settings.test.ts`, `connection-controller.test.ts`, `settings-ui.test.ts` S06                                        |
| S07        | PASS   | `settings.test.ts` S07/S09                                                                                            |
| S08        | PASS   | `settings.test.ts` S08; `settings-ui.test.ts` S08                                                                     |
| S09        | PASS   | `gemini-client.test.ts` S09; `connection-controller.test.ts` S09                                                      |
| S10        | PASS   | `service-worker.test.ts` S10                                                                                          |
| S11        | PASS   | `service-worker.test.ts` S11                                                                                          |
| N01–N13    | PASS   | `gemini-client.test.ts` N01…N13; UI side in `settings-ui.test.ts`                                                     |
| N05 (real) | PASS   | browser M5b: real Google reply to a dummy key → "Invalid key (HTTP 400)" in Chrome and Brave                          |
| Q01–Q03    | PASS   | `connection-controller.test.ts` Q01–Q03 (21st attempt: zero fetch)                                                    |
| Q04        | PASS   | `connection-controller.test.ts` Q04                                                                                   |
| Q05        | PASS   | unit Q05; `settings-ui.test.ts` Q03/Q05; browser M8 (reload), M9 (worker restart)                                     |
| Q06        | PASS   | unit Q06; browser M6 (zero network)                                                                                   |
| Q07        | PASS   | unit Q07                                                                                                              |
| Q08        | PASS   | unit Q08 (rollover) and local-date tests                                                                              |
| Q09        | PASS   | `settings.test.ts` DST/local-day tests, run in this machine's local timezone; behaviour documented in ARCHITECTURE.md |
| Q10        | PASS   | unit Q10                                                                                                              |
| Q11        | PASS   | unit Q11 (12 concurrent requests, cap 5 → 5 dispatches). Two real tabs racing in a browser were not automated.        |
| B01        | PASS   | `audit-dist.test.ts` + `npm run build` audit                                                                          |
| B02        | PASS   | audit scans for `AIza…`, sentinel, `.env`; evidence JSON checked: no sentinel                                         |
| B03        | PASS   | audit: no localhost/127.0.0.1/8081/LanguageTool/Java/binaries                                                         |
| B04        | PASS   | no `content_scripts` in manifest; browser M11                                                                         |

Integration requirements (§9.3): async storage mock with failures and real
interleaving; `fetch` mock records URL, headers, body, count, timeout; key
present only in the outgoing header (`service-worker.test.ts`); fixed prompt
asserted; no fetch on open/save/remove/model/limit (`settings-ui.test.ts`).

## Real-browser checklist (§9.4), automated by `scripts/verify-browser.mjs`

| Step                       | Chrome               | Brave       | Notes                                                                                                                                       |
| -------------------------- | -------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 clean build              | PASS                 | PASS        | `npm run build` empties `dist/`                                                                                                             |
| 2 load unpacked            | PASS                 | PASS        | Brave via `--load-extension`; Chrome 137+ ignores it, loaded via CDP `Extensions.loadUnpacked` (same effect as **Load unpacked**)           |
| 3 name/version, worker     | PASS                 | PASS        | `Correctly V5.1` / `5.1.0`                                                                                                                  |
| 4 Not configured, cap 20   | PASS                 | PASS        | M4                                                                                                                                          |
| 5 dummy key, reopen, test  | PASS                 | PASS        | M5a/M5b — invalid key, key not in DOM/URL/console                                                                                           |
| 6 remove key, no dispatch  | PASS                 | PASS        | M6, M6b                                                                                                                                     |
| 7 real key, Connected      | **BLOCKED**          | **BLOCKED** | owner credential required                                                                                                                   |
| 8 cap 1                    | PASS                 | PASS        | M8                                                                                                                                          |
| 9 worker kill/restart      | PASS                 | PASS        | M9 (`ServiceWorker.stopAllWorkers`)                                                                                                         |
| 10 browser restart         | PASS (unit) / manual | manual      | storage is `chrome.storage.local`; full browser restart not automated                                                                       |
| 11 regular site untouched  | PASS                 | PASS        | M11                                                                                                                                         |
| 12 offline then recover    | PASS (unit) / manual | manual      | offline guard and `NETWORK_ERROR` unit-tested; real network cut not automated                                                               |
| 13 Brave                   | —                    | PASS        |                                                                                                                                             |
| 14 width/keyboard/password | PASS                 | PASS        | M14: no overflow at 360/900 px; Tab order key → Show → Save → Remove → link → model → Test → limit → Save limit; screenshots in `evidence/` |
| 15 console/network         | PASS                 | PASS        | M15: 0 console messages; only `generativelanguage.googleapis.com` contacted, from the worker                                                |

Evidence: `docs/v5.1/evidence/browser-{chrome,brave}.json` (header names
only, never values) and `options-{browser}-{360,900}.png`.

## Issues found and fixed during verification

- Chrome blocks CDP navigation to `chrome-extension://` pages
  (`ERR_BLOCKED_BY_CLIENT`) and blocks IDs first offered via
  `--load-extension` → test opens the page via `openOptionsPage()` and loads
  Chrome only via CDP.
- Intermittent Chrome harness failure (worker context not ready) → wait for
  the context; 4/4 runs pass afterwards.
- ESLint `no-control-regex` → sample cleaning uses `\p{Cc}`.

## Not verified

- Live success with a real Gemini key (BLOCKED, owner).
- Full browser restart and a physical network cut (manual steps 10, 12).
