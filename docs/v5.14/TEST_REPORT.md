# Correctly 5.14.0 — Test report

Date: 2026-10-20. Windows 10, Node 22, branch `dev`.

## Summary

| Check                                                      | Result                                                                                                                                                                                                          |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run format:check`                                     | PASS                                                                                                                                                                                                            |
| `npm run lint`                                             | PASS (after fixing the `console` global in `scripts/i18n-options.mjs`, failing since 5.13)                                                                                                                      |
| `npm test`                                                 | PASS — 41 files, 725 tests (683 before 5.14)                                                                                                                                                                    |
| `npm run build` (typecheck, Vite, audit of `dist/`)        | PASS — 11 files                                                                                                                                                                                                 |
| `npm run package`                                          | PASS — `release/Correctly-V5.14-Extension.zip`, 142,484 bytes, SHA-256 `86f3a99762b11256dd0e7df8dfba1fcb27cdabd5ecdbe254ebcfd38d13bbce28`; its `manifest.json` says 5.14.0 and carries the key                  |
| `node scripts/verify-browser.mjs` (real Brave, dummy keys) | PASS — every step, including M3 (ID `annnnjfiddfooccihpgebjnipppaejpo`), Y01 (Sync page, off by default, `storage.sync` empty) and M15 (only the two provider APIs contacted). Evidence: `docs/v5.14/evidence/` |
| Website `npm run build` + `npm run verify`                 | PASS — 110 PASS, 0 FAIL                                                                                                                                                                                         |
| Two-computer manual checklist                              | **NOT TESTED** — see [MANUAL_TEST_CHECKLIST.md](MANUAL_TEST_CHECKLIST.md)                                                                                                                                       |
| Sync in Brave (Brave Sync)                                 | **NOT TESTED**                                                                                                                                                                                                  |
| Live key on a second computer after unlocking              | **BLOCKED** (needs the owner's key)                                                                                                                                                                             |

## New automated tests

`frontend/tests/unit/sync.test.ts` (14): chunking round trip with emoji,
Arabic, quotes and 4-byte characters at chunk edges; every item under 8,192
bytes with its key; incomplete batches (missing chunk, other revision, wrong
hash) and newer schema refused; canonical JSON; only the synced settings
fields leave or come in (`smartButton`, `consent`, daily limit stay);
untrusted payloads normalized or refused, orphan keys dropped; prefs/state
defaults; three-way merge (edits and deletions from both sides, conflict
winner/loser, same trigger added twice); encryption round trip, wrong
passphrase, wrong salt, fresh IV, no key in clear, ≥ 600,000 iterations;
exact message shapes.

`frontend/tests/integration/sync-engine.test.ts` (17), two simulated
computers with Chrome's quotas, browser sync played as a change log
delivered in order, in part or not at all:

- sync off: no `storage.sync` call at all;
- add / edit / delete on A reach B; "expansion on" stays local;
- offline additions on both computers are all kept;
- the same shortcut edited on both: the two converge, the loser has
  **Restore**, which brings its version back everywhere;
- no loop: a settled pair writes nothing more;
- a batch received in part is not applied (status pending), then applied;
- too large: error `tooLarge`, nothing written, local list whole;
- a stopped worker catches up on the next start;
- an unticked domain is neither sent nor received;
- settings: language and right-click menu follow, the handle and consent
  never do; first activation with two versions asks, "Use the synced
  version" applies it and keeps the other (restorable);
- keyboard shortcuts: bindings follow, "on" stays local;
- API keys: passphrase required (weak refused), nothing in clear in
  `storage.sync` (neither key nor profile ID), other computer locked, wrong
  passphrase refused, right one copies keys and routes (route resolves);
  re-encrypting the same content changes nothing;
- newer format refused without writing; write rate limit reported then
  caught up; clear empties only Correctly's sync items; a damaged local
  store is never overwritten.

`frontend/tests/integration/sync-worker.test.ts` (2): the real worker entry
point restricts `storage.sync` to trusted contexts, makes no sync call while
off, ignores sync messages from a content script, answers the settings page.

`frontend/tests/integration/sync-ui.test.ts` (8): page off by default;
choices written to `syncPrefs` only; statuses, errors and usage in English;
"choose" buttons; restore; passphrase typed twice, never stored on the page;
unlock, wrong passphrase, "use a new passphrase" with confirmation; sync now
and clear (sync off first); malformed worker reply shown as a storage error.

Updated: `options-nav.test.ts` (nine pages), `audit-dist.test.ts` (fixed
key required, private key refused).

## Not covered automatically

Real propagation by Chrome Sync (delays, ordering, item-by-item last writer
wins across devices), Brave Sync, and quota behaviour of the real
`storage.sync`. These are the manual checklist.
